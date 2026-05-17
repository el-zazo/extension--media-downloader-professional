/**
 * Media Downloader Professional - Popup Script
 * Handles the extension popup functionality with multi-select filters,
 * sorting, and media preview/playback
 */

// Constants
import { IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, MEDIA_EXTENSIONS, DEFAULT_TAB, STORAGE_KEYS, ACTIONS, SORT_OPTIONS, DEFAULT_SORT } from "./constants.js";

// Icons
import { ICONS } from "./icons.js";

// Utility functions
import { utils } from "./utils.js";

// UI functions
import { ui } from "./ui.js";

// HTML escaping function to prevent XSS
const escapeHTML = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// ===== DETECTED MEDIA FILTER & SORT STATE =====
// Filter state: each category maps to a Set of selected extensions.
// An empty Set means "show all" for that category.
let filterState = {
  videos: new Set(),
  images: new Set(),
  audio: new Set(),
};

// Current sort option for detected media
let currentSort = DEFAULT_SORT;

// ===== SAVED MEDIA FILTER & SORT STATE =====
// Separate filter state for saved media tab
let savedFilterState = {
  videos: new Set(),
  images: new Set(),
  audio: new Set(),
};

// Current sort option for saved media
let savedCurrentSort = DEFAULT_SORT;

// Track active tab
let activeTab = DEFAULT_TAB;

// Modal variables
let currentSaveUrl = "";
let suggestedFilename = "";

// Currently open chip dropdown (only one at a time, across both tabs)
let openDropdown = null;
let openDropdownSection = null; // "detected" or "saved"

// ===== FILTER & SORT STATE PERSISTENCE =====

/**
 * Loads the saved filter state and sort options from chrome.storage.local
 * for both detected and saved media sections
 * @returns {Promise<void>}
 */
const loadFilterState = () => {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      STORAGE_KEYS.FILTER_STATE, STORAGE_KEYS.SORT_OPTION,
      STORAGE_KEYS.SAVED_FILTER_STATE, STORAGE_KEYS.SAVED_SORT_OPTION,
    ], (result) => {
      // Detected media filter state
      if (result[STORAGE_KEYS.FILTER_STATE]) {
        const saved = result[STORAGE_KEYS.FILTER_STATE];
        filterState.videos = new Set(saved.videos || []);
        filterState.images = new Set(saved.images || []);
        filterState.audio = new Set(saved.audio || []);
      }
      if (result[STORAGE_KEYS.SORT_OPTION] && Object.values(SORT_OPTIONS).includes(result[STORAGE_KEYS.SORT_OPTION])) {
        currentSort = result[STORAGE_KEYS.SORT_OPTION];
      }
      // Saved media filter state
      if (result[STORAGE_KEYS.SAVED_FILTER_STATE]) {
        const saved = result[STORAGE_KEYS.SAVED_FILTER_STATE];
        savedFilterState.videos = new Set(saved.videos || []);
        savedFilterState.images = new Set(saved.images || []);
        savedFilterState.audio = new Set(saved.audio || []);
      }
      if (result[STORAGE_KEYS.SAVED_SORT_OPTION] && Object.values(SORT_OPTIONS).includes(result[STORAGE_KEYS.SAVED_SORT_OPTION])) {
        savedCurrentSort = result[STORAGE_KEYS.SAVED_SORT_OPTION];
      }
      resolve();
    });
  });
};

/**
 * Saves the detected media filter state to chrome.storage.local
 */
const saveFilterState = () => {
  const state = {
    videos: Array.from(filterState.videos),
    images: Array.from(filterState.images),
    audio: Array.from(filterState.audio),
  };
  chrome.storage.local.set({ [STORAGE_KEYS.FILTER_STATE]: state });
};

/**
 * Saves the detected media sort option to chrome.storage.local
 */
const saveSortOption = () => {
  chrome.storage.local.set({ [STORAGE_KEYS.SORT_OPTION]: currentSort });
};

/**
 * Saves the saved media filter state to chrome.storage.local
 */
const saveSavedFilterState = () => {
  const state = {
    videos: Array.from(savedFilterState.videos),
    images: Array.from(savedFilterState.images),
    audio: Array.from(savedFilterState.audio),
  };
  chrome.storage.local.set({ [STORAGE_KEYS.SAVED_FILTER_STATE]: state });
};

/**
 * Saves the saved media sort option to chrome.storage.local
 */
const saveSavedSortOption = () => {
  chrome.storage.local.set({ [STORAGE_KEYS.SAVED_SORT_OPTION]: savedCurrentSort });
};

/**
 * Resets all detected media filter selections and saves the state
 */
const resetFilters = () => {
  filterState.videos.clear();
  filterState.images.clear();
  filterState.audio.clear();
  saveFilterState();
  updateFilterUI("detected");
  loadMedias();
};

