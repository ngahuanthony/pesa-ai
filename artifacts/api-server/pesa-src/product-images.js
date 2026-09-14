const DEFAULT_BUCKET = "product-images";
const MAX_IMAGE_BYTES = 100 * 1024;

function storageConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const bucket = String(process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
  if (!url || !key) {
    throw new Error("Supabase product image storage is not configured");
  }
  return { url, key, bucket };
}

function pathPart(value, fallback = "default") {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function objectPath({ businessId, productId, color }) {
  return `${pathPart(businessId, "business")}/${pathPart(productId, "product")}_${pathPart(color)}.webp`;
}

function publicUrl(config, path) {
  return `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function isPublicProductImageUrl(value) {
  if (!isConfigured() || typeof value !== "string") return false;
  try {
    const config = storageConfig();
    const candidate = new URL(value);
    const origin = new URL(config.url).origin;
    return candidate.origin === origin &&
      candidate.pathname.startsWith(`/storage/v1/object/public/${encodeURIComponent(config.bucket)}/`);
  } catch {
    return false;
  }
}

async function uploadVariantImage({ businessId, productId, color, imageBuffer, contentType }) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 100 || imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Product photo must be a non-empty WebP image under 100KB");
  }
  if (String(contentType || "").toLowerCase() !== "image/webp") {
    throw new Error("Product photo must be uploaded as WebP");
  }
  const config = storageConfig();
  const path = objectPath({ businessId, productId, color });
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.key}`,
      apikey: config.key,
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "x-upsert": "true",
    },
    body: imageBuffer,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase product image upload failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return { imageUrl: publicUrl(config, path), path, bytes: imageBuffer.length };
}

function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY));
}

module.exports = { uploadVariantImage, objectPath, isConfigured, isPublicProductImageUrl, MAX_IMAGE_BYTES };