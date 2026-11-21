import type { MediaItem } from '../types/media';

export type VidLinkAnimeAudio = 'sub' | 'dub';
export type VidLinkPlayerType = 'default' | 'jw';
export type VidLinkIconStyle = 'vid' | 'default';
export type EmbedProvider = 'vidlink' | 'vidsrc_cc' | 'autoembed' | 'vidsrc_xyz';

export interface VidLinkCustomizationParams {
  /** Sets the primary color of the player, including sliders and autoplay controls (Hex without '#'). */
  primaryColor?: string;
  /** Defines the color of the progress bar behind the sliders (Hex without '#'). */
  secondaryColor?: string;
  /** Changes the design of the icons within the player ("vid" or "default"). */
  icons?: VidLinkIconStyle;
  /** Changes the color of the icons within the player (Hex without '#'). */
  iconColor?: string;
  /** Controls whether the media title is displayed. */
  title?: boolean;
  /** Determines if the poster image is shown. */
  poster?: boolean;
  /** Controls whether the media starts playing automatically. */
  autoplay?: boolean;
  /** Shows next episode button when 90% of the TV-show is watched. */
  nextbutton?: boolean;
  /** Changes the player to JWPlayer ("jw") or default player. */
  player?: VidLinkPlayerType;
  /** Starts the video at the specified time in seconds. */
  startAt?: number;
  /** Adds external subtitles to the video (must be a direct link to a VTT subtitle file). */
  sub_file?: string;
  /** Sets the label for the external subtitle track. */
  sub_label?: string;
  /** Redirect URL when stream fails to load. */
  fallback_url?: string;
  /** Forces fallback to sub and vice versa for Anime embeds if the requested type was not found. */
  fallback?: boolean;
}

export const DEFAULT_VIDLINK_THEME: VidLinkCustomizationParams = {
  primaryColor: '00E5FF',
  secondaryColor: '141821',
  iconColor: '00E5FF',
  icons: 'vid',
  title: true,
  poster: true,
  autoplay: true,
  nextbutton: true,
};

