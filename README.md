<div align="center">

# 🎬 Media Downloader Professional v3

**Detect, download, and manage media from any webpage with a sleek, professional interface**

[Features](#-features) • [Installation](#-installation) • [Usage](#-how-to-use) • [Supported Formats](#-supported-formats) • [Technical Details](#-technical-details) • [Contributing](#-contributing) • [Privacy](#-privacy) • [License](#-license)

</div>

## ✨ Features

- **🔍 Automatic Media Detection**: Captures images, videos, and audio as they load on the page
- **🎨 Professional UI**: Clean, modern interface with dark mode support
- **📋 Easy Link Management**: One-click copy, download, and save functionality
- **🔄 Format Conversion**: Save media in various formats (coming soon)
- **🖱️ Draggable Interface**: Move the media panel anywhere on the page
- **📱 Responsive Design**: Works on any screen size
- **🔒 Privacy Focused**: No data sent to remote servers
- **💾 Media Library**: Save your favorite media for later access
- **🔍 Advanced Filtering**: Filter media by type, size, and more

## 📥 Installation

### Chrome / Edge / Brave (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extension directory
5. The extension should now be installed and visible in your toolbar

### Firefox (Temporary Add-on)

1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select the `manifest.json` file from the extension directory
5. The extension should now be installed and visible in your toolbar

## 🚀 How to Use

1. **Browse to any webpage** containing media (videos, images, audio)
2. **Media will be automatically detected** and shown in a panel on the page
3. **Use the toolbar buttons** to:
   - 📋 **Copy**: Copy the media URL to your clipboard
   - ⬇️ **Download**: Save the media directly to your device
   - 💾 **Save**: Store the media in your library for later access
   - 🔍 **Filter**: Filter media by type (image, video, audio)
4. **Drag the panel** to reposition it anywhere on the page
5. **Minimize** the panel to keep it out of the way while browsing
6. **Click the extension icon** in your browser toolbar to access the popup interface

## 🔧 Technical Details

The extension utilizes several advanced browser APIs to provide a seamless media detection experience:

- **Web Request API**: Monitors network traffic using `webRequest.onHeadersReceived` to detect media content as it's loaded
- **Content Scripts**: Injects UI components directly into webpages for in-page media panel
- **Background Service Worker**: Processes media detection in the background for optimal performance
- **Local Storage API**: Securely stores saved media preferences and library items
- **Manifest V3**: Built on the latest extension platform for improved security and performance

This architecture allows the extension to capture media before it's even played, providing a comprehensive list of all media on the page.

## 📋 Supported Formats

### Video Formats

- MP4, WebM, M3U8 (HLS)
- MOV, M4V, MPG, M4S
- FLV, TS, AVI, MKV

### Audio Formats

- MP3, AAC, WAV
- OGG, FLAC

### Image Formats

- JPG/JPEG, PNG, GIF
- BMP, WebP, SVG

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch: `git checkout -b new-feature`
3. Make your changes and commit: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin new-feature`
5. Submit a pull request

Please make sure to update tests as appropriate and follow the code style guidelines.

## 🔒 Privacy

This extension operates entirely on your device and does not send any data to remote servers. Media URLs are stored temporarily in your browser's local storage and are cleared when tabs are closed. Saved media items remain in your library until you explicitly remove them.

We take your privacy seriously and do not collect any personal information or browsing history.

## 📜 License

This project is licensed under the MIT License

---

<div align="center">

Made with ❤️ by the Media Downloader Professional Team

</div>
