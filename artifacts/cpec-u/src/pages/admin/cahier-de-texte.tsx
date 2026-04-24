import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookText, Calendar, Clock, BookOpen, GraduationCap,
  ClipboardList, Filter, ChevronDown, ChevronRight, User, Search, X,
} from "lucide-react";

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
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
  teacherId: number;
  teacherName: string;
  createdAt: string;
  updatedAt: string;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

function groupByDate(entries: Entry[]) {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!map.has(e.sessionDate)) map.set(e.sessionDate, []);
    map.get(e.sessionDate)!.push(e);
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
}

function unique<T>(arr: T[], key: (x: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return arr.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

export default function AdminCahierDeTexte() {
  const [filterTeacher, setFilterTeacher] = useState("all");
  const [filterClass, setFilterClass] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const { data: entries = [], isLoading } = useQuery<Entry[]>({
    queryKey: ["/api/admin/cahier-de-texte"],
    queryFn: () => apiFetch("/admin/cahier-de-texte"),
  });

  const teachers = useMemo(() => unique(entries.map(e => ({ id: e.teacherId, name: e.teacherName })), x => x.id), [entries]);
  const classes = useMemo(() => unique(entries.map(e => ({ id: e.classId, name: e.className })), x => x.id), [entries]);
  const subjects = useMemo(() => unique(entries.map(e => ({ id: e.subjectId, name: e.subjectName })), x => x.id), [entries]);
  const semesters = useMemo(() => unique(entries.map(e => ({ id: e.semesterId, name: e.semesterName })), x => x.id), [entries]);

  const filtered = useMemo(() => entries.filter(e => {
    if (filterTeacher !== "all" && String(e.teacherId) !== filterTeacher) return false;
    if (filterClass !== "all" && String(e.classId) !== filterClass) return false;
    if (filterSubject !== "all" && String(e.subjectId) !== filterSubject) return false;
    if (filterSemester !== "all" && String(e.semesterId) !== filterSemester) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        e.contenu.toLowerCase().includes(q) ||
        e.teacherName.toLowerCase().includes(q) ||
        e.subjectName.toLowerCase().includes(q) ||
        e.className.toLowerCase().includes(q)
      );
    }
    return true;
  }), [entries, filterTeacher, filterClass, filterSubject, filterSemester, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  function toggleDate(date: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  function resetFilters() {
    setFilterTeacher("all");
    setFilterClass("all");
    setFilterSubject("all");
    setFilterSemester("all");
    setSearch("");
  }

  const hasFilters = filterTeacher !== "all" || filterClass !== "all" || filterSubject !== "all" || filterSemester !== "all" || search.trim() !== "";
  const totalHours = filtered.reduce((s, e) => s + (e.heuresEffectuees ?? 0), 0);

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <BookText className="w-8 h-8 text-primary" />
            Cahiers de texte
          </h1>
          <p className="text-muted-foreground mt-1">
            Consultez les contenus enseignés et les activités réalisées par chaque enseignant.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Séances", value: filtered.length, icon: ClipboardList, color: "text-primary/60" },
            { label: "Heures couvertes", value: `${totalHours.toFixed(1)}h`, icon: Clock, color: "text-blue-500/60" },
            { label: "Classes", value: new Set(filtered.map(e => e.classId)).size, icon: GraduationCap, color: "text-green-500/60" },
            { label: "Enseignants", value: new Set(filtered.map(e => e.teacherId)).size, icon: User, color: "text-orange-500/60" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <Icon className={`w-7 h-7 flex-shrink-0 ${color}`} />
                <div>
                  <p className="text-xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="border-border shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm w-52"
                  placeholder="Rechercher…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="Tous les enseignants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les enseignants</SelectItem>
                  {teachers.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="Toutes les classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
                  {classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="Toutes les matières" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les matières</SelectItem>
                  {subjects.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterSemester} onValueChange={setFilterSemester}>
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue placeholder="Tous les semestres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les semestres</SelectItem>
                  {semesters.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>

              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={resetFilters}>
                  <X className="w-3 h-3" /> Réinitialiser
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Entries */}
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
              <p className="font-semibold text-base">
                {hasFilters ? "Aucun résultat pour ces filtres" : "Aucune séance enregistrée"}
              </p>
              <p className="text-sm mt-1">
                {hasFilters
                  ? "Modifiez ou réinitialisez les filtres pour voir plus d'entrées."
                  : "Les enseignants n'ont pas encore renseigné de séances dans leurs cahiers de texte."}
              </p>
            </div>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
                <X className="w-3 h-3" /> Réinitialiser les filtres
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, dayEntries]) => {
              const isOpen = expandedDates.has(date);
              const teacherNames = [...new Set(dayEntries.map(e => e.teacherName))];
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
                        {teacherNames.join(", ")}
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
                          {/* Badges */}
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge className="text-[11px] gap-1 bg-primary/10 text-primary hover:bg-primary/10 border-0">
                              <User className="w-2.5 h-2.5" />{entry.teacherName}
                            </Badge>
                            <Badge variant="secondary" className="text-[11px] font-medium gap-1">
                              <BookOpen className="w-2.5 h-2.5" />{entry.subjectName}
                            </Badge>
                            <Badge variant="outline" className="text-[11px]">{entry.className}</Badge>
                            <Badge variant="outline" className="text-[11px] text-muted-foreground">{entry.semesterName}</Badge>
                            {entry.heuresEffectuees && (
                              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                <Clock className="w-2.5 h-2.5" />{entry.heuresEffectuees}h
                              </span>
                            )}
                          </div>

                          <h3 className="font-semibold text-sm text-foreground mb-2">{entry.title}</h3>

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
    </AppLayout>
  );
}
