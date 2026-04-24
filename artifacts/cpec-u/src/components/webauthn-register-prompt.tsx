import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Fingerprint, X, Smartphone, ShieldCheck, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWebAuthnRegister, addWebAuthnEmail, browserSupportsWebAuthn } from "@/hooks/useWebAuthn";

interface Props {
  userEmail: string;
  userName: string;
  onDone: () => void;
}

const LS_DISMISSED_KEY = "cpec_webauthn_dismissed";

function wasDismissedRecently(email: string): boolean {
  try {
    const data = JSON.parse(localStorage.getItem(LS_DISMISSED_KEY) ?? "{}");
    const ts = data[email];
    if (!ts) return false;
    return Date.now() - ts < 30 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
function markDismissed(email: string) {
  try {
    const data = JSON.parse(localStorage.getItem(LS_DISMISSED_KEY) ?? "{}");
    data[email] = Date.now();
    localStorage.setItem(LS_DISMISSED_KEY, JSON.stringify(data));
  } catch {}
}
function markRegistered(email: string) {
  try {
    const data = JSON.parse(localStorage.getItem(LS_DISMISSED_KEY) ?? "{}");
    data[email] = Date.now() + 365 * 24 * 60 * 60 * 1000;
    localStorage.setItem(LS_DISMISSED_KEY, JSON.stringify(data));
  } catch {}
}

export function WebAuthnRegisterPrompt({ userEmail, userName, onDone }: Props) {
  const { toast } = useToast();
  const { register, loading, error, errorKind } = useWebAuthnRegister();
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!browserSupportsWebAuthn()) { onDone(); return; }
    if (wasDismissedRecently(userEmail)) { onDone(); return; }
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, [userEmail, onDone]);

  const handleActivate = async () => {
    const ok = await register();
    if (ok) {
      addWebAuthnEmail(userEmail);
      markRegistered(userEmail);
      setDone(true);
      toast({
        title: "Biométrie activée !",
        description: "Vous pourrez désormais vous connecter avec Face ID / empreinte.",
      });
      setTimeout(() => { setVisible(false); setTimeout(onDone, 400); }, 1800);
    }
    // On failure: keep the prompt open so the user can retry
    // Only on terminal errors (unsupported, security) do we close the prompt
  };

  const dismiss = () => {
    markDismissed(userEmail);
    setVisible(false);
    setTimeout(onDone, 400);
  };

  // Close on terminal errors (device doesn't support biometrics at all)
  useEffect(() => {
    if (errorKind === "unsupported" || errorKind === "security") {
      dismiss();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKind]);

  if (!visible && !done) return null;

  // Derive inline error message for the prompt
  const inlineError = error && errorKind === "cancelled"
    ? error
    : errorKind === "already_exists"
      ? "La biométrie est déjà enregistrée sur cet appareil."
      : errorKind === "server"
        ? error
        : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
        >
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="bg-card rounded-2xl shadow-2xl border border-border/60 w-full max-w-sm overflow-hidden"
          >
            {/* Header gradient */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-6 pt-6 pb-8 text-white relative">
              <button
                onClick={dismiss}
                className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4 backdrop-blur-sm">
                <Fingerprint className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold">Connexion biométrique</h2>
              <p className="text-white/80 text-sm mt-1">
                Face ID · Touch ID · Empreinte
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {done ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  </div>
                  <p className="font-semibold text-foreground">Biométrie activée !</p>
                  <p className="text-sm text-muted-foreground">Prochaine connexion en un scan.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Bonjour <span className="font-medium text-foreground">{userName.split(" ")[0]}</span> — activez la connexion biométrique sur cet appareil pour ne plus saisir votre mot de passe.
                  </p>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/60">
                    <Smartphone className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      La clé biométrique est stockée <strong>uniquement sur cet appareil</strong>. CPEC-Digital n'a jamais accès à vos données biométriques.
                    </p>
                  </div>

                  {/* Inline error with retry hint — stays in the prompt so user can retry */}
                  {inlineError && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                          {inlineError}
                        </p>
                        {errorKind === "cancelled" && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Appuyez sur <strong>Activer</strong> et placez votre doigt / regardez l'écran jusqu'au bout.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1" onClick={dismiss} disabled={loading}>
                      Plus tard
                    </Button>
                    <Button
                      className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700"
                      onClick={handleActivate}
                      disabled={loading || errorKind === "already_exists"}
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Activation…</>
                      ) : errorKind === "cancelled" ? (
                        <><RefreshCw className="w-4 h-4" />Réessayer</>
                      ) : (
                        <><Fingerprint className="w-4 h-4" />Activer</>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
