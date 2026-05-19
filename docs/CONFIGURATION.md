# Configuration — Media Downloader Professional

This document describes all configurable constants, storage keys, and default values used across the extension. Constants are defined in both `popup/constants.js` (shared by popup modules) and directly in `background/background.js` and `content/content-script.js`.

---

## Supported Media Types

### Image Extensions

Defined in: `popup/constants.js` (`IMAGE_EXTENSIONS`) and `background/background.js` (`IMAGE_EXTENSIONS`)

```javascript
["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]
```

These extensions are used to identify image files both by URL extension and by the `image/` MIME type prefix.

### Audio Extensions

Defined in: `popup/constants.js` (`AUDIO_EXTENSIONS`) and `background/background.js` (`AUDIO_EXTENSIONS`)

```javascript
["mp3", "aac", "wav", "ogg", "flac"]
```

### Video Extensions

Defined in: `popup/constants.js` (`VIDEO_EXTENSIONS`)

```javascript
["m3u8", "mp4", "mov", "m4v", "webm", "mpg", "m4s", "ts", "flv", "avi", "mkv"]
```

Defined in: `background/background.js` (`VIDEO_EXTENSIONS`)

```javascript
["mp4", "mov", "m4v", "webm", "mpg", "flv", "avi", "mkv", "ts", "m3u8", "m4s"]
```

> **Note:** The order differs between files but the set of extensions is identical. `m3u8` and `m4s` are included for HLS streaming and DASH segment support.

### All Media Extensions

```javascript
[...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]
```

This combined array is used for fast extension lookups in the deduplication and filtering logic.

### Media MIME Types (Background Only)

Defined in: `background/background.js` (`MEDIA_MIME_TYPES`)

```javascript
[
  "video/",
  "audio/",
  "application/x-mpegurl",
  "application/vnd.apple.mpegurl",
  "image/"
]
```

A request is considered valid media if its URL extension matches `MEDIA_EXTENSIONS` **or** its Content-Type header starts with one of these MIME type prefixes. The two `mpegurl` entries specifically target HLS manifests.

---

## Background Script Constants

All defined in `background/background.js`:

| Constant | Value | Description |
|---|---|---|
| `MIN_FILE_SIZE` | `10240` (10 KB) | Files with a known Content-Length below this threshold are skipped. Prevents tracking pixels and tiny icons from cluttering the list. |
| `MAX_CACHED_URLS` | `1000` | Maximum number of URLs kept in the in-memory deduplication `Set`. |
| `CLEANUP_THRESHOLD` | `500` | Number of oldest URLs removed when the cache exceeds `MAX_CACHED_URLS`. |
| `BADGE_COLOR` | `"#0047ab"` | The extension icon badge background color (cobalt blue). |
| `CACHE_STORAGE_KEY` | `"detectedMediaCache"` | Storage key for persisting the dedup cache array to `chrome.storage.local`. |

---

## Content Script Constants

All defined in `content/content-script.js`:

| Constant | Value | Description |
|---|---|---|
| `CONFIG.PANEL_WIDTH` | `380` | Default panel width in pixels. |
| `CONFIG.PANEL_MAX_HEIGHT` | `500` | Maximum panel height in pixels. |
| `CONFIG.PANEL_POSITION` | `{ top: 20, right: 20 }` | Default panel position (top-right corner). |
| `CONFIG.NOTIFICATION_TIMEOUT` | `2000` | Duration in ms for the "URL copied!" notification. |
| `CONFIG.URL_CHECK_INTERVAL` | `1000` | Interval in ms for URL change detection (unused in current code). |
| `CONFIG.MAX_URL_LENGTH` | `60` | Truncation length for displayed URLs. URLs longer than this show "..." suffix. |
| `CONFIG.FILTER_STORAGE_KEY` | `"filterState"` | Storage key for content script filter state persistence. |
| `CONFIG.SORT_STORAGE_KEY` | `"sortOption"` | Storage key for content script sort option persistence. |

### Content Script Media Types

The content script defines its own `MEDIA_TYPES` object (independent from popup constants):

```javascript
const MEDIA_TYPES = {
  IMAGE: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"],
  AUDIO: ["mp3", "wav", "ogg", "flac", "aac"],
  VIDEO: ["mp4", "mov", "m4v", "webm", "mpg", "flv", "avi", "mkv", "ts", "m3u8", "m4s"],
};
```

