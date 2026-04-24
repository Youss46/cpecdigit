import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { CalendarDays, AlertCircle, Clock } from "lucide-react";

function useParentProfile() {
  return useQuery({
    queryKey: ["/api/parent/profile"],
    queryFn: async () => {
      const res = await fetch("/api/parent/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json() as Promise<{ parent: any; students: Array<{ id: number; name: string }> }>;
    },
  });
}

function useStudentSchedule(studentId: number | null) {
  return useQuery({
    queryKey: ["/api/parent/student", studentId, "schedule"],
    enabled: !!studentId,
    queryFn: async () => {
      const res = await fetch(`/api/parent/student/${studentId}/schedule`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json() as Promise<Array<{
        id: number; dayOfWeek: number; startTime: string; endTime: string;
        subjectName: string; teacherName: string; roomName?: number;
      }>>;
    },
  });
}

const DAYS: Record<number, string> = { 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi" };
const DAY_COLORS: Record<number, string> = {
  1: "bg-violet-50 border-violet-200", 2: "bg-blue-50 border-blue-200",
  3: "bg-emerald-50 border-emerald-200", 4: "bg-amber-50 border-amber-200",
  5: "bg-red-50 border-red-200", 6: "bg-gray-50 border-gray-200",
};

export default function ParentSchedule() {
  const { data: profile } = useParentProfile();
  const students = profile?.students ?? [];
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const studentId = selectedStudentId ?? students[0]?.id ?? null;
  const { data: entries, isLoading } = useStudentSchedule(studentId);

  const grouped: Record<number, typeof entries> = {};
  if (entries) {
    for (const e of entries) {
      if (!grouped[e.dayOfWeek]) grouped[e.dayOfWeek] = [];
      grouped[e.dayOfWeek]!.push(e);
    }
  }
  const sortedDays = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <AppLayout allowedRoles={["parent"]}>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="w-6 h-6 text-blue-600" /> Emploi du temps</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Planning de cours publié</p>
          </div>
          {students.length > 1 && (
            <Select value={String(studentId ?? "")} onValueChange={v => setSelectedStudentId(Number(v))}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Enfant" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !entries?.length ? (
          <Card><CardContent className="p-6 flex items-center gap-3 text-muted-foreground text-sm"><AlertCircle className="w-4 h-4" /> Aucun emploi du temps publié.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {sortedDays.map(day => (
              <div key={day}>
                <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">{DAYS[day] ?? `Jour ${day}`}</h2>
                <div className="space-y-2">
                  {grouped[day]!
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map(e => (
                      <Card key={e.id} className={`border ${DAY_COLORS[day] ?? ""}`}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground w-24 flex-shrink-0">
                            <Clock className="w-3 h-3" />{e.startTime} – {e.endTime}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{e.subjectName}</p>
                            <p className="text-xs text-muted-foreground">{e.teacherName}</p>
                          </div>
                          {e.roomName && <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Salle {e.roomName}</span>}
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
