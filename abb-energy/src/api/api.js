const BASE = "";

async function request(url, options = {}) {
  const res = await fetch(BASE + url, { credentials: "include", ...options });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(text || res.statusText), { status: res.status });
  }
  return res.json();
}

export const api = {
  me: () => request("/api/me"),
  login: (email, password) =>
    request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/api/logout", { method: "POST" }),
  register: (data) =>
    request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  breakers: () => request("/api/breakers"),
  tariffs: () => request("/api/tariffs"),
  updateTariffs: (data) =>
    request("/api/change-tariffs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  consumption: (breakerId, from, to, view) =>
    request(
      `/api/consumption?breaker_id=${breakerId}&from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&view=${encodeURIComponent(view)}`
    ),
  location: () => request("/api/location"),
  updateLocation: (location) =>
    request("/api/update-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location }),
    }),
  cities: () => request("/api/cities"),
  aiQuery: (question) =>
    request("/api/ai-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),
};
