/**
 * Media Downloader Professional - Content Script
 * Creates and manages the media list UI on the webpage
 * with multi-select filters, sorting, and media preview/playback
 */

/**
 * ==============================
 * CONSTANTS AND CONFIGURATION
 * ==============================
 */

const detectedMedias = new Map();
let mediaPanel = null;
let isInitialized = false;
let activeFilter = "all";
let currentPageUrl = window.location.href;

// Multi-select filter state: each category maps to a Set of selected extensions.
// An empty Set means "show all" for that category.
let filterState = {
  videos: new Set(),
  images: new Set(),
  audio: new Set(),
};

// Sort options
const SORT_OPTIONS = {
  DATE_DESC: "date_desc",
  DATE_ASC: "date_asc",
  SIZE_DESC: "size_desc",
  SIZE_ASC: "size_asc",
  TYPE_ASC: "type_asc",
  TYPE_DESC: "type_desc",
};

let currentSort = SORT_OPTIONS.DATE_DESC;

const CONFIG = {
  PANEL_WIDTH: 380,
  PANEL_MAX_HEIGHT: 500,
  PANEL_POSITION: { top: 20, right: 20 },
  NOTIFICATION_TIMEOUT: 2000,
  URL_CHECK_INTERVAL: 1000,
  MAX_URL_LENGTH: 60,
  FILTER_STORAGE_KEY: "vdp_filterState",
  SORT_STORAGE_KEY: "vdp_sortOption",
};

const MEDIA_TYPES = {
  IMAGE: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"],
  AUDIO: ["mp3", "wav", "ogg", "flac", "aac"],
  VIDEO: ["mp4", "mov", "m4v", "webm", "mpg", "flv", "avi", "mkv", "ts", "m3u8", "m4s"],
};

/**
 * ==============================
 * UTILITY FUNCTIONS
 * ==============================
 */

const formatFileSize = (bytes) => {
  try {
    if (!bytes || isNaN(bytes) || bytes === 0) return "Unknown";
    const units = ["B", "KB", "MB", "GB"];
    let size = Math.abs(bytes);
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  } catch (error) {
    return "Unknown";
  }
};

