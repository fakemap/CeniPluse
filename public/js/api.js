async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // Catalog
  getCatalog(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    return request(`/api/catalog?${qs.toString()}`);
  },
  getMovie(id) {
    return request(`/api/catalog/${encodeURIComponent(id)}`);
  },
  recordView(id) {
    return request(`/api/catalog/${encodeURIComponent(id)}/view`, { method: 'POST' });
  },
  recordDownloadHit(id) {
    return request(`/api/catalog/${encodeURIComponent(id)}/download-hit`, { method: 'POST' });
  },
  addComment(id, payload) {
    return request(`/api/catalog/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // User state
  getUserState() {
    return request('/api/user/state');
  },
  toggleWatchlist(movieId) {
    return request('/api/user/watchlist/toggle', {
      method: 'POST',
      body: JSON.stringify({ movieId }),
    });
  },
  saveProgress(payload) {
    return request('/api/user/progress', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  removeProgress(movieId) {
    return request(`/api/user/progress/${encodeURIComponent(movieId)}`, { method: 'DELETE' });
  },

  // TMDB Proxy
  getTmdbStatus() {
    return request('/api/tmdb/status');
  },
  getTmdbTrending(type = 'all') {
    return request(`/api/tmdb/trending?type=${encodeURIComponent(type)}`);
  },
  getTmdbFeed(category, page = 1) {
    return request(`/api/tmdb/feed/${encodeURIComponent(category)}?page=${page}`);
  },
  searchTmdb(q) {
    return request(`/api/tmdb/search?q=${encodeURIComponent(q)}`);
  },
  getTmdbDetails(type, id) {
    return request(`/api/tmdb/details/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
  },
  importTmdb(payload) {
    return request('/api/tmdb/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Local Media Drive
  scanLocalMedia() {
    return request('/api/media/scan');
  },
  importLocalMedia(relativePath) {
    return request('/api/media/import', {
      method: 'POST',
      body: JSON.stringify({ relativePath }),
    });
  },

  // Admin & Settings
  getAdminOverview() {
    return request('/api/admin/overview');
  },
  updateSettings(payload) {
    return request('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  createMovie(payload) {
    return request('/api/admin/movies', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateMovie(id, payload) {
    return request(`/api/admin/movies/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteMovie(id) {
    return request(`/api/admin/movies/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  addSource(movieId, payload) {
    return request(`/api/admin/movies/${encodeURIComponent(movieId)}/sources`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteSource(movieId, sourceId) {
    return request(
      `/api/admin/movies/${encodeURIComponent(movieId)}/sources/${encodeURIComponent(sourceId)}`,
      { method: 'DELETE' }
    );
  },

  // Multipart Uploads with progress
  uploadFile(endpoint, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      fd.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && typeof onProgress === 'function') {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error('Invalid server response'));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
      xhr.open('POST', endpoint);
      xhr.send(fd);
    });
  },
};

export function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

export function formatTime(sec) {
  if (!sec || !isFinite(sec) || sec < 0) return '00:00';
  const s = Math.floor(sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(rem).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
