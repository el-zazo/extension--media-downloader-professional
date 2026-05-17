/**
 * Media Downloader Professional - Background Script
 * 
 * This script is responsible for detecting media from web requests and sending them
 * to the content script for processing. It monitors network traffic, identifies media
 * files based on MIME types and extensions, and manages the detected media items.
 * 
 * @author Video Downloader Professional Team
 * @version 1.0.0
 */

/**
 * ==========================================
 * CONSTANTS AND CONFIGURATION
 * ==========================================
 */

// File type extensions categorized by media type
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];
const AUDIO_EXTENSIONS = ["mp3", "aac", "wav", "ogg", "flac"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "webm", "mpg", "flv", "avi", "mkv", "ts", "m3u8", "m4s"];

// Combine all extensions into one array for efficient checking
const MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS];

// Configuration settings
const MIN_FILE_SIZE = 1024 * 10; // 10KB minimum size for valid media files
const MEDIA_MIME_TYPES = ["video/", "audio/", "application/x-mpegurl", "application/vnd.apple.mpegurl", "image/"];
const MAX_CACHED_URLS = 1000; // Maximum number of URLs to keep in memory
const CLEANUP_THRESHOLD = 500; // Number of URLs to remove when cache is full

// In-memory cache to track detected medias and avoid duplicates
// This Set is restored from storage on service worker restart
const detectedMedias = new Set();

// Storage key for persisting the detected media cache
const CACHE_STORAGE_KEY = "detectedMediaCache";

/**
 * ==========================================
 * UTILITY FUNCTIONS
 * ==========================================
 * 
 * A collection of helper functions for common operations throughout the extension.
 * These utilities handle URL parsing, error formatting, and HTTP header processing.
 */
