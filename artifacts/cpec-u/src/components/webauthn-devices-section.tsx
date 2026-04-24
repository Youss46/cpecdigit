import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Fingerprint,
  Smartphone,
  Monitor,
  Tablet,
  Trash2,
  Plus,
  Loader2,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useWebAuthnRegister,
  addWebAuthnEmail,
  browserSupportsWebAuthn,
  type WebAuthnErrorKind,
} from "@/hooks/useWebAuthn";

interface Credential {
  id: number;
  credential_id: string;
  device_name: string;
  device_type: string;
  created_at: string;
  last_used_at: string | null;
}

interface Props {
  userEmail: string;
}

function DeviceIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (/iphone|android.*mobile|mobile/i.test(n)) return <Smartphone className="w-5 h-5" />;
  if (/ipad|tablette|tablet/i.test(n)) return <Tablet className="w-5 h-5" />;
  return <Monitor className="w-5 h-5" />;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Jamais";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function WebAuthnDevicesSection({ userEmail }: Props) {
  const { toast } = useToast();
  const {
    register: registerBiometric,
    loading: registerLoading,
    error: registerError,
    errorKind: registerErrorKind,
  } = useWebAuthnRegister();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [supported] = useState(() => browserSupportsWebAuthn());

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/webauthn/credentials", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCredentials(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail — user may not have any credentials
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleRegister = async () => {
    const ok = await registerBiometric();
    if (ok) {
      addWebAuthnEmail(userEmail);
      toast({
        title: "Appareil enregistré",
        description: "Vous pouvez maintenant vous connecter avec la biométrie sur cet appareil.",
      });
      fetchCredentials();
    }
    // errorKind/registerError from the hook drive the inline feedback below
  };

  // Derived contextual error message for the add-device button area
  const registerFeedback: { message: string; retryable: boolean } | null =
    registerError
      ? {
          message: registerError,
          retryable: registerErrorKind === "cancelled" || registerErrorKind === "server",
        }
      : null;

  const handleDelete = async (credId: number) => {
    setDeletingId(credId);
    try {
      const res = await fetch(`/api/auth/webauthn/credentials/${credId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setCredentials((prev) => prev.filter((c) => c.id !== credId));
        toast({ title: "Appareil révoqué", description: "L'accès biométrique a été supprimé." });
      } else {
        toast({ title: "Erreur", description: "Impossible de révoquer cet appareil.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  if (!supported) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-primary" />
            Connexion biométrique
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/60">
            <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              La connexion biométrique (Face ID, Touch ID, empreinte) n'est pas prise en charge par ce navigateur ou cet appareil.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-primary" />
            Connexion biométrique
          </CardTitle>
          {credentials.length < 5 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleRegister}
              disabled={registerLoading || registerErrorKind === "already_exists"}
            >
              {registerLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : registerErrorKind === "cancelled" ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {registerLoading
                ? "Activation…"
                : registerErrorKind === "cancelled"
                  ? "Réessayer"
                  : "Ajouter cet appareil"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            La clé biométrique est stockée <strong>uniquement sur votre appareil</strong>. M15 EduTech ne stocke que la clé publique.
            Maximum 5 appareils par compte.
          </p>
        </div>

        {/* Contextual error feedback after failed registration */}
        <AnimatePresence>
          {registerFeedback && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  {registerFeedback.message}
                </p>
                {registerFeedback.retryable && registerErrorKind === "cancelled" && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Placez votre doigt / regardez l'écran jusqu'au bout du scan, puis appuyez sur <strong>Réessayer</strong>.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Device list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Fingerprint className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Aucun appareil biométrique enregistré.
            </p>
            <p className="text-xs text-muted-foreground">
              Cliquez sur "Ajouter cet appareil" pour activer Face ID / Touch ID / empreinte sur cet appareil.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {credentials.map((cred) => (
                <motion.div
                  key={cred.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary/30 bg-card transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <DeviceIcon name={cred.device_name} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm text-foreground truncate">{cred.device_name}</p>
                      {cred.device_type === "multiDevice" && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">Passkey</Badge>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5">
                      <p className="text-xs text-muted-foreground">
                        Ajouté le {formatDate(cred.created_at)}
                      </p>
                      {cred.last_used_at && (
                        <p className="text-xs text-muted-foreground">
                          · Utilisé le {formatDate(cred.last_used_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(cred.id)}
                    disabled={deletingId === cred.id}
                    title="Révoquer cet appareil"
                  >
                    {deletingId === cred.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>

            {credentials.length >= 5 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                Limite de 5 appareils atteinte. Révoquez un appareil pour en ajouter un nouveau.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
