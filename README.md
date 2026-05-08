# Aegis Tactical Comm (Ver 2.5.0-AUDIO)

![Build Status](https://github.com/yyyt59983-svg/fc/actions/workflows/build.yml/badge.svg)

Professional-grade tactical communicator with real-time PTT voice streaming, manual frequency management, and multi-platform support.

## 📥 Downloads

Latest builds are automatically generated via GitHub Actions:
- **[Windows Portable (.exe)](https://github.com/yyyt59983-svg/fc/actions)** - Download from the latest successful "Build Multi-Platform" run.
- **[Android Debug APK](https://github.com/yyyt59983-svg/fc/actions)** - Download from the latest successful "Build Multi-Platform" run.

## Features

- **Push-to-Talk (PTT)**: Real-time, low-latency audio streaming via WebRTC/Socket.io.
- **Manual Frequency Keypad**: Digital keypad for precise tuning (144.000 - 446.000 MHz).
- **Channel Manager**: Persistent history of connected channels and favoriting with custom nicknames.
- **SOS Beacon**: Emergency signal broadcasting across the current frequency.
- **Visualizer**: High-fidelity tactical signal visualizer for RX/TX feedback.
- **Multi-Platform**: Deployable on Windows (.exe), Android (Native/PWA), and Web.

## Installation

### Windows
1. Download the `Aegis_Tactical_Comm.exe` from the latest release.
2. Run the executable for a portable, distraction-free experience.

### Android
1. Open the application URL in Chrome.
2. Select "Add to Home Screen" to install as a PWA.
3. Or install the provided `.apk` for a native experience.

## Development

### Prerequisites
- Node.js (v20+)
- npm

### Setup
```bash
npm install
npm run dev
```

### Build Pipelines
- **Windows**: `npm run build:win`
- **Android**: `npm run build:android`

---
**Tactical Briefing**: This system is designed for high-stakes communication. Use the 'Keyboard' icon for manual entry and the 'Star' icon to save critical mission frequencies.
