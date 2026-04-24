import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, GraduationCap, BookOpen,
  AlertTriangle, CheckCircle, Loader2, BarChart2, Activity,
  CalendarDays, Award,
} from "lucide-react";

const fmt = (n: number | null, dec = 2) =>
  n === null || n === undefined ? "—" : n.toFixed(dec);

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function AlertCard({ alert }: { alert: any }) {
  const styles: Record<string, string> = {
    critical: "bg-red-50 border-red-200 text-red-800",
    high:     "bg-orange-50 border-orange-200 text-orange-800",
    moderate: "bg-amber-50 border-amber-200 text-amber-800",
  };
  const icons: Record<string, JSX.Element> = {
    critical: <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />,
    high:     <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />,
    moderate: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
  };
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styles[alert.severity]}`}>
      {icons[alert.severity]}
      <p>{alert.message}</p>
    </div>
  );
}

function GradeZoneColor(avg: number | null): string {
  if (avg === null) return "#6b7280";
  if (avg >= 14) return "#10b981";
  if (avg >= 10) return "#3b82f6";
  if (avg >= 8)  return "#f59e0b";
  return "#ef4444";
}

export default function StudentSuiviPage() {
  const [activeTab, setActiveTab] = useState("progression");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/student/academic-tracking"],
    queryFn: async () => {
      const res = await fetch("/api/student/academic-tracking", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur chargement");
      return res.json();
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["student"]}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const semesters: any[] = data?.semesters ?? [];
  const indicators = data?.indicators ?? {};
  const alerts: any[] = data?.alerts ?? [];

  const chartData = semesters.map(s => ({
    name: s.semesterName,
    moyenne: s.average,
    classeAvg: s.classAverage,
  }));

  const latestSem = semesters[semesters.length - 1];

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-6 pb-10">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Mon Suivi Académique
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Évolution de vos résultats depuis le début de votre parcours
          </p>
        </div>

        {/* Alertes */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
          </div>
        )}

        {/* KPI indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center space-y-1">
            <GraduationCap className="w-6 h-6 text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">Moyenne actuelle</p>
            <p className={`text-2xl font-extrabold`} style={{ color: GradeZoneColor(indicators.currentAverage) }}>
              {fmt(indicators.currentAverage)}/20
            </p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <Award className="w-6 h-6 text-amber-500 mx-auto" />
            <p className="text-xs text-muted-foreground">Crédits validés</p>
            <p className="text-2xl font-extrabold text-foreground">{indicators.creditsEarned ?? "—"}</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <BarChart2 className="w-6 h-6 text-emerald-500 mx-auto" />
            <p className="text-xs text-muted-foreground">Rang dans la classe</p>
            <p className="text-2xl font-extrabold text-foreground">
              {indicators.currentRank ? `${indicators.currentRank}/${indicators.totalStudents}` : "—"}
            </p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <div className="flex justify-center"><TrendIcon trend={indicators.trend ?? "stable"} /></div>
            <p className="text-xs text-muted-foreground">Tendance</p>
            <p className={`text-sm font-bold ${indicators.trend === "up" ? "text-emerald-600" : indicators.trend === "down" ? "text-red-600" : "text-muted-foreground"}`}>
              {indicators.trend === "up" ? "En progression" : indicators.trend === "down" ? "En baisse" : "Stable"}
            </p>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-10">
            <TabsTrigger value="progression" className="gap-1.5 text-xs sm:text-sm">
              <TrendingUp className="w-4 h-4" />Progression
            </TabsTrigger>
            <TabsTrigger value="matieres" className="gap-1.5 text-xs sm:text-sm">
              <BookOpen className="w-4 h-4" />Par matière
            </TabsTrigger>
            <TabsTrigger value="absences" className="gap-1.5 text-xs sm:text-sm">
              <CalendarDays className="w-4 h-4" />Absences
            </TabsTrigger>
          </TabsList>

          {/* Progression curve */}
          <TabsContent value="progression" className="space-y-4">
            {semesters.length === 0 ? (
              <Card className="p-12 text-center">
                <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Aucune note enregistrée pour le moment.</p>
              </Card>
            ) : (
              <Card className="p-5">
                <h2 className="font-bold text-base mb-1">Évolution de la moyenne générale</h2>
                <p className="text-xs text-muted-foreground mb-4">Comparée à la moyenne de votre classe</p>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 20]} tickFormatter={v => `${v}/20`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}/20`, name === "moyenne" ? "Votre moyenne" : "Moy. classe"]} />
                    <Legend formatter={v => v === "moyenne" ? "Votre moyenne" : "Moy. classe"} />
                    <ReferenceLine y={10} stroke="#94a3b8" strokeDasharray="6 3" label={{ value: "Seuil validation", position: "insideTopRight", fontSize: 10, fill: "#64748b" }} />
                    <ReferenceLine y={8} stroke="#fca5a5" strokeDasharray="4 2" label={{ value: "Seuil alerte", position: "insideBottomRight", fontSize: 10, fill: "#ef4444" }} />
                    <Line type="monotone" dataKey="moyenne" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 5, fill: "#6366f1" }} activeDot={{ r: 7 }} />
                    <Line type="monotone" dataKey="classeAvg" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>

                {/* Zone legend */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {[
                    { color: "#10b981", label: "Très bien (≥ 14)" },
                    { color: "#3b82f6", label: "Satisfaisant (10–14)" },
                    { color: "#f59e0b", label: "En difficulté (8–10)" },
                    { color: "#ef4444", label: "En danger (< 8)" },
                  ].map(z => (
                    <div key={z.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: z.color }} />
                      {z.label}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Semester summaries */}
            <div className="space-y-3">
              {[...semesters].reverse().map(sem => (
                <Card key={sem.semesterId} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold">{sem.semesterName}</p>
                      <p className="text-xs text-muted-foreground">{sem.academicYear}</p>
                    </div>
                    <div className="text-right">
                      {sem.average !== null ? (
                        <p className="text-xl font-extrabold font-mono" style={{ color: GradeZoneColor(sem.average) }}>
                          {sem.average.toFixed(2)}/20
                        </p>
                      ) : <p className="text-muted-foreground text-sm">Notes en attente</p>}
                      {sem.rank && <p className="text-xs text-muted-foreground">Rang : {sem.rank}/{sem.totalStudents}</p>}
                    </div>
                  </div>
                  {sem.average !== null && (
                    <div className="w-full bg-muted rounded-full h-2 mb-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${Math.min((sem.average / 20) * 100, 100)}%`, background: GradeZoneColor(sem.average) }}
                      />
                    </div>
                  )}
                  {sem.creditsEarned !== undefined && (
                    <p className="text-xs text-muted-foreground">{sem.creditsEarned} crédits validés sur {sem.creditsTotal}</p>
                  )}
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Per subject */}
          <TabsContent value="matieres" className="space-y-4">
            {semesters.length === 0 ? (
              <Card className="p-12 text-center"><p className="text-muted-foreground">Aucune note disponible.</p></Card>
            ) : (
              [...semesters].reverse().map(sem => (
                <Card key={sem.semesterId} className="overflow-hidden">
                  <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between">
                    <p className="font-semibold">{sem.semesterName} <span className="text-xs font-normal text-muted-foreground">({sem.academicYear})</span></p>
                    {sem.average !== null && (
                      <span className="font-mono font-bold text-sm" style={{ color: GradeZoneColor(sem.average) }}>{sem.average.toFixed(2)}/20</span>
                    )}
                  </div>
                  <div className="divide-y">
                    {sem.subjects.map((sub: any) => (
                      <div key={sub.subjectId} className="flex items-center gap-3 px-5 py-2.5">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{sub.subjectName}</p>
                          <p className="text-xs text-muted-foreground">Coef. {sub.coefficient}</p>
                        </div>
                        <div className="text-right">
                          {sub.grade !== null ? (
                            <>
                              <span className="font-mono font-bold text-sm" style={{ color: GradeZoneColor(sub.grade) }}>
                                {sub.grade.toFixed(2)}/20
                              </span>
                              {sub.grade < 10 && <CheckCircle className="w-3 h-3 text-red-400 inline ml-1" />}
                            </>
                          ) : <span className="text-muted-foreground text-sm">—</span>}
                          {sub.retakeGrade !== null && (
                            <p className="text-xs text-amber-600">Rattrapage : {sub.retakeGrade.toFixed(2)}/20</p>
                          )}
                        </div>
                        {sub.grade !== null && (
                          <div className="w-24">
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full"
                                style={{ width: `${Math.min((sub.grade / 20) * 100, 100)}%`, background: GradeZoneColor(sub.grade) }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Absences */}
          <TabsContent value="absences" className="space-y-4">
            {semesters.length === 0 ? (
              <Card className="p-12 text-center"><p className="text-muted-foreground">Aucune donnée d'absence.</p></Card>
            ) : (
              [...semesters].reverse().map(sem => {
                const absences = sem.absences ?? [];
                if (absences.length === 0) return null;
                return (
                  <Card key={sem.semesterId} className="overflow-hidden">
                    <div className="px-5 py-3 bg-muted/30 border-b">
                      <p className="font-semibold">{sem.semesterName} <span className="text-xs font-normal text-muted-foreground">({sem.academicYear})</span></p>
                    </div>
                    <div className="divide-y">
                      {absences.map((abs: any) => (
                        <div key={abs.subjectName} className="flex items-center gap-3 px-5 py-2.5">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{abs.subjectName}</p>
                            <p className="text-xs text-muted-foreground">{abs.absent} absence{abs.absent > 1 ? "s" : ""} / {abs.total} séances</p>
                          </div>
                          <div className="text-right">
                            <span className={`font-semibold text-sm ${abs.absenceRate > 20 ? "text-red-600" : abs.absenceRate > 10 ? "text-amber-600" : "text-emerald-600"}`}>
                              {abs.absenceRate}%
                            </span>
                            {abs.absenceRate > 20 && <p className="text-xs text-red-500">⚠ Seuil dépassé</p>}
                          </div>
                          <div className="w-24">
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full"
                                style={{
                                  width: `${Math.min(abs.absenceRate * 4, 100)}%`,
                                  background: abs.absenceRate > 20 ? "#ef4444" : abs.absenceRate > 10 ? "#f59e0b" : "#10b981",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