const formatDateTime = (timestamp) => {
  try {
    if (!timestamp) return "Unknown time";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch (error) {
    return "Unknown time";
  }
};

const getMediaType = (media) => {
  try {
    if (!media) return "unknown";
    const extension = media.extension?.toLowerCase() || "";
    const mime = media.mime || "";
    if (MEDIA_TYPES.IMAGE.includes(extension) || mime.includes("image/")) {
      return extension || (mime.includes("/") ? mime.split("/")[1] : "") || "image";
    }
    if (MEDIA_TYPES.AUDIO.includes(extension) || mime.includes("audio/")) {
      return extension || (mime.includes("/") ? mime.split("/")[1] : "") || "audio";
    }
    return extension || (mime.includes("/") ? mime.split("/")[1] : "") || "video";
  } catch (error) {
    return "unknown";
  }
};

const getMediaCategory = (media) => {
  const fileType = getMediaType(media);
  const mime = media.mime || "";
  if (MEDIA_TYPES.IMAGE.includes(fileType) || mime.includes("image/")) return "images";
  if (MEDIA_TYPES.AUDIO.includes(fileType) || mime.includes("audio/")) return "audio";
  return "videos";
};

const escapeHTML = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * ==============================
 * FILTER STATE PERSISTENCE
 * ==============================
 */

const loadFilterState = () => {
  try {
    const stored = localStorage.getItem(CONFIG.FILTER_STORAGE_KEY);
    if (stored) {
      const saved = JSON.parse(stored);
      filterState.videos = new Set(saved.videos || []);
      filterState.images = new Set(saved.images || []);
      filterState.audio = new Set(saved.audio || []);
    }
    const sortStored = localStorage.getItem(CONFIG.SORT_STORAGE_KEY);
    if (sortStored && Object.values(SORT_OPTIONS).includes(sortStored)) {
      currentSort = sortStored;
    }
  } catch (error) {
    console.error("Error loading filter state:", error);
  }
};

const saveFilterState = () => {
  try {
    const state = {
      videos: Array.from(filterState.videos),
      images: Array.from(filterState.images),
      audio: Array.from(filterState.audio),
    };
    localStorage.setItem(CONFIG.FILTER_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Error saving filter state:", error);
  }
};

const saveSortOption = () => {
  try {
    localStorage.setItem(CONFIG.SORT_STORAGE_KEY, currentSort);
  } catch (error) {
    console.error("Error saving sort option:", error);
  }
};

const resetFilters = () => {
  filterState.videos.clear();
  filterState.images.clear();
  filterState.audio.clear();
  saveFilterState();
  updateChipDropdowns();
  applyFilter();
};

/**
 * ==============================
 * CHECK IF ANY FILTER IS ACTIVE
 * ==============================
 */

const isAnyFilterActive = () => {
  return filterState.videos.size > 0 || filterState.images.size > 0 || filterState.audio.size > 0;
};

/**
 * ==============================
 * FILTERING FUNCTIONS
 * ==============================
 */

/**
 * Checks if a media item matches the current filter state.
 *
 * KEY FIX: When ANY category has specific filters selected (size > 0),
 * only items matching those specific filters are shown.
 * Categories with no specific filters selected will NOT show their items
 * when other categories are filtered.
 *
 * When NO category has any specific filters (all empty = show all),
 * then everything is displayed.
 */
const matchesFilter = (media) => {
  try {
    if (!media) return false;
    const fileType = getMediaType(media);
    const category = getMediaCategory(media);

    // If no filters are active anywhere, show everything
    if (!isAnyFilterActive()) {
      return true;
    }

    // Check if this media's category has specific filters
    const categoryFilter = filterState[category];

    if (categoryFilter.size > 0) {
      // This category has specific filters - only show matching items
      return categoryFilter.has(fileType);
    } else {
      // This category has NO specific filters, but other categories DO.
      // Since the user explicitly filtered something, we should NOT show
      // unfiltered categories.
      return false;
    }
  } catch (error) {
    console.error("Error matching filter:", error);
    return false;
  }
};

/**
 * Sorts detected medias based on the current sort option
 * @returns {Array} Sorted array of media objects
 */
const getSortedMedias = () => {
  const medias = Array.from(detectedMedias.values());
  switch (currentSort) {
    case SORT_OPTIONS.DATE_DESC:
      medias.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      break;
    case SORT_OPTIONS.DATE_ASC:
      medias.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      break;
    case SORT_OPTIONS.SIZE_DESC:
      medias.sort((a, b) => (b.size || 0) - (a.size || 0));
      break;
    case SORT_OPTIONS.SIZE_ASC:
      medias.sort((a, b) => (a.size || 0) - (b.size || 0));
      break;
    case SORT_OPTIONS.TYPE_ASC:
      medias.sort((a, b) => {
        const extA = (a.extension || "").toLowerCase();
        const extB = (b.extension || "").toLowerCase();
        return extA.localeCompare(extB);
      });
      break;
    case SORT_OPTIONS.TYPE_DESC:
      medias.sort((a, b) => {
        const extA = (a.extension || "").toLowerCase();
        const extB = (b.extension || "").toLowerCase();
        return extB.localeCompare(extA);
      });
      break;
    default:
      medias.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  return medias;
};

const applyFilter = () => {
  try {
    if (!mediaPanel) return;

    const mediaList = mediaPanel.querySelector(".vdp-media-list");
    if (!mediaList) return;

    const items = mediaList.querySelectorAll(".vdp-media-item");
    let visibleCount = 0;

    items.forEach((item) => {
      const url = item.dataset.url;
      if (!url) return;
      const media = detectedMedias.get(url);
      if (media && matchesFilter(media)) {
        item.style.display = "";
        visibleCount++;
      } else {
        item.style.display = "none";
      }
    });

    const counterEl = mediaPanel.querySelector(".vdp-counter-count");
    if (counterEl) counterEl.textContent = visibleCount;

    updateEmptyState(visibleCount, items.length);
    updateChipCounts();
  } catch (error) {
    console.error("Error applying filter:", error);
  }
};

const updateEmptyState = (visibleCount, totalItems) => {
  try {
    if (!mediaPanel) return;
    const emptyState = mediaPanel.querySelector(".vdp-empty");
    const content = mediaPanel.querySelector(".vdp-content");

    if (visibleCount === 0 && totalItems > 0) {
      if (!emptyState && content) {
        const newEmpty = document.createElement("div");
        newEmpty.className = "vdp-empty";
        newEmpty.textContent = "No media matches the current filter";
        content.appendChild(newEmpty);
      } else if (emptyState) {
        emptyState.textContent = "No media matches the current filter";
        emptyState.style.display = "";
      }
    } else if (emptyState) {
      emptyState.style.display = "none";
    }
  } catch (error) {
    console.error("Error updating empty state:", error);
  }
};

const updateChipCounts = () => {
  try {
    if (!mediaPanel) return;
    let videoCount = 0, imageCount = 0, audioCount = 0;
    detectedMedias.forEach((media) => {
      const category = getMediaCategory(media);
      if (category === "images") imageCount++;
      else if (category === "audio") audioCount++;
      else videoCount++;
    });

    const vc = mediaPanel.querySelector('.vdp-chip-count[data-category="videos"]');
    const ic = mediaPanel.querySelector('.vdp-chip-count[data-category="images"]');
    const ac = mediaPanel.querySelector('.vdp-chip-count[data-category="audio"]');
    if (vc) vc.textContent = videoCount;
    if (ic) ic.textContent = imageCount;
    if (ac) ac.textContent = audioCount;
  } catch (error) {
    console.error("Error updating chip counts:", error);
  }
};

/**
 * ==============================
 * UI ASSETS AND RESOURCES
 * ==============================
 */

const ICONS = {
  video: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" /><rect x="3" y="6" width="12" height="12" rx="2" stroke-width="2" /></svg>',
  audio: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>',
  image: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>',
  copy: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>',
  download: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>',
  play: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>',
  minimize: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>',
  maximize: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>',
  sort: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>',
  trash: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>',
};

/**
 * ==============================
 * NOTIFICATION AND CLIPBOARD
 * ==============================
 */

const showNotification = (message) => {
  try {
    if (!message) return;
    let notification = document.querySelector(".vdp-copied");
    if (!notification) {
      notification = document.createElement("div");
      notification.className = "vdp-copied";
      document.body.appendChild(notification);
    }
    notification.textContent = message;
    notification.classList.add("show");
    setTimeout(() => {
      if (notification && notification.parentNode) {
        notification.classList.remove("show");
      }
    }, CONFIG.NOTIFICATION_TIMEOUT);
  } catch (error) {
    console.error("Error showing notification:", error);
  }
};

const copyToClipboard = (url) => {
  try {
    if (!url) { showNotification("No URL to copy"); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showNotification("URL copied!"))
        .catch(() => useFallbackCopy(url));
    } else {
      useFallbackCopy(url);
    }
  } catch (error) {
    showNotification("Failed to copy URL");
  }
};

const useFallbackCopy = (text) => {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    textarea.style.zIndex = "-1";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    showNotification(success ? "URL copied!" : "Failed to copy URL");
  } catch (error) {
    showNotification("Failed to copy URL");
  }
};

/**
 * ==============================
 * MEDIA PREVIEW / PLAYBACK
 * ==============================
 */

let previewOverlay = null;

const previewMedia = (media) => {
  try {
    if (!media || !media.url) return;

    // Remove any existing preview
    closePreview();

    const extension = (media.extension || "").toLowerCase();
    const mime = media.mime || "";
    const isImage = MEDIA_TYPES.IMAGE.includes(extension) || mime.includes("image/");
    const isAudio = MEDIA_TYPES.AUDIO.includes(extension) || mime.includes("audio/");

    previewOverlay = document.createElement("div");
    previewOverlay.className = "vdp-preview-overlay";

    const previewContainer = document.createElement("div");
    previewContainer.className = "vdp-preview-container";

    // Header
    const header = document.createElement("div");
    header.className = "vdp-preview-header";

    const title = document.createElement("div");
    title.className = "vdp-preview-title";
    const typeLabel = isImage ? "Image" : isAudio ? "Audio" : "Video";
    title.textContent = `${typeLabel} Preview — ${extension.toUpperCase()}`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "vdp-preview-close";
    closeBtn.innerHTML = ICONS.close;
    closeBtn.onclick = closePreview;

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body - scrollable to handle overflow
    const body = document.createElement("div");
    body.className = "vdp-preview-body";

    if (isImage) {
      const img = document.createElement("img");
      img.src = media.url;
      img.alt = "Media preview";
      img.onerror = () => { body.innerHTML = '<div style="color:#999;padding:20px;text-align:center;">Failed to load image</div>'; };
      body.appendChild(img);
    } else if (isAudio) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.autoplay = true;
      audio.src = media.url;
      body.appendChild(audio);
    } else {
      const video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.src = media.url;
      video.onerror = () => { body.innerHTML = '<div style="color:#999;padding:20px;text-align:center;">Failed to load video. Try opening in a new tab.</div>'; };
      body.appendChild(video);
    }

    // Footer
    const footer = document.createElement("div");
    footer.className = "vdp-preview-footer";
    const openLink = document.createElement("a");
    openLink.href = media.url;
    openLink.target = "_blank";
    openLink.textContent = "Open in new tab";
    openLink.className = "vdp-preview-link";
    footer.appendChild(openLink);

    previewContainer.appendChild(header);
    previewContainer.appendChild(body);
    previewContainer.appendChild(footer);

    previewOverlay.appendChild(previewContainer);

    // Close on backdrop click
    previewOverlay.addEventListener("click", (e) => {
      if (e.target === previewOverlay) closePreview();
    });

    document.body.appendChild(previewOverlay);
  } catch (error) {
    console.error("Error previewing media:", error);
  }
};

