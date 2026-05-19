# Architecture — Media Downloader Professional

This document describes the extension's component architecture, data flow, and the service worker lifecycle management.

---

## Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Browser                       │
│                                                         │
│  ┌────────────────┐   ┌──────────────────────────────┐  │
│  │   Background   │   │        Web Page (Tab)        │  │
│  │   Service      │   │                              │  │
│  │   Worker       │   │  ┌────────────────────────┐  │  │
│  │                │   │  │   Content Script       │  │  │
│  │  ┌───────────┐ │   │  │                        │  │  │
│  │  │ MediaDet- │ │   │  │  ┌──────────────────┐  │  │  │
│  │  │ ector     │ │   │  │  │  In-Page Panel   │  │  │  │
│  │  │           │ │   │  │  │  (draggable,     │  │  │  │
│  │  ├───────────┤ │   │  │  │   collapsible)   │  │  │  │
│  │  │ Message-  │ │   │  │  └──────────────────┘  │  │  │
│  │  │ Handler   │ │   │  └────────────────────────┘  │  │
│  │  ├───────────┤ │   └──────────────────────────────┘  │
│  │  │ Badge     │ │                                     │
│  │  │ Manager   │ │   ┌──────────────────────────────┐  │
│  │  ├───────────┤ │   │        Popup Window          │  │
│  │  │ Dedup     │ │   │                              │  │
│  │  │ Cache     │ │   │  ┌──────────┐ ┌───────────┐  │  │
│  │  └───────────┘ │   │  │ Detected │ │  Saved    │  │  │
│  └───────┬────────┘   │  │ Media    │ │  Media    │  │  │
│          │            │  │ Tab      │ │  Tab      │  │  │
│          │            │  └──────────┘ └───────────┘  │  │
│          │            └──────────────┬───────────────┘  │
│          │                           │                  │
│          ▼                           ▼                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │              chrome.storage.local                │   │
│  │  • medias (per-tab)                              │   │
│  │  • detectedMediaCache (dedup)                    │   │
│  │  • filterState / sortOption (popup)              │   │
│  │  • savedFilterState / savedSortOption            │   │
│  │  • savedMedia                                    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Background Service Worker (`background/background.js`)

The background script is the central hub for media detection and state management. It runs as a Manifest V3 service worker, which means Chrome may terminate it at any time when idle.

**Sub-modules:**

| Module | Responsibility |
|---|---|
| `MediaDetector` | Processes web requests, validates media, creates `MediaItem` objects, manages the dedup cache, stores media in `chrome.storage.local`, notifies the content script. |
| `MessageHandler` | Routes incoming messages (`getMedias`, `downloadMedia`, `clearMedias`) to the appropriate handler and returns responses. |
| `utils` | URL parsing, header extraction, error formatting, timestamped logging. |
| Badge functions (`updateBadge`, `refreshBadgeForTab`) | Update the extension icon badge text and color per tab. |

**Initialization sequence:**
1. `MediaDetector.restoreCache()` — Loads the dedup cache from `chrome.storage.local` into the in-memory `Set`.
2. `initializeExtension()` — Registers all Chrome API event listeners.
3. Sets the initial badge for the currently active tab.

### Content Script (`content/content-script.js` + `content-styles.css`)

Injected into every webpage. Manages the in-page media panel overlay.

**Key responsibilities:**
- Maintains a local `Map<string, MediaItem>` (`detectedMedias`) synced with the background.
- Creates and manages the draggable, collapsible panel UI.
- Handles multi-select filter chips with dropdowns for extension-level filtering.
- Implements sort functionality (6 sort options).
- Provides inline media preview/playback (video, audio, image).
- Handles the "Clear All" action with optimistic local clearing + background notification.

**Panel lifecycle:**
1. Panel is created on first `addMedia` message or when explicitly shown.
2. Panel can be minimized (collapsed to header only) or closed entirely.
3. Closing the panel sets `mediaPanel = null` and `isInitialized = false`, but `detectedMedias` is preserved.

### Popup (`popup/popup.html` + `popup.js` + `popup.css` + supporting modules)

The browser action popup with two tabs and full filter/sort/preview capabilities.

**Modules:**

| Module | Responsibility |
|---|---|
| `popup.js` | Main orchestrator: filter/sort state, data loading, tab switching, media operations (save, remove, download, preview). |
| `constants.js` | Shared constants: extensions, sort options, storage keys, message actions. |
| `icons.js` | SVG icon templates used in media item rendering. |
| `utils.js` | `Utils` class with `formatFileSize`, `formatDateTime`, `copyToClipboard`, `getFileExtension`, `generateUniqueId`, `safeJsonParse`. |
| `ui.js` | `UIManager` class with `showNotification`, `toggleElementVisibility`, `updateElementText`, `showConfirmation`, `showModal`, `hideModal`. |

---

## Data Flow

### 1. Media Detection Flow

