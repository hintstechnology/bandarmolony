// Clear existing service worker - FORCE UPDATE
self.addEventListener('install', function(event) {
  console.log('🔄 Service Worker: Installing and clearing cache...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('🔄 Service Worker: Activating and clearing all caches...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      console.log('🔄 Service Worker: Found caches:', cacheNames);
      return Promise.all(
        cacheNames.map(function(cacheName) {
          console.log('🔄 Service Worker: Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(function() {
      console.log('🔄 Service Worker: All caches cleared, claiming clients...');
      return self.clients.claim();
    })
  );
});

// Clear all caches and unregister
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