/**
 * Resets all saved media filter selections and saves the state
 */
const resetSavedFilters = () => {
  savedFilterState.videos.clear();
  savedFilterState.images.clear();
  savedFilterState.audio.clear();
  saveSavedFilterState();
  updateFilterUI("saved");
  loadSavedMedia();
};

// ===== CHECK IF ANY FILTER IS ACTIVE =====

/**
 * Returns true if at least one category has specific filters selected
 * for the detected media section
 */
const isAnyFilterActive = () => {
  return filterState.videos.size > 0 || filterState.images.size > 0 || filterState.audio.size > 0;
};

/**
 * Returns true if at least one category has specific filters selected
 * for the saved media section
 */
const isAnySavedFilterActive = () => {
  return savedFilterState.videos.size > 0 || savedFilterState.images.size > 0 || savedFilterState.audio.size > 0;
};

// ===== MEDIA OPERATIONS =====

// Save media to device with custom filename
const saveMedia = (url, filename) => {
  try {
    currentSaveUrl = url;
    suggestedFilename = filename;
    const saveModalUrl = document.getElementById("saveModalUrl");
    saveModalUrl.textContent = url;
    const customFilenameInput = document.getElementById("customFilename");
    customFilenameInput.value = filename;
    const saveModal = document.getElementById("saveModal");
    saveModal.classList.add("active");
    customFilenameInput.focus();
    customFilenameInput.select();
  } catch (error) {
    console.error("Error preparing save dialog:", error);
    ui.showNotification("Failed to open save dialog");
  }
};

// Add media to saved list and storage
const addToSavedMedia = (media) => {
  chrome.storage.local.get([STORAGE_KEYS.SAVED_MEDIA], (result) => {
    const savedMedia = result.savedMedia || [];
    const exists = savedMedia.some((item) => item.url === media.url);
    if (!exists) {
      savedMedia.push(media);
      chrome.storage.local.set({ [STORAGE_KEYS.SAVED_MEDIA]: savedMedia }, () => {
        ui.showNotification("Media saved to library");
        if (activeTab === "saved") {
          loadSavedMedia();
        }
      });
    } else {
      ui.showNotification("This media is already saved");
    }
  });
};

// Remove a saved media item by URL
const removeSavedMedia = (url) => {
  if (confirm("Are you sure you want to remove this media from your library?")) {
    chrome.storage.local.get([STORAGE_KEYS.SAVED_MEDIA], (result) => {
      let savedMedia = result.savedMedia || [];
      savedMedia = savedMedia.filter((item) => item.url !== url);
      chrome.storage.local.set({ [STORAGE_KEYS.SAVED_MEDIA]: savedMedia }, () => {
        ui.showNotification("Media removed from library");
        loadSavedMedia();
      });
    });
  }
};

// Process the actual download
const downloadMedia = (url, filename) => {
  try {
    const absoluteUrl = new URL(url, window.location.href).href;
    chrome.runtime
      .sendMessage({
        action: ACTIONS.DOWNLOAD_MEDIA,
        url: absoluteUrl,
        filename: filename,
      })
      .then(() => {
        ui.showNotification("Download started");
      })
      .catch((error) => {
        console.error("Error starting download:", error);
        ui.showNotification("Download failed: " + error.message);
      });
  } catch (error) {
    console.error("Error saving media:", error);
    ui.showNotification("Failed to save media");
  }
};

// ===== MEDIA PREVIEW / PLAYBACK =====

/**
 * Opens the preview modal for a media item
 * @param {Object} media - The media object to preview
 */
const previewMedia = (media) => {
  try {
    if (!media || !media.url) return;

    const previewModal = document.getElementById("previewModal");
    const previewTitle = document.getElementById("previewTitle");
    const previewBody = document.getElementById("previewBody");
    const previewOpenLink = document.getElementById("previewOpenLink");

    const extension = (media.extension || "").toLowerCase();
    const mime = media.mime || "";
    const isImage = IMAGE_EXTENSIONS.includes(extension) || mime.includes("image/");
    const isAudio = AUDIO_EXTENSIONS.includes(extension) || mime.includes("audio/");

    // Set title
    const typeLabel = isImage ? "Image" : isAudio ? "Audio" : "Video";
    previewTitle.textContent = `${typeLabel} Preview — ${extension.toUpperCase()}`;

    // Clear previous content and stop any playing media
    const prevVideo = previewBody.querySelector("video");
    const prevAudio = previewBody.querySelector("audio");
    if (prevVideo) prevVideo.pause();
    if (prevAudio) prevAudio.pause();
    previewBody.innerHTML = "";

    if (isImage) {
      const img = document.createElement("img");
      img.src = media.url;
      img.alt = "Media preview";
      img.onerror = () => {
        previewBody.innerHTML = '<div style="color:#999;padding:20px;text-align:center;">Failed to load image</div>';
      };
      previewBody.appendChild(img);
    } else if (isAudio) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.autoplay = true;
      audio.src = media.url;
      audio.onerror = () => {
        previewBody.innerHTML = '<div style="color:#999;padding:20px;text-align:center;">Failed to load audio</div>';
      };
      previewBody.appendChild(audio);
    } else {
      // Video
      const video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.style.width = "100%";
      video.src = media.url;
      video.onerror = () => {
        previewBody.innerHTML = '<div style="color:#999;padding:20px;text-align:center;">Failed to load video. Try opening in a new tab.</div>';
      };
      previewBody.appendChild(video);
    }

    // Set "Open in new tab" link
    previewOpenLink.href = media.url;

    // Show modal
    previewModal.classList.add("active");
  } catch (error) {
    console.error("Error previewing media:", error);
    ui.showNotification("Failed to preview media");
  }
};

