# CineBox — Full-Stack Movie Streaming, Discovery & Download Platform

A comprehensive self-hosted cinema platform combining the best features of **MovieBox** (cinematic carousels & adaptive HLS streaming), **NetNaija** (multi-mirror direct download hub & community reviews), and **Jellyfin** (local media drive HTTP 206 streaming across your Wi-Fi network).

## Features

- **MovieBox-Style Cinema UI:** Auto-rotating hero banner, Continue Watching with timestamp resume, horizontal carousels, genre/quality filtering, and instant search.
- **Custom HTML5 + HLS.js Video Player:**
  - Adaptive HLS (`.m3u8`) bitrate switching (`Auto`, `1080p`, `720p`, `480p`) + direct MP4/WebM/MKV playback.
  - Multi-server mirror switching (preserves your timestamp) + automatic mirror fallback on stream errors.
  - Built-in `.vtt` and on-the-fly `.srt` subtitle support (including loading local `.srt` files from your PC).
  - Keyboard shortcuts (`Space`/`K`, `←`/`→`, `↑`/`↓`, `M`, `F`, `Esc`), playback speed, Picture-in-Picture, and direct downloads.
- **NetNaija-Style Download Hub:** Compact download directory displaying file sizes, codecs, mirror badges, download counters, and community comments/ratings.
- **Local Media Drive (Jellyfin Style):**
  - Drop `.mp4`, `.mkv`, `.webm`, `.mov` + `.srt`/`.vtt` files into `./media` (or configure any folder on your PC in Settings).
  - Full **HTTP 206 Partial Content Range streaming** for instant seeking across large files, plus direct Wi-Fi LAN streaming to phones, tablets, and Smart TVs.
- **TMDB Live Discovery:** Plug in a free TMDB API key in Settings to search millions of movies & TV shows, view official trailers, and import metadata in 1 click.
- **Admin Studio:** Full CRUD catalog management, multi-mirror source builder, poster uploader, and browser-based video uploader.

## Quick Start

```bash
npm install
npm start
```

Open **http://localhost:4500** in your browser (or use the Wi-Fi LAN URL printed in the terminal from your phone/TV).

## Project Structure

- `server/index.js` — Express server & static SPA entry point
- `server/db/store.js` & `server/db/seed.js` — Persistent JSON database & open-source playable demo catalog
- `server/routes/catalog.js` — Catalog filtering, sorting, metrics & comments API
- `server/routes/media.js` — Local folder scanner, HTTP 206 range streamer, downloader & SRT-to-VTT subtitle converter
- `server/routes/tmdb.js` — TMDB v3/v4 proxy & 1-click library importer
- `server/routes/admin.js` — Admin CRUD, multi-mirror manager, file uploads & settings
- `server/routes/user.js` — Watchlist & Continue Watching progress sync
- `public/` — Modular ES6 SPA frontend & custom cinema video player
