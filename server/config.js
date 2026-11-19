const path = require('path');
const fs = require('fs');
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'server', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(ROOT_DIR, 'public', 'uploads');
const DEFAULT_MEDIA_DIR = path.resolve(ROOT_DIR, process.env.MEDIA_DIR || './media');

// Ensure core directories exist
[DATA_DIR, UPLOADS_DIR, DEFAULT_MEDIA_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

module.exports = {
  PORT: Number(process.env.PORT) || 4500,
  ROOT_DIR,
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  DEFAULT_MEDIA_DIR,
  ENV_TMDB_API_KEY: (process.env.TMDB_API_KEY || '').trim(),
};
