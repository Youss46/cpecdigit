import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Upload, FileText, Clock, CheckCircle2, Calendar,
  MapPin, Users, Award, BookMarked, Plus, ChevronDown, ChevronUp,
  Download, Loader2, AlertCircle, XCircle, Eye,
} from "lucide-react";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function getPreviewUrl(fichierPath: string, fichierNom?: string): string {
  const ext = (fichierNom ?? fichierPath).split(".").pop()?.toLowerCase();
  if (ext === "pdf") return fichierPath;
  const fullUrl = window.location.origin + fichierPath;
  return `https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}&embedded=true`;
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Erreur lors du téléchargement");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    alert("Impossible de télécharger le fichier.");
  }
}

const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType; step: number }> = {
  SOUMIS:   { label: "Soumis",   color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",       icon: Clock,        step: 1 },
  VALIDE:   { label: "Validé",   color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2, step: 2 },
  PLANIFIE: { label: "Planifié", color: "text-violet-700",  bg: "bg-violet-50 border-violet-200",   icon: Calendar,     step: 3 },
  SOUTENU:  { label: "Soutenu",  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     icon: Award,        step: 4 },
  ARCHIVE:  { label: "Archivé",  color: "text-gray-600",    bg: "bg-gray-50 border-gray-200",       icon: BookMarked,   step: 5 },
  REJETE:   { label: "Refusé",   color: "text-red-700",     bg: "bg-red-50 border-red-200",         icon: XCircle,      step: 0 },
};

const MENTION_COLORS: Record<string, string> = {
  EXCELLENT: "bg-emerald-600",
  TRES_BIEN: "bg-emerald-500",
  BIEN:      "bg-blue-500",
  ASSEZ_BIEN:"bg-amber-500",
  PASSABLE:  "bg-orange-500",
};

const MENTION_LABELS: Record<string, string> = {
  EXCELLENT: "Excellent",
  TRES_BIEN: "Très Bien",
  BIEN: "Bien",
  ASSEZ_BIEN: "Assez Bien",
  PASSABLE: "Passable",
};

const ROLE_LABELS: Record<string, string> = {
  PRESIDENT: "Président",
  RAPPORTEUR: "Rapporteur",
  EXAMINATEUR: "Examinateur",
};

const STEPS = [
  { key: "SOUMIS",   label: "Soumis" },
  { key: "VALIDE",   label: "Validé" },
  { key: "PLANIFIE", label: "Planifié" },
  { key: "SOUTENU",  label: "Soutenu" },
  { key: "ARCHIVE",  label: "Archivé" },
];

function StatusTimeline({ statut }: { statut: string }) {
  // If rejected, show a special single-step "refusé" banner instead of the normal timeline
  if (statut === "REJETE") {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
        <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-red-700">Dossier refusé par l'administration</span>
      </div>
    );
  }

  const currentStep = STATUT_CONFIG[statut]?.step ?? 1;
  return (
    <div className="flex items-center gap-0 w-full">
      {STEPS.map((s, i) => {
        const cfg = STATUT_CONFIG[s.key];
        const step = cfg.step;
        const done = step < currentStep;
        const active = step === currentStep;
        const Icon = cfg.icon;
        return (
          <div key={s.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                done   ? "bg-primary border-primary" :
                active ? "bg-white border-primary" :
                         "bg-white border-border"
              }`}>
                <Icon className={`w-3.5 h-3.5 ${done ? "text-white" : active ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${done || active ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SubmitForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [titre, setTitre] = useState("");
  const [resume, setResume] = useState("");
  const [filiere, setFiliere] = useState("");
  const [annee, setAnnee] = useState(new Date().getFullYear().toString());
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre || !annee) {
      toast({ title: "Veuillez renseigner le titre et l'année académique.", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "Fichier obligatoire", description: "Veuillez joindre le fichier PDF ou Word de votre mémoire avant de soumettre.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("titre", titre);
      fd.append("resume", resume);
      fd.append("filiere", filiere);
      fd.append("annee_academique", annee);
      if (file) fd.append("fichier", file);

      await fetch("/api/student/memoires", {
        method: "POST",
        credentials: "include",
        body: fd,
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      });

      toast({ title: "Mémoire soumis avec succès !", description: "Il sera examiné par votre responsable pédagogique." });
      onSuccess();
    } catch {
      toast({ title: "Erreur lors de la soumission.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="w-4 h-4 text-primary" />
          Déposer mon mémoire / rapport
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titre">Titre du mémoire *</Label>
            <Input id="titre" placeholder="Titre complet de votre mémoire ou rapport" value={titre} onChange={e => setTitre(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="filiere">Filière</Label>
              <Input id="filiere" placeholder="ex : Génie Logiciel" value={filiere} onChange={e => setFiliere(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="annee">Année académique *</Label>
              <Input id="annee" placeholder="ex : 2024-2025" value={annee} onChange={e => setAnnee(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resume">Résumé</Label>
            <Textarea id="resume" placeholder="Résumé de votre travail (problématique, méthodologie, résultats)…" rows={4} value={resume} onChange={e => setResume(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fichier (PDF, Word) — max 50 Mo <span className="text-destructive">*</span></Label>
            <div
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-primary font-medium">
                  <FileText className="w-5 h-5" />
                  <span className="text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} Mo)</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">Cliquez pour sélectionner votre fichier</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {loading ? "Soumission en cours…" : "Soumettre le mémoire"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MemoireCard({ memoire }: { memoire: any }) {
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { data: detail, isLoading } = useQuery({
    queryKey: ["/api/student/memoires", memoire.id],
    queryFn: () => apiFetch(`/student/memoires/${memoire.id}`),
    enabled: expanded,
  });

  const cfg = STATUT_CONFIG[memoire.statut] ?? STATUT_CONFIG.SOUMIS;
  const Icon = cfg.icon;

  return (
    <Card className="border-border shadow-sm overflow-hidden">
      <div
        className="flex items-start gap-4 p-5 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <GraduationCap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{memoire.titre}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {memoire.filiere && <span className="mr-2">{memoire.filiere} ·</span>}
            Année {memoire.annee_academique}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Soumis le {new Date(memoire.created_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
            <Icon className="w-3 h-3" />{cfg.label}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="border-t border-border px-5 pb-5 pt-4 space-y-5">
              {/* Timeline */}
              <StatusTimeline statut={memoire.statut} />

              {/* Rejection reason */}
              {memoire.statut === "REJETE" && memoire.raison_rejet && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Motif du refus</p>
                    <p className="text-sm text-red-600 mt-0.5 italic">« {memoire.raison_rejet} »</p>
                  </div>
                </div>
              )}

              {/* Re-submit hint after rejection */}
              {memoire.statut === "REJETE" && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Vous pouvez déposer un nouveau mémoire corrigé depuis le formulaire de soumission.
                </div>
              )}

              {/* Result */}
              {memoire.statut === "SOUTENU" && (memoire.mention || memoire.note) && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <Award className="w-6 h-6 text-amber-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900">Résultat de soutenance</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {memoire.mention && (
                        <span className={`text-xs font-bold text-white px-3 py-1 rounded-full ${MENTION_COLORS[memoire.mention] ?? "bg-gray-500"}`}>
                          {MENTION_LABELS[memoire.mention] ?? memoire.mention}
                        </span>
                      )}
                      {memoire.note != null && (
                        <span className="text-sm font-semibold text-amber-800">{Number(memoire.note).toFixed(2)} / 20</span>
                      )}
                    </div>
                    {detail?.observations && <p className="text-sm text-amber-700 mt-2 italic">{detail.observations}</p>}
                  </div>
                </div>
              )}

              {/* Soutenance info */}
              {(memoire.statut === "PLANIFIE" || memoire.statut === "SOUTENU") && memoire.date_soutenance && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Informations de soutenance</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                      <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="text-sm font-semibold">{new Date(memoire.date_soutenance).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                      <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Heure</p>
                        <p className="text-sm font-semibold">{memoire.heure_debut}{memoire.duree_minutes ? ` · ${memoire.duree_minutes} min` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                      <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Salle</p>
                        <p className="text-sm font-semibold">{memoire.salle || "—"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Jury */}
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-3.5 h-3.5 animate-spin" />Chargement du jury…</div>
                  ) : (detail?.jury ?? []).length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" />Composition du jury</p>
                      <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                        {(detail?.jury ?? []).map((j: any) => (
                          <div key={j.id} className="flex items-center justify-between px-4 py-2.5 bg-card">
                            <span className="text-sm font-medium">{j.user_name || j.nom_externe || "—"}</span>
                            <Badge variant="outline" className="text-xs">{ROLE_LABELS[j.role] ?? j.role}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* File actions */}
              {memoire.fichier_path && (
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setPreviewOpen(true)}
                    className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
                  >
                    <Eye className="w-4 h-4" />Consulter le fichier
                  </button>
                  <span className="text-muted-foreground text-sm">·</span>
                  <button
                    onClick={() => downloadFile(memoire.fichier_path, memoire.fichier_nom ?? "document")}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <Download className="w-4 h-4" />Télécharger ({memoire.fichier_nom ?? "document"})
                  </button>
                </div>
              )}

              {/* File preview dialog */}
              {memoire.fichier_path && (
                <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                  <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-5 py-3 border-b border-border flex-shrink-0">
                      <DialogTitle className="flex items-center gap-2 text-base">
                        <FileText className="w-4 h-4 text-primary" />
                        {memoire.fichier_nom ?? "Document"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden">
                      <iframe
                        src={getPreviewUrl(memoire.fichier_path, memoire.fichier_nom)}
                        className="w-full h-full border-0"
                        title={memoire.fichier_nom ?? "Aperçu du document"}
                      />
                    </div>
                    <div className="flex items-center justify-between px-5 py-2.5 border-t border-border bg-muted/30 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {memoire.fichier_nom?.split(".").pop()?.toUpperCase() === "PDF"
                          ? "Aperçu PDF natif"
                          : "Aperçu via Google Docs Viewer — nécessite une connexion internet"}
                      </span>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadFile(memoire.fichier_path, memoire.fichier_nom ?? "document")}>
                        <Download className="w-3.5 h-3.5" />Télécharger
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function StudentMemoiresPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: memoires = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/student/memoires"],
    queryFn: () => apiFetch("/student/memoires"),
  });

  const hasPending = (memoires as any[]).some(m => !["SOUTENU", "ARCHIVE", "REJETE"].includes(m.statut));

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-serif flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-primary" />
              Mes Mémoires & Rapports
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Suivez le processus de dépôt et de soutenance de vos travaux.</p>
          </div>
          {!hasPending && (
            <Button onClick={() => setShowForm(v => !v)} className="gap-2">
              {showForm ? "Annuler" : <><Plus className="w-4 h-4" />Déposer un mémoire</>}
            </Button>
          )}
        </div>

        {/* Alert if has pending */}
        {hasPending && !showForm && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Vous avez un mémoire en cours de traitement. Vous pourrez soumettre un nouveau dossier une fois ce processus terminé.
          </div>
        )}

        {/* Submit form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <SubmitForm onSuccess={() => {
                setShowForm(false);
                queryClient.invalidateQueries({ queryKey: ["/api/student/memoires"] });
              }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (memoires as any[]).length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Aucun mémoire soumis pour le moment.</p>
            <p className="text-sm mt-1">Utilisez le bouton ci-dessus pour déposer votre premier travail.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(memoires as any[]).map((m: any) => (
              <MemoireCard key={m.id} memoire={m} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
