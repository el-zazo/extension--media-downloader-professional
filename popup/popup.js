/**
 * Media Downloader Professional - Popup Script
 * Handles the extension popup functionality
 */

// Constants
import { IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, MEDIA_EXTENSIONS, DEFAULT_FILTER, DEFAULT_TAB, STORAGE_KEYS, ACTIONS } from "./constants.js";

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

// Track active filter and tab
let activeFilter = DEFAULT_FILTER;
let activeTab = DEFAULT_TAB;

// Modal variables
let currentSaveUrl = "";
let suggestedFilename = "";

// Save media to device with custom filename
const saveMedia = (url, filename) => {
  try {
    // Set current media info for the modal
    currentSaveUrl = url;
    suggestedFilename = filename;

    // Set the URL display in the modal
    const saveModalUrl = document.getElementById("saveModalUrl");
    saveModalUrl.textContent = url;

    // Set the suggested filename in the input field
    const customFilenameInput = document.getElementById("customFilename");
    customFilenameInput.value = filename;

    // Show the modal
    const saveModal = document.getElementById("saveModal");
    saveModal.classList.add("active");

    // Focus the input field
    customFilenameInput.focus();
    customFilenameInput.select();
  } catch (error) {
    console.error("Error preparing save dialog:", error);
    ui.showNotification("Failed to open save dialog");
  }
};

// Add media to saved list and storage
const addToSavedMedia = (media) => {
  // Get current saved media from storage
  chrome.storage.local.get([STORAGE_KEYS.SAVED_MEDIA], (result) => {
    const savedMedia = result.savedMedia || [];

    // Check if this URL is already saved
    const exists = savedMedia.some((item) => item.url === media.url);

    if (!exists) {
      // Add to saved media list
      savedMedia.push(media);

      // Save to storage
      chrome.storage.local.set({ [STORAGE_KEYS.SAVED_MEDIA]: savedMedia }, () => {
        ui.showNotification("Media saved to library");

        // If we're on the saved tab, update the display
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

      // Filter out the item with the matching URL
      savedMedia = savedMedia.filter((item) => item.url !== url);

      // Save updated list to storage
      chrome.storage.local.set({ [STORAGE_KEYS.SAVED_MEDIA]: savedMedia }, () => {
        ui.showNotification("Media removed from library");

        // Update the display
        loadSavedMedia();
      });
    });
  }
};

// Process the actual download
const downloadMedia = (url, filename) => {
  try {
    // Handle relative URLs
    const absoluteUrl = new URL(url, window.location.href).href;

    // Send message to background script to handle download
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

// Create media item element
const createMediaItem = (media, medias) => {
  const item = document.createElement("li");
  item.className = "media-item";

  // Format for display
  const extension = media.extension || "unknown";
  const isAudio = media.mime && media.mime.includes("audio");
  const isImage = (media.mime && media.mime.includes("image")) || IMAGE_EXTENSIONS.includes(extension.toLowerCase());

  // Count by media type (to match content-script.js behavior)
  let imageCount = 0;
  let nonImageCount = 0;

  // Function to check if an item is an image
  const isItemImage = (item) => {
    const ext = item.extension?.toLowerCase() || "";
    const mime = item.mime || "";
    return IMAGE_EXTENSIONS.includes(ext) || mime.includes("image/");
  };

  // Count items by type before the current item
  for (let i = 0; i < medias.length; i++) {
    const item = medias[i];
    // Count until we reach the current item
    if (item.url === media.url) {
      break;
    }
    if (isItemImage(item)) {
      imageCount++;
    } else {
      nonImageCount++;
    }
  }

  // Determine the correct item number
  const typeCount = isImage ? imageCount + 1 : nonImageCount + 1;
  const title = isImage ? `Image ${typeCount}` : isAudio ? `Audio ${typeCount}` : `Video ${typeCount}`;

  const size = utils.formatFileSize(media.size);
  const datetime = utils.formatDateTime(media.timestamp || Date.now());

  // Create shortened URL for display
  const displayUrl = media.url.length > 60 ? media.url.substring(0, 57) + "..." : media.url;

  // Generate suggested filename
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

  // Add event listener for copy button
  const copyBtn = item.querySelector(".copy-btn");
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    utils.copyToClipboard(media.url);
  });

  // Add event listener for download button
  const downloadBtn = item.querySelector(".download-btn");
  downloadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMedia(media.url, filename);
  });

  // Add event listener for save button
  const saveBtn = item.querySelector(".save-btn");
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    saveMedia(media.url, filename);
  });

  return item;
};

