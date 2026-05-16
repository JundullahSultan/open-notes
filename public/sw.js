const CACHE_NAME = "medicine-app-v2";
const ASSETS_TO_CACHE = [
  "/",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/fonts/segoeuithis.ttf",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0",
  // ADD THESE TWO LINES FOR OFFLINE EXPORTING:
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
];

// نصب سرویس ورکر و کش کردن فایل‌ها
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

// Use Network-First Strategy
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // 1. If the internet works, fetch the fresh data from the server.
        // 2. Open the cache and silently update it with this fresh version.
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse; // Show the fresh data to the user
        });
      })
      .catch(() => {
        // 3. If the fetch fails (because the user has NO INTERNET),
        // fallback to the last saved version in the cache.
        return caches.match(event.request);
      }),
  );
});
