import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { CpecLogo } from "@/components/cpec-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, CheckCircle, AlertTriangle, Lock } from "lucide-react";
import { motion } from "framer-motion";

type Status = "idle" | "loading" | "success" | "error";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<"checking" | "valid" | "invalid">("checking");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setTokenStatus("invalid");
      return;
    }
    setToken(t);
    setTokenStatus("valid");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (newPassword.length < 6) {
      setErrorMsg("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Les mots de passe ne correspondent pas.");
      return;
    }

    setStatus("loading");
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await r.json();
      if (r.ok) {
        setStatus("success");
      } else {
        setErrorMsg(data.error ?? "Une erreur est survenue.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Erreur réseau. Veuillez réessayer.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <CpecLogo size={56} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">M15 <span className="text-green-600">EduTech</span></h1>
          <p className="text-sm text-slate-500 mt-1 tracking-widest uppercase">Gestion Académique</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
          {tokenStatus === "checking" && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          )}

          {tokenStatus === "invalid" && (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Lien invalide</h2>
              <p className="text-sm text-slate-500">Ce lien de réinitialisation est invalide ou a expiré.</p>
              <Button
                className="w-full mt-2 bg-[#1a3a5c] hover:bg-[#0f2540]"
                onClick={() => setLocation("/login")}
              >
                Retour à la connexion
              </Button>
            </div>
          )}

          {tokenStatus === "valid" && status !== "success" && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Nouveau mot de passe</h2>
                  <p className="text-xs text-slate-500">Choisissez un mot de passe sécurisé (min. 6 caractères)</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="newPwd" className="text-sm font-medium text-slate-700">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="newPwd"
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      className="pr-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPwd" className="text-sm font-medium text-slate-700">Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="confirmPwd"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      className="pr-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{errorMsg}</p>
                  </motion.div>
                )}

                <Button
                  type="submit"
                  disabled={status === "loading"}
                  className="w-full bg-[#1a3a5c] hover:bg-[#0f2540] text-white font-semibold py-2.5 rounded-xl"
                >
                  {status === "loading" ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enregistrement…</>
                  ) : (
                    "Réinitialiser le mot de passe"
                  )}
                </Button>
              </form>
            </>
          )}

          {status === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6 space-y-4"
            >
              <div className="mx-auto w-14 h-14 bg-green-50 rounded-full flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Mot de passe mis à jour !</h2>
              <p className="text-sm text-slate-500">
                Votre mot de passe a été réinitialisé avec succès.<br />
                Vous pouvez maintenant vous connecter.
              </p>
              <Button
                className="w-full bg-[#1a3a5c] hover:bg-[#0f2540]"
                onClick={() => setLocation("/login")}
              >
                Se connecter
              </Button>
            </motion.div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} M15 EduTech — Gestion Académique
        </p>
      </motion.div>
    </div>
  );
}
