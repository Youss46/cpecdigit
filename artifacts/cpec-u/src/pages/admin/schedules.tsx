import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  useListScheduleEntries, useCreateScheduleEntry, useDeleteScheduleEntry,
  useListRooms, useListClasses, useListSemesters, useListSubjects, useListUsers,
  usePublishSchedule, useUpdateScheduleEntry,
  usePublishSchedulePeriod, useListSchedulePublications, useListAssignments,
  useListBlockedDates,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, CalendarDays, Clock, MapPin, AlertTriangle, CheckCircle,
  Printer, Eye, EyeOff, Pencil, ChevronLeft, ChevronRight, Send, ChevronDown,
  Ban, CalendarRange,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PeriodGeneratorDialog } from "@/components/period-generator-dialog";

const DAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAY_COLORS = [
  "",
  "bg-blue-50 border-blue-200",
  "bg-green-50 border-green-200",
  "bg-yellow-50 border-yellow-200",
  "bg-purple-50 border-purple-200",
  "bg-pink-50 border-pink-200",
  "bg-orange-50 border-orange-200",
];

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayISO(): string {
  return toISODate(new Date());
}

const emptyForm = {
  teacherId: "", subjectId: "", classId: "", roomId: "", semesterId: "",
  sessionDate: todayISO(), startTime: "08:00", endTime: "10:00", notes: "", teamsLink: "",
};

function timesToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function detectConflicts(entries: any[]) {
  const teacherConflicts = new Set<number>();
  const roomConflicts = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.sessionDate !== b.sessionDate) continue;
      const aStart = timesToMinutes(a.startTime), aEnd = timesToMinutes(a.endTime);
      const bStart = timesToMinutes(b.startTime), bEnd = timesToMinutes(b.endTime);
      if (aStart >= bEnd || bStart >= aEnd) continue;
      if (a.teacherId === b.teacherId) { teacherConflicts.add(a.id); teacherConflicts.add(b.id); }
      if (a.roomId === b.roomId) { roomConflicts.add(a.id); roomConflicts.add(b.id); }
    }
  }
  return { teacherConflicts, roomConflicts };
}

function isDateInPast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
}

function getMondayOfCurrentWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatPeriodLabel(start: Date, numWeeks: number): string {
  const end = addDays(start, numWeeks * 7 - 1);
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

type ViewMode = "1week" | "2weeks" | "1month";

export default function AdminSchedules() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/schedules"] });

  const { data: entries = [], isLoading } = useListScheduleEntries({});
  const { data: rooms = [] } = useListRooms();
  const { data: classes = [] } = useListClasses();
  const { data: semesters = [] } = useListSemesters();
  const { data: subjects = [] } = useListSubjects();
  const { data: allUsers = [] } = useListUsers();
  const { data: assignments = [] } = useListAssignments();
  const { data: blockedDatesRaw = [] } = useListBlockedDates();

  // Build a Set of all individually blocked date strings (expanding periods)
  const blockedDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const bd of blockedDatesRaw as any[]) {
      const start = new Date(bd.date + "T00:00:00");
      const end = bd.dateEnd ? new Date(bd.dateEnd + "T00:00:00") : start;
      const cur = new Date(start);
      while (cur <= end) {
        set.add(toISODate(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    return set;
  }, [blockedDatesRaw]);

  // Return the blocked date entry info (reason + type) for a given date
  const getBlockedInfo = (dateISO: string): { reason: string; type: string } | null => {
    for (const bd of blockedDatesRaw as any[]) {
      const start = bd.date;
      const end = bd.dateEnd ?? bd.date;
      if (dateISO >= start && dateISO <= end) return { reason: bd.reason, type: bd.type };
    }
    return null;
  };

  // Only teachers who have at least one assignment
  const assignedTeacherIds = useMemo(() =>
    new Set((assignments as any[]).map((a) => a.teacherId)),
    [assignments]
  );
  const teachers = useMemo(() =>
    (allUsers as any[]).filter((u) => u.role === "teacher" && assignedTeacherIds.has(u.id)),
    [allUsers, assignedTeacherIds]
  );

  const handleTeacherChange = (teacherId: string) => {
    const tas = (assignments as any[]).filter((a) => String(a.teacherId) === teacherId);
    if (tas.length === 0) {
      setForm(f => ({ ...f, teacherId, subjectId: "", classId: "", semesterId: "" }));
      return;
    }
    const uniqueSubjects = [...new Set(tas.map((a) => a.subjectId))];
    const uniqueClasses = [...new Set(tas.map((a) => a.classId))];
    const uniqueSemesters = [...new Set(tas.map((a) => a.semesterId))];
    setForm(f => ({
      ...f,
      teacherId,
      subjectId: uniqueSubjects.length === 1 ? String(uniqueSubjects[0]) : "",
      classId: uniqueClasses.length === 1 ? String(uniqueClasses[0]) : "",
      semesterId: uniqueSemesters.length === 1 ? String(uniqueSemesters[0]) : "",
    }));
  };

  const createEntry = useCreateScheduleEntry();
  const deleteEntry = useDeleteScheduleEntry();
  const updateEntry = useUpdateScheduleEntry();
  const publishSchedule = usePublishSchedule();
  const publishPeriod = usePublishSchedulePeriod();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPeriodDialogOpen, setIsPeriodDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [filterSemester, setFilterSemester] = useState<string>("all");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [form, setForm] = useState(emptyForm);
  const [viewMode, setViewMode] = useState<ViewMode>("1week");
  const [startDate, setStartDate] = useState<Date>(getMondayOfCurrentWeek);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const openCreateForDay = (dayISO: string) => {
    setEditingEntry(null);
    setForm({ ...emptyForm, sessionDate: dayISO });
    setIsCreateOpen(true);
  };

  const teacherAssignmentsForForm = useMemo(() =>
    form.teacherId ? (assignments as any[]).filter((a) => String(a.teacherId) === form.teacherId) : [],
    [assignments, form.teacherId]
  );
  const formSubjectIds = useMemo(() => new Set(teacherAssignmentsForForm.map((a) => String(a.subjectId))), [teacherAssignmentsForForm]);
  const formClassIds = useMemo(() => new Set(teacherAssignmentsForForm.map((a) => String(a.classId))), [teacherAssignmentsForForm]);
  const formSemesterIds = useMemo(() => new Set(teacherAssignmentsForForm.map((a) => String(a.semesterId))), [teacherAssignmentsForForm]);
  const filteredFormSubjects = useMemo(() =>
    form.teacherId ? (subjects as any[]).filter((s) => formSubjectIds.has(String(s.id))) : (subjects as any[]),
    [subjects, form.teacherId, formSubjectIds]
  );
  const filteredFormClasses = useMemo(() =>
    form.teacherId ? (classes as any[]).filter((c) => formClassIds.has(String(c.id))) : (classes as any[]),
    [classes, form.teacherId, formClassIds]
  );
  const filteredFormSemesters = useMemo(() =>
    form.teacherId ? (semesters as any[]).filter((s) => formSemesterIds.has(String(s.id))) : (semesters as any[]),
    [semesters, form.teacherId, formSemesterIds]
  );
  const autoFilledSubject = teacherAssignmentsForForm.length > 0 && formSubjectIds.size === 1 && !!form.subjectId;
  const autoFilledClass = teacherAssignmentsForForm.length > 0 && formClassIds.size === 1 && !!form.classId;
  const autoFilledSemester = teacherAssignmentsForForm.length > 0 && formSemesterIds.size === 1 && !!form.semesterId;

  const pubParams = useMemo(() => ({
    classId: filterClass !== "all" ? parseInt(filterClass) : undefined,
    semesterId: filterSemester !== "all" ? parseInt(filterSemester) : undefined,
  }), [filterClass, filterSemester]);

  const { data: publications = [], refetch: refetchPubs } = useListSchedulePublications(
    pubParams,
    { enabled: filterClass !== "all" && filterSemester !== "all" } as any
  );

  const activePub = useMemo(() => {
    const now = new Date();
    return (publications as any[]).find((p: any) => {
      return new Date(p.publishedFrom) <= now && new Date(p.publishedUntil) >= now;
    }) ?? null;
  }, [publications]);

  const numWeeks = viewMode === "1week" ? 1 : viewMode === "2weeks" ? 2 : 4;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [startDate, viewMode]);

  const weeks = useMemo(() =>
    Array.from({ length: numWeeks }, (_, i) => addDays(startDate, i * 7)),
    [startDate, numWeeks]
  );

  const navigate = (dir: 1 | -1) => {
    setStartDate((prev) => addDays(prev, dir * numWeeks * 7));
  };

  const goToCurrentWeek = () => setStartDate(getMondayOfCurrentWeek());

  const filteredEntries = useMemo(() => (entries as any[]).filter((e) => {
    if (filterSemester !== "all" && e.semesterId !== parseInt(filterSemester)) return false;
    if (filterClass !== "all" && e.classId !== parseInt(filterClass)) return false;
    return true;
  }), [entries, filterSemester, filterClass]);

  const globalStatus = useMemo((): "publie" | "partiel" | "brouillon" | "vide" => {
    if (filterClass === "all" || filterSemester === "all") return "vide";
    if (filteredEntries.length === 0) return "vide";
    const numPublished = (filteredEntries as any[]).filter((e: any) => e.published).length;
    if (numPublished === filteredEntries.length) return "publie";
    if (numPublished === 0) return "brouillon";
    return "partiel";
  }, [filteredEntries, filterClass, filterSemester]);

  const lastPublishedDate = useMemo(() => {
    const published = (filteredEntries as any[])
      .filter((e: any) => e.published && e.sessionDate)
      .sort((a: any, b: any) => (b.sessionDate as string).localeCompare(a.sessionDate as string));
    return published[0]?.sessionDate as string | undefined;
  }, [filteredEntries]);

  const { teacherConflicts, roomConflicts } = useMemo(() => detectConflicts(filteredEntries), [filteredEntries]);
  const conflictIds = useMemo(() => new Set([...teacherConflicts, ...roomConflicts]), [teacherConflicts, roomConflicts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDateInPast(form.sessionDate)) {
      toast({
        title: "Date déjà écoulée",
        description: "Il est impossible de programmer un cours à une date passée.",
        variant: "destructive",
      });
      return;
    }
    const blockedInfo = getBlockedInfo(form.sessionDate);
    if (blockedInfo) {
      toast({
        title: "Date bloquée",
        description: `Cette date est bloquée : ${blockedInfo.reason}. Choisissez une autre date.`,
        variant: "destructive",
      });
      return;
    }
    try {
      await createEntry.mutateAsync({
        data: {
          teacherId: parseInt(form.teacherId),
          subjectId: parseInt(form.subjectId),
          classId: parseInt(form.classId),
          roomId: parseInt(form.roomId),
          semesterId: parseInt(form.semesterId),
          sessionDate: form.sessionDate,
          startTime: form.startTime,
          endTime: form.endTime,
          teamsLink: form.teamsLink || null,
        },
      });
      toast({ title: "Créneau créé" });
      invalidate();
      setIsCreateOpen(false);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    try {
      await updateEntry.mutateAsync({
        entryId: editingEntry.id,
        data: {
          teacherId: parseInt(form.teacherId),
          subjectId: parseInt(form.subjectId),
          classId: parseInt(form.classId),
          roomId: parseInt(form.roomId),
          sessionDate: form.sessionDate,
          startTime: form.startTime,
          endTime: form.endTime,
          notes: form.notes || null,
          teamsLink: form.teamsLink || null,
        },
      });
      toast({ title: "Créneau mis à jour" });
      invalidate();
      setEditingEntry(null);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    }
  };

  const openEdit = (entry: any) => {
    setEditingEntry(entry);
    setForm({
      teacherId: String(entry.teacherId),
      subjectId: String(entry.subjectId),
      classId: String(entry.classId),
      roomId: String(entry.roomId),
      semesterId: String(entry.semesterId),
      sessionDate: entry.sessionDate,
      startTime: entry.startTime,
      endTime: entry.endTime,
      notes: entry.notes ?? "",
      teamsLink: entry.teamsLink ?? "",
    });
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteEntry.mutateAsync({ entryId: id });
      toast({ title: "Créneau supprimé" });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handlePublish = async (published: boolean) => {
    if (filterSemester === "all") {
      toast({ title: "Sélectionnez un semestre d'abord", variant: "destructive" });
      return;
    }
    try {
      await publishSchedule.mutateAsync({
        semesterId: parseInt(filterSemester),
        published,
        ...(filterClass !== "all" ? { classId: parseInt(filterClass) } : {}),
      });
      toast({ title: published ? "Emploi du temps publié !" : "Emploi du temps mis en brouillon" });
      await refetchPubs();
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const navigateToPeriod = (period: "today" | "1week" | "2weeks" | "1month") => {
    const now = new Date();
    if (period === "today") {
      // Go to the current week in 1-week view so today is visible
      setViewMode("1week");
      setStartDate(getMondayOfCurrentWeek());
    } else if (period === "1week") {
      setViewMode("1week");
      setStartDate(getMondayOfCurrentWeek());
    } else if (period === "2weeks") {
      setViewMode("2weeks");
      setStartDate(getMondayOfCurrentWeek());
    } else if (period === "1month") {
      setViewMode("1month");
      // Navigate to the Monday of the first week of the current month
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(getMondayOfCurrentWeek()); // stay on current week but expand to month
      // Actually jump to beginning of month's first Monday
      const day = firstOfMonth.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(firstOfMonth);
      weekStart.setDate(weekStart.getDate() + diff);
      setStartDate(weekStart);
    }
  };

  const buildPeriodLabel = (period: "today" | "1week" | "2weeks" | "1month"): string => {
    const now = new Date();
    const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const fmtShort = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

    if (period === "today") {
      return `le ${fmtDate(now)}`;
    }
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + diff);

    if (period === "1week") {
      const saturday = new Date(monday);
      saturday.setDate(saturday.getDate() + 5);
      return `la semaine du ${fmtShort(monday)} au ${fmtDate(saturday)}`;
    }
    if (period === "2weeks") {
      const saturday2 = new Date(monday);
      saturday2.setDate(saturday2.getDate() + 12);
      return `les 2 semaines du ${fmtShort(monday)} au ${fmtDate(saturday2)}`;
    }
    // 1month
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${firstOfMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} (${fmtShort(firstOfMonth)} au ${fmtDate(lastOfMonth)})`;
  };

  const handlePublishPeriod = async (period: "today" | "1week" | "2weeks" | "1month") => {
    if (filterClass === "all" || filterSemester === "all") {
      toast({ title: "Sélectionnez une classe et un semestre d'abord", variant: "destructive" });
      return;
    }
    try {
      await publishPeriod.mutateAsync({
        classId: parseInt(filterClass),
        semesterId: parseInt(filterSemester),
        period,
      });
      const selectedClass = (classes as any[]).find((c) => String(c.id) === filterClass);
      const selectedSemester = (semesters as any[]).find((s) => String(s.id) === filterSemester);
      const periodLabel = buildPeriodLabel(period);
      toast({
        title: "Emploi du temps publié !",
        description: `${selectedClass?.name ?? ""}${selectedSemester ? ` — ${selectedSemester.name}` : ""} : publié pour ${periodLabel}.`,
      });
      navigateToPeriod(period);
      await refetchPubs();
      invalidate();
    } catch {
      toast({ title: "Erreur lors de la publication", variant: "destructive" });
    }
  };

  const handlePublishAll = async () => {
    if (filterSemester === "all") {
      toast({ title: "Sélectionnez un semestre d'abord", variant: "destructive" });
      return;
    }
    try {
      await publishSchedule.mutateAsync({
        semesterId: parseInt(filterSemester),
        published: true,
        ...(filterClass !== "all" ? { classId: parseInt(filterClass) } : {}),
      });
      toast({
        title: "Tout publié !",
        description: "Toutes les séances sont maintenant visibles pour les étudiants.",
      });
      await refetchPubs();
      invalidate();
    } catch {
      toast({ title: "Erreur lors de la publication", variant: "destructive" });
    }
  };

  const isCreatingInPastWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = addDays(startDate, numWeeks * 7 - 1);
    return weekEnd < today;
  }, [startDate, numWeeks]);

  const entryFormJSX = (onSubmit: (e: React.FormEvent) => void, isPending: boolean, hideMonth?: boolean) => (
    <form onSubmit={onSubmit} className="space-y-3 mt-4">
      {!hideMonth && isCreatingInPastWeek && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Vous consultez une période passée. Il est impossible de programmer un cours sur des dates déjà écoulées.</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Enseignant</Label>
          <Select value={form.teacherId} onValueChange={handleTeacherChange}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{teachers.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">Matière {autoFilledSubject && <span className="text-xs text-green-600 font-normal">(auto-rempli)</span>}</Label>
          <Select value={form.subjectId} onValueChange={(v) => setForm(f => ({ ...f, subjectId: v }))}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{filteredFormSubjects.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">Classe {autoFilledClass && <span className="text-xs text-green-600 font-normal">(auto-rempli)</span>}</Label>
          <Select value={form.classId} onValueChange={(v) => setForm(f => ({ ...f, classId: v }))}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{filteredFormClasses.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Salle</Label>
          <Select value={form.roomId} onValueChange={(v) => setForm(f => ({ ...f, roomId: v }))}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{rooms.map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.capacity}p)</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {!hideMonth && (
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">Semestre {autoFilledSemester && <span className="text-xs text-green-600 font-normal">(auto-rempli)</span>}</Label>
            <Select value={form.semesterId} onValueChange={(v) => setForm(f => ({ ...f, semesterId: v }))}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{filteredFormSemesters.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Date du cours</Label>
          <Input
            type="date"
            value={form.sessionDate}
            onChange={(e) => setForm(f => ({ ...f, sessionDate: e.target.value }))}
            min={todayISO()}
            className={blockedDateSet.has(form.sessionDate) ? "border-red-400 bg-red-50" : ""}
          />
          {blockedDateSet.has(form.sessionDate) && (() => {
            const info = getBlockedInfo(form.sessionDate);
            return (
              <div className="flex items-center gap-1.5 text-xs text-red-600 mt-1">
                <Ban className="w-3 h-3 shrink-0" />
                <span>Date bloquée{info ? ` : ${info.reason}` : ""}. Choisissez une autre date.</span>
              </div>
            );
          })()}
        </div>
        <div className="space-y-1">
          <Label>Début</Label>
          <Input type="time" value={form.startTime} onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Fin</Label>
          <Input type="time" value={form.endTime} onChange={(e) => setForm(f => ({ ...f, endTime: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
        <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Remarques..." />
      </div>
      <div className="space-y-1">
        <Label className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#4B53BC] shrink-0">
            <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-white"><path d="M20.625 3H3.375A.375.375 0 0 0 3 3.375v17.25c0 .207.168.375.375.375h17.25A.375.375 0 0 0 21 20.625V3.375A.375.375 0 0 0 20.625 3zm-7.97 11.914a.375.375 0 0 1-.375.375H9.72a.375.375 0 0 1-.375-.375V8.086c0-.207.168-.375.375-.375h2.56c.207 0 .375.168.375.375v6.828z"/></svg>
          </span>
          Lien réunion Teams
          <span className="text-muted-foreground text-xs font-normal">(optionnel)</span>
        </Label>
        <Input
          value={form.teamsLink}
          onChange={(e) => setForm(f => ({ ...f, teamsLink: e.target.value }))}
          placeholder="https://teams.microsoft.com/l/meetup-join/..."
          type="url"
        />
        {form.teamsLink && !form.teamsLink.startsWith("https://teams.microsoft.com/") && (
          <p className="text-xs text-destructive mt-0.5">Le lien doit commencer par https://teams.microsoft.com/</p>
        )}
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={isPending || (!!form.teamsLink && !form.teamsLink.startsWith("https://teams.microsoft.com/"))}
      >
          {isPending ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </form>
  );

  const DayCard = ({ day, weekStart }: { day: number; weekStart: Date }) => {
    const dayDate = addDays(weekStart, day - 1);
    const dayISO = toISODate(dayDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = dayDate.getTime() === today.getTime();
    const isBlocked = blockedDateSet.has(dayISO);
    const blockedInfo = isBlocked ? getBlockedInfo(dayISO) : null;
    const dayEntries = filteredEntries
      .filter((e) => e.sessionDate === dayISO)
      .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

    return (
      <div className={`border rounded-2xl overflow-hidden shadow-sm relative ${
        isBlocked
          ? "bg-gray-100 border-gray-300 opacity-75"
          : `${DAY_COLORS[day]} ${isToday ? "ring-2 ring-primary ring-offset-1" : ""}`
      }`}>
        <div className={`px-4 py-3 border-b flex items-center justify-between ${isBlocked ? "border-gray-300 bg-gray-200/60" : "border-current/10"}`}>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            {isBlocked ? <Ban className="w-4 h-4 text-gray-500" /> : <CalendarDays className="w-4 h-4" />}
            <span className={isBlocked ? "text-gray-500" : ""}>{DAYS[day]}</span>
            <span className={`text-xs font-normal ${isToday && !isBlocked ? "text-primary font-bold" : "text-muted-foreground"}`}>
              {formatShortDate(dayDate)}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{dayEntries.length}</Badge>
            {!isBlocked && (
              <button
                onClick={() => openCreateForDay(dayISO)}
                className="w-6 h-6 rounded-full flex items-center justify-center bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                title="Ajouter un cours ce jour"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="p-3 space-y-2 min-h-[80px]">
          {isBlocked ? (
            <div className="flex flex-col items-center justify-center py-4 gap-1.5 text-center">
              <Ban className="w-5 h-5 text-gray-400" />
              <p className="text-xs font-medium text-gray-500">{blockedInfo?.reason ?? "Jour bloqué"}</p>
              <p className="text-[10px] text-gray-400 capitalize">{blockedInfo?.type === "vacances" ? "Vacances" : blockedInfo?.type === "ferie" ? "Jour férié" : "Bloqué"}</p>
            </div>
          ) : dayEntries.length === 0 ? (
            <button
              onClick={() => openCreateForDay(dayISO)}
              className="w-full text-xs text-muted-foreground text-center py-4 rounded-xl border-2 border-dashed border-transparent hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mx-auto mb-1 opacity-50" />
              Ajouter un cours
            </button>
          ) : (
            dayEntries.map((entry: any) => {
              const hasTeacherConflict = teacherConflicts.has(entry.id);
              const hasRoomConflict = roomConflicts.has(entry.id);
              const hasConflict = hasTeacherConflict || hasRoomConflict;
              return (
                <div key={entry.id}
                  className={`bg-white/80 backdrop-blur-sm rounded-xl p-3 border shadow-xs group relative ${hasConflict ? "border-red-300 bg-red-50/80" : "border-white/60"}`}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{entry.subjectName}</p>
                      <p className="text-xs text-muted-foreground truncate">{entry.teacherName}</p>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />{entry.startTime}–{entry.endTime}
                        </span>
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3 h-3" />{entry.roomName}
                        </span>
                      </div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{entry.className}</Badge>
                        {entry.published
                          ? <Badge variant="outline" className="text-xs border-green-300 text-green-700">Publié</Badge>
                          : <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">Brouillon</Badge>}
                      </div>
                      {hasConflict && (
                        <div className="mt-1 space-y-0.5">
                          {hasTeacherConflict && <p className="text-xs text-red-600 font-medium">⚠ Conflit enseignant</p>}
                          {hasRoomConflict && <p className="text-xs text-red-600 font-medium">⚠ Conflit salle</p>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(entry)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingDeleteId(entry.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Emploi du Temps</h1>
            <p className="text-muted-foreground">Gérez, publiez et imprimez la grille des cours.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {(() => {
              const selectedClass = (classes as any[]).find((c) => String(c.id) === filterClass);
              const selectedSemester = (semesters as any[]).find((s) => String(s.id) === filterSemester);
              const canPublish = filterClass !== "all" && filterSemester !== "all";
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={globalStatus === "publie" ? "outline" : "default"}
                      disabled={publishPeriod.isPending}
                      className={globalStatus === "publie" ? "border-green-400 text-green-700 hover:bg-green-50 gap-1" : globalStatus === "partiel" ? "border-blue-400 text-blue-700 hover:bg-blue-50 gap-1" : "gap-1"}
                    >
                      {globalStatus === "publie"
                        ? <><CheckCircle className="w-4 h-4 text-green-600" />Publié<ChevronDown className="w-3 h-3 ml-1" /></>
                        : globalStatus === "partiel"
                        ? <><Send className="w-4 h-4" />Partiel<ChevronDown className="w-3 h-3 ml-1" /></>
                        : <><Send className="w-4 h-4" />Publier<ChevronDown className="w-3 h-3 ml-1" /></>}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {!canPublish ? (
                      <>
                        <div className="px-3 py-2.5 space-y-1">
                          <p className="text-xs font-semibold text-foreground">Sélectionner la classe</p>
                          <p className="text-xs text-muted-foreground leading-snug">
                            Choisissez une classe et un semestre dans les filtres ci-dessous pour publier l'emploi du temps correspondant.
                          </p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled className="text-muted-foreground/50 cursor-not-allowed">
                          <CalendarDays className="w-4 h-4 mr-2" />Aujourd'hui seulement
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="text-muted-foreground/50 cursor-not-allowed">
                          <CalendarDays className="w-4 h-4 mr-2" />1 semaine
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="text-muted-foreground/50 cursor-not-allowed">
                          <CalendarDays className="w-4 h-4 mr-2" />2 semaines
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="text-muted-foreground/50 cursor-not-allowed">
                          <CalendarDays className="w-4 h-4 mr-2" />1 mois
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <div className="px-3 py-2.5 space-y-0.5">
                          <p className="text-xs font-semibold text-foreground">
                            {selectedClass?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedSemester?.name} — Publier pour les étudiants
                          </p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold px-3 pb-1">Par période</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handlePublishPeriod("today")} className="cursor-pointer gap-2">
                          <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium">Aujourd'hui seulement</p>
                            <p className="text-[10px] text-muted-foreground">Séances de {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePublishPeriod("1week")} className="cursor-pointer gap-2">
                          <CalendarDays className="w-4 h-4 text-green-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium">Cette semaine</p>
                            <p className="text-[10px] text-muted-foreground">Lun. – Sam. de la semaine en cours</p>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePublishPeriod("2weeks")} className="cursor-pointer gap-2">
                          <CalendarDays className="w-4 h-4 text-orange-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium">2 semaines</p>
                            <p className="text-[10px] text-muted-foreground">Semaine en cours + semaine suivante</p>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePublishPeriod("1month")} className="cursor-pointer gap-2">
                          <CalendarDays className="w-4 h-4 text-purple-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium">Ce mois</p>
                            <p className="text-[10px] text-muted-foreground">{new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold px-3 pb-1">Tout publier</DropdownMenuLabel>
                        <DropdownMenuItem onClick={handlePublishAll} className="cursor-pointer gap-2">
                          <Send className="w-4 h-4 text-primary shrink-0" />
                          <div>
                            <p className="text-sm font-medium">Tout publier</p>
                            <p className="text-[10px] text-muted-foreground">Publie toutes les séances du semestre</p>
                          </div>
                        </DropdownMenuItem>
                        {(globalStatus === "publie" || globalStatus === "partiel") && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handlePublish(false)} className="cursor-pointer text-destructive focus:text-destructive gap-2">
                              <EyeOff className="w-4 h-4 shrink-0" />
                              <div>
                                <p className="text-sm font-medium">Dépublier tout</p>
                                <p className="text-[10px] text-muted-foreground/70">Repasse toutes les séances en brouillon</p>
                              </div>
                            </DropdownMenuItem>
                          </>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })()}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />Imprimer
            </Button>
            <Button variant="outline" onClick={() => setIsPeriodDialogOpen(true)} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1.5">
              <CalendarRange className="w-4 h-4" />Par période
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) setForm(emptyForm); }}>
              <DialogTrigger asChild>
                <Button className="shadow-md"><Plus className="w-4 h-4 mr-2" />Nouveau Créneau</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Créer un créneau</DialogTitle></DialogHeader>
                {entryFormJSX(handleCreate, createEntry.isPending)}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Edit dialog */}
        <Dialog open={!!editingEntry} onOpenChange={(o) => { if (!o) { setEditingEntry(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Modifier le créneau</DialogTitle></DialogHeader>
            {entryFormJSX(handleUpdate, updateEntry.isPending, true)}
          </DialogContent>
        </Dialog>

        {/* Conflict alert */}
        {conflictIds.size > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-700 font-medium">
              {conflictIds.size} créneau{conflictIds.size > 1 ? "x" : ""} en conflit —
              un enseignant ou une salle est doublement réservé(e) à la même date.
            </p>
          </div>
        )}

        {/* Filters + View controls */}
        <div className="flex gap-3 flex-wrap items-center justify-between">
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={filterSemester} onValueChange={setFilterSemester}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Tous les semestres" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les semestres</SelectItem>
                {semesters.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {filterClass !== "all" && filterSemester !== "all" && globalStatus !== "vide" && (
              globalStatus === "publie" ? (
                <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 gap-1">
                  <Eye className="w-3 h-3" />
                  {lastPublishedDate
                    ? <>Publié — jusqu'au {new Date(lastPublishedDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</>
                    : <>Publié</>}
                </Badge>
              ) : globalStatus === "partiel" ? (
                <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 gap-1">
                  <Eye className="w-3 h-3" />Partiellement publié
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 gap-1">
                  <EyeOff className="w-3 h-3" />Non publié
                </Badge>
              )
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {(["1week", "2weeks", "1month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === mode
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "1week" ? "1 sem." : mode === "2weeks" ? "2 sem." : "1 mois"}
              </button>
            ))}
          </div>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 text-center">
            <span className="font-semibold text-foreground">{formatPeriodLabel(startDate, numWeeks)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={goToCurrentWeek} className="text-xs">
            Aujourd'hui
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Schedule grid — horizontal scroll snap */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Chargement...</p>
        ) : (
          <div
            ref={scrollRef}
            className="flex overflow-x-auto gap-8 pb-4 -mx-1 px-1"
            style={{ scrollSnapType: "x mandatory", scrollBehavior: "smooth" }}
          >
            {weeks.map((weekStart, wi) => (
              <div
                key={wi}
                className="flex-none w-full"
                style={{ scrollSnapAlign: "start" }}
              >
                {numWeeks > 1 && (
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Semaine du {formatShortDate(weekStart)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((day) => (
                    <DayCard key={day} day={day} weekStart={weekStart} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        onConfirm={() => handleDelete(pendingDeleteId!)}
        title="Supprimer le créneau"
        description="Ce créneau d'emploi du temps sera définitivement supprimé."
      />

      <PeriodGeneratorDialog
        open={isPeriodDialogOpen}
        onOpenChange={setIsPeriodDialogOpen}
        teachers={allUsers as any[]}
        subjects={subjects as any[]}
        classes={classes as any[]}
        rooms={rooms as any[]}
        semesters={semesters as any[]}
        defaultSemesterId={filterSemester !== "all" ? filterSemester : undefined}
        defaultClassId={filterClass !== "all" ? filterClass : undefined}
      />
    </AppLayout>
  );
}
