import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useGetTeacherSchedule, useListSemesters } from "@workspace/api-client-react";
import {
  CalendarDays, Clock, MapPin, ChevronLeft, ChevronRight,
  Users, Printer, List, LayoutGrid, WifiOff,
} from "lucide-react";
import { useOffline } from "@/lib/offline/offline-context";

const DAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const SUBJECT_COLORS = [
  { pill: "bg-blue-100 text-blue-800", card: "border-l-blue-400", header: "bg-blue-50 border-blue-200" },
  { pill: "bg-emerald-100 text-emerald-800", card: "border-l-emerald-400", header: "bg-emerald-50 border-emerald-200" },
  { pill: "bg-violet-100 text-violet-800", card: "border-l-violet-400", header: "bg-violet-50 border-violet-200" },
  { pill: "bg-amber-100 text-amber-800", card: "border-l-amber-400", header: "bg-amber-50 border-amber-200" },
  { pill: "bg-pink-100 text-pink-800", card: "border-l-pink-400", header: "bg-pink-50 border-pink-200" },
  { pill: "bg-teal-100 text-teal-800", card: "border-l-teal-400", header: "bg-teal-50 border-teal-200" },
  { pill: "bg-orange-100 text-orange-800", card: "border-l-orange-400", header: "bg-orange-50 border-orange-200" },
  { pill: "bg-indigo-100 text-indigo-800", card: "border-l-indigo-400", header: "bg-indigo-50 border-indigo-200" },
  { pill: "bg-rose-100 text-rose-800", card: "border-l-rose-400", header: "bg-rose-50 border-rose-200" },
  { pill: "bg-cyan-100 text-cyan-800", card: "border-l-cyan-400", header: "bg-cyan-50 border-cyan-200" },
];

type CalViewMode = "1week" | "2weeks" | "1month";
type DisplayMode = "calendar" | "list";

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
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

