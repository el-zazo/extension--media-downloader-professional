/**
 * Media Downloader Professional - UI Module
 * Handles UI-related functionality and interactions
 */

// Constants
import { NOTIFICATION_DURATION } from "./constants.js";

/**
 * UI Manager class for handling UI-related operations
 */
class UIManager {
  constructor() {
    this.notificationTimeout = null;
  }

  /**
   * Show notification toast with a message
   * @param {string} message - Message to display
   * @param {number} [duration=NOTIFICATION_DURATION] - Duration to show notification in ms
   */
  showNotification(message, duration = NOTIFICATION_DURATION) {
    try {
      // Clear existing timeout if present
      if (this.notificationTimeout) {
        clearTimeout(this.notificationTimeout);
        this.notificationTimeout = null;
      }

      // Get or create notification element
      let notification = document.querySelector(".notification-toast");
      if (!notification) {
        notification = document.createElement("div");
        notification.className = "notification-toast";
        document.body.appendChild(notification);
      }

      // Update notification content and show it
      notification.textContent = message;
      notification.style.opacity = "1";
      notification.style.transform = "translateX(-50%) translateY(0)";

      // Set timeout to hide notification
      this.notificationTimeout = setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.transform = "translateX(-50%) translateY(10px)";
        this.notificationTimeout = null;
      }, duration);
    } catch (error) {
      console.error("Error showing notification:", error);
    }
  }

  /**
   * Toggle element visibility
   * @param {HTMLElement} element - Element to toggle
   * @param {boolean} show - Whether to show or hide the element
   */
  toggleElementVisibility(element, show) {
    if (!element) return;
    element.style.display = show ? "block" : "none";
  }

  /**
   * Update element text content
   * @param {string} elementId - ID of the element to update
   * @param {string} text - New text content
   */
  updateElementText(elementId, text) {
    try {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = text;
      }
    } catch (error) {
      console.error(`Error updating element ${elementId}:`, error);
    }
  }

  /**
   * Show a confirmation dialog with custom message
   * @param {string} message - Confirmation message
   * @returns {boolean} - User's choice (true for confirm, false for cancel)
   */
  showConfirmation(message) {
    return confirm(message);
  }

  /**
   * Show modal dialog
   * @param {string} modalId - ID of the modal to show
   */
  showModal(modalId) {
    try {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.add("active");
      }
    } catch (error) {
      console.error(`Error showing modal ${modalId}:`, error);
    }
  }

  /**
   * Hide modal dialog
   * @param {string} modalId - ID of the modal to hide
   */
  hideModal(modalId) {
    try {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove("active");
      }
    } catch (error) {
      console.error(`Error hiding modal ${modalId}:`, error);
    }
  }
}

// Export a singleton instance
export const ui = new UIManager();
