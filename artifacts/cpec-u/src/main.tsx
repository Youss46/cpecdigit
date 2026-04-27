import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ─── API base-URL patch ────────────────────────────────────────────────────
// When VITE_API_URL is set (e.g. "https://api.m15-edutech.ci" on Vercel),
// prepend it to every relative /api/* and /srv/* fetch so the browser calls
// the Railway backend directly instead of going through the Vercel proxy.
// When VITE_API_URL is not set the relative URL is left untouched and the
// Vercel rewrite rule handles the proxying transparently.
const _apiBase: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

const _isReplitHosted =
  typeof window !== "undefined" &&
  (window.location.hostname.endsWith(".replit.dev") ||
    window.location.hostname.endsWith(".repl.co"));

if (_apiBase && !_isReplitHosted && typeof window.fetch === "function") {
  const _origFetch = window.fetch.bind(window);

  const _toAbsolute = (u: string): string => {
    if (u.startsWith("/api/") || u.startsWith("/srv/")) return _apiBase + u;
    return u;
  };

  window.fetch = function patchedApiFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    if (typeof input === "string") return _origFetch(_toAbsolute(input), init);
    if (input instanceof URL) {
      const href = input.toString();
      const patched = _toAbsolute(input.pathname);
      if (patched !== input.pathname) return _origFetch(new URL(patched, _apiBase), init);
      return _origFetch(href, init);
    }
    if (input instanceof Request) {
      const url = new URL(input.url, window.location.origin);
      const patched = _toAbsolute(url.pathname);
      if (patched !== url.pathname) {
        return _origFetch(new Request(_apiBase + url.pathname + url.search, input), init);
      }
      return _origFetch(input, init);
    }
    return _origFetch(input as RequestInfo, init);
  } as typeof window.fetch;
}

// ─── Replit /api → /srv rewrite ───────────────────────────────────────────
// Replit's external load balancer blocks /api/* with 502, so we transparently
// rewrite those requests to /srv/* when running inside the Replit environment.
if (_isReplitHosted && typeof window.fetch === "function") {
  const _fetch = window.fetch.bind(window);
  const rewrite = (u: string): string => {
    if (u.startsWith("/api/")) return "/srv/" + u.slice(5);
    if (u.startsWith(window.location.origin + "/api/")) {
      return window.location.origin + "/srv/" + u.slice(window.location.origin.length + 5);
    }
    return u;
  };
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === "string") {
      return _fetch(rewrite(input), init);
    }
    if (input instanceof URL) {
      if (input.pathname.startsWith("/api/")) {
        const next = new URL(input.toString());
        next.pathname = "/srv/" + input.pathname.slice(5);
        return _fetch(next, init);
      }
      return _fetch(input, init);
    }
    if (input instanceof Request) {
      const newUrl = rewrite(input.url);
      if (newUrl !== input.url) {
        return _fetch(new Request(newUrl, input), init);
      }
      return _fetch(input, init);
    }
    return _fetch(input as RequestInfo, init);
  } as typeof window.fetch;
}

// ─── PWA install prompt ───────────────────────────────────────────────────
if (typeof window !== "undefined") {
  (window as any).__cpecInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    (window as any).__cpecInstallPrompt = e;
    window.dispatchEvent(new Event("cpec-install-ready"));
  });
  window.addEventListener("appinstalled", () => {
    (window as any).__cpecInstallPrompt = null;
    window.dispatchEvent(new Event("cpec-app-installed"));
  });
}

createRoot(document.getElementById("root")!).render(<App />);

// ─── Service Worker ───────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }).catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
}
