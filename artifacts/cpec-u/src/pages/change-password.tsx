import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useGetCurrentUser } from "@workspace/api-client-react";

export default function ChangePasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: user } = useGetCurrentUser();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Erreur", description: "Les nouveaux mots de passe ne correspondent pas.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 6 caractères.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Erreur", description: err.message ?? "Une erreur est survenue.", variant: "destructive" });
        return;
      }
      toast({ title: "Mot de passe mis à jour", description: "Votre nouveau mot de passe est actif." });
      const role = (user as any)?.role;
      const subRole = (user as any)?.adminSubRole;
      if (role === "admin") {
        if (subRole === "hebergement") setLocation("/admin/housing");
        else setLocation("/admin");
      } else if (role === "teacher") setLocation("/teacher");
      else setLocation("/student");
    } catch {
      toast({ title: "Erreur", description: "Impossible de mettre à jour le mot de passe.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const homeRoute = (() => {
    const role = (user as any)?.role;
    const subRole = (user as any)?.adminSubRole;
    if (role === "admin") return subRole === "hebergement" ? "/admin/housing" : "/admin";
    if (role === "teacher") return "/teacher";
    return "/student";
  })();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Back button */}
      <button
        onClick={() => setLocation(homeRoute)}
        className="absolute top-5 left-5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Retour à l'accueil
      </button>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, type: "spring", stiffness: 180, damping: 20 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl border-border/60">
          <CardHeader className="pb-4 pt-8 px-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-serif text-foreground">Changer votre mot de passe</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Pour des raisons de sécurité, vous devez définir un nouveau mot de passe avant de continuer.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Mot de passe provisoire</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="currentPassword"
                    type={showCurrent ? "text" : "password"}
                    className="pl-9 pr-10"
                    placeholder="Mot de passe actuel"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent(v => !v)}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    className="pl-9 pr-10"
                    placeholder="Minimum 6 caractères"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                  />
                  <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNew(v => !v)}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    className="pl-9 pr-10"
                    placeholder="Répéter le nouveau mot de passe"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirm(v => !v)}>
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
                )}
              </div>

              <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
                {loading ? "Mise à jour…" : "Confirmer le nouveau mot de passe"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
