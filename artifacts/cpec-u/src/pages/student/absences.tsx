import { AppLayout } from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMyJustifications, useSubmitJustification } from "@workspace/api-client-react";
import { CalendarOff, Clock, CheckCircle2, XCircle, AlertTriangle, BookOpen, FileText, Loader2, HelpCircle, Paperclip, X as XIcon } from "lucide-react";

function useMyAttendance() {
  return useQuery({
    queryKey: ["/api/student/attendance/my"],
    queryFn: async () => {
      const res = await fetch("/api/student/attendance/my", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur chargement absences");
      return res.json();
    },
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  absent: { label: "Absent", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="w-3.5 h-3.5" /> },
  late:   { label: "Retard",  color: "bg-amber-100 text-amber-700 border-amber-200", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  present:{ label: "Présent", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

const JUST_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "En attente",  color: "bg-amber-100 text-amber-700 border-amber-200", icon: <HelpCircle className="w-3 h-3" /> },
  approved: { label: "Approuvée",   color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "Refusée",     color: "bg-red-100 text-red-700 border-red-200",    icon: <XCircle className="w-3 h-3" /> },
};

function calcHours(r: any): number {
  if (r.startTime && r.endTime) {
    const [sh, sm] = r.startTime.split(":").map(Number);
    const [eh, em] = r.endTime.split(":").map(Number);
    return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  }
  return 1;
}

export default function StudentAbsences() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useMyAttendance();
  const { data: justifications = [] } = useMyJustifications();
  const submitJust = useSubmitJustification();
  const [filter, setFilter] = useState<"all" | "absent" | "late" | "present">("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [justDialog, setJustDialog] = useState<{ attendanceId: number; subjectName: string; sessionDate: string } | null>(null);
  const [reason, setReason] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const records: any[] = data?.records ?? [];
  const summary = data?.summary;

  // Map attendanceId → justification
  const justMap = new Map<number, any>((justifications as any[]).map((j: any) => [j.attendanceId, j]));

  const semesters = Array.from(new Map(records.map(r => [String(r.semesterId), r.semesterName])).entries());

  const filtered = records.filter(r =>
    (filter === "all" || r.status === filter) &&
    (semesterFilter === "all" || String(r.semesterId) === semesterFilter)
  );

  const subjectStats = useMemo(() => {
    const map = new Map<string, { total: number; present: number; absent: number; late: number }>();
    records.forEach(r => {
      if (!map.has(r.subjectName)) map.set(r.subjectName, { total: 0, present: 0, absent: 0, late: 0 });
      const s = map.get(r.subjectName)!;
      s.total++;
      if (r.status === "present") s.present++;
      else if (r.status === "absent") s.absent++;
      else if (r.status === "late") s.late++;
    });
    return Array.from(map.entries())
      .map(([name, s]) => ({ name, ...s, rate: s.total > 0 ? Math.round(((s.present + s.late * 0.5) / s.total) * 100) : 100 }))
      .sort((a, b) => a.rate - b.rate);
  }, [records]);

  const statCards = [
    {
      label: "Heures d'absence",
      value: summary ? `${summary.totalAbsenceHours}h` : "—",
      sub: summary ? `${summary.totalAbsences} séance${summary.totalAbsences > 1 ? "s" : ""}` : "",
      icon: <CalendarOff className="w-5 h-5 text-red-500" />,
      bg: "bg-red-50",
      border: "border-red-100",
    },
    {
      label: "Absences justifiées",
      value: summary ? `${summary.justifiedHours}h` : "—",
      sub: "heures justifiées",
      icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
      bg: "bg-green-50",
      border: "border-green-100",
    },
    {
      label: "Absences non justifiées",
      value: summary ? `${summary.unjustifiedHours}h` : "—",
      sub: "heures non justifiées",
      icon: <XCircle className="w-5 h-5 text-red-500" />,
      bg: "bg-red-50",
      border: "border-red-100",
    },
    {
      label: "Retards",
      value: summary ? String(summary.totalLate) : "—",
      sub: "séances avec retard",
      icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
      bg: "bg-amber-50",
      border: "border-amber-100",
    },
  ];

  const resetDialog = () => {
    setJustDialog(null);
    setReason("");
    setPdfFile(null);
    setUploadedFileUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenJust = (r: any) => {
    setReason("");
    setPdfFile(null);
    setUploadedFileUrl(null);
    setJustDialog({ attendanceId: r.id, subjectName: r.subjectName, sessionDate: r.sessionDate });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Seuls les fichiers PDF sont acceptés.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Le fichier ne doit pas dépasser 10 Mo.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    setPdfFile(file);
    setPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/student/justifications/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur upload");
      setUploadedFileUrl(data.fileUrl);
    } catch (err: any) {
      toast({ title: err.message ?? "Erreur lors de l'upload du fichier.", variant: "destructive" });
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setPdfUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!justDialog || !reason.trim()) {
      toast({ title: "Veuillez saisir une raison.", variant: "destructive" }); return;
    }
    if (pdfUploading) {
      toast({ title: "Veuillez attendre la fin du chargement du fichier.", variant: "destructive" }); return;
    }
    try {
      await submitJust.mutateAsync({
        attendanceId: justDialog.attendanceId,
        reason: reason.trim(),
        fileUrl: uploadedFileUrl ?? undefined,
      } as any);
      toast({ title: "Justificatif envoyé — en attente de validation par la scolarité." });
      qc.invalidateQueries({ queryKey: ["/api/student/justifications"] });
      resetDialog();
    } catch (e: any) {
      const msg = e?.message ?? "Erreur lors de l'envoi";
      toast({ title: msg, variant: "destructive" });
    }
  };

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold font-serif text-foreground">Mes Absences</h1>
          <p className="text-muted-foreground text-sm mt-1">Historique de vos présences et absences par séance</p>
        </motion.div>

        {/* Summary cards */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          {statCards.map((s, i) => (
            <Card key={i} className={`border ${s.border} shadow-sm`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
                  <p className="text-xl font-bold text-foreground leading-tight">{s.value}</p>
                  {s.sub && <p className="text-xs text-muted-foreground truncate">{s.sub}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Taux de présence par matière */}
        {subjectStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="space-y-3"
          >
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              Taux de présence par matière
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjectStats.map((s) => {
                const color = s.rate >= 80 ? "text-emerald-600" : s.rate >= 60 ? "text-amber-600" : "text-red-600";
                const barColor = s.rate >= 80 ? "bg-emerald-500" : s.rate >= 60 ? "bg-amber-500" : "bg-red-500";
                const bg = s.rate >= 80 ? "border-emerald-100" : s.rate >= 60 ? "border-amber-100" : "border-red-100";
                return (
                  <div key={s.name} className={`bg-card border rounded-xl px-4 py-3 space-y-2 ${bg}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground leading-tight flex-1">{s.name}</p>
                      <span className={`text-sm font-bold shrink-0 ${color}`}>{s.rate}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${s.rate}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.present} présent{s.present > 1 ? "s" : ""} · {s.absent} absent{s.absent > 1 ? "s" : ""}
                      {s.late > 0 ? ` · ${s.late} retard${s.late > 1 ? "s" : ""}` : ""} sur {s.total} séance{s.total > 1 ? "s" : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Filters */}
        <motion.div
          className="flex flex-wrap gap-3 items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <Select value={semesterFilter} onValueChange={setSemesterFilter}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Tous les semestres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les semestres</SelectItem>
              {semesters.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-1.5">
            {([
              { key: "all", label: "Tout" },
              { key: "absent", label: "Absences" },
              { key: "late", label: "Retards" },
              { key: "present", label: "Présences" },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  filter === f.key
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} séance{filtered.length > 1 ? "s" : ""}</span>
        </motion.div>

        {/* Records table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Chargement…</div>
          ) : filtered.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-16 text-center">
                <CalendarOff className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium text-foreground">Aucune séance trouvée</p>
                <p className="text-sm text-muted-foreground mt-1">Aucune donnée pour ce filtre</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
              <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b border-border bg-muted/40">
                    {["Date", "Matière", "Semestre", "Horaire", "Statut", "Justificatif", "Remarque"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any, i: number) => {
                    const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.present;
                    const hours = (r.status === "absent" || r.status === "late") ? calcHours(r) : null;
                    const justification = justMap.get(r.id);
                    const canJustify = (r.status === "absent" || r.status === "late") && (!justification || justification.status === "rejected");
                    const justCfg = justification ? JUST_STATUS[justification.status] : null;

                    return (
                      <tr key={r.id} className={`border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {new Date(r.sessionDate).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium text-foreground">{r.subjectName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.semesterName}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {r.startTime && r.endTime ? (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />{r.startTime} – {r.endTime}
                              {hours !== null && <span className="ml-1 text-xs font-semibold text-red-600">({hours}h)</span>}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${cfg.color} border text-xs gap-1 flex items-center w-fit`}>
                            {cfg.icon}{cfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 min-w-[160px]">
                          {r.status === "absent" || r.status === "late" ? (
                            <div className="flex flex-col gap-1">
                              {r.justified && (
                                <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />Justifiée
                                </span>
                              )}
                              {justCfg && !r.justified && (
                                <Badge className={`${justCfg.color} border text-xs gap-1 flex items-center w-fit`}>
                                  {justCfg.icon}{justCfg.label}
                                </Badge>
                              )}
                              {canJustify && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 w-fit"
                                  onClick={() => handleOpenJust(r)}
                                >
                                  <FileText className="w-3 h-3" />
                                  {justification?.status === "rejected" ? "Soumettre à nouveau" : "Soumettre"}
                                </Button>
                              )}
                              {!justification && !canJustify && !r.justified && (
                                <span className="text-muted-foreground text-xs italic">—</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                          {justification?.reviewNote
                            ? <span className="italic text-red-500">{justification.reviewNote}</span>
                            : (r.note ?? "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Justification dialog */}
      <Dialog open={!!justDialog} onOpenChange={open => { if (!open) resetDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Soumettre un justificatif
            </DialogTitle>
          </DialogHeader>
          {justDialog && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-semibold text-foreground">{justDialog.subjectName}</p>
                <p className="text-muted-foreground">
                  {new Date(justDialog.sessionDate).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Motif de l'absence <span className="text-destructive">*</span></Label>
                <Textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Expliquez la raison de votre absence (maladie, problème familial, etc.)"
                  rows={4}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  Pièce justificative PDF <span className="text-muted-foreground text-xs font-normal">(optionnel · max 10 Mo)</span>
                </Label>
                {!pdfFile ? (
                  <div
                    className="border-2 border-dashed border-border rounded-lg px-4 py-3 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Cliquez pour joindre un fichier PDF</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    {pdfUploading ? (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    )}
                    <span className="text-sm text-blue-700 flex-1 truncate">{pdfFile.name}</span>
                    {pdfUploading ? (
                      <span className="text-xs text-blue-500">Chargement…</span>
                    ) : uploadedFileUrl ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : null}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive ml-1"
                      onClick={() => { setPdfFile(null); setUploadedFileUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">La scolarité examinera votre demande et vous notifiera de sa décision.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={submitJust.isPending || !reason.trim() || pdfUploading}>
              {submitJust.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Envoi…</> : "Soumettre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
