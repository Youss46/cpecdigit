import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "idle" | "installable" | "installed";

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

    // Pick up a prompt event captured before React mounted (stored in main.tsx).
    const existing = (window as any).__cpecInstallPrompt as BeforeInstallPromptEvent | null;
    if (existing) {
      setDeferredPrompt(existing);
      setState("installable");
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

    return () => {
      window.removeEventListener("cpec-install-ready", onReady);
      window.removeEventListener("cpec-app-installed", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    (window as any).__cpecInstallPrompt = null;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      setState("installed");
    } else {
      setState("idle");
    }
    return outcome === "accepted";
  };

  return { state, install };
}