const closePreview = () => {
  if (previewOverlay) {
    // Stop any playing media
    const video = previewOverlay.querySelector("video");
    const audio = previewOverlay.querySelector("audio");
    if (video) video.pause();
    if (audio) audio.pause();
    previewOverlay.remove();
    previewOverlay = null;
  }
};

/**
 * ==============================
 * MEDIA ITEM UI FUNCTIONS
 * ==============================
 */

const createMediaItem = (media) => {
  try {
    if (!media || !media.url) return null;

    const item = document.createElement("li");
    item.className = "vdp-media-item";
    item.dataset.url = media.url;

    const extension = media.extension || "unknown";
    const mime = media.mime || "";
    const isAudio = mime.includes("audio");
    const isImage = mime.includes("image") || MEDIA_TYPES.IMAGE.includes(extension.toLowerCase());
    const typeCount = getMediaTypeCount(media, isImage);
    const title = `${isImage ? "Image" : isAudio ? "Audio" : "Video"} ${typeCount}`;
    const size = formatFileSize(media.size);
    const datetime = formatDateTime(media.timestamp || Date.now());
    const displayUrl = media.url.length > CONFIG.MAX_URL_LENGTH ?
      media.url.substring(0, CONFIG.MAX_URL_LENGTH - 3) + "..." : media.url;

    item.innerHTML = `
      <div class="vdp-media-icon">
        ${isImage ? ICONS.image : isAudio ? ICONS.audio : ICONS.video}
      </div>
      <div class="vdp-media-info">
        <div class="vdp-media-title" title="${escapeHTML(media.url)}">${escapeHTML(title)}</div>
        <div class="vdp-media-url" title="${escapeHTML(media.url)}">${escapeHTML(displayUrl)}</div>
        <div class="vdp-media-meta">
          <span class="vdp-media-format">${escapeHTML(extension.toUpperCase())}</span>
          <span class="vdp-media-size">${escapeHTML(size)}</span>
          <span class="vdp-media-time">Added: ${escapeHTML(datetime)}</span>
        </div>
      </div>
      <div class="vdp-media-actions">
        <button class="vdp-action-btn vdp-preview-btn" title="Preview">${ICONS.play}</button>
        <button class="vdp-action-btn vdp-download-btn" title="Download">${ICONS.download}</button>
        <button class="vdp-action-btn vdp-copy-btn" title="Copy URL">${ICONS.copy}</button>
      </div>
    `;

    attachMediaItemEventListeners(item, media);
    return item;
  } catch (error) {
    console.error("Error creating media item:", error);
    return null;
  }
};

