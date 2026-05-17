/**
 * Media Downloader Professional - Content Script
 * Creates and manages the media list UI on the webpage
 *
 * This script is responsible for:
 * 1. Creating and managing the media panel UI
 * 2. Handling media detection and display
 * 3. Managing user interactions (filtering, downloading, copying)
 * 4. Communicating with the background script
 *
 * @author Media Downloader Professional Team
 * @version 1.0.0
 */

/**
 * ==============================
 * CONSTANTS AND CONFIGURATION
 * ==============================
 */

// Media cache to track detected media and avoid duplicates
const detectedMedias = new Map();

// UI state variables
let mediaPanel = null;
let isInitialized = false;
let activeFilter = "all"; // Track active filter
let currentPageUrl = window.location.href; // Track current page URL

// Configuration constants
const CONFIG = {
  PANEL_WIDTH: 380,
  PANEL_MAX_HEIGHT: 500,
  PANEL_POSITION: { top: 20, right: 20 },
  NOTIFICATION_TIMEOUT: 2000,
  URL_CHECK_INTERVAL: 1000,
  MAX_URL_LENGTH: 60
};

/**
 * ==============================
 * UTILITY FUNCTIONS
 * ==============================
 */

/**
 * Formats a file size in bytes to a human-readable string with appropriate units
 * 
 * @param {number} bytes - The file size in bytes
 * @returns {string} - Formatted file size (e.g., "2.5 MB")
 */
const formatFileSize = (bytes) => {
  try {
    // Handle invalid input
    if (!bytes || isNaN(bytes) || bytes === 0) return "Unknown";
    
    const units = ["B", "KB", "MB", "GB"];
    let size = Math.abs(bytes); // Ensure positive value
    let unitIndex = 0;

    // Convert to appropriate unit
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    // Format with one decimal place
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  } catch (error) {
    console.error("Error formatting file size:", error);
    return "Unknown";
  }
};

/**
 * Formats a timestamp to a human-readable date and time string
 * 
 * @param {number} timestamp - The timestamp in milliseconds
 * @returns {string} - Formatted date and time
 */
const formatDateTime = (timestamp) => {
  try {
    // Handle invalid input
    if (!timestamp) return "Unknown time";
    
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return "Unknown time";

    const options = {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };

    return date.toLocaleString(undefined, options);
  } catch (error) {
    console.error("Error formatting date time:", error);
    return "Unknown time";
  }
};

// Media type constants for better organization and reuse
const MEDIA_TYPES = {
  IMAGE: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"],
  AUDIO: ["mp3", "wav", "ogg", "flac", "aac"],
  // Video types are determined by exclusion
};

/**
 * Determines the media type based on file extension or MIME type
 * 
 * @param {Object} media - The media object
 * @param {string} [media.extension] - The file extension
 * @param {string} [media.mime] - The MIME type
 * @returns {string} - The determined media type or extension
 */
const getMediaType = (media) => {
  try {
    if (!media) return "unknown";
    
    const extension = media.extension?.toLowerCase() || "";
    const mime = media.mime || "";

    // Image types
    if (MEDIA_TYPES.IMAGE.includes(extension) || mime.includes("image/")) {
      return extension || (mime.includes("/") ? mime.split("/")[1] : "") || "image";
    }

    // Audio types
    if (MEDIA_TYPES.AUDIO.includes(extension) || mime.includes("audio/")) {
      return extension || (mime.includes("/") ? mime.split("/")[1] : "") || "audio";
    }

    // Video types (default)
    return extension || (mime.includes("/") ? mime.split("/")[1] : "") || "video";
  } catch (error) {
    console.error("Error determining media type:", error);
    return "unknown";
  }
};

/**
 * ==============================
 * FILTERING FUNCTIONS
 * ==============================
 */

/**
 * Checks if a media item matches the current filter criteria
 * 
 * @param {Object} media - The media object to check
 * @returns {boolean} - True if the media matches the current filter
 */
