import { useState, useMemo, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange, ChevronLeft, ChevronRight, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Ban, RefreshCw, Trash2,
} from "lucide-react";

const JOURS = [
  { label: "Lun", value: 1, full: "Lundi" },
  { label: "Mar", value: 2, full: "Mardi" },
  { label: "Mer", value: 3, full: "Mercredi" },
  { label: "Jeu", value: 4, full: "Jeudi" },
  { label: "Ven", value: 5, full: "Vendredi" },
  { label: "Sam", value: 6, full: "Samedi" },
];

const FR_DAYS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  const date = new Date(+y, +m - 1, +d);
  const dayIdx = date.getDay() === 0 ? 7 : date.getDay();
  return `${FR_DAYS[dayIdx].charAt(0).toUpperCase()}${FR_DAYS[dayIdx].slice(1)} ${d}/${m}/${y}`;
}

interface Session {
  date: string;
  startTime: string;
  endTime: string;
  teacherId: number;
  teacherName: string;
  isBlocked: boolean;
  blockedReason: string | null;
  conflicts: { type: string; message: string }[];
  selected: boolean;
}

interface PeriodGeneratorDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teachers: any[];
  subjects: any[];
  classes: any[];
  rooms: any[];
  semesters: any[];
  defaultSemesterId?: string;
  defaultClassId?: string;
}

function defaultStartDate() {
  const d = new Date();
  const monday = new Date(d);
  const day = d.getDay();
  const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function defaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + 56);
  return d.toISOString().slice(0, 10);
}

const emptyForm = {
  teacherIds: [] as string[],
  subjectId: "",
  classId: "",
  roomId: "",
  semesterId: "",
  startDate: defaultStartDate(),
  endDate: defaultEndDate(),
  days: [] as number[],
  startTime: "08:00",
  endTime: "10:00",
  frequency: "weekly" as "weekly" | "biweekly",
};

