const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config();

const IS_VERCEL = Boolean(process.env.VERCEL);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'cinepulse-data')
  : path.join(ROOT_DIR, 'server', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'cinepulse-uploads')
  : path.join(ROOT_DIR, 'public', 'uploads');
const DEFAULT_MEDIA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'cinepulse-media')
  : path.resolve(ROOT_DIR, process.env.MEDIA_DIR || './media');

// Ensure core directories exist (guarded for read-only/ephemeral serverless mounts)
[DATA_DIR, UPLOADS_DIR, DEFAULT_MEDIA_DIR].forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn(`[Config] Skipped mkdir for "${dir}":`, err.message);
  }
});

module.exports = {
  IS_VERCEL,
  PORT: Number(process.env.SERVER_PORT || process.env.PORT) || 4500,
  ROOT_DIR,
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  DEFAULT_MEDIA_DIR,
  ENV_TMDB_API_KEY: (process.env.TMDB_API_KEY || '').trim(),
  SUPABASE_URL: (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
  SUPABASE_SERVICE_ROLE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
};
