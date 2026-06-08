'use strict';

// ── Element refs ───────────────────────────────────────
const frame       = document.getElementById('browser-frame');
const urlInput    = document.getElementById('url-input');
const btnBack     = document.getElementById('btn-back');
const btnForward  = document.getElementById('btn-forward');
const btnRefresh  = document.getElementById('btn-refresh');
const btnMobile   = document.getElementById('btn-mobile');
const btnPin      = document.getElementById('btn-pin');
const btnNewTab   = document.getElementById('btn-new-tab');
const btnAddSite  = document.getElementById('btn-add-site');
const sitesList   = document.getElementById('sites-list');
const sitesEmpty  = document.getElementById('sites-empty');

// ── Navigation state ───────────────────────────────────
let navHistory  = [];
let historyIdx  = -1;
let currentUrl  = '';
let isMobile    = false;
let isPinned    = false;
let currentTabId = null;   // resolved once in init

// ── Per-tab storage key ────────────────────────────────
// Each browser tab gets its own sidebar URL so switching tabs never
// clobbers another tab's browsing session.
function tabUrlKey(tabId) {
  return tabId ? `tabUrl_${tabId}` : 'tabUrl_default';
}

// ── Init ───────────────────────────────────────────────
(async function init() {
  // Resolve which tab this panel belongs to
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tabs[0]?.id ?? null;
  const urlKey = tabUrlKey(currentTabId);

  const stored = await chrome.storage.local.get({
    [urlKey]:   'https://www.google.com',
    mobileMode: false,
    pinned:     false
  });

  isMobile = stored.mobileMode;
  isPinned = stored.pinned;
  applyMobileState(false);
  applyPinState();

  await renderSitesBar();
  navigate(stored[urlKey]);
})();

// ── URL normalization ──────────────────────────────────
function normalizeUrl(raw) {
  const s = raw.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return 'https://' + s;
  if (/^localhost(:\d+)?(\/|$)/.test(s) || /^\d{1,3}(\.\d{1,3}){3}/.test(s)) return 'http://' + s;
  return 'https://www.google.com/search?q=' + encodeURIComponent(s);
}

// ── Core navigate ──────────────────────────────────────
function navigate(url, push = true) {
  if (!url) return;
  currentUrl = url;
  urlInput.value = url;
  frame.src = url;

  if (push) {
    navHistory = navHistory.slice(0, historyIdx + 1);
    navHistory.push(url);
    historyIdx = navHistory.length - 1;
  }

  updateNavButtons();
  updateActiveSite();
  // Save URL under this tab's own key so other tabs are unaffected
  chrome.storage.local.set({ [tabUrlKey(currentTabId)]: url });
}

function updateNavButtons() {
  btnBack.disabled    = historyIdx <= 0;
  btnForward.disabled = historyIdx >= navHistory.length - 1;
}

// ── Toolbar: nav buttons ───────────────────────────────
btnBack.addEventListener('click', () => {
  if (historyIdx > 0) {
    historyIdx--;
    navigate(navHistory[historyIdx], false);
  }
});

btnForward.addEventListener('click', () => {
  if (historyIdx < navHistory.length - 1) {
    historyIdx++;
    navigate(navHistory[historyIdx], false);
  }
});

btnRefresh.addEventListener('click', () => { frame.src = frame.src; });

// ── Toolbar: URL bar ───────────────────────────────────
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = normalizeUrl(urlInput.value);
    if (url) navigate(url);
    urlInput.blur();
  }
  if (e.key === 'Escape') {
    urlInput.value = currentUrl;
    urlInput.blur();
  }
});

urlInput.addEventListener('focus', () => urlInput.select());

// ── Mobile view ────────────────────────────────────────
function applyMobileState(reload = true) {
  document.body.classList.toggle('mobile-mode', isMobile);
  btnMobile.classList.toggle('active', isMobile);
  btnMobile.setAttribute('aria-pressed', String(isMobile));
  chrome.storage.local.set({ mobileMode: isMobile });
  chrome.runtime.sendMessage({ type: 'SET_MOBILE_UA', enabled: isMobile });
  if (reload && currentUrl) {
    setTimeout(() => { frame.src = currentUrl; }, 80);
  }
}

