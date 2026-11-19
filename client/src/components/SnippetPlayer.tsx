import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { MediaItem } from '../types/media';
import { backendApi } from '../services/api';

interface SnippetPlayerProps {
  item: MediaItem;
  active: boolean;
  muted: boolean;
  variant: 'hero' | 'card';
  startDelayMs?: number;
  onReadyChange?: (ready: boolean) => void;
  onHasSnippetChange?: (hasSnippet: boolean) => void;
}

/**
 * Reusable muted video/trailer snippet autoplay engine with automatic fallback
 * from direct MP4/HLS streams to TMDB YouTube trailers, debounced arming,
 * and full Hls/video/iframe/AbortController disposal on unmount or slide change.
 */
export const SnippetPlayer: React.FC<SnippetPlayerProps> = ({
  item,
  active,
  muted,
  variant,
  startDelayMs = 500,
  onReadyChange,
  onHasSnippetChange,
}) => {
  const directUrl = item.previewVideoUrl || item.sources?.[0]?.url || '';

  const [armed, setArmed] = useState(false);
  const [ytKey, setYtKey] = useState<string>(item.trailerYoutubeId || '');
  const [videoFailed, setVideoFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimerRef = useRef<number | null>(null);
  const lookedUpItemIdRef = useRef<string>('');
  const mutedRef = useRef(muted);
  const onReadyRef = useRef(onReadyChange);
  const onHasSnippetRef = useRef(onHasSnippetChange);

  mutedRef.current = muted;
  onReadyRef.current = onReadyChange;
  onHasSnippetRef.current = onHasSnippetChange;

  // Reset per-item playback state only when switching to a different media item
  useEffect(() => {
    setYtKey(item.trailerYoutubeId || '');
    setVideoFailed(false);
    setReady(false);
    lookedUpItemIdRef.current = '';
  }, [item.id]);

  // Adopt asynchronously enriched trailer key on the same item without resetting matching playback
  useEffect(() => {
    if (item.trailerYoutubeId && item.trailerYoutubeId !== ytKey) {
      setYtKey(item.trailerYoutubeId);
    }
  }, [item.trailerYoutubeId, ytKey]);

  // Debounced activation so rapid clicks/swipes or quick mouse sweeps skip unnecessary loads
  useEffect(() => {
    if (!active) {
      setArmed(false);
      setReady(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setArmed(true);
    }, startDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [active, startDelayMs, item.id]);

  // Lazy cached TMDB trailer key lookup when no direct stream/trailer is bundled on the item
  useEffect(() => {
    if (!armed) return;
    const needsTrailer = !directUrl || videoFailed;
    if (!needsTrailer || ytKey || !item.tmdbId) return;
    if (lookedUpItemIdRef.current === item.id) return;

    lookedUpItemIdRef.current = item.id;
    let mounted = true;
    const controller = new AbortController();

    backendApi.fetchTrailerKey(item.type, item.tmdbId, controller.signal).then((key) => {
      if (!mounted || controller.signal.aborted) return;
      if (key) setYtKey(key);
    });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [armed, directUrl, videoFailed, ytKey, item.id, item.type, item.tmdbId]);

  const mode: 'video' | 'youtube' | 'none' =
    armed && directUrl && !videoFailed
      ? 'video'
      : armed && ytKey
      ? 'youtube'
      : 'none';

  const hasSnippet = Boolean((directUrl && !videoFailed) || ytKey);

  useEffect(() => {
    setReady(false);
    if (loadTimerRef.current) {
      window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  }, [item.id, active, mode, ytKey]);

  useEffect(() => {
    onHasSnippetRef.current?.(hasSnippet);
  }, [hasSnippet]);

  useEffect(() => {
    onReadyRef.current?.(ready);
  }, [ready]);

  useEffect(() => {
    return () => {
      if (loadTimerRef.current) {
        window.clearTimeout(loadTimerRef.current);
      }
      onReadyRef.current?.(false);
    };
  }, []);

  // Direct MP4 / HLS snippet lifecycle (jumps to 12% intro mark & loops a 22s clip)
  useEffect(() => {
    if (mode !== 'video' || !directUrl || !videoRef.current) return;

    const video = videoRef.current;
    video.muted = mutedRef.current;
    video.playsInline = true;
    let hls: Hls | null = null;
    let snippetStart = 0;
    let disposed = false;

    const beginSnippetPlayback = () => {
      if (disposed) return;
      const dur = video.duration;
      snippetStart = isFinite(dur) && dur > 90 ? Math.min(45, Math.floor(dur * 0.12)) : 0;
      if (snippetStart > 0) {
        try {
          video.currentTime = snippetStart;
        } catch {
          // ignore seek error before buffer readiness
        }
      }
      video.play().catch(() => {});
    };

    const onReady = () => {
      if (!disposed) setReady(true);
    };

    const onTimeUpdate = () => {
      if (disposed) return;
      if (video.currentTime > snippetStart + 22) {
        video.currentTime = snippetStart;
      }
    };

    const onFatalFailure = () => {
      if (disposed) return;
      setReady(false);
      setVideoFailed(true);
    };

    video.addEventListener('playing', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', onFatalFailure);

    const isHls = /\.m3u8(\?|$)/i.test(directUrl);
    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 15,
      });
      hls.loadSource(directUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, beginSnippetPlayback);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          if (hls) {
            hls.destroy();
            hls = null;
          }
          onFatalFailure();
        }
      });
    } else {
      video.src = directUrl;
      video.addEventListener('loadedmetadata', beginSnippetPlayback);
    }

    return () => {
      disposed = true;
      video.removeEventListener('playing', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', onFatalFailure);
      video.removeEventListener('loadedmetadata', beginSnippetPlayback);
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [mode, directUrl]);

  // Sync mute state for HTML5 <video> and YouTube IFrame API
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
    if (mode === 'youtube' && ready && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: '' }),
        '*'
      );
    }
  }, [muted, ready, mode, ytKey]);

  if (mode === 'none') return null;

  if (mode === 'video') {
    return (
      <video
        ref={videoRef}
        autoPlay
        loop
        muted={muted}
        playsInline
        preload="metadata"
        className={`pointer-events-none absolute inset-0 w-full h-full object-cover ${
          variant === 'hero' ? 'transition-opacity duration-700' : 'transition-opacity duration-500'
        } ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
    );
  }

  return (
    <iframe
      ref={iframeRef}
      key={`snippet-${variant}-${item.id}-${ytKey}`}
      src={`https://www.youtube.com/embed/${encodeURIComponent(
        ytKey
      )}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&loop=1&playlist=${encodeURIComponent(
        ytKey
      )}&enablejsapi=1&start=5`}
      title={`${item.title} preview snippet`}
      allow="autoplay; encrypted-media"
      tabIndex={-1}
      onLoad={() => {
        if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
        loadTimerRef.current = window.setTimeout(() => {
          setReady(true);
        }, 650);
      }}
      className={
        variant === 'hero'
          ? `pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[max(100%,1160px)] aspect-video scale-[1.12] border-0 transition-opacity duration-700 ${
              ready ? 'opacity-100' : 'opacity-0'
            }`
          : `pointer-events-none absolute inset-0 w-full h-full scale-[1.28] border-0 transition-opacity duration-500 ${
              ready ? 'opacity-100' : 'opacity-0'
            }`
      }
    />
  );
};
