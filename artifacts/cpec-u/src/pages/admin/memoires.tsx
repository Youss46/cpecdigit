import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  GraduationCap, Search, Filter, Eye, CheckCircle2, Calendar,
  Clock, MapPin, Users, Award, BookMarked, Plus, Trash2, FileText,
  Download, Loader2, BookOpen, User, X, Archive, Star, AlertCircle, XCircle, ExternalLink,
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

const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  SOUMIS:   { label: "Soumis",   color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",       icon: Clock },
  VALIDE:   { label: "Validé",   color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  PLANIFIE: { label: "Planifié", color: "text-violet-700",  bg: "bg-violet-50 border-violet-200",   icon: Calendar },
  SOUTENU:  { label: "Soutenu",  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     icon: Award },
  ARCHIVE:  { label: "Archivé",  color: "text-gray-600",    bg: "bg-gray-50 border-gray-200",       icon: BookMarked },
  REJETE:   { label: "Refusé",   color: "text-red-700",     bg: "bg-red-50 border-red-200",         icon: XCircle },
};

const MENTION_LABELS: Record<string, string> = {
  EXCELLENT: "Excellent", TRES_BIEN: "Très Bien", BIEN: "Bien",
  ASSEZ_BIEN: "Assez Bien", PASSABLE: "Passable",
};
const MENTION_COLORS: Record<string, string> = {
  EXCELLENT: "bg-emerald-600", TRES_BIEN: "bg-emerald-500", BIEN: "bg-blue-500",
  ASSEZ_BIEN: "bg-amber-500", PASSABLE: "bg-orange-500",
};
const ROLE_LABELS: Record<string, string> = {
  PRESIDENT: "Président", RAPPORTEUR: "Rapporteur", EXAMINATEUR: "Examinateur",
};

// ── PDF Convocation (jsPDF, client-side) ────────────────────────────────────
async function generateConvocationPDF(memoire: any, jury: any[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;

  // Header
  doc.setFillColor(26, 58, 92);
  doc.rect(0, 0, W, 40, "F");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("M15 EduTech", W / 2, 16, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("CONVOCATION OFFICIELLE À SOUTENANCE", W / 2, 24, { align: "center" });
  doc.text(`${memoire.school_name ?? ""}`.toUpperCase(), W / 2, 31, { align: "center" });

  // Gold separator
  doc.setFillColor(234, 179, 8);
  doc.rect(0, 40, W, 2, "F");

  let y = 55;
  doc.setFontSize(13);
  doc.setTextColor(15, 37, 64);
  doc.setFont("helvetica", "bold");
  doc.text("Objet : Convocation à soutenance de mémoire/rapport", 20, y);
  y += 12;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(55, 65, 81);
  doc.text(`Monsieur/Madame ${memoire.student_name},`, 20, y); y += 7;
  doc.text("Vous êtes convoqué(e) à la soutenance de votre mémoire dans les conditions suivantes :", 20, y); y += 12;

  // Info box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, y, W - 40, 60, 3, 3, "FD");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("TITRE DU MÉMOIRE", 28, y + 8);
  doc.setFontSize(10);
  doc.setTextColor(15, 37, 64);
  doc.setFont("helvetica", "bold");
  const titreLines = doc.splitTextToSize(memoire.titre, W - 56);
  doc.text(titreLines, 28, y + 15);
  y += titreLines.length > 1 ? 28 : 22;

  // Date / heure / salle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("DATE", 28, y + 4);
  doc.text("HEURE", 88, y + 4);
  doc.text("SALLE", 148, y + 4);
  doc.setFontSize(11);
  doc.setTextColor(15, 37, 64);
  doc.setFont("helvetica", "bold");
  doc.text(new Date(memoire.date_soutenance).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }), 28, y + 11);
  doc.text(memoire.heure_debut ?? "—", 88, y + 11);
  doc.text(memoire.salle ?? "—", 148, y + 11);
  y += 30;

  // Jury
  if (jury.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 37, 64);
    doc.text("Composition du jury", 20, y); y += 7;
    doc.setFillColor(26, 58, 92);
    doc.rect(20, y, W - 40, 7, "F");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("NOM", 24, y + 5);
    doc.text("RÔLE", 130, y + 5);
    y += 7;
    jury.forEach((j, i) => {
      if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(20, y, W - 40, 8, "F"); }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      doc.text(j.user_name || j.nom_externe || "—", 24, y + 5.5);
      doc.text(ROLE_LABELS[j.role] ?? j.role, 130, y + 5.5);
      y += 8;
    });
    y += 6;
  }

  // Footer
  const pageH = 297;
  doc.setFillColor(249, 250, 251);
  doc.rect(0, pageH - 22, W, 22, "F");
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.setFont("helvetica", "normal");
  doc.text(`Document généré le ${new Date().toLocaleDateString("fr-FR")} — M15 EduTech`, W / 2, pageH - 10, { align: "center" });

  doc.save(`convocation-${memoire.student_name?.replace(/\s+/g, "-")}.pdf`);
}

