# Content Script Guide — Media Downloader Professional

This document covers the in-page media panel injected by the content script, including its UI components, filter system, sort options, media preview/playback, and drag behavior.

---

## Overview

The content script (`content/content-script.js`) is injected into every webpage at `document_idle`. It creates a floating, draggable panel overlay that displays detected media items in real time. The panel is styled with `content/content-styles.css` using the `vdp-` CSS namespace to avoid conflicts with the host page.

---

## Panel Structure

```
┌─────────────────────────────────────────────┐
│  Media Downloader Professional    [−] [×]   │  ← Header (draggable)
├─────────────────────────────────────────────┤
│  [📹 Videos 3] [🖼 Images 2] [🎵 Audio 1]   │  ← Filter chips
│  [Reset]                    0 found         │  ← Reset + counter
├─────────────────────────────────────────────┤
│  Sort: [Newest first ▾]                     │  ← Sort dropdown
├─────────────────────────────────────────────┤
│                                             │
│  📹 Video 1                          ▶ ⬇ 📋 │  ← Media items
│     https://example.com/video.mp4           │
│     MP4  12.5 MB  Added: Jan 15, 10:30      │
│  ─────────────────────────────────────────  │
│  📹 Video 2                          ▶ ⬇ 📋 │
│     https://example.com/video2.webm         │
│     WEBM  8.2 MB   Added: Jan 15, 10:29     │
│  ─────────────────────────────────────────  │
│  🖼 Image 1                          ▶ ⬇ 📋 │
│     https://example.com/photo.jpg           │
│     JPG  2.1 MB   Added: Jan 15, 10:28      │
│                                             │
├─────────────────────────────────────────────┤
│  3 medias                       [Clear All] │  ← Footer
└─────────────────────────────────────────────┘
```

### Header