const attachMediaItemEventListeners = (itemElement, media) => {
  try {
    const copyBtn = itemElement.querySelector(".vdp-copy-btn");
    if (copyBtn) copyBtn.addEventListener("click", () => copyToClipboard(media.url));

    const downloadBtn = itemElement.querySelector(".vdp-download-btn");
    if (downloadBtn) downloadBtn.addEventListener("click", () => downloadMedia(media));

    const previewBtn = itemElement.querySelector(".vdp-preview-btn");
    if (previewBtn) previewBtn.addEventListener("click", () => previewMedia(media));
  } catch (error) {
    console.error("Error attaching event listeners:", error);
  }
};

const getMediaTypeCount = (media, isImage) => {
  try {
    let index;
    if (isImage) {
      index = Array.from(detectedMedias.values())
        .filter((item) => {
          const ext = item.extension?.toLowerCase() || "";
          const mime = item.mime || "";
          return MEDIA_TYPES.IMAGE.includes(ext) || mime.includes("image/");
        })
        .findIndex((item) => item.url === media.url);
    } else {
      index = Array.from(detectedMedias.values())
        .filter((item) => {
          const ext = item.extension?.toLowerCase() || "";
          const mime = item.mime || "";
          return !(MEDIA_TYPES.IMAGE.includes(ext) || mime.includes("image/"));
        })
        .findIndex((item) => item.url === media.url);
    }
    return index >= 0 ? index + 1 : 1;
  } catch (error) {
    return 1;
  }
};

/**
 * ==============================
 * DOWNLOAD FUNCTIONS
 * ==============================
 */