/**
 * Closes the preview modal and stops any playing media
 */
const closePreview = () => {
  const previewModal = document.getElementById("previewModal");
  const previewBody = document.getElementById("previewBody");

  // Stop any playing media
  const video = previewBody.querySelector("video");
  const audio = previewBody.querySelector("audio");
  if (video) video.pause();
  if (audio) audio.pause();

  previewBody.innerHTML = "";
  previewModal.classList.remove("active");
};

// ===== SORT LOGIC =====

/**
 * Sorts an array of media items based on the given sort option
 * @param {Array} medias - Array of media objects
 * @param {string} sortOption - The sort option to use
 * @param {string} dateField - The field name for date sorting ("timestamp" or "savedAt")
 * @returns {Array} - Sorted array
 */
const sortMediasByOption = (medias, sortOption, dateField = "timestamp") => {
  if (!Array.isArray(medias)) return [];

  const sorted = [...medias];
  switch (sortOption) {
    case SORT_OPTIONS.DATE_DESC:
      sorted.sort((a, b) => (b[dateField] || b.timestamp || 0) - (a[dateField] || a.timestamp || 0));
      break;
    case SORT_OPTIONS.DATE_ASC:
      sorted.sort((a, b) => ((a[dateField] || a.timestamp || 0) - (b[dateField] || b.timestamp || 0)));
      break;
    case SORT_OPTIONS.SIZE_DESC:
      sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
      break;
    case SORT_OPTIONS.SIZE_ASC:
      sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
      break;
    case SORT_OPTIONS.TYPE_ASC:
      sorted.sort((a, b) => {
        const extA = (a.extension || "").toLowerCase();
        const extB = (b.extension || "").toLowerCase();
        return extA.localeCompare(extB);
      });
      break;
    case SORT_OPTIONS.TYPE_DESC:
      sorted.sort((a, b) => {
        const extA = (a.extension || "").toLowerCase();
        const extB = (b.extension || "").toLowerCase();
        return extB.localeCompare(extA);
      });
      break;
    default:
      sorted.sort((a, b) => (b[dateField] || b.timestamp || 0) - (a[dateField] || a.timestamp || 0));
  }
  return sorted;
};

/**
 * Sorts an array of media items based on the detected media current sort option
 */
const sortMedias = (medias) => sortMediasByOption(medias, currentSort, "timestamp");

/**
 * Sorts an array of saved media items based on the saved media current sort option
 */
const sortSavedMedias = (medias) => sortMediasByOption(medias, savedCurrentSort, "savedAt");

// ===== MEDIA ITEM UI =====

