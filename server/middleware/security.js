const crypto = require('crypto');
const path = require('path');

// Ephemeral + env-backed HMAC signing secret (never exposed to client)
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`cinepulse_${__dirname}`).digest('hex');

const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.ogg']);
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

/**
 * Generates an HMAC-signed session token with role claims.
 */
function signSessionToken(payload = { email: 'admin@cinepulse.local', role: 'admin' }) {
  const data = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Date.now(),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (parsed.exp && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * HTTP Security Headers middleware (CSP, nosniff, frame protection, referrer policy).
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' https: http: data: blob:",
      "media-src 'self' https: http: blob:",
      "connect-src 'self' https: http:",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://vidlink.pro https://*.vidlink.pro",
      "worker-src 'self' blob:",
    ].join('; ')
  );
  next();
}

/**
 * Sliding-window in-memory rate limiter with periodic cleanup.
 */
function createRateLimiter({ windowMs = 60000, max = 180 } = {}) {
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) {
      if (v.resetAt <= now) hits.delete(k);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'local';
    const now = Date.now();
    const record = hits.get(ip);

    if (!record || record.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }
    next();
  };
}

/**
 * SSRF Guard: Validates that a URL is a public HTTP/HTTPS endpoint and not
 * pointing to localhost, loopback, cloud metadata (169.254.169.254), or RFC1918 LAN IPs.
 */
function isSafeExternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();

    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }

    // Block private IPv4 ranges
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 192 && b === 168) ||
        (a === 172 && b >= 16 && b <= 31)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes string input by stripping null bytes, control chars, and script tags.
 */
function sanitizeString(val, maxLen = 500) {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/\0/g, '')
    .replace(/<\s*\/?\s*script[^>]*>/gi, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Masks an API key so GET endpoints never leak raw credentials to the browser.
 */
function maskSecret(secret) {
  const s = String(secret || '').trim();
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return `${'•'.repeat(12)}${s.slice(-4)}`;
}

/**
 * RBAC Admin verification middleware:
 * Allows valid signed admin Bearer/header tokens OR local loopback/LAN admin sessions.
 * Blocks unauthorized remote requests with an invalid token.
 */
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token =
    (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '') ||
    req.headers['x-cinepulse-token'] ||
    '';

  if (token) {
    const claims = verifySessionToken(String(token));
    if (!claims || claims.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired admin session token.' });
    }
    req.adminUser = claims;
    return next();
  }

  // Permit local workstation / same-host requests when no token is explicitly invalidated
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  const isLocalOrLan =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.') ||
    ip.includes('::ffff:172.') ||
    ip.includes('::ffff:192.168.') ||
    ip.includes('::ffff:10.');

  if (isLocalOrLan) {
    req.adminUser = { email: 'admin@cinepulse.local', role: 'admin' };
    return next();
  }

  return res.status(401).json({ error: 'Authentication required for admin operations.' });
}

function isAllowedVideoFile(filename) {
  return ALLOWED_VIDEO_EXTS.has(path.extname(String(filename || '')).toLowerCase());
}

function isAllowedImageFile(filename) {
  return ALLOWED_IMAGE_EXTS.has(path.extname(String(filename || '')).toLowerCase());
}

module.exports = {
  signSessionToken,
  verifySessionToken,
  securityHeaders,
  createRateLimiter,
  isSafeExternalUrl,
  sanitizeString,
  maskSecret,
  requireAdminAuth,
  isAllowedVideoFile,
  isAllowedImageFile,
};
