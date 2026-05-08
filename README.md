# Aegis Tactical Comm (Ver 2.5.0-AUDIO)

Professional-grade tactical communicator with real-time PTT voice streaming, manual frequency management, and multi-platform support.

## Features

- **Push-to-Talk (PTT)**: Real-time, low-latency audio streaming via WebRTC/Socket.io.
- **Manual Frequency Keypad**: Digital keypad for precise tuning (144.000 - 446.000 MHz).
- **Channel Manager**: Persistent history of connected channels and favoriting with custom nicknames.
- **SOS Beacon**: Emergency signal broadcasting across the current frequency.
- **Visualizer**: High-fidelity tactical signal visualizer for RX/TX feedback.
- **Multi-Platform**: Deployable on Windows (.exe), Android (Native/PWA), and Web.

## Download / Installation

[![Windows Build](https://github.com/yyyt59983-svg/fc/actions/workflows/build.yml/badge.svg)](https://github.com/yyyt59983-svg/fc/actions/workflows/build.yml)
[![Android Build](https://github.com/yyyt59983-svg/fc/actions/workflows/build.yml/badge.svg)](https://github.com/yyyt59983-svg/fc/actions/workflows/build.yml)

### 🖥️ Windows (Desktop)
Download the latest automated build for Windows. This is a portable executable, so no installation is required—just extract and run.
- [⬇️ Download Windows EXE (Latest Build)](https://nightly.link/yyyt59983-svg/fc/workflows/build/main/Aegis-Tactical-Comm-Windows.zip)

### 📱 Android (Mobile)
Download the latest Android APK. You may need to enable "Install Unknown Apps" in your Android settings.
- [⬇️ Download Android APK (Latest Build)](https://nightly.link/yyyt59983-svg/fc/workflows/build/main/Aegis-Tactical-Comm-Android.zip)

Alternatively, you can open the deployed URL in Chrome and select **"Add to Home Screen"** to install as a Lightweight PWA.

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