const utils = {
  /**
   * Extracts the file extension from a URL
   * 
   * @param {string} url - URL to extract extension from
   * @returns {string} - Lowercase file extension without the dot
   * @throws {Error} - Handles URL parsing errors gracefully
   */
  getExtension: (url) => {
    if (!url || typeof url !== 'string') {
      console.warn('Invalid URL provided to getExtension');
      return '';
    }
    
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const extension = pathname.split(".").pop().toLowerCase();
      return extension || '';
    } catch (error) {
      // Fallback for invalid URLs
      try {
        return url.split(".").pop().toLowerCase() || '';
      } catch (fallbackError) {
        console.error('Failed to extract extension:', fallbackError);
        return '';
      }
    }
  },

  /**
   * Formats error messages for consistent logging
   * 
   * @param {Error|string} error - Error object or error message
   * @param {string} context - Context where the error occurred
   * @returns {string} - Formatted error message with context
   */
  formatError: (error, context = "") => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error in ${context || 'unknown context'}: ${errorMessage}`;
  },

  /**
   * Cleans URLs by removing tracking parameters for media files
   * 
   * @param {string} url - URL to clean
   * @returns {string} - Cleaned URL without query parameters for media files
   */
  cleanUrl: (url) => {
    if (!url || typeof url !== 'string') {
      console.warn('Invalid URL provided to cleanUrl');
      return '';
    }
    
    try {
      // Remove query parameters if it's a direct media file
      if (MEDIA_EXTENSIONS.some((ext) => url.toLowerCase().endsWith(`.${ext}`))) {
        const urlObj = new URL(url);
        if (urlObj.search) {
          return url.split("?")[0];
        }
      }
      return url;
    } catch (error) {
      console.warn(`Failed to clean URL: ${error.message}`);
      return url; // Return original URL if cleaning fails
    }
  },

  /**
   * Extracts and processes content-type and content-length from response headers
   * 
   * @param {Array} responseHeaders - Response headers array from web request
   * @returns {Object} - Object containing contentType and contentLength
   */
  getHeaderInfos: (responseHeaders) => {
    if (!Array.isArray(responseHeaders)) {
      console.warn('Invalid headers provided to getHeaderInfos');
      return { contentType: '', contentLength: 0 };
    }
    
    try {
      // Parse response headers into a Map for efficient access
      const headers = new Map();
      for (const { name = "", value } of responseHeaders) {
        headers.set(name.toLowerCase(), value);
      }

      // Extract content type with fallback to empty string
      const contentType = headers.get("content-type") || "";

      // Extract content length from different possible headers
      const contentLength = utils.parseContentLength(
        headers.get("content-length"),
        headers.get("content-range")
      );

      return { contentType, contentLength };
    } catch (error) {
      console.error(`Header parsing error: ${error.message}`);
      return { contentType: '', contentLength: 0 };
    }
  },
  
  /**
   * Parses content length from different header formats
   * 
   * @param {string} contentLengthHeader - Content-Length header value
   * @param {string} contentRangeHeader - Content-Range header value
   * @returns {number} - Parsed content length or 0 if invalid
   */
  parseContentLength: (contentLengthHeader, contentRangeHeader) => {
    // Try content-length header first
    if (contentLengthHeader) {
      const parsed = parseInt(contentLengthHeader, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    
    // Fall back to content-range header
    if (contentRangeHeader) {
      const match = contentRangeHeader.match(/bytes \d+-\d+\/(\d+)/);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
    
    return 0; // Default if no valid content length found
  },
  
  /**
   * Logs a message with timestamp for debugging
   * 
   * @param {string} message - Message to log
   * @param {string} level - Log level (info, warn, error)
   */
  log: (message, level = 'info') => {
    const timestamp = new Date().toISOString();
    const prefix = '[Media Downloader]';
    
    switch (level) {
      case 'warn':
        console.warn(`${prefix} ${timestamp} - ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ${timestamp} - ${message}`);
        break;
      default:
        console.log(`${prefix} ${timestamp} - ${message}`);
    }
  }
};

/**
 * ==========================================
 * MEDIA DETECTOR MODULE
 * ==========================================
 * 
 * Core functionality for detecting and processing media files from web requests.
 * This module handles the identification, filtering, and storage of media items.
 */
const MediaDetector = {
  /**
   * Processes a web request to detect and extract media information
   * 
   * @param {Object} details - Web request details from Chrome API
   * @param {string} details.url - The URL of the request
   * @param {Array} details.responseHeaders - Response headers from the request
   * @param {number} details.tabId - ID of the tab that made the request
   * @returns {Promise<void>}
   */
  checkObject: async (details) => {
    try {
      // Validate input parameters
      if (!details) {
        utils.log("Invalid details object provided to checkObject", "error");
        return;
      }

      const { url, responseHeaders, tabId } = details;

      // Skip processing for background requests (tabId < 0)
      if (tabId < 0) {
        return;
      }

      // Clean the URL and check if we've already processed it
      const cleanUrl = utils.cleanUrl(url);
      if (!cleanUrl || detectedMedias.has(cleanUrl)) {
        return;
      }

      // Extract content type and length from headers
      const { contentType, contentLength } = utils.getHeaderInfos(responseHeaders);

      // Skip files smaller than minimum size threshold
      if (contentLength > 0 && contentLength < MIN_FILE_SIZE) {
        return;
      }

      // Determine if this is a valid media file based on extension and MIME type
      if (!MediaDetector.isValidMedia(cleanUrl, contentType)) {
        return;
      }

      // Create and process the media item
      const mediaItem = MediaDetector.createMediaItem(cleanUrl, contentType, contentLength, tabId);
      
      // Add to detected media cache and manage cache size
      MediaDetector.addToMediaCache(cleanUrl);
      
      // Notify content script about the new media
      await MediaDetector.notifyContentScript(tabId, mediaItem);
      
      // Store in local storage for the popup
      await MediaDetector.storeMediaItem(tabId, mediaItem, cleanUrl);
      
    } catch (error) {
      utils.log(utils.formatError(error, "media detection"), "error");
    }
  },

  /**
   * Determines if a URL represents a valid media file based on extension and MIME type
   * 
   * @param {string} url - The URL to check
   * @param {string} contentType - The content type from headers
   * @returns {boolean} - True if valid media file, false otherwise
   */
  isValidMedia: (url, contentType) => {
    try {
      // Check URL extension
      const extension = utils.getExtension(url);
      const isExtensionValid = MEDIA_EXTENSIONS.includes(extension);

      // Check MIME type
      const isMimeValid = MEDIA_MIME_TYPES.some((type) => contentType.includes(type));

      // Valid if either extension or MIME type matches
      return isExtensionValid || isMimeValid;
    } catch (error) {
      utils.log(`Error validating media: ${error.message}`, "error");
      return false;
    }
  },
  
  /**
   * Creates a media item object with all necessary properties
   * 
   * @param {string} url - The cleaned URL of the media
   * @param {string} contentType - The content type from headers
   * @param {number} contentLength - The content length from headers
   * @param {number} tabId - The ID of the tab that made the request
   * @returns {Object} - Media item object
   */
  createMediaItem: (url, contentType, contentLength, tabId) => {
    const extension = utils.getExtension(url);
    const mediaItem = {
      url,
      mime: contentType,
      size: contentLength,
      extension,
      timestamp: Date.now(),
      title: "",
      tabId,
    };

    // Mark special formats that may require special handling
    if (extension === "m3u8" || contentType.includes("mpegurl")) {
      mediaItem.isHLS = true;
    }
    
    return mediaItem;
  },
  
  /**
   * Adds a URL to the media cache and manages cache size
   * Also persists the cache to storage for service worker restart recovery
   * 
   * @param {string} url - The URL to add to the cache
   */
  addToMediaCache: (url) => {
    // Add to detected media set
    detectedMedias.add(url);

    // If cache exceeds maximum size, remove oldest entries
    if (detectedMedias.size > MAX_CACHED_URLS) {
      const oldUrls = Array.from(detectedMedias).slice(0, CLEANUP_THRESHOLD);
      oldUrls.forEach((oldUrl) => detectedMedias.delete(oldUrl));
      utils.log(`Cleaned up ${CLEANUP_THRESHOLD} old URLs from cache`, "info");
    }

    // Persist cache to storage (debounced via microtask to avoid excessive writes)
    MediaDetector.persistCache();
  },

  /**
   * Persists the in-memory cache to chrome.storage.local
   * so it can be restored when the service worker restarts.
   * Uses a short debounce (500ms) to balance performance vs. data safety.
   */
  persistCache: (() => {
    let pendingTimeout = null;
    return () => {
      if (pendingTimeout) clearTimeout(pendingTimeout);
      pendingTimeout = setTimeout(() => {
        try {
          const cacheArray = Array.from(detectedMedias);
          chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cacheArray });
          utils.log(`Persisted ${cacheArray.length} URLs to cache storage`, "info");
        } catch (error) {
          utils.log(`Error persisting cache: ${error.message}`, "error");
        }
        pendingTimeout = null;
      }, 500); // Reduced debounce: 500ms for better data safety on SW restart
    };
  })(),

  /**
   * Restores the in-memory cache from chrome.storage.local
   * Called on service worker startup to avoid re-processing already detected URLs
   */
  restoreCache: async () => {
    try {
      const result = await chrome.storage.local.get([CACHE_STORAGE_KEY]);
      const cachedUrls = result[CACHE_STORAGE_KEY] || [];
      cachedUrls.forEach((url) => detectedMedias.add(url));
      utils.log(`Restored ${cachedUrls.length} URLs from cache storage`, "info");
    } catch (error) {
      utils.log(`Error restoring cache: ${error.message}`, "error");
    }
  },
  
  /**
   * Notifies the content script about a new media item
   * 
   * @param {number} tabId - The ID of the tab to notify
   * @param {Object} mediaItem - The media item to send
   * @returns {Promise<void>}
   */
  notifyContentScript: async (tabId, mediaItem) => {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "addMedia",
        media: mediaItem,
      });
    } catch (error) {
      // This is expected if the content script isn't ready yet
      utils.log(`Tab ${tabId} not ready for messages: ${error.message}`, "info");
    }
  },
  
  /**
   * Stores a media item in local storage for the popup
   * 
   * @param {number} tabId - The ID of the tab the media belongs to
   * @param {Object} mediaItem - The media item to store
   * @param {string} url - The URL of the media item
   * @returns {Promise<void>}
   */
  storeMediaItem: async (tabId, mediaItem, url) => {
    try {
      const result = await chrome.storage.local.get(["medias"]);
      
      // Initialize medias object if not present
      const medias = result.medias || {};

      // Initialize array for this tab if not present
      if (!medias[tabId]) {
        medias[tabId] = [];
      }

      // Add if not already in the list
      if (!medias[tabId].some((item) => item.url === url)) {
        medias[tabId].push(mediaItem);
        await chrome.storage.local.set({ medias });
        utils.log(`Stored media item for tab ${tabId}`, "info");
      }
    } catch (error) {
      utils.log(`Error storing media: ${error.message}`, "error");
    }
  },

  /**
   * Clears all detected media items for a specific tab
   * Also removes the tab's URLs from the in-memory dedup Set
   * 
   * @param {number} tabId - The ID of the tab to clear media for
   * @returns {Promise<void>}
   */
  clearTabMedias: async (tabId) => {
    try {
      if (typeof tabId !== 'number') {
        utils.log(`Invalid tabId provided to clearTabMedias: ${tabId}`, "error");
        return;
      }
      
      const result = await chrome.storage.local.get(["medias"]);
      const medias = result.medias || {};
      
      // Remove the tab's URLs from the in-memory dedup Set so they can be re-detected
      if (medias[tabId] && Array.isArray(medias[tabId])) {
        medias[tabId].forEach((item) => {
          if (item && item.url) {
            detectedMedias.delete(item.url);
          }
        });
        utils.log(`Removed ${medias[tabId].length} URLs from dedup cache for tab ${tabId}`, "info");
      }
      
      // Remove media items for this tab from storage
      if (medias[tabId]) {
        delete medias[tabId];
        await chrome.storage.local.set({ medias });
        utils.log(`Cleared media items for tab ${tabId}`, "info");
      }

      // Persist the updated dedup cache
      MediaDetector.persistCache();
    } catch (error) {
      utils.log(`Error clearing tab medias: ${error.message}`, "error");
    }
  },
};

/**
 * ==========================================
 * EXTENSION INITIALIZATION AND EVENT HANDLERS
 * ==========================================
 */

/**
 * MessageHandler - Manages communication between background script, content scripts, and popup
 */
const MessageHandler = {
  /**
   * Processes incoming messages from content scripts and popup
   * 
   * @param {Object} message - The message object
   * @param {Object} sender - Information about the sender
   * @param {Function} sendResponse - Function to send a response
   * @returns {boolean} - True if response will be sent asynchronously
   */
  handleMessage: (message, sender, sendResponse) => {
    try {
      if (!message || !message.action) {
        utils.log("Received invalid message without action", "error");
        sendResponse({ error: "Invalid message format" });
        return false;
      }
      
      switch (message.action) {
        case "getMedias":
          return MessageHandler.handleGetMedias(message, sendResponse);
          
        case "downloadMedia":
          return MessageHandler.handleDownloadMedia(message, sendResponse);
        
        case "clearMedias":
          return MessageHandler.handleClearMedias(message, sendResponse);
        
        case "rescanTab":
          return MessageHandler.handleRescanTab(message, sendResponse);
          
        default:
          utils.log(`Unknown message action: ${message.action}`, "warn");
          sendResponse({ error: `Unknown action: ${message.action}` });
          return false;
      }
    } catch (error) {
      utils.log(`Message handler error: ${error.message}`, "error");
      sendResponse({ error: error.message });
      return false;
    }
  },
  
  /**
   * Handles requests for media items from popup
   * Filters by tabId if provided to avoid sending unnecessary data
   * 
   * @param {Object} message - The message object (may contain tabId)
   * @param {Function} sendResponse - Function to send a response
   * @returns {boolean} - True to indicate async response
   */
  handleGetMedias: (message, sendResponse) => {
    chrome.storage.local
      .get(["medias"])
      .then((result) => {
        const allMedias = result.medias || {};
        // If tabId is specified, only return media for that tab
        if (message && message.tabId) {
          const tabMedias = allMedias[message.tabId] || [];
          sendResponse({ medias: { [message.tabId]: tabMedias } });
        } else {
          sendResponse({ medias: allMedias });
        }
      })
      .catch((error) => {
        utils.log(`Error getting medias: ${error.message}`, "error");
        sendResponse({ error: error.message });
      });
    return true; // Indicates async response
  },
  
  /**
   * Handles clearMedias requests from content scripts
   * Clears media for a specific tab
   * 
   * @param {Object} message - The message object (may contain tabId)
   * @param {Function} sendResponse - Function to send a response
   * @returns {boolean} - True to indicate async response
   */
  handleClearMedias: (message, sendResponse) => {
    if (!message || !message.tabId) {
      utils.log("clearMedias request missing tabId", "error");
      sendResponse({ success: false, error: "Missing tabId" });
      return false;
    }
    
    MediaDetector.clearTabMedias(message.tabId)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        utils.log(`Error clearing medias: ${error.message}`, "error");
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates async response
  },
  
  /**
   * Handles rescanTab requests from content scripts.
   * Clears the dedup cache for a specific tab's URLs so they can be re-detected.
   * 
   * @param {Object} message - The message object (must contain tabId)
   * @param {Function} sendResponse - Function to send a response
   * @returns {boolean} - True to indicate async response
   */
  handleRescanTab: (message, sendResponse) => {
    if (!message || !message.tabId) {
      utils.log("rescanTab request missing tabId", "error");
      sendResponse({ success: false, error: "Missing tabId" });
      return false;
    }
    
    const tabId = message.tabId;
    
    // Clear the tab's media from storage and dedup Set
    MediaDetector.clearTabMedias(tabId)
      .then(() => {
        utils.log(`Rescan: cleared dedup cache for tab ${tabId}`, "info");
        sendResponse({ success: true });
      })
      .catch((error) => {
        utils.log(`Error during rescan clear: ${error.message}`, "error");
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates async response
  },
  
  /**
   * Handles media download requests from content script
   * 
   * @param {Object} message - The message containing download details
   * @param {Function} sendResponse - Function to send a response
   * @returns {boolean} - True to indicate async response
   */
  handleDownloadMedia: (message, sendResponse) => {
    if (!message.url) {
      utils.log("Download request missing URL", "error");
      sendResponse({ success: false, error: "Missing URL" });
      return false;
    }
    
    chrome.downloads
      .download({
        url: message.url,
        filename: message.filename || "",
        saveAs: true,
      })
      .then((downloadId) => {
        utils.log(`Download started with ID: ${downloadId}`, "info");
        sendResponse({ success: true, downloadId });
      })
      .catch((error) => {
        utils.log(`Download failed: ${error.message}`, "error");
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates async response
  },
};

/**
 * Initialize the extension and set up event listeners
 */
const initializeExtension = () => {
  try {
    // Register web request listener to detect media files
    chrome.webRequest.onHeadersReceived.addListener(
      MediaDetector.checkObject, 
      { urls: ["<all_urls>"] }, 
      ["responseHeaders"]
    );
    utils.log("Web request listener registered", "info");

    // Clear media cache when a tab is closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      MediaDetector.clearTabMedias(tabId);
    });
    utils.log("Tab removal listener registered", "info");

    // Clear media cache when a tab navigates to a new page
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "loading" && changeInfo.url) {
        MediaDetector.clearTabMedias(tabId);
        utils.log(`Tab ${tabId} navigated to new URL, cleared media cache`, "info");
      }
    });
    utils.log("Tab navigation listener registered", "info");

    // Set up message handler for communication
    chrome.runtime.onMessage.addListener(MessageHandler.handleMessage);
    utils.log("Message listener registered", "info");
    
    utils.log("Media Downloader Professional background script initialized successfully", "info");
  } catch (error) {
    utils.log(utils.formatError(error, "extension initialization"), "error");
  }
};

/**
 * Start the extension
 * First restore the cache from storage, then initialize event listeners
 */
MediaDetector.restoreCache().then(() => {
  initializeExtension();
});
