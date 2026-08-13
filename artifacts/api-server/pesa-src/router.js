// A deliberately tiny router — no Express, so the whole project runs with
// zero `npm install`. Supports "/api/businesses/:id/products/:productId"
// style params and exact-match query string parsing.

const routes = []; // { method, segments, handler }

function toSegments(pattern) {
  return pattern.split("/").filter(Boolean);
}

function register(method, pattern, handler) {
  routes.push({ method, segments: toSegments(pattern), handler });
}

function match(method, pathname) {
  const pathSegments = toSegments(decodeURIComponent(pathname));
  for (const route of routes) {
    if (route.method !== method) continue;
    if (route.segments.length !== pathSegments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < route.segments.length; i++) {
      const rs = route.segments[i];
      const ps = pathSegments[i];
      if (rs.startsWith(":")) {
        params[rs.slice(1)] = ps;
      } else if (rs !== ps) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler: route.handler, params };
  }
  return null;
}

module.exports = {
  get: (pattern, handler) => register("GET", pattern, handler),
  post: (pattern, handler) => register("POST", pattern, handler),
  put: (pattern, handler) => register("PUT", pattern, handler),
  patch: (pattern, handler) => register("PATCH", pattern, handler),
  delete: (pattern, handler) => register("DELETE", pattern, handler),
  match,
};
