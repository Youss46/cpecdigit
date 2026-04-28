const CACHE_NAME = 'm15-edutech-v17';
const API_CACHE_NAME = 'm15-edutech-api-v5';
const API_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Replit's external load balancer blocks /api/* paths. We rewrite to /srv/*
// here too so direct browser fetches (img src, iframe src, etc.) that bypass
// window.fetch still work.
const API_PREFIX = '/srv/';
const LEGACY_API_PREFIX = '/api/';

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
  '/srv/student/schedule',
  '/srv/student/grades',
  '/srv/student/card',
  '/srv/student/dashboard',
  '/srv/student/me',
  '/srv/student/cahier-de-texte',
  '/srv/student/attendance/my',
  '/srv/student/absences',
  '/srv/student/results',
  '/srv/student/balance',
  '/srv/student/evaluations',
  '/srv/student/reclamations',
  '/srv/student/suivi',
  // Teacher
  '/srv/teacher/assignments',
  '/srv/teacher/dashboard',
  '/srv/teacher/cahier-de-texte',
  '/srv/teacher/attendance',
  '/srv/teacher/grades',
  '/srv/teacher/schedule',
  '/srv/teacher/students',
  '/srv/teacher/evaluations',
  // Admin (read-only dashboard data)
  '/srv/admin/stats',
  '/srv/admin/alertes/resume',
  '/srv/admin/alertes',
  // Parent
  '/srv/parent/dashboard',
  '/srv/parent/student',
  '/srv/parent/absences',
  '/srv/parent/schedule',
  '/srv/parent/results',
  '/srv/parent/balance',
  // Shared
  '/srv/housing/my',
  '/srv/semesters',
  '/srv/subjects',
  '/srv/notifications/unread-count',
  '/srv/messages/unread-count',
];

function isCacheableApi(pathname) {
  return CACHEABLE_API_PREFIXES.some(p => pathname.startsWith(p));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(SHELL_ASSETS.map(url =>
        cache.add(url).catch(() => {})
      ))
    )
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
  const request = event.request;
  const url = new URL(request.url);

  // Replit's external load balancer blocks /api/* paths. Rewrite direct
  // browser fetches (img src, iframe src, etc.) that bypassed the in-page
  // window.fetch interceptor so they reach the backend via /srv/*.
  //
  // Only rewrite GET/HEAD here — these have no body and are safe to clone.
  // POST/PUT/etc. always go through window.fetch (patched in main.tsx),
  // so they don't hit this branch in practice. We let them pass through
  // untouched to avoid the "duplex member must be specified for a request
  // with a streaming body" error when reconstructing a Request with a body.
  if (url.pathname.startsWith(LEGACY_API_PREFIX)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return;
    }
    const rewritten = new URL(url.toString());
    rewritten.pathname = API_PREFIX + url.pathname.slice(LEGACY_API_PREFIX.length);
    event.respondWith(fetch(rewritten.toString(), {
      method: request.method,
      headers: request.headers,
      mode: request.mode === 'navigate' ? 'same-origin' : request.mode,
      credentials: request.credentials,
      cache: request.cache,
      redirect: request.redirect,
      referrer: request.referrer,
      integrity: request.integrity,
    }));
    return;
  }

  if (url.pathname.startsWith(API_PREFIX)) {
    if (request.method === 'GET' && isCacheableApi(url.pathname)) {
      event.respondWith(
        fetch(request)
          .then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(API_CACHE_NAME).then(cache => {
                const headers = new Headers(clone.headers);
                headers.set('sw-cached-at', Date.now().toString());
                cache.put(request, new Response(clone.body, {
                  status: clone.status,
                  statusText: clone.statusText,
                  headers,
                }));
              });
            }
            return response;
          })
          .catch(() => caches.match(request).then(cached => {
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

  // Network-first for everything else (JS, CSS, HTML, images).
  // Falls back to cache only when offline. This prevents stale JS bundles
  // from being served indefinitely after a deploy.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached ?? Response.error()))
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = { title: 'M15 EduTech', body: 'Vous avez une nouvelle notification.', type: 'info' };
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
