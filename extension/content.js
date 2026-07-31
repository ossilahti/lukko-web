const ALLOWED_ORIGINS = new Set([
  "https://lukko-web.laosmo.chatgpt.site",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function isAllowedPage() {
  return ALLOWED_ORIGINS.has(window.location.origin);
}

function forwardToPage(response) {
  window.postMessage({ source: "lukko-extension", type: "lukko-status", ...response }, window.location.origin);
}

window.addEventListener("message", (event) => {
  if (!isAllowedPage() || event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.source !== "lukko-web") return;

  const message = {
    type: event.data.type,
    payload: event.data.payload
  };
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      forwardToPage({ connected: false, active: false });
      return;
    }
    forwardToPage(response ?? { connected: true, active: false });
  });
});