const matchesFilter = (media) => {
  try {
    if (!media) return false;
    if (activeFilter === "all") return true;

    const fileType = getMediaType(media);
    const mime = media.mime || "";
    
    // Check for image filter
    if (activeFilter === "images" && 
        (MEDIA_TYPES.IMAGE.includes(fileType) || mime.includes("image/"))) {
      return true;
    }
    
    // Check for audio filter
    if (activeFilter === "audio" && 
        (MEDIA_TYPES.AUDIO.includes(fileType) || mime.includes("audio/"))) {
      return true;
    }
    
    // Check for video filter (anything that's not image or audio)
    if (activeFilter === "video" &&
        !mime.includes("image/") &&
        !mime.includes("audio/") &&
        ![...MEDIA_TYPES.IMAGE, ...MEDIA_TYPES.AUDIO].includes(fileType)) {
      return true;
    }

    // Check for specific file type filter
    return activeFilter === fileType;
  } catch (error) {
    console.error("Error matching filter:", error);
    return false; // Default to not showing on error
  }
};

/**
 * Counts media items by type category and specific file types
 * 
 * @returns {Object} - Object containing counts by category and specific types
 */
const countMediaByType = () => {
  try {
    const counts = {
      all: detectedMedias.size,
      images: 0,
      audio: 0,
      video: 0,
    };

    // Create counters for specific file types
    const specificTypes = new Map();

    detectedMedias.forEach((media) => {
      if (!media) return;
      
      const fileType = getMediaType(media);
      const mime = media.mime || "";

      // Increment specific type counter
      specificTypes.set(fileType, (specificTypes.get(fileType) || 0) + 1);

      // Increment category counters
      if (MEDIA_TYPES.IMAGE.includes(fileType) || mime.includes("image/")) {
        counts.images++;
      } else if (MEDIA_TYPES.AUDIO.includes(fileType) || mime.includes("audio/")) {
        counts.audio++;
      } else {
        counts.video++;
      }
    });

    return { counts, specificTypes };
  } catch (error) {
    console.error("Error counting media by type:", error);
    return { 
      counts: { all: 0, images: 0, audio: 0, video: 0 }, 
      specificTypes: new Map() 
    };
  }
};

/**
 * Applies the current filter to the media list UI
 * Shows/hides media items based on the active filter
 */
const applyFilter = () => {
  try {
    if (!mediaPanel) return;

    const mediaList = mediaPanel.querySelector(".vdp-media-list");
    if (!mediaList) return;

    // Update filter select dropdown to match active filter
    const filterSelect = mediaPanel.querySelector(".vdp-filter-select");
    if (filterSelect) {
      filterSelect.value = activeFilter;
    }

    // Show/hide list items based on filter
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

    // Update counter in the UI
    const counterEl = mediaPanel.querySelector(".vdp-counter-count");
    if (counterEl) {
      counterEl.textContent = visibleCount;
    }

    // Handle empty state message
    updateEmptyState(visibleCount, items.length);
  } catch (error) {
    console.error("Error applying filter:", error);
  }
};

/**
 * Updates the empty state message based on filter results
 * 
 * @param {number} visibleCount - Number of visible items after filtering
 * @param {number} totalItems - Total number of items before filtering
 */
const updateEmptyState = (visibleCount, totalItems) => {
  try {
    if (!mediaPanel) return;
    
    const emptyState = mediaPanel.querySelector(".vdp-empty");
    const content = mediaPanel.querySelector(".vdp-content");
    
    if (visibleCount === 0 && totalItems > 0) {
      // No items match the current filter
      if (!emptyState && content) {
        const newEmptyState = document.createElement("div");
        newEmptyState.className = "vdp-empty";
        newEmptyState.textContent = `No ${activeFilter} media found`;
        content.appendChild(newEmptyState);
      } else if (emptyState) {
        emptyState.textContent = `No ${activeFilter} media found`;
        emptyState.style.display = "";
      }
    } else if (emptyState) {
      emptyState.style.display = "none";
    }
  } catch (error) {
    console.error("Error updating empty state:", error);
  }
};

