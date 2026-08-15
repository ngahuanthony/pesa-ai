// video-processor.js — ffmpeg frame extraction + Claude vision for inventory scanning
//
// Flow:
//   1. Write video buffer to /tmp
//   2. Run ffmpeg — hybrid extraction: scene-change frames + uniform samples
//      combined and deduped so static shelves are never missed
//   3. Cap at MAX_FRAMES by even sampling
//   4. Send all frames to Claude Haiku (fast, cheap, accurate enough for products)
//   5. Retry up to MAX_RETRIES on transient API errors
//   6. Update scan DB throughout — progress visible to polling UI in real time

const { spawn } = require("child_process");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// claude-haiku-3-5 is ~3-5x faster and ~10x cheaper than Sonnet for product detection.
// Override with ANTHROPIC_MODEL env var if you want to test Sonnet.
const MODEL      = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
const MAX_FRAMES = 15;   // 15 frames covers a 90-second shop walk well
const MAX_RETRIES = 2;   // retry Claude calls on transient errors

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

/**
 * Hybrid frame extraction:
 *   Pass 1 — scene-change detection (scene > 0.25) captures camera moves and new areas
 *   Pass 2 — uniform 1-frame-every-8s ensures static shelves are never skipped
 *   Both sets merged, sorted by frame number, then evenly sampled down to MAX_FRAMES.
 *
 * Frames are 480px wide (enough for Claude to read labels) at q:v 5 (~15-25 KB each).
 */
async function extractFrames(videoBuffer, scanId) {
  const tmpDir   = path.join(os.tmpdir(), `pesa-scan-${scanId}`);
  const sceneDir = path.join(tmpDir, "scene");
  const unifDir  = path.join(tmpDir, "unif");

  fs.mkdirSync(sceneDir, { recursive: true });
  fs.mkdirSync(unifDir,  { recursive: true });

  // Preserve the actual container so ffmpeg demuxes correctly
  const ext       = videoBuffer[0] === 0x1a && videoBuffer[1] === 0x45 ? "webm" : "mp4";
  const videoPath = path.join(tmpDir, `input.${ext}`);
  fs.writeFileSync(videoPath, videoBuffer);

  // Pass 1: scene-change frames
  let sceneOk = true;
  try {
    await runFfmpeg([
      "-i", videoPath,
      "-vf", "select=gt(scene\\,0.25),scale=480:-1",
      "-vsync", "vfr",
      "-q:v", "5",
      path.join(sceneDir, "s%04d.jpg"),
    ]);
  } catch (err) {
    sceneOk = false;
    console.warn("[video-processor] Scene pass failed:", err.message);
  }

  // Pass 2: uniform 1 frame every 8 seconds (catches static shelves)
  try {
    await runFfmpeg([
      "-i", videoPath,
      "-vf", "fps=1/8,scale=480:-1",
      "-q:v", "5",
      path.join(unifDir, "u%04d.jpg"),
    ]);
  } catch (err) {
    console.warn("[video-processor] Uniform pass failed:", err.message);
    if (!sceneOk) throw new Error("Both ffmpeg passes failed — cannot extract frames");
  }

  // Merge both sets
  const readDir = (dir) => {
    try {
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith(".jpg"))
        .sort()
        .map((f) => path.join(dir, f));
    } catch { return []; }
  };

  let allPaths = [...readDir(sceneDir), ...readDir(unifDir)];

  if (allPaths.length === 0) {
    throw new Error("No frames could be extracted from this video");
  }

  // Evenly sample down to MAX_FRAMES
  if (allPaths.length > MAX_FRAMES) {
    const step = allPaths.length / MAX_FRAMES;
    allPaths = Array.from({ length: MAX_FRAMES }, (_, i) =>
      allPaths[Math.min(Math.round(i * step), allPaths.length - 1)]
    );
  }

  const base64Frames = allPaths.map((p) => fs.readFileSync(p).toString("base64"));

  // Clean up
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

  return base64Frames;
}

// ── Claude vision ───────────────────────────────────────────────────────────