// Create media item element
const createMediaItem = (media, medias) => {
  const item = document.createElement("li");
  item.className = "media-item";

  const extension = media.extension || "unknown";
  const isAudio = media.mime && media.mime.includes("audio");
  const isImage = (media.mime && media.mime.includes("image")) || IMAGE_EXTENSIONS.includes(extension.toLowerCase());

  // Count by media type
  let imageCount = 0;
  let nonImageCount = 0;

  const isItemImage = (itm) => {
    const ext = itm.extension?.toLowerCase() || "";
    const m = itm.mime || "";
    return IMAGE_EXTENSIONS.includes(ext) || m.includes("image/");
  };

  for (let i = 0; i < medias.length; i++) {
    const itm = medias[i];
    if (itm.url === media.url) break;
    if (isItemImage(itm)) imageCount++;
    else nonImageCount++;
  }

  const typeCount = isImage ? imageCount + 1 : nonImageCount + 1;
  const title = isImage ? `Image ${typeCount}` : isAudio ? `Audio ${typeCount}` : `Video ${typeCount}`;
  const size = utils.formatFileSize(media.size);
  const datetime = utils.formatDateTime(media.timestamp || Date.now());
  const displayUrl = media.url.length > 60 ? media.url.substring(0, 57) + "..." : media.url;
  const filename = `${isImage ? "image" : isAudio ? "audio" : "video"}_${typeCount}.${extension}`;

  item.innerHTML = `
    <div class="media-icon">
      ${isImage ? ICONS.image : isAudio ? ICONS.audio : ICONS.video}
    </div>
    <div class="media-info">
      <div class="media-title" title="${escapeHTML(media.url)}">${escapeHTML(title)}</div>
      <div class="media-url" title="${escapeHTML(media.url)}">${escapeHTML(displayUrl)}</div>
      <div class="media-meta">
        <span class="media-format">${escapeHTML(extension.toUpperCase())}</span>
        <span class="media-size">${escapeHTML(size)}</span>
        <span class="media-time">Added: ${escapeHTML(datetime)}</span>
      </div>
    </div>
    <div class="media-actions">
      <button class="action-btn preview-btn" title="Preview">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </button>
      <button class="action-btn download-btn" title="Download">
        ${ICONS.download}
      </button>
      <button class="action-btn copy-btn" title="Copy URL">
        ${ICONS.copy}
      </button>
      <button class="action-btn save-btn" title="Save Media">
        ${ICONS.save}
      </button>
    </div>
  `;

  const previewBtn = item.querySelector(".preview-btn");
  previewBtn.addEventListener("click", (e) => { e.stopPropagation(); previewMedia(media); });

  const copyBtn = item.querySelector(".copy-btn");
  copyBtn.addEventListener("click", (e) => { e.stopPropagation(); utils.copyToClipboard(media.url); });

  const downloadBtn = item.querySelector(".download-btn");
  downloadBtn.addEventListener("click", (e) => { e.stopPropagation(); downloadMedia(media.url, filename); });

  const saveBtn = item.querySelector(".save-btn");
  saveBtn.addEventListener("click", (e) => { e.stopPropagation(); saveMedia(media.url, filename); });

  return item;
};

// Create a saved media item
const createSavedMediaItem = (media, index) => {
  const item = document.createElement("li");
  item.className = "media-item saved-item";

  const extension = media.extension || "unknown";
  const isAudio = media.mime && media.mime.includes("audio");
  const isImage = (media.mime && media.mime.includes("image")) || IMAGE_EXTENSIONS.includes(extension.toLowerCase());
  const size = utils.formatFileSize(media.size);
  const datetime = utils.formatDateTime(media.savedAt || media.timestamp || Date.now());
  const displayUrl = media.url.length > 60 ? media.url.substring(0, 57) + "..." : media.url;
  const title = media.customTitle || `${isImage ? "Image" : isAudio ? "Audio" : "Video"} ${index + 1}`;

  item.innerHTML = `
    <div class="media-icon">
      ${isImage ? ICONS.image : isAudio ? ICONS.audio : ICONS.video}
    </div>
    <div class="media-info">
      <div class="media-title" title="${escapeHTML(media.url)}">${escapeHTML(title)}</div>
      <div class="media-url" title="${escapeHTML(media.url)}">${escapeHTML(displayUrl)}</div>
      <div class="media-meta">
        <span class="media-format">${escapeHTML(extension.toUpperCase())}</span>
        <span class="media-size">${escapeHTML(size)}</span>
        <span class="media-time">Saved: ${escapeHTML(datetime)}</span>
      </div>
    </div>
    <div class="media-actions">
      <button class="action-btn preview-btn" title="Preview">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </button>
      <button class="action-btn copy-btn" title="Copy URL">
        ${ICONS.copy}
      </button>
      <button class="action-btn download-btn" title="Download">
        ${ICONS.download}
      </button>
      <button class="action-btn delete-btn" title="Remove">
        ${ICONS.delete}
      </button>
    </div>
  `;

  const previewBtn = item.querySelector(".preview-btn");
  previewBtn.addEventListener("click", (e) => { e.stopPropagation(); previewMedia(media); });

  const copyBtn = item.querySelector(".copy-btn");
  copyBtn.addEventListener("click", (e) => { e.stopPropagation(); utils.copyToClipboard(media.url); });

  const downloadBtn = item.querySelector(".download-btn");
  downloadBtn.addEventListener("click", (e) => { e.stopPropagation(); downloadMedia(media.url, media.filename); });

  const deleteBtn = item.querySelector(".delete-btn");
  deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); removeSavedMedia(media.url); });

  return item;
};

// ===== FILTER LOGIC =====

