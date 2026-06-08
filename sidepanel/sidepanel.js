'use strict';

// ── Element refs ───────────────────────────────────────
const frameShell  = document.getElementById('frame-shell');
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

// ── Frame pool ─────────────────────────────────────────
// Each slot (keyed by hostname or 'main') owns one <iframe>.
// Inactive slots use visibility:hidden so audio/video keeps running.
//
//   slot = { iframe, url, history: string[], histIdx: number }
//
const slots   = new Map();
let activeKey = null;

// ── Shared state ───────────────────────────────────────
let currentTabId = null;
let isMobile     = false;
let isPinned     = false;

function tabUrlKey(id) { return id ? `tabUrl_${id}` : 'tabUrl_default'; }

// ── Init ───────────────────────────────────────────────
(async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tabs[0]?.id ?? null;

  const stored = await chrome.storage.local.get({
    [tabUrlKey(currentTabId)]: 'https://www.google.com',
    mobileMode: false,
    pinned:     false
  });

  isMobile = stored.mobileMode;
  isPinned = stored.pinned;
  applyMobileState(false);
  applyPinState();

  await renderSitesBar();
  switchToSlot('main', stored[tabUrlKey(currentTabId)]);
})();

// ── Slot management ────────────────────────────────────

function createSlot(key, url) {
  const iframe = document.createElement('iframe');
  iframe.className = 'browser-frame';
  iframe.allow = 'fullscreen; autoplay; camera; microphone';

  const slot = { iframe, url: url || 'about:blank', history: [url || 'about:blank'], histIdx: 0 };
  slots.set(key, slot);
  frameShell.appendChild(iframe);

  // Sync URL bar when this slot navigates internally (same-origin only)
  iframe.addEventListener('load', () => {
    if (activeKey !== key) return;
    try {
      const loc = iframe.contentWindow.location.href;
      if (loc && loc !== 'about:blank' && loc !== slot.url) {
        slot.url = loc;
        urlInput.value = loc;
        chrome.storage.local.set({ [tabUrlKey(currentTabId)]: loc });
        updateActiveSite();
      }
    } catch {
      // Cross-origin: location inaccessible, keep last known URL
    }
  });

  iframe.src = url || 'about:blank';
  return slot;
}

function switchToSlot(key, initialUrl) {
  // Hide every slot
  slots.forEach(s => s.iframe.classList.remove('active'));

  // Get or create the target slot
  const slot = slots.get(key) ?? createSlot(key, initialUrl);

  // Reveal it
  slot.iframe.classList.add('active');
  activeKey = key;

  urlInput.value = slot.url !== 'about:blank' ? slot.url : '';
  syncNavButtons();
  updateActiveSite();
}

function activeSlot() { return slots.get(activeKey); }

// ── URL normalization ──────────────────────────────────
function normalizeUrl(raw) {
  const s = raw.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return 'https://' + s;
  if (/^localhost(:\d+)?(\/|$)/.test(s) || /^\d{1,3}(\.\d{1,3}){3}/.test(s)) return 'http://' + s;
  return 'https://www.google.com/search?q=' + encodeURIComponent(s);
}

// ── Navigate (active slot) ─────────────────────────────
function navigate(url, push = true) {
  if (!url) return;
  const slot = activeSlot();
  if (!slot) return;

  slot.url = url;
  slot.iframe.src = url;
  urlInput.value = url;

  if (push) {
    slot.history = slot.history.slice(0, slot.histIdx + 1);
    slot.history.push(url);
    slot.histIdx = slot.history.length - 1;
  }

  syncNavButtons();
  updateActiveSite();
  chrome.storage.local.set({ [tabUrlKey(currentTabId)]: url });
}

function syncNavButtons() {
  const slot = activeSlot();
  btnBack.disabled    = !slot || slot.histIdx <= 0;
  btnForward.disabled = !slot || slot.histIdx >= slot.history.length - 1;
}

// ── Toolbar: nav buttons ───────────────────────────────
btnBack.addEventListener('click', () => {
  const slot = activeSlot();
  if (!slot || slot.histIdx <= 0) return;
  slot.histIdx--;
  const url = slot.history[slot.histIdx];
  slot.url = url;
  slot.iframe.src = url;
  urlInput.value = url;
  syncNavButtons();
  updateActiveSite();
});

btnForward.addEventListener('click', () => {
  const slot = activeSlot();
  if (!slot || slot.histIdx >= slot.history.length - 1) return;
  slot.histIdx++;
  const url = slot.history[slot.histIdx];
  slot.url = url;
  slot.iframe.src = url;
  urlInput.value = url;
  syncNavButtons();
  updateActiveSite();
});

btnRefresh.addEventListener('click', () => {
  const slot = activeSlot();
  if (slot) slot.iframe.src = slot.iframe.src;
});

// ── Toolbar: URL bar ───────────────────────────────────
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = normalizeUrl(urlInput.value);
    if (url) navigate(url);
    urlInput.blur();
  }
  if (e.key === 'Escape') {
    const slot = activeSlot();
    urlInput.value = slot?.url ?? '';
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
  if (reload) {
    const slot = activeSlot();
    if (slot?.url) setTimeout(() => { slot.iframe.src = slot.url; }, 80);
  }
}

btnMobile.addEventListener('click', () => { isMobile = !isMobile; applyMobileState(true); });

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
  const slot = activeSlot();
  if (slot?.url && slot.url !== 'about:blank') chrome.tabs.create({ url: slot.url });
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
    img.addEventListener('error', () => { img.style.display = 'none'; letter.style.display = 'flex'; });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'site-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove from sidebar';
    removeBtn.setAttribute('aria-label', `Remove ${site.title}`);
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeSite(idx, site.hostname); });

    item.append(img, letter, removeBtn);
    // Clicking switches to this site's dedicated slot — other slots keep running
    item.addEventListener('click', () => switchToSlot(site.hostname, site.url));
    sitesList.appendChild(item);
  });

  updateActiveSite();
}

function updateActiveSite() {
  const slot = activeSlot();
  let currentHostname = '';
  try { currentHostname = new URL(slot?.url ?? '').hostname; } catch {}
  sitesList.querySelectorAll('.site-item').forEach(item => {
    item.classList.toggle('active', item.dataset.hostname === currentHostname);
  });
}

async function removeSite(idx, hostname) {
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  quickSites.splice(idx, 1);
  await chrome.storage.local.set({ quickSites });

  // Destroy the slot's iframe to free its resources
  const slot = slots.get(hostname);
  if (slot) { slot.iframe.remove(); slots.delete(hostname); }

  // If this was the active slot, fall back to main
  if (activeKey === hostname) switchToSlot('main', 'https://www.google.com');
  renderSitesBar();
}

async function addCurrentSite() {
  const slot = activeSlot();
  const url = slot?.url;
  if (!url || url === 'about:blank') return;

  let origin, hostname;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    origin = parsed.origin; hostname = parsed.hostname;
  } catch { return; }

  let title = hostname;
  try { title = slot.iframe.contentWindow.document.title || hostname; } catch {}

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
