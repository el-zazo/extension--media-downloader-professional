/**
 * Media Downloader Professional - Constants
 * Contains all constants and configuration values used in the extension
 */

// Image extensions
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];

// Audio extensions
export const AUDIO_EXTENSIONS = ["mp3", "aac", "wav", "ogg", "flac"];

// Video extensions
export const VIDEO_EXTENSIONS = ["m3u8", "mp4", "mov", "m4v", "webm", "mpg", "m4s", "ts", "flv", "avi", "mkv"];

// All media extensions combined for filtering
export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

// Notification display duration in milliseconds
export const NOTIFICATION_DURATION = 2000;

// Default filter value
export const DEFAULT_FILTER = "all";

// Default tab
export const DEFAULT_TAB = "detected";

// Storage keys
export const STORAGE_KEYS = {
  SAVED_MEDIA: "savedMedia",
};

// Message actions
export const ACTIONS = {
  GET_MEDIAS: "getMedias",
  DOWNLOAD_MEDIA: "downloadMedia",
  SHOW_PANEL: "showPanel",
  RESCAN_PAGE: "rescanPage",
  CLEAR_MEDIAS: "clearMedias",
};
