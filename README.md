# Sidebar Browser

A Chrome / Edge extension that adds a persistent sidebar panel for browsing any website — with mobile view simulation, pinned quick-launch icons, and zero interference with your main browsing session.

---

## Installation

> Requires Chrome 114+ or Microsoft Edge 114+.

1. Clone or download this repository to your machine.
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
- **Back / Forward** — maintains its own navigation history stack independent of your main tab
- **Reload** — reloads the current page inside the sidebar

### Mobile View
- Toggle the **📱 mobile view** button to render the site at **390 × 844 px** (iPhone 14 Pro logical resolution)
- Sends a real **iPhone User-Agent** header via `declarativeNetRequest` so sites serve their mobile layout
- A phone-shell border is rendered around the viewport with a dark surround
- Toggle off to return to normal desktop view instantly

### Pin Sidebar
- Click the **📌 pin** button to keep the sidebar open automatically on every tab switch
- When pinned, switching to any new tab re-opens the panel without any extra clicks
- Pin state persists across browser restarts

### Quick-Sites Icon Bar
A permanent row of favicon icons sits between the address bar and the browser frame.

| Action | Result |
|---|---|
| Right-click any page → **Add to Sidebar** | Adds that site's icon to the bar |
| Click **+** in the bar | Adds the page currently loaded *inside the sidebar* |
| Click an icon | Navigates the sidebar to that site |
| Hover an icon → click **×** | Removes it from the bar |
| Active icon | Shows a blue underline when the sidebar's current URL matches |
| Favicon unavailable | Falls back to a colored letter avatar (color is consistent per domain) |

### Open in New Tab
- Click **↗** to pop the current sidebar URL into a full browser tab

### Embedding Any Website
- Automatically removes `X-Frame-Options` and `Content-Security-Policy` response headers for requests made through the sidebar so that sites that normally block embedding load correctly

### Clean Resource Release
- When the sidebar panel is closed, the embedded iframe is cleared immediately (`about:blank`) so audio, video, network connections, and CPU activity stop before the process exits in Chrome Task Manager

---

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `sidePanel` | Open and control the browser side panel |
| `storage` | Persist last URL, mobile mode, pin state, and quick-sites list |
| `tabs` | Open links in new tabs; auto-open panel on tab switch when pinned |
| `declarativeNetRequest` + `declarativeNetRequestWithHostAccess` | Remove `X-Frame-Options` / `CSP` headers; inject iPhone User-Agent |
| `contextMenus` | Add the "Add to Sidebar" right-click menu item |
| `host_permissions: <all_urls>` | Load any website inside the sidebar iframe |

---

## Project Structure

```
sidebar/
├── manifest.json               # Extension manifest (MV3)
├── background.js               # Service worker — panel behavior, context menu, UA rules
├── sidepanel/
│   ├── sidepanel.html          # Sidebar UI markup
│   ├── sidepanel.css           # Styles (light + dark mode via prefers-color-scheme)
│   └── sidepanel.js            # Navigation, mobile view, pin, quick-sites logic
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

### v1.0.0 — 2026-06-08

**Initial release**

- Side panel with address bar, back / forward / refresh navigation
- Mobile view toggle (390 × 844 viewport + iPhone 17 UA via `declarativeNetRequest`)
- Pin sidebar — auto-opens on every tab switch, persists across restarts
- Quick-sites icon bar with favicons, letter-avatar fallback, and active-state underline
- Right-click context menu to add any browser page to the quick-sites bar
- `+` button to add the page currently loaded inside the sidebar
- `X-Frame-Options` and `CSP` bypass so most sites load without embedding restrictions
- `pagehide` cleanup hook — clears the iframe on panel close for a clean Task Manager exit
- Light and dark mode via `prefers-color-scheme`
- All state (last URL, mobile mode, pin, quick-sites list) persists via `chrome.storage.local`
