/**
 * Media Downloader Professional - Icons
 * SVG Icons for use in the UI
 */

// Common SVG attributes for consistent styling
const SVG_ATTRS = `xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"`;
const PATH_ATTRS = `stroke-linecap="round" stroke-linejoin="round" stroke-width="2"`;

/**
 * Collection of SVG icons used throughout the extension
 */
export const ICONS = {
  // Media type icons
  image: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>`,

  video: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" /><rect x="3" y="6" width="12" height="12" rx="2" stroke-width="2" />
    </svg>`,

  audio: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>`,

  // Action icons
  copy: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>`,

  download: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>`,

  save: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>`,

  delete: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>`,

  // Empty state icons
  search: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>`,

  filter: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>`,

  folder: `
    <svg ${SVG_ATTRS}>
        <path ${PATH_ATTRS} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>`,
};
