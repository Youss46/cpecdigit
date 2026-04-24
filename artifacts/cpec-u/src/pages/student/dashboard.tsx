import { AppLayout } from "@/components/layout";
import { OfflineCapabilities } from "@/components/offline-banner";
import { useGetStudentProfile, useListSemesters, useGetStudentResults, useGetStudentBalance } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  GraduationCap, Award, Building2, CalendarDays, Camera, Upload,
  FileText, CalendarOff, MessageSquare, Bell, ArrowRight,
  Hash, MapPin, Phone, User2, Mail, Home, BookOpen,
  Calendar, BadgeCheck, ChevronDown, ChevronUp, Wallet, CheckCircle, AlertCircle, Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

function useMyHousing() {
  return useQuery({
    queryKey: ["/api/housing/my"],
    queryFn: async () => {
      const res = await fetch("/api/housing/my", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
}

const ROOM_TYPES: Record<string, string> = {
  simple: "Simple",
  double: "Double",
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-foreground mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { data: profile } = useGetStudentProfile();
  const { data: semesters } = useListSemesters();
  const { data: housing } = useMyHousing();
  const { data: balance } = useGetStudentBalance();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [parentExpanded, setParentExpanded] = useState(false);

  const p = profile as any;

  const latestPublished = (semesters ?? [])
    .filter((s: any) => s.published)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const { data: latestResults } = useGetStudentResults(
    { semesterId: latestPublished?.id ?? 0 },
    { query: { enabled: !!latestPublished, retry: false } as any }
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Fichier invalide. Veuillez choisir une image.", variant: "destructive" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Image trop grande. Maximum 4 Mo.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
      setPhotoDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoSave = async () => {
    if (!photoPreview) return;
    setPhotoUploading(true);
    try {
      const res = await fetch("/api/student/photo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ photoUrl: photoPreview }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/student/me"] });
      toast({ title: "Photo de profil mise à jour" });
      setPhotoDialogOpen(false);
      setPhotoPreview(null);
    } catch {
      toast({ title: "Erreur lors de l'envoi de la photo", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  };

  const quickLinks = [
    { label: "Mes Résultats", href: "/student/grades", icon: FileText, color: "text-primary", bg: "bg-primary/10" },
    { label: "Emploi du Temps", href: "/student/schedule", icon: CalendarDays, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Mes Absences", href: "/student/absences", icon: CalendarOff, color: "text-red-600", bg: "bg-red-50" },
    { label: "Messages", href: "/student/messages", icon: MessageSquare, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Notifications", href: "/student/notifications", icon: Bell, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  const hasParentInfo = !!(p?.parentName || p?.parentPhone || p?.parentEmail || p?.parentAddress);

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-5 max-w-5xl mx-auto">
        <OfflineCapabilities role="student" />

        {/* Photo Upload Dialog */}
        <Dialog open={photoDialogOpen} onOpenChange={open => { setPhotoDialogOpen(open); if (!open) setPhotoPreview(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Confirmer la photo de profil</DialogTitle></DialogHeader>
            {photoPreview && (
              <div className="flex flex-col items-center gap-4">
                <img src={photoPreview} alt="Aperçu" className="w-40 h-40 rounded-full object-cover border-4 border-primary/20 shadow-lg" />
                <p className="text-sm text-muted-foreground text-center">Cette photo sera visible par l'administration.</p>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1" onClick={() => { setPhotoDialogOpen(false); setPhotoPreview(null); }}>Annuler</Button>
                  <Button className="flex-1 gap-2" onClick={handlePhotoSave} disabled={photoUploading}>
                    {photoUploading ? "Envoi…" : <><Upload className="w-4 h-4" /> Valider</>}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {/* Profile Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 rounded-3xl p-6 sm:p-8 text-primary-foreground overflow-hidden shadow-2xl shadow-black/20">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 opacity-10">
            <GraduationCap className="w-64 h-64" />
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="relative flex-shrink-0 group">
              <div className="w-24 h-24 rounded-full border-4 border-white/20 overflow-hidden bg-white/10 flex items-center justify-center shadow-xl">
                {p?.photoUrl ? (
                  <img src={p.photoUrl} alt="Photo de profil" className="w-full h-full object-cover" />
                ) : (
                  <GraduationCap className="w-12 h-12 text-white/60" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                title="Modifier la photo"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold mb-1 truncate">{p?.name ?? "—"}</h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                {p?.className && (
                  <span className="flex items-center gap-1.5 text-sm text-white/90 bg-white/15 rounded-full px-3 py-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    {p.className}
                  </span>
                )}
                {p?.filiere && (
                  <span className="flex items-center gap-1.5 text-sm text-white/90 bg-white/15 rounded-full px-3 py-1">
                    {p.filiere}
                  </span>
                )}
                {p?.isTerminal && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-200 bg-amber-500/30 border border-amber-300/30 rounded-full px-2.5 py-1 font-semibold">
                    <GraduationCap className="w-3 h-3" />
                    Fin de cycle
                  </span>
                )}
              </div>
              {p?.matricule && (
                <p className="text-white/60 text-sm mt-2 font-mono tracking-wider">{p.matricule}</p>
              )}
              {p?.activeSemester && (
                <p className="text-white/50 text-xs mt-1 flex items-center gap-1 justify-center sm:justify-start">
                  <Calendar className="w-3 h-3" />
                  Semestre en cours : {p.activeSemester.name}
                </p>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 text-xs text-white/50 hover:text-white/80 underline underline-offset-2 transition-colors flex items-center gap-1 mx-auto sm:mx-0"
              >
                <Camera className="w-3 h-3" />
                {p?.photoUrl ? "Modifier ma photo" : "Ajouter une photo de profil"}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Quick links */}
        <motion.div
          className="grid grid-cols-3 sm:grid-cols-5 gap-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer group">
                <CardContent className="p-3 sm:p-4 flex flex-col items-center gap-2 text-center">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${link.bg} flex items-center justify-center`}>
                    <link.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${link.color}`} />
                  </div>
                  <span className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">{link.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </motion.div>

        {/* Academic + personal info grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          {/* Academic info card */}
          <Card className="border-border shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">Informations Académiques</h3>
              </div>
              <InfoRow icon={Hash} label="Matricule" value={p?.matricule} />
              <InfoRow icon={BookOpen} label="Classe" value={p?.className} />
              <InfoRow icon={BadgeCheck} label="Filière" value={p?.filiere} />
              <InfoRow icon={Calendar} label="Semestre en cours" value={p?.activeSemester?.name} />
              {!p?.matricule && !p?.className && !p?.filiere && !p?.activeSemester && (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune information académique disponible</p>
              )}
            </CardContent>
          </Card>

          {/* Personal info card */}
          <Card className="border-border shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <User2 className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">Informations Personnelles</h3>
              </div>
              <InfoRow icon={CalendarDays} label="Date de naissance" value={p?.dateNaissance} />
              <InfoRow icon={MapPin} label="Lieu de naissance" value={p?.lieuNaissance} />
              <InfoRow icon={Phone} label="Téléphone" value={p?.phone} />
              <InfoRow icon={Home} label="Adresse" value={p?.address} />
              <InfoRow icon={Mail} label="Email" value={p?.email} />
              {!p?.dateNaissance && !p?.lieuNaissance && !p?.phone && !p?.address && (
                <p className="text-sm text-muted-foreground text-center py-4">Coordonnées non renseignées</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Parent / tuteur info */}
        {hasParentInfo && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            <Card className="border-border shadow-sm">
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors rounded-xl"
                  onClick={() => setParentExpanded(v => !v)}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                      <User2 className="w-4 h-4 text-violet-600" />
                    </div>
                    <span className="font-semibold text-sm text-foreground">Contact Parent / Tuteur</span>
                    {p?.parentName && (
                      <span className="text-sm text-muted-foreground ml-1">— {p.parentName}</span>
                    )}
                  </div>
                  {parentExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {parentExpanded && (
                  <div className="px-5 pb-4 border-t border-border/40">
                    <div className="pt-3">
                      <InfoRow icon={User2} label="Nom du parent / tuteur" value={p?.parentName} />
                      <InfoRow icon={Phone} label="Téléphone" value={p?.parentPhone} />
                      <InfoRow icon={Mail} label="Email" value={p?.parentEmail} />
                      <InfoRow icon={Home} label="Adresse" value={p?.parentAddress} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Housing Card */}
        {housing && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-border shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center gap-4 p-5">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Mon Hébergement</p>
                    <p className="font-bold text-foreground">{housing.buildingName} — Chambre {housing.roomNumber}</p>
                    <p className="text-sm text-muted-foreground">Étage {housing.floor} · {ROOM_TYPES[housing.type] ?? housing.type} · {housing.capacity} pers.</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="font-bold text-teal-700">{parseFloat(housing.pricePerMonth).toLocaleString("fr-FR")} FCFA<span className="text-xs font-normal text-muted-foreground">/mois</span></p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><CalendarDays className="w-3 h-3" />Depuis le {new Date(housing.startDate).toLocaleDateString("fr-FR")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Solde de scolarité */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <Card className="border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-secondary/20">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground text-sm">Mon Solde de Scolarité</span>
                  {balance && balance.academicYear && (
                    <span className="text-xs text-muted-foreground">— {balance.academicYear}</span>
                  )}
                </div>
                {balance && balance.status !== "non_configure" && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    balance.status === "solde"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : balance.status === "partiel"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}>
                    {balance.status === "solde" ? "✓ Soldé" : balance.status === "partiel" ? "Partiel" : "Non payé"}
                  </span>
                )}
              </div>

              {!balance || balance.status === "non_configure" ? (
                <div className="px-5 py-6 text-center text-muted-foreground text-sm">
                  <Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  Frais de scolarité non encore configurés. Contactez l'administration.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 divide-x divide-border/60">
                    <div className="px-5 py-5 text-center">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total dû</p>
                      <p className="text-xl font-bold font-mono text-foreground">
                        {balance.totalDue.toLocaleString("fr-FR")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">FCFA</p>
                    </div>
                    <div className="px-5 py-5 text-center">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Payé</p>
                      <p className="text-xl font-bold font-mono text-emerald-600">
                        {balance.totalPaid.toLocaleString("fr-FR")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">FCFA</p>
                    </div>
                    <div className="px-5 py-5 text-center">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Reste à payer</p>
                      <p className={`text-xl font-bold font-mono ${balance.remaining > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {balance.remaining.toLocaleString("fr-FR")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">FCFA</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="px-5 pb-4">
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${balance.status === "solde" ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${balance.totalDue > 0 ? Math.min(100, Math.round((balance.totalPaid / balance.totalDue) * 100)) : 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 text-right">
                      {balance.totalDue > 0 ? Math.round((balance.totalPaid / balance.totalDue) * 100) : 0}% réglé
                    </p>
                  </div>

                  {/* Payment history */}
                  {balance.payments.length > 0 && (
                    <div className="border-t border-border/50 px-5 pt-3 pb-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Historique des paiements</p>
                      <div className="space-y-2">
                        {balance.payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                              <div>
                                <span className="font-medium">{Number(p.amount).toLocaleString("fr-FR")} FCFA</span>
                                {p.description && <span className="text-muted-foreground ml-1">— {p.description}</span>}
                              </div>
                            </div>
                            <span className="text-muted-foreground text-xs flex-shrink-0">
                              {new Date(p.paymentDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Latest results summary */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <Card className="border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-secondary/20">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground text-sm">
                    {latestPublished ? `Résultats — ${latestPublished.name}` : "Résultats"}
                  </span>
                </div>
                <Link href="/student/grades">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary hover:text-primary">
                    Voir tout <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>

              {!latestPublished ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Aucun résultat publié pour le moment.</p>
                </div>
              ) : !latestResults ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Résultats non disponibles pour ce semestre.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 divide-x divide-border/60">
                  <div className="px-5 py-5 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Moyenne</p>
                    <p className={`text-3xl font-bold font-mono ${
                      (latestResults.average ?? 0) >= 10 ? "text-emerald-600" : "text-destructive"
                    }`}>
                      {latestResults.average?.toFixed(2) ?? "—"}
                    </p>
                    {(latestResults as any).absenceDeduction > 0 && (
                      <p className="text-xs text-red-500 mt-0.5">−{(latestResults as any).absenceDeduction.toFixed(2)} abs.</p>
                    )}
                  </div>
                  <div className="px-5 py-5 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Classement</p>
                    <p className="text-3xl font-bold font-mono text-foreground">{latestResults.rank ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">/ {latestResults.totalStudents}</p>
                  </div>
                  <div className="px-5 py-5 text-center flex flex-col items-center justify-center gap-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Décision</p>
                    <Badge className={`text-sm font-bold px-3 py-1 ${
                      latestResults.decision === "Admis" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                      latestResults.decision === "Ajourné" ? "bg-red-100 text-red-700 border-red-200" :
                      "bg-secondary text-muted-foreground"
                    } border`}>
                      {latestResults.decision === "Admis" && <Award className="w-3.5 h-3.5 mr-1" />}
                      {latestResults.decision ?? "En attente"}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </AppLayout>
  );
}
