import { useState, useMemo, Fragment } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Line, ComposedChart,
} from "recharts";
import {
  Users, GraduationCap, TrendingUp, TrendingDown, Wallet, Building2, Printer,
  Download, Loader2, CheckCircle, XCircle, AlertTriangle,
  Trophy, BookOpen, UserX, DollarSign, BarChart2, CalendarDays,
  ArrowUp, ArrowDown, Minus, Lightbulb, Activity,
} from "lucide-react";

// ─── Palette ──────────────────────────────────────────────────────────────────
const PIE_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];
const BAR_COLOR = "#6366f1";
const GREEN = "#10b981";
const RED = "#ef4444";
const AMBER = "#f59e0b";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, dec = 1) => isNaN(n) || n === 0 ? "—" : n.toFixed(dec);
const fmtCurrency = (n: number) =>
  n === 0 ? "0 FCFA" : `${n.toLocaleString("fr-FR")} FCFA`;
const pct = (n: number) => `${fmt(n)}%`;

function KpiCard({
  icon: Icon, label, value, sub, color = "blue", loading,
}: {
  icon: any; label: string; value: string; sub?: string; color?: string; loading?: boolean;
}) {
  const bg: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200", green: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200", red: "bg-red-50 border-red-200",
    purple: "bg-violet-50 border-violet-200",
  };
  const iconColor: Record<string, string> = {
    blue: "text-blue-600", green: "text-emerald-600",
    amber: "text-amber-600", red: "text-red-600", purple: "text-violet-600",
  };
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${bg[color] ?? bg.blue}`}>
      <div className={`shrink-0 mt-0.5 ${iconColor[color] ?? iconColor.blue}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="flex items-center gap-1 mt-1"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <p className="text-2xl font-extrabold text-foreground leading-tight">{value}</p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCsv(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(";"), ...rows.map(r => headers.map(h => r[h] ?? "").join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [semesterId, setSemesterId] = useState<string>("all");
  const [classId, setClassId] = useState<string>("all");
  const [academicYear, setAcademicYear] = useState<string>("all");

  const { data: classes } = useQuery<any[]>({
    queryKey: ["/api/admin/classes"],
    queryFn: () => customFetch<any[]>("/api/admin/classes"),
    staleTime: 300000,
  });
  const { data: semesters } = useQuery<any[]>({
    queryKey: ["/api/admin/semesters"],
    queryFn: () => customFetch<any[]>("/api/admin/semesters"),
    staleTime: 300000,
  });

  const semParam = semesterId !== "all" ? `semesterId=${semesterId}&` : "";
  const classParam = classId !== "all" ? `classId=${classId}&` : "";
  const yearParam = academicYear !== "all" ? `academicYear=${encodeURIComponent(academicYear)}&` : "";

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["/api/admin/reports/overview", semesterId, classId, academicYear],
    queryFn: () => customFetch<any>(`/api/admin/reports/overview?${semParam}${classParam}${yearParam}`),
    staleTime: 60000,
  });
  const { data: results, isLoading: loadingResults } = useQuery({
    queryKey: ["/api/admin/reports/results", semesterId, classId],
    queryFn: () => customFetch<any>(`/api/admin/reports/results?${semParam}${classParam}`),
    staleTime: 60000,
  });
  const { data: absences, isLoading: loadingAbsences } = useQuery({
    queryKey: ["/api/admin/reports/absences", semesterId, classId],
    queryFn: () => customFetch<any>(`/api/admin/reports/absences?${semParam}${classParam}`),
    staleTime: 60000,
  });
  const { data: financial, isLoading: loadingFinancial } = useQuery({
    queryKey: ["/api/admin/reports/financial", academicYear],
    queryFn: () => customFetch<any>(`/api/admin/reports/financial?${yearParam}`),
    staleTime: 60000,
  });

  // ── Comparatif filters ─────────────────────────────────────────────────────
  const [cmpFiliere, setCmpFiliere] = useState<string>("all");
  const [failureThreshold, setFailureThreshold] = useState<number>(40);
  const cmpFiliereParam = cmpFiliere !== "all" ? `filiere=${encodeURIComponent(cmpFiliere)}&` : "";

  const { data: cmpData, isLoading: loadingCmp } = useQuery({
    queryKey: ["/api/admin/reports/comparatif", cmpFiliere],
    queryFn: () => customFetch<any>(`/api/admin/reports/comparatif?${cmpFiliereParam}`),
    staleTime: 60000,
    enabled: activeTab === "comparatif",
  });

  // Dérive les années académiques disponibles depuis les semestres
  const academicYears = useMemo(() => {
    const set = new Set<string>();
    semesters?.forEach((s: any) => { if (s.academicYear) set.add(s.academicYear); });
    return Array.from(set).sort().reverse();
  }, [semesters]);

  const mentionsPieData = results ? [
    { name: "Très Bien (≥16)", value: results.mentions.tresBien },
    { name: "Bien (14-16)", value: results.mentions.bien },
    { name: "Assez Bien (12-14)", value: results.mentions.assezBien },
    { name: "Passable (10-12)", value: results.mentions.passable },
    { name: "Ajourné (<10)", value: results.mentions.ajourne },
  ] : [];

  // Filtre globaux
  const Filters = (
    <div className="flex flex-wrap gap-3 items-center print:hidden">
      <Select value={semesterId} onValueChange={setSemesterId}>
        <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Semestre" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les semestres</SelectItem>
          {semesters?.map((s: any) => (
            <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={classId} onValueChange={setClassId}>
        <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Classe" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les classes</SelectItem>
          {classes?.map((c: any) => (
            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={academicYear} onValueChange={setAcademicYear}>
        <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="Année académique" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les années</SelectItem>
          {academicYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
        <Printer className="w-4 h-4" />Imprimer
      </Button>
    </div>
  );

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6 pb-10">
        {/* En-tête */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:mb-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-primary" />
              Rapports & Statistiques
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Analyse complète des données académiques, présences et finances
            </p>
          </div>
          {Filters}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 h-11 print:hidden">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
              <BarChart2 className="w-4 h-4" /><span className="hidden sm:inline">Vue Générale</span><span className="sm:hidden">Général</span>
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-1.5 text-xs sm:text-sm">
              <GraduationCap className="w-4 h-4" /><span className="hidden sm:inline">Résultats</span><span className="sm:hidden">Résultats</span>
            </TabsTrigger>
            <TabsTrigger value="absences" className="gap-1.5 text-xs sm:text-sm">
              <Users className="w-4 h-4" /><span className="hidden sm:inline">Absences</span><span className="sm:hidden">Absences</span>
            </TabsTrigger>
            <TabsTrigger value="financial" className="gap-1.5 text-xs sm:text-sm">
              <Wallet className="w-4 h-4" /><span className="hidden sm:inline">Financier</span><span className="sm:hidden">Finances</span>
            </TabsTrigger>
            <TabsTrigger value="comparatif" className="gap-1.5 text-xs sm:text-sm">
              <CalendarDays className="w-4 h-4" /><span className="hidden sm:inline">Comparatif</span><span className="sm:hidden">Évolution</span>
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ VUE GÉNÉRALE ════════════════════════════════════════════ */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={Users} label="Étudiants inscrits" color="blue"
                value={loadingOverview ? "…" : (overview?.totalStudents ?? 0).toString()} loading={loadingOverview}
                sub={`${overview?.totalTeachers ?? "—"} enseignants`} />
              <KpiCard icon={GraduationCap} label="Taux de réussite" color="green"
                value={loadingOverview ? "…" : pct(overview?.successRate ?? 0)} loading={loadingOverview}
                sub={`Moy. générale : ${fmt(overview?.avgGrade ?? 0)}/20`} />
              <KpiCard icon={TrendingUp} label="Taux de présence" color="purple"
                value={loadingOverview ? "…" : pct(overview?.presenceRate ?? 0)} loading={loadingOverview}
                sub="sur toutes les séances" />
              <KpiCard icon={Wallet} label="Recouvrement" color="amber"
                value={loadingOverview ? "…" : pct(overview?.recoveryRate ?? 0)} loading={loadingOverview}
                sub={fmtCurrency(overview?.totalPaid ?? 0)} />
            </div>

            {/* Genre Pie chart */}
            {!loadingOverview && (overview?.garcons > 0 || overview?.filles > 0) && (() => {
              const genderPie = [
                { name: "Garçons", value: overview?.garcons ?? 0 },
                { name: "Filles", value: overview?.filles ?? 0 },
              ];
              const GENRE_COLORS = ["#3b82f6", "#ec4899"];
              const gTotal = (overview?.garcons ?? 0) + (overview?.filles ?? 0);
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <Card className="p-5">
                    <h2 className="font-bold text-base mb-3">Répartition Filles / Garçons</h2>
                    <div className="flex items-center gap-6">
                      <ResponsiveContainer width={140} height={140}>
                        <PieChart>
                          <Pie data={genderPie} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30}
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {genderPie.map((_, i) => <Cell key={i} fill={GENRE_COLORS[i]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any, name: string) => [`${v} étudiant${Number(v) !== 1 ? "s" : ""}`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-blue-700">Garçons</p>
                            <p className="text-xs text-muted-foreground">{overview?.garcons ?? 0} — {gTotal > 0 ? Math.round(((overview?.garcons ?? 0) / gTotal) * 100) : 0}%</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-pink-500 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-pink-700">Filles</p>
                            <p className="text-xs text-muted-foreground">{overview?.filles ?? 0} — {gTotal > 0 ? Math.round(((overview?.filles ?? 0) / gTotal) * 100) : 0}%</p>
                          </div>
                        </div>
                        {(overview?.totalStudents ?? 0) > (overview?.totalWithSexe ?? 0) && (
                          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1">
                            {(overview?.totalStudents ?? 0) - (overview?.totalWithSexe ?? 0)} genre(s) non renseigné(s)
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                  {/* Genre par classe */}
                  {(overview?.kpisByClass?.filter((c: any) => c.garcons > 0 || c.filles > 0).length ?? 0) > 0 && (
                    <Card className="p-5">
                      <h2 className="font-bold text-base mb-3">Genre par classe</h2>
                      <div className="space-y-2">
                        {overview.kpisByClass.map((cls: any) => {
                          const t = (cls.garcons ?? 0) + (cls.filles ?? 0);
                          if (t === 0) return null;
                          const pG = Math.round(((cls.garcons ?? 0) / t) * 100);
                          const pF = 100 - pG;
                          return (
                            <div key={cls.class_id} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium truncate max-w-[120px]">{cls.class_name}</span>
                                <span className="text-muted-foreground">👨{cls.garcons ?? 0} · 👩{cls.filles ?? 0}</span>
                              </div>
                              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                                <div className="bg-blue-400 h-full transition-all" style={{ width: `${pG}%` }} />
                                <div className="bg-pink-400 h-full transition-all" style={{ width: `${pF}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* KPIs secondaires */}
              <Card className="p-5 space-y-4">
                <h2 className="font-bold text-base">Récapitulatif établissement</h2>
                <div className="space-y-3 divide-y divide-border">
                  {[
                    { label: "Total étudiants", value: overview?.totalStudents, icon: Users },
                    { label: "Total enseignants", value: overview?.totalTeachers, icon: BookOpen },
                    { label: "Personnel administratif", value: overview?.totalAdmins, icon: Users },
                    { label: "Étudiants en hébergement", value: overview?.housingStudents, icon: Building2 },
                    { label: "Frais attendus", value: fmtCurrency(overview?.totalDue ?? 0), raw: true },
                    { label: "Frais perçus", value: fmtCurrency(overview?.totalPaid ?? 0), raw: true },
                  ].map(({ label, value, icon: Icon, raw }) => (
                    <div key={label} className="flex items-center justify-between pt-3 first:pt-0">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        {Icon && <Icon className="w-3.5 h-3.5" />}{label}
                      </span>
                      <span className="font-bold text-sm">{loadingOverview ? "…" : (raw ? value : (value ?? 0))}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Graphique KPIs par classe */}
              <Card className="p-5">
                <h2 className="font-bold text-base mb-4">Moyenne générale par classe</h2>
                {loadingOverview ? (
                  <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : (overview?.kpisByClass?.length ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Aucune donnée disponible</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={overview.kpisByClass} margin={{ left: -15 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="class_name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)}/20`, "Moy."]} />
                      <Bar dataKey="avg_grade" name="Moyenne" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* ═══════════ RÉSULTATS ═══════════════════════════════════════════════ */}
          <TabsContent value="results" className="space-y-6">
            {/* KPIs résultats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={GraduationCap} label="Taux de réussite" color="green"
                value={loadingResults ? "…" : pct(results?.mentions.total > 0 ? Math.round(((results?.mentions.tresBien + results?.mentions.bien + results?.mentions.assezBien + results?.mentions.passable) / results?.mentions.total) * 1000) / 10 : 0)}
                loading={loadingResults} sub={`${results?.mentions.total ?? 0} étudiants évalués`} />
              <KpiCard icon={Trophy} label="Mention Très Bien" color="green"
                value={loadingResults ? "…" : (results?.mentions.tresBien ?? 0).toString()} loading={loadingResults} />
              <KpiCard icon={CheckCircle} label="Ajourné(e)s" color="red"
                value={loadingResults ? "…" : (results?.mentions.ajourne ?? 0).toString()} loading={loadingResults} />
              <KpiCard icon={BarChart2} label="Moy. générale" color="blue"
                value={loadingResults ? "…" : `${fmt(results?.avgGrade ?? 0)}/20`} loading={loadingResults} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Camembert des mentions */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-base">Répartition des mentions</h2>
                  <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                    onClick={() => exportCsv([results?.mentions ?? {}], "mentions.csv")}>
                    <Download className="w-3.5 h-3.5" />CSV
                  </Button>
                </div>
                {loadingResults ? (
                  <div className="flex items-center justify-center h-52"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : (results?.mentions.total ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">Aucune note saisie</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={mentionsPieData} dataKey="value" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                        {mentionsPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {/* Taux de réussite par classe */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-base">Taux de réussite par classe</h2>
                  <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                    onClick={() => exportCsv(results?.byClass ?? [], "resultats-classes.csv")}>
                    <Download className="w-3.5 h-3.5" />CSV
                  </Button>
                </div>
                {loadingResults ? (
                  <div className="flex items-center justify-center h-52"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : (results?.byClass?.length ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">Aucune donnée</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={results.byClass} margin={{ left: -15 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v: any) => [`${v}%`, "Taux réussite"]} />
                      <Bar dataKey="successRate" name="Taux réussite" fill={GREEN} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>

            {/* Taux de réussite par matière */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base">Taux de réussite par matière (classement croissant)</h2>
                <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                  onClick={() => exportCsv(results?.bySubject ?? [], "resultats-matieres.csv")}>
                  <Download className="w-3.5 h-3.5" />CSV
                </Button>
              </div>
              {loadingResults ? (
                <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (results?.bySubject?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={results.bySubject} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="subjectName" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "Taux réussite"]} />
                    <Bar dataKey="successRate" name="Taux réussite" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Top / Bottom étudiants */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" />Meilleures moyennes
                  </h2>
                  <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                    onClick={() => exportCsv(results?.topStudents ?? [], "top-etudiants.csv")}>
                    <Download className="w-3.5 h-3.5" />CSV
                  </Button>
                </div>
                {loadingResults ? <div className="h-40 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
                  <div className="divide-y divide-border">
                    {(results?.topStudents ?? []).slice(0, 8).map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 text-sm">
                        <div>
                          <span className="font-semibold">{s.name}</span>
                          <span className="text-muted-foreground text-xs ml-2">{s.className}</span>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-800 border-0">{fmt(s.avgGrade)}/20</Badge>
                      </div>
                    ))}
                    {(results?.topStudents ?? []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Aucune donnée</p>}
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />Moyennes les plus faibles
                  </h2>
                  <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                    onClick={() => exportCsv(results?.bottomStudents ?? [], "bas-etudiants.csv")}>
                    <Download className="w-3.5 h-3.5" />CSV
                  </Button>
                </div>
                {loadingResults ? <div className="h-40 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
                  <div className="divide-y divide-border">
                    {(results?.bottomStudents ?? []).slice(0, 8).map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 text-sm">
                        <div>
                          <span className="font-semibold">{s.name}</span>
                          <span className="text-muted-foreground text-xs ml-2">{s.className}</span>
                        </div>
                        <Badge className={`border-0 ${s.avgGrade >= 10 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                          {fmt(s.avgGrade)}/20
                        </Badge>
                      </div>
                    ))}
                    {(results?.bottomStudents ?? []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Aucune donnée</p>}
                  </div>
                )}
              </Card>
            </div>

            {/* Session normale vs rattrapage */}
            {results?.retakeStats?.students > 0 && (
              <Card className="p-5">
                <h2 className="font-bold text-base mb-4">Session normale vs Rattrapage</h2>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-2xl font-extrabold">{results.retakeStats.students}</p>
                    <p className="text-xs text-muted-foreground mt-1">Étudiants en rattrapage</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-4">
                    <p className="text-2xl font-extrabold text-emerald-700">{results.retakeStats.passed}</p>
                    <p className="text-xs text-muted-foreground mt-1">Admis après rattrapage</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-4">
                    <p className="text-2xl font-extrabold text-blue-700">{fmt(results.retakeStats.avgGrade)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Moy. en rattrapage</p>
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ═══════════ ABSENCES ════════════════════════════════════════════════ */}
          <TabsContent value="absences" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={TrendingUp} label="Taux de présence" color="green"
                value={loadingAbsences ? "…" : pct(absences?.globalRate.presenceRate ?? 0)}
                loading={loadingAbsences} sub={`${absences?.globalRate.total ?? 0} pointages`} />
              <KpiCard icon={CheckCircle} label="Absences justifiées" color="blue"
                value={loadingAbsences ? "…" : (absences?.globalRate.justified ?? 0).toString()}
                loading={loadingAbsences} />
              <KpiCard icon={XCircle} label="Absences injustifiées" color="red"
                value={loadingAbsences ? "…" : (absences?.globalRate.unjustified ?? 0).toString()}
                loading={loadingAbsences} />
              <KpiCard icon={UserX} label="Au-dessus du seuil" color="amber"
                value={loadingAbsences ? "…" : (absences?.aboveThreshold.length ?? 0).toString()}
                loading={loadingAbsences} sub="≥ 3 absences / matière" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Justifiées vs injustifiées */}
              <Card className="p-5">
                <h2 className="font-bold text-base mb-4">Absences : justifiées vs injustifiées</h2>
                {loadingAbsences ? (
                  <div className="flex items-center justify-center h-52"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Présences", value: absences?.globalRate.present ?? 0 },
                          { name: "Justifiées", value: absences?.globalRate.justified ?? 0 },
                          { name: "Injustifiées", value: absences?.globalRate.unjustified ?? 0 },
                        ]}
                        dataKey="value" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, percent }) => percent > 0.03 ? `${(percent * 100).toFixed(0)}%` : ""}>
                        {[GREEN, "#3b82f6", RED].map((c, i) => <Cell key={i} fill={c} />)}
                      </Pie>
                      <Tooltip /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {/* Taux de présence par classe */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-base">Présence par classe</h2>
                  <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                    onClick={() => exportCsv(absences?.byClass ?? [], "absences-classes.csv")}>
                    <Download className="w-3.5 h-3.5" />CSV
                  </Button>
                </div>
                {loadingAbsences ? (
                  <div className="flex items-center justify-center h-52"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : (absences?.byClass?.length ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">Aucune donnée</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={absences.byClass} margin={{ left: -15 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${v}%`, "Présence"]} />
                      <Bar dataKey="presenceRate" name="Présence" fill={GREEN} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>

            {/* Évolution hebdomadaire */}
            {(absences?.weeklyEvolution?.length ?? 0) > 0 && (
              <Card className="p-5">
                <h2 className="font-bold text-base mb-4">Évolution hebdomadaire des présences</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={absences.weeklyEvolution} margin={{ left: -15 }}>
                    <defs>
                      <linearGradient id="presGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="weekStart" tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "Taux présence"]}
                      labelFormatter={(v: string) => `Semaine du ${new Date(v).toLocaleDateString("fr-FR")}`} />
                    <Area type="monotone" dataKey="presenceRate" stroke={GREEN} strokeWidth={2} fill="url(#presGrad)" name="Présence" />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Matières avec le plus d'absences */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base">Matières avec le plus d'absences</h2>
                <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                  onClick={() => exportCsv(absences?.bySubject ?? [], "absences-matieres.csv")}>
                  <Download className="w-3.5 h-3.5" />CSV
                </Button>
              </div>
              {loadingAbsences ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (absences?.bySubject?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={absences.bySubject} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="subjectName" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "Taux absence"]} />
                    <Bar dataKey="absenceRate" name="Taux absence" fill={RED} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Étudiants au-dessus du seuil */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Étudiants au-dessus du seuil d'absence critique
                </h2>
                <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                  onClick={() => exportCsv(absences?.aboveThreshold ?? [], "seuil-absences.csv")}>
                  <Download className="w-3.5 h-3.5" />CSV
                </Button>
              </div>
              {loadingAbsences ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (absences?.aboveThreshold?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-24 gap-2 text-emerald-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />Aucun étudiant au-dessus du seuil
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Étudiant</th>
                      <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Classe</th>
                      <th className="text-right py-2 font-semibold text-muted-foreground">Nb absences</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {absences.aboveThreshold.map((s: any, i: number) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium">{s.studentName}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{s.className}</td>
                          <td className="py-2 text-right">
                            <Badge className={`border-0 ${s.absenceCount >= 6 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                              {s.absenceCount}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ═══════════ FINANCIER ═══════════════════════════════════════════════ */}
          <TabsContent value="financial" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={DollarSign} label="Frais attendus" color="blue"
                value={loadingFinancial ? "…" : fmtCurrency(financial?.totalDue ?? 0)} loading={loadingFinancial} />
              <KpiCard icon={CheckCircle} label="Frais perçus" color="green"
                value={loadingFinancial ? "…" : fmtCurrency(financial?.totalPaid ?? 0)} loading={loadingFinancial} />
              <KpiCard icon={XCircle} label="Solde impayé" color="red"
                value={loadingFinancial ? "…" : fmtCurrency(financial?.totalBalance ?? 0)} loading={loadingFinancial} />
              <KpiCard icon={TrendingUp} label="Taux recouvrement" color="amber"
                value={loadingFinancial ? "…" : pct(financial?.recoveryRate ?? 0)} loading={loadingFinancial} />
            </div>

            {/* Graphique par classe */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base">Frais par classe</h2>
                <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                  onClick={() => exportCsv(financial?.byClass ?? [], "finances-classes.csv")}>
                  <Download className="w-3.5 h-3.5" />CSV
                </Button>
              </div>
              {loadingFinancial ? (
                <div className="flex items-center justify-center h-52"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (financial?.byClass?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">Aucune donnée financière</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={financial.byClass} margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()} />
                    <Tooltip formatter={(v: any) => [fmtCurrency(Number(v)), ""]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="totalDue" name="Attendu" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="totalPaid" name="Perçu" fill={GREEN} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Taux recouvrement par classe */}
            <Card className="p-5">
              <h2 className="font-bold text-base mb-4">Taux de recouvrement par classe</h2>
              {loadingFinancial ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (financial?.byClass?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Aucune donnée</div>
              ) : (
                <div className="space-y-3">
                  {financial.byClass.map((c: any) => (
                    <div key={c.classId} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{c.className}</span>
                        <span className={`font-bold ${c.recoveryRate >= 80 ? "text-emerald-600" : c.recoveryRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                          {c.recoveryRate > 0 ? `${c.recoveryRate}%` : "—"}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${c.recoveryRate >= 80 ? "bg-emerald-500" : c.recoveryRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(c.recoveryRate, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Liste étudiants impayés */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Étudiants en situation d'impayé
                  {(financial?.unpaidStudents?.length ?? 0) > 0 && (
                    <Badge className="bg-red-100 text-red-800 border-0">{financial.unpaidStudents.length}</Badge>
                  )}
                </h2>
                <Button variant="outline" size="sm" className="gap-1.5 print:hidden"
                  onClick={() => exportCsv(financial?.unpaidStudents ?? [], "impayes.csv")}>
                  <Download className="w-3.5 h-3.5" />CSV
                </Button>
              </div>
              {loadingFinancial ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (financial?.unpaidStudents?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-24 gap-2 text-emerald-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />Tous les étudiants sont à jour
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Étudiant</th>
                      <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Classe</th>
                      <th className="text-right py-2 pr-4 font-semibold text-muted-foreground">Attendu</th>
                      <th className="text-right py-2 pr-4 font-semibold text-muted-foreground">Payé</th>
                      <th className="text-right py-2 font-semibold text-muted-foreground">Reste</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {financial.unpaidStudents.map((s: any, i: number) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium">{s.studentName}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{s.className}</td>
                          <td className="py-2 pr-4 text-right text-xs">{fmtCurrency(s.totalDue)}</td>
                          <td className="py-2 pr-4 text-right text-xs text-emerald-700">{fmtCurrency(s.totalPaid)}</td>
                          <td className="py-2 text-right">
                            <Badge className="bg-red-100 text-red-800 border-0 text-xs">{fmtCurrency(s.balance)}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
          {/* ═══════════ COMPARATIF MULTI-ANNÉES ════════════════════════════════ */}
          <TabsContent value="comparatif" className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={cmpFiliere} onValueChange={setCmpFiliere}>
                <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="Filière" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les filières</SelectItem>
                  {(cmpData?.filieres ?? []).map((f: string) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Seuil d'échec :</span>
                <input
                  type="number" min={10} max={80} value={failureThreshold}
                  onChange={e => setFailureThreshold(Number(e.target.value))}
                  className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm text-center"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>

            {loadingCmp ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !cmpData || (cmpData.yearlyKpis?.length ?? 0) === 0 ? (
              <Card className="p-12 text-center">
                <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Aucune donnée historique disponible.</p>
                <p className="text-xs text-muted-foreground mt-1">Les données apparaîtront dès que des notes seront enregistrées sur plusieurs années académiques.</p>
              </Card>
            ) : (() => {
              const kpis: any[] = cmpData.yearlyKpis ?? [];
              const latest = kpis[kpis.length - 1];
              const prev   = kpis.length >= 2 ? kpis[kpis.length - 2] : null;

              // Subject analysis: group by subject, collect yearly failure rates
              const subjectMap = new Map<number, { name: string; years: Record<string, number>; avgs: Record<string, number> }>();
              for (const row of (cmpData.subjectByYear ?? [])) {
                if (!subjectMap.has(row.subjectId)) {
                  subjectMap.set(row.subjectId, { name: row.subjectName, years: {}, avgs: {} });
                }
                const s = subjectMap.get(row.subjectId)!;
                s.years[row.academicYear] = row.failureRate;
                s.avgs[row.academicYear]  = row.avgGrade;
              }

              // Teacher map: subjectId+year → teacher name
              const teacherMap = new Map<string, string[]>();
              for (const row of (cmpData.teacherBySubjectYear ?? [])) {
                const key = `${row.subjectId}__${row.academicYear}`;
                if (!teacherMap.has(key)) teacherMap.set(key, []);
                teacherMap.get(key)!.push(row.teacherName);
              }

              const allYears = kpis.map((k: any) => k.academicYear);

              // Detect recurring problem subjects (failure > threshold on 2+ consecutive years)
              const problemSubjects: { name: string; status: "recurring"|"watch"|"improving"; yearData: any[]; trend: number }[] = [];
              for (const [subjectId, { name, years, avgs }] of subjectMap.entries()) {
                const yearRates = allYears.map(y => ({ year: y, rate: years[y] ?? null, avg: avgs[y] ?? null, teachers: (teacherMap.get(`${subjectId}__${y}`) ?? []).join(", ") })).filter(r => r.rate !== null);
                if (yearRates.length < 1) continue;

                let recurringCount = 0;
                for (let i = 1; i < yearRates.length; i++) {
                  if ((yearRates[i].rate ?? 0) > failureThreshold && (yearRates[i-1].rate ?? 0) > failureThreshold) recurringCount++;
                }

                const rates = yearRates.map(r => r.rate ?? 0);
                const trend = rates.length >= 2 ? (rates[rates.length-1] - rates[0]) / (rates.length - 1) : 0;

                let status: "recurring"|"watch"|"improving";
                if (recurringCount >= 2) status = "recurring";
                else if (recurringCount >= 1) status = "watch";
                else status = "improving";

                if (yearRates.some(r => (r.rate ?? 0) > failureThreshold)) {
                  problemSubjects.push({ name, status, yearData: yearRates, trend });
                }
              }
              problemSubjects.sort((a, b) => {
                const order = { recurring: 0, watch: 1, improving: 2 };
                return order[a.status] - order[b.status];
              });

              // Auto-generated recommendations
              const recommendations: { icon: string; text: string; color: string }[] = [];

              for (const sub of problemSubjects) {
                if (sub.status === "recurring") {
                  recommendations.push({ icon: "🔴", text: `"${sub.name}" présente un taux d'échec récurrent > ${failureThreshold}% — Révision du contenu ou changement d'enseignant recommandé`, color: "red" });
                }
              }
              if (prev && latest) {
                const dropPts = prev.passRate - latest.passRate;
                if (dropPts > 5) recommendations.push({ icon: "🟠", text: `Baisse du taux de réussite de ${dropPts.toFixed(1)} pts en ${latest.academicYear} — Audit pédagogique de la promotion recommandé`, color: "amber" });
              }
              const risingStreak = (() => {
                let streak = 0;
                for (let i = kpis.length - 1; i > 0; i--) {
                  if (kpis[i].passRate > kpis[i-1].passRate) streak++;
                  else break;
                }
                return streak;
              })();
              if (risingStreak >= 3) recommendations.push({ icon: "🟢", text: `Taux de réussite en hausse depuis ${risingStreak} années consécutives — Bonnes pratiques à documenter et partager`, color: "green" });

              const avgAbsence = (cmpData.absenceByYear ?? []).reduce((s: number, r: any) => s + r.absenceRate, 0) / Math.max((cmpData.absenceByYear?.length ?? 1), 1);
              if (avgAbsence > 25) recommendations.push({ icon: "🟡", text: `Taux d'absence moyen de ${avgAbsence.toFixed(1)}% — Renforcement du suivi de présence recommandé`, color: "amber" });

              // Teacher comparison data grouped by teacher
              const tcMap = new Map<number, { name: string; years: any[] }>();
              for (const row of (cmpData.teacherComparison ?? [])) {
                if (!tcMap.has(row.teacherId)) tcMap.set(row.teacherId, { name: row.teacherName, years: [] });
                tcMap.get(row.teacherId)!.years.push(row);
              }
              const teacherList = Array.from(tcMap.values()).filter(t => t.years.length >= 2);

              const TrendIcon = ({ val }: { val: number }) =>
                val > 2 ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> :
                val < -2 ? <ArrowDown className="w-3.5 h-3.5 text-red-500" /> :
                <Minus className="w-3.5 h-3.5 text-muted-foreground" />;

              return (
                <>
                  {/* KPI cards (latest year) */}
                  {latest && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <KpiCard icon={GraduationCap} label={`Réussite ${latest.academicYear}`} color="green"
                        value={`${latest.passRate}%`}
                        sub={prev ? `${latest.passRate > prev.passRate ? "+" : ""}${(latest.passRate - prev.passRate).toFixed(1)} pts vs ${prev.academicYear}` : `${latest.totalStudents} étudiants`} />
                      <KpiCard icon={BookOpen} label="Moyenne générale" color="blue"
                        value={`${fmt(latest.avgGrade)}/20`}
                        sub={prev ? `${latest.avgGrade > prev.avgGrade ? "+" : ""}${(latest.avgGrade - prev.avgGrade).toFixed(2)} vs an dernier` : "Toutes matières"} />
                      <KpiCard icon={Activity} label="Taux rattrapage" color="amber"
                        value={`${latest.retakeRate}%`}
                        sub={`${latest.retakeStudents} étudiant${latest.retakeStudents > 1 ? "s" : ""} en session 2`} />
                      <KpiCard icon={AlertTriangle} label="Jury spécial" color="red"
                        value={`${latest.juryRate}%`}
                        sub={`${latest.juryStudents} dossier${latest.juryStudents > 1 ? "s" : ""} délibérés`} />
                    </div>
                  )}

                  {/* Main evolution chart */}
                  <Card className="p-5">
                    <h2 className="font-bold text-base mb-1">Évolution par année académique</h2>
                    <p className="text-xs text-muted-foreground mb-4">Taux de réussite, rattrapage et moyenne générale</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={kpis} margin={{ left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="academicYear" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 20]} tickFormatter={v => `${v}/20`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any, name: string) => {
                          if (name === "Moy. générale") return [`${Number(v).toFixed(2)}/20`, name];
                          return [`${Number(v).toFixed(1)}%`, name];
                        }} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="passRate" name="Taux de réussite" fill="#10b981" radius={[3,3,0,0]} />
                        <Bar yAxisId="left" dataKey="retakeRate" name="Taux rattrapage" fill="#f59e0b" radius={[3,3,0,0]} />
                        <Bar yAxisId="left" dataKey="failureRate" name="Taux d'échec" fill="#ef4444" radius={[3,3,0,0]} />
                        <Line yAxisId="right" type="monotone" dataKey="avgGrade" name="Moy. générale" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Card>

                  {/* Absence trend */}
                  {(cmpData.absenceByYear?.length ?? 0) > 0 && (
                    <Card className="p-5">
                      <h2 className="font-bold text-base mb-1">Évolution du taux d'absence</h2>
                      <p className="text-xs text-muted-foreground mb-4">Proportion de séances avec absence enregistrée</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={cmpData.absenceByYear} margin={{ left: -10 }}>
                          <defs>
                            <linearGradient id="absGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="academicYear" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Taux d'absence"]} />
                          <Area type="monotone" dataKey="absenceRate" name="Taux d'absence" stroke="#f59e0b" strokeWidth={2} fill="url(#absGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Card>
                  )}

                  {/* Problem subjects table */}
                  {problemSubjects.length > 0 && (
                    <Card className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="font-bold text-base">Matières à taux d'échec élevé</h2>
                          <p className="text-xs text-muted-foreground">Seuil : {failureThreshold}% · Récurrent = même seuil dépassé 2 années consécutives</p>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                          onClick={() => exportCsv(problemSubjects.map(s => ({
                            Matière: s.name,
                            Statut: s.status === "recurring" ? "Récurrent" : s.status === "watch" ? "Surveillance" : "Amélioration",
                            ...Object.fromEntries(s.yearData.map(y => [y.year, `${y.rate?.toFixed(1)}%`])),
                          })), "matieres-problematiques.csv")}>
                          <Download className="w-3.5 h-3.5" />CSV
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Matière</th>
                              {allYears.map(y => (
                                <th key={y} className="text-center py-2 px-2 font-semibold text-muted-foreground whitespace-nowrap">{y}</th>
                              ))}
                              <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Tendance</th>
                              <th className="text-center py-2 font-semibold text-muted-foreground">Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {problemSubjects.map((sub, i) => {
                              const yearRateMap = Object.fromEntries(sub.yearData.map(y => [y.year, y]));
                              return (
                                <tr key={i} className="hover:bg-muted/30">
                                  <td className="py-2 pr-4 font-medium max-w-[200px] truncate" title={sub.name}>{sub.name}</td>
                                  {allYears.map(y => {
                                    const d = yearRateMap[y];
                                    const rate = d?.rate ?? null;
                                    const teachers = d?.teachers;
                                    return (
                                      <td key={y} className="py-2 px-2 text-center" title={teachers ? `Enseignant : ${teachers}` : undefined}>
                                        {rate === null ? (
                                          <span className="text-muted-foreground text-xs">—</span>
                                        ) : (
                                          <span className={`text-xs font-semibold rounded px-1.5 py-0.5 ${rate > failureThreshold ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                                            {rate.toFixed(0)}%
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="py-2 px-3 text-center">
                                    <TrendIcon val={-sub.trend} />
                                  </td>
                                  <td className="py-2 text-center">
                                    {sub.status === "recurring" && <Badge className="bg-red-100 text-red-700 border-0 text-xs">🔴 Récurrent</Badge>}
                                    {sub.status === "watch"     && <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">🟡 Surveillance</Badge>}
                                    {sub.status === "improving" && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">🟢 Amélioration</Badge>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {/* Recommendations */}
                  {recommendations.length > 0 && (
                    <Card className="p-5">
                      <h2 className="font-bold text-base mb-3 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-amber-500" />
                        Recommandations pédagogiques
                      </h2>
                      <div className="space-y-3">
                        {recommendations.map((r, i) => (
                          <div key={i} className={`flex items-start gap-3 rounded-lg p-3 border ${
                            r.color === "red" ? "bg-red-50 border-red-200" :
                            r.color === "amber" ? "bg-amber-50 border-amber-200" :
                            "bg-emerald-50 border-emerald-200"
                          }`}>
                            <span className="text-lg leading-none mt-0.5 shrink-0">{r.icon}</span>
                            <p className="text-sm">{r.text}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Teacher comparison */}
                  {teacherList.length > 0 && (
                    <Card className="p-5">
                      <h2 className="font-bold text-base mb-1">Comparatif enseignants</h2>
                      <p className="text-xs text-muted-foreground mb-4">Évolution des résultats par enseignant sur plusieurs années</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 pr-6 font-semibold text-muted-foreground">Enseignant</th>
                              {allYears.map(y => (
                                <th key={y} className="text-center py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap" colSpan={2}>{y}</th>
                              ))}
                            </tr>
                            <tr className="border-b bg-muted/20">
                              <th className="py-1 pr-6"></th>
                              {allYears.map(y => (
                                <Fragment key={y}>
                                  <th className="text-center py-1 px-2 text-xs font-medium text-muted-foreground">Moy.</th>
                                  <th className="text-center py-1 px-2 text-xs font-medium text-muted-foreground">Échecs</th>
                                </Fragment>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {teacherList.map((t, i) => {
                              const yearMap = Object.fromEntries(t.years.map((y: any) => [y.academicYear, y]));
                              const yearAvgs = allYears.map(y => yearMap[y]?.avgGradeGiven ?? null).filter(v => v !== null) as number[];
                              const teacherTrend = yearAvgs.length >= 2 ? yearAvgs[yearAvgs.length - 1] - yearAvgs[0] : 0;
                              return (
                                <tr key={i} className="hover:bg-muted/30">
                                  <td className="py-2 pr-6">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{t.name}</span>
                                      <TrendIcon val={teacherTrend} />
                                    </div>
                                  </td>
                                  {allYears.map(y => {
                                    const d = yearMap[y];
                                    return (
                                      <Fragment key={y}>
                                        <td className="text-center py-2 px-2 text-xs">
                                          {d ? <span className="font-semibold">{fmt(d.avgGradeGiven)}</span> : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="text-center py-2 px-2 text-xs">
                                          {d ? (
                                            <span className={`rounded px-1.5 py-0.5 ${d.failureRate > failureThreshold ? "bg-red-100 text-red-700 font-semibold" : "text-muted-foreground"}`}>
                                              {d.failureRate.toFixed(0)}%
                                            </span>
                                          ) : <span className="text-muted-foreground">—</span>}
                                        </td>
                                      </Fragment>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              );
            })()}
          </TabsContent>

        </Tabs>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:mb-4 { margin-bottom: 1rem; }
        }
      `}</style>
    </AppLayout>
  );
}
