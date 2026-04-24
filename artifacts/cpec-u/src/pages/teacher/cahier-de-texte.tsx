import { useState, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherAssignments } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  BookText, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Calendar, Clock, BookOpen, GraduationCap, ClipboardList, Filter, WifiOff,
} from "lucide-react";
import { useOffline } from "@/lib/offline/offline-context";
import { saveCahierDeTexteOffline } from "@/lib/offline/offline-actions";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

type Entry = {
  id: number;
  sessionDate: string;
  title: string;
  contenu: string;
  devoirs: string | null;
  heuresEffectuees: number | null;
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  semesterId: number;
  semesterName: string;
  createdAt: string;
  updatedAt: string;
};

type EntryForm = {
  subjectId: string;
  classId: string;
  semesterId: string;
  sessionDate: string;
  title: string;
  contenu: string;
  devoirs: string;
  heuresEffectuees: string;
};

const EMPTY_FORM: EntryForm = {
  subjectId: "",
  classId: "",
  semesterId: "",
  sessionDate: new Date().toISOString().split("T")[0],
  title: "",
  contenu: "",
  devoirs: "",
  heuresEffectuees: "",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function groupByDate(entries: Entry[]) {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!map.has(e.sessionDate)) map.set(e.sessionDate, []);
    map.get(e.sessionDate)!.push(e);
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
}

