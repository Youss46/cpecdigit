import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Replit's external load balancer blocks all `/api/*` paths (likely because it
// reserves them for its own workspace API). Transparently rewrite every
// `/api/*` request to `/srv/*`. The Vite dev proxy and a server-side mount
// rewrite `/srv/*` back to `/api/*` before reaching Express. This keeps every
// existing fetch/queryKey untouched while bypassing Replit's filter.
if (typeof window !== "undefined" && typeof window.fetch === "function") {
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

// Capture beforeinstallprompt EARLY (before React mounts) so it's never missed
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

// Register Service Worker for PWA / push notifications
if ("serviceWorker" in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }).catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
}