export function PeriodGeneratorDialog({
  open, onOpenChange,
  teachers, subjects, classes, rooms, semesters,
  defaultSemesterId, defaultClassId,
}: PeriodGeneratorDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ ...emptyForm, semesterId: defaultSemesterId ?? "", classId: defaultClassId ?? "" });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── Cascade: teacher → subject/class/semester ─────────────────────────────
  const [assignments, setAssignments] = useState<any[] | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [noAssignments, setNoAssignments] = useState(false);
  const prevTeacherIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const prev = prevTeacherIdsRef.current;
    prevTeacherIdsRef.current = form.teacherIds;

    if (form.teacherIds.length === 0) {
      setAssignments(null);
      setNoAssignments(false);
      setForm(f => ({ ...f, subjectId: "", classId: "", semesterId: defaultSemesterId ?? "" }));
      return;
    }

    // Fetch when first teacher is selected, or when the single teacher changes
    const shouldFetch =
      (prev.length === 0 && form.teacherIds.length > 0) ||
      (form.teacherIds.length === 1 && (prev.length !== 1 || prev[0] !== form.teacherIds[0]));

    if (!shouldFetch) return;

    const teacherId = form.teacherIds[0];
    setAssignmentsLoading(true);
    setNoAssignments(false);

    fetch(`/api/admin/teacher-assignments/by-teacher/${teacherId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        const asgns: any[] = data.assignments ?? [];
        if (asgns.length === 0) {
          setNoAssignments(true);
          setAssignments([]);
          return;
        }
        setAssignments(asgns);

        // Find active semester (current date within range, else published, else first)
        const today = new Date();
        const activeSemAsgn = asgns.find((a: any) => {
          const start = a.semesterStart ? new Date(a.semesterStart) : null;
          const end = a.semesterEnd ? new Date(a.semesterEnd) : null;
          return start && end && today >= start && today <= end;
        }) ?? asgns.find((a: any) => a.semesterPublished) ?? asgns[0];

        const uniqueSubjectIds = [...new Set(asgns.map((a: any) => a.subjectId))];
        const uniqueClassIds = [...new Set(asgns.map((a: any) => a.classId))];

        setForm(f => {
          const newForm = { ...f };
          if (activeSemAsgn?.semesterId) newForm.semesterId = String(activeSemAsgn.semesterId);
          if (uniqueSubjectIds.length === 1) newForm.subjectId = String(asgns[0].subjectId);
          if (uniqueClassIds.length === 1) newForm.classId = String(asgns[0].classId);
          return newForm;
        });
      })
      .catch(() => {})
      .finally(() => setAssignmentsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.teacherIds]);

  function reset() {
    setStep(1);
    setForm({ ...emptyForm, semesterId: defaultSemesterId ?? "", classId: defaultClassId ?? "" });
    setSessions([]);
    setAssignments(null);
    setNoAssignments(false);
    prevTeacherIdsRef.current = [];
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function toggleDay(d: number) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d],
    }));
  }

  function toggleTeacher(id: string) {
    setForm((f) => ({
      ...f,
      teacherIds: f.teacherIds.includes(id) ? f.teacherIds.filter((x) => x !== id) : [...f.teacherIds, id],
    }));
  }

  function toggleSession(idx: number) {
    setSessions((prev) => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
  }

  function selectAll(val: boolean) {
    setSessions((prev) => prev.map((s) => s.isBlocked ? s : { ...s, selected: val }));
  }

  const selectedCount = sessions.filter((s) => s.selected).length;
  const conflictCount = sessions.filter((s) => s.conflicts.length > 0).length;
  const blockedCount = sessions.filter((s) => s.isBlocked).length;

  const canPreview = form.teacherIds.length > 0 && form.subjectId && form.classId && form.roomId &&
    form.semesterId && form.startDate && form.endDate && form.days.length > 0 && form.startTime && form.endTime;

  async function handlePreview() {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/schedules/period-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          teacherIds: form.teacherIds.map(Number),
          subjectId: form.subjectId,
          classId: form.classId,
          roomId: form.roomId,
          semesterId: form.semesterId,
          startDate: form.startDate,
          endDate: form.endDate,
          days: form.days,
          startTime: form.startTime,
          endTime: form.endTime,
          frequency: form.frequency,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Erreur");
      setSessions(data.sessions ?? []);
      setStep(2);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    const toCreate = sessions.filter((s) => s.selected);
    if (!toCreate.length) {
      toast({ title: "Aucune séance sélectionnée", description: "Cochez au moins une séance avant de confirmer.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const resp = await fetch("/api/admin/schedules/period-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessions: toCreate,
          subjectId: form.subjectId,
          classId: form.classId,
          roomId: form.roomId,
          semesterId: form.semesterId,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Erreur");
      await qc.invalidateQueries({ queryKey: ["/api/admin/schedules"] });
      toast({ title: "Séances créées ✓", description: `${data.created} séance(s) générées avec succès.` });
      handleClose(false);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  const teacherList = useMemo(() => (teachers as any[]).filter((u: any) => u.role === "teacher"), [teachers]);
  const subjectList = subjects as any[];
  const classList = classes as any[];
  const roomList = rooms as any[];
  const semesterList = semesters as any[];

  // Filtered lists based on teacher assignments cascade
  const availableSubjects = useMemo(() => {
    if (!assignments || assignments.length === 0) return subjectList;
    const seen = new Set<number>();
    return assignments
      .filter((a: any) => !seen.has(a.subjectId) && seen.add(a.subjectId))
      .map((a: any) => ({ id: a.subjectId, name: a.subjectName }));
  }, [assignments, subjectList]);

  const availableClasses = useMemo(() => {
    if (!assignments || assignments.length === 0) return classList;
    const filtered = form.subjectId
      ? assignments.filter((a: any) => String(a.subjectId) === form.subjectId)
      : assignments;
    const seen = new Set<number>();
    return filtered
      .filter((a: any) => !seen.has(a.classId) && seen.add(a.classId))
      .map((a: any) => ({ id: a.classId, name: a.className }));
  }, [assignments, classList, form.subjectId]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
              <CalendarRange className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Programmer par période</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Génération automatique de séances sur un intervalle de dates</p>
            </div>
          </div>

          {/* Steps */}
          <div className="flex items-center gap-2 mt-3">
            <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${step === 1 ? "bg-indigo-100 text-indigo-700" : "bg-muted text-muted-foreground"}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 1 ? "bg-indigo-600 text-white" : "bg-muted-foreground/40 text-white"}`}>1</span>
              Configuration
            </div>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${step === 2 ? "bg-indigo-100 text-indigo-700" : "bg-muted text-muted-foreground"}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 2 ? "bg-indigo-600 text-white" : "bg-muted-foreground/40 text-white"}`}>2</span>
              Aperçu & Confirmation
            </div>
          </div>
        </DialogHeader>

        {/* STEP 1 — Configuration form */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Enseignants */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Enseignant(s) <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg min-h-[40px] bg-muted/30">
                {form.teacherIds.length === 0 && (
                  <span className="text-xs text-muted-foreground self-center px-1">Cliquez sur un enseignant pour le sélectionner</span>
                )}
                {form.teacherIds.map((id) => {
                  const t = teacherList.find((u: any) => String(u.id) === id);
                  return t ? (
                    <Badge key={id} variant="secondary" className="gap-1 pr-1 text-xs">
                      {t.name}
                      <button onClick={() => toggleTeacher(id)} className="ml-0.5 hover:text-red-500 transition-colors">×</button>
                    </Badge>
                  ) : null;
                })}
              </div>
              <div className="max-h-32 overflow-y-auto border rounded-lg divide-y">
                {teacherList.map((t: any) => {
                  const sel = form.teacherIds.includes(String(t.id));
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTeacher(String(t.id))}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors ${sel ? "bg-indigo-50" : ""}`}
                    >
                      <Checkbox checked={sel} className="pointer-events-none" />
                      <span className={sel ? "font-medium text-indigo-700" : ""}>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Avertissement : aucune affectation */}
            {noAssignments && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                <span>Cet enseignant n'a aucune matière affectée. Les listes ne sont pas filtrées.</span>
              </div>
            )}

            {/* Matière / Classe / Salle */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  Matière <span className="text-red-500">*</span>
                  {assignmentsLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
                  {assignments && assignments.length > 0 && <span className="text-[9px] font-medium text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded">Filtré</span>}
                </Label>
                <Select
                  value={form.subjectId}
                  onValueChange={(v) => {
                    // Reset class on subject change (cascade level 2)
                    const newClasses = assignments
                      ? [...new Set(assignments.filter((a: any) => String(a.subjectId) === v).map((a: any) => String(a.classId)))]
                      : [];
                    setForm(f => ({
                      ...f,
                      subjectId: v,
                      classId: newClasses.length === 1 ? newClasses[0] : "",
                    }));
                  }}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>{availableSubjects.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  Classe <span className="text-red-500">*</span>
                  {assignmentsLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
                  {assignments && assignments.length > 0 && <span className="text-[9px] font-medium text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded">Filtré</span>}
                </Label>
                <Select value={form.classId} onValueChange={(v) => setForm((f) => ({ ...f, classId: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>{availableClasses.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Salle <span className="text-red-500">*</span></Label>
                <Select value={form.roomId} onValueChange={(v) => setForm((f) => ({ ...f, roomId: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>{roomList.map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Semestre */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                Semestre <span className="text-red-500">*</span>
                {assignments && assignments.length > 0 && <span className="text-[9px] font-medium text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded">Auto-détecté</span>}
              </Label>
              <Select value={form.semesterId} onValueChange={(v) => setForm((f) => ({ ...f, semesterId: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>{semesterList.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date de début <span className="text-red-500">*</span></Label>
                <Input type="date" className="h-8 text-sm" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date de fin <span className="text-red-500">*</span></Label>
                <Input type="date" className="h-8 text-sm" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>

            {/* Jours de récurrence */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Jours de récurrence <span className="text-red-500">*</span></Label>
              <div className="flex gap-1.5 flex-wrap">
                {JOURS.map((j) => (
                  <button
                    key={j.value}
                    onClick={() => toggleDay(j.value)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      form.days.includes(j.value)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-foreground border-border hover:border-indigo-300 hover:text-indigo-600"
                    }`}
                  >
                    {j.full}
                  </button>
                ))}
              </div>
            </div>

            {/* Horaires + fréquence */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Heure début <span className="text-red-500">*</span></Label>
                <Input type="time" className="h-8 text-sm" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Heure fin <span className="text-red-500">*</span></Label>
                <Input type="time" className="h-8 text-sm" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Fréquence</Label>
                <Select value={form.frequency} onValueChange={(v: any) => setForm((f) => ({ ...f, frequency: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Chaque semaine</SelectItem>
                    <SelectItem value="biweekly">Une sem. sur deux</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 — Preview */}
        {step === 2 && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Summary bar */}
            <div className="px-6 py-3 border-b bg-muted/40 shrink-0">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <CalendarRange className="w-3.5 h-3.5 text-indigo-600" />
                  {sessions.length} séance(s) générée(s)
                </span>
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />{selectedCount} sélectionnée(s)
                </span>
                {conflictCount > 0 && (
                  <span className="flex items-center gap-1 text-orange-500 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />{conflictCount} conflit(s)
                  </span>
                )}
                {blockedCount > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground font-medium">
                    <Ban className="w-3.5 h-3.5" />{blockedCount} jour(s) exclu(s)
                  </span>
                )}
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => selectAll(true)}>Tout sélect.</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => selectAll(false)}>Tout désélect.</Button>
                </div>
              </div>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto divide-y">
              {sessions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CalendarRange className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Aucune séance générée pour cette période.</p>
                  <p className="text-xs mt-1">Vérifiez les jours et dates sélectionnés.</p>
                </div>
              )}
              {sessions.map((s, i) => {
                const hasConflict = s.conflicts.length > 0;
                const rowBg = s.isBlocked
                  ? "bg-muted/50 opacity-60"
                  : hasConflict
                  ? "bg-orange-50"
                  : s.selected
                  ? "bg-green-50/40"
                  : "bg-white";

                return (
                  <div
                    key={i}
                    className={`flex items-start gap-3 px-5 py-2.5 transition-colors ${rowBg} ${!s.isBlocked ? "hover:bg-muted/20 cursor-pointer" : "cursor-default"}`}
                    onClick={() => !s.isBlocked && toggleSession(i)}
                  >
                    <div className="pt-0.5 shrink-0">
                      {s.isBlocked ? (
                        <Ban className="w-4 h-4 text-muted-foreground/50" />
                      ) : (
                        <Checkbox
                          checked={s.selected}
                          className="pointer-events-none"
                          onCheckedChange={() => toggleSession(i)}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${s.isBlocked ? "text-muted-foreground line-through" : hasConflict ? "text-orange-700" : ""}`}>
                          {fmtDate(s.date)}
                        </span>
                        <span className="text-xs text-muted-foreground">{s.startTime} → {s.endTime}</span>
                        {form.teacherIds.length > 1 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{s.teacherName}</Badge>
                        )}
                        {s.isBlocked && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            <Ban className="w-2.5 h-2.5 mr-0.5" />{s.blockedReason ?? "Jour exclu"}
                          </Badge>
                        )}
                        {hasConflict && !s.isBlocked && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Conflit
                          </Badge>
                        )}
                      </div>
                      {hasConflict && (
                        <div className="mt-1 space-y-0.5">
                          {s.conflicts.map((c, j) => (
                            <p key={j} className="text-[11px] text-orange-600 leading-tight">⚠ {c.message}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {!s.isBlocked && s.selected && !hasConflict && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      {!s.isBlocked && !s.selected && <XCircle className="w-4 h-4 text-muted-foreground/30" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-background shrink-0 flex items-center justify-between gap-3">
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Annuler</Button>
              <Button
                onClick={handlePreview}
                disabled={!canPreview || loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Générer l'aperçu
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setStep(1)} className="gap-1">
                  <ChevronLeft className="w-4 h-4" />Modifier
                </Button>
                <Button variant="ghost" size="sm" onClick={handlePreview} disabled={loading} className="gap-1 text-muted-foreground">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Recalculer
                </Button>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={selectedCount === 0 || generating}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirmer et générer ({selectedCount})
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
