const { createClerkClient } = require("@clerk/backend");
const db = require("./db");

let client;

function getClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    throw db.httpError(503, "Owner sign-in is not configured on this server");
  }
  if (!client) {
    client = createClerkClient({ secretKey, publishableKey, telemetry: { disabled: true } });
  }
  return client;
}

function sameOrigin(req) {
  const originHeader = String(req.headers.origin || "");
  const hostHeader = String(req.headers.host || "").trim().toLowerCase();
  if (!originHeader || !hostHeader) throw db.httpError(403, "Owner sign-in requests must come from this site");
  let origin;
  try {
    origin = new URL(originHeader);
  } catch {
    throw db.httpError(403, "Invalid request origin");
  }
  if (!["https:", "http:"].includes(origin.protocol) || origin.host.toLowerCase() !== hostHeader) {
    throw db.httpError(403, "Owner sign-in requests must come from this site");
  }
  return origin.origin;
}

function fetchRequestForNodeRequest(req, origin) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value !== undefined) headers.set(name, String(value));
  }
  return new Request(new URL(req.url || "/", origin), { method: req.method || "GET", headers });
}

async function requireVerifiedOwner(req) {
  const origin = sameOrigin(req);
  let state;
  try {
    state = await getClient().authenticateRequest(fetchRequestForNodeRequest(req, origin), {
      authorizedParties: [origin],
      acceptsToken: "session_token",
    });
  } catch (error) {
    if (error?.statusCode) throw error;
    console.error("[auth] Clerk session verification failed:", error?.message || "unknown error");
    throw db.httpError(401, "Sign in again to continue");
  }
  if (state.status !== "signed-in" || !state.isAuthenticated) {
    throw db.httpError(401, "Sign in again to continue");
  }
  const { userId } = state.toAuth();
  if (!userId) throw db.httpError(401, "Sign in again to continue");

  let user;
  try {
    user = await getClient().users.getUser(userId);
  } catch (error) {
    console.error("[auth] Clerk profile lookup failed:", error?.message || "unknown error");
    throw db.httpError(503, "We could not confirm the owner email. Please try again shortly.");
  }
  const primaryEmail = (user.emailAddresses || []).find((item) =>
    item.id === user.primaryEmailAddressId
  );
  if (!primaryEmail?.emailAddress || primaryEmail.verification?.status !== "verified") {
    throw db.httpError(403, "Verify your owner email with Google or Clerk before continuing");
  }
  return { clerkUserId: userId, email: primaryEmail.emailAddress.trim().toLowerCase() };
}

module.exports = { requireVerifiedOwner };