import type { CategoryCardItem, MediaItem } from '../types/media';

export const UI_LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'FR', label: 'Français' },
  { code: 'ES', label: 'Español' },
  { code: 'AR', label: 'العربية' },
  { code: 'HI', label: 'हिन्दी' },
  { code: 'KO', label: '한국어' },
];

export const GENRE_OPTIONS = [
  'All',
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'War',
];

export const COUNTRY_OPTIONS = [
  'All',
  'United States',
  'United Kingdom',
  'Nigeria',
  'South Korea',
  'Japan',
  'India',
  'France',
  'Germany',
  'Netherlands',
  'Spain',
  'Canada',
];

export const YEAR_OPTIONS = [
  'All',
  '2026',
  '2025',
  '2024',
  '2023',
  '2022',
  '2021',
  '2020',
  '2010s',
  '2000s',
];

export const LANGUAGE_OPTIONS = [
  'All',
  'Original Audio',
  'English Dub',
  'French Sub',
  'Spanish Sub',
  'Arabic Sub',
  'Hindi Dub',
  'Korean Sub',
  'Japanese Sub',
];

export const SORT_OPTIONS: Array<'For You' | 'Hottest' | 'Latest' | 'Top Rated'> = [
  'For You',
  'Hottest',
  'Latest',
  'Top Rated',
];

export const CATEGORY_CARDS: CategoryCardItem[] = [
  {
    id: 'all',
    label: 'All',
    subtitle: 'Full Catalog',
    gradient: 'from-[#0F172A]/95 via-[#13212E]/85 to-[#00E5FF]/25',
    accentBorder: 'hover:border-[#00E5FF]/60',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=700&q=75',
    filterPatch: { country: 'All', genre: 'All', sortBy: 'For You', regionShortcut: 'All' },
  },
  {
    id: 'hollywood',
    label: 'Hollywood',
    subtitle: 'US & UK Releases',
    gradient: 'from-[#0D1B36]/95 via-[#162C52]/80 to-[#38BDF8]/30',
    accentBorder: 'hover:border-sky-400/60',
    image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=700&q=75',
    filterPatch: { country: 'United States', regionShortcut: 'Hollywood' },
  },
  {
    id: 'nollywood',
    label: 'Nollywood',
    subtitle: 'African Cinema',
    gradient: 'from-[#2B1D12]/95 via-[#4A2D16]/80 to-[#FFB800]/30',
    accentBorder: 'hover:border-[#FFB800]/60',
    image: 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?w=700&q=75',
    filterPatch: { country: 'Nigeria', regionShortcut: 'Nollywood' },
  },
  {
    id: 'bollywood',
    label: 'Bollywood',
    subtitle: 'Indian Cinema',
    gradient: 'from-[#271538]/95 via-[#3B1E54]/80 to-[#C084FC]/30',
    accentBorder: 'hover:border-purple-400/60',
    image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=700&q=75',
    filterPatch: { country: 'India', regionShortcut: 'Bollywood' },
  },
  {
    id: 'trending',
    label: 'Trending',
    subtitle: 'Most Watched',
    gradient: 'from-[#331812]/95 via-[#522319]/80 to-[#FB7185]/30',
    accentBorder: 'hover:border-rose-400/60',
    image: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=700&q=75',
    filterPatch: { sortBy: 'Hottest', country: 'All', regionShortcut: 'Trending' },
  },
  {
    id: 'latest',
    label: 'Latest',
    subtitle: '2025 – 2026',
    gradient: 'from-[#0E2623]/95 via-[#133A34]/80 to-[#10B981]/30',
    accentBorder: 'hover:border-[#10B981]/60',
    image: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=700&q=75',
    filterPatch: { sortBy: 'Latest', country: 'All', regionShortcut: 'Latest' },
  },
];

export const INITIAL_CATALOG: MediaItem[] = [];
