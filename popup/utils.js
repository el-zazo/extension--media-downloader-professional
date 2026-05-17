/**
 * Media Downloader Professional - Utilities
 * Common utility functions used throughout the extension
 */

// UI functions
import { ui } from "./ui.js";

/**
 * Utility class for common operations
 */
class Utils {
  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} - Formatted file size
   */
  formatFileSize(bytes) {
    try {
      if (!bytes || bytes === 0) return "Unknown";

      // Convert bytes to KB, MB, GB, etc.
      const units = ["B", "KB", "MB", "GB"];
      let size = bytes;
      let unitIndex = 0;

      // Convert to the appropriate unit
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return `${size.toFixed(1)} ${units[unitIndex]}`;
    } catch (error) {
      console.error("Error formatting file size:", error);
      return "Unknown";
    }
  }

  /**
   * Format datetime
   * @param {number} timestamp - Unix timestamp
   * @returns {string} - Formatted datetime
   */
  formatDateTime(timestamp) {
    try {
      if (!timestamp) return "Unknown time";

      // Format the date and time
      const date = new Date(timestamp);
      const options = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
      return date.toLocaleString(undefined, options);
    } catch (error) {
      console.error("Error formatting datetime:", error);
      return "Unknown time";
    }
  }

  /**
   * Copy URL to clipboard
   * @param {string} url - URL to copy
   */
  copyToClipboard(url) {
    try {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          ui.showNotification("URL copied to clipboard");
        })
        .catch((err) => {
          console.error("Copy failed:", err);
          this.fallbackCopyToClipboard(url);
        });
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      this.fallbackCopyToClipboard(url);
    }
  }

  /**
   * Fallback method for copying to clipboard
   * @param {string} text - Text to copy
   * @private
   */
  fallbackCopyToClipboard(text) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand("copy");
      if (successful) {
        ui.showNotification("URL copied to clipboard");
      } else {
        ui.showNotification("Failed to copy URL");
      }

      document.body.removeChild(textArea);
    } catch (err) {
      console.error("Fallback copy failed:", err);
      ui.showNotification("Failed to copy URL");
    }
  }

  /**
   * Generate a unique ID
   * @returns {string} - Unique ID
   */
  generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Safely parse JSON
   * @param {string} jsonString - JSON string to parse
   * @param {*} defaultValue - Default value to return if parsing fails
   * @returns {*} - Parsed object or default value
   */
  safeJsonParse(jsonString, defaultValue = {}) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      return defaultValue;
    }
  }

  /**
   * Get file extension from URL or filename
   * @param {string} urlOrFilename - URL or filename
   * @returns {string} - File extension (lowercase)
   */
  getFileExtension(urlOrFilename) {
    try {
      if (!urlOrFilename) return "";

      // Remove query parameters and hash
      const cleanUrl = urlOrFilename.split(/[?#]/)[0];

      // Get the last part after the last dot
      const extension = cleanUrl.split(".").pop();

      return extension ? extension.toLowerCase() : "";
    } catch (error) {
      console.error("Error getting file extension:", error);
      return "";
    }
  }
}

// Export a singleton instance
export const utils = new Utils();
