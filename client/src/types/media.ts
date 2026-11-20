export type NavRoute =
  | 'home'
  | 'series'
  | 'movies'
  | 'animation'
  | 'trending'
  | 'search'
  | 'watchlist'
  | 'downloads'
  | 'admin';

export type MediaType = 'movie' | 'series' | 'animation';

export interface MediaSource {
  id: string;
  label: string;
  quality: '4K' | '1080p' | '720p' | '480p' | string;
  type: 'hls' | 'mp4';
  size: string;
  codec?: string;
  url: string;
  downloadUrl?: string;
  healthStatus?: string;
  lastCheckedAt?: string;
}

export interface CmsStats {
  totalSeasons: number;
  linkedSeasons: number;
  totalEpisodes: number;
  linkedEpisodes: number;
  totalSources: number;
  hasPlayableLinks: boolean;
  isPartial: boolean;
}

export interface CmsTitleItem extends MediaItem {
  status: 'draft' | 'published' | 'archived';
  stats: CmsStats;
}

export interface WatchProvider {
  id: number;
  name: string;
  logo: string;
}

export interface CastMember {
  name: string;
  role: string;
  photo?: string;
}

export interface UserReviewItem {
  id: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
}

export interface DownloadRecord {
  id: string;
  mediaId: string;
  title: string;
  poster: string;
  quality: string;
  episodeLabel?: string;
  url: string;
  downloadedAt: string;
}

export interface VideoClip {
  key: string;
  name: string;
  type: string;
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate?: string;
  overview?: string;
  poster?: string;
  episodes?: EpisodeItem[];
}

export interface EpisodeItem {
  id: string;
  bindingKey?: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview: string;
  still: string;
  runtime: string;
  airDate?: string;
  rating: number;
  sources: MediaSource[];
}

export interface MediaItem {
  id: string;
  tmdbId?: number | null;
  malId?: number | null;
  title: string;
  type: MediaType;
  year: number;
  rating: number;
  country: string;
  regionTag: 'Hollywood' | 'Nollywood' | 'Bollywood' | 'K-Drama' | 'Anime' | 'Animation' | 'Cartoon' | 'International';
  language: string;
  subtitlesAvailable: string[];
  genres: string[];
  quality: '4K' | '1080p' | 'HD' | 'CAM';
  badge?: 'VIP' | 'Free' | 'New' | '4K' | 'HD' | 'Full Film' | 'Request';
  isDraft?: boolean;
  hasStreamLinks?: boolean;
  requestCount?: number;
  lastRequestedAt?: string | null;
  runtime?: string;
  seasonsCount?: number;
  seasons?: SeasonSummary[];
  poster: string;
  backdrop: string;
  previewVideoUrl: string;
  embedUrl?: string;
  trailerYoutubeId?: string;
  videos?: VideoClip[];
  imdbId?: string;
  imdbRating?: number | null;
  imdbVotes?: number | null;
  recommendations?: MediaItem[];
  overview: string;
  director: string;
  cast: string[];
  castProfiles?: CastMember[];
  votes?: number;
  releaseDate?: string;
  views: number;
  downloads: number;
  trending?: boolean;
  featured?: boolean;
  sources: MediaSource[];
}

export interface FilterState {
  genre: string;
  country: string;
  year: string;
  language: string;
  sortBy: 'For You' | 'Hottest' | 'Latest' | 'Top Rated';
  regionShortcut?: string;
}

export interface CategoryCardItem {
  id: string;
  label: string;
  subtitle: string;
  gradient: string;
  accentBorder: string;
  image: string;
  filterPatch: Partial<FilterState>;
}

export interface LocalMediaFile {
  id: string;
  filename: string;
  relativePath: string;
  title: string;
  year: number;
  quality: string;
  extension: string;
  sizeFormatted: string;
  streamUrl: string;
  downloadUrl: string;
  subtitles: { label: string; lang: string; url: string }[];
}
