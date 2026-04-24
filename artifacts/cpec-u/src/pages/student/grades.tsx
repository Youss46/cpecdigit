import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetStudentResults, useListSemesters } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  AlertCircle, Award, CheckCircle2, XCircle, GraduationCap,
  TrendingUp, BookOpen, Trophy, WifiOff,
} from "lucide-react";
import { useOffline } from "@/lib/offline/offline-context";

export default function StudentGrades() {
  const { isOnline } = useOffline();
  const { data: semesters } = useListSemesters();

  const publishedSemesters = (semesters ?? []).filter((s: any) => s.published);
  const latest = [...publishedSemesters].sort((a: any, b: any) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const resolvedSemester = selectedSemester || (latest?.id?.toString() ?? "");

  const { data: results, isLoading, isError } = useGetStudentResults(
    { semesterId: parseInt(resolvedSemester) },
    { query: { enabled: !!resolvedSemester, retry: false } as any }
  );

  const ueResults: any[] = (results as any)?.ueResults ?? [];
  const creditsValidated: number = (results as any)?.creditsValidated ?? 0;
  const totalCredits: number = (results as any)?.totalCredits ?? 0;
  const hasUEs = ueResults.length > 0;

  const decisionColors = {
    Admis: "bg-emerald-500 text-white border-none",
    Ajourné: "bg-red-500 text-white border-none",
    default: "bg-secondary text-foreground",
  } as Record<string, string>;

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold font-serif text-foreground">Mes Résultats</h1>
                {!isOnline && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <WifiOff className="w-3 h-3" /> hors ligne
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-sm">Notes et moyennes par semestre</p>
            </div>
          </div>
        </motion.div>

        {/* Semester Selector */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
          <Select value={resolvedSemester} onValueChange={setSelectedSemester}>
            <SelectTrigger className="w-full sm:w-[300px] h-11 bg-card border-border shadow-sm">
              <SelectValue placeholder="Sélectionner un semestre" />
            </SelectTrigger>
            <SelectContent>
              {publishedSemesters.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">Aucun semestre publié</div>
              ) : (
                publishedSemesters.map((s: any) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name} — {s.academicYear}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </motion.div>

        {/* Content */}
        {!resolvedSemester ? (
          <Card className="border-dashed border-2 border-border bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="w-12 h-12 text-muted-foreground opacity-40 mb-4" />
              <p className="text-lg font-semibold text-foreground">Aucun semestre publié</p>
              <p className="text-muted-foreground mt-1 text-sm">Les résultats ne sont disponibles qu'après publication par la scolarité.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="py-24 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : isError || !results ? (
          <Card className="border-dashed border-2 border-border bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground opacity-40 mb-4" />
              <p className="text-lg font-semibold text-foreground">Résultats indisponibles</p>
              <p className="text-muted-foreground mt-1 text-sm">Les résultats de ce semestre ne sont pas encore publiés ou vous n'avez pas de notes.</p>
            </CardContent>
          </Card>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Average */}
              <Card className="col-span-2 sm:col-span-1 border-border shadow-sm">
                <CardContent className="p-5 text-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Moyenne Générale</p>
                  <p className={`text-4xl font-bold font-mono ${results.average == null ? "text-muted-foreground" : results.average >= 10 ? "text-emerald-600" : "text-red-500"}`}>{results.average?.toFixed(2) || "—"}</p>
                  {(results as any).absenceDeduction > 0 && (
                    <p className="text-xs text-red-500 font-medium mt-1">
                      −{(results as any).absenceDeduction.toFixed(2)} pt absences
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Rank or Credits */}
              {hasUEs ? (
                <Card className="border-border shadow-sm">
                  <CardContent className="p-5 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Classement</p>
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-4xl font-bold font-mono text-foreground">{results.rank || "—"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">sur {results.totalStudents} étudiant(s)</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border shadow-sm">
                  <CardContent className="p-5 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Classement</p>
                    <div className="flex items-center justify-center gap-1">
                      <Trophy className="w-5 h-5 text-amber-500" />
                      <p className="text-4xl font-bold font-mono text-foreground">{results.rank || "—"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">sur {results.totalStudents} étudiants</p>
                  </CardContent>
                </Card>
              )}

              {/* Decision */}
              <Card className={`border-none shadow-sm sm:col-span-2 flex flex-col justify-center items-center py-5 ${
                results.decision === "Admis" ? "bg-emerald-500 text-white" :
                results.decision === "Ajourné" ? "bg-red-500 text-white" : "bg-secondary text-foreground"
              }`}>
                <p className="text-xs font-semibold opacity-80 uppercase tracking-wider mb-1">Décision</p>
                <p className="text-3xl font-bold flex items-center gap-2">
                  {results.decision === "Admis" && <Award className="w-7 h-7" />}
                  {results.decision}
                </p>
              </Card>
            </div>

            {/* Grades detail */}
            {hasUEs ? (
              <div className="space-y-3">
                {ueResults.map((ue: any) => (
                  <div key={ue.ueId} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                    {/* UE Header */}
                    <div className="flex items-center justify-between px-5 py-4 bg-secondary/20 border-b border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary font-bold text-sm">{ue.ueCode}</span>
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{ue.ueName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {ue.acquis ? (
                              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <CheckCircle2 className="w-3 h-3" /> Acquis
                              </span>
                            ) : ue.average !== null ? (
                              <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
                                <XCircle className="w-3 h-3" /> Non acquis
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Moyenne UE</p>
                        <p className={`text-2xl font-bold font-mono ${
                          ue.average === null ? "text-muted-foreground" :
                          ue.average >= 10 ? "text-emerald-600" : "text-destructive"
                        }`}>
                          {ue.average !== null ? ue.average.toFixed(2) : "—"}
                        </p>
                      </div>
                    </div>
                    {/* Subjects */}
                    {ue.subjects?.length > 0 && (
                      <Table>
                        <TableHeader className="bg-secondary/10">
                          <TableRow>
                            <TableHead className="pl-16 text-xs">ECUE</TableHead>
                            <TableHead className="text-center text-xs">Coef.</TableHead>
                            <TableHead className="text-right pr-6 text-xs">Note /20</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ue.subjects.map((g: any, i: number) => (
                            <TableRow key={i} className="hover:bg-muted/30">
                              <TableCell className="font-medium text-foreground pl-16 py-3 text-sm">{g.subjectName}</TableCell>
                              <TableCell className="text-center text-muted-foreground text-sm">{g.coefficient}</TableCell>
                              <TableCell className="text-right pr-6 font-mono font-bold">
                                {g.value != null ? (
                                  <span className={g.value < 10 ? "text-destructive" : "text-emerald-600"}>{g.value.toFixed(2)}</span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                ))}

                {/* Subjects without UE */}
                {((results.grades ?? []) as any[]).filter((g: any) => !g.ueId || !ueResults.find((u: any) => u.ueId === g.ueId)).length > 0 && (
                  <div className="bg-card border border-dashed border-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-5 py-3 border-b border-border/50 bg-secondary/10">
                      <p className="text-sm font-semibold text-muted-foreground">Autres matières</p>
                    </div>
                    <Table>
                      <TableBody>
                        {(results.grades ?? []).filter((g: any) => !g.ueId || !ueResults.find((u: any) => u.ueId === g.ueId)).map((g: any, i: number) => (
                          <TableRow key={i} className="hover:bg-muted/30">
                            <TableCell className="font-bold text-foreground py-4">{g.subjectName}</TableCell>
                            <TableCell className="text-center text-muted-foreground font-semibold">{g.coefficient}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-lg">
                              {g.value != null ? (
                                <span className={g.value < 10 ? "text-destructive" : "text-emerald-600"}>{g.value.toFixed(2)}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              /* Flat grades table */
              <Card className="overflow-hidden border-border shadow-sm">
                <Table>
                  <TableHeader className="bg-secondary/30">
                    <TableRow>
                      <TableHead>Matière</TableHead>
                      <TableHead className="text-center">Coefficient</TableHead>
                      <TableHead className="text-right">Note /20</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.grades?.map((g: any, i: number) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-bold text-foreground py-4">{g.subjectName}</TableCell>
                        <TableCell className="text-center text-muted-foreground font-semibold">{g.coefficient}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-lg">
                          {g.value != null ? (
                            <span className={g.value < 10 ? "text-destructive" : "text-emerald-600"}>{g.value.toFixed(2)}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