const getFileType = (media) => {
  const extension = media.extension?.toLowerCase() || "";
  const mime = media.mime || "";
  if (IMAGE_EXTENSIONS.includes(extension) || mime.includes("image/")) {
    return extension || mime.split("/")[1] || "image";
  }
  if (AUDIO_EXTENSIONS.includes(extension) || mime.includes("audio/")) {
    return extension || mime.split("/")[1] || "audio";
  }
  return extension || mime.split("/")[1] || "video";
};

/**
 * Returns the category of a media item: "images", "audio", or "videos"
 */
const getMediaCategory = (media) => {
  const fileType = getFileType(media);
  const mime = media.mime || "";
  if (IMAGE_EXTENSIONS.includes(fileType) || mime.includes("image/")) return "images";
  if (AUDIO_EXTENSIONS.includes(fileType) || mime.includes("audio/")) return "audio";
  return "videos";
};

/**
 * Checks if a media item matches the detected media filter state
 */
const matchesFilter = (media) => {
  const fileType = getFileType(media);
  const category = getMediaCategory(media);

  if (!isAnyFilterActive()) return true;

  const categoryFilter = filterState[category];
  if (categoryFilter.size > 0) {
    return categoryFilter.has(fileType);
  } else {
    return false;
  }
};

/**
 * Checks if a saved media item matches the saved media filter state
 */
const matchesSavedFilter = (media) => {
  const fileType = getFileType(media);
  const category = getMediaCategory(media);

  if (!isAnySavedFilterActive()) return true;

  const categoryFilter = savedFilterState[category];
  if (categoryFilter.size > 0) {
    return categoryFilter.has(fileType);
  } else {
    return false;
  }
};

/**
 * Applies the current filter and sort to the detected media list and updates the UI
 * @param {Array} medias - All media items for the current tab
 */
const applyFilter = (medias) => {
  const mediaList = document.getElementById("mediaList");
  const emptyState = document.getElementById("emptyState");

  // Filter medias
  const filteredMedias = medias.filter((media) => matchesFilter(media));

  // Sort the filtered results
  const sortedMedias = sortMedias(filteredMedias);

  // Update category counts on chips
  updateChipCounts(medias, "detected");

  // Clear previous list items
  mediaList.innerHTML = "";

  if (sortedMedias.length === 0) {
    emptyState.style.display = "block";
    mediaList.style.display = "none";

    if (medias.length > 0) {
      emptyState.innerHTML = `
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </div>
        <div>No media matches the current filter.</div>
        <div style="margin-top: 8px; font-size: 12px">Try adjusting the filter or click Reset.</div>
      `;
    } else {
      emptyState.innerHTML = `
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div>No media detected on this page.</div>
        <div style="margin-top: 8px; font-size: 12px">Browse the page to detect media automatically.</div>
      `;
    }
  } else {
    emptyState.style.display = "none";
    mediaList.style.display = "block";
    sortedMedias.forEach((media) => {
      const item = createMediaItem(media, sortedMedias);
      mediaList.appendChild(item);
    });
  }

  // Update total count text
  const mediaCount = document.getElementById("mediaCount");
  mediaCount.textContent = `${medias.length} medias`;
};

/**
 * Updates the count badges on each filter chip for a given section
 * @param {Array} medias - All media items
 * @param {string} section - "detected" or "saved"
 */
const updateChipCounts = (medias, section) => {
  let videoCount = 0, imageCount = 0, audioCount = 0;
  medias.forEach((media) => {
    const category = getMediaCategory(media);
    if (category === "images") imageCount++;
    else if (category === "audio") audioCount++;
    else videoCount++;
  });

  const sectionAttr = section === "saved" ? '[data-section="saved"]' : ':not([data-section])';
  const vc = document.querySelector(`.chip-count[data-category="videos"]${sectionAttr}`) ||
             document.querySelector(`.chip-count[data-category="videos"][data-section="${section}"]`);
  const ic = document.querySelector(`.chip-count[data-category="images"][data-section="${section}"]`);
  const ac = document.querySelector(`.chip-count[data-category="audio"][data-section="${section}"]`);
  if (vc) vc.textContent = videoCount;
  if (ic) ic.textContent = imageCount;
  if (ac) ac.textContent = audioCount;
};

// ===== FILTER CHIP DROPDOWN SETUP =====

/**
 * Populates the chip dropdown checkboxes for each category in a section
 * @param {string} section - "detected" or "saved"
 */
