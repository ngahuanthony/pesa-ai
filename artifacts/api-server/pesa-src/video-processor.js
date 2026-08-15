// video-processor.js — ffmpeg frame extraction + Claude vision for inventory scanning
//
// Flow:
//   1. Write video buffer to /tmp
//   2. Run ffmpeg with scene-detection filter → extract only scene-change frames
//   3. Cap at MAX_FRAMES by even sampling
//   4. Send frames as base64 images to Claude vision
//   5. Parse structured product list from Claude response
//   6. Update scan record in DB throughout

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const MAX_FRAMES = 40;   // cap per video to keep Claude costs reasonable
const BATCH_SIZE = 20;   // frames per Claude API call

// ── ffmpeg helpers ──────────────────────────────────────────────────────────

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`));
    });
    proc.on("error", reject);
  });
}

async function extractFrames(videoBuffer, scanId) {
  const tmpDir = path.join(os.tmpdir(), `pesa-scan-${scanId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const videoPath = path.join(tmpDir, "input.mp4");
  const framesDir = path.join(tmpDir, "frames");
  fs.writeFileSync(videoPath, videoBuffer);
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    // Extract scene-change frames: only keep frames where scene changes > 30%.
    // Also scale to 800px wide to keep token usage manageable.
    await runFfmpeg([
      "-i", videoPath,
      "-vf", "select=gt(scene\\,0.3),scale=800:-1",
      "-vsync", "vfr",
      "-q:v", "3",
      path.join(framesDir, "frame_%04d.jpg"),
    ]);
  } catch (err) {
    // If scene detection yields zero frames (very short/static video),
    // fall back to 1 frame per second.
    console.warn("[video-processor] Scene detection failed, falling back to 1fps:", err.message);
    await runFfmpeg([
      "-i", videoPath,
      "-vf", "fps=1,scale=800:-1",
      "-q:v", "3",
      path.join(framesDir, "frame_%04d.jpg"),
    ]);
  }

  let framePaths = fs.readdirSync(framesDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .map((f) => path.join(framesDir, f));

  // Evenly sample down to MAX_FRAMES if needed
  if (framePaths.length > MAX_FRAMES) {
    const step = framePaths.length / MAX_FRAMES;
    framePaths = Array.from({ length: MAX_FRAMES }, (_, i) =>
      framePaths[Math.min(Math.round(i * step), framePaths.length - 1)]
    );
  }

  const base64Frames = framePaths.map((p) => fs.readFileSync(p).toString("base64"));

  // Clean up tmp files
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

  return base64Frames;
}

// ── Claude vision ───────────────────────────────────────────────────────────

const VISION_PROMPT = `These are frames extracted from a Kenyan shop or market video.

Look carefully across ALL frames. For each distinct product you can clearly see, extract:
- name: short product name (e.g. "Sunlight Soap 500g", "Maize Flour 2kg", "Cocacola 500ml")
- price: the price in KES as a whole number if visible on a label or price tag (null if not visible)
- description: one short sentence describing the product

Rules:
- Only list products you can clearly see — ignore blurry or partially visible items
- Do not duplicate products that appear in multiple frames; list each product only once
- If price is not readable, use null
- For product names, be specific: include size/weight if visible (e.g. "500g" not just "soap")
- Return ONLY a valid JSON array — no preamble, no explanation, no markdown fences

Example output:
[
  {"name":"Sunlight Soap 500g","price":45,"description":"Green bar soap for laundry and dishes"},
  {"name":"Brookside Milk 500ml","price":55,"description":"Fresh whole milk in a white carton"},
  {"name":"Maize Flour 2kg","price":175,"description":"Unga wa sembe in a branded blue packet"}
]

If no products are visible return: []`;

async function analyzeFrames(base64Frames) {
  if (!ANTHROPIC_API_KEY) {
    // Return a mock response in dev/test when no key is set
    console.warn("[video-processor] ANTHROPIC_API_KEY not set — returning mock products");
    return [
      { name: "Sample Product A", price: 150, description: "Mock product detected from video" },
      { name: "Sample Product B", price: 380, description: "Mock product detected from video" },
      { name: "Sample Product C", price: 75,  description: "Mock product detected from video" },
    ];
  }

  // Build content: all frame images + text instruction
  const content = [
    ...base64Frames.map((data) => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data },
    })),
    { type: "text", text: VISION_PROMPT },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  const text = (json.content?.[0]?.text || "[]").trim();

  // Parse JSON — try the full response, then extract first JSON array
  try { return JSON.parse(text); } catch { /* fall through */ }
  const match = text.match(/\[[\s\S]*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fall through */ } }
  return [];
}

// ── Main orchestrator ───────────────────────────────────────────────────────

async function processVideoScan(db, scanId, businessId, videoBuffer) {
  try {
    db.updateVideoScan(scanId, { status: "processing" });
    console.log(`[video-processor] Starting scan ${scanId} (${videoBuffer.length} bytes)`);

    // Step 1: Extract frames
    const frames = await extractFrames(videoBuffer, scanId);
    console.log(`[video-processor] Extracted ${frames.length} frames for scan ${scanId}`);
    db.updateVideoScan(scanId, { frames: frames.length });

    if (frames.length === 0) {
      db.updateVideoScan(scanId, { status: "done", productDrafts: [], productCount: 0 });
      return;
    }

    // Step 2: Analyze frames in batches
    let allProducts = [];
    for (let i = 0; i < frames.length; i += BATCH_SIZE) {
      const batch = frames.slice(i, i + BATCH_SIZE);
      const products = await analyzeFrames(batch);
      allProducts.push(...products);
    }

    // Step 3: Deduplicate by normalised name
    const seen = new Set();
    const unique = allProducts.filter((p) => {
      if (!p || !p.name) return false;
      const key = String(p.name).toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Step 4: Build draft records with IDs
    const drafts = unique.map((p, i) => ({
      draftId: `draft-${scanId.slice(0, 6)}-${i}`,
      name: String(p.name || "").trim(),
      price: p.price != null ? Number(p.price) : null,
      description: String(p.description || "").trim(),
      selected: true,
    }));

    db.updateVideoScan(scanId, {
      status: "done",
      productDrafts: drafts,
      productCount: drafts.length,
    });

    console.log(`[video-processor] Scan ${scanId} done — ${drafts.length} products detected`);
  } catch (err) {
    console.error(`[video-processor] Scan ${scanId} failed:`, err);
    db.updateVideoScan(scanId, { status: "error", error: err.message });
  }
}

module.exports = { processVideoScan };
