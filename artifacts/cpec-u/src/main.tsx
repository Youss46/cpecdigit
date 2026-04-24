import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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
