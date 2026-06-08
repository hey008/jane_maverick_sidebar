'use strict';

// ── Element refs ───────────────────────────────────────
const frameShell      = document.getElementById('frame-shell');
const urlInput        = document.getElementById('url-input');
const btnBack         = document.getElementById('btn-back');
const btnForward      = document.getElementById('btn-forward');
const btnRefresh      = document.getElementById('btn-refresh');
const btnNewTab       = document.getElementById('btn-new-tab');
const btnAddSite      = document.getElementById('btn-add-site');
const btnSettings     = document.getElementById('btn-settings');
const sitesList       = document.getElementById('sites-list');
const sitesEmpty      = document.getElementById('sites-empty');
const managePanel     = document.getElementById('manage-panel');
const manageList      = document.getElementById('manage-list');
const btnManageClose  = document.getElementById('btn-manage-close');
const btnResetSites   = document.getElementById('btn-reset-sites');

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

function tabUrlKey(id) { return id ? `tabUrl_${id}` : 'tabUrl_default'; }

// ── Favicon helpers ────────────────────────────────────
function faviconUrl(hostname) {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${hostname}&size=128`;
}

function attachFaviconFallback(img, hostname, letter) {
  let stage = 0;
  img.addEventListener('error', () => {
    if (stage === 0) {
      stage = 1;
      img.src = `https://${hostname}/favicon.ico`;
    } else {
      img.style.display = 'none';
      letter.style.display = 'flex';
    }
  });
}

// ── Default sites (always shown, cannot be removed) ────
const DEFAULT_SITES = [
  {
    url:       'https://welovephuket.com',
    hostname:  'welovephuket.com',
    title:     'We Love Phuket',
    favicon:   faviconUrl('welovephuket.com'),
    isDefault: true
  }
];

// ── Default quick-sites preset (used by "Reset to default") ────
const RESET_QUICK_SITES = [
  { url: 'https://web.whatsapp.com',      hostname: 'web.whatsapp.com',  title: 'WhatsApp',      favicon: faviconUrl('web.whatsapp.com') },
  { url: 'https://www.messenger.com',      hostname: 'www.messenger.com', title: 'Messenger',     favicon: faviconUrl('www.messenger.com') },
  { type: 'separator' },
  { url: 'https://youtube.com',           hostname: 'youtube.com',       title: 'YouTube',       favicon: faviconUrl('youtube.com') },
  { url: 'https://music.youtube.com',     hostname: 'music.youtube.com', title: 'YouTube Music', favicon: faviconUrl('music.youtube.com') },
  { type: 'separator' },
  { url: 'https://facebook.com',          hostname: 'facebook.com',      title: 'Facebook',      favicon: faviconUrl('facebook.com') },
  { url: 'https://www.instagram.com',     hostname: 'www.instagram.com', title: 'Instagram',     favicon: faviconUrl('www.instagram.com') },
  { url: 'https://www.tiktok.com',        hostname: 'www.tiktok.com',    title: 'TikTok',        favicon: faviconUrl('www.tiktok.com') },
  { url: 'https://x.com',                hostname: 'x.com',             title: 'X',             favicon: faviconUrl('x.com') },
  { url: 'https://www.linkedin.com',      hostname: 'www.linkedin.com',  title: 'LinkedIn',      favicon: faviconUrl('www.linkedin.com') },
  { type: 'separator' },
  { url: 'https://www.reddit.com',        hostname: 'www.reddit.com',    title: 'Reddit',        favicon: faviconUrl('www.reddit.com') },
  { url: 'https://www.blognone.com',      hostname: 'www.blognone.com',  title: 'Blognone',      favicon: faviconUrl('www.blognone.com') },
];

// ── Init ───────────────────────────────────────────────
(async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tabs[0]?.id ?? null;

  const stored = await chrome.storage.local.get({
    [tabUrlKey(currentTabId)]: 'https://welovephuket.com'
  });

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
  updateSlotIndicators();
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

function buildSiteItem(site, idx) {
  const item = document.createElement('div');
  item.className = 'site-item';
  item.title = site.title;
  item.dataset.hostname = site.hostname;
  item.dataset.url      = site.url;
  item.dataset.idx      = String(idx);
  if (site.isDefault) item.dataset.default = 'true';

  const img = document.createElement('img');
  img.className = 'site-favicon';
  img.src = faviconUrl(site.hostname);
  img.alt = '';
  img.draggable = false;

  const letter = document.createElement('span');
  letter.className = 'site-letter';
  letter.textContent = (site.hostname[0] || '?').toUpperCase();
  letter.style.background = hostColor(site.hostname);
  letter.style.display = 'none';
  attachFaviconFallback(img, site.hostname, letter);

  // Green running dot
  const dot = document.createElement('span');
  dot.className = 'slot-dot';
  dot.setAttribute('aria-hidden', 'true');

  // Amber force-close (available for all sites including default)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'site-close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Force close tab';
  closeBtn.setAttribute('aria-label', `Force close ${site.title}`);
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); forceCloseSlot(site.hostname); });

  item.append(img, letter, dot, closeBtn);

  item.addEventListener('click', () => {
    switchToSlot(site.hostname, site.url);
  });

  // Right-click: context menu (default sites can't be removed)
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openCtxMenu(e.clientX, e.clientY, site.hostname, idx, site.url, !!site.isDefault);
  });

  return item;
}

