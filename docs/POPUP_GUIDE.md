# Popup Guide — Media Downloader Professional

This document covers the extension popup interface, including its tab system, filter and sort controls, media operations (save, download, preview, copy), and modal dialogs.

---

## Overview

The popup is opened by clicking the extension icon in the Chrome toolbar. It renders in a fixed 450×550 pixel window and consists of a header, a tabbed interface, and two modal dialogs. The popup is implemented as an ES module (`popup.js` type="module") importing from `constants.js`, `icons.js`, `utils.js`, and `ui.js`.

---

## Popup Layout

```
┌─────────────────────────────────────────────────┐
│  Media Downloader Professional                  │  ← Header bar
├──────────────────────┬──────────────────────────┤
│  Detected Media      │  Saved Media             │  ← Tab buttons
├──────────────────────┴──────────────────────────┤
│                                                 │
│  ┌── Detected Tab ──────────────────────────┐   │
│  │ [📹 Videos 5] [🖼 Images 3] [🎵 Audio 2] │   │
│  │ [Reset]                                  │   │
│  ├──────────────────────────────────────────┤   │
│  │ Sort: [Newest first ▾]                   │   │
│  ├──────────────────────────────────────────┤   │
│  │                                          │   │
│  │  📹 Video 1             ▶ ⬇ 📋 💾        │   │
│  │  📹 Video 2             ▶ ⬇ 📋 💾        │   │
│  │  🖼 Image 1             ▶ ⬇ 📋 💾        │   │
│  │  🎵 Audio 1             ▶ ⬇ 📋 💾        │   │
│  │                                          │   │
│  ├──────────────────────────────────────────┤   │
│  │ 5 medias       [Clear All] [Show in page]│   │
│  │                 [Refresh ▾]              │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌── Saved Tab ─────────────────────────────┐   │
│  │ [📹 Videos 2] [🖼 Images 1] [🎵 Audio 0] │   │
│  │ [Reset]                                  │   │
│  ├──────────────────────────────────────────┤   │
│  │ Sort: [Newest first ▾]                   │   │
│  ├──────────────────────────────────────────┤   │
│  │                                          │   │
│  │  📹 Saved Video 1       ▶ 📋 ⬇ 🗑        │   │
│  │  🖼 Saved Image 1       ▶ 📋 ⬇ 🗑        │   │
│  │                                          │   │
│  ├──────────────────────────────────────────┤   │
│  │ 2 saved                    [Clear All]   │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## Tab System

The popup has two tabs controlled by `switchTab(tabName)`:

### Detected Media Tab (`data-tab="detected"`)

- **Active by default** (`DEFAULT_TAB = "detected"`).
- Shows media items detected on the current page via the background script's `webRequest` listener.
- Data is loaded by sending `{ action: "getMedias", tabId }` to the background script.
- Each item has four action buttons: Preview, Download, Copy URL, Save.

### Saved Media Tab (`data-tab="saved"`)

- Shows media items the user has explicitly saved to their persistent library.
- Data is loaded from `chrome.storage.local` under the `"savedMedia"` key.
- Each item has four action buttons: Preview, Copy URL, Download, Remove (delete).

### Tab Switching

Clicking a tab button calls `switchTab(btn.dataset.tab)`:
1. Toggles the `active` class on tab buttons.
2. Toggles the `active` class on tab content panels.
3. Loads data for the newly active tab (`loadMedias()` or `loadSavedMedia()`).

---

## Filter System

Both tabs have **independent** filter systems with separate state:

| | Detected | Saved |
|---|---|---|
| **State variable** | `filterState` | `savedFilterState` |
| **Storage key** | `STORAGE_KEYS.FILTER_STATE` (`"filterState"`) | `STORAGE_KEYS.SAVED_FILTER_STATE` (`"savedFilterState"`) |
| **Save function** | `saveFilterState()` | `saveSavedFilterState()` |
| **Reset function** | `resetFilters()` | `resetSavedFilters()` |
| **Match function** | `matchesFilter(media)` | `matchesSavedFilter(media)` |
| **Data attributes** | `data-section="detected"` | `data-section="saved"` |

### Filter Chip Structure (HTML)

Each filter chip in the popup HTML is structured as:

```html
<div class="filter-chip" data-category="videos" data-section="detected">
  <button class="chip-btn" data-category="videos" data-section="detected">
    <svg ... class="chip-icon">...</svg>
    Videos
    <span class="chip-count" data-category="videos" data-section="detected">0</span>
    <svg ... class="chip-arrow">...</svg>
  </button>
  <div class="chip-dropdown" data-category="videos" data-section="detected">
    <!-- Populated dynamically by setupFilterChips() -->
  </div>
