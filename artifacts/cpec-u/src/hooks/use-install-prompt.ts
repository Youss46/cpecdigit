import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "idle" | "installable" | "manual" | "ios" | "installed";

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>("idle");

  useEffect(() => {
    // Already running as a standalone PWA — don't offer install.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setState("installed");
      return;
    }

    // iOS Safari: browser doesn't support beforeinstallprompt so we show
    // manual instructions (Share → Add to Home Screen).
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    if (isIos) {
      setState("ios");
      return;
    }

    // Is this a Chromium-based browser that CAN install PWAs?
    const isChromium =
      /Chrome|Chromium|Edg|SamsungBrowser/.test(navigator.userAgent) &&
      !/OPR|Opera/.test(navigator.userAgent);

    // Pick up a prompt event captured before React mounted (stored in main.tsx).
    const existing = (window as any).__cpecInstallPrompt as BeforeInstallPromptEvent | null;
    if (existing) {
      setDeferredPrompt(existing);
      setState("installable");
      return;
    }

    // Also listen for future prompt events (e.g. re-navigation).
    const onReady = () => {
      const prompt = (window as any).__cpecInstallPrompt as BeforeInstallPromptEvent | null;
      if (prompt) {
        setDeferredPrompt(prompt);
        setState("installable");
      }
    };

    const onInstalled = () => {
      (window as any).__cpecInstallPrompt = null;
      setDeferredPrompt(null);
      setState("installed");
    };

    window.addEventListener("cpec-install-ready", onReady);
    window.addEventListener("cpec-app-installed", onInstalled);

    // Fallback: Chrome fires beforeinstallprompt at most once per ~90-day
    // window. If it hasn't fired after 4 s (user dismissed the prompt
    // before, engagement score not met, etc.) we still want to show install
    // instructions so the user can install via the browser's ⋮ menu.
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    if (isChromium) {
      fallbackTimer = setTimeout(() => {
        setState((prev) => (prev === "idle" ? "manual" : prev));
      }, 4000);
    }

    return () => {
      window.removeEventListener("cpec-install-ready", onReady);
      window.removeEventListener("cpec-app-installed", onInstalled);
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      (window as any).__cpecInstallPrompt = null;
      setState("installed");
      setDeferredPrompt(null);
    }
    return outcome === "accepted";
  };

  return { state, install };
}
