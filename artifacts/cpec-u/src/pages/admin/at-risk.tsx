import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, Loader2, Users, TrendingDown, XCircle, UserX, Search, Eye,
  ShieldAlert, AlertCircle, Info,
} from "lucide-react";
import { Link } from "wouter";

const RISK_LABELS: Record<string, string> = {
  avg_critical: "Moy. < 8",
  avg_low: "Moy. < 10",
  eliminatoire: "Note éliminatoire",
  absence_high: "Abs. > 20%",
  multi_failure: "2+ UE échouées",
  declining: "Tendance à la baisse",
};

function RiskBadge({ level }: { level: string }) {
  if (level === "critical")
    return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1"><XCircle className="w-3 h-3" />Critique</Badge>;
  if (level === "high")
    return <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1"><AlertTriangle className="w-3 h-3" />Élevé</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><AlertCircle className="w-3 h-3" />Modéré</Badge>;
}

function AvgColor(avg: number) {
  if (avg < 8) return "text-red-600 font-bold";
  if (avg < 10) return "text-orange-600 font-semibold";
  return "text-emerald-600";
}

export default function AtRiskPage() {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/at-risk-students"],
    queryFn: () => customFetch<any>("/api/admin/at-risk-students"),
    staleTime: 60000,
  });

  const { data: classes } = useQuery<any[]>({
    queryKey: ["/api/admin/classes"],
    queryFn: () => customFetch<any[]>("/api/admin/classes"),
    staleTime: 300000,
  });

  const students: any[] = data?.students ?? [];

  const filtered = students.filter(s => {
    if (classFilter !== "all" && s.classId !== parseInt(classFilter)) return false;
    if (riskFilter !== "all" && s.riskLevel !== riskFilter) return false;
    if (search && !s.studentName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = data?.counts ?? { critical: 0, high: 0, moderate: 0 };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6 pb-10">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" />
            Étudiants en Difficulté
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Détection automatique basée sur la moyenne, les notes éliminatoires, les absences et les tendances
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 border-red-200 bg-red-50">
            <div className="flex items-center gap-3">
              <XCircle className="w-7 h-7 text-red-600 shrink-0" />
              <div>
                <p className="text-xs text-red-700 font-medium uppercase tracking-wide">Critique</p>
                <p className="text-3xl font-extrabold text-red-700">{isLoading ? "…" : counts.critical}</p>
                <p className="text-xs text-red-600">Moyenne &lt; 8/20</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border-orange-200 bg-orange-50">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-7 h-7 text-orange-600 shrink-0" />
              <div>
                <p className="text-xs text-orange-700 font-medium uppercase tracking-wide">Élevé</p>
                <p className="text-3xl font-extrabold text-orange-700">{isLoading ? "…" : counts.high}</p>
                <p className="text-xs text-orange-600">Note éliminatoire ou multi-échec</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-7 h-7 text-amber-600 shrink-0" />
              <div>
                <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Modéré</p>
                <p className="text-3xl font-extrabold text-amber-700">{isLoading ? "…" : counts.moderate}</p>
                <p className="text-xs text-amber-600">Moyenne 8–10 ou absences élevées</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher un étudiant…" className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Classe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              {classes?.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Niveau de risque" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les niveaux</SelectItem>
              <SelectItem value="critical">Critique</SelectItem>
              <SelectItem value="high">Élevé</SelectItem>
              <SelectItem value="moderate">Modéré</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">
            {filtered.length} étudiant{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              <Users className="w-10 h-10" />
              <p className="font-medium">
                {students.length === 0 ? "Aucun étudiant en difficulté détecté" : "Aucun résultat pour ce filtre"}
              </p>
              {students.length === 0 && (
                <p className="text-xs text-center max-w-xs">Le système analyse les notes, absences et tendances pour identifier automatiquement les étudiants nécessitant une attention particulière.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Étudiant</th>
                    <th className="text-left py-3 px-3 font-semibold text-muted-foreground">Classe</th>
                    <th className="text-left py-3 px-3 font-semibold text-muted-foreground">Semestre</th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground">Moy.</th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground">Note min.</th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground">Abs. max</th>
                    <th className="text-left py-3 px-3 font-semibold text-muted-foreground">Raisons</th>
                    <th className="text-center py-3 px-3 font-semibold text-muted-foreground">Risque</th>
                    <th className="py-3 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((s: any) => (
                    <tr key={s.studentId} className="hover:bg-muted/20">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <UserX className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium">{s.studentName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-xs">{s.className}</td>
                      <td className="py-3 px-3 text-muted-foreground text-xs">{s.semesterName}</td>
                      <td className={`py-3 px-3 text-center font-mono ${AvgColor(s.average)}`}>{s.average.toFixed(2)}</td>
                      <td className="py-3 px-3 text-center">
                        {s.minGrade <= 6 ? (
                          <span className="font-mono text-red-600 font-bold">{s.minGrade.toFixed(2)}</span>
                        ) : (
                          <span className="font-mono text-muted-foreground">{s.minGrade.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {s.maxAbsencePct > 20 ? (
                          <span className="text-red-600 font-semibold">{s.maxAbsencePct}%</span>
                        ) : (
                          <span className="text-muted-foreground">{s.maxAbsencePct}%</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {s.reasons.slice(0, 3).map((r: string) => (
                            <Badge key={r} variant="outline" className="text-xs px-1.5 py-0">{RISK_LABELS[r] ?? r}</Badge>
                          ))}
                          {s.reasons.length > 3 && <Badge variant="outline" className="text-xs px-1.5 py-0">+{s.reasons.length - 3}</Badge>}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center"><RiskBadge level={s.riskLevel} /></td>
                      <td className="py-3 px-3 text-center">
                        <Link href={`/admin/students/${s.studentId}?from=at-risk`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <Eye className="w-3 h-3" />Suivi
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800">Critères de détection automatique</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs text-blue-700">
                <span>• Moyenne générale &lt; 8/20 → Critique</span>
                <span>• Note ≤ 6 dans une matière → Élevé</span>
                <span>• Moyenne 8–10 → Élevé</span>
                <span>• Taux d'absence &gt; 20% → Modéré</span>
                <span>• 2 UE ou plus en échec → Élevé</span>
                <span>• Baisse de moyenne vs semestre précédent → Modéré</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
