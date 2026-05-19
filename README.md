# Media Downloader Professional

> A Chrome extension (Manifest V3) that detects, lists, filters, sorts, previews, and downloads all media on any webpage.

**Version:** 7.0.0  
**Manifest Version:** 3  
**Author:** [el-zazo](https://elzazo.netlify.app)

---

## Features

- **Automatic Media Detection** — Monitors web requests in real time and identifies media files by MIME type and file extension (video, audio, and image).
- **Badge Counter** — Shows the number of detected media items on the extension icon, per tab (displays "999+" for counts above 999).
- **In-Page Media Panel** — A draggable, collapsible overlay panel injected directly into the webpage for quick access to detected media.
- **Popup Interface** — A full-featured popup with two tabs: **Detected Media** and **Saved Media**, each with independent filter and sort controls.
- **Multi-Select Filters** — Filter by media category (Videos, Images, Audio) and drill down to specific file extensions within each category.
- **Sorting** — Sort detected and saved media by date (newest/oldest), size (largest/smallest), or type (A-Z / Z-A). Sort preference is persisted.
- **Media Preview/Playback** — Inline preview for images, audio playback, and video playback directly in both the in-page panel and the popup.
- **Copy URL** — One-click copy of any media URL to the clipboard (with fallback for older browsers).
- **Download** — Download any detected or saved media with a suggested filename via the Chrome downloads API.
- **Save for Later** — Save media items to a persistent library that survives page navigation and browser restarts.
- **Custom Filename on Save** — A modal dialog lets you customize the filename before saving media to your library.
- **Persistent State** — Filter selections, sort options, and saved media are stored in `chrome.storage.local` and survive session restarts.
- **Deduplication Cache** — An in-memory `Set` backed by `chrome.storage.local` ensures the same URL is not processed twice. Cache is restored on service worker restart and cleaned up on tab close/navigation.
- **Draggable Panel** — The in-page panel can be repositioned by dragging the header. Viewport bounds are enforced automatically.

---

## Installation

### From Source (Development)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the root directory containing `manifest.json` (the `extension--media-downloader-professional` folder).

### From Chrome Web Store

*Not yet published. Use the development installation method above.*

---

## Project Structure

```
extension--media-downloader-professional/
├── manifest.json                  # Extension manifest (MV3)
├── icons/
│   └── icon.png                   # Extension icon (used for 16/48/128px)
├── background/
│   └── background.js              # Service worker: media detection, badge, message handling
├── content/
│   ├── content-script.js          # In-page panel: UI, filters, preview, drag
│   └── content-styles.css         # Styles for the in-page panel overlay
└── popup/
    ├── popup.html                 # Popup HTML: tabs, filter chips, modals
    ├── popup.css                  # Popup styles
    ├── popup.js                   # Popup logic: filters, sort, save, preview
    ├── constants.js               # Shared constants (extensions, sort options, actions)
    ├── icons.js                   # SVG icon definitions
    ├── utils.js                   # Utility class (formatFileSize, clipboard, etc.)
    └── ui.js                      # UI manager (notifications, modal show/hide)
```

---

## Quick Start

1. Install the extension (see [Installation](#installation)).
2. Navigate to any webpage that contains media (videos, images, or audio).
3. The extension badge will update to show the count of detected media items.
4. Click the extension icon to open the popup, or use the in-page panel that appears automatically.
5. Use filter chips to narrow results by category or specific extension.
6. Use the sort dropdown to reorder results.
7. Click the **Preview** button to play/view a media item inline.
8. Click **Download** to save a file, or **Save** to add it to your persistent library.

---

## Permissions

| Permission | Reason |
|---|---|
| `webRequest` | Monitor network requests to detect media files by response headers. |
| `storage` | Persist filter state, sort options, saved media, and the deduplication cache. |
| `tabs` | Access tab IDs for per-tab media storage and badge updates. |
| `activeTab` | Interact with the currently active tab for media operations. |
| `downloads` | Initiate file downloads via the Chrome downloads API. |
| `<all_urls>` (host) | Monitor requests and inject content scripts on all pages. |

---

## Documentation Index

| Document | Description |
|---|---|
| [API Reference](docs/API_REFERENCE.md) | Message actions, message formats, and inter-component communication |
| [Configuration](docs/CONFIGURATION.md) | Constants, storage keys, default values, and supported media types |
| [Architecture](docs/ARCHITECTURE.md) | Component diagram, data flow, and service worker lifecycle |
| [Content Script Guide](docs/CONTENT_SCRIPT_GUIDE.md) | In-page panel features, filter system, drag, preview |
| [Popup Guide](docs/POPUP_GUIDE.md) | Popup tabs, save media, filter/sort controls, modals |

---

## Browser Compatibility

- **Chrome 110+** (Manifest V3 support required)
- **Edge 110+** (Chromium-based, MV3 support)

---

## License

This project is proprietary software. All rights reserved.
