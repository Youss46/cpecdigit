import { useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherStudentDetail } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useParams } from "wouter";
import { ArrowLeft, GraduationCap, Mail, Phone, CalendarOff, BookOpen, Users, Hash, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function StatusBadge({ status, justified }: { status: string; justified: boolean }) {
  if (status === "present") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Présent</Badge>;
  if (justified) return <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">Excusé</Badge>;
  if (status === "late") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 border">En retard</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200 border">Absent</Badge>;
}

export default function TeacherStudentDetail() {
  const params = useParams<{ id: string }>();
  const studentId = parseInt(params.id ?? "0");

  const { data, isLoading, isError, error } = useGetTeacherStudentDetail(studentId);

  const student = data?.student;
  const enrollment = data?.enrollment;
  const grades: any[] = data?.grades ?? [];
  const absences: any[] = data?.absences ?? [];

  const onlyAbsences = absences.filter((a: any) => a.status !== "present");

  const gradesBySemesterSubject = useMemo(() => {
    const map = new Map<string, { semesterName: string; subjectName: string; coefficient: number; evals: Record<number, number> }>();
    for (const g of grades) {
      const key = `${g.semesterId}-${g.subjectId}`;
      if (!map.has(key)) map.set(key, { semesterName: g.semesterName, subjectName: g.subjectName, coefficient: g.coefficient, evals: {} });
      map.get(key)!.evals[g.evaluationNumber] = g.value;
    }
    const bySemester = new Map<string, { semesterName: string; subjects: { subjectName: string; coefficient: number; evals: Record<number, number>; avg: number | null }[] }>();
    for (const [, v] of map.entries()) {
      if (!bySemester.has(v.semesterName)) bySemester.set(v.semesterName, { semesterName: v.semesterName, subjects: [] });
      const evalValues = Object.values(v.evals);
      const avg = evalValues.length > 0 ? evalValues.reduce((a, b) => a + b, 0) / evalValues.length : null;
      bySemester.get(v.semesterName)!.subjects.push({ subjectName: v.subjectName, coefficient: v.coefficient, evals: v.evals, avg });
    }
    return Array.from(bySemester.values());
  }, [grades]);

  const maxEvals = useMemo(() => {
    let max = 1;
    for (const g of grades) if (g.evaluationNumber > max) max = g.evaluationNumber;
    return max;
  }, [grades]);

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["teacher"]}>
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-muted animate-pulse" />
          <div className="h-64 rounded-2xl bg-muted animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !student) {
    if (error) console.error("[TeacherStudentDetail] Erreur de chargement:", error);
    const is404 = (error as any)?.status === 404;
    return (
      <AppLayout allowedRoles={["teacher"]}>
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <AlertCircle className="w-12 h-12 text-destructive/60" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              {is404 ? "Étudiant introuvable" : "Erreur de chargement"}
            </p>
            <p className="text-sm text-muted-foreground">
              {is404
                ? `Aucun étudiant avec l'identifiant #${studentId}.`
                : "Une erreur est survenue. Réessayez ou contactez l'administrateur."}
            </p>
          </div>
          <Link href="/teacher/students">
            <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Retour</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* Back button */}
        <Link href="/teacher/students">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Retour à la liste
          </Button>
        </Link>

        {/* Header card */}
        <div className="relative bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 rounded-3xl p-6 text-white overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 -mr-12 -mt-12 opacity-10">
            <GraduationCap className="w-48 h-48" />
          </div>
          <div className="relative z-10 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold flex-shrink-0">
              {student.photoUrl ? (
                <img src={student.photoUrl} alt="Photo" className="w-full h-full rounded-full object-cover" />
              ) : (
                student.name?.charAt(0) ?? "?"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-serif font-bold truncate">{student.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {enrollment?.className && (
                  <span className="flex items-center gap-1.5 text-sm text-white/80 bg-white/15 rounded-full px-3 py-0.5">
                    <BookOpen className="w-3.5 h-3.5" />{enrollment.className}
                  </span>
                )}
                {student.matricule && (
                  <span className="flex items-center gap-1.5 text-sm text-white/70 font-mono">
                    <Hash className="w-3 h-3" />{student.matricule}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {student.email && (
                  <span className="flex items-center gap-1.5 text-xs text-white/60">
                    <Mail className="w-3 h-3" />{student.email}
                  </span>
                )}
                {student.phone && (
                  <span className="flex items-center gap-1.5 text-xs text-white/60">
                    <Phone className="w-3 h-3" />{student.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Summary badges */}
          <div className="relative z-10 flex flex-wrap gap-3 mt-5 pt-4 border-t border-white/10">
            <div className="text-center px-4 py-2 bg-white/10 rounded-xl">
              <p className="text-xl font-bold">{grades.length}</p>
              <p className="text-xs text-white/60">Note{grades.length > 1 ? "s" : ""} saisie{grades.length > 1 ? "s" : ""}</p>
            </div>
            <div className="text-center px-4 py-2 bg-white/10 rounded-xl">
              <p className="text-xl font-bold">{onlyAbsences.length}</p>
              <p className="text-xs text-white/60">Absence{onlyAbsences.length > 1 ? "s" : ""} / retard{onlyAbsences.length > 1 ? "s" : ""}</p>
            </div>
            <div className="text-center px-4 py-2 bg-white/10 rounded-xl">
              <p className="text-xl font-bold">{onlyAbsences.filter((a: any) => !a.justified).length}</p>
              <p className="text-xs text-white/60">Non excusée{onlyAbsences.filter((a: any) => !a.justified).length > 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="grades">
          <TabsList className="w-full">
            <TabsTrigger value="grades" className="flex-1 gap-2">
              <BookOpen className="w-4 h-4" />
              Notes ({grades.length})
            </TabsTrigger>
            <TabsTrigger value="absences" className="flex-1 gap-2">
              <CalendarOff className="w-4 h-4" />
              Absences ({onlyAbsences.length})
            </TabsTrigger>
          </TabsList>

          {/* NOTES TAB */}
          <TabsContent value="grades" className="mt-4 space-y-4">
            {gradesBySemesterSubject.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Aucune note saisie pour cet étudiant dans vos matières.</p>
                </CardContent>
              </Card>
            ) : (
              gradesBySemesterSubject.map((sem) => (
                <Card key={sem.semesterName} className="overflow-hidden border-border shadow-sm">
                  <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">{sem.semesterName}</span>
                  </div>
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Matière</TableHead>
                        <TableHead className="text-center">Coef.</TableHead>
                        {Array.from({ length: maxEvals }, (_, i) => (
                          <TableHead key={i} className="text-center">Éval {i + 1}</TableHead>
                        ))}
                        <TableHead className="text-center font-semibold">Moyenne</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sem.subjects.map((s) => (
                        <TableRow key={s.subjectName}>
                          <TableCell className="font-medium">{s.subjectName}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{s.coefficient}</TableCell>
                          {Array.from({ length: maxEvals }, (_, i) => (
                            <TableCell key={i} className="text-center font-mono">
                              {s.evals[i + 1] !== undefined
                                ? <span className={s.evals[i + 1] < 10 ? "text-red-600 font-semibold" : "text-foreground"}>{s.evals[i + 1].toFixed(2)}</span>
                                : <span className="text-muted-foreground/50">—</span>}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            {s.avg !== null
                              ? <span className={`font-bold font-mono ${s.avg < 10 ? "text-red-600" : "text-emerald-600"}`}>{s.avg.toFixed(2)}</span>
                              : <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ABSENCES TAB */}
          <TabsContent value="absences" className="mt-4">
            {onlyAbsences.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CalendarOff className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Aucune absence ou retard enregistré dans vos cours.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden border-border shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Matière</TableHead>
                      <TableHead>Semestre</TableHead>
                      <TableHead className="text-center">Statut</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onlyAbsences.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-sm">
                          {new Date(a.sessionDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell className="text-sm">{a.subjectName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.semesterName}</TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={a.status} justified={a.justified} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
