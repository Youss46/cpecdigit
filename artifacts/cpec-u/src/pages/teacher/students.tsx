import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherStudents, useGetTeacherAssignments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { Search, Users, GraduationCap, Mail, Phone, ChevronRight, BookOpen } from "lucide-react";

export default function TeacherStudents() {
  const { data: assignments = [] } = useGetTeacherAssignments();
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("classId") ?? "all";
  });
  const [search, setSearch] = useState("");

  const classOptions = useMemo(() => {
    const map = new Map<number, string>();
    (assignments as any[]).forEach((a: any) => {
      if (!map.has(a.classId)) map.set(a.classId, a.className);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [assignments]);

  const { data: students = [], isLoading } = useGetTeacherStudents(
    selectedClassId !== "all" ? { classId: parseInt(selectedClassId) } : {},
    { query: {} as any }
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (students as any[]).filter((s: any) =>
      !q || s.studentName.toLowerCase().includes(q) || s.studentEmail?.toLowerCase().includes(q)
    );
  }, [students, search]);

  const grouped = useMemo(() => {
    const map = new Map<number, { className: string; students: any[] }>();
    for (const s of filtered) {
      if (!map.has(s.classId)) map.set(s.classId, { className: s.className, students: [] });
      map.get(s.classId)!.students.push(s);
    }
    return Array.from(map.entries()).map(([classId, data]) => ({ classId, ...data }));
  }, [filtered]);

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Mes Étudiants
          </h1>
          <p className="text-muted-foreground mt-1">
            Liste des étudiants dans vos classes assignées.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un étudiant…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Toutes les classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              {classOptions.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
            <Users className="w-12 h-12 opacity-30" />
            <p className="font-medium">
              {search ? "Aucun étudiant trouvé pour cette recherche." : "Aucun étudiant dans vos classes."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ classId, className, students }) => (
              <div key={classId}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">{className}</h2>
                  <Badge variant="secondary" className="ml-1">{students.length} étudiant{students.length > 1 ? "s" : ""}</Badge>
                </div>

                <Card className="border-border overflow-hidden shadow-sm">
                  <div className="divide-y divide-border">
                    {students.map((s: any, i: number) => (
                      <Link key={s.studentId} href={`/teacher/students/${s.studentId}`}>
                        <div className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors cursor-pointer group ${i === 0 ? "" : ""}`}>
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">
                            {s.studentName.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{s.studentName}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                              {s.studentEmail && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="w-3 h-3" />{s.studentEmail}
                                </span>
                              )}
                              {s.phone && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Phone className="w-3 h-3" />{s.phone}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