// Create a saved media item
const createSavedMediaItem = (media, index) => {
  const item = document.createElement("li");
  item.className = "media-item saved-item";

  // Determine icon based on media type
  const extension = media.extension || "unknown";
  const isAudio = media.mime && media.mime.includes("audio");
  const isImage = (media.mime && media.mime.includes("image")) || IMAGE_EXTENSIONS.includes(extension.toLowerCase());

  // Format size and date for display
  const size = utils.formatFileSize(media.size);
  const datetime = utils.formatDateTime(media.savedAt || media.timestamp || Date.now());

  // Create shortened URL for display
  const displayUrl = media.url.length > 60 ? media.url.substring(0, 57) + "..." : media.url;

  // Title is either custom title or the default pattern
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

  // Add event listener for copy button
  const copyBtn = item.querySelector(".copy-btn");
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    utils.copyToClipboard(media.url);
  });

  // Add event listener for download button
  const downloadBtn = item.querySelector(".download-btn");
  downloadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMedia(media.url, media.filename);
  });

  // Add event listener for delete button
  const deleteBtn = item.querySelector(".delete-btn");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeSavedMedia(media.url);
  });

  return item;
};

// Get file type from URL or MIME type
const getFileType = (media) => {
  const extension = media.extension?.toLowerCase() || "";
  const mime = media.mime || "";

  // Image types
  if (IMAGE_EXTENSIONS.includes(extension) || mime.includes("image/")) {
    return extension || mime.split("/")[1] || "image";
  }

  // Audio types
  if (AUDIO_EXTENSIONS.includes(extension) || mime.includes("audio/")) {
    return extension || mime.split("/")[1] || "audio";
  }

  // Video types
  return extension || mime.split("/")[1] || "video";
};

// Check if media matches current filter
const matchesFilter = (media) => {
  if (activeFilter === "all") return true;

  const fileType = getFileType(media);
  const mime_image = media.mime?.includes("image/");
  const mime_audio = media.mime?.includes("audio/");

  if (activeFilter === "images" && (IMAGE_EXTENSIONS.includes(fileType) || mime_image)) {
    return true;
  }
  if (activeFilter === "audio" && (AUDIO_EXTENSIONS.includes(fileType) || mime_audio)) {
    return true;
  }
  if (activeFilter === "video" && !mime_image && !mime_audio && ![...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS].includes(fileType)) {
    return true;
  }

  return activeFilter === fileType;
};

