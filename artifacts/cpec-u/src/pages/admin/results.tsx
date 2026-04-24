import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import {
  useListSemesters, useListClasses, useGetSemesterResults,
  useGetCurrentUser, usePublishSemesterResults,
} from "@workspace/api-client-react";
import {
  useListSubjectApprovals, useApproveSubject, useUnapproveSubject, useDerogateGrade,
  useGetPendingGradeSubmissions,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Search, CheckCircle, Lock, Unlock, FileEdit, Globe, GlobeLock, Users, GraduationCap, ChevronDown, ChevronUp, AlertTriangle, XCircle, Eye, Send, RefreshCw } from "lucide-react";
import { downloadBulletinPdf, downloadResultatsClassePdf } from "@/lib/pdf-engine/documents";

export default function AdminResults() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const adminSubRole = (currentUser as any)?.adminSubRole;
  const isScolarite = adminSubRole === "scolarite" || adminSubRole === "directeur";

  const { data: semesters, isLoading: semestersLoading } = useListSemesters();
  const { data: classes } = useListClasses();

  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [searchStudent, setSearchStudent] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggleRow = (id: number) => setExpandedRows(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // Fetch all pending submissions across ALL semesters (used for auto-selection priority)
  const { data: allPendingRaw = [] } = useGetPendingGradeSubmissions(
    undefined,
    { enabled: isScolarite } as any
  );
  const semesterIdsWithPending = useMemo(() => {
    const s = new Set<number>();
    (allPendingRaw as any[]).forEach((sub: any) => { if (sub.semesterId) s.add(sub.semesterId); });
    return s;
  }, [allPendingRaw]);

  // Auto-select semester on first load using priority logic
  useEffect(() => {
    if (!semesters || (semesters as any[]).length === 0 || selectedSemester) return;
    const semList = [...(semesters as any[])].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    // Priority 1: unpublished + has pending submissions
    const withPendingUnpublished = semList.find((s: any) => !s.published && semesterIdsWithPending.has(s.id));
    if (withPendingUnpublished) { setSelectedSemester(String(withPendingUnpublished.id)); return; }
    // Priority 2: any unpublished (most recent)
    const unpublished = semList.find((s: any) => !s.published);
    if (unpublished) { setSelectedSemester(String(unpublished.id)); return; }
    // Priority 3: most recent overall
    if (semList.length > 0) setSelectedSemester(String(semList[0].id));
  }, [semesters, semesterIdsWithPending, selectedSemester]);

  // Sync: semester → auto-select its class
  useEffect(() => {
    if (!selectedSemester || !semesters || (semesters as any[]).length === 0) return;
    const sem = (semesters as any[]).find((s: any) => String(s.id) === selectedSemester);
    if (sem?.classId) {
      const newClass = String(sem.classId);
      if (selectedClass !== newClass) setSelectedClass(newClass);
    }
  }, [selectedSemester, semesters]);

  // Sync: class → auto-select best semester for that class
  useEffect(() => {
    if (!selectedClass || selectedClass === "all" || !semesters || (semesters as any[]).length === 0) return;
    const classSems = (semesters as any[])
      .filter((s: any) => String(s.classId) === selectedClass)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (classSems.length === 0) return;
    // Keep current semester if it already belongs to this class
    if (classSems.some((s: any) => String(s.id) === selectedSemester)) return;
    // Otherwise auto-select: priority unpublished+pending > unpublished > most recent
    const withPending = classSems.find((s: any) => !s.published && semesterIdsWithPending.has(s.id));
    const unpublished = classSems.find((s: any) => !s.published);
    const best = withPending ?? unpublished ?? classSems[0];
    setSelectedSemester(String(best.id));
  }, [selectedClass, semesters, semesterIdsWithPending]);

  // All semesters always visible (no filtering by class)
  const filteredSemesters = useMemo(() => {
    return (semesters as any[]) ?? [];
  }, [semesters]);

  // Classes filtered by selected semester (when a semester is selected, only show its class)
  const filteredClasses = useMemo(() => {
    const classList = (classes as any[]) ?? [];
    if (!selectedSemester) return classList;
    const sem = (semesters as any[])?.find((s: any) => String(s.id) === selectedSemester);
    if (!sem?.classId) return classList;
    return classList.filter((c: any) => c.id === sem.classId);
  }, [classes, semesters, selectedSemester]);

  const { data: results = [], isLoading } = useGetSemesterResults(
    selectedSemester ? parseInt(selectedSemester) : 0,
    { classId: selectedClass !== "all" ? parseInt(selectedClass) : undefined },
    { query: { enabled: !!selectedSemester } as any }
  );

  const { data: pendingSubmissions = [] } = useGetPendingGradeSubmissions(
    selectedSemester ? { semesterId: parseInt(selectedSemester) } : undefined,
    { enabled: !!selectedSemester && isScolarite } as any
  );

  const { data: approvals = [] } = useListSubjectApprovals(
    selectedSemester
      ? { semesterId: parseInt(selectedSemester), ...(selectedClass !== "all" ? { classId: parseInt(selectedClass) } : {}) }
      : undefined,
    { enabled: !!selectedSemester }
  );

  const approveSubject = useApproveSubject();
  const unapproveSubject = useUnapproveSubject();
  const derogateGrade = useDerogateGrade();
  const publishMutation = usePublishSemesterResults();
  const [derogationTarget, setDerogationTarget] = useState<{
    studentId: number; studentName: string; semesterId: number;
    grades: { subjectId: number; subjectName: string; value: number | null }[];
    selectedSubjectId: string;
  } | null>(null);
  const [derogationValue, setDerogationValue] = useState("");
  const [derogationJustification, setDerogationJustification] = useState("");

  const [previewSubject, setPreviewSubject] = useState<{
    subjectId: number; subjectName: string; classId: number; className: string;
  } | null>(null);

  const { data: liveSubjectGrades = [], isFetching: isPreviewLoading } = useQuery<
    { studentId: number; studentName: string; value: number | null; evaluations: { n: number; v: number }[] }[]
  >({
    queryKey: ["/api/admin/subject-grades", previewSubject?.subjectId, previewSubject?.classId, selectedSemester],
    queryFn: async () => {
      if (!previewSubject || !selectedSemester) return [];
      const qs = new URLSearchParams({
        subjectId: String(previewSubject.subjectId),
        classId: String(previewSubject.classId),
        semesterId: selectedSemester,
      });
      const res = await fetch(`/api/admin/subject-grades?${qs}`);
      if (!res.ok) throw new Error("Erreur lors du chargement des notes.");
      return res.json();
    },
    enabled: !!previewSubject && !!selectedSemester,
    staleTime: 0,
  });

  const previewGrades = liveSubjectGrades;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/results"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/subject-approvals"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/semesters"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/alertes/resume"] });
  };

  const currentSemester = (semesters as any[])?.find((s: any) => s.id === parseInt(selectedSemester));
  const isPublished = currentSemester?.published ?? false;
  const currentClass = (classes as any[])?.find((c: any) => String(c.id) === selectedClass);
  const approvedSet = useMemo(() => {
    const s = new Set<string>();
    (approvals as any[]).forEach((a) => s.add(`${a.subjectId}-${a.classId}`));
    return s;
  }, [approvals]);

  // Unique subject+class combos from results for approval panel
  const subjectCombos = useMemo(() => {
    const map = new Map<string, { subjectId: number; subjectName: string; classId: number; className: string }>();
    (results as any[]).forEach((r) => {
      (r.grades ?? []).forEach((g: any) => {
        const key = `${g.subjectId}-${r.classId}`;
        if (!map.has(key)) map.set(key, { subjectId: g.subjectId, subjectName: g.subjectName, classId: r.classId ?? 0, className: r.className });
      });
    });
    return Array.from(map.values());
  }, [results]);

  const handleApprove = async (subjectId: number, classId: number) => {
    if (!selectedSemester) return;
    try {
      await approveSubject.mutateAsync({ subjectId, classId, semesterId: parseInt(selectedSemester) });
      toast({ title: "Notes approuvées — la matière est verrouillée pour l'enseignant." });
      invalidate();
    } catch (e: any) {
      toast({ title: e?.message ?? "Erreur", variant: "destructive" });
    }
  };

  const handleUnapprove = async (subjectId: number, classId: number) => {
    const approval = (approvals as any[]).find((a) => a.subjectId === subjectId && a.classId === classId);
    if (!approval) return;
    try {
      await unapproveSubject.mutateAsync({ id: approval.id });
      toast({ title: "Approbation annulée — l'enseignant peut à nouveau modifier les notes." });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleDerogate = async () => {
    if (!derogationTarget || !derogationValue || !derogationJustification.trim()) {
      toast({ title: "Tous les champs sont obligatoires.", variant: "destructive" });
      return;
    }
    const val = parseFloat(derogationValue);
    if (isNaN(val) || val < 0 || val > 20) {
      toast({ title: "La note doit être entre 0 et 20.", variant: "destructive" });
      return;
    }
    const subjectId = parseInt(derogationTarget.selectedSubjectId);
    try {
      await derogateGrade.mutateAsync({
        studentId: derogationTarget.studentId,
        subjectId,
        semesterId: derogationTarget.semesterId,
        value: val,
        justification: derogationJustification,
      });
      toast({ title: "Dérogation enregistrée dans le journal d'activité." });
      setDerogationTarget(null);
      setDerogationValue("");
      setDerogationJustification("");
      invalidate();
    } catch {
      toast({ title: "Erreur lors de la dérogation.", variant: "destructive" });
    }
  };

  const handlePublish = async (pub: boolean) => {
    if (!selectedSemester) return;
    try {
      await publishMutation.mutateAsync({ id: parseInt(selectedSemester), data: { published: pub } });
      toast({ title: pub ? "Résultats publiés — visibles par les étudiants." : "Résultats dépubliés." });
      invalidate();
    } catch {
      toast({ title: "Erreur lors de la publication.", variant: "destructive" });
    }
  };

  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const handleDownloadPDF = async (studentId: number, semesterId: number, _studentName: string) => {
    const key = `bulletin-${studentId}-${semesterId}`;
    setPdfLoadingId(key);
    try {
      await downloadBulletinPdf(studentId, semesterId);
    } catch (e: any) {
      toast({ title: "Erreur PDF", description: e.message, variant: "destructive" });
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleDownloadClassPDF = async () => {
    if (!selectedSemester || selectedClass === "all") return;
    const cls = (classes as any[])?.find((c: any) => c.id === parseInt(selectedClass));
    const sem = (semesters as any[])?.find((s: any) => s.id === parseInt(selectedSemester));
    setPdfLoadingId("class-results");
    try {
      await downloadResultatsClassePdf(parseInt(selectedSemester), sem?.name ?? "Semestre", parseInt(selectedClass), cls?.name ?? "Classe");
    } catch (e: any) {
      toast({ title: "Erreur PDF", description: e.message, variant: "destructive" });
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleExportCSV = () => {
    if (!(results as any[]).length) return;
    const sem = (semesters as any[])?.find((s: any) => s.id === parseInt(selectedSemester));
    const semLabel = sem ? `${sem.name} ${sem.academicYear}` : "resultats";

    // Collect all unique subjects across all students (for per-subject columns)
    const subjectMap = new Map<number, string>();
    (results as any[]).forEach((r: any) => {
      (r.grades ?? []).forEach((g: any) => { if (!subjectMap.has(g.subjectId)) subjectMap.set(g.subjectId, g.subjectName); });
    });
    const subjects = Array.from(subjectMap.entries()); // [[id, name], ...]

    // Build header row
    const headerBase = ["Rang", "Nom de l'étudiant", "Classe", "Moyenne brute", "Déduction absences", "Moyenne nette", "Décision"];
    const headerSubjects = subjects.map(([, name]) => name);
    const header = [...headerBase, ...headerSubjects];

    // Build data rows (sorted by rank then name)
    const sorted = [...(results as any[])].sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.studentName.localeCompare(b.studentName, "fr");
    });

    const rows = sorted.map((r: any) => {
      const moyBrute = r.absenceDeduction != null && r.average != null
        ? (r.average + r.absenceDeduction).toFixed(2)
        : r.average != null ? r.average.toFixed(2) : "";
      const moyNette = r.average != null ? r.average.toFixed(2) : "";
      const deduction = r.absenceDeduction > 0 ? `-${r.absenceDeduction.toFixed(2)}` : "0";
      const rang = r.rank != null ? `${r.rank}/${r.totalStudents}` : "—";
      const base = [rang, r.studentName, r.className ?? "", moyBrute, deduction, moyNette, r.decision ?? "—"];
      const gradesBySubject = subjects.map(([id]) => {
        const g = (r.grades ?? []).find((g: any) => g.subjectId === id);
        return g?.value != null ? g.value.toFixed(2) : "—";
      });
      return [...base, ...gradesBySubject];
    });

    // Encode to CSV with ; delimiter + UTF-8 BOM for Excel
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csvLines = [header, ...rows].map(row => row.map(escape).join(";"));
    const bom = "\uFEFF";
    const csvContent = bom + csvLines.join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resultats_${semLabel.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Résultats Académiques</h1>
            <p className="text-muted-foreground">
              {isScolarite
                ? "Approuvez les notes, gérez les dérogations et publiez les résultats."
                : "Visualisez les moyennes par semestre."}
            </p>
          </div>
          {/* Publication toggle — scolarité only */}
          {isScolarite && selectedSemester && (
            <div className="flex items-center gap-3 bg-card border rounded-2xl px-5 py-3 shadow-sm shrink-0">
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {isPublished ? "Résultats publiés" : "Non publiés"}
                </p>
                <p className="text-xs text-muted-foreground">Visibles par les étudiants</p>
              </div>
              <Switch
                checked={isPublished}
                onCheckedChange={handlePublish}
                disabled={publishMutation.isPending}
                className="data-[state=checked]:bg-emerald-500"
              />
              {isPublished ? <Globe className="w-5 h-5 text-emerald-500" /> : <GlobeLock className="w-5 h-5 text-muted-foreground" />}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground">Semestre</label>
            <Select value={selectedSemester} onValueChange={setSelectedSemester}>
              <SelectTrigger>
                <SelectValue placeholder={semestersLoading ? "Chargement…" : "Choisir un semestre"} />
              </SelectTrigger>
              <SelectContent>
                {filteredSemesters.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">Aucun semestre pour cette classe</div>
                ) : (
                  [...filteredSemesters].sort((a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  ).map((s: any) => {
                    const hasPending = semesterIdsWithPending.has(s.id);
                    return (
                      <SelectItem key={s.id} value={String(s.id)}>
                        <span className="flex items-center gap-2">
                          {s.name} ({s.academicYear})
                          {!s.published && hasPending && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full leading-none">
                              ★ Notes en attente
                            </span>
                          )}
                          {s.published && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full leading-none">
                              ✓ Publié
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground">Classe</label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {filteredClasses.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI stats — visible quand un semestre est sélectionné */}
        {selectedSemester && isScolarite && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: "En attente de validation",
                value: (pendingSubmissions as any[]).length,
                sub: "notes soumises non approuvées",
                color: (pendingSubmissions as any[]).length > 0 ? "text-amber-600" : "text-muted-foreground",
                bg: (pendingSubmissions as any[]).length > 0 ? "bg-amber-50 border-amber-200" : "bg-card border-border",
              },
              {
                label: "Approuvées",
                value: (approvals as any[]).length,
                sub: "matières validées et verrouillées",
                color: "text-emerald-600",
                bg: "bg-card border-border",
              },
              {
                label: "Total soumis",
                value: (pendingSubmissions as any[]).length + (approvals as any[]).length,
                sub: "soumissions enseignants reçues",
                color: "text-blue-600",
                bg: "bg-card border-border",
              },
              {
                label: "Publication",
                value: isPublished ? "Publié" : "Non publié",
                sub: isPublished ? "Visible par les étudiants" : "Invisible pour les étudiants",
                color: isPublished ? "text-emerald-600" : "text-muted-foreground",
                bg: isPublished ? "bg-emerald-50 border-emerald-200" : "bg-card border-border",
              },
            ].map((kpi) => (
              <div key={kpi.label} className={`border rounded-2xl p-4 ${kpi.bg}`}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{kpi.label}</p>
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>
        )}

        {selectedSemester ? (
          <>
            {/* Approval panel — scolarité only, shown when pending submissions exist */}
            {isScolarite && (pendingSubmissions as any[]).length > 0 && (
              <div className="bg-card border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-amber-50/60 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-amber-500" />
                      Validation des Notes par Matière
                      <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-amber-500 text-white rounded-full">
                        {(pendingSubmissions as any[]).length}
                      </span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Un enseignant a soumis ses notes pour validation. Approuver verrouille la saisie.
                    </p>
                  </div>
                </div>
                <div className="divide-y">
                  {(pendingSubmissions as any[]).map((submission: any) => {
                    const { subjectId, subjectName, classId, className, teacherName, submittedAt } = submission;
                    const key = `${subjectId}-${classId}`;
                    const approved = approvedSet.has(key);
                    const approval = (approvals as any[]).find((a) => a.subjectId === subjectId && a.classId === classId);
                    return (
                      <div key={key} className="flex items-start sm:items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors gap-4 flex-col sm:flex-row">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">{subjectName}</span>
                            <span className="text-xs text-muted-foreground">— {className}</span>
                          </div>
                          <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                            <Send className="w-3 h-3 inline shrink-0" />
                            Soumis par <strong className="ml-0.5">{teacherName}</strong> le {new Date(submittedAt).toLocaleDateString("fr-FR", { dateStyle: "long" })}
                          </p>
                          {approved && (
                            <p className="text-xs text-emerald-600 mt-0.5">
                              ✓ Approuvé par {approval?.approvedByName} · {new Date(approval?.approvedAt).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setPreviewSubject({ subjectId, subjectName, classId, className })}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1.5" />Voir les notes
                          </Button>
                          <Button
                            size="sm"
                            variant={approved ? "outline" : "default"}
                            className={approved ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                            onClick={() => approved ? handleUnapprove(subjectId, classId) : handleApprove(subjectId, classId)}
                            disabled={approveSubject.isPending || unapproveSubject.isPending}
                          >
                            {approved
                              ? <><Unlock className="w-3 h-3 mr-1.5" />Déverrouiller</>
                              : <><Lock className="w-3 h-3 mr-1.5" />Approuver</>}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Results table */}
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              {/* Table toolbar */}
              {(results as any[]).length > 0 && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-3 border-b bg-muted/30">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Rechercher un étudiant..."
                      value={searchStudent}
                      onChange={e => setSearchStudent(e.target.value)}
                      className="h-8 w-52 text-sm"
                    />
                    {searchStudent && (
                      <button onClick={() => setSearchStudent("")} className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">
                        Effacer
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">{(results as any[]).length}</span> étudiant{(results as any[]).length > 1 ? "s" : ""}
                      {currentClass ? ` · ${currentClass.name}` : ""}
                    </p>
                    {isScolarite && (
                      <div className="flex items-center gap-2">
                        {selectedClass !== "all" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-primary border-primary/40 hover:bg-primary/5"
                            onClick={handleDownloadClassPDF}
                            disabled={pdfLoadingId === "class-results"}
                          >
                            {pdfLoadingId === "class-results" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Résultats PDF classe
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          onClick={handleExportCSV}
                        >
                          <Download className="w-4 h-4" />
                          Exporter CSV
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    <TableHead>Étudiant</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead className="text-center">Moyenne</TableHead>
                    <TableHead className="text-center">Rang</TableHead>
                    <TableHead className="text-center">Décision</TableHead>
                    {isScolarite && <TableHead className="text-center">Dérogation</TableHead>}
                    <TableHead className="text-right">Bulletin PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12">Calcul des résultats en cours...</TableCell></TableRow>
                  ) : (results as any[]).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12">Aucun résultat trouvé pour cette sélection.</TableCell></TableRow>
                  ) : (
                    (results as any[]).filter((r: any) => !searchStudent || r.studentName.toLowerCase().includes(searchStudent.toLowerCase())).map((res) => {
                      const isExpanded = expandedRows.has(res.studentId);
                      const failedUes: any[] = res.failedUes ?? [];
                      const hasFailure = res.decision === "Ajourné" && (failedUes.length > 0 || res.averageFailed);
                      return (<>
                      <TableRow key={res.studentId} className={`hover:bg-muted/50 ${hasFailure ? "cursor-pointer" : ""}`} onClick={() => hasFailure && toggleRow(res.studentId)}>
                        <TableCell className="font-bold">
                          <div className="flex items-center gap-1.5">
                            {hasFailure && (isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />)}
                            {res.studentName}
                          </div>
                        </TableCell>
                        <TableCell>{res.className}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-mono font-bold text-lg block ${
                            res.average === null ? "text-muted-foreground" :
                            res.average >= 10 ? "text-emerald-600" : "text-destructive"
                          }`}>
                            {res.average !== null ? res.average?.toFixed(2) : "—"}
                          </span>
                          {res.absenceDeduction > 0 && (
                            <span className="text-xs text-red-500 font-medium" title={`${res.absenceDeductionHours}h d'absence × 0,1`}>
                              −{res.absenceDeduction.toFixed(2)} absences
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {res.rank ? `${res.rank} / ${res.totalStudents}` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {res.decision === "Admis" && <Badge className="bg-emerald-500 hover:bg-emerald-600">Admis</Badge>}
                          {res.decision === "Ajourné" && <Badge variant="destructive">Ajourné</Badge>}
                          {res.decision === "En attente" && <Badge variant="secondary">En attente</Badge>}
                        </TableCell>
                        {isScolarite && (
                          <TableCell className="text-center">
                            <Button
                              variant="ghost" size="sm"
                              className="text-amber-600 hover:bg-amber-50"
                              onClick={() => {
                                const grades = (res.grades ?? []).map((g: any) => ({
                                  subjectId: g.subjectId, subjectName: g.subjectName, value: g.value,
                                }));
                                setDerogationTarget({
                                  studentId: res.studentId,
                                  studentName: res.studentName,
                                  semesterId: res.semesterId,
                                  grades,
                                  selectedSubjectId: grades[0]?.subjectId ? String(grades[0].subjectId) : "",
                                });
                                setDerogationValue("");
                                setDerogationJustification("");
                              }}
                            >
                              <FileEdit className="w-3.5 h-3.5 mr-1.5" />Dérogation
                            </Button>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {isScolarite ? (
                            <Button
                              variant="outline" size="sm"
                              className="border-primary text-primary hover:bg-primary hover:text-white transition-colors"
                              onClick={() => handleDownloadPDF(res.studentId, res.semesterId, res.studentName)}
                              disabled={pdfLoadingId === `bulletin-${res.studentId}-${res.semesterId}`}
                            >
                              {pdfLoadingId === `bulletin-${res.studentId}-${res.semesterId}` ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}PDF
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Réservé Scolarité</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {/* Rule 5: Expanded failure detail row */}
                      {hasFailure && isExpanded && (
                        <TableRow key={`${res.studentId}-detail`} className="bg-red-50/60 border-b border-red-100">
                          <TableCell colSpan={isScolarite ? 7 : 6} className="py-3 px-6">
                            <div className="flex flex-wrap gap-4 items-start">
                              <div className="flex items-center gap-1.5 text-destructive font-semibold text-xs uppercase tracking-wide pt-0.5">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                Motifs d'ajournement :
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {failedUes.map((ue: any) => (
                                  <span key={ue.ueId} className="inline-flex items-center gap-1.5 bg-white border border-red-200 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full shadow-sm">
                                    <XCircle className="w-3 h-3 shrink-0" />
                                    {ue.ueCode ? `${ue.ueCode} – ` : ""}{ue.ueName}
                                    <span className="font-bold ml-0.5">{ue.average?.toFixed(2)}/20</span>
                                    {ue.eliminatorySubjectName ? (
                                      <span className="text-red-500 font-semibold">⚠ Note éliminatoire : {ue.eliminatorySubjectName}</span>
                                    ) : (
                                      <span className="text-red-400">(Non validée)</span>
                                    )}
                                  </span>
                                ))}
                                {res.averageFailed && (
                                  <span className="inline-flex items-center gap-1.5 bg-white border border-orange-200 text-orange-700 text-xs font-medium px-2.5 py-1 rounded-full shadow-sm">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    Moyenne semestrielle insuffisante
                                    <span className="font-bold ml-0.5">{res.average?.toFixed(2)}/20</span>
                                    <span className="text-orange-400">(min. 12/20)</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      </>);
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        ) : semestersLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
            <RefreshCw className="w-10 h-10 mb-4 opacity-30 animate-spin" />
            <p className="text-base font-medium">Détection du semestre actif…</p>
          </div>
        ) : (semesters as any[])?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
            <GraduationCap className="w-10 h-10 mb-4 opacity-20" />
            <p className="text-base font-medium">Aucun semestre configuré</p>
            <p className="text-sm mt-1">Créez d'abord un semestre dans la gestion des semestres.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
            <RefreshCw className="w-10 h-10 mb-4 opacity-20 animate-spin" />
            <p className="text-base font-medium">Chargement du semestre…</p>
          </div>
        )}
      </div>

      {/* Derogation modal */}
      <Dialog open={!!derogationTarget} onOpenChange={(o) => { if (!o) setDerogationTarget(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileEdit className="w-5 h-5 text-amber-500 flex-shrink-0" />
              Modifier une note — Dérogation
            </DialogTitle>
          </DialogHeader>
          {derogationTarget && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                <p className="font-semibold">{derogationTarget.studentName}</p>
                <p className="text-xs mt-0.5">Cette action sera tracée dans le Journal d'Activité avec votre justification obligatoire.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Matière concernée</Label>
                <Select
                  value={derogationTarget.selectedSubjectId}
                  onValueChange={(v) => setDerogationTarget((prev) => prev ? { ...prev, selectedSubjectId: v } : null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-w-[calc(100vw-4rem)]">
                    {derogationTarget.grades.map((g) => (
                      <SelectItem key={g.subjectId} value={String(g.subjectId)}>
                        <span className="block truncate max-w-xs">
                          {g.subjectName} — note: {g.value ?? "—"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nouvelle note <span className="text-muted-foreground text-xs">(0–20)</span></Label>
                <Input
                  type="number" step="0.5" min="0" max="20"
                  placeholder="Ex: 12.5"
                  value={derogationValue}
                  onChange={(e) => setDerogationValue(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Justification <span className="text-destructive">*</span></Label>
                <Textarea
                  placeholder="Suite à la délibération du jury du 12/03/2026..."
                  value={derogationJustification}
                  onChange={(e) => setDerogationJustification(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <Button
                onClick={handleDerogate}
                disabled={derogateGrade.isPending}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              >
                {derogateGrade.isPending ? "Enregistrement..." : "Valider la dérogation"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview grades modal */}
      <Dialog open={!!previewSubject} onOpenChange={(o) => { if (!o) setPreviewSubject(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              {previewSubject?.subjectName}
              <span className="text-muted-foreground font-normal text-sm">— {previewSubject?.className}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {isPreviewLoading ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">Chargement des notes…</p>
              </div>
            ) : previewGrades.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground">
                <Search className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Aucun étudiant inscrit dans cette classe ou aucune note saisie.</p>
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Étudiant</th>
                      <th className="px-4 py-2.5 text-center font-semibold w-28">Note /20</th>
                      <th className="px-4 py-2.5 text-center font-semibold w-20">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewGrades.map((g, i) => {
                      const hasGrade = g.value !== null;
                      const passing = hasGrade && g.value! >= 10;
                      return (
                        <tr key={i} className="hover:bg-muted/40">
                          <td className="px-4 py-2.5 font-medium">{g.studentName}</td>
                          <td className="px-4 py-2.5 text-center">
                            {hasGrade ? (
                              <span className={`font-mono font-bold ${passing ? "text-emerald-600" : "text-destructive"}`}>
                                {g.value!.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic text-xs">Non saisie</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {!hasGrade ? (
                              <span className="inline-block text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">—</span>
                            ) : passing ? (
                              <span className="inline-block text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Validée</span>
                            ) : (
                              <span className="inline-block text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">Échec</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-secondary/20 border-t">
                    <tr>
                      <td className="px-4 py-2 text-xs text-muted-foreground" colSpan={3}>
                        {previewGrades.filter((g) => g.value !== null).length} / {previewGrades.length} notes saisies ·{" "}
                        {previewGrades.filter((g) => g.value !== null && g.value >= 10).length} ≥ 10/20
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
