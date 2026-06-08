'use strict';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.0 Mobile/15E148 Safari/604.1';

const RULE_XFRAME    = 1;
const RULE_MOBILE_UA = 2;

// ── Toolbar button opens the side panel ───────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ── On install / update ────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  // X-Frame-Options + CSP bypass so the iframe can load any site
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_XFRAME, RULE_MOBILE_UA],
    addRules: [
      {
        id: RULE_XFRAME,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'X-Frame-Options', operation: 'remove' },
            { header: 'Content-Security-Policy', operation: 'remove' }
          ]
        },
        condition: { resourceTypes: ['main_frame', 'sub_frame'] }
      }
    ]
  });

  // Context menu: "Add to Sidebar" when right-clicking any page
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'add-to-sidebar',
      title: 'Add to Sidebar',
      contexts: ['page']
    });
  });
});

// ── Auto-open panel on tab switch when pinned ──────────
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { pinned } = await chrome.storage.local.get({ pinned: false });
  if (pinned) chrome.sidePanel.open({ tabId }).catch(() => {});
});

// ── Context menu click → save site to quick-sites list ─
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'add-to-sidebar' || !tab?.url) return;

  let origin, hostname;
  try {
    const parsed = new URL(tab.url);
    // Skip internal browser pages
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    origin   = parsed.origin;
    hostname = parsed.hostname;
  } catch { return; }

  const title   = tab.title || hostname;
  const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  if (quickSites.some(s => s.hostname === hostname)) return; // already pinned

  quickSites.push({ url: origin, hostname, title, favicon });
  chrome.storage.local.set({ quickSites });
});

// ── Messages from side panel ───────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SET_MOBILE_UA') {
    setMobileUARule(message.enabled)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'SET_PINNED') {
    chrome.storage.local.set({ pinned: message.enabled });
    sendResponse({ ok: true });
  }
});

// ── Mobile UA declarativeNetRequest rule ───────────────
async function setMobileUARule(enabled) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_MOBILE_UA],
    addRules: enabled
      ? [{
          id: RULE_MOBILE_UA,
          priority: 2,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'User-Agent', operation: 'set', value: MOBILE_UA }
            ]
          },
          condition: {
            initiatorDomains: [chrome.runtime.id],
            resourceTypes: ['main_frame', 'sub_frame']
          }
        }]
      : []
  });
}
