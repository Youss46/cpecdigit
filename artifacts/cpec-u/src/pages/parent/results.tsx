import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { GraduationCap, ChevronDown, ChevronUp, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { motion } from "framer-motion";

function useParentProfile() {
  return useQuery({
    queryKey: ["/api/parent/profile"],
    queryFn: async () => {
      const res = await fetch("/api/parent/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json() as Promise<{ parent: any; students: Array<{ id: number; name: string; className?: string }> }>;
    },
  });
}

function useStudentResults(studentId: number | null) {
  return useQuery({
    queryKey: ["/api/parent/student", studentId, "results"],
    enabled: !!studentId,
    queryFn: async () => {
      const res = await fetch(`/api/parent/student/${studentId}/results`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json() as Promise<Array<{
        semesterId: number; semesterName: string; academicYear: string;
        grades: Array<{ subjectName: string; coefficient: number; grade: number; approved: boolean }>;
      }>>;
    },
  });
}

function avg(grades: Array<{ grade: number; coefficient: number }>) {
  const totalCoeff = grades.reduce((s, g) => s + (g.coefficient ?? 1), 0);
  if (totalCoeff === 0) return 0;
  return grades.reduce((s, g) => s + g.grade * (g.coefficient ?? 1), 0) / totalCoeff;
}

export default function ParentResults() {
  const { data: profile, isLoading: profileLoading } = useParentProfile();
  const students = profile?.students ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const studentId = selectedId ?? students[0]?.id ?? null;
  const { data: results, isLoading } = useStudentResults(studentId);
  const [openSem, setOpenSem] = useState<number | null>(null);

  return (
    <AppLayout allowedRoles={["parent"]}>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><GraduationCap className="w-6 h-6 text-violet-600" /> Résultats</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Résultats académiques publiés</p>
          </div>
          {students.length > 1 && (
            <Select value={String(studentId ?? "")} onValueChange={v => setSelectedId(Number(v))}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Sélectionner un enfant" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {profileLoading || isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !results?.length ? (
          <Card><CardContent className="p-6 flex items-center gap-3 text-muted-foreground text-sm"><AlertCircle className="w-4 h-4" /> Aucun résultat publié pour le moment.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {results.map(sem => {
              const mean = avg(sem.grades);
              const isOpen = openSem === sem.semesterId;
              return (
                <motion.div key={sem.semesterId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader
                      className="cursor-pointer select-none"
                      onClick={() => setOpenSem(isOpen ? null : sem.semesterId)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">{sem.semesterName}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">{sem.academicYear}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={mean >= 10 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-red-100 text-red-800 border-red-200"}>
                            Moy. {mean.toFixed(2)}/20
                          </Badge>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </CardHeader>
                    {isOpen && (
                      <CardContent className="pt-0">
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-xs">Matière</th>
                                <th className="text-center px-3 py-2 font-medium text-xs">Coeff.</th>
                                <th className="text-center px-3 py-2 font-medium text-xs">Note</th>
                                <th className="text-center px-3 py-2 font-medium text-xs">Statut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sem.grades.map((g, i) => (
                                <tr key={i} className="border-t border-border/40">
                                  <td className="px-3 py-2 font-medium">{g.subjectName}</td>
                                  <td className="px-3 py-2 text-center text-muted-foreground">{g.coefficient}</td>
                                  <td className="px-3 py-2 text-center font-semibold">{Number(g.grade).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-center">
                                    {g.approved
                                      ? <CheckCircle className="w-4 h-4 text-emerald-500 inline" />
                                      : <XCircle className="w-4 h-4 text-red-500 inline" />}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