const setupFilterChips = (section) => {
  const categories = {
    videos: VIDEO_EXTENSIONS,
    images: IMAGE_EXTENSIONS,
    audio: AUDIO_EXTENSIONS,
  };

  const currentFilterState = section === "saved" ? savedFilterState : filterState;

  Object.entries(categories).forEach(([category, extensions]) => {
    const dropdown = document.querySelector(`.chip-dropdown[data-category="${category}"][data-section="${section}"]`);
    if (!dropdown) return;

    dropdown.innerHTML = "";

    // "Select All" toggle
    const selectAllLabel = document.createElement("label");
    selectAllLabel.className = "select-all-label";
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.checked = currentFilterState[category].size === 0;
    selectAllCheckbox.addEventListener("change", () => {
      if (selectAllCheckbox.checked) {
        currentFilterState[category].clear();
        extensions.forEach((ext) => {
          const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
          if (cb) cb.checked = false;
        });
      } else {
        extensions.forEach((ext) => currentFilterState[category].add(ext));
        extensions.forEach((ext) => {
          const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
          if (cb) cb.checked = true;
        });
      }
      if (section === "saved") {
        saveSavedFilterState();
        updateChipActiveState(category, "saved");
        loadSavedMedia();
      } else {
        saveFilterState();
        updateChipActiveState(category, "detected");
        loadMedias();
      }
    });
    selectAllLabel.appendChild(selectAllCheckbox);
    selectAllLabel.appendChild(document.createTextNode("Show All"));
    dropdown.appendChild(selectAllLabel);

    // Individual extension checkboxes
    extensions.forEach((ext) => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.ext = ext;
      checkbox.checked = currentFilterState[category].has(ext);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          currentFilterState[category].add(ext);
        } else {
          currentFilterState[category].delete(ext);
        }
        // Update "Select All" state
        selectAllCheckbox.checked = currentFilterState[category].size === 0;
        if (section === "saved") {
          saveSavedFilterState();
          updateChipActiveState(category, "saved");
          loadSavedMedia();
        } else {
          saveFilterState();
          updateChipActiveState(category, "detected");
          loadMedias();
        }
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(ext.toUpperCase()));
      dropdown.appendChild(label);
    });
  });
};

/**
 * Updates the active/inactive visual state of a chip button
 * @param {string} category - The category name
 * @param {string} section - "detected" or "saved"
 */
const updateChipActiveState = (category, section) => {
  const chipBtn = document.querySelector(`.chip-btn[data-category="${category}"][data-section="${section}"]`);
  if (!chipBtn) return;

  const currentFilterState = section === "saved" ? savedFilterState : filterState;

  if (currentFilterState[category].size > 0) {
    chipBtn.classList.add("active");
  } else {
    chipBtn.classList.remove("active");
  }
};

/**
 * Updates all chip active states to match current filterState for a section
 * @param {string} section - "detected" or "saved"
 */
const updateFilterUI = (section) => {
  const currentFilterState = section === "saved" ? savedFilterState : filterState;

  ["videos", "images", "audio"].forEach((category) => {
    updateChipActiveState(category, section);
    // Update checkboxes in dropdown
    const dropdown = document.querySelector(`.chip-dropdown[data-category="${category}"][data-section="${section}"]`);
    if (!dropdown) return;

    const selectAllCb = dropdown.querySelector(".select-all-label input");
    if (selectAllCb) selectAllCb.checked = currentFilterState[category].size === 0;

    const extensions = category === "videos" ? VIDEO_EXTENSIONS : category === "images" ? IMAGE_EXTENSIONS : AUDIO_EXTENSIONS;
    extensions.forEach((ext) => {
      const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
      if (cb) cb.checked = currentFilterState[category].has(ext);
    });
  });
};

/**
 * Toggles a chip dropdown open/closed
 * Uses position:fixed for the dropdown to escape overflow clipping
 * @param {string} category - The category to toggle
 * @param {string} section - "detected" or "saved"
 */
const toggleChipDropdown = (category, section) => {
  // Close any other open dropdown (across both sections)
  if (openDropdown && (openDropdown !== category || openDropdownSection !== section)) {
    const prevDropdown = document.querySelector(`.chip-dropdown[data-category="${openDropdown}"][data-section="${openDropdownSection}"]`);
    const prevBtn = document.querySelector(`.chip-btn[data-category="${openDropdown}"][data-section="${openDropdownSection}"]`);
    if (prevDropdown) prevDropdown.classList.remove("open");
    if (prevBtn) prevBtn.classList.remove("open");
  }

  const dropdown = document.querySelector(`.chip-dropdown[data-category="${category}"][data-section="${section}"]`);
  const chipBtn = document.querySelector(`.chip-btn[data-category="${category}"][data-section="${section}"]`);

  if (dropdown && chipBtn) {
    const isOpen = dropdown.classList.contains("open");
    dropdown.classList.toggle("open");
    chipBtn.classList.toggle("open");
    openDropdown = isOpen ? null : category;
    openDropdownSection = isOpen ? null : section;

    // Position the fixed dropdown relative to the chip button
    if (!isOpen) {
      const btnRect = chipBtn.getBoundingClientRect();
      dropdown.style.left = btnRect.left + "px";
      dropdown.style.top = (btnRect.bottom + 4) + "px";
    }
  }
};

