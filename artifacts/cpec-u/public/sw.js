const CACHE_NAME = 'cpec-u-v9';
const API_CACHE_NAME = 'cpec-u-api-v3';
const API_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/images/logo.png',
];

const CACHEABLE_API_PREFIXES = [
  // Student
  '/api/student/schedule',
  '/api/student/grades',
  '/api/student/card',
  '/api/student/dashboard',
  '/api/student/me',
  '/api/student/cahier-de-texte',
  '/api/student/attendance/my',
  '/api/student/absences',
  '/api/student/results',
  '/api/student/balance',
  '/api/student/evaluations',
  '/api/student/reclamations',
  '/api/student/suivi',
  // Teacher
  '/api/teacher/assignments',
  '/api/teacher/dashboard',
  '/api/teacher/cahier-de-texte',
  '/api/teacher/attendance',
  '/api/teacher/grades',
  '/api/teacher/schedule',
  '/api/teacher/students',
  '/api/teacher/evaluations',
  // Admin (read-only dashboard data)
  '/api/admin/stats',
  '/api/admin/alertes/resume',
  '/api/admin/alertes',
  // Parent
  '/api/parent/dashboard',
  '/api/parent/student',
  '/api/parent/absences',
  '/api/parent/schedule',
  '/api/parent/results',
  '/api/parent/balance',
  // Shared
  '/api/housing/my',
  '/api/semesters',
  '/api/subjects',
  '/api/notifications/unread-count',
  '/api/messages/unread-count',
];

function isCacheableApi(pathname) {
  return CACHEABLE_API_PREFIXES.some(p => pathname.startsWith(p));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== API_CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    if (event.request.method === 'GET' && isCacheableApi(url.pathname)) {
      event.respondWith(
        fetch(event.request)
          .then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(API_CACHE_NAME).then(cache => {
                const headers = new Headers(clone.headers);
                headers.set('sw-cached-at', Date.now().toString());
                cache.put(event.request, new Response(clone.body, {
                  status: clone.status,
                  statusText: clone.statusText,
                  headers,
                }));
              });
            }
            return response;
          })
          .catch(() => caches.match(event.request).then(cached => {
            if (cached) {
              const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0', 10);
              if (cachedAt > 0 && Date.now() - cachedAt > API_CACHE_MAX_AGE_MS) {
                return new Response('{"error":"offline","stale":true}', {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
              return cached;
            }
            return new Response('{"error":"offline"}', {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          }))
      );
      return;
    }
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then(r => r ?? fetch(event.request))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = { title: 'CPEC-Digital', body: 'Vous avez une nouvelle notification.', type: 'info' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {
    data.body = event.data.text();
  }

  const iconUrl = self.registration.scope + 'icon-192.png';

  const targetUrl = data.url
    ? (data.url.startsWith('http') ? data.url : self.registration.scope.replace(/\/$/, '') + data.url)
    : self.registration.scope;

  const options = {
    body: data.body,
    icon: iconUrl,
    badge: iconUrl,
    tag: data.tag ?? data.type ?? 'cpec-notification',
    renotify: true,
    data: { type: data.type, url: targetUrl },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? self.registration.scope;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
