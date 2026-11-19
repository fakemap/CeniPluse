const TMDB_GENRE_MAP = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'Drama',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Animation',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10768: 'War',
};

const COUNTRY_NAMES = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  NG: 'Nigeria',
  GH: 'Ghana',
  ZA: 'South Africa',
  IN: 'India',
  KR: 'South Korea',
  JP: 'Japan',
  FR: 'France',
  ES: 'Spain',
  DE: 'Germany',
  IT: 'Italy',
  CN: 'China',
  MX: 'Mexico',
  BR: 'Brazil',
};

/**
 * Maps TMDB numeric genre IDs into clean display genre tags (max 4).
 */
function mapTmdbGenreIds(genreIds, mediaType = 'movie') {
  const mapped = Array.isArray(genreIds)
    ? Array.from(new Set(genreIds.map((id) => TMDB_GENRE_MAP[Number(id)]).filter(Boolean)))
    : [];
  if (mapped.length > 0) return mapped.slice(0, 4);
  return mediaType === 'tv' || mediaType === 'series' ? ['Drama', 'Thriller'] : ['Drama'];
}

/**
 * Resolves a human-readable country and CinePulse regionTag from origin/language/genres.
 */
function resolveRegionAndCountry(originCountry = '', lang = 'EN', genres = []) {
  const origin = String(originCountry || '').trim().toUpperCase();
  const normLang = String(lang || 'EN').trim().toUpperCase();
  const isAnim = Array.isArray(genres) && genres.some((g) => /animat/i.test(String(g)));

  if (origin === 'NG') {
    return { country: 'Nigeria', regionTag: 'Nollywood' };
  }
  if (origin === 'IN' || normLang === 'HI') {
    return { country: 'India', regionTag: 'Bollywood' };
  }
  if (origin === 'KR' || normLang === 'KO') {
    return { country: 'South Korea', regionTag: 'K-Drama' };
  }
  if (isAnim && (origin === 'JP' || normLang === 'JA')) {
    return { country: 'Japan', regionTag: 'Anime' };
  }
  if (isAnim) {
    return {
      country: COUNTRY_NAMES[origin] || 'United States',
      regionTag: 'Animation',
    };
  }
  if (origin === 'US' || origin === 'GB' || origin === 'CA' || origin === 'AU') {
    return {
      country: COUNTRY_NAMES[origin],
      regionTag: 'Hollywood',
    };
  }
  if (COUNTRY_NAMES[origin]) {
    return {
      country: COUNTRY_NAMES[origin],
      regionTag: origin === 'JP' ? 'Anime' : 'International',
    };
  }
  if (normLang === 'FR') return { country: 'France', regionTag: 'International' };
  if (normLang === 'ES') return { country: 'Spain', regionTag: 'International' };
  if (normLang === 'JA') return { country: 'Japan', regionTag: 'International' };
  if (normLang === 'EN') return { country: 'United States', regionTag: 'Hollywood' };
  return { country: 'International', regionTag: 'International' };
}

module.exports = {
  TMDB_GENRE_MAP,
  mapTmdbGenreIds,
  resolveRegionAndCountry,
};