---

## Popup Constants

Defined in `popup/constants.js`:

### Default Values

| Constant | Value | Description |
|---|---|---|
| `NOTIFICATION_DURATION` | `2000` | Toast notification display duration in ms. |
| `DEFAULT_FILTER` | `"all"` | Default filter value (unused in current multi-filter system). |
| `DEFAULT_TAB` | `"detected"` | Default active tab on popup open. |
| `DEFAULT_SORT` | `SORT_OPTIONS.DATE_DESC` | Default sort option (newest first). |

### Sort Options

```javascript
const SORT_OPTIONS = {
  DATE_DESC: "date_desc",   // Newest first
  DATE_ASC: "date_asc",     // Oldest first
  SIZE_DESC: "size_desc",   // Largest first
  SIZE_ASC: "size_asc",     // Smallest first
  TYPE_ASC: "type_asc",     // Type A-Z
  TYPE_DESC: "type_desc",   // Type Z-A
};
```

These are shared between the detected media and saved media tabs. Each tab maintains its own current sort value independently.

### Storage Keys

```javascript
const STORAGE_KEYS = {
  SAVED_MEDIA: "savedMedia",             // Array of saved MediaItem objects
  FILTER_STATE: "filterState",           // Detected media filter state
  SORT_OPTION: "sortOption",             // Detected media sort option
  SAVED_FILTER_STATE: "savedFilterState", // Saved media filter state
  SAVED_SORT_OPTION: "savedSortOption",  // Saved media sort option
};
```

All keys are stored in `chrome.storage.local`.

### Message Actions

```javascript
const ACTIONS = {
  GET_MEDIAS: "getMedias",
  DOWNLOAD_MEDIA: "downloadMedia",
  SHOW_PANEL: "showPanel",
  RESCAN_PAGE: "rescanPage",
  CLEAR_MEDIAS: "clearMedias",
};
```

See [API Reference](API_REFERENCE.md) for detailed message formats.

---

## Storage Layout

The extension uses `chrome.storage.local` with the following keys:

| Key | Type | Description |
|---|---|---|
| `"medias"` | `Record<number, MediaItem[]>` | Per-tab arrays of detected media items. Keyed by tab ID. |
| `"detectedMediaCache"` | `string[]` | Array of cleaned URLs for the deduplication cache. Restored on service worker restart. |
| `"filterState"` | `{ videos: string[], images: string[], audio: string[] }` | Detected media filter selections. Empty arrays = show all. |
| `"sortOption"` | `string` | Current sort option for detected media. One of `SORT_OPTIONS` values. |
| `"savedFilterState"` | `{ videos: string[], images: string[], audio: string[] }` | Saved media filter selections. |
| `"savedSortOption"` | `string` | Current sort option for saved media. |
| `"savedMedia"` | `MediaItem[]` | Array of user-saved media items (persists across sessions). |
| `"filterState"` (content) | `{ videos: string[], images: string[], audio: string[] }` | Content script filter state (separate from popup). |
| `"sortOption"` (content) | `string` | Content script sort option (separate from popup). |

> **Note:** The content script and popup both write to `"filterState"` and `"sortOption"`. Since they run in different contexts and are not typically active simultaneously, this does not cause conflicts in practice.

---

## Filter State Format

The filter state for both the content script and popup uses the same structure:

```javascript
{
  videos: [],   // Array of selected video extensions. Empty = show all videos.
  images: [],   // Array of selected image extensions. Empty = show all images.
  audio: []     // Array of selected audio extensions. Empty = show all audio.
}
```

**Filter matching logic:**
1. If **all** category arrays are empty → show everything (no filters active).
2. If **any** category has selections → only items matching those specific extensions are shown.
3. Categories with no selections are **hidden** when other categories have active filters.

This means selecting "mp4" under Videos will show only `.mp4` videos and **hide all images and audio**.

---

## Badge Behavior

- **Count = 0:** Badge text is cleared (empty string).
- **Count 1–999:** Badge displays the count as a string (e.g. `"42"`).
- **Count > 999:** Badge displays `"999+"`.
- **Color:** Always `#0047ab` (cobalt blue).
- **Per-tab:** Badge updates when the user switches tabs (`chrome.tabs.onActivated`).
- **Updates trigger:** After each new media detection, after clearing, and on tab switch.
