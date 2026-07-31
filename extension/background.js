const RULE_ID_START = 1000;
const MAX_DOMAINS = 100;

function normalizeDomain(value) {
  if (typeof value !== "string") return null;
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#\s]/, 1)[0]
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ? domain : null;
}

function normalizeDomains(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeDomain).filter(Boolean))].slice(0, MAX_DOMAINS);
}

function isAllowedSender(sender) {
  const url = sender?.tab?.url ?? "";
  return url.startsWith("https://lukko-web.laosmo.chatgpt.site/") || url.startsWith("http://localhost:3000/") || url.startsWith("http://127.0.0.1:3000/");
}

async function currentRules() {
  return chrome.declarativeNetRequest.getDynamicRules();
}

async function applyFocusState(payload) {
  const domains = normalizeDomains(payload?.blockedDomains);
  const active = Boolean(payload?.active) && domains.length > 0 && (!payload?.until || payload.until > Date.now());
  const rules = active
    ? domains.map((domain, index) => ({
        id: RULE_ID_START + index,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ["main_frame", "sub_frame"]
        }
      }))
    : [];
  const oldRules = await currentRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules: rules
  });
  await chrome.storage.local.set({ active, until: active ? payload.until ?? null : null, blockedDomains: domains });
  return { connected: true, active, blockedDomains: domains };
}

chrome.runtime.onInstalled.addListener(() => {
  applyFocusState({ active: false, blockedDomains: [] }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isAllowedSender(sender)) return false;

  if (message?.type === "lukko-focus-state") {
    applyFocusState(message.payload).then(sendResponse).catch(() => sendResponse({ connected: true, active: false }));
    return true;
  }

  if (message?.type === "lukko-status") {
    chrome.storage.local.get(["active", "until", "blockedDomains"]).then((stored) => {
      const active = Boolean(stored.active) && (!stored.until || stored.until > Date.now());
      sendResponse({ connected: true, active, blockedDomains: normalizeDomains(stored.blockedDomains) });
    }).catch(() => sendResponse({ connected: true, active: false }));
    return true;
  }

  return false;
});

chrome.alarms?.create("lukko-expiry-check", { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name !== "lukko-expiry-check") return;
  chrome.storage.local.get(["active", "until", "blockedDomains"]).then((stored) => {
    if (stored.active && stored.until && stored.until <= Date.now()) return applyFocusState({ active: false, blockedDomains: stored.blockedDomains });
    return undefined;
  }).catch(() => undefined);
});