// ===== DATA LOADING =====

// Load medias for current tab
const loadMedias = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    const currentTab = tabs[0];
    const tabId = currentTab.id;

    chrome.runtime.sendMessage({ action: ACTIONS.GET_MEDIAS, tabId: tabId }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting medias:", chrome.runtime.lastError);
        return;
      }
      if (response && response.medias) {
        const tabMedias = response.medias[tabId] || [];
        applyFilter(tabMedias);
      } else {
        applyFilter([]);
      }
    });
  });
};

// Load saved media from storage with filter and sort
const loadSavedMedia = () => {
  const savedMediaList = document.getElementById("savedMediaList");
  const savedEmptyState = document.getElementById("savedEmptyState");
  const savedMediaCount = document.getElementById("savedMediaCount");

  chrome.storage.local.get([STORAGE_KEYS.SAVED_MEDIA], (result) => {
    const allSavedMedia = result.savedMedia || [];

    // Apply filter
    const filteredSavedMedia = allSavedMedia.filter((media) => matchesSavedFilter(media));

    // Apply sort
    const sortedSavedMedia = sortSavedMedias(filteredSavedMedia);

    // Update chip counts for saved section
    updateChipCounts(allSavedMedia, "saved");

    if (sortedSavedMedia.length === 0) {
      savedMediaList.style.display = "none";
      savedEmptyState.style.display = "block";

      if (allSavedMedia.length > 0) {
        savedEmptyState.innerHTML = `
          <div class="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </div>
          <div>No saved media matches the current filter.</div>
          <div style="margin-top: 8px; font-size: 12px">Try adjusting the filter or click Reset.</div>
        `;
      } else {
        savedEmptyState.innerHTML = `
          <div class="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>No saved media yet.</div>
          <div style="margin-top: 8px; font-size: 12px">Use the save button to save media for later.</div>
        `;
      }
      savedMediaCount.textContent = `${allSavedMedia.length} saved`;
    } else {
      savedEmptyState.style.display = "none";
      savedMediaList.style.display = "block";
      savedMediaCount.textContent = `${allSavedMedia.length} saved`;
      savedMediaList.innerHTML = "";
      sortedSavedMedia.forEach((media, index) => {
        const item = createSavedMediaItem(media, index);
        savedMediaList.appendChild(item);
      });
    }
  });
};

// Clear all saved media
const clearSavedMedia = () => {
  if (confirm("Are you sure you want to clear all saved media?")) {
    chrome.storage.local.set({ [STORAGE_KEYS.SAVED_MEDIA]: [] }, () => {
      ui.showNotification("All saved media cleared");
      loadSavedMedia();
    });
  }
};

// Clear all detected medias for the current tab
const clearAllMedias = () => {
  if (confirm("Are you sure you want to clear all detected media for this page?")) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      const currentTab = tabs[0];
      const tabId = currentTab.id;

      chrome.runtime.sendMessage({ action: ACTIONS.CLEAR_MEDIAS, tabId: tabId }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error clearing medias:", chrome.runtime.lastError);
          ui.showNotification("Failed to clear media");
          return;
        }
        if (response && response.success) {
          ui.showNotification("All detected media cleared");
          loadMedias();
        } else {
          ui.showNotification("Failed to clear media");
        }
      });
    });
  }
};

// Show media panel in the current page
const showInPage = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    const currentTab = tabs[0];
    chrome.tabs.sendMessage(currentTab.id, { action: ACTIONS.SHOW_PANEL }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error showing panel:", chrome.runtime.lastError);
        return;
      }
      window.close();
    });
  });
};

// Scan page again for medias
const rescanPage = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    const currentTab = tabs[0];
    chrome.tabs.sendMessage(currentTab.id, { action: ACTIONS.RESCAN_PAGE }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error rescanning page:", chrome.runtime.lastError);
        return;
      }
      ui.showNotification("Scanning page for media...");
      setTimeout(loadMedias, 1000);
    });
  });
};

// Switch between tabs
const switchTab = (tab) => {
  activeTab = tab;
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  const tabContents = document.querySelectorAll(".tab-content");
  tabContents.forEach((content) => {
    content.classList.toggle("active", content.dataset.tab === tab);
  });
  if (tab === "saved") {
    loadSavedMedia();
  } else {
    loadMedias();
  }
};

// ===== INITIALIZATION =====