function makeSeparatorEl() {
  const el = document.createElement('div');
  el.className = 'sites-separator';
  return el;
}

async function renderSitesBar() {
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });

  // Clear all children except the empty hint
  [...sitesList.children].forEach(el => { if (el !== sitesEmpty) el.remove(); });

  DEFAULT_SITES.forEach(site => sitesList.appendChild(buildSiteItem(site, -1)));
  sitesList.appendChild(makeSeparatorEl());

  const userSites = quickSites.filter(s => s.type !== 'separator');
  sitesEmpty.style.display = userSites.length === 0 ? '' : 'none';

  quickSites.forEach((site, idx) => {
    if (site.type === 'separator') {
      sitesList.appendChild(makeSeparatorEl());
    } else {
      sitesList.appendChild(buildSiteItem(site, idx));
    }
  });

  updateActiveSite();
  updateSlotIndicators();
}

/** Mark which site icons have a live iframe slot */
function updateSlotIndicators() {
  sitesList.querySelectorAll('.site-item').forEach(item => {
    item.classList.toggle('slot-running', slots.has(item.dataset.hostname));
  });
}

function updateActiveSite() {
  const slot = activeSlot();
  let currentHostname = '';
  try { currentHostname = new URL(slot?.url ?? '').hostname; } catch {}
  sitesList.querySelectorAll('.site-item').forEach(item => {
    item.classList.toggle('active', item.dataset.hostname === currentHostname);
  });
}

/** Destroy the iframe for a slot but keep its icon in the bar */
function forceCloseSlot(hostname) {
  const slot = slots.get(hostname);
  if (!slot) return;
  slot.iframe.remove();
  slots.delete(hostname);
  if (activeKey === hostname) switchToSlot('main', 'https://welovephuket.com');
  updateSlotIndicators();
}

/** Permanently remove site from bar and destroy its slot */
async function removeSite(idx, hostname) {
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  quickSites.splice(idx, 1);
  await chrome.storage.local.set({ quickSites });
  const slot = slots.get(hostname);
  if (slot) { slot.iframe.remove(); slots.delete(hostname); }
  if (activeKey === hostname) switchToSlot('main', 'https://welovephuket.com');
  renderSitesBar();
}

// ── Manage panel ───────────────────────────────────────

function openManagePanel() {
  renderManagePanel();
  managePanel.hidden = false;
  btnSettings.classList.add('active');
}

function closeManagePanel() {
  managePanel.hidden = true;
  btnSettings.classList.remove('active');
}

async function renderManagePanel() {
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  manageList.innerHTML = '';

  // Default sites (locked)
  DEFAULT_SITES.forEach(site => manageList.appendChild(buildManageRow(site, -1)));

  // Separator between default and user sites
  manageList.appendChild(buildManageSeparator());

  // User quick sites (with separators)
  quickSites.forEach((site, idx) => {
    if (site.type === 'separator') {
      manageList.appendChild(buildManageSeparator());
    } else {
      manageList.appendChild(buildManageRow({ ...site, idx }));
    }
  });
}

function buildManageSeparator() {
  const el = document.createElement('div');
  el.className = 'manage-separator';
  return el;
}

function buildManageRow(site) {
  const row = document.createElement('div');
  row.className = 'manage-item';

  const img = document.createElement('img');
  img.className = 'manage-item-favicon';
  img.src = faviconUrl(site.hostname);
  img.alt = '';
  img.draggable = false;

  const letter = document.createElement('span');
  letter.className = 'manage-item-letter';
  letter.textContent = (site.hostname[0] || '?').toUpperCase();
  letter.style.background = hostColor(site.hostname);
  attachFaviconFallback(img, site.hostname, letter);

  const title = document.createElement('span');
  title.className = 'manage-item-title';
  title.textContent = site.title;

  if (site.isDefault) {
    const lock = document.createElement('span');
    lock.className = 'manage-item-lock';
    lock.title = 'Default site — cannot be removed';
    lock.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>';
    row.append(img, letter, title, lock);
  } else {
    const editBtn = document.createElement('button');
    editBtn.className = 'manage-item-edit';
    editBtn.title = 'Edit URL';
    editBtn.setAttribute('aria-label', `Edit ${site.title}`);
    editBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    editBtn.addEventListener('click', () => enterEditMode(row, site));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'manage-item-remove';
    removeBtn.title = 'Remove from Sidebar';
    removeBtn.setAttribute('aria-label', `Remove ${site.title}`);
    removeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
    removeBtn.addEventListener('click', async () => {
      await removeSite(site.idx, site.hostname);
      renderManagePanel();
    });

    row.append(img, letter, title, editBtn, removeBtn);
  }

  return row;
}