```
Web Page loads resources
        │
        ▼
chrome.webRequest.onHeadersReceived fires
        │
        ▼
MediaDetector.checkObject(details)
        │
        ├── Validate tabId > 0
        ├── Clean URL via utils.cleanUrl()
        ├── Check dedup cache (detectedMedias Set)
        ├── Extract Content-Type and Content-Length from headers
        ├── Skip if Content-Length < MIN_FILE_SIZE (10KB)
        ├── Validate via isValidMedia() (extension OR MIME match)
        │
        ▼ (if valid & new)
MediaDetector.createMediaItem()
        │
        ├── Sets isHLS = true for m3u8/mpegurl
        │
        ▼
MediaDetector.addToMediaCache(url)
        │
        ├── Adds to in-memory Set
        ├── Evicts oldest 500 if size > 1000
        ├── Debounced persist to chrome.storage.local (2s)
        │
        ▼
MediaDetector.notifyContentScript(tabId, mediaItem)
        │  └── chrome.tabs.sendMessage({ action: "addMedia", media })
        │
        ▼
MediaDetector.storeMediaItem(tabId, mediaItem, url)
        │  └── chrome.storage.local.set({ medias: { [tabId]: [...] } })
        │
        ▼
refreshBadgeForTab(tabId)
        │  └── chrome.action.setBadgeText / setBadgeBackgroundColor
        │
        ▼
Content script renders new item in panel (if visible)
```

### 2. Popup Data Loading Flow

```
User opens popup
        │
        ▼
DOMContentLoaded event
        │
        ├── loadFilterState() — restores filter/sort from storage
        ├── setupFilterChips("detected") — populates extension checkboxes
        ├── setupFilterChips("saved") — populates extension checkboxes
        ├── updateFilterUI("detected") — syncs visual state
        ├── updateFilterUI("saved") — syncs visual state
        ├── Restore sort dropdown values
        │
        ▼
loadMedias()
        │
        ├── chrome.tabs.query() — get current tab ID
        ├── chrome.runtime.sendMessage({ action: "getMedias", tabId })
        │
        ▼
Background: MessageHandler.handleGetMedias()
        │
        ├── chrome.storage.local.get(["medias"])
        ├── Filter by tabId if provided
        │
        ▼
Popup: applyFilter(tabMedias)
        │
        ├── Filter by matchesFilter()
        ├── Sort by sortMedias()
        ├── Render media items to DOM
        ├── Update chip counts
        └── Update total count text
```

### 3. Save Media Flow

```
User clicks "Save" on a detected media item
        │
        ▼
saveMedia(url, filename)
        │
        ├── Show save modal with URL and suggested filename
        ├── User can edit filename
        │
        ▼
User clicks "Save" in modal
        │
        ▼
addToSavedMedia(media)
        │
        ├── chrome.storage.local.get(["savedMedia"])
        ├── Check for duplicates by URL
        ├── If not duplicate: push to array, save back to storage
        └── ui.showNotification("Media saved to library")
```

### 4. Clear Media Flow (Content Script)

```
User clicks "Clear All" in the in-page panel
        │
        ▼
confirm("Are you sure?")
        │
        ▼ (confirmed)
detectedMedias.clear()           ← Immediate local clear
renderAllMediaToPanel()          ← Instant UI update
showNotification("All media cleared")
        │
        ▼
chrome.runtime.sendMessage({ action: "clearMedias" })  ← Fire-and-forget
        │
        ▼
Background: MessageHandler.handleClearMedias()
        │
        ├── MediaDetector.clearTabMedias(tabId)
        │     ├── Remove from storage
        │     ├── Remove URLs from dedup Set
        │     ├── Persist updated dedup cache
        │     └── Update badge to 0
        │
        └── MediaDetector.notifyTabClear(tabId)
              └── chrome.tabs.sendMessage({ action: "clearMedias" })
                    └── Content script handler is a no-op (already cleared locally)
```

This optimistic clearing pattern avoids race conditions where the content script's own `onMessage` listener would intercept the `clearMedias` message sent back from the background.

---

## Service Worker Lifecycle (MV3)

Chrome may terminate the MV3 service worker after ~30 seconds of inactivity. The extension handles this with two strategies:

### 1. Dedup Cache Persistence

The `detectedMedias` `Set` (in-memory) is persisted to `chrome.storage.local` under the key `"detectedMediaCache"` as a JSON array. The persistence uses a **debounce pattern** (2-second delay) to avoid excessive writes:

```
addToMediaCache(url)
        │
        ▼
detectedMedias.add(url)
persistCache()  ← debounced (2000ms)
        │
        ├── Set isDirty = true
        ├── Clear any pending timeout
        └── setTimeout(doPersist, 2000)
                │
                └── chrome.storage.local.set({ detectedMediaCache: [...] })
```

### 2. Flush on Suspend

A `chrome.runtime.onSuspend` listener flushes any pending cache writes immediately before the service worker is terminated:

```
chrome.runtime.onSuspend.addListener(flush)
        │
        ▼
flush()
        │
        ├── Clear pending timeout
        └── if isDirty: doPersist()  ← Immediate write
```

### 3. Cache Restoration

On service worker startup, `restoreCache()` loads the persisted array back into the in-memory `Set`:

```
MediaDetector.restoreCache()
        │
        ├── chrome.storage.local.get(["detectedMediaCache"])
        ├── For each URL: detectedMedias.add(url)
        └── utils.log("Restored N URLs from cache storage")
```

This happens **before** `initializeExtension()`, ensuring the dedup cache is available before any web request listener fires.

---

## CSS Namespacing

All content script CSS classes use the `vdp-` prefix (e.g., `.vdp-panel`, `.vdp-media-item`, `.vdp-filter-bar`) to avoid conflicts with host page styles. The popup CSS does **not** use this prefix since it runs in an isolated iframe context.

The content script also sets:
- `z-index: 2147483647` (max 32-bit integer) on the panel and overlay elements to ensure they appear above all page content.
- `direction: ltr` and `text-align: start` on the panel to override RTL page layouts.
- `font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif` to maintain a consistent appearance regardless of the host page's typography.
