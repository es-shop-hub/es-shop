self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('eshop-cache').then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/css/style.css',
        '/js/app.js'
      ]);
    })
  );
});


//Enregistrer le service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}

