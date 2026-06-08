# Jane Maverick's Sidebar

A Chrome / Edge extension that adds a persistent sidebar panel for browsing any website — with pinned quick-launch icons, per-tab independent state, and a persistent frame pool that keeps audio and video running when you switch between sites.

---

## Installation

> Requires Chrome 114+ or Microsoft Edge 114+.

1. Clone or download this repository.
2. Open Chrome → `chrome://extensions`  
   *or* Edge → `edge://extensions`
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `sidebar/` folder.
5. The extension icon appears in the toolbar. Click it to open the sidebar.

To update after pulling new changes, go back to the extensions page and click the **↺ refresh** icon on the extension card.

---

## Features

### Navigation
- **Address bar** — enter any URL or search term; auto-prefixes `https://`, falls back to a Google search for plain text
- **Back / Forward** — maintains its own navigation history stack per site slot, independent of the main tab
- **Reload** — reloads the current page inside the sidebar
- **Open in new tab** — pops the current sidebar URL into a full browser tab

### Quick-Sites Icon Bar
A permanent column of favicon icons sits on the right edge of the sidebar.

| Action | Result |
|---|---|
| Right-click any page → **Add to Sidebar** | Adds that site's icon to the bar |
| Click **+** at the bottom of the bar | Adds the page currently loaded inside the sidebar |
| Click an icon | Switches the sidebar to that site |
| Hover an icon (when running) → **×** | Force-closes that site's frame (stops audio/video) |
| Right-click an icon | Context menu: open in new tab or remove |
| Active icon | Blue left-border when the current URL matches |
| Running icon | Green dot when an iframe slot is alive in the background |
| Favicon unavailable | Falls back to a colored letter avatar |

### Persistent Frame Pool
Each pinned site gets its own hidden `<iframe>` slot. Switching to another site hides the old frame rather than destroying it — so **YouTube music keeps playing** while you browse elsewhere.

### Per-Tab State
Each browser tab has its own last-visited URL in the sidebar. Switching tabs restores the correct URL without affecting other tabs.

### Manage Sites
Click the **⚙ gear icon** in the toolbar to open the Manage Sites panel:

| Element | Behaviour |
|---|---|
| **Default Sites** section | Always shown; cannot be reordered or removed |
| Eye icon on default site row | Toggles the default site's visibility in the pinned bar (preference persists) |
| Lock icon on default site row | Indicates the site cannot be removed |
| User-added sites | Edit URL (pencil), remove (trash), or drag to reorder via the ⠿ handle |
| **+ Add Separator** | Inserts a draggable separator between groups |
| **Reset to default sites** | Restores the curated 14-site preset (WhatsApp · Messenger / YouTube · YouTube Music / Facebook · Instagram · TikTok · X · LinkedIn / Reddit · Blognone) |

### Site Separators
Thin visual dividers group related icons in the pinned bar. Add, remove, or drag them freely in Manage Sites.

### Embedding Any Website
- Automatically removes `X-Frame-Options` and `Content-Security-Policy` response headers so sites that normally block embedding load correctly
- Overrides `Sec-Fetch-*` request headers (Dest, Mode, Site, User) so servers like Google do not detect the iframe context and return 403

### Favicon Reliability
Favicons are fetched via Google's `faviconV2` API (which pulls directly from each site), with a `hostname/favicon.ico` fallback, then a colored letter avatar as a final fallback. This ensures icons display correctly for web apps (WhatsApp, Gmail, etc.) that the older `s2/favicons` API cannot serve.

---

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `sidePanel` | Open and control the browser side panel |
| `storage` | Persist last URL per tab and the quick-sites list |
| `tabs` | Read active tab ID for per-tab URL state; open links in new tabs |
| `declarativeNetRequest` + `declarativeNetRequestWithHostAccess` | Remove `X-Frame-Options` / `CSP` response headers; override `Sec-Fetch-*` request headers |
| `contextMenus` | Add the "Add to Sidebar" right-click menu item |
| `host_permissions: <all_urls>` | Load any website inside the sidebar iframe |

---

## Project Structure

```
sidebar/
├── manifest.json               # Extension manifest (MV3)
├── background.js               # Service worker — panel behavior, context menu, header-stripping rules
├── sidepanel/
│   ├── sidepanel.html          # Sidebar UI markup
│   ├── sidepanel.css           # Styles (light + dark mode via prefers-color-scheme)
│   └── sidepanel.js            # Navigation, frame pool, quick-sites, manage panel logic
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── generate_icons.py           # Helper script to regenerate PNG icons
└── .claude/
    └── settings.json           # Claude Code hooks (auto-commit on file save)
```

---

## Changelog

### v1.2.0 — 2026-06-08

- **Default site visibility toggle** — eye icon on the We Love Phuket row in Manage Sites shows/hides it in the pinned bar; preference persists across restarts
- **Drag-to-reorder fix** — corrected an async race where `dragend` cleared the source index before the drop handler could use it, causing the wrong item to move
- **Separator spacing** — increased padding around separator lines in the pinned bar for better visual grouping
- **Inline URL editing** — pencil button on each user site in Manage Sites lets you edit the full URL in place
- **Add / remove separators** in Manage Sites — separators are draggable and can be inserted or deleted freely

### v1.1.0 — 2026-06-08

- **Manage Sites panel** — gear icon in toolbar opens an overlay listing all pinned sites; individual remove buttons per site; We Love Phuket default site is locked (cannot be removed)
- **Reset to default sites** — one-click button restores a curated 14-site preset with group separators
- **Site separators** — visual dividers in the icon bar and manage panel group related sites
- **Default homepage** changed to `https://welovephuket.com`
- **Removed** mobile view toggle and pin sidebar buttons to simplify the toolbar
- **Favicon fix** — switched from `s2/favicons` to `faviconV2` API with a two-stage fallback (`favicon.ico` → letter avatar); fixes blank icons for WhatsApp, Messenger, and similar web apps
- **Messenger** URL updated to `https://www.messenger.com`

### v1.0.0 — 2026-06-08

**Initial release**

- Side panel with address bar, back / forward / refresh navigation
- Persistent frame pool — switching sites keeps audio/video alive (`visibility: hidden`, not `display: none`)
- Per-tab independent sidebar URL state, cleaned up when the tab closes
- Quick-sites icon bar (right column) with favicons, letter-avatar fallback, and active-state indicator
- Green running-dot indicator and amber force-close button on hovered running slots
- Right-click context menu on icons: open in new tab, remove from sidebar
- Right-click any browser page → "Add to Sidebar" context menu item
- `+` button to add the currently loaded sidebar page
- `X-Frame-Options`, `CSP`, and `Sec-Fetch-*` bypass so most sites load without embedding restrictions
- We Love Phuket as the pinned default unremovable site
- Light and dark mode via `prefers-color-scheme`
- All state persists via `chrome.storage.local`