export default function CahierDeTexte() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const { isOnline } = useOffline();

  const { data: assignments = [] } = useGetTeacherAssignments();
  const asgns = assignments as any[];

  const [filterClass, setFilterClass] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [prefillApplied, setPrefillApplied] = useState(false);

  const classOptions = useMemo(() => {
    const map = new Map<number, string>();
    asgns.forEach((a: any) => { if (!map.has(a.classId)) map.set(a.classId, a.className); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [asgns]);

  const subjectOptions = useMemo(() => {
    const map = new Map<number, string>();
    asgns.filter((a: any) => filterClass === "all" || String(a.classId) === filterClass)
      .forEach((a: any) => { if (!map.has(a.subjectId)) map.set(a.subjectId, a.subjectName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [asgns, filterClass]);

  const semesterOptions = useMemo(() => {
    const map = new Map<number, string>();
    asgns.filter((a: any) =>
      (filterClass === "all" || String(a.classId) === filterClass) &&
      (filterSubject === "all" || String(a.subjectId) === filterSubject)
    ).forEach((a: any) => { if (!map.has(a.semesterId)) map.set(a.semesterId, a.semesterName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [asgns, filterClass, filterSubject]);

  const qparams = new URLSearchParams();
  if (filterClass !== "all") qparams.set("classId", filterClass);
  if (filterSubject !== "all") qparams.set("subjectId", filterSubject);
  if (filterSemester !== "all") qparams.set("semesterId", filterSemester);
  const qs = qparams.toString() ? `?${qparams.toString()}` : "";

  const { data: entries = [], isLoading } = useQuery<Entry[]>({
    queryKey: ["/api/teacher/cahier-de-texte", qs],
    queryFn: () => apiFetch(`/teacher/cahier-de-texte${qs}`),
  });

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  const assignmentOptions = useMemo(() => {
    const map = new Map<string, { subjectId: number; subjectName: string; classId: number; className: string; semesterId: number; semesterName: string }>();
    asgns.forEach((a: any) => {
      const k = `${a.subjectId}-${a.classId}-${a.semesterId}`;
      if (!map.has(k)) map.set(k, {
        subjectId: a.subjectId, subjectName: a.subjectName,
        classId: a.classId, className: a.className,
        semesterId: a.semesterId, semesterName: a.semesterName,
      });
    });
    return Array.from(map.values());
  }, [asgns]);

  useEffect(() => {
    if (!search || prefillApplied || asgns.length === 0) return;
    const p = new URLSearchParams(search);
    if (p.get("open") !== "1") return;
    const subjectId = p.get("subjectId") ?? "";
    const classId = p.get("classId") ?? "";
    const semesterId = p.get("semesterId") ?? "";
    const date = p.get("date") ?? new Date().toISOString().split("T")[0];
    setEditEntry(null);
    setForm({ ...EMPTY_FORM, subjectId, classId, semesterId, sessionDate: date });
    setDialogOpen(true);
    setPrefillApplied(true);
  }, [search, asgns.length, prefillApplied]);

  function openCreate() {
    setEditEntry(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(entry: Entry) {
    setEditEntry(entry);
    setForm({
      subjectId: String(entry.subjectId),
      classId: String(entry.classId),
      semesterId: String(entry.semesterId),
      sessionDate: entry.sessionDate,
      title: entry.title,
      contenu: entry.contenu,
      devoirs: entry.devoirs ?? "",
      heuresEffectuees: entry.heuresEffectuees != null ? String(entry.heuresEffectuees) : "",
    });
    setDialogOpen(true);
  }

  function handleAssignmentChange(val: string) {
    const [sId, cId, smId] = val.split("-");
    setForm(f => ({ ...f, subjectId: sId, classId: cId, semesterId: smId }));
  }

  async function handleSave() {
    if (!form.subjectId || !form.classId || !form.semesterId || !form.sessionDate || !form.title.trim() || !form.contenu.trim()) {
      toast({ title: "Champs obligatoires manquants", description: "Veuillez remplir tous les champs requis.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        subjectId: form.subjectId,
        classId: form.classId,
        semesterId: form.semesterId,
        sessionDate: form.sessionDate,
        title: form.title.trim(),
        contenu: form.contenu.trim(),
        devoirs: form.devoirs.trim() || null,
        heuresEffectuees: form.heuresEffectuees ? parseFloat(form.heuresEffectuees) : null,
      };
      if (!isOnline && !editEntry) {
        await saveCahierDeTexteOffline(body);
        toast({ title: "Hors ligne — Séance sauvegardée localement", description: "Elle sera synchronisée dès le retour de connexion." });
        setDialogOpen(false);
        return;
      }
      if (editEntry) {
        await apiFetch(`/teacher/cahier-de-texte/${editEntry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast({ title: "Entrée mise à jour" });
      } else {
        await apiFetch("/teacher/cahier-de-texte", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast({ title: "Séance enregistrée" });
        setExpandedDates(prev => new Set([...prev, form.sessionDate]));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/cahier-de-texte"] });
      setDialogOpen(false);
    } catch {
      toast({ title: "Erreur lors de l'enregistrement", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/teacher/cahier-de-texte/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/cahier-de-texte"] });
      toast({ title: "Entrée supprimée" });
    } catch {
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  }

  function toggleDate(date: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  const formAssignmentValue = form.subjectId && form.classId && form.semesterId
    ? `${form.subjectId}-${form.classId}-${form.semesterId}` : "";

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
              <BookText className="w-8 h-8 text-primary" />
              Cahier de texte
            </h1>
            <p className="text-muted-foreground mt-1">
              Renseignez les contenus enseignés et les activités réalisées en classe.
            </p>
          </div>
          <Button onClick={openCreate} className="flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Nouvelle séance
          </Button>
        </div>

        {/* Filters */}
        <Card className="border-border shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Select value={filterClass} onValueChange={v => { setFilterClass(v); setFilterSubject("all"); setFilterSemester("all"); }}>
                <SelectTrigger className="w-48 h-8 text-sm">
                  <SelectValue placeholder="Toutes les classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
                  {classOptions.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterSubject} onValueChange={v => { setFilterSubject(v); setFilterSemester("all"); }}>
                <SelectTrigger className="w-48 h-8 text-sm">
                  <SelectValue placeholder="Toutes les matières" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les matières</SelectItem>
                  {subjectOptions.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterSemester} onValueChange={setFilterSemester}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="Tous les semestres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les semestres</SelectItem>
                  {semesterOptions.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>

              {(filterClass !== "all" || filterSubject !== "all" || filterSemester !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterClass("all"); setFilterSubject("all"); setFilterSemester("all"); }}>
                  Réinitialiser
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="shadow-sm">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <ClipboardList className="w-8 h-8 text-primary/60" />
              <div>
                <p className="text-2xl font-bold text-foreground">{entries.length}</p>
                <p className="text-xs text-muted-foreground">Séance{entries.length !== 1 ? "s" : ""} enregistrée{entries.length !== 1 ? "s" : ""}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Clock className="w-8 h-8 text-blue-500/60" />
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {entries.reduce((sum, e) => sum + (e.heuresEffectuees ?? 0), 0).toFixed(1)}h
                </p>
                <p className="text-xs text-muted-foreground">Heures couvertes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm col-span-2 sm:col-span-1">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <GraduationCap className="w-8 h-8 text-green-500/60" />
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {new Set(entries.map(e => e.classId)).size}
                </p>
                <p className="text-xs text-muted-foreground">Classe{new Set(entries.map(e => e.classId)).size !== 1 ? "s" : ""} concernée{new Set(entries.map(e => e.classId)).size !== 1 ? "s" : ""}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Entries grouped by date */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-4">
            <BookText className="w-14 h-14 opacity-20" />
            <div>
              <p className="font-semibold text-base">Aucune séance enregistrée</p>
              <p className="text-sm mt-1">Cliquez sur "Nouvelle séance" pour commencer à remplir votre cahier de texte.</p>
            </div>
            <Button onClick={openCreate} variant="outline" size="sm" className="gap-2 mt-1">
              <Plus className="w-3.5 h-3.5" />
              Ajouter une séance
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, dayEntries]) => {
              const isOpen = expandedDates.has(date);
              return (
                <div key={date} className="border border-border rounded-2xl overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleDate(date)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-sm capitalize">{formatDate(date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {dayEntries.length} séance{dayEntries.length > 1 ? "s" : ""} —{" "}
                        {dayEntries.map(e => e.subjectName).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {dayEntries.some(e => e.devoirs) && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">Devoirs</Badge>
                      )}
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-border border-t border-border">
                      {dayEntries.map(entry => (
                        <div key={entry.id} className="px-4 py-4 bg-card">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-[11px] font-medium gap-1">
                                  <BookOpen className="w-2.5 h-2.5" />{entry.subjectName}
                                </Badge>
                                <Badge variant="outline" className="text-[11px]">{entry.className}</Badge>
                                {entry.heuresEffectuees && (
                                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                    <Clock className="w-2.5 h-2.5" />{entry.heuresEffectuees}h
                                  </span>
                                )}
                              </div>
                              <h3 className="font-semibold text-sm text-foreground">{entry.title}</h3>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => {
                                  if (!isOnline) {
                                    toast({ title: "Modification non disponible hors ligne", variant: "destructive" });
                                    return;
                                  }
                                  openEdit(entry);
                                }}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${!isOnline ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}
                                title={isOnline ? "Modifier" : "Non disponible hors ligne"}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (!isOnline) {
                                    toast({ title: "Suppression non disponible hors ligne", variant: "destructive" });
                                    return;
                                  }
                                  setDeleteId(entry.id);
                                }}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${!isOnline ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                                title={isOnline ? "Supprimer" : "Non disponible hors ligne"}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Contenu du cours</p>
                              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{entry.contenu}</p>
                            </div>
                            {entry.devoirs && (
                              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3 py-2.5">
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">Devoirs / Travail à faire</p>
                                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{entry.devoirs}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif">
              <BookText className="w-5 h-5 text-primary" />
              {editEntry ? "Modifier la séance" : "Nouvelle séance"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Assignment selector */}
            {!editEntry && (
              <div className="space-y-1.5">
                <Label>Matière / Classe / Semestre <span className="text-destructive">*</span></Label>
                <Select value={formAssignmentValue} onValueChange={handleAssignmentChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une affectation…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignmentOptions.map(a => (
                      <SelectItem key={`${a.subjectId}-${a.classId}-${a.semesterId}`} value={`${a.subjectId}-${a.classId}-${a.semesterId}`}>
                        {a.subjectName} — {a.className} ({a.semesterName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editEntry && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{editEntry.subjectName}</Badge>
                <Badge variant="outline">{editEntry.className}</Badge>
                <Badge variant="outline" className="text-muted-foreground">{editEntry.semesterName}</Badge>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sessionDate">Date de la séance <span className="text-destructive">*</span></Label>
                <Input
                  id="sessionDate"
                  type="date"
                  value={form.sessionDate}
                  onChange={e => setForm(f => ({ ...f, sessionDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="heures">Heures effectuées</Label>
                <Input
                  id="heures"
                  type="number"
                  min="0.5"
                  max="8"
                  step="0.5"
                  placeholder="ex : 1.5"
                  value={form.heuresEffectuees}
                  onChange={e => setForm(f => ({ ...f, heuresEffectuees: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Titre / Thème de la séance <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                placeholder="ex : Introduction aux algorithmes de tri"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contenu">Contenu enseigné / Activités réalisées <span className="text-destructive">*</span></Label>
              <Textarea
                id="contenu"
                placeholder="Décrivez les notions abordées, les exercices effectués, les travaux pratiques…"
                className="min-h-[120px] resize-y"
                value={form.contenu}
                onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="devoirs">Devoirs / Travail à faire pour la prochaine séance</Label>
              <Textarea
                id="devoirs"
                placeholder="ex : Exercices 3, 4, 5 p.42 — Lire le chapitre 3…"
                className="min-h-[80px] resize-y"
                value={form.devoirs}
                onChange={e => setForm(f => ({ ...f, devoirs: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : editEntry ? "Mettre à jour" : "Enregistrer la séance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer cette séance ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette action est irréversible. La séance sera définitivement supprimée du cahier de texte.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
