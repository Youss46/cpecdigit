import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, useAdminJustifications, useReviewJustification } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Clock, ClipboardList, Pencil, X, Check, ShieldCheck, FileText, HelpCircle, Loader2, BookOpen, Paperclip, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUS_CONFIG = {
  present: { label: "Présent(e)", icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  absent: { label: "Absent(e)", icon: XCircle, cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
  late: { label: "Retard", icon: Clock, cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
} as const;

type EditState = {
  status: string;
  note: string;
  startTime: string;
  endTime: string;
};

function StudentRow({
  r,
  sessionId,
  onSaved,
  canManage,
}: {
  r: any;
  sessionId: number;
  onSaved: () => void;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditState>({
    status: r.status,
    note: r.note ?? "",
    startTime: r.startTime ?? "",
    endTime: r.endTime ?? "",
  });
  const { toast } = useToast();

  const cfg = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.present;
  const Icon = cfg.icon;

  const startEdit = () => {
    setEdit({ status: r.status, note: r.note ?? "", startTime: r.startTime ?? "", endTime: r.endTime ?? "" });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/attendance/sessions/${sessionId}/student/${r.studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: edit.status,
          note: edit.note || null,
          startTime: edit.status !== "present" && edit.startTime ? edit.startTime : null,
          endTime: edit.status !== "present" && edit.endTime ? edit.endTime : null,
        }),
      });
      toast({ title: "Enregistrement mis à jour" });
      setEditing(false);
      onSaved();
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelHours = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/attendance/sessions/${sessionId}/student/${r.studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: null, endTime: null }),
      });
      toast({ title: "Heures d'absence annulées" });
      onSaved();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleJustified = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/attendance/sessions/${sessionId}/student/${r.studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justified: !r.justified }),
      });
      toast({ title: r.justified ? "Absence marquée non justifiée" : "Absence justifiée — déduction supprimée" });
      onSaved();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="px-4 py-3 border-b border-border last:border-0 space-y-2.5 bg-muted/30">
        {/* Name */}
        <span className="text-sm font-semibold text-foreground">{r.studentName}</span>

        {/* Status buttons */}
        <div className="flex flex-wrap gap-1.5">
          {(["present", "absent", "late"] as const).map((s) => {
            const c = STATUS_CONFIG[s];
            const active = edit.status === s;
            return (
              <button
                key={s}
                onClick={() => setEdit(prev => ({ ...prev, status: s }))}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                  active ? c.cls + " border-transparent" : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Time + note (only if not present) */}
        {edit.status !== "present" && (
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <Input
                type="time"
                value={edit.startTime}
                onChange={(e) => setEdit(prev => ({ ...prev, startTime: e.target.value }))}
                className="h-7 text-xs w-28"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">À</span>
              <Input
                type="time"
                value={edit.endTime}
                onChange={(e) => setEdit(prev => ({ ...prev, endTime: e.target.value }))}
                className="h-7 text-xs w-28"
              />
            </div>
            <Input
              value={edit.note}
              onChange={(e) => setEdit(prev => ({ ...prev, note: e.target.value }))}
              placeholder="Motif (optionnel)"
              className="h-7 text-xs w-36"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs px-3">
            <Check className="w-3.5 h-3.5 mr-1" />
            Enregistrer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving} className="h-7 text-xs px-3">
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 gap-2 group">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className="text-sm font-medium truncate">{r.studentName}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {(r.startTime || r.endTime) && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
              {r.startTime && r.endTime
                ? `${r.startTime} → ${r.endTime}`
                : r.startTime
                ? `Dès ${r.startTime}`
                : `Jusqu'à ${r.endTime}`}
            </span>
            <button
              onClick={handleCancelHours}
              disabled={saving}
              title="Annuler les heures"
              className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {r.note && <span className="text-xs text-muted-foreground italic">{r.note}</span>}
        <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
          <Icon className="w-3.5 h-3.5" />
          {cfg.label}
        </span>
        {r.status !== "present" && canManage && (
          <button
            onClick={handleToggleJustified}
            disabled={saving}
            title={r.justified ? "Retirer la justification" : "Marquer comme justifiée"}
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border transition-all ${
              r.justified
                ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-emerald-400 hover:text-emerald-600"
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            {r.justified ? "Justifiée" : "Justifier"}
          </button>
        )}
        {r.status !== "present" && !canManage && r.justified && (
          <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
            <ShieldCheck className="w-3 h-3" />
            Justifiée
          </span>
        )}
        <button
          onClick={startEdit}
          title="Modifier"
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-all flex-shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

const JUST_STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "En attente", color: "bg-amber-100 text-amber-700 border-amber-200", icon: <HelpCircle className="w-3.5 h-3.5" /> },
  approved: { label: "Approuvée",  color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected: { label: "Refusée",    color: "bg-red-100 text-red-700 border-red-200",    icon: <XCircle className="w-3.5 h-3.5" /> },
};

function JustificationsPanel({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "approved" | "rejected">("");
  const [reviewDialog, setReviewDialog] = useState<any | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: justifications = [], isLoading } = useAdminJustifications(
    statusFilter ? { status: statusFilter } : undefined
  );
  const reviewMutation = useReviewJustification();

  const handleReview = async (status: "approved" | "rejected") => {
    if (!reviewDialog) return;
    setSubmitting(true);
    try {
      await reviewMutation.mutateAsync({ id: reviewDialog.id, status, reviewNote: reviewNote.trim() || undefined });
      toast({ title: status === "approved" ? "Justificatif approuvé — absence marquée justifiée." : "Justificatif refusé." });
      qc.invalidateQueries({ queryKey: ["/api/admin/justifications"] });
      setReviewDialog(null);
      setReviewNote("");
    } catch (e: any) {
      toast({ title: e?.message ?? "Erreur", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const jlist = justifications as any[];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {(["", "pending", "approved", "rejected"] as const).map(f => {
          const labels: Record<string, string> = { "": "Tous", pending: "En attente", approved: "Approuvés", rejected: "Refusés" };
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
        <span className="text-xs text-muted-foreground ml-auto">{jlist.length} justificatif{jlist.length > 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Étudiant</TableHead>
                <TableHead>Matière</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Date séance</TableHead>
                <TableHead>Motif</TableHead>
                <TableHead>Statut</TableHead>
                {canManage && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chargement…</TableCell>
                </TableRow>
              ) : jlist.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 opacity-20" />
                      <span>Aucun justificatif pour ce filtre.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                jlist.map((j: any) => {
                  const jcfg = JUST_STATUS_CFG[j.status] ?? JUST_STATUS_CFG.pending;
                  return (
                    <TableRow key={j.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{j.studentName}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5 text-muted-foreground" />{j.subjectName}</span>
                      </TableCell>
                      <TableCell><Badge variant="outline">{j.className}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">{new Date(j.sessionDate).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell className="max-w-[200px] text-sm text-muted-foreground">
                        <span className="truncate block" title={j.reason}>{j.reason}</span>
                        {j.fileUrl && (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 mt-0.5">
                            <Paperclip className="w-3 h-3" />PDF joint
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${jcfg.color} border text-xs gap-1 flex items-center w-fit`}>
                          {jcfg.icon}{jcfg.label}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          {j.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => { setReviewDialog(j); setReviewNote(""); }}
                            >
                              Examiner
                            </Button>
                          )}
                          {j.status !== "pending" && j.reviewNote && (
                            <span className="text-xs italic text-muted-foreground" title={j.reviewNote}>Note: {j.reviewNote.slice(0, 30)}{j.reviewNote.length > 30 ? "…" : ""}</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Review dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={open => { if (!open) { setReviewDialog(null); setReviewNote(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Examiner le justificatif
            </DialogTitle>
          </DialogHeader>
          {reviewDialog && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-semibold text-foreground">{reviewDialog.studentName}</p>
                <p className="text-muted-foreground">{reviewDialog.subjectName} · {new Date(reviewDialog.sessionDate).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Motif de l'étudiant</Label>
                <div className="bg-muted/40 rounded-lg p-3 text-sm text-foreground whitespace-pre-wrap">{reviewDialog.reason}</div>
              </div>
              {reviewDialog.fileUrl && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    Pièce justificative jointe
                  </Label>
                  <a
                    href={reviewDialog.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 transition-colors group"
                  >
                    <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <span className="flex-1">Consulter le document PDF</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
                  </a>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Note de réponse <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                <Textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Commentaire visible par l'étudiant en cas de refus…"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => { setReviewDialog(null); setReviewNote(""); }}>Annuler</Button>
            <Button
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50"
              disabled={submitting}
              onClick={() => handleReview("rejected")}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
              Refuser
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={submitting}
              onClick={() => handleReview("approved")}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Approuver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminAttendance() {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"sessions" | "justifications">("sessions");
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser({ query: { retry: false } } as any);
  const canManage = (currentUser as any)?.adminSubRole === "scolarite" || (currentUser as any)?.adminSubRole === "directeur";

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["/api/admin/attendance/sessions"],
    queryFn: () => apiFetch("/admin/attendance/sessions"),
  });

  const { data: sessionDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["/api/admin/attendance/sessions", selectedSessionId],
    queryFn: () => apiFetch(`/admin/attendance/sessions/${selectedSessionId}`),
    enabled: selectedSessionId !== null,
  });

  const handleRecordSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance/sessions", selectedSessionId] });
  };

  const selectedSession = (sessions as any[]).find((s: any) => s.id === selectedSessionId);
  const absentCount = (sessionDetail?.records ?? []).filter((r: any) => r.status === "absent").length;
  const lateCount = (sessionDetail?.records ?? []).filter((r: any) => r.status === "late").length;
  const presentCount = (sessionDetail?.records ?? []).filter((r: any) => r.status === "present").length;

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="w-8 h-8 text-primary" />
              Feuilles de Présence
            </h1>
            <p className="text-muted-foreground">
              Feuilles transmises par les enseignants à la scolarité.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl border border-border overflow-hidden shadow-sm">
            {([
              { key: "sessions", label: "Séances", icon: <ClipboardList className="w-3.5 h-3.5" /> },
              { key: "justifications", label: "Justificatifs", icon: <FileText className="w-3.5 h-3.5" /> },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "justifications" && <JustificationsPanel canManage={canManage} />}

        {activeTab === "sessions" && <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
            <Table>
              <TableHeader className="bg-secondary/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Enseignant</TableHead>
                  <TableHead>Matière</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Semestre</TableHead>
                  <TableHead>Date du cours</TableHead>
                  <TableHead>Transmis le</TableHead>
                  <TableHead className="text-right">Détail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : (sessions as any[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ClipboardList className="w-8 h-8 opacity-20" />
                        <span>Aucune feuille de présence reçue.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  (sessions as any[]).map((s: any) => (
                    <TableRow key={s.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setSelectedSessionId(s.id)}>
                      <TableCell className="font-medium">{s.teacherName}</TableCell>
                      <TableCell>{s.subjectName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.className}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.semesterName}</TableCell>
                      <TableCell className="font-mono text-sm">{new Date(s.sessionDate).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {s.sentAt ? new Date(s.sentAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedSessionId(s.id); }}>
                          Voir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {(sessions as any[]).length > 0 && (
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {(sessions as any[]).length} feuille{(sessions as any[]).length > 1 ? "s" : ""} reçue{(sessions as any[]).length > 1 ? "s" : ""}
            </div>
          )}
        </div>}

      </div>

      {/* Session Detail Dialog */}
      <Dialog open={selectedSessionId !== null} onOpenChange={(o) => { if (!o) setSelectedSessionId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Feuille de présence
            </DialogTitle>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="py-8 text-center text-muted-foreground">Chargement…</div>
          ) : sessionDetail ? (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Enseignant</p>
                  <p className="font-semibold">{selectedSession?.teacherName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Matière</p>
                  <p className="font-semibold">{selectedSession?.subjectName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Classe</p>
                  <p className="font-semibold">{selectedSession?.className ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date du cours</p>
                  <p className="font-semibold font-mono">
                    {selectedSession?.sessionDate
                      ? new Date(selectedSession.sessionDate).toLocaleDateString("fr-FR")
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  {presentCount} présent{presentCount > 1 ? "s" : ""}
                </span>
                {absentCount > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                    {absentCount} absent{absentCount > 1 ? "s" : ""}
                  </span>
                )}
                {lateCount > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    {lateCount} en retard
                  </span>
                )}
              </div>

              {/* Records */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-y-auto max-h-72">
                  {(sessionDetail.records ?? []).map((r: any) => (
                    <StudentRow
                      key={r.studentId}
                      r={r}
                      sessionId={selectedSessionId!}
                      onSaved={handleRecordSaved}
                      canManage={canManage}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
