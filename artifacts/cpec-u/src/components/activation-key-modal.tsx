import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, Copy, CheckCircle, Infinity, Shield, Clock, Lock, AlertCircle, Loader2 } from "lucide-react";

const DELAY_MS = 60_000;

const DURATION_LABELS: Record<string, string> = {
  lifetime: "À vie (illimitée)",
  "1year": "1 an",
  "2years": "2 ans",
  "5years": "5 ans",
  "10years": "10 ans",
};

type Phase = "countdown" | "blocked" | "success";

interface ActivationKeyModalProps {
  userId: number;
  activationKeyShown: boolean;
  isFirstLogin: boolean;
}

export function ActivationKeyModal({ userId, activationKeyShown, isFirstLogin }: ActivationKeyModalProps) {
  const [phase, setPhase] = useState<Phase>("countdown");
  const [keyData, setKeyData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [keyInput, setKeyInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isFirstLogin || activationKeyShown) return;

    const start = Date.now();
    countdownRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, Math.ceil(60 - elapsed));
      setCountdown(remaining);
    }, 500);

    timerRef.current = setTimeout(async () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      try {
        const r = await fetch("/api/auth/my-activation-key", { credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          setKeyData(data);
          setPhase("success");
        } else {
          setPhase("blocked");
        }
      } catch {
        setPhase("blocked");
      }
    }, DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isFirstLogin, activationKeyShown]);

  const handleSubmitKey = async () => {
    if (!keyInput.trim()) {
      setInputError("Veuillez saisir une clé d'activation.");
      return;
    }
    setInputError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/validate-activation-key", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        setKeyData(data);
        setPhase("success");
      } else {
        setInputError(data?.error ?? "Clé invalide ou déjà utilisée. Vérifiez et réessayez.");
      }
    } catch {
      setInputError("Erreur réseau. Vérifiez votre connexion et réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (keyData?.key) {
      navigator.clipboard.writeText(keyData.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleClose = async () => {
    try {
      await fetch("/api/auth/activation-shown", {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    setPhase("countdown");
  };

  if (!isFirstLogin || activationKeyShown) return null;

  return (
    <>
      {phase === "countdown" && countdown > 0 && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2.5 bg-primary text-primary-foreground px-4 py-2.5 rounded-full shadow-lg text-sm font-medium">
            <Clock className="w-4 h-4 animate-pulse" />
            <span>Votre clé d'activation arrive dans <strong>{countdown}s</strong></span>
          </div>
        </div>
      )}

      {/* Blocking overlay — enter key manually */}
      {phase === "blocked" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-background rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-br from-primary to-primary/80 px-6 py-8 text-center text-white">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 mb-4 backdrop-blur-sm">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold">Activation Requise</h2>
              <p className="text-sm text-white/70 mt-1">Saisissez la clé fournie par le développeur</p>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Aucune clé n'a pu être attribuée automatiquement. Contactez le développeur pour obtenir votre clé d'activation CPEC-Digital.
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Clé d'activation</label>
                <Input
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={keyInput}
                  onChange={e => {
                    setKeyInput(e.target.value.toUpperCase());
                    setInputError(null);
                  }}
                  onKeyDown={e => { if (e.key === "Enter") handleSubmitKey(); }}
                  className={`font-mono text-center tracking-widest text-base ${inputError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                  disabled={submitting}
                  autoFocus
                />
                {inputError && (
                  <p className="text-sm text-red-500 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {inputError}
                  </p>
                )}
              </div>

              <Button onClick={handleSubmitKey} className="w-full gap-2" disabled={submitting}>
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Vérification...</>
                ) : (
                  <><Key className="w-4 h-4" /> Activer le système</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success modal — show the assigned key */}
      <Dialog open={phase === "success"} onOpenChange={() => {}}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-0 shadow-2xl" onPointerDownOutside={e => e.preventDefault()}>
          <div className="bg-gradient-to-br from-primary to-primary/80 px-6 py-8 text-center text-white">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 mb-4 backdrop-blur-sm">
              <Key className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold">Votre Clé d'Activation</h2>
            <p className="text-sm text-white/70 mt-1">CPEC-Digital — Licence officielle</p>
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-secondary/50 rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Clé de licence</p>
              <code className="font-mono text-lg font-bold text-primary tracking-widest select-all block">
                {keyData?.key ?? "—"}
              </code>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/30 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  {keyData?.duration === "lifetime" ? <Infinity className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  <span className="text-xs">Durée</span>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {DURATION_LABELS[keyData?.duration] ?? "—"}
                </p>
              </div>
              <div className="bg-secondary/30 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Shield className="w-4 h-4" />
                  <span className="text-xs">Statut</span>
                </div>
                <p className="text-sm font-semibold text-emerald-600">Active</p>
              </div>
            </div>

            {keyData?.expiresAt ? (
              <div className="text-center text-xs text-muted-foreground">
                Expire le : <strong>{new Date(keyData.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong>
              </div>
            ) : (
              <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Infinity className="w-3.5 h-3.5 text-violet-500" />
                <span>Licence à vie — aucune expiration</span>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
              <strong>Important :</strong> Conservez cette clé précieusement. Elle vous sera demandée en cas de réinstallation du système.
            </div>

            <div className="flex gap-3">
              <Button onClick={handleCopy} variant="outline" className="flex-1 gap-2">
                {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copié !" : "Copier la clé"}
              </Button>
              <Button onClick={handleClose} className="flex-1">
                Fermer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
