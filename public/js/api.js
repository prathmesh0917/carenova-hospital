// api.js - a small wrapper around fetch(). Every page uses API.get / post / put / del.
// If the server answers with an error status, we throw an Error carrying the server's message.
async function request(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(API_BASE + path, options);
  } catch (e) {
    throw new Error("Cannot reach the server. Is it running?");
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || "Request failed (" + res.status + ")");
    err.status = res.status;
    throw err;
  }
  return data;
}

const API = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  del: (path) => request("DELETE", path)
};

// Build a query string and skip empty values: qs({q: "ab", page: ""}) -> "?q=ab"
function qs(params) {
  const p = new URLSearchParams();
  Object.keys(params).forEach((k) => { if (params[k] !== "" && params[k] != null) p.set(k, params[k]); });
  const s = p.toString();
  return s ? "?" + s : "";
}
