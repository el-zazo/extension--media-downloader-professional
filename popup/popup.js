/**
 * Media Downloader Professional - Popup Script
 * Handles the extension popup functionality with multi-select filters
 * and media preview/playback
 */

// Constants
import { IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, MEDIA_EXTENSIONS, DEFAULT_TAB, STORAGE_KEYS, ACTIONS } from "./constants.js";

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

// Filter state: each category maps to a Set of selected extensions.
// An empty Set means "show all" for that category.
let filterState = {
  videos: new Set(),
  images: new Set(),
  audio: new Set(),
};

// Track active tab
let activeTab = DEFAULT_TAB;

// Modal variables
let currentSaveUrl = "";
let suggestedFilename = "";

// Currently open chip dropdown (only one at a time)
let openDropdown = null;

// ===== FILTER STATE PERSISTENCE =====

/**
 * Loads the saved filter state from chrome.storage.local
 * @returns {Promise<void>}
 */
const loadFilterState = () => {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.FILTER_STATE], (result) => {
      if (result[STORAGE_KEYS.FILTER_STATE]) {
        const saved = result[STORAGE_KEYS.FILTER_STATE];
        filterState.videos = new Set(saved.videos || []);
        filterState.images = new Set(saved.images || []);
        filterState.audio = new Set(saved.audio || []);
      }
      resolve();
    });
  });
};

/**
 * Saves the current filter state to chrome.storage.local
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
 * Resets all filter selections and saves the state
 */
