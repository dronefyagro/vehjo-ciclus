const CACHE = "vejho-ciclus-v1.0.6";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET" || event.request.destination === "document" || new URL(event.request.url).pathname.startsWith("/api/")) return; event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())); return response; }))); });