- **Title:** "Media Downloader Professional"
- **Minimize button** `[−]`: Toggles the `collapsed` class on the panel, reducing it to just the header (48px height). When expanded, the panel position is checked against viewport bounds.
- **Close button** `[×]`: Removes the panel from the DOM, sets `mediaPanel = null`, and resets `isInitialized = false`. The local `detectedMedias` Map is **preserved** so items reappear if the panel is reopened.
- The header is the drag handle (see [Drag Behavior](#drag-behavior)).

### Filter Bar

Three filter chip buttons for Videos, Images, and Audio. Each chip displays:
- A category icon (SVG)
- The category label (e.g. "Videos")
- A count badge showing the number of items in that category
- A dropdown arrow (▾)

Clicking a chip toggles a dropdown with individual extension checkboxes (see [Filter System](#filter-system)).

A **Reset** button clears all filter selections.

A **counter** (e.g. "0 found") shows the number of currently visible items after filtering.

### Sort Bar

A `<select>` dropdown with six sort options:

| Option | Value | Sort Key | Direction |
|---|---|---|---|
| Newest first | `date_desc` | `timestamp` | Descending |
| Oldest first | `date_asc` | `timestamp` | Ascending |
| Largest first | `size_desc` | `size` | Descending |
| Smallest first | `size_asc` | `size` | Ascending |
| Type A-Z | `type_asc` | `extension` | Ascending (localeCompare) |
| Type Z-A | `type_desc` | `extension` | Descending (localeCompare) |

Default: `date_desc` (newest first). Changing the sort option triggers a full re-render of the media list. The selection is persisted to `chrome.storage.local`.

### Content Area

A scrollable list of media items. When no media has been detected yet, displays "Scanning for media...". When filters produce zero matches, displays "No media matches the current filter".

### Footer

- **Media count:** Total items (e.g. "3 medias" or "1 media").
- **Clear All button:** Prompts the user with `confirm()`, then optimistically clears the local `detectedMedias` Map and notifies the background script via fire-and-forget `chrome.runtime.sendMessage({ action: "clearMedias" })`.

---

## Filter System

The content script uses a **multi-select filter** with three categories, each supporting multiple extension selections.

### Filter State

```javascript
let filterState = {
  videos: new Set(),   // Empty = show all videos
  images: new Set(),   // Empty = show all images
  audio: new Set(),    // Empty = show all audio
};
```

### Filter Matching Logic

The `matchesFilter(media)` function determines visibility:

1. **No filters active** (all Sets empty) → **show everything**.
2. **Any filter active** (any Set non-empty):
   - If the media's category has specific filters selected (Set size > 0) → show **only if** the media's file type is in that Set.
   - If the media's category has **no** specific filters (Set is empty) → **hide** the item entirely.

**Example:** If you select "mp4" under Videos:
- `.mp4` videos → **shown**
- `.webm` videos → **hidden** (mp4 is explicitly selected)
- All images → **hidden** (images category has no selection, but another category is filtered)
- All audio → **hidden** (same reason)

### Chip Dropdown

Each chip has a dropdown (position: fixed) that contains:

1. **"Show All" toggle** — A checkbox at the top. When checked, clears all extension selections for that category. When unchecked, selects all extensions (effectively hiding nothing within the category but still excluding other categories).

2. **Individual extension checkboxes** — One per supported extension in the category:
   - Videos: mp4, mov, m4v, webm, mpg, m4s, ts, flv, avi, mkv, m3u8
   - Images: jpg, jpeg, png, gif, bmp, webp, svg
   - Audio: mp3, wav, ogg, flac, aac

When a checkbox changes:
1. The `filterState` Set is updated.
2. `saveFilterState()` persists the change to `chrome.storage.local`.
3. The chip's active class is toggled.
4. `applyFilter()` re-evaluates all items' visibility.

### State Persistence

Filter state is loaded on script initialization via `loadFilterState()` and saved on every change via `saveFilterState()`. Storage keys: `"filterState"` and `"sortOption"` in `chrome.storage.local`.

---

## Media Preview / Playback

Clicking the **Preview** button (play icon ▶) on a media item opens a full-screen overlay:

### Preview Overlay Structure

```
┌─────────────────────────────────────────────┐
│  Video Preview — MP4                    [×] │  ← Header
├─────────────────────────────────────────────┤
│                                             │
│              <video player>                 │  ← Body (scrollable)
│                                             │
├─────────────────────────────────────────────┤
│                Open in new tab              │  ← Footer
└─────────────────────────────────────────────┘
```

### Behavior by Type

| Type | Element | Autoplay | Error Message |
|---|---|---|---|
| **Image** | `<img>` | No | "Failed to load image" |
| **Audio** | `<audio controls>` | Yes | — |
| **Video** | `<video controls>` | Yes | "Failed to load video. Try opening in a new tab." |

### Close Behavior

- Click the **×** button.
- Click the **backdrop** (area outside the preview container).
- On close, any playing `<video>` or `<audio>` is paused before removal.

---

## Drag Behavior

The in-page panel is draggable by its header.

### Implementation

The `makeDraggable(element, handle)` function attaches `mousedown`, `mousemove`, and `mouseup` listeners to implement custom drag behavior:

1. **mousedown** on the header: Records the offset between the cursor and the panel's top-left corner. Adds the `vdp-dragging` class (disables CSS transitions, adds grab cursor, increases shadow).

2. **mousemove**: Updates the panel's `top` and `left` style properties to follow the cursor.

3. **mouseup**: Removes the `vdp-dragging` class. Calls `ensurePositionInViewport()` to snap the panel back if it's partially off-screen.

### Viewport Bounds Enforcement

`ensurePositionInViewport(element)` ensures the panel is within the visible area with a minimum 20px margin from each edge:

- If the panel is wider than the viewport, it is left-aligned at the margin.
- If the panel is taller than the viewport, it is top-aligned at the margin.
- Otherwise, it is clamped to the nearest valid position.

This function is called:
- After expanding from a collapsed state
- After dragging ends
- On window resize events

---

## Message Handling

The content script listens for messages from the background script via `chrome.runtime.onMessage`:

| Action | Behavior |
|---|---|
| `"addMedia"` | Adds the media item to `detectedMedias` Map and renders it in the panel. |
| `"clearMedias"` | Clears `detectedMedias`, re-renders the panel with empty state. |
| `"showPanel"` | Creates or shows the in-page panel. |
| `"rescanPage"` | Hook for future DOM-based scanning (currently a no-op for re-rendering). |

---

## CSS Namespacing

All content script styles use the `vdp-` prefix to prevent collisions with host page styles. Key classes:

| Class | Element |
|---|---|
| `.vdp-panel` | Main panel container |
| `.vdp-header` | Panel header (drag handle) |
| `.vdp-content` | Scrollable media list area |
| `.vdp-media-item` | Individual media item row |
| `.vdp-media-icon` | Type icon (video/audio/image) |
| `.vdp-media-info` | Title, URL, metadata |
| `.vdp-media-actions` | Action buttons (preview, download, copy) |
| `.vdp-filter-bar` | Filter chip container |
| `.vdp-chip-btn` | Filter chip button |
| `.vdp-chip-dropdown` | Extension checkbox dropdown |
| `.vdp-sort-bar` | Sort dropdown container |
| `.vdp-preview-overlay` | Full-screen preview backdrop |
| `.vdp-copied` | Notification toast |
| `.vdp-empty` | Empty state message |
| `.vdp-footer` | Panel footer with count and Clear All |

### Z-Index Strategy

The panel and all overlays use `z-index: 2147483647` (maximum 32-bit integer value) to appear above all page content. The preview overlay uses `2147483646` (one less) so it appears below the panel in the stacking context if both are somehow visible simultaneously.

---

## Notification System

A lightweight toast notification appears at the bottom-center of the page:

- **Trigger:** Copy URL, download start, clear all.
- **Appearance:** Fixed position, dark background, white text, fade animation.
- **Duration:** 2000ms (`CONFIG.NOTIFICATION_TIMEOUT`).
- **Implementation:** Reuses a single `.vdp-copied` element, toggling the `.show` class.

### Copy to Clipboard

```javascript
copyToClipboard(url)
        │
        ├── navigator.clipboard.writeText(url)   ← Primary method
        │     └── .catch → useFallbackCopy(url)
        │
        └── useFallbackCopy(url)                 ← Fallback for insecure contexts
              └── document.execCommand("copy")   ← Deprecated but functional
```

The fallback creates a hidden `<textarea>`, selects its content, and uses `document.execCommand("copy")`.