</div>
```

### Setup Process

On `DOMContentLoaded`, `setupFilterChips(section)` is called for both `"detected"` and `"saved"` sections. This function:

1. Clears existing dropdown content.
2. Adds a "Show All" toggle checkbox.
3. Adds individual extension checkboxes for each category.
4. Restores saved check states from the appropriate `filterState`.
5. Attaches change event listeners that update the filter state, persist it, and reload the media list.

### Dropdown Positioning

Chip dropdowns use `position: fixed` with dynamically calculated `left` and `top` values based on the chip button's `getBoundingClientRect()`. Only one dropdown can be open at a time across both sections — opening a new one closes the previous one via `toggleChipDropdown()`.

---

## Sort System

Both tabs have **independent** sort state:

| | Detected | Saved |
|---|---|---|
| **State variable** | `currentSort` | `savedCurrentSort` |
| **Storage key** | `STORAGE_KEYS.SORT_OPTION` (`"sortOption"`) | `STORAGE_KEYS.SAVED_SORT_OPTION` (`"savedSortOption"`) |
| **Save function** | `saveSortOption()` | `saveSavedSortOption()` |
| **Sort function** | `sortMedias(medias)` | `sortSavedMedias(medias)` |
| **Date field** | `"timestamp"` | `"savedAt"` |
| **Select element ID** | `sortSelect` | `savedSortSelect` |

### Sort Options

Same six options as the content script (see [Content Script Guide — Sort Bar](CONTENT_SCRIPT_GUIDE.md#sort-bar)).

### Saved Media Date Sorting

The saved media sort uses `"savedAt"` as the date field, which is the timestamp when the user saved the item (not when it was originally detected). If `savedAt` is not present, it falls back to `timestamp`.

---

## Media Operations

### Preview

```javascript
previewMedia(media)
```

Opens the preview modal (`#previewModal`) with:
- A title showing the type and extension (e.g. "Video Preview — MP4").
- The media element (image, audio, or video) injected into `#previewBody`.
- An "Open in new tab" link in the footer.

Auto-play is enabled for audio and video. Previous media is paused and removed before showing new content. The modal is closed by clicking `#previewCloseBtn` or by calling `closePreview()`.

### Copy URL

```javascript
utils.copyToClipboard(url)
```

Uses `navigator.clipboard.writeText()` with a fallback to `document.execCommand("copy")`. Shows a notification toast on success or failure.

### Download

```javascript
downloadMedia(url, filename)
```

Sends `{ action: "downloadMedia", url, filename }` to the background script. The background calls `chrome.downloads.download({ url, filename, saveAs: true })`, which opens Chrome's native save dialog. The filename is auto-generated based on media type and index (e.g. `video_1.mp4`, `image_3.png`).

### Save to Library

```javascript
saveMedia(url, filename)
```

Opens the **Save Modal** (`#saveModal`) where the user can:
1. See the full URL (scrollable, max 60px height).
2. Edit the suggested filename in a text input.
3. Click **Save** to add the media to the saved library, or **Cancel** to abort.

On confirm, `addToSavedMedia(media)` is called, which:
1. Loads the existing `savedMedia` array from storage.
2. Checks for duplicates by URL.
3. If not a duplicate, pushes the media item and saves back to storage.
4. Shows a notification and reloads the saved tab if it's active.

### Remove from Library

```javascript
removeSavedMedia(url)
```

Prompts the user with `confirm("Are you sure you want to remove this media from your library?")`, then filters the `savedMedia` array to remove the item with the matching URL, saves the updated array, and reloads the saved media list.

---

## Footer Actions (Detected Tab)