const resetFilters = () => {
  filterState.videos.clear();
  filterState.images.clear();
  filterState.audio.clear();
  saveFilterState();
  updateFilterUI();
  loadMedias();
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

    // Clear previous content
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
      video.style.maxHeight = "300px";
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
 * Checks if a media item matches the current filter state
 * @param {Object} media - The media object
 * @returns {boolean}
 */
const matchesFilter = (media) => {
  const fileType = getFileType(media);
  const mime = media.mime || "";
  const isImage = IMAGE_EXTENSIONS.includes(fileType) || mime.includes("image/");
  const isAudio = AUDIO_EXTENSIONS.includes(fileType) || mime.includes("audio/");

  if (isImage) {
    // Empty set = show all images; otherwise only selected extensions
    return filterState.images.size === 0 || filterState.images.has(fileType);
  }
  if (isAudio) {
    return filterState.audio.size === 0 || filterState.audio.has(fileType);
  }
  // Video (default)
  return filterState.videos.size === 0 || filterState.videos.has(fileType);
};

/**
 * Applies the current filter to the media list and updates the UI
 * @param {Array} medias - All media items for the current tab
 */
const applyFilter = (medias) => {
  const filterCount = document.getElementById("filterCount");
  const mediaList = document.getElementById("mediaList");
  const emptyState = document.getElementById("emptyState");

  // Filter medias
  const filteredMedias = medias.filter((media) => matchesFilter(media));

  // Update category counts on chips
  updateChipCounts(medias);

  // Clear previous list items
  mediaList.innerHTML = "";

  if (filteredMedias.length === 0) {
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
    filteredMedias.forEach((media) => {
      const item = createMediaItem(media, medias);
      mediaList.appendChild(item);
    });
  }

  // Update total count text
  const mediaCount = document.getElementById("mediaCount");
  mediaCount.textContent = `${medias.length} medias`;
};

/**
 * Updates the count badges on each filter chip
 * @param {Array} medias - All media items
 */
const updateChipCounts = (medias) => {
  let videoCount = 0, imageCount = 0, audioCount = 0;
  medias.forEach((media) => {
    const fileType = getFileType(media);
    const mime = media.mime || "";
    if (IMAGE_EXTENSIONS.includes(fileType) || mime.includes("image/")) imageCount++;
    else if (AUDIO_EXTENSIONS.includes(fileType) || mime.includes("audio/")) audioCount++;
    else videoCount++;
  });

  const vc = document.querySelector('.chip-count[data-category="videos"]');
  const ic = document.querySelector('.chip-count[data-category="images"]');
  const ac = document.querySelector('.chip-count[data-category="audio"]');
  if (vc) vc.textContent = videoCount;
  if (ic) ic.textContent = imageCount;
  if (ac) ac.textContent = audioCount;
};

// ===== FILTER CHIP DROPDOWN SETUP =====

/**
 * Populates the chip dropdown checkboxes for each category
 */
const setupFilterChips = () => {
  const categories = {
    videos: VIDEO_EXTENSIONS,
    images: IMAGE_EXTENSIONS,
    audio: AUDIO_EXTENSIONS,
  };

  Object.entries(categories).forEach(([category, extensions]) => {
    const dropdown = document.querySelector(`.chip-dropdown[data-category="${category}"]`);
    if (!dropdown) return;

    dropdown.innerHTML = "";

    // "Select All" toggle
    const selectAllLabel = document.createElement("label");
    selectAllLabel.className = "select-all-label";
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.checked = filterState[category].size === 0;
    selectAllCheckbox.addEventListener("change", () => {
      if (selectAllCheckbox.checked) {
        filterState[category].clear(); // empty = show all
        extensions.forEach((ext) => {
          const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
          if (cb) cb.checked = false;
        });
      } else {
        // Deselecting "all" => select none
        extensions.forEach((ext) => filterState[category].add(ext));
        extensions.forEach((ext) => {
          const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
          if (cb) cb.checked = true;
        });
      }
      saveFilterState();
      updateChipActiveState(category);
      loadMedias();
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
      checkbox.checked = filterState[category].has(ext);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          filterState[category].add(ext);
        } else {
          filterState[category].delete(ext);
        }
        // Update "Select All" state
        selectAllCheckbox.checked = filterState[category].size === 0;
        saveFilterState();
        updateChipActiveState(category);
        loadMedias();
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
 */
const updateChipActiveState = (category) => {
  const chipBtn = document.querySelector(`.chip-btn[data-category="${category}"]`);
  if (!chipBtn) return;

  // Chip is "active" (highlighted) when specific filters are selected
  if (filterState[category].size > 0) {
    chipBtn.classList.add("active");
  } else {
    chipBtn.classList.remove("active");
  }
};

/**
 * Updates all chip active states to match current filterState
 */
const updateFilterUI = () => {
  ["videos", "images", "audio"].forEach((category) => {
    updateChipActiveState(category);
    // Update checkboxes in dropdown
    const dropdown = document.querySelector(`.chip-dropdown[data-category="${category}"]`);
    if (!dropdown) return;

    const selectAllCb = dropdown.querySelector(".select-all-label input");
    if (selectAllCb) selectAllCb.checked = filterState[category].size === 0;

    const extensions = category === "videos" ? VIDEO_EXTENSIONS : category === "images" ? IMAGE_EXTENSIONS : AUDIO_EXTENSIONS;
    extensions.forEach((ext) => {
      const cb = dropdown.querySelector(`input[data-ext="${ext}"]`);
      if (cb) cb.checked = filterState[category].has(ext);
    });
  });
};

/**
 * Toggles a chip dropdown open/closed
 * @param {string} category - The category to toggle
 */
const toggleChipDropdown = (category) => {
  // Close any other open dropdown
  if (openDropdown && openDropdown !== category) {
    const prevDropdown = document.querySelector(`.chip-dropdown[data-category="${openDropdown}"]`);
    const prevBtn = document.querySelector(`.chip-btn[data-category="${openDropdown}"]`);
    if (prevDropdown) prevDropdown.classList.remove("open");
    if (prevBtn) prevBtn.classList.remove("open");
  }

  const dropdown = document.querySelector(`.chip-dropdown[data-category="${category}"]`);
  const chipBtn = document.querySelector(`.chip-btn[data-category="${category}"]`);

  if (dropdown && chipBtn) {
    const isOpen = dropdown.classList.contains("open");
    dropdown.classList.toggle("open");
    chipBtn.classList.toggle("open");
    openDropdown = isOpen ? null : category;
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

// Load saved media from storage
const loadSavedMedia = () => {
  const savedMediaList = document.getElementById("savedMediaList");
  const savedEmptyState = document.getElementById("savedEmptyState");
  const savedMediaCount = document.getElementById("savedMediaCount");

  chrome.storage.local.get([STORAGE_KEYS.SAVED_MEDIA], (result) => {
    const savedMedia = result.savedMedia || [];
    if (savedMedia.length === 0) {
      savedEmptyState.style.display = "block";
      savedMediaList.style.display = "none";
      savedMediaCount.textContent = "0 saved";
    } else {
      savedEmptyState.style.display = "none";
      savedMediaList.style.display = "block";
      savedMediaCount.textContent = `${savedMedia.length} saved`;
      savedMediaList.innerHTML = "";
      savedMedia.forEach((media, index) => {
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
  // Load saved filter state, then setup UI
  loadFilterState().then(() => {
    setupFilterChips();
    updateFilterUI();
  });

  // Chip button click handlers
  document.querySelectorAll(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const category = btn.dataset.category;
      toggleChipDropdown(category);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (openDropdown && !e.target.closest(".filter-chip")) {
      const dropdown = document.querySelector(`.chip-dropdown[data-category="${openDropdown}"]`);
      const chipBtn = document.querySelector(`.chip-btn[data-category="${openDropdown}"]`);
      if (dropdown) dropdown.classList.remove("open");
      if (chipBtn) chipBtn.classList.remove("open");
      openDropdown = null;
    }
  });

  // Reset filters button
  const resetBtn = document.getElementById("resetFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetFilters);
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
