import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  User,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Save,
  Fingerprint,
  MapPin,
  Crosshair,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { WebAuthnDevicesSection } from "@/components/webauthn-devices-section";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Panneau de configuration GPS — visible uniquement pour les admins ────────
function GpsSettingsCard() {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [rayon, setRayon] = useState("200");
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    apiFetch("/admin/attendance/location-settings")
      .then((data: any) => {
        if (data.latitude != null) setLat(String(data.latitude));
        if (data.longitude != null) setLon(String(data.longitude));
        if (data.rayon_metres != null) setRayon(String(data.rayon_metres));
      })
      .catch(() => {});
  }, []);

  const handleDetect = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS non disponible sur cet appareil", variant: "destructive" });
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLon(pos.coords.longitude.toFixed(7));
        setDetecting(false);
        toast({ title: "Position détectée", description: `Précision : ±${Math.round(pos.coords.accuracy)}m` });
      },
      () => {
        setDetecting(false);
        toast({ title: "Impossible d'obtenir la position GPS", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    const rayonN = parseInt(rayon);
    if (isNaN(latN) || isNaN(lonN) || isNaN(rayonN) || rayonN < 50) {
      toast({ title: "Veuillez saisir des coordonnées valides et un rayon ≥ 50m", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/admin/attendance/location-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: latN, longitude: lonN, rayon_metres: rayonN }),
      });
      toast({ title: "Coordonnées GPS enregistrées", description: "La vérification de présence est maintenant active." });
    } catch {
      toast({ title: "Erreur lors de l'enregistrement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="w-4 h-4 text-primary" />
          Géolocalisation des présences
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Définissez les coordonnées GPS de l'établissement. Les enseignants ne pourront soumettre leur feuille de présence qu'en se trouvant dans le rayon autorisé.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={handleDetect} disabled={detecting} className="gap-2">
              {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
              {detecting ? "Détection…" : "Utiliser ma position actuelle"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="gpsLat">Latitude</Label>
              <Input
                id="gpsLat"
                placeholder="ex: 36.7372"
                value={lat}
                onChange={e => setLat(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gpsLon">Longitude</Label>
              <Input
                id="gpsLon"
                placeholder="ex: 3.0869"
                value={lon}
                onChange={e => setLon(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gpsRayon">Rayon autorisé (mètres)</Label>
            <Input
              id="gpsRayon"
              type="number"
              min={50}
              max={2000}
              placeholder="200"
              value={rayon}
              onChange={e => setRayon(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Min 50m · Max 2000m · Valeur recommandée : 150 à 300m</p>
          </div>
          {lat && lon && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
              Coordonnées configurées : {parseFloat(lat).toFixed(5)}, {parseFloat(lon).toFixed(5)} · rayon {rayon}m
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button type="submit" className="gap-2" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {loading ? "Enregistrement…" : "Enregistrer les coordonnées"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administration",
  teacher: "Enseignant",
  student: "Étudiant",
  parent: "Parent d'élève",
};

const SUB_ROLE_LABELS: Record<string, string> = {
  directeur: "Directeur du Centre",
  scolarite: "Responsable Scolarité",
  planificateur: "Responsable pédagogique",
  hebergement: "Responsable Hébergement",
};

export default function SettingsPage() {
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
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast({ title: "Erreur", description: "Impossible de mettre à jour le mot de passe.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const u = user as any;
  const roleLabel =
    u?.role === "admin"
      ? SUB_ROLE_LABELS[u?.adminSubRole] ?? ROLE_LABELS["admin"]
      : ROLE_LABELS[u?.role] ?? u?.role ?? "—";

  const userEmail: string = u?.email ?? "";

  return (
    <AppLayout allowedRoles={["admin", "teacher", "student", "parent"]}>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-serif">Paramètres</h1>
            <p className="text-sm text-muted-foreground">Gérez votre compte et la sécurité</p>
          </div>
        </motion.div>

        {/* Profile card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="w-4 h-4 text-primary" />
                Mon profil
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl select-none">
                  {u?.name?.[0]?.toUpperCase() ?? u?.email?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{u?.name ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{u?.email ?? "—"}</p>
                  <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary mt-1">
                    {roleLabel}
                  </span>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Nom complet</p>
                  <p className="font-medium">{u?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Adresse e-mail</p>
                  <p className="font-medium">{u?.email ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Change password */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="w-4 h-4 text-primary" />
                Changer le mot de passe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">Mot de passe actuel</Label>
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
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrent(v => !v)}
                    >
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
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNew(v => !v)}
                    >
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
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirm(v => !v)}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <Button type="submit" className="gap-2" disabled={loading}>
                    {loading ? (
                      <>Mise à jour…</>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Enregistrer le mot de passe
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* Biometric / WebAuthn */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <WebAuthnDevicesSection userEmail={userEmail} />
        </motion.div>

        {/* GPS settings — admin only */}
        {u?.role === "admin" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GpsSettingsCard />
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