btnMobile.addEventListener('click', () => {
  isMobile = !isMobile;
  applyMobileState(true);
});

// ── Pin sidebar ────────────────────────────────────────
function applyPinState() {
  btnPin.classList.toggle('active', isPinned);
  btnPin.setAttribute('aria-pressed', String(isPinned));
}

btnPin.addEventListener('click', () => {
  isPinned = !isPinned;
  applyPinState();
  chrome.runtime.sendMessage({ type: 'SET_PINNED', enabled: isPinned });
});

// ── Open in new tab ────────────────────────────────────
btnNewTab.addEventListener('click', () => {
  if (currentUrl && currentUrl !== 'about:blank') {
    chrome.tabs.create({ url: currentUrl });
  }
});

// ── Frame load: sync URL bar for same-origin navigation ─
frame.addEventListener('load', () => {
  try {
    const loc = frame.contentWindow.location.href;
    if (loc && loc !== 'about:blank' && loc !== currentUrl) {
      currentUrl = loc;
      urlInput.value = loc;
      chrome.storage.local.set({ [tabUrlKey(currentTabId)]: loc });
      updateActiveSite();
    }
  } catch {
    // Cross-origin: keep last known URL
  }
});

// ── Quick-sites bar ────────────────────────────────────

function hostColor(hostname) {
  let h = 0;
  for (const ch of hostname) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  return `hsl(${((Math.abs(h) % 36) * 10)}, 55%, 42%)`;
}

async function renderSitesBar() {
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });

  sitesList.querySelectorAll('.site-item').forEach(el => el.remove());
  sitesEmpty.style.display = quickSites.length === 0 ? '' : 'none';

  quickSites.forEach((site, idx) => {
    const item = document.createElement('div');
    item.className = 'site-item';
    item.title = site.title;
    item.dataset.idx = idx;
    item.dataset.url = site.url;
    item.dataset.hostname = site.hostname;

    const img = document.createElement('img');
    img.className = 'site-favicon';
    img.src = site.favicon;
    img.alt = '';
    img.draggable = false;

    const letter = document.createElement('span');
    letter.className = 'site-letter';
    letter.textContent = (site.hostname[0] || '?').toUpperCase();
    letter.style.background = hostColor(site.hostname);
    letter.style.display = 'none';

    img.addEventListener('error', () => {
      img.style.display = 'none';
      letter.style.display = 'flex';
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'site-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove from sidebar';
    removeBtn.setAttribute('aria-label', `Remove ${site.title}`);
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeSite(idx);
    });

    item.append(img, letter, removeBtn);
    item.addEventListener('click', () => navigate(site.url));
    sitesList.appendChild(item);
  });

  updateActiveSite();
}

function updateActiveSite() {
  let currentHostname = '';
  try { currentHostname = new URL(currentUrl).hostname; } catch {}
  sitesList.querySelectorAll('.site-item').forEach(item => {
    item.classList.toggle('active', item.dataset.hostname === currentHostname);
  });
}

async function removeSite(idx) {
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  quickSites.splice(idx, 1);
  await chrome.storage.local.set({ quickSites });
  renderSitesBar();
}

async function addCurrentSite() {
  if (!currentUrl || currentUrl === 'about:blank') return;

  let origin, hostname;
  try {
    const parsed = new URL(currentUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    origin   = parsed.origin;
    hostname = parsed.hostname;
  } catch { return; }

  let title = hostname;
  try { title = frame.contentWindow.document.title || hostname; } catch {}

  const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  if (quickSites.some(s => s.hostname === hostname)) return;

  quickSites.push({ url: origin, hostname, title, favicon });
  await chrome.storage.local.set({ quickSites });
  renderSitesBar();
}

btnAddSite.addEventListener('click', addCurrentSite);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.quickSites) renderSitesBar();
});

// ── Resource cleanup ───────────────────────────────────
// We do NOT clear the iframe on pagehide because pagehide fires on every tab
// switch (not just explicit panel close), which would wipe the current page
// whenever the user changes tabs.
//
// When the user explicitly closes the panel ("Close Sidebar Browser" button),
// Chrome destroys the panel page entirely — the iframe and all its resources
// (audio, video, network, CPU) are freed automatically by the browser.
// No manual cleanup is needed or appropriate here.