| Button | ID | Action |
|---|---|---|
| **Clear All** | `clearAllBtn` | Sends `{ action: "clearMedias", tabId }` to the background. On success, reloads the detected media list. |
| **Show in page** | `showInPageBtn` | Sends `{ action: "showPanel" }` to the content script for the current tab, then closes the popup (`window.close()`). |
| **Refresh** | `refreshBtn` | Sends `{ action: "rescanPage" }` to the content script, shows a notification, then reloads detected media after a 1-second delay. |

The **Refresh** button has a tooltip that appears on hover: "Scan page again for media".

## Footer Actions (Saved Tab)

| Button | ID | Action |
|---|---|---|
| **Clear All** | `clearSavedBtn` | Prompts with `confirm()`, then clears the entire `savedMedia` array in storage. |

---

## Modal Dialogs

### Save Modal (`#saveModal`)

```
┌─────────────────────────────┐
│  Save Media                 │
│                             │
│  https://example.com/...    │  ← Scrollable URL display
│                             │
│  Filename:                  │
│  ┌─────────────────────────┐│
│  │ video_1.mp4             ││  ← Editable filename input
│  └─────────────────────────┘│
│                             │
│           [Cancel] [Save]   │
└─────────────────────────────┘
```

- Opens when the user clicks the Save button on a detected media item.
- `#customFilename` input is auto-focused and its text is selected for easy editing.
- **Cancel** (`#cancelSaveBtn`): Hides the modal without saving.
- **Save** (`#confirmSaveBtn`): Calls `addToSavedMedia()` with the media object (using the edited filename), then hides the modal.

### Preview Modal (`#previewModal`)

```
┌─────────────────────────────────┐
│  Video Preview — MP4        [×] │
├─────────────────────────────────┤
│                                 │
│        <video player>           │
│                                 │
├─────────────────────────────────┤
│          Open in new tab        │
└─────────────────────────────────┘
```

- Opens when the user clicks the Preview button on any media item (detected or saved).
- Content type is determined by extension and MIME type.
- Video/audio autoplay is enabled.
- The close button pauses any playing media before closing.
- Max dimensions: 420px wide, 95% height, with a 350px max-height on the preview body.

---

## Notification Toast

The `UIManager` (`ui.js`) manages a toast notification at the bottom of the popup:

- **Element:** `.notification-toast` (created dynamically if not present).
- **Duration:** 2000ms (`NOTIFICATION_DURATION`).
- **Animation:** Fade in (opacity 0→1, translateY 10px→0), fade out (reverse).
- **Auto-clear:** Previous notification is cleared before showing a new one.

Common notification messages:
- `"URL copied to clipboard"`
- `"Failed to copy URL"`
- `"Download started"`
- `"Download failed: <error>"`
- `"Media saved to library"`
- `"This media is already saved"`
- `"Media removed from library"`
- `"All detected media cleared"`
- `"All saved media cleared"`
- `"Failed to clear media"`
- `"Failed to open save dialog"`
- `"Scanning page for media..."`

---

## Empty States

Both tabs show contextual empty states:

### Detected Tab

| Condition | Icon | Message |
|---|---|---|
| No media detected | Search icon | "No media detected on this page." + "Browse the page to detect media automatically." |
| Filter matches nothing | Filter icon | "No media matches the current filter." + "Try adjusting the filter or click Reset." |

### Saved Tab

| Condition | Icon | Message |
|---|---|---|
| No saved media | Folder icon | "No saved media yet." + "Use the save button to save media for later." |
| Filter matches nothing | Filter icon | "No saved media matches the current filter." + "Try adjusting the filter or click Reset." |

---

## Initialization Sequence

On `DOMContentLoaded`:

1. **Load persisted state** — `loadFilterState()` restores filter and sort preferences for both tabs from `chrome.storage.local`.
2. **Setup filter chips** — `setupFilterChips("detected")` and `setupFilterChips("saved")` populate the dropdown checkboxes.
3. **Update filter UI** — `updateFilterUI("detected")` and `updateFilterUI("saved")` sync visual states (active classes, checkbox states).
4. **Restore sort dropdowns** — Set `#sortSelect.value` and `#savedSortSelect.value` to saved values.
5. **Attach event listeners** — Chip buttons, sort selects, action buttons, tab buttons, modal buttons, and the outside-click dropdown closer.
6. **Initial data load** — `loadMedias()` fetches detected media for the current tab (default active tab is "detected").
