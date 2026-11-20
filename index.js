'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Ensure ffmpeg-static binary is downloaded on Node 24 / npm 12 hosts (e.g., Bot-Hosting.net)
// where npm blocks postinstall scripts by default.
try {
  const ffmpegStaticPath = require('ffmpeg-static');
  if (ffmpegStaticPath && !fs.existsSync(ffmpegStaticPath)) {
    const installScript = path.join(__dirname, 'node_modules', 'ffmpeg-static', 'install.js');
    if (fs.existsSync(installScript)) {
      console.log('[Startup] Downloading ffmpeg-static binary for live MP4 remuxing...');
      spawnSync(process.execPath, [installScript], { stdio: 'inherit' });
    }
  }
} catch {
  // Optional: server falls back to system ffmpeg or raw .ts if unavailable
}

const app = require('./server/index.js');
if (typeof app.startServer === 'function') {
  app.startServer();
}
