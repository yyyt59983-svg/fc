export function getApiUrl(): string {
  // 1. Read from localStorage if configured dynamically in the app UI
  const customUrl = localStorage.getItem("ROXY_API_URL") || localStorage.getItem("NIDHI_API_URL");
  if (customUrl) return customUrl.replace(/\/$/, "");

  // 2. Read from env variable VITE_API_URL
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  // 3. Fallback to current window host
  return window.location.origin;
}

export function getWsUrl(): string {
  const customUrl = localStorage.getItem("ROXY_WS_URL") || localStorage.getItem("NIDHI_WS_URL");
  if (customUrl) return customUrl.replace(/\/$/, "");

  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}