const downloadMedia = (media) => {
  try {
    if (!media || !media.url) { showNotification("Cannot download invalid media"); return; }

    const extension = media.extension || "mp4";
    const isAudio = media.mime && media.mime.includes("audio");
    const isImage = (media.mime && media.mime.includes("image")) || MEDIA_TYPES.IMAGE.includes(extension.toLowerCase());
    const type = isImage ? "image" : isAudio ? "audio" : "video";

    let typeIndex;
    if (isImage) {
      typeIndex = Array.from(detectedMedias.values())
        .filter((item) => MEDIA_TYPES.IMAGE.includes(item.extension?.toLowerCase() || "") || (item.mime || "").includes("image/"))
        .findIndex((item) => item.url === media.url);
    } else {
      typeIndex = Array.from(detectedMedias.values())
        .filter((item) => !(MEDIA_TYPES.IMAGE.includes(item.extension?.toLowerCase() || "") || (item.mime || "").includes("image/")))
        .findIndex((item) => item.url === media.url);
    }
    const typeCount = typeIndex >= 0 ? typeIndex + 1 : 1;
    const filename = `${type}_${typeCount}.${extension}`;

    showNotification(`Downloading ${filename}...`);

    chrome.runtime.sendMessage(
      { action: "downloadMedia", url: media.url, filename: filename },
      (response) => {
        if (chrome.runtime.lastError) {
          showNotification("Download failed. Please try again.");
          return;
        }
        if (response && response.success) {
          showNotification(`Download started for ${filename}`);
        } else {
          showNotification(`Download failed: ${(response && response.error) || "Unknown error"}`);
        }
      }
    );
  } catch (error) {
    showNotification("Download failed. Please try again.");
  }
};

/**
 * ==============================
 * MEDIA PANEL UI FUNCTIONS
 * ==============================
 */

const addMediaToPanel = (media) => {
  try {
    if (!media || !media.url) return;
    if (!isInitialized) initialize();

    if (!mediaPanel && !document.querySelector(".vdp-panel")) return;

    if (!mediaPanel) {
      const ui = createMediaPanel();
      mediaPanel = ui.panel;
    }

    const content = mediaPanel.querySelector(".vdp-content");
    let mediaList = mediaPanel.querySelector(".vdp-media-list");
    const emptyState = mediaPanel.querySelector(".vdp-empty");

    if (!mediaList) {
      mediaList = document.createElement("ul");
      mediaList.className = "vdp-media-list";
      content.innerHTML = "";
      content.appendChild(mediaList);
    }

    const mediaItem = createMediaItem(media);
    if (mediaItem) mediaList.appendChild(mediaItem);

    const totalCount = detectedMedias.size;
    const countText = totalCount === 1 ? "1 media" : `${totalCount} medias`;
    const mediaCountEl = mediaPanel.querySelector(".vdp-media-count");
    if (mediaCountEl) mediaCountEl.textContent = countText;

    applyFilter();
  } catch (error) {
    console.error("Error adding media to panel:", error);
  }
};

/**
 * Creates chip dropdown contents for the filter bar
 */
const createChipDropdown = (category, extensions) => {
  const dropdown = document.createElement("div");
  dropdown.className = "vdp-chip-dropdown";
  dropdown.dataset.category = category;

  // "Show All" toggle
  const selectAllLabel = document.createElement("label");
  selectAllLabel.className = "vdp-select-all-label";
  const selectAllCb = document.createElement("input");
  selectAllCb.type = "checkbox";
  selectAllCb.checked = filterState[category].size === 0;
  selectAllCb.addEventListener("change", () => {
    if (selectAllCb.checked) {
      filterState[category].clear();
      extensions.forEach((ext) => {
        const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
        if (cb) cb.checked = false;
      });
    } else {
      extensions.forEach((ext) => filterState[category].add(ext));
      extensions.forEach((ext) => {
        const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
        if (cb) cb.checked = true;
      });
    }
    saveFilterState();
    updateChipActiveState(category);
    applyFilter();
  });
  selectAllLabel.appendChild(selectAllCb);
  selectAllLabel.appendChild(document.createTextNode("Show All"));
  dropdown.appendChild(selectAllLabel);

  extensions.forEach((ext) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.ext = ext;
    cb.checked = filterState[category].has(ext);
    cb.addEventListener("change", () => {
      if (cb.checked) filterState[category].add(ext);
      else filterState[category].delete(ext);
      selectAllCb.checked = filterState[category].size === 0;
      saveFilterState();
      updateChipActiveState(category);
      applyFilter();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(ext.toUpperCase()));
    dropdown.appendChild(label);
  });

  return dropdown;
};

let openChipDropdown = null;

const updateChipActiveState = (category) => {
  if (!mediaPanel) return;
  const chipBtn = mediaPanel.querySelector(`.vdp-chip-btn[data-category="${category}"]`);
  if (!chipBtn) return;
  if (filterState[category].size > 0) chipBtn.classList.add("active");
  else chipBtn.classList.remove("active");
};

const updateChipDropdowns = () => {
  if (!mediaPanel) return;
  ["videos", "images", "audio"].forEach((category) => {
    updateChipActiveState(category);
    const dropdown = mediaPanel.querySelector(`.vdp-chip-dropdown[data-category="${category}"]`);
    if (!dropdown) return;
    const selectAllCb = dropdown.querySelector(".vdp-select-all-label input");
    if (selectAllCb) selectAllCb.checked = filterState[category].size === 0;
    const extensions = category === "videos" ? MEDIA_TYPES.VIDEO : category === "images" ? MEDIA_TYPES.IMAGE : MEDIA_TYPES.AUDIO;
    extensions.forEach((ext) => {
      const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
      if (cb) cb.checked = filterState[category].has(ext);
    });
  });
};

