const https = require("https");

const PREFIX = "/api/__clerk";
const FRONTEND_API_HOST = "frontend-api.clerk.dev";

function writeError(res, status, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = Buffer.from(JSON.stringify({ error: message }));
  res.writeHead(status, { "content-type": "application/json", "content-length": String(body.length) });
  res.end(body);
}

function cleanResponseHeaders(headers, { hasBody = true } = {}) {
  const result = { ...headers };
  for (const name of ["transfer-encoding", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade"]) {
    delete result[name];
  }
  if (!hasBody) delete result["content-length"];
  return result;
}

function handleClerkProxy(req, res) {
  const pathname = String(req.url || "").split("?", 1)[0];
  if (!pathname.startsWith(PREFIX)) return false;
  if (process.env.NODE_ENV !== "production") {
    writeError(res, 404, "Clerk proxy is only available in production");
    return true;
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  const host = String(req.headers.host || "").split(",")[0].trim();
  if (!secretKey || !host) {
    writeError(res, 503, "Clerk proxy is not configured");
    return true;
  }

  const protocolPath = String(req.url || "/").replace(/^\/api\/__clerk(?=\/|\?|$)/, "") || "/";
  const targetPath = protocolPath.startsWith("?") ? `/${protocolPath}` : protocolPath;
  const forwardedHeaders = { ...req.headers };
  delete forwardedHeaders.host;
  delete forwardedHeaders["clerk-secret-key"];
  delete forwardedHeaders["clerk-proxy-url"];
  delete forwardedHeaders["x-forwarded-host"];
  delete forwardedHeaders["x-forwarded-for"];
  delete forwardedHeaders["x-forwarded-proto"];
  forwardedHeaders["clerk-proxy-url"] = `https://${host}${PREFIX}`;
  forwardedHeaders["clerk-secret-key"] = secretKey;

  const proxyRequest = https.request({
    hostname: FRONTEND_API_HOST,
    method: req.method,
    path: targetPath,
    headers: forwardedHeaders,
  }, (proxyResponse) => {
    const status = proxyResponse.statusCode || 502;
    const bodyless = req.method === "HEAD" || status < 200 || status === 204 || status === 304;
    const headers = cleanResponseHeaders(proxyResponse.headers, { hasBody: !bodyless });
    if (headers["content-length"] !== undefined || bodyless) {
      res.writeHead(status, headers);
      proxyResponse.on("error", () => res.destroy());
      proxyResponse.pipe(res);
      return;
    }
    const chunks = [];
    proxyResponse.on("data", (chunk) => chunks.push(chunk));
    proxyResponse.on("end", () => {
      const body = Buffer.concat(chunks);
      headers["content-length"] = String(body.length);
      res.writeHead(status, headers);
      res.end(body);
    });
    proxyResponse.on("error", () => writeError(res, 502, "Clerk proxy request failed"));
  });
  proxyRequest.on("error", () => writeError(res, 502, "Clerk proxy request failed"));
  req.on("aborted", () => proxyRequest.destroy());
  req.pipe(proxyRequest);
  return true;
}

module.exports = { handleClerkProxy, PREFIX };