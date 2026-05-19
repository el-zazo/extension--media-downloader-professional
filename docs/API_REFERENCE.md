# API Reference — Media Downloader Professional

This document describes the message-based API used for communication between the background service worker, popup, and content script. All communication uses `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`.

---

## Message Format

Every message is a plain object with at minimum an `action` field:

```typescript
interface Message {
  action: string;       // The action to perform
  tabId?: number;       // Optional tab ID for tab-scoped operations
  url?: string;         // Optional URL for download/operations
  filename?: string;    // Optional filename for downloads
  media?: MediaItem;    // Optional media item payload
}
```

### Media Item Structure

```typescript
interface MediaItem {
  url: string;          // The cleaned URL of the media
  mime: string;         // Content-Type from response headers (e.g. "video/mp4")
  size: number;         // Content-Length in bytes (0 if unknown)
  extension: string;    // Lowercase file extension (e.g. "mp4", "jpg")
  timestamp: number;    // Date.now() when the media was detected
  title: string;        // Always "" (reserved for future use)
  tabId: number;        // The tab ID that originated the request
  isHLS?: boolean;      // Present and true if extension is "m3u8" or MIME contains "mpegurl"
}
```

### Response Format

All handlers return a response object:

```typescript
interface Response {
  // Success responses
  medias?: Record<number, MediaItem[]>;  // For getMedias
  success?: boolean;                       // For clearMedias, downloadMedia
  downloadId?: number;                     // For downloadMedia (Chrome download ID)

  // Error responses
  error?: string;                          // Error message string
}
```

---

## Message Actions

### `getMedias`

Retrieves detected media items from storage. Sent from the popup to the background script.

**Sender:** Popup → Background

**Message:**
```javascript
{
  action: "getMedias",
  tabId?: number   // If provided, only returns media for this tab
}
```

**Response:**
```javascript
{
  medias: {
    [tabId]: [MediaItem, MediaItem, ...],
    ...
  }
}
```

When `tabId` is provided, the response contains only that tab's media:
```javascript
{
  medias: {
    42: [MediaItem, MediaItem, ...]
  }
}
```

When `tabId` is omitted, the response contains all tabs' media.

---

### `downloadMedia`

Initiates a file download via the Chrome downloads API. Sent from the popup or content script to the background script.

**Sender:** Popup / Content Script → Background

**Message:**
```javascript
{
  action: "downloadMedia",
  url: string,          // Required: the URL to download
  filename?: string     // Optional: suggested filename (e.g. "video_1.mp4")
}
```

**Response (success):**
```javascript
{
  success: true,
  downloadId: number    // Chrome-assigned download ID
}
```

**Response (error):**
```javascript
{
  success: false,
  error: "Missing URL"  // or the actual error message
}
```

**Behavior:**
- Calls `chrome.downloads.download()` with `saveAs: true`, which prompts the user with a save dialog.
- If `filename` is empty or not provided, Chrome will determine the filename from the URL.

---

### `clearMedias`

Clears all detected media for a specific tab. Sent from the popup or content script to the background script.

**Sender:** Popup / Content Script → Background

**Message:**
```javascript
{
  action: "clearMedias",
  tabId?: number   // Tab ID to clear. Falls back to sender.tab.id if omitted.
}
```

**Response (success):**
```javascript
{
  success: true
}
```

**Response (error):**
```javascript
{
  success: false,
  error: "Missing tabId"   // or the actual error message
}
```

**Side effects:**
1. Removes the tab's media array from `chrome.storage.local` under the `"medias"` key.
2. Removes those URLs from the in-memory deduplication `Set` (`detectedMedias`) so they can be re-detected on other tabs.
3. Persists the updated dedup cache to storage.
4. Updates the badge count to 0 for the tab.
5. Sends a `"clearMedias"` message to the content script for that tab (via `notifyTabClear`).

---

## Content Script Messages

These messages are sent **from the background script to the content script** using `chrome.tabs.sendMessage(tabId, message)`.

### `addMedia`

Notifies the content script that a new media item was detected.

**Direction:** Background → Content Script

**Message:**
```javascript
{
  action: "addMedia",
  media: MediaItem
}
```

**Behavior in content script:**
- Adds the media item to the local `detectedMedias` Map.
- If the in-page panel is visible, creates a new media item element and appends it.
- Reapplies the current filter.
- If the panel does not exist yet, initializes it.

---

### `clearMedias` (content script)

Notifies the content script that media for the current tab should be cleared (e.g. on navigation, tab close from background, or clear from popup).

**Direction:** Background → Content Script

**Message:**
```javascript
{
  action: "clearMedias"
}
```

**Behavior in content script:**
- Clears the local `detectedMedias` Map.
- Re-renders the panel (shows "Scanning for media..." empty state).

---

### `showPanel`

Tells the content script to show the in-page media panel. Sent when the user clicks "Show in page" in the popup.

**Direction:** Popup → Content Script (via `chrome.tabs.sendMessage`)

**Message:**
```javascript
{
  action: "showPanel"
}
```

**Behavior in content script:**
- Creates or shows the in-page media panel.
- Loads and displays all currently detected media.

---

### `rescanPage`

Tells the content script to rescan the page for media. Sent when the user clicks "Refresh" in the popup.

**Direction:** Popup → Content Script (via `chrome.tabs.sendMessage`)

**Message:**
```javascript
{
  action: "rescanPage"
}
```

**Behavior in content script:**
- The content script does not perform a DOM scan itself. Media detection is handled by the background script's `webRequest` listener. This action exists as a hook for future DOM-based scanning but currently triggers a re-render.

---

## Event Listeners (Background Script)

### `chrome.webRequest.onHeadersReceived`

```javascript
chrome.webRequest.onHeadersReceived.addListener(
  MediaDetector.checkObject,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);
```

Fires for every network request. `MediaDetector.checkObject` processes the response headers to identify media files based on MIME type and file extension.

### `chrome.tabs.onRemoved`

```javascript
chrome.tabs.onRemoved.addListener((tabId) => {
  MediaDetector.clearTabMedias(tabId);
});
```

Clears all stored media and dedup cache entries when a tab is closed. Does not notify the content script (tab is already gone).

### `chrome.tabs.onUpdated`

```javascript
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    MediaDetector.clearTabMedias(tabId);
    MediaDetector.notifyTabClear(tabId);
  }
});
```

Clears media when a tab navigates to a new URL. Notifies the content script so it can reset its state.

### `chrome.tabs.onActivated`

```javascript
chrome.tabs.onActivated.addListener((activeInfo) => {
  refreshBadgeForTab(activeInfo.tabId);
});
```

Updates the badge when the user switches to a different tab.

### `chrome.runtime.onSuspend`

```javascript
chrome.runtime.onSuspend.addListener(flush);
```

Flushes any pending dedup cache writes before the MV3 service worker is terminated.

---

## Error Handling

All message handlers and event listeners use try/catch with the shared `utils.log()` function. Errors are logged to the console with a `[Media Downloader]` prefix and ISO timestamp. Error responses follow the `{ error: string }` format.

Common error scenarios:
- **Tab not ready:** `chrome.tabs.sendMessage` fails when the content script hasn't loaded yet. This is expected and logged at `"info"` level.
- **Tab already closed:** Badge updates fail for closed tabs. Caught silently.
- **Missing tabId:** The `clearMedias` action returns `{ success: false, error: "Missing tabId" }`.
- **Missing URL:** The `downloadMedia` action returns `{ success: false, error: "Missing URL" }`.
- **Unknown action:** Returns `{ error: "Unknown action: <action>" }`.