const createSortDropdown = () => {
  const sortBar = document.createElement("div");
  sortBar.className = "vdp-sort-bar";

  const sortLabel = document.createElement("label");
  sortLabel.className = "vdp-sort-label";
  sortLabel.textContent = "Sort:";

  const sortSelect = document.createElement("select");
  sortSelect.className = "vdp-sort-select";

  const options = [
    { value: SORT_OPTIONS.DATE_DESC, text: "Newest first" },
    { value: SORT_OPTIONS.DATE_ASC, text: "Oldest first" },
    { value: SORT_OPTIONS.SIZE_DESC, text: "Largest first" },
    { value: SORT_OPTIONS.SIZE_ASC, text: "Smallest first" },
    { value: SORT_OPTIONS.TYPE_ASC, text: "Type A-Z" },
    { value: SORT_OPTIONS.TYPE_DESC, text: "Type Z-A" },
  ];

  options.forEach(({ value, text }) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if (value === currentSort) opt.selected = true;
    sortSelect.appendChild(opt);
  });

  sortSelect.addEventListener("change", () => {
    currentSort = sortSelect.value;
    saveSortOption();
    renderAllMediaToPanel();
  });

  sortBar.appendChild(sortLabel);
  sortBar.appendChild(sortSelect);

  return sortBar;
};

const createMediaPanel = () => {
  try {
    mediaPanel = document.createElement("div");
    mediaPanel.className = "vdp-panel";

    // Header
    const header = document.createElement("div");
    header.className = "vdp-header";

    const title = document.createElement("div");
    title.className = "vdp-header-title";
    title.innerHTML = '<span>Media Downloader Professional</span>';

    const controls = document.createElement("div");
    controls.className = "vdp-controls";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "vdp-btn vdp-minimize";
    minimizeBtn.innerHTML = ICONS.minimize;
    minimizeBtn.title = "Minimize";
    minimizeBtn.onclick = () => {
      mediaPanel.classList.toggle("collapsed");
      minimizeBtn.innerHTML = mediaPanel.classList.contains("collapsed") ? ICONS.maximize : ICONS.minimize;
    };

    const closeBtn = document.createElement("button");
    closeBtn.className = "vdp-btn vdp-close";
    closeBtn.innerHTML = ICONS.close;
    closeBtn.title = "Close";
    closeBtn.onclick = () => { mediaPanel.remove(); mediaPanel = null; isInitialized = false; };

    controls.appendChild(minimizeBtn);
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);

    // Filter Bar with chip buttons
    const filterBar = document.createElement("div");
    filterBar.className = "vdp-filter-bar";

    const chipContainer = document.createElement("div");
    chipContainer.className = "vdp-chip-container";

    const chipData = [
      { category: "videos", label: "Videos", icon: ICONS.video },
      { category: "images", label: "Images", icon: ICONS.image },
      { category: "audio", label: "Audio", icon: ICONS.audio },
    ];

    chipData.forEach(({ category, label, icon }) => {
      const chip = document.createElement("div");
      chip.className = "vdp-chip";

      const chipBtn = document.createElement("button");
      chipBtn.className = "vdp-chip-btn";
      chipBtn.dataset.category = category;
      chipBtn.innerHTML = `
        <span class="vdp-chip-icon">${icon}</span>
        ${label}
        <span class="vdp-chip-count" data-category="${category}">0</span>
        <span class="vdp-chip-arrow">&#9662;</span>
      `;
      chipBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Close other dropdowns
        if (openChipDropdown && openChipDropdown !== category) {
          const prev = mediaPanel.querySelector(`.vdp-chip-dropdown[data-category="${openChipDropdown}"]`);
          const prevBtn = mediaPanel.querySelector(`.vdp-chip-btn[data-category="${openChipDropdown}"]`);
          if (prev) prev.classList.remove("open");
          if (prevBtn) prevBtn.classList.remove("open");
        }
        const dd = chip.querySelector(".vdp-chip-dropdown");
        chipBtn.classList.toggle("open");
        dd.classList.toggle("open");
        openChipDropdown = dd.classList.contains("open") ? category : null;
      });

      const extensions = category === "videos" ? MEDIA_TYPES.VIDEO : category === "images" ? MEDIA_TYPES.IMAGE : MEDIA_TYPES.AUDIO;
      const dropdown = createChipDropdown(category, extensions);

      chip.appendChild(chipBtn);
      chip.appendChild(dropdown);
      chipContainer.appendChild(chip);

      // Set initial active state
      if (filterState[category].size > 0) chipBtn.classList.add("active");
    });

    filterBar.appendChild(chipContainer);

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.className = "vdp-reset-btn";
    resetBtn.textContent = "Reset";
    resetBtn.title = "Reset all filters";
    resetBtn.addEventListener("click", resetFilters);
    filterBar.appendChild(resetBtn);

    // Counter
    const mediaCounter = document.createElement("div");
    mediaCounter.className = "vdp-media-counter";
    mediaCounter.innerHTML = '<span class="vdp-counter-count">0</span> found';
    filterBar.appendChild(mediaCounter);

    // Sort bar
    const sortBar = createSortDropdown();

    // Content
    const content = document.createElement("div");
    content.className = "vdp-content";

    const emptyState = document.createElement("div");
    emptyState.className = "vdp-empty";
    emptyState.textContent = "Scanning for media...";

    const mediaList = document.createElement("ul");
    mediaList.className = "vdp-media-list";

    content.appendChild(emptyState);

    // Footer
    const footer = document.createElement("div");
    footer.className = "vdp-footer";

    const mediaCount = document.createElement("div");
    mediaCount.className = "vdp-media-count";
    mediaCount.textContent = "0 medias";

    const footerActions = document.createElement("div");
    footerActions.className = "vdp-footer-actions";

    // Clear All button
    const clearAllBtn = document.createElement("button");
    clearAllBtn.className = "vdp-footer-btn vdp-danger-btn";
    clearAllBtn.textContent = "Clear All";
    clearAllBtn.title = "Clear all detected media";
    clearAllBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear all detected media for this page?")) {
        chrome.runtime.sendMessage({ action: "clearMedias", tabId: getTabId() }, (response) => {
          if (response && response.success) {
            detectedMedias.clear();
            renderAllMediaToPanel();
            showNotification("All media cleared");
          }
        });
      }
    });

    footerActions.appendChild(clearAllBtn);
    footer.appendChild(mediaCount);
    footer.appendChild(footerActions);

    mediaPanel.appendChild(header);
    mediaPanel.appendChild(filterBar);
    mediaPanel.appendChild(sortBar);
    mediaPanel.appendChild(content);
    mediaPanel.appendChild(footer);

    document.body.appendChild(mediaPanel);
    makeDraggable(mediaPanel, header);

    // Close dropdowns on outside click
    document.addEventListener("click", (e) => {
      if (openChipDropdown && !e.target.closest(".vdp-chip")) {
        const dd = mediaPanel.querySelector(`.vdp-chip-dropdown[data-category="${openChipDropdown}"]`);
        const btn = mediaPanel.querySelector(`.vdp-chip-btn[data-category="${openChipDropdown}"]`);
        if (dd) dd.classList.remove("open");
        if (btn) btn.classList.remove("open");
        openChipDropdown = null;
      }
    });

    return {
      panel: mediaPanel,
      content,
      mediaList,
      emptyState,
      footer,
      mediaCount,
      filterBar,
    };
  } catch (error) {
    console.error("Error creating media panel:", error);
    const fallback = document.createElement("div");
    fallback.className = "vdp-panel";
    fallback.innerHTML = '<div class="vdp-header"><div class="vdp-title">Media Downloader</div></div>';
    document.body.appendChild(fallback);
    return { panel: fallback, content: fallback, emptyState: null, mediaList: null };
  }
};