/**
 * Updates the filter UI with current media counts
 */
const updateFilterCounts = () => {
  try {
    if (!mediaPanel) return;

    const { counts, specificTypes } = countMediaByType();

    // Update category counts on filter buttons
    const filterButtons = mediaPanel.querySelectorAll(".vdp-filter-btn");
    filterButtons.forEach((btn) => {
      if (!btn || !btn.dataset) return;
      
      const filterType = btn.dataset.filter;
      if (!filterType) return;
      
      const count = counts[filterType] || specificTypes.get(filterType) || 0;

      const countBadge = btn.querySelector(".vdp-filter-count");
      if (countBadge) {
        countBadge.textContent = count;
      }
    });
  } catch (error) {
    console.error("Error updating filter counts:", error);
  }
};

/**
 * ==============================
 * UI ASSETS AND RESOURCES
 * ==============================
 */

/**
 * SVG Icons used throughout the UI
 * All icons are inline SVG for better performance and styling
 */
const ICONS = {
  // Media type icons
  video: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" /><rect x="3" y="6" width="12" height="12" rx="2" stroke-width="2" /></svg>',
  audio: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>',
  image: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>',
  
  // Action icons
  copy: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>',
  download: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>',
  
  // Panel control icons
  close: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>',
  minimize: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>',
  maximize: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>',
  
  // Brand icon
  logo: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" /><rect x="3" y="6" width="12" height="12" rx="2" stroke-width="2" /></svg>',
};

/**
 * ==============================
 * NOTIFICATION AND CLIPBOARD FUNCTIONS
 * ==============================
 */

/**
 * Shows a temporary notification message to the user
 * 
 * @param {string} message - The message to display
 */
const showNotification = (message) => {
  try {
    if (!message) {
      console.error("Notification message is empty");
      return;
    }
    
    // Find existing notification element or create a new one
    let notification = document.querySelector(".vdp-copied");
    if (!notification) {
      notification = document.createElement("div");
      notification.className = "vdp-copied";
      document.body.appendChild(notification);
    }

    // Set message and show notification
    notification.textContent = message;
    notification.classList.add("show");

    // Hide notification after timeout
    setTimeout(() => {
      if (notification && notification.parentNode) {
        notification.classList.remove("show");
      }
    }, CONFIG.NOTIFICATION_TIMEOUT);
  } catch (error) {
    console.error("Error showing notification:", error);
  }
};

/**
 * Copies a URL to the clipboard with fallback for browsers without clipboard API
 * 
 * @param {string} url - The URL to copy to clipboard
 */
const copyToClipboard = (url) => {
  try {
    if (!url) {
      showNotification("No URL to copy");
      return;
    }
    
    // Try to use modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          showNotification("URL copied to clipboard!");
        })
        .catch((err) => {
          console.error("Clipboard API failed:", err);
          useFallbackCopy(url);
        });
    } else {
      // Use fallback for browsers without Clipboard API
      useFallbackCopy(url);
    }
  } catch (error) {
    console.error("Error in copy to clipboard:", error);
    showNotification("Failed to copy URL");
  }
};

/**
 * Fallback method for copying text when Clipboard API is not available
 * 
 * @param {string} text - The text to copy
 */
const useFallbackCopy = (text) => {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    
    // Make the textarea invisible but selectable
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    textarea.style.zIndex = "-1";
    
    document.body.appendChild(textarea);
    textarea.select();
    
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    
    if (success) {
      showNotification("URL copied to clipboard!");
    } else {
      showNotification("Failed to copy URL");
    }
  } catch (error) {
    console.error("Fallback copy failed:", error);
    showNotification("Failed to copy URL");
  }
};

/**
 * ==============================
 * MEDIA ITEM UI FUNCTIONS
 * ==============================
 */

/**
 * Creates a DOM element for a media item to display in the panel
 * 
 * @param {Object} media - The media object to create an item for
 * @returns {HTMLElement} - The created list item element
 */