// ── Jury Member Row ──────────────────────────────────────────────────────────
function JuryRow({ m }: { m: { id?: number; user_id?: number; nom_externe?: string; email_externe?: string; role: string; user_name?: string } }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/40 border border-border">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <User className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{m.user_name || m.nom_externe || "—"}</p>
        {m.email_externe && <p className="text-xs text-muted-foreground truncate">{m.email_externe}</p>}
      </div>
      <Badge variant="outline" className="text-xs flex-shrink-0">{ROLE_LABELS[m.role] ?? m.role}</Badge>
    </div>
  );
}

// ── Main Detail Dialog ───────────────────────────────────────────────────────
function MemoireDialog({ memoireId, onClose }: { memoireId: number; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: memoire, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/admin/memoires", memoireId],
    queryFn: () => apiFetch(`/admin/memoires/${memoireId}`),
    retry: 1,
  });

  const { data: teachers = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/memoires-teachers"],
    queryFn: () => apiFetch("/admin/memoires-teachers"),
  });

  // Jury form state
  const [juryList, setJuryList] = useState<Array<{ user_id?: number; nom_externe?: string; email_externe?: string; role: string; user_name?: string }>>([]);
  const [juryType, setJuryType] = useState<"internal" | "external">("internal");
  const [juryUserId, setJuryUserId] = useState("");
  const [juryNom, setJuryNom] = useState("");
  const [juryEmail, setJuryEmail] = useState("");
  const [juryRole, setJuryRole] = useState("EXAMINATEUR");

  // Planning state
  const [dateS, setDateS] = useState("");
  const [heureS, setHeureS] = useState("09:00");
  const [dureeS, setDureeS] = useState("60");
  const [salleS, setSalleS] = useState("");

  // Note/Mention state
  const [note, setNote] = useState("");
  const [mention, setMention] = useState("");
  const [observations, setObservations] = useState("");

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"info" | "planning" | "result">("info");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/memoires"] });
    refetch();
  };

  const handleValidate = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/memoires/${memoireId}/statut`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut: "VALIDE" }) });
      toast({ title: "Mémoire validé." });
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleArchive = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/memoires/${memoireId}/statut`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut: "ARCHIVE" }) });
      toast({ title: "Mémoire archivé." });
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleReject = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/memoires/${memoireId}/rejeter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raison: rejectReason.trim() || undefined }),
      });
      toast({ title: "Mémoire refusé.", description: "L'étudiant a été notifié." });
      setRejectOpen(false);
      setRejectReason("");
      invalidate();
    } catch { toast({ title: "Erreur lors du refus", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const addJuryMember = () => {
    if (juryType === "internal") {
      const teacher = (teachers as any[]).find(t => t.id.toString() === juryUserId);
      if (!teacher) { toast({ title: "Sélectionnez un enseignant.", variant: "destructive" }); return; }
      setJuryList(p => [...p, { user_id: teacher.id, user_name: teacher.name, role: juryRole }]);
      setJuryUserId("");
    } else {
      if (!juryNom) { toast({ title: "Saisissez un nom.", variant: "destructive" }); return; }
      setJuryList(p => [...p, { nom_externe: juryNom, email_externe: juryEmail, role: juryRole }]);
      setJuryNom(""); setJuryEmail("");
    }
  };

  const handlePlanifier = async () => {
    if (!dateS || !heureS) { toast({ title: "Renseignez la date et l'heure.", variant: "destructive" }); return; }
    if (juryList.length === 0 && (!memoire?.jury || memoire.jury.length === 0)) {
      toast({ title: "Composez le jury avant de planifier.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const allJury = [...(memoire?.jury?.map((j: any) => ({ user_id: j.user_id, nom_externe: j.nom_externe, email_externe: j.email_externe, role: j.role })) ?? []), ...juryList];
      await apiFetch(`/admin/memoires/${memoireId}/soutenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_soutenance: dateS, heure_debut: heureS, duree_minutes: parseInt(dureeS) || 60, salle: salleS, jury: allJury }),
      });
      toast({ title: "Soutenance planifiée ! Email envoyé à l'étudiant." });
      setJuryList([]);
      invalidate();
    } catch { toast({ title: "Erreur lors de la planification.", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleSaveNote = async () => {
    if (!mention) { toast({ title: "Sélectionnez une mention.", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiFetch(`/admin/memoires/${memoireId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note ? parseFloat(note) : null, mention, observations }),
      });
      toast({ title: "Résultat enregistré. Mémoire marqué comme soutenu." });
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-7 h-7 animate-spin text-primary" />
    </div>
  );
  if (isError || !memoire) return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertCircle className="w-8 h-8 text-destructive" />
      <p className="text-sm font-medium text-destructive">Impossible de charger le mémoire.</p>
      <button onClick={() => refetch()} className="text-xs text-primary underline">Réessayer</button>
    </div>
  );

  const cfg = STATUT_CONFIG[memoire.statut] ?? STATUT_CONFIG.SOUMIS;
  const StatusIcon = cfg.icon;
  const jury: any[] = memoire.jury ?? [];

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground leading-tight">{memoire.titre}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{memoire.student_name} · {memoire.student_email}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
              <StatusIcon className="w-3 h-3" />{cfg.label}
            </span>
            {memoire.filiere && <Badge variant="outline" className="text-xs">{memoire.filiere}</Badge>}
            <Badge variant="outline" className="text-xs">{memoire.annee_academique}</Badge>
            {memoire.mention && (
              <span className={`text-xs font-bold text-white px-2.5 py-1 rounded-full ${MENTION_COLORS[memoire.mention] ?? "bg-gray-500"}`}>
                {MENTION_LABELS[memoire.mention] ?? memoire.mention}
                {memoire.note != null ? ` · ${Number(memoire.note).toFixed(2)}/20` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Resume */}
      {memoire.resume && (
        <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3 border border-border">
          {memoire.resume}
        </div>
      )}

      {/* File actions */}
      {memoire.fichier_path && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline">
            <Eye className="w-4 h-4" />Consulter le fichier
          </button>
          <span className="text-muted-foreground text-sm">·</span>
          <button
            onClick={() => downloadFile(memoire.fichier_path, memoire.fichier_nom ?? "document")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline">
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
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadFile(memoire.fichier_path, memoire.fichier_nom ?? "document")}>
                  <Download className="w-3.5 h-3.5" />Télécharger
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open(memoire.fichier_path, "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Ouvrir dans un onglet
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* PDF Convocation button */}
      {["PLANIFIE", "SOUTENU"].includes(memoire.statut) && memoire.date_soutenance && (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => generateConvocationPDF(memoire, jury)}>
          <FileText className="w-4 h-4" />Générer la convocation PDF
        </Button>
      )}

      <Separator />

      {/* Section tabs */}
      <div className="flex rounded-lg border border-border overflow-hidden text-sm">
        {[
          { key: "info", label: "Informations", icon: Eye },
          { key: "planning", label: "Planification", icon: Calendar },
          { key: "result", label: "Résultat", icon: Star },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveSection(key as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-all ${activeSection === key ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── Section: Info / Status actions ── */}
      {activeSection === "info" && (
        <div className="space-y-4">
          {/* Soutenance info */}
          {memoire.date_soutenance && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Calendar, label: "Date", val: new Date(memoire.date_soutenance).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) },
                { icon: Clock, label: "Heure", val: `${memoire.heure_debut ?? "—"}${memoire.duree_minutes ? ` · ${memoire.duree_minutes}min` : ""}` },
                { icon: MapPin, label: "Salle", val: memoire.salle ?? "—" },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="flex flex-col gap-1 p-2.5 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="w-3 h-3" />{label}</div>
                  <p className="text-sm font-semibold">{val}</p>
                </div>
              ))}
            </div>
          )}

          {/* Jury */}
          {jury.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" />Jury composé</p>
              <div className="space-y-1.5">
                {jury.map((j: any) => <JuryRow key={j.id} m={j} />)}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {memoire.statut === "SOUMIS" && (
              <Button size="sm" className="gap-2" onClick={handleValidate} disabled={saving}>
                <CheckCircle2 className="w-3.5 h-3.5" />Valider le mémoire
              </Button>
            )}
            {["SOUTENU", "REJETE"].includes(memoire.statut) && (
              <Button size="sm" variant="outline" className="gap-2" onClick={handleArchive} disabled={saving}>
                <Archive className="w-3.5 h-3.5" />Archiver
              </Button>
            )}
            {!["SOUTENU", "ARCHIVE", "REJETE"].includes(memoire.statut) && (
              <Button size="sm" variant="outline" className="gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300" onClick={() => setRejectOpen(true)} disabled={saving}>
                <XCircle className="w-3.5 h-3.5" />Refuser le dossier
              </Button>
            )}
          </div>

          {/* Rejection banner */}
          {memoire.statut === "REJETE" && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
              <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Dossier refusé</p>
                {memoire.raison_rejet && (
                  <p className="text-sm text-red-600 mt-0.5 italic">« {memoire.raison_rejet} »</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section: Planification ── */}
      {activeSection === "planning" && (
        <div className="space-y-4">
          {!["VALIDE", "PLANIFIE"].includes(memoire.statut) && (
            <div className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
              Validez d'abord le mémoire avant de planifier la soutenance.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date de soutenance *</Label>
              <Input type="date" value={dateS} onChange={e => setDateS(e.target.value)} defaultValue={memoire.date_soutenance ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Heure de début *</Label>
              <Input type="time" value={heureS} onChange={e => setHeureS(e.target.value)} defaultValue={memoire.heure_debut ?? "09:00"} />
            </div>
            <div className="space-y-1.5">
              <Label>Durée (minutes)</Label>
              <Input type="number" min={15} max={300} value={dureeS} onChange={e => setDureeS(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Salle</Label>
              <Input placeholder="ex: Amphi A" value={salleS} onChange={e => setSalleS(e.target.value)} defaultValue={memoire.salle ?? ""} />
            </div>
          </div>

          <Separator />

          {/* Jury composition */}
          <div className="space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" />Composer le jury</p>

            {jury.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Membres actuels :</p>
                {jury.map((j: any) => <JuryRow key={j.id} m={j} />)}
              </div>
            )}

            {juryList.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">À ajouter :</p>
                {juryList.map((j, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1"><JuryRow m={j} /></div>
                    <button onClick={() => setJuryList(p => p.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 rounded-lg border border-dashed border-border space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setJuryType("internal")} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${juryType === "internal" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>Enseignant interne</button>
                <button onClick={() => setJuryType("external")} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${juryType === "external" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>Membre externe</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {juryType === "internal" ? (
                  <div className="col-span-2">
                    <Select value={juryUserId} onValueChange={setJuryUserId}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner un enseignant…" /></SelectTrigger>
                      <SelectContent>
                        {(teachers as any[]).map((t: any) => (
                          <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <Input placeholder="Nom complet *" value={juryNom} onChange={e => setJuryNom(e.target.value)} />
                    <Input placeholder="Email (optionnel)" value={juryEmail} onChange={e => setJuryEmail(e.target.value)} />
                  </>
                )}
                <div className="col-span-2">
                  <Select value={juryRole} onValueChange={setJuryRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRESIDENT">Président du jury</SelectItem>
                      <SelectItem value="RAPPORTEUR">Rapporteur</SelectItem>
                      <SelectItem value="EXAMINATEUR">Examinateur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={addJuryMember} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />Ajouter au jury
              </Button>
            </div>
          </div>

          <Button onClick={handlePlanifier} disabled={saving || !["VALIDE", "PLANIFIE"].includes(memoire.statut)} className="w-full gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            {saving ? "Planification…" : "Valider la planification & notifier l'étudiant"}
          </Button>
        </div>
      )}

      {/* ── Section: Résultat ── */}
      {activeSection === "result" && (
        <div className="space-y-4">
          {memoire.statut !== "PLANIFIE" && memoire.statut !== "SOUTENU" && (
            <div className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
              La soutenance doit être planifiée avant de saisir le résultat.
            </div>
          )}

          {memoire.statut === "SOUTENU" && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-800 text-sm">Résultat déjà enregistré</p>
                <p className="text-xs text-emerald-700">{MENTION_LABELS[memoire.mention] ?? "—"}{memoire.note != null ? ` · ${Number(memoire.note).toFixed(2)}/20` : ""}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Mention *</Label>
              <Select value={mention} onValueChange={setMention} defaultValue={memoire.mention ?? ""}>
                <SelectTrigger><SelectValue placeholder="Sélectionner la mention…" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MENTION_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note /20 (optionnelle)</Label>
              <Input type="number" min={0} max={20} step={0.25} placeholder="ex : 14.75" value={note} onChange={e => setNote(e.target.value)} defaultValue={memoire.note ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Observations / appréciations</Label>
              <Textarea placeholder="Remarques du jury…" rows={3} value={observations} onChange={e => setObservations(e.target.value)} defaultValue={memoire.observations ?? ""} />
            </div>
            <Button onClick={handleSaveNote} disabled={saving || !["PLANIFIE", "SOUTENU"].includes(memoire.statut)} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
              {saving ? "Enregistrement…" : "Enregistrer le résultat"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Reject confirmation dialog ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />Refuser ce dossier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              L'étudiant sera notifié par push notification du refus de son dossier. Cette action peut être levée en le resoumettant.
            </p>
            <div className="space-y-1.5">
              <Label>Motif du refus <span className="text-muted-foreground">(optionnel mais recommandé)</span></Label>
              <Textarea
                placeholder="ex : Problème de plagiat, résumé insuffisant, format non conforme…"
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectReason(""); }}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                {saving ? "Refus en cours…" : "Confirmer le refus"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Archive / Library tab ────────────────────────────────────────────────────
function ArchiveTab({ memoires }: { memoires: any[] }) {
  const [search, setSearch] = useState("");
  const [filterMention, setFilterMention] = useState("all");
  const [filterFiliere, setFilterFiliere] = useState("all");
  const [filterAnnee, setFilterAnnee] = useState("all");

  const filieres = [...new Set(memoires.map(m => m.filiere).filter(Boolean))];
  const annees   = [...new Set(memoires.map(m => m.annee_academique).filter(Boolean))];

  const filtered = memoires.filter(m => {
    if (filterMention !== "all" && m.mention !== filterMention) return false;
    if (filterFiliere !== "all" && m.filiere !== filterFiliere) return false;
    if (filterAnnee   !== "all" && m.annee_academique !== filterAnnee) return false;
    if (search && !m.titre.toLowerCase().includes(search.toLowerCase()) && !m.student_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Rechercher titre, étudiant…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterMention} onValueChange={setFilterMention}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Mention" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes mentions</SelectItem>
            {Object.entries(MENTION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterFiliere} onValueChange={setFilterFiliere}>
          <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="Filière" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes filières</SelectItem>
            {filieres.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAnnee} onValueChange={setFilterAnnee}>
          <SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="Année" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes années</SelectItem>
            {annees.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p>Aucun mémoire archivé ne correspond aux critères.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((m: any) => (
            <div key={m.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/20 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{m.titre}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.student_name} · {m.filiere ?? ""} · {m.annee_academique}</p>
                {m.resume && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.resume}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {m.mention && (
                  <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${MENTION_COLORS[m.mention] ?? "bg-gray-500"}`}>
                    {MENTION_LABELS[m.mention] ?? m.mention}
                  </span>
                )}
                {m.note != null && <span className="text-xs text-muted-foreground">{Number(m.note).toFixed(2)}/20</span>}
                {m.fichier_path && (
                  <button
                    onClick={() => downloadFile(m.fichier_path, m.fichier_nom ?? "document")}
                    className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-1">
                    <Download className="w-3 h-3" />Fichier
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PDF Planning des Soutenances ─────────────────────────────────────────────
async function exportSoutenancesPDF() {
  const rows: any[] = await apiFetch("/admin/soutenances-programmees");
  if (!rows.length) { alert("Aucune soutenance planifiée à exporter."); return; }

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(26, 58, 92);
  doc.rect(0, 0, W, 28, "F");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Planning des Soutenances", W / 2, 13, { align: "center" });
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const year = new Date().getFullYear();
  doc.text(`Année ${year}  —  Généré le ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`, W / 2, 21, { align: "center" });

  // Gold separator
  doc.setFillColor(234, 179, 8);
  doc.rect(0, 28, W, 1.5, "F");

  // ── Summary row ──────────────────────────────────────────────────────────
  const nbPlanifie = rows.filter(r => r.statut === "PLANIFIE").length;
  const nbSoutenu  = rows.filter(r => r.statut === "SOUTENU").length;
  doc.setFontSize(8);
  doc.setTextColor(60, 80, 120);
  doc.setFont("helvetica", "italic");
  doc.text(
    `${rows.length} soutenance${rows.length > 1 ? "s" : ""}  ·  Planifiées : ${nbPlanifie}  ·  Soutenues : ${nbSoutenu}`,
    14, 36
  );

  // ── Table ────────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: 40,
    head: [["Date", "Heure", "Durée", "Salle", "Étudiant / Classe", "Filière", "Thème du mémoire", "Membres du jury"]],
    body: rows.map(r => {
      const date = r.date_soutenance
        ? new Date(r.date_soutenance).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
        : "—";
      const juryText = Array.isArray(r.jury) && r.jury.length
        ? r.jury.map((j: any) => `${j.nom} (${ROLE_LABELS[j.role] ?? j.role})`).join("\n")
        : "Non composé";
      const studentInfo = r.class_name ? `${r.student_name}\n${r.class_name}` : r.student_name;
      return [
        date,
        r.heure_debut ?? "—",
        r.duree_minutes ? `${r.duree_minutes} min` : "—",
        r.salle ?? "—",
        studentInfo,
        r.filiere ?? "—",
        r.titre,
        juryText,
      ];
    }),
    headStyles: {
      fillColor: [26, 58, 92],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "left",
    },
    bodyStyles: { fontSize: 7, valign: "top" },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 14 },
      2: { cellWidth: 14 },
      3: { cellWidth: 22 },
      4: { cellWidth: 32 },
      5: { cellWidth: 20 },
      6: { cellWidth: 68 },
      7: { cellWidth: 55 },
    },
    margin: { left: 14, right: 14 },
    styles: { overflow: "linebreak", cellPadding: 2.5 },
    didDrawPage: (d: any) => {
      // Footer on each page
      const pg = d.pageNumber;
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${pg}`, W - 14, 205, { align: "right" });
      doc.text("M15 EduTech — Document confidentiel", 14, 205);
    },
  });

  doc.save(`planning-soutenances-${year}.pdf`);
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function AdminMemoiresPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"submissions" | "archive">("submissions");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterStatut, setFilterStatut] = useState("all");
  const [filterFiliere, setFilterFiliere] = useState("all");
  const [filterAnnee, setFilterAnnee] = useState("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  async function handleExportPDF() {
    setExporting(true);
    try {
      await exportSoutenancesPDF();
    } catch (err: any) {
      toast({ title: "Erreur export", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const { data: memoires = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/memoires"],
    queryFn: () => apiFetch("/admin/memoires"),
  });

  const archived = (memoires as any[]).filter(m => ["SOUTENU", "ARCHIVE"].includes(m.statut));
  const active   = (memoires as any[]).filter(m => !["SOUTENU", "ARCHIVE"].includes(m.statut) || activeTab === "submissions");

  const filieres = [...new Set((memoires as any[]).map(m => m.filiere).filter(Boolean))];
  const annees   = [...new Set((memoires as any[]).map(m => m.annee_academique).filter(Boolean))];

  const displayList = (memoires as any[]).filter(m => {
    if (activeTab === "archive") return ["SOUTENU", "ARCHIVE"].includes(m.statut);
    if (filterStatut !== "all" && m.statut !== filterStatut) return false;
    if (filterFiliere !== "all" && m.filiere !== filterFiliere) return false;
    if (filterAnnee !== "all" && m.annee_academique !== filterAnnee) return false;
    if (search && !m.titre.toLowerCase().includes(search.toLowerCase()) && !m.student_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts: Record<string, number> = {};
  (memoires as any[]).forEach(m => { counts[m.statut] = (counts[m.statut] ?? 0) + 1; });

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
              <GraduationCap className="w-8 h-8 text-primary" />
              Mémoires & Soutenances
            </h1>
            <p className="text-muted-foreground">Gestion complète du processus de soutenance académique.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              disabled={exporting}
              className="gap-1.5"
            >
              {exporting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Export…</>
                : <><Download className="w-3.5 h-3.5" />Planning PDF</>}
            </Button>
            {/* Tabs */}
            <div className="flex rounded-xl border border-border overflow-hidden shadow-sm">
              {([
                { key: "submissions", label: "Soumissions", icon: FileText },
                { key: "archive",     label: "Bibliothèque",   icon: BookOpen },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all ${activeTab === t.key ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}>
                  <t.icon className="w-3.5 h-3.5" />{t.label}
                  {t.key === "submissions" && (memoires as any[]).filter(m => !["SOUTENU","ARCHIVE"].includes(m.statut)).length > 0 && (
                    <span className="ml-1 text-[10px] bg-primary-foreground/20 text-primary-foreground font-bold px-1.5 py-0.5 rounded-full">
                      {(memoires as any[]).filter(m => !["SOUTENU","ARCHIVE"].includes(m.statut)).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI chips (submissions tab) */}
        {activeTab === "submissions" && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUT_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return counts[key] ? (
                <span key={key} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                  <Icon className="w-3 h-3" />{cfg.label} : {counts[key]}
                </span>
              ) : null;
            })}
          </div>
        )}

        {/* Archive tab */}
        {activeTab === "archive" ? (
          <ArchiveTab memoires={archived} />
        ) : (
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            {/* Filters bar */}
            <div className="flex flex-wrap gap-2 p-3 border-b border-border bg-muted/20">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input className="pl-8 h-8 text-sm" placeholder="Rechercher titre, étudiant…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterStatut} onValueChange={setFilterStatut}>
                <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Statut" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  {Object.entries(STATUT_CONFIG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterFiliere} onValueChange={setFilterFiliere}>
                <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Filière" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes filières</SelectItem>
                  {filieres.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAnnee} onValueChange={setFilterAnnee}>
                <SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="Année" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes années</SelectItem>
                  {annees.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
              {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
              ) : displayList.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p>Aucun mémoire ne correspond aux filtres.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Étudiant</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Titre</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Filière</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Année</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Statut</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Soutenance</th>
                      <th className="text-right px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayList.map((m: any) => {
                      const cfg = STATUT_CONFIG[m.statut] ?? STATUT_CONFIG.SOUMIS;
                      const Icon = cfg.icon;
                      return (
                        <tr key={m.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedId(m.id)}>
                          <td className="px-4 py-3 font-medium">{m.student_name}</td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="truncate text-foreground">{m.titre}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{m.filiere ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{m.annee_academique}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                              <Icon className="w-2.5 h-2.5" />{cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {m.date_soutenance ? new Date(m.date_soutenance).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) + (m.heure_debut ? ` · ${m.heure_debut}` : "") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setSelectedId(m.id); }}>
                              <Eye className="w-3.5 h-3.5 mr-1" />Gérer
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {displayList.length > 0 && (
              <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                {displayList.length} mémoire{displayList.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={selectedId !== null} onOpenChange={o => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary" />
              Gestion du mémoire
            </DialogTitle>
          </DialogHeader>
          {selectedId && <MemoireDialog memoireId={selectedId} onClose={() => setSelectedId(null)} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