/**
 * Helper to get current tab ID (best effort from URL)
 */
const getTabId = () => {
  // In content scripts we don't have direct access to tab ID,
  // but we can send a message without it and let background handle it
  return undefined;
};

/**
 * ==============================
 * DRAGGABLE FUNCTIONALITY
 * ==============================
 */

const makeDraggable = (element, handle) => {
  try {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    const setInitialPosition = () => {
      element.style.top = "20px";
      element.style.right = "20px";
      element.style.left = "auto";
      const minRight = Math.max(20, window.innerWidth - element.offsetWidth - 40);
      element.style.right = `${minRight}px`;
    };

    setInitialPosition();

    window.addEventListener("resize", () => {
      try {
        if (element.style.left === "auto" || !element.style.left) {
          setInitialPosition();
        } else {
          const maxLeft = window.innerWidth - element.offsetWidth - 20;
          if (parseInt(element.style.left) > maxLeft) element.style.left = `${maxLeft}px`;
          if (parseInt(element.style.left) < 20) element.style.left = "20px";
          if (parseInt(element.style.top) > window.innerHeight - element.offsetHeight - 20)
            element.style.top = `${window.innerHeight - element.offsetHeight - 20}px`;
          if (parseInt(element.style.top) < 20) element.style.top = "20px";
        }
      } catch (resizeError) {
        console.error("Error handling resize:", resizeError);
      }
    });

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
      element.classList.add("vdp-dragging");
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      let newTop = Math.max(20, Math.min(window.innerHeight - element.offsetHeight - 20, element.offsetTop - pos2));
      let newLeft = Math.max(20, Math.min(window.innerWidth - element.offsetWidth - 20, element.offsetLeft - pos1));
      element.style.top = newTop + "px";
      element.style.left = newLeft + "px";
      element.style.right = "auto";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
      element.classList.remove("vdp-dragging");
    }
  } catch (error) {
    console.error("Error setting up draggable:", error);
  }
};