// Apply current filter to media list
const applyFilter = (medias) => {
  const filterSelect = document.getElementById("mediaFilter");
  const filterCount = document.getElementById("filterCount");
  const mediaList = document.getElementById("mediaList");
  const emptyState = document.getElementById("emptyState");

  // Set filter value from select
  if (filterSelect) {
    filterSelect.value = activeFilter;
  }

  // Filter medias
  const filteredMedias = medias.filter((media) => matchesFilter(media));

  // Update count
  if (filterCount) {
    filterCount.textContent = filteredMedias.length;
  }

  // Clear previous list items
  mediaList.innerHTML = "";

  if (filteredMedias.length === 0) {
    // Show empty state with message
    emptyState.style.display = "block";
    mediaList.style.display = "none";

    if (medias.length > 0) {
      // We have medias but none match the filter
      emptyState.innerHTML = `
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </div>
        <div>No ${activeFilter !== "all" ? activeFilter : "media"} found on this page.</div>
        <div style="margin-top: 8px; font-size: 12px">Try a different filter or browse the page to detect more media.</div>
      `;
    } else {
      // No medias at all
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
    // Show filtered media list
    emptyState.style.display = "none";
    mediaList.style.display = "block";

    // Add media items to list
    filteredMedias.forEach((media) => {
      const item = createMediaItem(media, medias);
      mediaList.appendChild(item);
    });
  }

  // Update total count text
  const mediaCount = document.getElementById("mediaCount");
  mediaCount.textContent = `${medias.length} medias`;
};

// Setup filter select options
const setupFilterOptions = () => {
  const fileTypeOptions = document.getElementById("fileTypeOptions");
  if (!fileTypeOptions) return;

  // Clear existing options
  fileTypeOptions.innerHTML = "";

  // Add file type options
  MEDIA_EXTENSIONS.forEach((ext) => {
    const option = document.createElement("option");
    option.value = ext;
    option.textContent = ext.toUpperCase();
    fileTypeOptions.appendChild(option);
  });
};

// Load medias for current tab
const loadMedias = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;

    const currentTab = tabs[0];
    const tabId = currentTab.id;

    // Request medias from background script
    chrome.runtime.sendMessage({ action: ACTIONS.GET_MEDIAS, tabId: tabId }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting medias:", chrome.runtime.lastError);
        return;
      }

      if (response && response.medias) {
        // Get the media array for the current tab ID
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

  // Get saved media from storage
  chrome.storage.local.get([STORAGE_KEYS.SAVED_MEDIA], (result) => {
    const savedMedia = result.savedMedia || [];

    // Update UI based on saved media count
    if (savedMedia.length === 0) {
      savedEmptyState.style.display = "block";
      savedMediaList.style.display = "none";
      savedMediaCount.textContent = "0 saved";
    } else {
      savedEmptyState.style.display = "none";
      savedMediaList.style.display = "block";
      savedMediaCount.textContent = `${savedMedia.length} saved`;

      // Clear previous list
      savedMediaList.innerHTML = "";

      // Add each saved item to the list
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

      // Close popup
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

      // Reload medias after a short delay
      setTimeout(loadMedias, 1000);
    });
  });
};

// Switch between tabs
const switchTab = (tab) => {
  activeTab = tab;

  // Update tab buttons
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    if (btn.dataset.tab === tab) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update tab content
  const tabContents = document.querySelectorAll(".tab-content");
  tabContents.forEach((content) => {
    if (content.dataset.tab === tab) {
      content.classList.add("active");
    } else {
      content.classList.remove("active");
    }
  });

  // Load appropriate content based on active tab
  if (tab === "saved") {
    loadSavedMedia();
  } else {
    loadMedias();
  }
};

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  // Setup filter options
  setupFilterOptions();

  // Setup event listeners
  const filterSelect = document.getElementById("mediaFilter");
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      activeFilter = filterSelect.value;
      loadMedias();
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

  // Tab switching
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
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
        // Get extension from suggested filename
        const extension = suggestedFilename.split(".").pop();

        // Add extension if not present
        const finalFilename = customFilename.includes(".") ? customFilename : `${customFilename}.${extension}`;

        // Get current timestamp
        const savedAt = Date.now();

        // Find the original media object to get its size and mime type
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

              // Create media object for saved list with all needed properties
              const media = {
                url: currentSaveUrl,
                filename: finalFilename,
                customTitle: customFilename.split(".")[0], // Remove extension for title
                extension: extension,
                savedAt: savedAt,
                size: originalMedia ? originalMedia.size : 0,
                mime: originalMedia ? originalMedia.mime : "",
              };

              // Add to saved media
              addToSavedMedia(media);

              // Close modal
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

  // Handle Enter key in the filename input
  if (customFilenameInput) {
    customFilenameInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        confirmSaveBtn.click();
      } else if (e.key === "Escape") {
        cancelSaveBtn.click();
      }
    });
  }

  // Load medias for the active tab
  if (activeTab === "saved") {
    loadSavedMedia();
  } else {
    loadMedias();
  }
});