function sanitizeHexColor(hex?: string): string {
  if (!hex) return '';
  return hex.trim().replace(/^#+/, '').replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
}

export function appendVidLinkParams(
  baseUrl: string,
  params: VidLinkCustomizationParams = {}
): string {
  const merged: VidLinkCustomizationParams = {
    ...DEFAULT_VIDLINK_THEME,
    ...params,
  };

  const search = new URLSearchParams();

  if (merged.fallback !== undefined) {
    search.set('fallback', String(Boolean(merged.fallback)));
  }

  const primary = sanitizeHexColor(merged.primaryColor);
  if (primary) search.set('primaryColor', primary);

  const secondary = sanitizeHexColor(merged.secondaryColor);
  if (secondary) search.set('secondaryColor', secondary);

  if (merged.icons === 'vid' || merged.icons === 'default') {
    search.set('icons', merged.icons);
  }

  const iconCol = sanitizeHexColor(merged.iconColor);
  if (iconCol) search.set('iconColor', iconCol);

  if (typeof merged.title === 'boolean') {
    search.set('title', String(merged.title));
  }

  if (typeof merged.poster === 'boolean') {
    search.set('poster', String(merged.poster));
  }

  if (typeof merged.autoplay === 'boolean') {
    search.set('autoplay', String(merged.autoplay));
  }

  if (typeof merged.nextbutton === 'boolean') {
    search.set('nextbutton', String(merged.nextbutton));
  }

  if (merged.player === 'jw') {
    search.set('player', 'jw');
  }

  if (
    typeof merged.startAt === 'number' &&
    isFinite(merged.startAt) &&
    merged.startAt > 5
  ) {
    search.set('startAt', String(Math.floor(merged.startAt)));
  }

  if (merged.sub_file && merged.sub_file.trim()) {
    search.set('sub_file', merged.sub_file.trim());
    if (merged.sub_label && merged.sub_label.trim()) {
      search.set('sub_label', merged.sub_label.trim());
    }
  }

  if (merged.fallback_url && merged.fallback_url.trim()) {
    search.set('fallback_url', merged.fallback_url.trim());
  }

  const qs = search.toString();
  return qs ? `${baseUrl}?${qs}` : baseUrl;
}

/**
 * Movie Embed URL:
 * https://vidlink.pro/movie/{tmdbId}
 */
export function buildVidLinkMovieUrl(
  tmdbId: number | string,
  params: VidLinkCustomizationParams = {}
): string {
  const cleanId = encodeURIComponent(String(tmdbId).trim());
  return appendVidLinkParams(`https://vidlink.pro/movie/${cleanId}`, params);
}

/**
 * TV Show Embed URL:
 * https://vidlink.pro/tv/{tmdbId}/{season}/{episode}
 */
export function buildVidLinkTvUrl(
  tmdbId: number | string,
  season: number = 1,
  episode: number = 1,
  params: VidLinkCustomizationParams = {}
): string {
  const cleanId = encodeURIComponent(String(tmdbId).trim());
  const s = Math.max(1, Math.floor(Number(season) || 1));
  const e = Math.max(1, Math.floor(Number(episode) || 1));
  return appendVidLinkParams(`https://vidlink.pro/tv/${cleanId}/${s}/${e}`, {
    nextbutton: true,
    ...params,
  });
}

/**
 * Anime Embed URL (MyAnimeList ID):
 * https://vidlink.pro/anime/{MALid}/{number}/{subOrDub}?fallback=true
 */
export function buildVidLinkAnimeUrl(
  malId: number | string,
  episodeNumber: number = 1,
  subOrDub: VidLinkAnimeAudio = 'sub',
  params: VidLinkCustomizationParams = {}
): string {
  const cleanId = encodeURIComponent(String(malId).trim());
  const ep = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const audio: VidLinkAnimeAudio = subOrDub === 'dub' ? 'dub' : 'sub';
  return appendVidLinkParams(`https://vidlink.pro/anime/${cleanId}/${ep}/${audio}`, {
    fallback: true,
    nextbutton: true,
    ...params,
  });
}

export function isAnimeMedia(item: Pick<MediaItem, 'regionTag' | 'type' | 'genres' | 'country' | 'malId'>): boolean {
  if (item.malId && Number(item.malId) > 0) return true;
  if (item.regionTag === 'Anime') return true;
  const isAnim =
    item.type === 'animation' ||
    (item.genres || []).some((g) => /anime|animat/i.test(g));
  return isAnim && /japan/i.test(item.country || '');
}

export function hasVidLinkSupport(
  item: Pick<MediaItem, 'tmdbId' | 'malId' | 'embedUrl'>
): boolean {
  return Boolean(
    (item.tmdbId && Number(item.tmdbId) > 0) ||
      (item.malId && Number(item.malId) > 0) ||
      (item.embedUrl && item.embedUrl.trim())
  );
}

/**
 * Resolves the appropriate VidLink embed URL for a Movie, TV Show, or Anime:
 * - If `malId` is provided (or entered by the viewer for an Anime title), uses `/anime/{MALid}/{number}/{subOrDub}?fallback=true`.
 * - Otherwise, if `type === 'series'`, uses `/tv/{tmdbId}/{season}/{episode}`.
 * - Otherwise, uses `/movie/{tmdbId}`.
 */
export function resolveVidLinkEmbedUrl(options: {
  item: Pick<MediaItem, 'tmdbId' | 'malId' | 'type' | 'embedUrl' | 'regionTag' | 'genres' | 'country'>;
  season?: number;
  episode?: number;
  subOrDub?: VidLinkAnimeAudio;
  malIdOverride?: number | null;
  params?: VidLinkCustomizationParams;
}): string {
  const {
    item,
    season = 1,
    episode = 1,
    subOrDub = 'sub',
    malIdOverride,
    params = {},
  } = options;

  const activeMalId =
    malIdOverride && Number(malIdOverride) > 0
      ? Number(malIdOverride)
      : item.malId && Number(item.malId) > 0
      ? Number(item.malId)
      : null;

  if (activeMalId) {
    return buildVidLinkAnimeUrl(activeMalId, episode, subOrDub, params);
  }

  if (item.tmdbId && Number(item.tmdbId) > 0) {
    if (item.type === 'series') {
      return buildVidLinkTvUrl(item.tmdbId, season, episode, params);
    }
    return buildVidLinkMovieUrl(item.tmdbId, params);
  }

  return item.embedUrl || '';
}

/**
 * Resolves an embed URL across multiple independent streaming mirror providers:
 * - vidlink: VidLink Player (with custom styling, resume time, auto-play)
 * - vidsrc_cc: VidSrc V2 embed
 * - autoembed: AutoEmbed Cloud player
 * - vidsrc_xyz: VidSrc XYZ backup mirror
 */
export function resolveMultiEmbedUrl(options: {
  provider: EmbedProvider;
  item: Pick<MediaItem, 'tmdbId' | 'malId' | 'type' | 'embedUrl' | 'regionTag' | 'genres' | 'country'>;
  season?: number;
  episode?: number;
  subOrDub?: VidLinkAnimeAudio;
  malIdOverride?: number | null;
  params?: VidLinkCustomizationParams;
}): string {
  const { provider, item, season = 1, episode = 1, subOrDub = 'sub', malIdOverride, params } = options;

  if (provider === 'vidlink') {
    return resolveVidLinkEmbedUrl({ item, season, episode, subOrDub, malIdOverride, params });
  }

  if (!item.tmdbId) {
    return item.embedUrl || '';
  }

  const cleanId = encodeURIComponent(String(item.tmdbId).trim());
  const s = Math.max(1, Math.floor(Number(season) || 1));
  const ep = Math.max(1, Math.floor(Number(episode) || 1));

  if (provider === 'vidsrc_cc') {
    return item.type === 'series'
      ? `https://vidsrc.cc/v2/embed/tv/${cleanId}/${s}/${ep}`
      : `https://vidsrc.cc/v2/embed/movie/${cleanId}`;
  }

  if (provider === 'autoembed') {
    return item.type === 'series'
      ? `https://player.autoembed.cc/embed/tv/${cleanId}/${s}/${ep}`
      : `https://player.autoembed.cc/embed/movie/${cleanId}`;
  }

  if (provider === 'vidsrc_xyz') {
    return item.type === 'series'
      ? `https://vidsrc.xyz/embed/tv?tmdb=${cleanId}&season=${s}&episode=${ep}`
      : `https://vidsrc.xyz/embed/movie?tmdb=${cleanId}`;
  }

  return resolveVidLinkEmbedUrl({ item, season, episode, subOrDub, malIdOverride, params });
}

/**
 * Checks if a title is unreleased or scheduled for a future date.
 */
export function isUpcomingMedia(item: { releaseDate?: string; year?: number }): boolean {
  if (item.releaseDate) {
    const d = new Date(item.releaseDate);
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
      return true;
    }
  }
  const currentYear = new Date().getFullYear();
  if (item.year && item.year > currentYear) {
    return true;
  }
  return false;
}