/**
 * ==============================
 * INITIALIZATION AND EVENT HANDLING
 * ==============================
 */

const handleBackgroundMessages = (message, sender, sendResponse) => {
  try {
    if (!message || !message.action) {
      sendResponse({ success: false, error: "Invalid message" });
      return true;
    }

    switch (message.action) {
      case "addMedia":
        handleAddMediaMessage(message, sendResponse);
        break;
      case "showPanel":
        handleShowPanelMessage(sendResponse);
        break;
      case "rescanPage":
        handleRescanPageMessage(sendResponse);
        break;
      case "clearMedias":
        handleClearMediasMessage(sendResponse);
        break;
      default:
        sendResponse({ success: false, error: "Unknown action" });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
  return true;
};

const handleAddMediaMessage = (message, sendResponse) => {
  try {
    if (!message.media || !message.media.url) {
      sendResponse({ success: false, error: "Invalid media data" });
      return;
    }

    const media = message.media;
    if (detectedMedias.has(media.url)) {
      sendResponse({ success: true, status: "already_detected" });
      return;
    }

    detectedMedias.set(media.url, media);
    if (mediaPanel) addMediaToPanel(media);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
};

const handleShowPanelMessage = (sendResponse) => {
  try {
    if (!mediaPanel) {
      const ui = createMediaPanel();
      mediaPanel = ui.panel;
    }

    // Load all media from storage to ensure nothing is missed
    chrome.runtime.sendMessage({ action: "getMedias" }, (response) => {
      if (chrome.runtime.lastError) {
        renderAllMediaToPanel();
        return;
      }

      if (response && response.medias) {
        Object.values(response.medias).forEach((tabMediaList) => {
          if (Array.isArray(tabMediaList)) {
            tabMediaList.forEach((media) => {
              if (media && media.url && !detectedMedias.has(media.url)) {
                detectedMedias.set(media.url, media);
              }
            });
          }
        });
      }
      renderAllMediaToPanel();
    });

    if (mediaPanel.classList.contains("collapsed")) {
      mediaPanel.classList.remove("collapsed");
      const minimizeBtn = mediaPanel.querySelector(".vdp-minimize");
      if (minimizeBtn) minimizeBtn.innerHTML = ICONS.minimize;
    }

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
};

const renderAllMediaToPanel = () => {
  try {
    if (!mediaPanel) return;
    const content = mediaPanel.querySelector(".vdp-content");
    if (!content) return;

    content.innerHTML = "";
    const mediaList = document.createElement("ul");
    mediaList.className = "vdp-media-list";
    content.appendChild(mediaList);

    // Sort medias before rendering
    const sortedMedias = getSortedMedias();
    sortedMedias.forEach((media) => {
      const item = createMediaItem(media);
      if (item) mediaList.appendChild(item);
    });

    const totalCount = detectedMedias.size;
    const countText = totalCount === 1 ? "1 media" : `${totalCount} medias`;
    const mediaCountEl = mediaPanel.querySelector(".vdp-media-count");
    if (mediaCountEl) mediaCountEl.textContent = countText;

    applyFilter();
  } catch (error) {
    console.error("Error rendering media to panel:", error);
  }
};

const handleRescanPageMessage = (sendResponse) => {
  try {
    detectedMedias.clear();
    if (mediaPanel) { mediaPanel.remove(); mediaPanel = null; }
    initialize();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
};

const handleClearMediasMessage = (sendResponse) => {
  try {
    detectedMedias.clear();
    if (mediaPanel) { mediaPanel.remove(); mediaPanel = null; }
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
};

const monitorUrlChanges = () => {
  try {
    if (currentPageUrl !== window.location.href) {
      currentPageUrl = window.location.href;
      detectedMedias.clear();
      if (mediaPanel) { mediaPanel.remove(); mediaPanel = null; }
    }
  } catch (error) {
    console.error("Error monitoring URL changes:", error);
  }
};

const initialize = () => {
  try {
    if (isInitialized) return;
    isInitialized = true;
    currentPageUrl = window.location.href;

    // Load saved filter state and sort option
    loadFilterState();

    chrome.runtime.onMessage.addListener(handleBackgroundMessages);
    setInterval(monitorUrlChanges, CONFIG.URL_CHECK_INTERVAL);
  } catch (error) {
    console.error("Error initializing content script:", error);
    isInitialized = false;
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
