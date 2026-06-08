'use strict';

const RULE_XFRAME   = 1;
const RULE_SECFETCH = 3;

// ── Toolbar button opens the side panel ───────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ── On install / update ────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_XFRAME, RULE_SECFETCH],
    addRules: [
      // Strip X-Frame-Options + CSP so the browser doesn't block cross-origin embedding
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
      },
      // Override Sec-Fetch-* request headers so servers (e.g. Google) don't
      // detect the iframe context and return 403. We make the request look like
      // a normal top-level browser navigation instead of an embedded iframe load.
      {
        id: RULE_SECFETCH,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Sec-Fetch-Dest', operation: 'set', value: 'document' },
            { header: 'Sec-Fetch-Mode', operation: 'set', value: 'navigate' },
            { header: 'Sec-Fetch-Site', operation: 'set', value: 'none' },
            { header: 'Sec-Fetch-User', operation: 'set', value: '?1' }
          ]
        },
        condition: {
          initiatorDomains: [chrome.runtime.id],
          resourceTypes: ['main_frame', 'sub_frame']
        }
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

// ── Clean up per-tab URL key when a tab is closed ──────
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`tabUrl_${tabId}`);
});

// ── Context menu click → save site to quick-sites list ─
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'add-to-sidebar' || !tab?.url) return;

  let hostname;
  try {
    const parsed = new URL(tab.url);
    // Skip internal browser pages
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    hostname = parsed.hostname;
  } catch { return; }

  const title   = tab.title || hostname;
  const favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${hostname}&size=128`;

  const PROTECTED = ['welovephuket.com'];
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  if (PROTECTED.includes(hostname)) return;
  if (quickSites.some(s => s.hostname === hostname)) return; // already pinned

  quickSites.push({ url: tab.url, hostname, title, favicon });
  chrome.storage.local.set({ quickSites });
});

