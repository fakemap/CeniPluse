import { api, showToast, formatTime, escapeHtml } from './api.js';

function clientSrtToVtt(srtText) {
  const cleaned = String(srtText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${cleaned}\n`;
}

export class CinemaPlayer {
  constructor(onProgressSaved) {
    this.onProgressSaved = onProgressSaved;
    this.hls = null;
    this.isOpen = false;
    this.currentContext = null; // { movie, sources, activeSourceIdx, episode, episodesList, subtitles }
    this.hideTimer = null;
    this.progressTimer = null;
    this.customSubtitleUrls = [];

    this.el = {
      overlay: document.getElementById('playerOverlay'),
      stage: document.getElementById('playerStage'),
      video: document.getElementById('videoElement'),
      spinner: document.getElementById('playerSpinner'),
      statusText: document.getElementById('playerStatusText'),
      title: document.getElementById('playerTitle'),
      subMeta: document.getElementById('playerSubMeta'),
      downloadLink: document.getElementById('playerDownloadLink'),
      closeBtn: document.getElementById('playerCloseBtn'),
      centerPlay: document.getElementById('playerCenterPlay'),
      playPauseBtn: document.getElementById('playPauseBtn'),
      playIcon: document.getElementById('playIcon'),
      pauseIcon: document.getElementById('pauseIcon'),
      skipBackBtn: document.getElementById('skipBackBtn'),
      skipFwdBtn: document.getElementById('skipFwdBtn'),
      muteBtn: document.getElementById('muteBtn'),
      volumeSlider: document.getElementById('volumeSlider'),
      timeDisplay: document.getElementById('timeDisplay'),
      seekBarWrap: document.getElementById('seekBarWrap'),
      seekBuffered: document.getElementById('seekBuffered'),
      seekProgress: document.getElementById('seekProgress'),
      seekTooltip: document.getElementById('seekTooltip'),
      nextEpisodeBtn: document.getElementById('nextEpisodeBtn'),
      serverMenuBtn: document.getElementById('serverMenuBtn'),
      serverMenu: document.getElementById('serverMenu'),
      hlsQualityWrap: document.getElementById('hlsQualityWrap'),
      hlsQualityBtn: document.getElementById('hlsQualityBtn'),
      hlsQualityMenu: document.getElementById('hlsQualityMenu'),
      subtitleMenuBtn: document.getElementById('subtitleMenuBtn'),
      subtitleMenu: document.getElementById('subtitleMenu'),
      localSubtitleInput: document.getElementById('localSubtitleInput'),
      speedSelect: document.getElementById('speedSelect'),
      pipBtn: document.getElementById('pipBtn'),
      fullscreenBtn: document.getElementById('fullscreenBtn'),
    };

    this.bindEvents();
  }

  bindEvents() {
    const v = this.el.video;

    this.el.closeBtn.addEventListener('click', () => this.close());
    this.el.playPauseBtn.addEventListener('click', () => this.togglePlay());
    this.el.centerPlay.addEventListener('click', () => this.togglePlay());
    v.addEventListener('click', () => {
      this.closePopovers();
      this.togglePlay();
    });
    v.addEventListener('dblclick', () => this.toggleFullscreen());

    this.el.skipBackBtn.addEventListener('click', () => this.seekBy(-10));
    this.el.skipFwdBtn.addEventListener('click', () => this.seekBy(10));

    this.el.muteBtn.addEventListener('click', () => {
      v.muted = !v.muted;
      this.el.volumeSlider.value = v.muted ? 0 : v.volume;
    });

    this.el.volumeSlider.addEventListener('input', (e) => {
      v.volume = Number(e.target.value);
      v.muted = v.volume === 0;
    });

    this.el.speedSelect.addEventListener('change', (e) => {
      v.playbackRate = Number(e.target.value);
    });

    this.el.pipBtn.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (v.requestPictureInPicture) {
          await v.requestPictureInPicture();
        }
      } catch {
        showToast('Picture-in-Picture is not supported here.', 'error');
      }
    });

    this.el.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

    // Seek bar interactions
    this.el.seekBarWrap.addEventListener('click', (e) => {
      const rect = this.el.seekBarWrap.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      if (v.duration && isFinite(v.duration)) {
        v.currentTime = ratio * v.duration;
      }
    });

    this.el.seekBarWrap.addEventListener('mousemove', (e) => {
      if (!v.duration || !isFinite(v.duration)) return;
      const rect = this.el.seekBarWrap.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      this.el.seekTooltip.textContent = formatTime(ratio * v.duration);
      this.el.seekTooltip.style.left = `${ratio * 100}%`;
      this.el.seekTooltip.classList.remove('hidden');
    });

    this.el.seekBarWrap.addEventListener('mouseleave', () => {
      this.el.seekTooltip.classList.add('hidden');
    });

    // Popover menus
    this.el.serverMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.el.serverMenu);
    });
    this.el.hlsQualityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.el.hlsQualityMenu);
    });
    this.el.subtitleMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover(this.el.subtitleMenu);
    });

    this.el.localSubtitleInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const vtt = file.name.toLowerCase().endsWith('.srt') ? clientSrtToVtt(text) : text;
      const blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      this.customSubtitleUrls.push(blobUrl);
      if (this.currentContext) {
        this.currentContext.subtitles.push({
          label: `Local: ${file.name}`,
          lang: 'en',
          url: blobUrl,
        });
        this.applySubtitles(this.currentContext.subtitles.length - 1);
        showToast(`Loaded subtitle: ${file.name}`);
      }
      e.target.value = '';
    });

    this.el.nextEpisodeBtn.addEventListener('click', () => this.playNextEpisode());

    // Video lifecycle events
    v.addEventListener('play', () => this.syncPlayIcons());
    v.addEventListener('pause', () => {
      this.syncPlayIcons();
      this.saveWatchProgress();
    });
    v.addEventListener('waiting', () => this.showSpinner('Buffering stream...'));
    v.addEventListener('playing', () => {
      this.hideSpinner();
      this.syncPlayIcons();
    });
    v.addEventListener('canplay', () => this.hideSpinner());

    v.addEventListener('timeupdate', () => {
      if (!v.duration || !isFinite(v.duration)) return;
      const pct = (v.currentTime / v.duration) * 100;
      this.el.seekProgress.style.width = `${pct}%`;
      this.el.timeDisplay.textContent = `${formatTime(v.currentTime)} / ${formatTime(v.duration)}`;
    });

    v.addEventListener('progress', () => {
      if (!v.duration || !v.buffered.length) return;
      const end = v.buffered.end(v.buffered.length - 1);
      this.el.seekBuffered.style.width = `${Math.min(100, (end / v.duration) * 100)}%`;
    });

    v.addEventListener('ended', () => {
      this.saveWatchProgress();
      if (this.hasNextEpisode()) {
        showToast('Playing next episode...');
        this.playNextEpisode();
      }
    });

    v.addEventListener('error', () => {
      this.hideSpinner();
      this.tryFallbackServer();
    });

    // Auto-hide controls on mouse inactivity
    this.el.stage.addEventListener('mousemove', () => this.bumpControlsVisibility());
    this.el.stage.addEventListener('click', () => this.bumpControlsVisibility());

    // Keyboard shortcuts while player is open
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'arrowleft':
          e.preventDefault();
          this.seekBy(-10);
          break;
        case 'arrowright':
          e.preventDefault();
          this.seekBy(10);
          break;
        case 'arrowup':
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          this.el.volumeSlider.value = v.volume;
          break;
        case 'arrowdown':
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          this.el.volumeSlider.value = v.volume;
          break;
        case 'm':
          v.muted = !v.muted;
          break;
        case 'f':
          this.toggleFullscreen();
          break;
        case 'escape':
          if (!document.fullscreenElement) this.close();
          break;
      }
    });
  }

  open({ movie, sourceIndex = 0, resumeTime = 0, episode = null, episodesList = [] }) {
    let sources = [];
    let title = movie.title;

    if (episode) {
      title = `${movie.title} — ${episode.title}`;
      sources = [
        {
          id: episode.id,
          label: `${episode.title} (${episode.quality || 'HD'})`,
          quality: episode.quality || 'HD',
          type: episode.type || (/\.m3u8(\?|$)/i.test(episode.url || '') ? 'hls' : 'mp4'),
          size: episode.size || '',
          url: episode.url,
          downloadUrl: episode.downloadUrl || episode.url,
        },
      ];
    } else {
      sources = movie.sources || [];
    }

    if (!sources.length) {
      showToast('No playable stream sources attached to this title yet. Add one in Admin Studio!', 'error');
      return;
    }

    this.currentContext = {
      movie,
      title,
      sources,
      activeSourceIdx: Math.min(sourceIndex, sources.length - 1),
      episode,
      episodesList,
      subtitles: [...(movie.subtitles || [])],
      attemptedFallbacks: new Set(),
    };

    this.isOpen = true;
    this.el.overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Record view in catalog if real catalog item
    if (movie.id && !movie.id.startsWith('local_')) {
      api.recordView(movie.id).catch(() => {});
    }

    this.el.nextEpisodeBtn.classList.toggle('hidden', !this.hasNextEpisode());
    this.renderServerMenu();
    this.applySubtitles(this.currentContext.subtitles.length ? 0 : -1);
    this.loadSource(this.currentContext.activeSourceIdx, resumeTime);

    clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => this.saveWatchProgress(), 5000);
    this.bumpControlsVisibility();
  }

  loadSource(index, startTime = 0) {
    const ctx = this.currentContext;
    if (!ctx || !ctx.sources[index]) return;

    ctx.activeSourceIdx = index;
    const source = ctx.sources[index];
    const v = this.el.video;

    this.destroyHls();
    this.el.hlsQualityWrap.classList.add('hidden');
    this.showSpinner(`Connecting to ${source.label}...`);

    this.el.title.textContent = ctx.title;
    this.el.subMeta.textContent = `${source.quality || 'HD'} • ${source.label}${source.size ? ` • ${source.size}` : ''}`;

    if (source.downloadUrl) {
      this.el.downloadLink.href = source.downloadUrl;
      this.el.downloadLink.classList.remove('hidden');
    } else {
      this.el.downloadLink.classList.add('hidden');
    }

    this.renderServerMenu();

    const isHls = source.type === 'hls' || /\.m3u8(\?|$)/i.test(source.url || '');

    const startPlayback = () => {
      if (startTime > 2 && isFinite(v.duration) && startTime < v.duration - 5) {
        v.currentTime = startTime;
      }
      v.play().catch(() => {
        this.hideSpinner();
        this.syncPlayIcons();
      });
    };

    if (isHls && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ enableWorker: true, lowLatencyMode: false });
      this.hls = hls;
      hls.loadSource(source.url);
      hls.attachMedia(v);

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        this.renderHlsQualityMenu(hls);
        startPlayback();
      });

      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          this.destroyHls();
          this.tryFallbackServer();
        }
      });
    } else {
      v.src = source.url;
      v.load();
      v.onloadedmetadata = () => {
        v.onloadedmetadata = null;
        startPlayback();
      };
    }
  }

  tryFallbackServer() {
    const ctx = this.currentContext;
    if (!ctx) return;
    ctx.attemptedFallbacks.add(ctx.activeSourceIdx);

    const nextIdx = ctx.sources.findIndex((_, idx) => !ctx.attemptedFallbacks.has(idx));
    if (nextIdx !== -1) {
      showToast(`Mirror failed — switching automatically to ${ctx.sources[nextIdx].label}`, 'error');
      this.loadSource(nextIdx, this.el.video.currentTime || 0);
    } else {
      showToast('Stream could not be loaded. Try another mirror or check your connection.', 'error');
    }
  }

  renderServerMenu() {
    const ctx = this.currentContext;
    if (!ctx) return;

    this.el.serverMenuBtn.textContent = ctx.sources[ctx.activeSourceIdx]?.quality || 'Servers';
    this.el.serverMenu.innerHTML = ctx.sources
      .map(
        (s, idx) => `
        <button class="popover-item ${idx === ctx.activeSourceIdx ? 'active' : ''}" data-src-idx="${idx}">
          <span>${escapeHtml(s.label)}</span>
          <span style="opacity:0.78;font-size:0.74rem">${escapeHtml(s.quality || 'HD')}</span>
        </button>`
      )
      .join('');

    this.el.serverMenu.querySelectorAll('[data-src-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.srcIdx);
        const keepTime = this.el.video.currentTime || 0;
        this.closePopovers();
        this.loadSource(idx, keepTime);
      });
    });
  }

  renderHlsQualityMenu(hls) {
    if (!hls.levels || hls.levels.length <= 1) {
      this.el.hlsQualityWrap.classList.add('hidden');
      return;
    }
    this.el.hlsQualityWrap.classList.remove('hidden');

    const renderList = () => {
      const current = hls.currentLevel;
      const isAuto = hls.autoLevelEnabled;
      this.el.hlsQualityBtn.textContent = isAuto
        ? 'Auto'
        : `${hls.levels[current]?.height || ''}p`;

      const items = [
        `<button class="popover-item ${isAuto ? 'active' : ''}" data-level="-1"><span>Auto (Adaptive)</span></button>`,
        ...hls.levels
          .map((lvl, idx) => ({ lvl, idx }))
          .sort((a, b) => (b.lvl.height || 0) - (a.lvl.height || 0))
          .map(
            ({ lvl, idx }) => `
            <button class="popover-item ${!isAuto && current === idx ? 'active' : ''}" data-level="${idx}">
              <span>${lvl.height ? `${lvl.height}p` : `Level ${idx + 1}`}</span>
              <span style="opacity:0.7;font-size:0.72rem">${Math.round((lvl.bitrate || 0) / 1000)} kbps</span>
            </button>`
          ),
      ];
      this.el.hlsQualityMenu.innerHTML = items.join('');

      this.el.hlsQualityMenu.querySelectorAll('[data-level]').forEach((btn) => {
        btn.addEventListener('click', () => {
          hls.currentLevel = Number(btn.dataset.level);
          this.closePopovers();
          renderList();
        });
      });
    };

    renderList();
  }

  applySubtitles(activeIdx = -1) {
    const v = this.el.video;
    const ctx = this.currentContext;
    if (!ctx) return;

    // Remove existing <track> nodes
    v.querySelectorAll('track').forEach((t) => t.remove());

    ctx.subtitles.forEach((sub, idx) => {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = sub.label || `Track ${idx + 1}`;
      track.srclang = sub.lang || 'en';
      track.src = sub.url;
      if (idx === activeIdx) track.default = true;
      v.appendChild(track);
    });

    setTimeout(() => {
      for (let i = 0; i < v.textTracks.length; i++) {
        v.textTracks[i].mode = i === activeIdx ? 'showing' : 'disabled';
      }
    }, 60);

    const items = [
      `<button class="popover-item ${activeIdx === -1 ? 'active' : ''}" data-sub-idx="-1"><span>Off</span></button>`,
      ...ctx.subtitles.map(
        (s, idx) => `
        <button class="popover-item ${activeIdx === idx ? 'active' : ''}" data-sub-idx="${idx}">
          <span>${escapeHtml(s.label)}</span>
        </button>`
      ),
      `<button class="popover-item" id="loadLocalSubBtn" style="color:#67e8f9">+ Load .SRT / .VTT from PC...</button>`,
    ];
    this.el.subtitleMenu.innerHTML = items.join('');

    this.el.subtitleMenu.querySelectorAll('[data-sub-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.applySubtitles(Number(btn.dataset.subIdx));
        this.closePopovers();
      });
    });

    const loadBtn = this.el.subtitleMenu.querySelector('#loadLocalSubBtn');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        this.closePopovers();
        this.el.localSubtitleInput.click();
      });
    }
  }

  hasNextEpisode() {
    const ctx = this.currentContext;
    if (!ctx || !ctx.episode || !ctx.episodesList?.length) return false;
    const idx = ctx.episodesList.findIndex((e) => e.id === ctx.episode.id);
    return idx !== -1 && idx < ctx.episodesList.length - 1;
  }

  playNextEpisode() {
    const ctx = this.currentContext;
    if (!this.hasNextEpisode()) return;
    const idx = ctx.episodesList.findIndex((e) => e.id === ctx.episode.id);
    const nextEp = ctx.episodesList[idx + 1];
    this.open({
      movie: ctx.movie,
      episode: nextEp,
      episodesList: ctx.episodesList,
    });
  }

  togglePlay() {
    const v = this.el.video;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  syncPlayIcons() {
    const paused = this.el.video.paused;
    this.el.playIcon.classList.toggle('hidden', !paused);
    this.el.pauseIcon.classList.toggle('hidden', paused);
    this.el.centerPlay.classList.toggle('hidden', !paused);
  }

  seekBy(delta) {
    const v = this.el.video;
    if (!isFinite(v.duration)) return;
    v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + delta));
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.el.stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  togglePopover(menuEl) {
    const wasHidden = menuEl.classList.contains('hidden');
    this.closePopovers();
    if (wasHidden) menuEl.classList.remove('hidden');
  }

  closePopovers() {
    this.el.serverMenu.classList.add('hidden');
    this.el.hlsQualityMenu.classList.add('hidden');
    this.el.subtitleMenu.classList.add('hidden');
  }

  showSpinner(msg) {
    this.el.statusText.textContent = msg || 'Loading...';
    this.el.spinner.classList.remove('hidden');
  }

  hideSpinner() {
    this.el.spinner.classList.add('hidden');
  }

  bumpControlsVisibility() {
    this.el.stage.classList.remove('controls-hidden');
    clearTimeout(this.hideTimer);
    if (!this.el.video.paused) {
      this.hideTimer = setTimeout(() => {
        this.closePopovers();
        this.el.stage.classList.add('controls-hidden');
      }, 3200);
    }
  }

  saveWatchProgress() {
    const ctx = this.currentContext;
    const v = this.el.video;
    if (!ctx || !v.duration || !isFinite(v.duration) || v.currentTime < 3) return;
    if (!ctx.movie?.id || ctx.movie.id.startsWith('local_')) return;

    api
      .saveProgress({
        movieId: ctx.movie.id,
        episodeId: ctx.episode?.id || null,
        title: ctx.title,
        poster: ctx.movie.backdrop || ctx.movie.poster || '',
        currentTime: v.currentTime,
        duration: v.duration,
        sourceId: ctx.sources[ctx.activeSourceIdx]?.id || null,
      })
      .then(() => {
        if (typeof this.onProgressSaved === 'function') this.onProgressSaved();
      })
      .catch(() => {});
  }

  destroyHls() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  close() {
    this.saveWatchProgress();
    clearInterval(this.progressTimer);
    clearTimeout(this.hideTimer);
    this.destroyHls();

    const v = this.el.video;
    v.pause();
    v.removeAttribute('src');
    v.load();

    this.customSubtitleUrls.forEach((u) => URL.revokeObjectURL(u));
    this.customSubtitleUrls = [];

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }

    this.isOpen = false;
    this.currentContext = null;
    this.el.overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }
}