function formatShortDate(date: Date) {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatPeriodLabel(start: Date, numWeeks: number) {
  const end = addDays(start, numWeeks * 7 - 1);
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

export default function TeacherSchedule() {
  const { isOnline } = useOffline();
  const { data: allEntries = [], isLoading } = useGetTeacherSchedule();
  const { data: semesters = [] } = useListSemesters();

  const [filterSemester, setFilterSemester] = useState<string>("all");
  const [calViewMode, setCalViewMode] = useState<CalViewMode>("1week");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("calendar");
  const [startDate, setStartDate] = useState<Date>(getMondayOfCurrentWeek);
  const scrollRef = useRef<HTMLDivElement>(null);

  const numWeeks = calViewMode === "1week" ? 1 : calViewMode === "2weeks" ? 2 : 4;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [startDate, calViewMode]);

  const weeks = useMemo(
    () => Array.from({ length: numWeeks }, (_, i) => addDays(startDate, i * 7)),
    [startDate, numWeeks]
  );

  const subjectColorMap = useMemo(() => {
    const map: Record<number, (typeof SUBJECT_COLORS)[0]> = {};
    let idx = 0;
    for (const e of allEntries as any[]) {
      if (!(e.subjectId in map)) {
        map[e.subjectId] = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
        idx++;
      }
    }
    return map;
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    return (allEntries as any[]).filter((e) => {
      if (filterSemester !== "all" && e.semesterId !== parseInt(filterSemester)) return false;
      return true;
    });
  }, [allEntries, filterSemester]);

  const visibleEntries = useMemo(() => {
    if (weeks.length === 0) return filteredEntries;
    const periodStart = toISODate(weeks[0]);
    const periodEnd = toISODate(addDays(weeks[weeks.length - 1], 6));
    return filteredEntries.filter((e: any) => e.sessionDate >= periodStart && e.sessionDate <= periodEnd);
  }, [filteredEntries, weeks]);

  const totalHoursVisible = useMemo(() => {
    let minutes = 0;
    for (const e of visibleEntries) {
      const [sh, sm] = e.startTime.split(":").map(Number);
      const [eh, em] = e.endTime.split(":").map(Number);
      minutes += (eh * 60 + em) - (sh * 60 + sm);
    }
    return Math.round((minutes / 60) * 10) / 10;
  }, [visibleEntries]);

  // List view: future sessions grouped by date
  const listEntries = useMemo(() => {
    const today = toISODate(new Date());
    const upcoming = filteredEntries.filter((e) => e.sessionDate >= today);
    const groups: Record<string, any[]> = {};
    for (const e of upcoming) {
      if (!groups[e.sessionDate]) groups[e.sessionDate] = [];
      groups[e.sessionDate].push(e);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => ({
        date,
        dateLabel: formatLongDate(new Date(date + "T00:00:00")),
        isToday: date === today,
        entries: entries.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }));
  }, [filteredEntries]);

  const navigate = (dir: 1 | -1) => setStartDate((prev) => addDays(prev, dir * numWeeks * 7));

  const EntryCard = ({ entry, compact = false }: { entry: any; compact?: boolean }) => {
    const color = subjectColorMap[entry.subjectId] ?? SUBJECT_COLORS[0];
    return (
      <div className={`bg-white rounded-xl border border-border border-l-4 ${color.card} shadow-xs p-3 ${compact ? "py-2" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color.pill}`}>
            {entry.subjectName}
          </span>
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {entry.startTime.slice(0, 5)}–{entry.endTime.slice(0, 5)}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
          <span className="text-xs flex items-center gap-1 text-muted-foreground">
            <Users className="w-3 h-3" />{entry.className}
          </span>
          <span className="text-xs flex items-center gap-1 text-muted-foreground">
            <MapPin className="w-3 h-3" />{entry.roomName}
          </span>
        </div>
        {entry.notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">{entry.notes}</p>
        )}
      </div>
    );
  };

  const DayCard = ({ day, weekStart }: { day: number; weekStart: Date }) => {
    const dayDate = addDays(weekStart, day - 1);
    const dayISO = toISODate(dayDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = dayDate.getTime() === today.getTime();
    const isPast = dayDate < today;
    const dayEntries = filteredEntries
      .filter((e: any) => e.sessionDate === dayISO)
      .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
    const hasNoSessions = dayEntries.length === 0;

    return (
      <div
        className={`border rounded-2xl overflow-hidden shadow-sm transition-opacity
          ${hasNoSessions ? "opacity-50" : ""}
          ${isToday ? "ring-2 ring-primary ring-offset-1 opacity-100" : ""}
          ${isPast && !isToday ? "opacity-50" : ""}
        `}
      >
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
            <CalendarDays className="w-3.5 h-3.5" />
            {DAYS[day]}
            <span className={`text-xs font-normal ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
              {formatShortDate(dayDate)}
            </span>
          </h3>
          <Badge variant={dayEntries.length > 0 ? "secondary" : "outline"} className="text-xs">
            {dayEntries.length}
          </Badge>
        </div>
        <div className="p-3 space-y-2 min-h-[80px] bg-white/60">
          {dayEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Libre</p>
          ) : (
            dayEntries.map((entry: any) => (
              <EntryCard key={entry.id} entry={entry} compact />
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-serif font-bold text-foreground">Mon Emploi du Temps</h1>
              {!isOnline && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <WifiOff className="w-3 h-3" /> hors ligne
                </span>
              )}
            </div>
            <p className="text-muted-foreground">Consultez vos cours planifiés. Vue en lecture seule.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end print:hidden">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              Imprimer
            </Button>
            <Select value={filterSemester} onValueChange={setFilterSemester}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Tous les semestres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les semestres</SelectItem>
                {(semesters as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats bar (only in calendar mode) */}
        {displayMode === "calendar" && visibleEntries.length > 0 && (
          <div className="flex gap-3 flex-wrap print:hidden">
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-primary">{visibleEntries.length}</span>
              <span className="text-muted-foreground ml-1">cours sur la période</span>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-primary">{totalHoursVisible}h</span>
              <span className="text-muted-foreground ml-1">sur la période</span>
            </div>
          </div>
        )}

        {/* View controls */}
        <div className="flex items-center justify-between gap-4 flex-wrap print:hidden">
          {/* Calendar navigation (only in calendar mode) */}
          {displayMode === "calendar" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[160px] text-center">
                {formatPeriodLabel(startDate, numWeeks)}
              </span>
              <Button variant="outline" size="icon" onClick={() => navigate(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStartDate(getMondayOfCurrentWeek())}>
                Aujourd'hui
              </Button>
            </div>
          )}
          {displayMode === "list" && <div />}

          <div className="flex items-center gap-2 ml-auto">
            {/* Display mode toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setDisplayMode("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${displayMode === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Calendrier
              </button>
              <button
                onClick={() => setDisplayMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${displayMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="w-3.5 h-3.5" />
                Liste
              </button>
            </div>

            {/* Calendar sub-mode */}
            {displayMode === "calendar" && (
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {(["1week", "2weeks", "1month"] as CalViewMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setCalViewMode(m)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${calViewMode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {m === "1week" ? "1 sem." : m === "2weeks" ? "2 sem." : "1 mois"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Aucun cours planifié</p>
            <p className="text-sm mt-1">L'emploi du temps n'a pas encore été publié pour cette période.</p>
          </div>
        ) : displayMode === "list" ? (
          /* ── List View ── */
          <div className="space-y-6">
            {listEntries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aucune séance à venir.</p>
              </div>
            ) : (
              listEntries.map(({ date, dateLabel, isToday, entries }) => (
                <div key={date}>
                  <div className={`flex items-center gap-2 mb-3 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isToday ? "bg-primary" : "bg-border"}`} />
                    <span className={`text-sm font-semibold capitalize ${isToday ? "text-primary" : ""}`}>
                      {dateLabel}{isToday ? " — Aujourd'hui" : ""}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{entries.length} cours</Badge>
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          let mins = 0;
                          for (const e of entries) {
                            const [sh, sm] = e.startTime.split(":").map(Number);
                            const [eh, em] = e.endTime.split(":").map(Number);
                            mins += (eh * 60 + em) - (sh * 60 + sm);
                          }
                          return `${Math.round(mins / 60 * 10) / 10}h`;
                        })()}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 pl-4">
                    {entries.map((entry: any) => (
                      <EntryCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* ── Calendar View ── */
          <div className="space-y-8" ref={scrollRef}>
            {weeks.map((weekStart, wi) => (
              <div key={wi}>
                {numWeeks > 1 && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Semaine du {formatShortDate(weekStart)}
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((day) => (
                    <DayCard key={day} day={day} weekStart={weekStart} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Subject legend */}
        {filteredEntries.length > 0 && Object.keys(subjectColorMap).length > 1 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t print:hidden">
            {Object.entries(subjectColorMap).map(([subjectId, color]) => {
              const entry = filteredEntries.find((e: any) => e.subjectId === parseInt(subjectId));
              if (!entry) return null;
              return (
                <span key={subjectId} className={`text-xs px-2.5 py-1 rounded-full font-medium ${color.pill}`}>
                  {entry.subjectName}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
