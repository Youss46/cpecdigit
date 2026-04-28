import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

const logo = `${import.meta.env.BASE_URL}icon-192-v2.png`;

// ─── Sidebar install button (desktop) ────────────────────────────────────────

export function InstallButton() {
  const { state, install } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  // Hide if not installable (already installed, iOS Safari, or browser
  // hasn't fired beforeinstallprompt yet).
  if (state !== "installable") return null;

  const handleClick = async () => {
    setInstalling(true);
    await install();
    setInstalling(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={installing}
      className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-xl text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 border border-violet-200 dark:border-violet-500/30 transition-colors text-sm font-medium"
    >
      <Download className="w-4 h-4 shrink-0" />
      <span className="truncate">
        {installing ? "Installation…" : "Installer l'application"}
      </span>
    </button>
  );
}

// ─── Mobile bottom banner ─────────────────────────────────────────────────────

const BANNER_DISMISSED_KEY = "m15_pwa_banner_dismissed";

export function InstallBannerMobile() {
  const { state, install } = useInstallPrompt();
  const [bannerVisible, setBannerVisible] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISSED_KEY) === "1"
  );

  // Show banner after 4-second delay so it doesn't distract on initial load.
  useEffect(() => {
    if (state !== "installable" || dismissed) return;
    const timer = setTimeout(() => setBannerVisible(true), 4000);
    return () => clearTimeout(timer);
  }, [state, dismissed]);

  // Hide if not installable (already installed, iOS Safari, or browser
  // hasn't fired beforeinstallprompt yet).
  if (!bannerVisible || state !== "installable" || dismissed) return null;

  const handleInstall = async () => {
    await install();
  };

  const handleDismiss = () => {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="m-3 rounded-2xl bg-card border border-border shadow-lg p-4 flex items-center gap-3">
        <img src={logo} alt="M15 EduTech" className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">M15 EduTech</p>
          <p className="text-xs text-muted-foreground">
            Installer l'application sur cet appareil
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors"
        >
          Installer
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