const createMediaItem = (media) => {
  try {
    if (!media || !media.url) {
      console.error("Invalid media object provided to createMediaItem");
      return null;
    }
    
    // Create list item container
    const item = document.createElement("li");
    item.className = "vdp-media-item";
    item.dataset.url = media.url;

    // Determine media type and format for display
    const extension = media.extension || "unknown";
    const mime = media.mime || "";
    const isAudio = mime.includes("audio");
    const isImage = mime.includes("image") || MEDIA_TYPES.IMAGE.includes(extension.toLowerCase());

    // Get sequential number for this media type
    const typeCount = getMediaTypeCount(media, isImage);

    // Format display information
    const title = `${isImage ? "Image" : isAudio ? "Audio" : "Video"} ${typeCount}`;
    const size = formatFileSize(media.size);
    const datetime = formatDateTime(media.timestamp || Date.now());

    // Create shortened URL for display
    const displayUrl = media.url.length > CONFIG.MAX_URL_LENGTH ? 
      media.url.substring(0, CONFIG.MAX_URL_LENGTH - 3) + "..." : 
      media.url;

    // Create item HTML content
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
        <button class="vdp-action-btn vdp-download-btn" title="Download">
          ${ICONS.download}
        </button>
        <button class="vdp-action-btn vdp-copy-btn" title="Copy URL">
          ${ICONS.copy}
        </button>
      </div>
    `;

    // Add event listeners for buttons
    attachMediaItemEventListeners(item, media);

    return item;
  } catch (error) {
    console.error("Error creating media item:", error);
    return null;
  }
};

/**
 * Attaches event listeners to media item buttons
 * 
 * @param {HTMLElement} itemElement - The media item element
 * @param {Object} media - The media object
 */
const attachMediaItemEventListeners = (itemElement, media) => {
  try {
    // Add event listener for copy button
    const copyBtn = itemElement.querySelector(".vdp-copy-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyToClipboard(media.url);
      });
    }

    // Add event listener for download button
    const downloadBtn = itemElement.querySelector(".vdp-download-btn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        downloadMedia(media);
      });
    }
  } catch (error) {
    console.error("Error attaching media item event listeners:", error);
  }
};

/**
 * Gets the sequential count number for a media item by type
 * 
 * @param {Object} media - The media object
 * @param {boolean} isImage - Whether the media is an image
 * @returns {number} - The sequential count number
 */
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
    // findIndex returns -1 if not found; use 1 as fallback to avoid "Video 0" / "Image 0"
    return index >= 0 ? index + 1 : 1;
  } catch (error) {
    console.error("Error getting media type count:", error);
    return 1;
  }
};

/**
 * Escapes HTML special characters to prevent XSS
 * 
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string
 */
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
 * DOWNLOAD FUNCTIONS
 * ==============================
 */

/**
 * Initiates the download of a media item
 * 
 * @param {Object} media - The media object to download
 */
const downloadMedia = (media) => {
  try {
    if (!media || !media.url) {
      console.error("Invalid media object provided to downloadMedia");
      showNotification("Error: Cannot download invalid media");
      return;
    }

    // Generate a suggested filename based on media info
    const extension = media.extension || "mp4";
    const isAudio = media.mime && media.mime.includes("audio");
    const isImage = (media.mime && media.mime.includes("image")) || MEDIA_TYPES.IMAGE.includes(extension.toLowerCase());

    const type = isImage ? "image" : isAudio ? "audio" : "video";

    // Generate a sequential number for this type
    let typeIndex;
    if (isImage) {
      typeIndex =
        Array.from(detectedMedias.values())
          .filter((item) => {
            const ext = item.extension?.toLowerCase() || "";
            const mime = item.mime || "";
            return MEDIA_TYPES.IMAGE.includes(ext) || mime.includes("image/");
          })
          .findIndex((item) => item.url === media.url);
    } else {
      typeIndex =
        Array.from(detectedMedias.values())
          .filter((item) => {
            const ext = item.extension?.toLowerCase() || "";
            const mime = item.mime || "";
            return !(MEDIA_TYPES.IMAGE.includes(ext) || mime.includes("image/"));
          })
          .findIndex((item) => item.url === media.url);
    }
    // findIndex returns -1 if not found; use 1 as fallback to avoid "video_0.mp4"
    const typeCount = typeIndex >= 0 ? typeIndex + 1 : 1;

    const filename = `${type}_${typeCount}.${extension}`;

    // Show downloading notification
    showNotification(`Downloading ${filename}...`);

    // Send message to background script to handle the download
    chrome.runtime.sendMessage(
      {
        action: "downloadMedia",
        url: media.url,
        filename: filename,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending download message:", chrome.runtime.lastError);
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
    console.error("Error downloading media:", error);
    showNotification("Download failed. Please try again.");
  }
};

/**
 * ==============================
 * MEDIA PANEL UI FUNCTIONS
 * ==============================
 */

/**
 * Adds a media item to the panel UI
 * 
 * @param {Object} media - The media object to add to the panel
 */
const addMediaToPanel = (media) => {
  try {
    if (!media || !media.url) {
      console.error("Invalid media object provided to addMediaToPanel");
      return;
    }

    if (!isInitialized) {
      initialize();
    }

    // Store the media but don't show panel automatically
    if (!mediaPanel && !document.querySelector(".vdp-panel")) {
      // Don't create panel automatically, just store the media
      return;
    }

    if (!mediaPanel) {
      const ui = createMediaPanel();
      mediaPanel = ui.panel;

      // Replace empty state with media list if not already done
      if (ui.content.contains(ui.emptyState)) {
        ui.content.replaceChild(ui.mediaList, ui.emptyState);
      }
    }

    // Get panel elements
    const content = mediaPanel.querySelector(".vdp-content");
    let mediaList = mediaPanel.querySelector(".vdp-media-list");
    const emptyState = mediaPanel.querySelector(".vdp-empty");
    const badge = mediaPanel.querySelector(".vdp-badge");

    // Create media list if it doesn't exist
    if (!mediaList) {
      mediaList = document.createElement("ul");
      mediaList.className = "vdp-media-list";
      content.innerHTML = "";
      content.appendChild(mediaList);
    }

    // Create and add media item
    const mediaItem = createMediaItem(media);
    if (mediaItem) {
      mediaList.appendChild(mediaItem);
    } else {
      console.error("Failed to create media item for URL:", media.url);
      return;
    }

    // Calculate media counts
    const mediaCount = Array.from(detectedMedias.values()).filter((item) => {
      const extension = item.extension?.toLowerCase() || "";
      const mime = item.mime || "";
      return !(["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(extension) || mime.includes("image/"));
    }).length;

    const imageCount = Array.from(detectedMedias.values()).filter((item) => {
      const extension = item.extension?.toLowerCase() || "";
      const mime = item.mime || "";
      return ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(extension) || mime.includes("image/");
    }).length;

    // Show total count with "medias" text
    const totalCount = mediaCount + imageCount;
    const countText = totalCount === 1 ? `1 media` : `${totalCount} medias`;

    // Update badge if it exists (for backward compatibility)
    if (badge) {
      badge.textContent = countText;
    }

    // Update footer media count
    const mediaCountEl = mediaPanel.querySelector(".vdp-media-count");
    if (mediaCountEl) {
      mediaCountEl.textContent = countText;
    }

    // Update filter counts and apply current filter
    applyFilter();
  } catch (error) {
    console.error("Error adding media to panel:", error);
  }
};

/**
 * Creates the media panel UI
 * 
 * @returns {Object} - Object containing panel elements
 */
const createMediaPanel = () => {
  try {
    // Create container
    mediaPanel = document.createElement("div");
    mediaPanel.className = "vdp-panel";

    // Create header
    const header = document.createElement("div");
    header.className = "vdp-header";

    const title = document.createElement("div");
    title.className = "vdp-header-title";
    title.innerHTML = `
      <span>Media Downloader Professional</span>
    `;

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
    closeBtn.onclick = () => {
      mediaPanel.remove();
      mediaPanel = null;
      isInitialized = false;
    };

    controls.appendChild(minimizeBtn);
    controls.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(controls);

    // Create filter bar
    const filterBar = document.createElement("div");
    filterBar.className = "vdp-filter-bar";

    // Create filter label
    const filterLabel = document.createElement("div");
    filterLabel.className = "vdp-filter-label";
    filterLabel.textContent = "Filter:";
    filterBar.appendChild(filterLabel);

    // Create filter select dropdown
    const filterSelect = document.createElement("select");
    filterSelect.className = "vdp-filter-select";

    // Add main category options
    const categoryOptions = [
      { value: "all", label: "All Media" },
      { value: "images", label: "All Images" },
      { value: "audio", label: "All Audio" },
      { value: "video", label: "All Videos" },
    ];

    // Get extension list from constants
    const extensionOptions = ["m3u8", "mp4", "mov", "m4v", "webm", "mpg", "mp3", "aac", "m4s", "ts", "flv", "avi", "mkv", "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];

    // Create option groups
    const categoryGroup = document.createElement("optgroup");
    categoryGroup.label = "Categories";

    categoryOptions.forEach((option) => {
      const optionEl = document.createElement("option");
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      categoryGroup.appendChild(optionEl);
    });

    filterSelect.appendChild(categoryGroup);

    const extensionGroup = document.createElement("optgroup");
    extensionGroup.label = "File Types";

    extensionOptions.forEach((ext) => {
      const optionEl = document.createElement("option");
      optionEl.value = ext;
      optionEl.textContent = ext.toUpperCase();
      extensionGroup.appendChild(optionEl);
    });

    filterSelect.appendChild(extensionGroup);

    // Add event listener for filter change
    filterSelect.addEventListener("change", () => {
      activeFilter = filterSelect.value;
      applyFilter();
    });

    filterBar.appendChild(filterSelect);

    // Add media counter to filter bar
    const mediaCounter = document.createElement("div");
    mediaCounter.className = "vdp-media-counter";
    mediaCounter.innerHTML = '<span class="vdp-counter-count">0</span> medias found';
    filterBar.appendChild(mediaCounter);

    // Create content
    const content = document.createElement("div");
    content.className = "vdp-content";

    // Create empty state
    const emptyState = document.createElement("div");
    emptyState.className = "vdp-empty";
    emptyState.textContent = "Scanning for media...";

    // Create media list
    const mediaList = document.createElement("ul");
    mediaList.className = "vdp-media-list";

    content.appendChild(emptyState);

    // Create footer
    const footer = document.createElement("div");
    footer.className = "vdp-footer";

    // Create media count display
    const mediaCount = document.createElement("div");
    mediaCount.className = "vdp-media-count";
    mediaCount.textContent = "0 medias";

    footer.appendChild(mediaCount);

    // Assemble panel
    mediaPanel.appendChild(header);
    mediaPanel.appendChild(filterBar);
    mediaPanel.appendChild(content);
    mediaPanel.appendChild(footer);

    // Add to page
    document.body.appendChild(mediaPanel);

    // Make draggable
    makeDraggable(mediaPanel, header);

    return {
      panel: mediaPanel,
      content: content,
      mediaList: mediaList,
      emptyState: emptyState,
      footer: footer,
      mediaCount: mediaCount,
      filterBar: filterBar,
    };
  } catch (error) {
    console.error("Error creating media panel:", error);
    // Create a minimal fallback panel
    const fallbackPanel = document.createElement("div");
    fallbackPanel.className = "vdp-panel";
    fallbackPanel.innerHTML = `<div class="vdp-header"><div class="vdp-title">Media Downloader</div></div>`;
    document.body.appendChild(fallbackPanel);
    return { 
      panel: fallbackPanel, 
      content: fallbackPanel,
      emptyState: null,
      mediaList: null
    };
  }
};

/**
 * ==============================
 * DRAGGABLE FUNCTIONALITY
 * ==============================
 */

/**
 * Makes an element draggable within the viewport
 * 
 * @param {HTMLElement} element - The element to make draggable
 * @param {HTMLElement} handle - The handle element for dragging
 */
const makeDraggable = (element, handle) => {
  try {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;

    // Set initial panel position based on window size (20px from right edge)
    const setInitialPosition = () => {
      element.style.top = "20px";
      element.style.right = "20px";
      element.style.left = "auto";
      // Ensure the panel is visible even if window is resized
      const minRight = Math.max(20, window.innerWidth - element.offsetWidth - 20 - 20);
      element.style.right = `${minRight}px`;
    };

    // Set initial position
    setInitialPosition();

    // Add window resize listener to ensure panel stays visible
    window.addEventListener("resize", () => {
      try {
        // Only adjust if panel is using right-based positioning
        if (element.style.left === "auto" || !element.style.left) {
          setInitialPosition();
        } else {
          // If using left-based positioning, ensure panel isn't too far right
          const maxLeft = window.innerWidth - element.offsetWidth - 20;
          if (parseInt(element.style.left) > maxLeft) {
            element.style.left = `${maxLeft}px`;
          }

          // Ensure panel isn't too far left
          if (parseInt(element.style.left) < 20) {
            element.style.left = "20px";
          }

          // Ensure panel isn't too low
          if (parseInt(element.style.top) > window.innerHeight - element.offsetHeight - 20) {
            element.style.top = `${window.innerHeight - element.offsetHeight - 20}px`;
          }

          // Ensure panel isn't too high
          if (parseInt(element.style.top) < 20) {
            element.style.top = "20px";
          }
        }
      } catch (resizeError) {
        console.error("Error handling resize for draggable element:", resizeError);
      }
    });

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      // Get mouse position at startup
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;

      // Add active dragging class for visual feedback
      element.classList.add("vdp-dragging");
    }

    function elementDrag(e) {
      e.preventDefault();
      // Calculate new position
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      // Calculate new positions with bounds checking
      let newTop = element.offsetTop - pos2;
      let newLeft = element.offsetLeft - pos1;

      // Ensure the panel stays at least 20px from edges
      newTop = Math.max(20, Math.min(window.innerHeight - element.offsetHeight - 20, newTop));
      newLeft = Math.max(20, Math.min(window.innerWidth - element.offsetWidth - 20, newLeft));

      // Set element's new position
      element.style.top = newTop + "px";
      element.style.left = newLeft + "px";
      element.style.right = "auto"; // Clear right positioning when manually moved
    }

    function closeDragElement() {
      // Stop moving when mouse button is released
      document.onmouseup = null;
      document.onmousemove = null;

      // Remove active dragging class
      element.classList.remove("vdp-dragging");
    }
  } catch (error) {
    console.error("Error setting up draggable functionality:", error);
  }
};

/**
 * ==============================
 * INITIALIZATION AND EVENT HANDLING
 * ==============================
 */

/**
 * Handles messages from the background script
 * 
 * @param {Object} message - The message object
 * @param {Object} sender - The sender information
 * @param {Function} sendResponse - Function to send a response
 * @returns {boolean} - True to indicate async response
 */
const handleBackgroundMessages = (message, sender, sendResponse) => {
  try {
    if (!message || !message.action) {
      console.error("Received invalid message:", message);
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
        console.warn("Unknown message action:", message.action);
        sendResponse({ success: false, error: "Unknown action" });
    }
  } catch (error) {
    console.error("Error handling background message:", error);
    sendResponse({ success: false, error: error.message });
  }

  return true; // Required for async response
};

/**
 * Handles the addMedia message from the background script
 * 
 * @param {Object} message - The message object
 * @param {Function} sendResponse - Function to send a response
 */
const handleAddMediaMessage = (message, sendResponse) => {
  try {
    if (!message.media || !message.media.url) {
      sendResponse({ success: false, error: "Invalid media data" });
      return;
    }

    const media = message.media;

    // Skip if already detected
    if (detectedMedias.has(media.url)) {
      sendResponse({ success: true, status: "already_detected" });
      return;
    }

    // Add to detected medias
    detectedMedias.set(media.url, media);

    // Only add to panel if panel is already visible
    if (mediaPanel) {
      addMediaToPanel(media);
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error("Error handling addMedia message:", error);
    sendResponse({ success: false, error: error.message });
  }
};

/**
 * Handles the showPanel message from the background script
 * 
 * @param {Function} sendResponse - Function to send a response
 */
const handleShowPanelMessage = (sendResponse) => {
  try {
    // Show panel if it's not visible
    if (!mediaPanel) {
      const ui = createMediaPanel();
      mediaPanel = ui.panel;

      // Add all stored medias to the panel
      detectedMedias.forEach((media) => {
        addMediaToPanel(media);
      });
    }

    // Expand panel if it's collapsed
    if (mediaPanel.classList.contains("collapsed")) {
      mediaPanel.classList.remove("collapsed");
      const minimizeBtn = mediaPanel.querySelector(".vdp-minimize");
      if (minimizeBtn) {
        minimizeBtn.innerHTML = ICONS.minimize;
      }
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error("Error handling showPanel message:", error);
    sendResponse({ success: false, error: error.message });
  }
};

/**
 * Handles the rescanPage message from the background script
 * 
 * @param {Function} sendResponse - Function to send a response
 */
const handleRescanPageMessage = (sendResponse) => {
  try {
    // Clear local detected medias and recreate panel
    detectedMedias.clear();

    if (mediaPanel) {
      mediaPanel.remove();
      mediaPanel = null;
    }

    // Also clear the background script's dedup cache for this tab
    // so URLs can be re-detected during the rescan
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const tabId = tabs[0].id;
        chrome.runtime.sendMessage(
          { action: "rescanTab", tabId: tabId },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending rescanTab message:", chrome.runtime.lastError);
            }
          }
        );
      }
    });

    initialize();
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error handling rescanPage message:", error);
    sendResponse({ success: false, error: error.message });
  }
};

/**
 * Handles the clearMedias message from the background script
 * 
 * @param {Function} sendResponse - Function to send a response
 */
const handleClearMediasMessage = (sendResponse) => {
  try {
    // Clear medias when background script tells us to (happens on navigation)
    detectedMedias.clear();

    if (mediaPanel) {
      mediaPanel.remove();
      mediaPanel = null;
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error("Error handling clearMedias message:", error);
    sendResponse({ success: false, error: error.message });
  }
};

/**
 * Monitors URL changes for Single Page Applications
 * Clears media list and removes panel when URL changes
 */
const monitorUrlChanges = () => {
  try {
    if (currentPageUrl !== window.location.href) {
      // URL has changed (SPA navigation)
      console.log("Page URL changed, clearing media list");

      // Update current URL
      currentPageUrl = window.location.href;

      // Clear media list
      detectedMedias.clear();

      // Remove panel if it exists
      if (mediaPanel) {
        mediaPanel.remove();
        mediaPanel = null;
      }
    }
  } catch (error) {
    console.error("Error monitoring URL changes:", error);
  }
};

/**
 * Initializes the content script
 * Sets up message listeners and URL change monitoring
 */
const initialize = () => {
  try {
    if (isInitialized) return;

    isInitialized = true;

    // Update current page URL
    currentPageUrl = window.location.href;

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener(handleBackgroundMessages);

    // Listen for page URL changes (navigation within SPA)
    setInterval(monitorUrlChanges, CONFIG.URL_CHECK_INTERVAL);

    console.log("Media Downloader Professional content script initialized");
  } catch (error) {
    console.error("Error initializing content script:", error);
    isInitialized = false;
  }
};

// Initialize when DOM is fully loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
