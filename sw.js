const CACHE = 'rtok-v1792901551';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/feed.js', 'js/teach.js', 'js/check.js', 'js/ranker.js', 'js/progress.js',
  'js/store.js', 'js/dates.js', 'js/player.js', 'js/video.js', 'js/videos.js',
  'content/clips.json', 'content/topics.json', 'content/sources.json', 'content/meta.json',
  'assets/paper-collage.jpg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

// Parse an HTTP Range header ("bytes=start-end") against a body of `size` bytes.
// Returns {start, end} (inclusive, clamped) or null if malformed/unsatisfiable.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') { // suffix: last N bytes
    const n = parseInt(m[2], 10);
    if (!(n > 0) || size <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
  }
  if (start >= size || start > end) return null;
  return { start, end };
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Shell is all-or-nothing. cache: 'reload' bypasses the HTTP cache so a new version never precaches stale files.
    await c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    // Audio is best-effort: one missing file must not fail the install; misses are filled on first play.
    try {
      const clips = await (await fetch('content/clips.json', { cache: 'reload' })).json();
      const urls = clips.filter((x) => x.audio).map((x) => x.audio);
      const worker = async () => {
        while (urls.length) {
          const u = urls.shift();
          try {
            // Audio URLs carry their narration hash: an exact hit in the old version is the same file.
            const prev = await caches.match(u);
            if (prev) await c.put(u, prev);
            else await c.add(new Request(u, { cache: 'reload' }));
          } catch (_) { /* filled on first play */ }
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
    } catch (_) { /* no clips list: shell only */ }
    // No automatic skipWaiting: an open page keeps its own version until it is closed or the user
    // taps Update, so text, timing marks and narration always come from the same publish.
  })());
});

// The page's "New version — Update" button: the user chose to switch now (the page reloads after).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Only our own old versions: other apps on this origin keep their caches.
    for (const k of await caches.keys()) if (k.startsWith('rtok-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function rangeResponse(request, cached) {
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  const r = parseRange(request.headers.get('range'), size);
  if (!r) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(r.start, r.end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${r.start}-${r.end}/${size}`,
      'Content-Length': String(r.end - r.start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

// Fetch a whole audio file (never a 206) and keep it if it arrived intact.
async function fillAudio(c, req) {
  const res = await fetch(new Request(req.url, { cache: 'reload' }));
  if (res.status === 200) await c.put(new Request(req.url), res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // social embeds go to network
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    let cached = await c.match(req, { ignoreSearch: true });
    if (req.headers.has('range')) {
      if (!cached && url.pathname.includes('/audio/')) {
        try {
          const res = await fillAudio(c, req);
          if (res.status !== 200) return res;
          cached = res;
        } catch (_) { return fetch(req); }
      }
      return cached ? rangeResponse(req, cached) : fetch(req);
    }
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await c.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
