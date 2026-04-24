import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { CalendarOff, AlertCircle, Clock, CheckCircle, XCircle } from "lucide-react";

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

function useStudentAbsences(studentId: number | null, semesterId: string) {
  return useQuery({
    queryKey: ["/api/parent/student", studentId, "absences", semesterId],
    enabled: !!studentId,
    queryFn: async () => {
      const url = `/api/parent/student/${studentId}/absences` + (semesterId !== "all" ? `?semesterId=${semesterId}` : "");
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json() as Promise<{
        absences: Array<{ id: number; sessionDate: string; status: string; subjectName: string; justified: boolean; note?: string; startTime?: string; endTime?: string }>;
        totalAbsences: number; totalLates: number;
        semesters: Array<{ id: number; name: string }>;
      }>;
    },
  });
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  absent: { label: "Absent", color: "bg-red-100 text-red-800 border-red-200" },
  late: { label: "Retard", color: "bg-amber-100 text-amber-800 border-amber-200" },
};

export default function ParentAbsences() {
  const { data: profile } = useParentProfile();
  const students = profile?.students ?? [];
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const studentId = selectedStudentId ?? students[0]?.id ?? null;
  const [semesterId, setSemesterId] = useState("all");
  const { data, isLoading } = useStudentAbsences(studentId, semesterId);

  return (
    <AppLayout allowedRoles={["parent"]}>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarOff className="w-6 h-6 text-red-600" /> Absences</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Suivi des absences et retards</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {students.length > 1 && (
            <Select value={String(studentId ?? "")} onValueChange={v => setSelectedStudentId(Number(v))}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Enfant" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {data?.semesters && (
            <Select value={semesterId} onValueChange={setSemesterId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Semestre" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les semestres</SelectItem>
                {data.semesters.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Stats */}
        {data && (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{data.totalAbsences}</p>
                  <p className="text-xs text-muted-foreground">Absences</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{data.totalLates}</p>
                  <p className="text-xs text-muted-foreground">Retards</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !data?.absences.length ? (
          <Card><CardContent className="p-6 flex items-center gap-3 text-muted-foreground text-sm"><CheckCircle className="w-4 h-4 text-emerald-500" /> Aucune absence enregistrée.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {data.absences.map(a => (
              <Card key={a.id}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-2 h-12 rounded-full flex-shrink-0 ${a.status === "absent" ? "bg-red-400" : "bg-amber-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{a.subjectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.sessionDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                      {a.startTime && ` — ${a.startTime}${a.endTime ? " → " + a.endTime : ""}`}
                    </p>
                    {a.note && <p className="text-xs text-muted-foreground mt-0.5 italic">{a.note}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={STATUS_MAP[a.status]?.color ?? ""}>{STATUS_MAP[a.status]?.label ?? a.status}</Badge>
                    {a.justified
                      ? <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Justifiée</span>
                      : <span className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Non justifiée</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
