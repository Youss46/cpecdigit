import { useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const logo = `${import.meta.env.BASE_URL}images/logo.png`;

export function InstallButton() {
  const { state, install } = useInstallPrompt();
  const [showIosModal, setShowIosModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (state === "installed" || state === "idle") return null;

  const handleClick = async () => {
    if (state === "ios") {
      setShowIosModal(true);
      return;
    }
    setInstalling(true);
    await install();
    setInstalling(false);
  };

  return (
    <>
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

      <Dialog open={showIosModal} onOpenChange={setShowIosModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={logo} alt="CPEC-Digital" className="w-7 h-7 rounded-lg" />
              Installer CPEC-Digital
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Pour installer l'application sur votre iPhone ou iPad, suivez ces étapes :
            </p>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <p className="text-sm">
                  Appuyez sur l'icône{" "}
                  <span className="inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded bg-muted font-medium text-xs">
                    <Share className="w-3 h-3" />
                    Partager
                  </span>{" "}
                  en bas de Safari.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <p className="text-sm">
                  Faites défiler et appuyez sur{" "}
                  <span className="inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded bg-muted font-medium text-xs">
                    <Plus className="w-3 h-3" />
                    Sur l'écran d'accueil
                  </span>.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <p className="text-sm">Confirmez en appuyant sur <strong>Ajouter</strong>.</p>
              </li>
            </ol>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              <img src={logo} alt="" className="w-8 h-8 rounded-lg shrink-0" />
              <div>
                <p className="font-medium text-foreground">CPEC-Digital</p>
                <p>Lancez l'app depuis votre écran d'accueil comme une application native.</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function InstallBannerMobile() {
  const { state, install } = useInstallPrompt();
  const [showIosModal, setShowIosModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (state === "installed" || state === "idle" || dismissed) return null;

  const handleInstall = async () => {
    if (state === "ios") {
      setShowIosModal(true);
      return;
    }
    await install();
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="m-3 rounded-2xl bg-card border border-border shadow-lg p-4 flex items-center gap-3">
          <img src={logo} alt="CPEC-Digital" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">CPEC-Digital</p>
            <p className="text-xs text-muted-foreground">Installer l'application sur cet appareil</p>
          </div>
          <button
            onClick={handleInstall}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors"
          >
            Installer
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 text-muted-foreground hover:text-foreground p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Dialog open={showIosModal} onOpenChange={setShowIosModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={logo} alt="CPEC-Digital" className="w-7 h-7 rounded-lg" />
              Installer CPEC-Digital
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Pour installer l'application sur votre iPhone ou iPad :
            </p>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <p className="text-sm">
                  Appuyez sur l'icône{" "}
                  <span className="inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded bg-muted font-medium text-xs">
                    <Share className="w-3 h-3" />
                    Partager
                  </span>{" "}
                  en bas de Safari.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <p className="text-sm">
                  Appuyez sur{" "}
                  <span className="inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded bg-muted font-medium text-xs">
                    <Plus className="w-3 h-3" />
                    Sur l'écran d'accueil
                  </span>.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <p className="text-sm">Confirmez avec <strong>Ajouter</strong>.</p>
              </li>
            </ol>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
