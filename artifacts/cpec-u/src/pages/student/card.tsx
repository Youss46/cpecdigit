import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Download, RefreshCw, CheckCircle2, XCircle,
  Clock, QrCode, User, GraduationCap, Camera, AlertCircle, Upload, WifiOff,
} from "lucide-react";
import { downloadCardAsPdf } from "@/lib/download-card-pdf";
import { useOfflineQuery } from "@/hooks/use-offline-query";

function getApiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function cropToSquareDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(
        img,
        (img.width - size) / 2,
        (img.height - size) / 2,
        size,
        size,
        0,
        0,
        size,
        size,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function StudentCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoDimError, setPhotoDimError] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading } = useOfflineQuery<any>({
    queryKey: ["/api/student/me"],
    queryFn: () =>
      fetch(`${getApiBase()}/api/student/me`, { credentials: "include" })
        .then(r => r.json()),
    cacheKey: "student:me",
  });

  const hasPhoto = !!profile?.photoUrl;

  const { data: card, isLoading, isError: cardError, isFromCache: cardFromCache } = useOfflineQuery<any>({
    queryKey: ["/api/student/card"],
    queryFn: () =>
      fetch(`${getApiBase()}/api/student/card`, { credentials: "include" })
        .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d))),
    cacheKey: "student:card",
  });

  const hasNoCard = cardError && !card;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast({ title: "Format invalide", description: "Seuls les formats JPG et PNG sont acceptés.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Fichier trop lourd", description: "La photo ne doit pas dépasser 2 Mo.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        if (img.width < 200 || img.height < 200) {
          setPhotoDimError(`Dimensions trop petites (${img.width}×${img.height}px). Minimum requis : 200×200px.`);
          setPhotoPreview(raw);
          setPhotoDialogOpen(true);
          return;
        }
        setPhotoDimError(null);
        const cropped = await cropToSquareDataUrl(raw);
        setPhotoPreview(cropped);
        setPhotoDialogOpen(true);
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoSave = async () => {
    if (!photoPreview || photoDimError) return;
    setPhotoUploading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/student/photo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ photoUrl: photoPreview }),
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["/api/student/me"] });
      qc.invalidateQueries({ queryKey: ["/api/student/card"] });
      toast({ title: "Photo de profil mise à jour avec succès" });
      setPhotoDialogOpen(false);
      setPhotoPreview(null);
    } catch {
      toast({ title: "Erreur lors de l'envoi de la photo", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await fetch(`${getApiBase()}/api/student/card/generate`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error);
      toast({ title: "Carte générée !", description: "Votre carte étudiante est prête." });
      qc.invalidateQueries({ queryKey: ["/api/student/card"] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!card) return;
    setDownloading(true);
    try {
      await downloadCardAsPdf({
        studentName: card.studentName,
        matricule: card.matricule,
        className: card.className,
        filiere: card.filiere,
        academicYear: card.academicYear,
        photoUrl: card.photoUrl,
        dateNaissance: card.dateNaissance,
        issuedAt: card.issuedAt,
        expiresAt: card.expiresAt,
        isValid: card.isValid,
        isExpired: card.isExpired,
        verifyUrl: card.verifyUrl,
      });
    } catch {
      toast({ title: "Erreur PDF", description: "Impossible de générer le PDF. Réessayez.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const isExpired = card?.isExpired;
  const isValid = card?.isValid;
  const statusColor = !isValid ? "text-red-600" : isExpired ? "text-orange-500" : "text-emerald-600";
  const statusLabel = !isValid ? "Invalidée" : isExpired ? "Expirée" : "Valide";
  const StatusIcon = !isValid ? XCircle : isExpired ? Clock : CheckCircle2;

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Photo upload dialog */}
        <Dialog open={photoDialogOpen} onOpenChange={open => {
          setPhotoDialogOpen(open);
          if (!open) { setPhotoPreview(null); setPhotoDimError(null); }
        }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Photo de profil</DialogTitle>
            </DialogHeader>
            {photoPreview && (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={photoPreview}
                  alt="Aperçu"
                  className="w-40 h-40 rounded-full object-cover border-4 border-primary/20 shadow-lg"
                />
                {photoDimError ? (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 w-full">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{photoDimError}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    Photo recadrée au format carré. Elle sera visible par l'administration.
                  </p>
                )}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" className="flex-1" onClick={() => {
                setPhotoDialogOpen(false);
                setPhotoPreview(null);
                setPhotoDimError(null);
              }}>
                Annuler
              </Button>
              {!photoDimError && (
                <Button className="flex-1 gap-2" onClick={handlePhotoSave} disabled={photoUploading}>
                  {photoUploading ? "Envoi…" : <><Upload className="w-4 h-4" />Valider</>}
                </Button>
              )}
              {photoDimError && (
                <Button variant="outline" className="flex-1" onClick={() => {
                  setPhotoDialogOpen(false);
                  setPhotoPreview(null);
                  setPhotoDimError(null);
                  setTimeout(() => fileInputRef.current?.click(), 100);
                }}>
                  Choisir une autre
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Ma Carte Étudiante</h1>
              {cardFromCache && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <WifiOff className="w-3 h-3" /> cache
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Carte numérique officielle {card?.schoolName ?? "M15 EduTech"}</p>
          </div>
        </div>

        {/* Photo required block */}
        {!profileLoading && !hasPhoto && (
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
            <CardContent className="py-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                <Camera className="w-8 h-8 text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-orange-800 dark:text-orange-300">Photo de profil requise</h3>
                <p className="text-sm text-orange-700/80 dark:text-orange-400/80 mt-1 max-w-sm">
                  Vous devez ajouter une photo de profil avant de pouvoir générer ou consulter votre carte étudiante.
                </p>
              </div>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-4 h-4 mr-2" />
                Ajouter une photo de profil
              </Button>
              <p className="text-xs text-orange-600/60 dark:text-orange-500/60 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Formats acceptés : JPG, PNG — Taille max : 2 Mo — Minimum 200×200 px
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {(isLoading || profileLoading) && (
          <Card>
            <CardContent className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </CardContent>
          </Card>
        )}

        {/* No card yet */}
        {!isLoading && !profileLoading && hasPhoto && (hasNoCard || (!card && !isLoading)) && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                <CreditCard className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Aucune carte pour cette année</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Générez votre carte étudiante numérique pour l'année académique en cours.
                </p>
              </div>
              <Button onClick={handleGenerate} disabled={generating} className="mx-auto">
                {generating ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Générer ma carte étudiante
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Card exists */}
        {card && hasPhoto && (
          <>
            {/* Status + Actions */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <StatusIcon className={`w-5 h-5 ${statusColor}`} />
                <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                <Badge variant="outline" className="text-xs">
                  {card.academicYear}
                </Badge>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="w-4 h-4 mr-1.5" />
                  Changer la photo
                </Button>
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${generating ? "animate-spin" : ""}`} />
                  Régénérer
                </Button>
                <Button size="sm" onClick={handleDownload} disabled={downloading}>
                  {downloading
                    ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    : <Download className="w-4 h-4 mr-1.5" />}
                  {downloading ? "Génération…" : "Télécharger PDF"}
                </Button>
              </div>
            </div>

            {/* Card preview — Recto */}
            <div>
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-2">Recto</p>
              <div className="rounded-2xl overflow-hidden shadow-2xl" style={{
                background: "linear-gradient(135deg, #0f2547 0%, #1a3a6b 45%, #1e4d9b 100%)",
                aspectRatio: "85.6 / 54",
                maxWidth: "480px",
                position: "relative",
              }}>
                {/* Watermark */}
                <div style={{
                  position: "absolute", right: "-16px", bottom: "-20px",
                  fontSize: "120px", fontWeight: 900, color: "rgba(255,255,255,0.03)",
                  pointerEvents: "none", lineHeight: 1, letterSpacing: "-4px",
                }}>CPEC</div>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-yellow-400/30">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center">
                      <GraduationCap className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm tracking-wide">{card.schoolName ?? "M15 EduTech"}</div>
                    </div>
                  </div>
                  <div className="border border-yellow-400/50 text-yellow-300/90 text-[9px] font-bold px-2 py-0.5 rounded tracking-widest">
                    CARTE ÉTUDIANTE
                  </div>
                </div>

                {/* Body */}
                <div className="flex px-4 py-2 gap-3 flex-1">
                  {/* Photo */}
                  <div className="shrink-0">
                    {card.photoUrl ? (
                      <img
                        src={card.photoUrl}
                        alt="Photo"
                        className="rounded-lg border-2 border-yellow-400/40 object-cover"
                        style={{ width: "56px", height: "68px" }}
                      />
                    ) : (
                      <div className="rounded-lg border-2 border-dashed border-yellow-400/30 bg-white/10 flex flex-col items-center justify-center"
                        style={{ width: "56px", height: "68px" }}>
                        <User className="w-5 h-5 text-white/40" />
                        <span className="text-[7px] text-white/30 text-center mt-0.5">Photo manquante</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-col gap-1 flex-1 pt-0.5">
                    <div className="text-white font-black uppercase text-sm leading-tight tracking-wide">
                      {card.studentName}
                    </div>
                    {card.matricule && (
                      <div>
                        <div className="text-yellow-300/70 text-[8px] font-bold uppercase tracking-wider">Matricule</div>
                        <div className="text-white/90 text-xs font-semibold">{card.matricule}</div>
                      </div>
                    )}
                    {card.className && (
                      <div>
                        <div className="text-yellow-300/70 text-[8px] font-bold uppercase tracking-wider">Classe</div>
                        <div className="text-white/90 text-xs font-semibold">{card.className}</div>
                      </div>
                    )}
                    {card.filiere && (
                      <div>
                        <div className="text-yellow-300/70 text-[8px] font-bold uppercase tracking-wider">Filière</div>
                        <div className="text-white/90 text-xs font-semibold">{card.filiere}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-1.5 border-t border-yellow-400/20 bg-yellow-400/10 absolute bottom-0 left-0 right-0">
                  <div className="text-yellow-300/90 font-black text-xs tracking-widest">{card.academicYear}</div>
                  <QrCode className="w-5 h-5 text-white/40" />
                </div>
              </div>
            </div>

            {/* Verso summary */}
            <div>
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-2">Verso</p>
              <Card className="border-2">
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Date de naissance</div>
                      <div className="font-semibold">{card.dateNaissance || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Année académique</div>
                      <div className="font-semibold">{card.academicYear}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Délivrée le</div>
                      <div className="font-semibold">
                        {card.issuedAt ? new Date(card.issuedAt).toLocaleDateString("fr-FR") : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Expire le</div>
                      <div className={`font-semibold ${isExpired ? "text-red-500" : ""}`}>
                        {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("fr-FR") : "—"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* QR Verification info */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-4 flex items-start gap-3">
                <QrCode className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">QR Code de vérification</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Le QR code sur votre carte permet à toute personne de vérifier son authenticité
                    sur la page de vérification officielle {card?.schoolName ?? "M15 EduTech"}. Téléchargez le PDF pour voir le QR code.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