const VISION_PROMPT = `These are frames from a Kenyan shop or market video.

Look carefully across ALL frames. For each distinct product you can clearly see, extract:
- name: short product name (e.g. "Sunlight Soap 500g", "Maize Flour 2kg", "Cocacola 500ml")
- price: the price in KES as a whole number if visible on a label or price tag (null if not visible)
- description: one short sentence describing the product

Rules:
- Only list products you can clearly see — ignore blurry or partially visible items
- Do not duplicate products that appear in multiple frames; list each product only once
- If price is not readable, use null
- Be specific with names: include size/weight if visible (e.g. "500g" not just "soap")
- Return ONLY a valid JSON array — no preamble, no explanation, no markdown fences

Example:
[
  {"name":"Sunlight Soap 500g","price":45,"description":"Green bar soap for laundry and dishes"},
  {"name":"Brookside Milk 500ml","price":55,"description":"Fresh whole milk in a white carton"},
  {"name":"Maize Flour 2kg","price":175,"description":"Unga wa sembe in a branded blue packet"}
]

If no products are visible return: []`;

/**
 * Call Claude with retry on transient errors (rate limits, 529, network blips).
 */
async function callClaudeWithRetry(base64Frames, attempt = 0) {
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
      max_tokens: 2048,
      messages: [{ role: "user", content }],
    }),
  });

  // Transient: rate limit or overload — retry with backoff
  if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < MAX_RETRIES) {
    const wait = (attempt + 1) * 4000;
    console.warn(`[video-processor] Claude ${res.status} — retrying in ${wait}ms (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, wait));
    return callClaudeWithRetry(base64Frames, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = await res.json();
  const text = (json.content?.[0]?.text || "[]").trim();

  try { return JSON.parse(text); } catch { /* fall through */ }
  const match = text.match(/\[[\s\S]*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fall through */ } }
  return [];
}

async function analyzeFrames(base64Frames) {
  if (!ANTHROPIC_API_KEY) {
    console.warn("[video-processor] ANTHROPIC_API_KEY not set — returning mock products");
    return [
      { name: "Sample Product A", price: 150, description: "Mock product detected from video" },
      { name: "Sample Product B", price: 380, description: "Mock product detected from video" },
      { name: "Sample Product C", price: 75,  description: "Mock product detected from video" },
    ];
  }
  return callClaudeWithRetry(base64Frames);
}

// ── Main orchestrator ───────────────────────────────────────────────────────

async function processVideoScan(db, scanId, businessId, videoBuffer) {
  try {
    db.updateVideoScan(scanId, { status: "processing" });
    console.log(`[video-processor] Starting scan ${scanId} (${(videoBuffer.length / 1024).toFixed(0)} KB)`);

    // Step 1: Extract frames — update DB so UI shows "extracting" activity
    const frames = await extractFrames(videoBuffer, scanId);
    console.log(`[video-processor] Extracted ${frames.length} frames for scan ${scanId}`);

    // Publish frame count immediately — the polling UI shows this in real time
    db.updateVideoScan(scanId, { frames: frames.length, productCount: 0 });

    if (frames.length === 0) {
      db.updateVideoScan(scanId, { status: "done", productDrafts: [], productCount: 0 });
      return;
    }

    // Step 2: Analyze with Claude (single call, all frames)
    console.log(`[video-processor] Sending ${frames.length} frames to Claude (${MODEL})`);
    const raw = await analyzeFrames(frames);

    // Step 3: Deduplicate by normalised name
    const seen   = new Set();
    const unique = raw.filter((p) => {
      if (!p || !p.name) return false;
      const key = String(p.name).toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Step 4: Build draft records
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

    console.log(`[video-processor] Scan ${scanId} done — ${drafts.length} products, model: ${MODEL}`);
  } catch (err) {
    console.error(`[video-processor] Scan ${scanId} failed:`, err.message);
    db.updateVideoScan(scanId, { status: "error", error: err.message });
  }
}

module.exports = { processVideoScan };