document.addEventListener("DOMContentLoaded", () => {
  // Load saved filter states and sort options, then setup UI
  loadFilterState().then(() => {
    // Setup detected media filter chips
    setupFilterChips("detected");
    updateFilterUI("detected");

    // Setup saved media filter chips
    setupFilterChips("saved");
    updateFilterUI("saved");

    // Restore detected sort dropdown to saved value
    const sortSelect = document.getElementById("sortSelect");
    if (sortSelect) {
      sortSelect.value = currentSort;
    }

    // Restore saved sort dropdown to saved value
    const savedSortSelect = document.getElementById("savedSortSelect");
    if (savedSortSelect) {
      savedSortSelect.value = savedCurrentSort;
    }
  });

  // Chip button click handlers for both sections
  document.querySelectorAll(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const category = btn.dataset.category;
      const section = btn.dataset.section || "detected";
      toggleChipDropdown(category, section);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (openDropdown && !e.target.closest(".filter-chip")) {
      const dropdown = document.querySelector(`.chip-dropdown[data-category="${openDropdown}"][data-section="${openDropdownSection}"]`);
      const chipBtn = document.querySelector(`.chip-btn[data-category="${openDropdown}"][data-section="${openDropdownSection}"]`);
      if (dropdown) dropdown.classList.remove("open");
      if (chipBtn) chipBtn.classList.remove("open");
      openDropdown = null;
      openDropdownSection = null;
    }
  });

  // Reset filters button - detected
  const resetBtn = document.getElementById("resetFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetFilters);
  }

  // Reset filters button - saved
  const savedResetBtn = document.getElementById("savedResetFiltersBtn");
  if (savedResetBtn) {
    savedResetBtn.addEventListener("click", resetSavedFilters);
  }

  // Sort select change handler - detected
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentSort = sortSelect.value;
      saveSortOption();
      loadMedias();
    });
  }

  // Sort select change handler - saved
  const savedSortSelect = document.getElementById("savedSortSelect");
  if (savedSortSelect) {
    savedSortSelect.addEventListener("change", () => {
      savedCurrentSort = savedSortSelect.value;
      saveSavedSortOption();
      loadSavedMedia();
    });
  }

  // Page action buttons
  const showInPageBtn = document.getElementById("showInPageBtn");
  if (showInPageBtn) {
    showInPageBtn.addEventListener("click", showInPage);
  }
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", rescanPage);
  }

  // Clear all detected media button
  const clearAllBtn = document.getElementById("clearAllBtn");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", clearAllMedias);
  }

  // Tab switching
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Clear saved media button
  const clearSavedBtn = document.getElementById("clearSavedBtn");
  if (clearSavedBtn) {
    clearSavedBtn.addEventListener("click", clearSavedMedia);
  }

  // Save modal buttons
  const confirmSaveBtn = document.getElementById("confirmSaveBtn");
  const cancelSaveBtn = document.getElementById("cancelSaveBtn");
  const saveModal = document.getElementById("saveModal");
  const customFilenameInput = document.getElementById("customFilename");

  if (confirmSaveBtn) {
    confirmSaveBtn.addEventListener("click", () => {
      const customFilename = customFilenameInput.value.trim();
      if (customFilename) {
        const extension = suggestedFilename.split(".").pop();
        const finalFilename = customFilename.includes(".") ? customFilename : `${customFilename}.${extension}`;
        const savedAt = Date.now();

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length === 0) return;
          const currentTab = tabs[0];
          const tabId = currentTab.id;

          chrome.runtime.sendMessage({ action: ACTIONS.GET_MEDIAS, tabId: tabId }, (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error getting media data:", chrome.runtime.lastError);
              return;
            }
            if (response && response.medias) {
              const tabMedias = response.medias[tabId] || [];
              const originalMedia = tabMedias.find((m) => m.url === currentSaveUrl);
              const media = {
                url: currentSaveUrl,
                filename: finalFilename,
                customTitle: customFilename.split(".")[0],
                extension: extension,
                savedAt: savedAt,
                size: originalMedia ? originalMedia.size : 0,
                mime: originalMedia ? originalMedia.mime : "",
              };
              addToSavedMedia(media);
              saveModal.classList.remove("active");
            }
          });
        });
      } else {
        ui.showNotification("Please enter a filename");
      }
    });
  }

  if (cancelSaveBtn) {
    cancelSaveBtn.addEventListener("click", () => {
      saveModal.classList.remove("active");
    });
  }

  if (customFilenameInput) {
    customFilenameInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") confirmSaveBtn.click();
      else if (e.key === "Escape") cancelSaveBtn.click();
    });
  }

  // Preview modal close
  const previewCloseBtn = document.getElementById("previewCloseBtn");
  if (previewCloseBtn) {
    previewCloseBtn.addEventListener("click", closePreview);
  }
  const previewModal = document.getElementById("previewModal");
  if (previewModal) {
    previewModal.addEventListener("click", (e) => {
      if (e.target === previewModal) closePreview();
    });
  }

  // Load medias for the active tab
  if (activeTab === "saved") {
    loadSavedMedia();
  } else {
    loadMedias();
  }
});