function enterEditMode(row, site) {
  row.innerHTML = '';
  row.classList.add('manage-item--editing');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'manage-edit-input';
  input.value = site.url;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'manage-edit-save';
  saveBtn.title = 'Save';
  saveBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'manage-edit-cancel';
  cancelBtn.title = 'Cancel';
  cancelBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  const doSave = () => saveEditedSite(site.idx, input.value.trim());
  const doCancel = () => renderManagePanel();

  saveBtn.addEventListener('click', doSave);
  cancelBtn.addEventListener('click', doCancel);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); doSave(); }
    if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
  });

  row.append(input, saveBtn, cancelBtn);
  input.focus();
  input.select();
}

async function saveEditedSite(idx, rawUrl) {
  if (!rawUrl) return;
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return;
  let hostname;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    hostname = parsed.hostname;
  } catch { return; }

  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  const site = quickSites[idx];
  if (!site || site.type === 'separator') return;

  site.url      = normalized;
  site.hostname = hostname;
  site.favicon  = faviconUrl(hostname);

  await chrome.storage.local.set({ quickSites });
  renderSitesBar();
  renderManagePanel();
}

async function resetToDefaultSites() {
  await chrome.storage.local.set({ quickSites: RESET_QUICK_SITES });
  // Destroy all slots except main
  slots.forEach((slot, key) => {
    if (key !== 'main') { slot.iframe.remove(); slots.delete(key); }
  });
  if (activeKey !== 'main') switchToSlot('main', 'https://welovephuket.com');
  renderSitesBar();
  renderManagePanel();
}

btnSettings.addEventListener('click', () => {
  if (managePanel.hidden) openManagePanel();
  else closeManagePanel();
});

btnManageClose.addEventListener('click', closeManagePanel);
btnResetSites.addEventListener('click', resetToDefaultSites);

// ── Context menu ───────────────────────────────────────
const ctxMenu     = document.getElementById('site-ctx-menu');
const ctxNewTab   = document.getElementById('ctx-new-tab');
const ctxRemove   = document.getElementById('ctx-remove');
const ctxSep      = ctxMenu.querySelector('.ctx-sep');
let ctxTarget     = null; // { hostname, idx, url, isDefault }

function openCtxMenu(x, y, hostname, idx, url, isDefault = false) {
  ctxTarget = { hostname, idx, url, isDefault };
  // Default sites cannot be removed — hide those menu items
  ctxSep.style.display    = isDefault ? 'none' : '';
  ctxRemove.style.display = isDefault ? 'none' : '';
  ctxMenu.style.display = 'block';
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  // Clamp so the menu doesn't overflow the panel
  requestAnimationFrame(() => {
    const r = ctxMenu.getBoundingClientRect();
    if (r.right  > window.innerWidth)  ctxMenu.style.left = (x - r.width)  + 'px';
    if (r.bottom > window.innerHeight) ctxMenu.style.top  = (y - r.height) + 'px';
  });
}

function closeCtxMenu() {
  ctxMenu.style.display = 'none';
  ctxTarget = null;
}

ctxNewTab.addEventListener('click', () => {
  if (ctxTarget) chrome.tabs.create({ url: ctxTarget.url });
  closeCtxMenu();
});

ctxRemove.addEventListener('click', () => {
  if (ctxTarget) removeSite(ctxTarget.idx, ctxTarget.hostname);
  closeCtxMenu();
});

// Close context menu on any click outside it
document.addEventListener('click',       (e) => { if (!ctxMenu.contains(e.target)) closeCtxMenu(); });
document.addEventListener('contextmenu', (e) => { if (!ctxMenu.contains(e.target)) closeCtxMenu(); });

async function addCurrentSite() {
  const slot = activeSlot();
  const url = slot?.url;
  if (!url || url === 'about:blank') return;

  let hostname;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;
    hostname = parsed.hostname;
  } catch { return; }

  let title = hostname;
  try { title = slot.iframe.contentWindow.document.title || hostname; } catch {}

  const favicon = faviconUrl(hostname);
  const { quickSites = [] } = await chrome.storage.local.get({ quickSites: [] });
  if (quickSites.some(s => s.hostname === hostname)) return;

  quickSites.push({ url, hostname, title, favicon });
  await chrome.storage.local.set({ quickSites });
  renderSitesBar();
}

btnAddSite.addEventListener('click', addCurrentSite);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.quickSites) {
    renderSitesBar();
    if (!managePanel.hidden) renderManagePanel();
  }
});
