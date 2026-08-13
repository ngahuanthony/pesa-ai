// Object Storage write-through persistence.
//
// Solves the Replit redeploy data-wipe problem: every new deployment build
// starts a fresh container — any db.json written only to the local filesystem
// is lost. This module mirrors the JSON file to Replit's GCS-backed Object
// Storage so a new container always starts with the latest data.
//
// Pattern: write-through cache
//   • init()           — download db.json from Object Storage → local file
//                        (called BEFORE server.listen so first request has data)
//   • pushBackground() — after every db.save(), upload local file to Object
//                        Storage asynchronously (never blocks a request)

const fs = require("fs");
const path = require("path");

const OBJECT_KEY = "pesa-db.json";

function getClient() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;
  try {
    const { Client } = require("@replit/object-storage");
    return new Client({ bucketId });
  } catch (err) {
    console.warn("@replit/object-storage not available:", err.message);
    return null;
  }
}

// Called once at startup, before server.listen().
// Returns a promise so server.js can await it.
async function init(dataFile) {
  const client = getClient();
  if (!client) {
    console.warn("[persistence] Object Storage not configured — data will NOT survive redeploys.");
    return;
  }
  try {
    const result = await client.downloadAsText(OBJECT_KEY);
    if (result.ok && result.value) {
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      fs.writeFileSync(dataFile, result.value, "utf8");
      console.log("[persistence] Database restored from Object Storage.");
    } else {
      console.log("[persistence] No backup found in Object Storage — starting with local or empty database.");
    }
  } catch (err) {
    console.warn("[persistence] Could not restore from Object Storage:", err.message);
  }
}

// Called after every db.save(). Non-blocking — errors are logged, never thrown.
function pushBackground(dataFile) {
  const client = getClient();
  if (!client) return;
  try {
    const content = fs.readFileSync(dataFile, "utf8");
    client.uploadFromText(OBJECT_KEY, content).catch((err) =>
      console.error("[persistence] Upload to Object Storage failed:", err.message)
    );
  } catch (err) {
    console.error("[persistence] Could not read local db for upload:", err.message);
  }
}

module.exports = { init, pushBackground };
