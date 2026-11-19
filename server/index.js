const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { PORT, ROOT_DIR, UPLOADS_DIR } = require('./config');

const catalogRoutes = require('./routes/catalog');
const tmdbRoutes = require('./routes/tmdb');
const mediaRoutes = require('./routes/media');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const cmsRoutes = require('./routes/cms');
const store = require('./db/store');
const { securityHeaders, createRateLimiter } = require('./middleware/security');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Rate limit API endpoints to prevent abuse
app.use('/api/', createRateLimiter({ windowMs: 60 * 1000, max: 240 }));

// Serve local hls.js directly from node_modules (zero external CDN dependency)
app.get('/vendor/hls.min.js', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'node_modules', 'hls.js', 'dist', 'hls.min.js'));
});

// API Routes
app.use('/api/catalog', catalogRoutes);
app.use('/api/tmdb', tmdbRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/cms', cmsRoutes);

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'CinePulse', timestamp: new Date().toISOString() });
});

// Technical SEO: robots.txt & dynamic XML sitemap
app.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/admin/\nDisallow: /api/cms/admin/\nSitemap: ${host}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const routes = ['', '?view=movies', '?view=series', '?view=animation', '?view=trending'];
  const published = store
    .getCmsTitles()
    .filter((t) => t.status === 'published')
    .slice(0, 100);

  const urls = [
    ...routes.map((r) => `  <url><loc>${host}/${r}</loc><changefreq>daily</changefreq></url>`),
    ...published.map(
      (t) =>
        `  <url><loc>${host}/?title=${encodeURIComponent(t.id)}</loc><changefreq>weekly</changefreq></url>`
    ),
  ].join('\n');

  res
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    );
});

// Uploaded posters/assets
app.use('/uploads', express.static(UPLOADS_DIR));

// Static Frontend: prefer React/Vite production build (client/dist), fallback to public/
const clientDistDir = path.join(ROOT_DIR, 'client', 'dist');
const publicDir = path.join(ROOT_DIR, 'public');
const activeFrontendDir = fs.existsSync(path.join(clientDistDir, 'index.html'))
  ? clientDistDir
  : publicDir;

app.use(express.static(activeFrontendDir));

// SPA fallback for client routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(activeFrontendDir, 'index.html'));
});

// Global error handler — never expose internal stack traces to clients
app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
  res.status(status).json({
    error: err.message || 'An unexpected server error occurred.',
  });
});

if (!process.env.VERCEL && require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n======================================================');
    console.log('  CINEBOX — Cinema Streaming & Download Hub Running');
    console.log('======================================================');
    console.log(`  Local:   http://localhost:${PORT}`);
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  Wi-Fi:   http://${net.address}:${PORT}`);
        }
      }
    }
    console.log('======================================================\n');
  });
}

module.exports = app;
