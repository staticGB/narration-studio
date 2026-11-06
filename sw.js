// Caches the pages and library files so the apps work offline after the first visit.
// (Voice models are cached separately by the model libraries themselves.)
const CACHE = "narration-studio-v5";
const PRECACHE = ["./", "./index.html", "./tts-worker.js", "./languages.html", "./lang-worker.js", "./lang-page.js", "./kokoro-lang-worker.js", "./phon-romance.js", "./phon-ja.js", "./phon-zh.js", "./es.html", "./fr.html", "./it.html", "./pt.html", "./hi.html", "./ja.html", "./zh.html"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const store = res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  };

  if (url.origin === location.origin) {
    // Your own files: try the network first so updates show up, fall back to cache offline.
    e.respondWith(fetch(req).then(store).catch(() => caches.match(req)));
  } else if (url.hostname === "cdn.jsdelivr.net") {
    // Library files are version-pinned, so cache-first is safe.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(store)));
  }
});
