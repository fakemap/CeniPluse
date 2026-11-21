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
const scraperRoutes = require('./routes/scraper');
const analyticsRoutes = require('./routes/analytics');
const store = require('./db/store');
const { securityHeaders, createRateLimiter } = require('./middleware/security');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Mount high-throughput HLS stream scraper & segment proxy before DB sync / rate limiters
app.use('/api/scraper', scraperRoutes);

// Rate limit API endpoints to prevent abuse
app.use('/api/', createRateLimiter({ windowMs: 60 * 1000, max: 240 }));

// Synchronize state with Supabase Postgres before handling API requests and flush mutations before responding
app.use('/api', async (req, res, next) => {
  try {
    await store.ensureSynced();
  } catch (err) {
    console.warn('[Store] Supabase sync fallback to local cache:', err.message);
  }

  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (!store.isCloudEnabled() || !store.hasPendingCloudWrites()) {
      return origJson(body);
    }
    store
      .flush()
      .catch((err) => {
        console.warn('[Store] Supabase flush error:', err.message);
      })
      .finally(() => {
        if (!res.headersSent) {
          origJson(body);
        }
      });
    return res;
  };

  next();
});

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
app.use('/api/analytics', analyticsRoutes);

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CeniPluse',
    database: store.isCloudEnabled() ? 'supabase' : 'local-json',
    titlesCount: store.getCmsTitles().length,
    timestamp: new Date().toISOString(),
  });
});

// Technical SEO: robots.txt, Google Search Console verification & dynamic XML sitemap
app.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /api/admin/\nDisallow: /api/cms/admin/\nSitemap: ${host}/sitemap.xml\n`
  );
});

// Automatic Google Search Console HTML File verification route
app.get('/google:hash.html', (req, res) => {
  const hash = req.params.hash || '';
  res.type('text/html').send(`google-site-verification: google${hash}.html`);
});

app.get('/sitemap.xml', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const coreRoutes = [
    { path: '', freq: 'daily', prio: '1.0' },
    { path: '?view=movies', freq: 'daily', prio: '0.9' },
    { path: '?view=series', freq: 'daily', prio: '0.9' },
    { path: '?view=animation', freq: 'daily', prio: '0.9' },
    { path: '?view=trending', freq: 'daily', prio: '0.8' },
    { path: '?view=search', freq: 'weekly', prio: '0.7' },
    { path: '?category=hollywood', freq: 'daily', prio: '0.85' },
    { path: '?category=nollywood', freq: 'daily', prio: '0.85' },
    { path: '?category=bollywood', freq: 'daily', prio: '0.85' },
    { path: '?category=k-drama', freq: 'daily', prio: '0.85' },
    { path: '?category=anime', freq: 'daily', prio: '0.85' },
    { path: '?view=movies&genre=Action', freq: 'daily', prio: '0.8' },
    { path: '?view=movies&genre=Comedy', freq: 'daily', prio: '0.8' },
    { path: '?view=movies&genre=Horror', freq: 'daily', prio: '0.8' },
    { path: '?view=movies&genre=Romance', freq: 'daily', prio: '0.8' },
    { path: '?view=movies&genre=Sci-Fi', freq: 'daily', prio: '0.8' },
    { path: '?view=movies&genre=Thriller', freq: 'daily', prio: '0.8' },
    { path: '?view=movies&genre=Drama', freq: 'daily', prio: '0.8' },
    { path: '?view=series&genre=Action', freq: 'daily', prio: '0.8' },
    { path: '?view=series&genre=Drama', freq: 'daily', prio: '0.8' },
  ];

  const published = store
    .getCmsTitles()
    .filter((t) => t.status === 'published')
    .slice(0, 150);

  const urls = [
    ...coreRoutes.map(
      (r) =>
        `  <url>\n    <loc>${host}/${r.path.replace(/&/g, '&amp;')}</loc>\n    <changefreq>${r.freq}</changefreq>\n    <priority>${r.prio}</priority>\n  </url>`
    ),
    ...published.map(
      (t) =>
        `  <url>\n    <loc>${host}/?title=${encodeURIComponent(t.id)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
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

function startServer() {
  return app.listen(PORT, '0.0.0.0', () => {
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

if (!process.env.VERCEL && require.main === module) {
  startServer();
}

app.startServer = startServer;
module.exports = app;
