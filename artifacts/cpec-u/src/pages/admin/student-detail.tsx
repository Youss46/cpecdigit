import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { useGetAdminStudentDetail, useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMontant } from "@/components/ui/input-montant";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, User, Mail, Phone, MapPin, Calendar, GraduationCap,
  BookOpen, AlertCircle, CheckCircle2, Wallet, Home, TrendingUp, Clock, Plus, Trash2,
  CreditCard, Download, RefreshCw, XCircle, QrCode, Activity, TrendingDown, Minus,
  Award, BarChart2, ShieldAlert, Smartphone, Banknote,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "Admis") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400">Admis</Badge>;
  if (decision === "Ajourné") return <Badge variant="destructive">Ajourné</Badge>;
  return <Badge variant="secondary">En attente</Badge>;
}

function AdminStudentCardTab({ studentId, studentName }: { studentId: number; studentName: string }) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [invalidating, setInvalidating] = useState(false);

  const { data: cardData, isLoading: cardLoading, refetch } = useQuery<any>({
    queryKey: [`/api/admin/students/${studentId}/card`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/students/${studentId}/card`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Erreur chargement carte");
      return res.json();
    },
    retry: false,
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/card/generate`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Erreur génération"); }
      await refetch();
      toast({ title: "Carte générée", description: `La carte de ${studentName} a été créée.` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleInvalidate = async () => {
    setInvalidating(true);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/card/invalidate`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Erreur"); }
      await refetch();
      toast({ title: "Carte invalidée", description: "La carte a été marquée comme expirée." });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setInvalidating(false);
    }
  };

  if (cardLoading) return (
    <Card><CardContent className="py-10 text-center text-muted-foreground">Chargement…</CardContent></Card>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="w-5 h-5 text-primary" />
          Carte Étudiante Numérique
        </CardTitle>
        <div className="flex gap-2">
          {cardData ? (
            <>
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/admin/students/${studentId}/card/pdf`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> PDF
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                {generating ? "Renouvellement…" : "Renouveler"}
              </Button>
              {cardData.status === "active" && (
                <Button size="sm" variant="destructive" onClick={handleInvalidate} disabled={invalidating}>
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  {invalidating ? "…" : "Invalider"}
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              <QrCode className="w-3.5 h-3.5 mr-1.5" />
              {generating ? "Génération…" : "Générer la carte"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {cardData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Statut</span>
                <Badge className={cardData.status === "active"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 border-red-200"}>
                  {cardData.status === "active" ? "Active" : "Expirée / Invalidée"}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Année académique</span>
                <span className="font-medium">{cardData.academicYear}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Valable jusqu'au</span>
                <span className="font-medium">{fmtDate(cardData.expiresAt)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Générée le</span>
                <span className="font-medium">{fmtDate(cardData.issuedAt)}</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 bg-muted/30 rounded-xl p-4">
              {cardData.qrCodeDataUrl ? (
                <img src={cardData.qrCodeDataUrl} alt="QR Code carte" className="w-32 h-32" />
              ) : (
                <QrCode className="w-16 h-16 text-muted-foreground" />
              )}
              <p className="text-xs text-muted-foreground text-center">Scanner pour vérifier l'authenticité</p>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center space-y-3">
            <CreditCard className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground">Aucune carte générée pour cet étudiant.</p>
            <p className="text-xs text-muted-foreground/70">Cliquez sur "Générer la carte" pour en créer une.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Suivi Académique tab component ───────────────────────────────────────────
function GradeColor(v: number | null): string {
  if (v === null) return "#6b7280";
  if (v >= 14) return "#10b981";
  if (v >= 10) return "#3b82f6";
  if (v >= 8)  return "#f59e0b";
  return "#ef4444";
}

function AdminStudentSuiviTab({ studentId }: { studentId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/students/academic-tracking", studentId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/students/${studentId}/academic-tracking`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!studentId,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" /></div>
  );

  const semesters: any[] = data?.semesters ?? [];
  const indicators = data?.indicators ?? {};
  const alerts: any[] = data?.alerts ?? [];

  const chartData = semesters.map(s => ({ name: s.semesterName, moyenne: s.average, classeAvg: s.classAverage }));

  return (
    <div className="space-y-5">
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a: any, i: number) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${a.severity === "critical" ? "bg-red-50 border-red-200 text-red-800" : a.severity === "high" ? "bg-orange-50 border-orange-200 text-orange-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
              <ShieldAlert className={`w-4 h-4 shrink-0 mt-0.5 ${a.severity === "critical" ? "text-red-600" : a.severity === "high" ? "text-orange-600" : "text-amber-600"}`} />
              <p>{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* KPI indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Moy. actuelle</p>
          <p className="text-xl font-extrabold font-mono" style={{ color: GradeColor(indicators.currentAverage) }}>
            {indicators.currentAverage ? indicators.currentAverage.toFixed(2) : "—"}/20
          </p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Crédits validés</p>
          <p className="text-xl font-extrabold">{indicators.creditsEarned != null && indicators.creditsAttempted != null ? `${indicators.creditsEarned}/${indicators.creditsAttempted}` : "—"}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Rang</p>
          <p className="text-xl font-extrabold">
            {indicators.currentRank ? `${indicators.currentRank}/${indicators.totalStudents}` : "—"}
          </p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Présence</p>
          <p className="text-xl font-extrabold">{indicators.attendanceRate !== null && indicators.attendanceRate !== undefined ? `${indicators.attendanceRate}%` : "—"}</p>
        </Card>
      </div>

      {/* Progression chart */}
      {chartData.length >= 2 && (
        <Card className="p-4">
          <p className="font-semibold text-sm mb-3">Évolution de la moyenne</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 20]} tickFormatter={v => `${v}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}/20`, name === "moyenne" ? "Étudiant" : "Classe"]} />
              <Legend formatter={v => v === "moyenne" ? "Étudiant" : "Moy. classe"} />
              <ReferenceLine y={10} stroke="#94a3b8" strokeDasharray="5 3" />
              <ReferenceLine y={8}  stroke="#fca5a5" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="moyenne"   stroke="#6366f1" strokeWidth={2.5} dot={{ r: 5 }} activeDot={{ r: 7 }} />
              <Line type="monotone" dataKey="classeAvg" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Per-semester breakdown */}
      {semesters.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune note enregistrée pour cet étudiant.</CardContent></Card>
      ) : (
        [...semesters].reverse().map((sem: any) => (
          <Card key={sem.semesterId} className="overflow-hidden">
            <CardHeader className="bg-muted/30 py-2.5 px-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{sem.semesterName} <span className="text-xs font-normal text-muted-foreground">({sem.academicYear})</span></p>
                  {sem.rank && <p className="text-xs text-muted-foreground">Rang {sem.rank}/{sem.totalStudents}</p>}
                </div>
                <div className="text-right">
                  {sem.average !== null ? (
                    <span className="font-mono font-bold text-base" style={{ color: GradeColor(sem.average) }}>
                      {sem.average.toFixed(2)}/20
                    </span>
                  ) : <span className="text-muted-foreground text-sm">—</span>}
                  {sem.classAverage && <p className="text-xs text-muted-foreground">Moy. classe: {sem.classAverage.toFixed(2)}</p>}
                </div>
              </div>
            </CardHeader>
            <div className="divide-y">
              {sem.subjects.map((sub: any) => (
                <div key={sub.subjectId} className="flex items-center gap-3 px-5 py-2">
                  <div className="flex-1">
                    <p className="text-sm">{sub.subjectName}</p>
                    <p className="text-xs text-muted-foreground">Coef. {sub.coefficient}</p>
                  </div>
                  <div className="text-right">
                    {sub.grade !== null ? (
                      <span className="font-mono text-sm font-semibold" style={{ color: GradeColor(sub.grade) }}>
                        {sub.grade.toFixed(2)}/20
                      </span>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                    {sub.retakeGrade !== null && (
                      <p className="text-xs text-amber-600">Ratt: {sub.retakeGrade.toFixed(2)}/20</p>
                    )}
                  </div>
                  {sub.grade !== null && (
                    <div className="w-20">
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min((sub.grade / 20) * 100, 100)}%`, background: GradeColor(sub.grade) }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

export default function AdminStudentDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const studentId = parseInt(params.id ?? "0");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const adminSubRole = (currentUser as any)?.adminSubRole;
  const canRecordPayment = adminSubRole === "scolarite" || adminSubRole === "directeur";

  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<string>("");
  const [payLoading, setPayLoading] = useState(false);

  const [deletePayId, setDeletePayId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleAddPayment = async () => {
    if (!payAmount || isNaN(Number(payAmount)) || Number(payAmount) <= 0) {
      toast({ title: "Montant invalide", description: "Veuillez saisir un montant positif.", variant: "destructive" });
      return;
    }
    setPayLoading(true);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, amount: Number(payAmount), description: payDesc, paymentDate: payDate, paymentMethod: payMethod || null }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Erreur"); }
      toast({ title: "Paiement enregistré", description: `${Number(payAmount).toLocaleString("fr-FR")} FCFA ajouté avec succès.` });
      setShowPayDialog(false);
      setPayAmount(""); setPayDesc(""); setPayDate(new Date().toISOString().slice(0, 10)); setPayMethod("");
      qc.invalidateQueries({ queryKey: [`/api/admin/students/${studentId}/detail`] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setPayLoading(false);
    }
  };

  const handleDeletePayment = async (payId: number) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/payments/${payId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Erreur"); }
      toast({ title: "Paiement supprimé" });
      setDeletePayId(null);
      qc.invalidateQueries({ queryKey: [`/api/admin/students/${studentId}/detail`] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const { data, isLoading, isError, error } = useGetAdminStudentDetail(studentId);

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["admin"]}>
        <div className="space-y-4 max-w-5xl mx-auto">
          <div className="h-8 w-40 bg-muted animate-pulse rounded-xl" />
          <div className="h-40 bg-muted animate-pulse rounded-3xl" />
          <div className="h-64 bg-muted animate-pulse rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    if (error) console.error("[AdminStudentDetail] Erreur de chargement:", error);
    const is404 = (error as any)?.status === 404;
    return (
      <AppLayout allowedRoles={["admin"]}>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <AlertCircle className="w-12 h-12 text-destructive/60" />
          <div className="text-center space-y-1">
            <p className="font-semibold text-foreground">
              {is404 ? "Étudiant introuvable" : "Erreur de chargement"}
            </p>
            <p className="text-sm text-muted-foreground">
              {is404
                ? `Aucun étudiant avec l'identifiant #${studentId} n'existe en base.`
                : "Une erreur est survenue lors du chargement de la fiche. Vérifiez votre connexion et réessayez."}
            </p>
          </div>
          <Button variant="outline" onClick={() => { const from = new URLSearchParams(window.location.search).get("from"); navigate(from === "at-risk" ? "/admin/at-risk" : from === "cards" ? "/admin/cards" : "/admin/users"); }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour à la liste
          </Button>
        </div>
      </AppLayout>
    );
  }

  const { student, enrollments, semesterResults, absences, scolarite, housing } = data;

  const totalAbsences = absences.length;
  const unjustified = absences.filter((a: any) => !a.justified).length;
  const justified = totalAbsences - unjustified;
  const activeHousing = housing.find((h: any) => h.status === "active");

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6 max-w-5xl mx-auto">

        {/* Back button */}
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-1" onClick={() => { const from = new URLSearchParams(window.location.search).get("from"); navigate(from === "at-risk" ? "/admin/at-risk" : from === "cards" ? "/admin/cards" : "/admin/users"); }}>
          <ArrowLeft className="w-4 h-4" /> Retour à la liste
        </Button>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-gradient-to-br from-primary to-primary/75 rounded-3xl p-8 text-primary-foreground shadow-xl shadow-primary/20">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              {student.photoUrl ? (
                <img
                  src={student.photoUrl.startsWith("http") ? student.photoUrl : `/api/uploads/${student.photoUrl}`}
                  alt={student.name}
                  className="w-20 h-20 rounded-2xl object-cover ring-4 ring-white/30 shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <User className="w-10 h-10 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-serif font-bold">{student.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <Badge className="bg-white/20 text-white border-0 text-xs font-semibold">Étudiant</Badge>
                  {enrollments[0] && (
                    <Badge className="bg-white/15 text-white border-0 text-xs">{enrollments[0].className}</Badge>
                  )}
                  <span className="flex items-center gap-1.5 text-primary-foreground/80 text-sm">
                    <Mail className="w-3.5 h-3.5" />{student.email}
                  </span>
                  {student.phone && (
                    <span className="flex items-center gap-1.5 text-primary-foreground/80 text-sm">
                      <Phone className="w-3.5 h-3.5" />{student.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Summary stats */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {[
            {
              label: "Solde dû",
              value: scolarite.balance > 0 ? `${fmt(scolarite.balance)} F` : "Soldé",
              icon: Wallet,
              color: scolarite.balance > 0 ? "text-red-600" : "text-emerald-600",
              bg: scolarite.balance > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-emerald-50 dark:bg-emerald-900/20",
            },
            {
              label: "Absences",
              value: `${unjustified} non just.`,
              icon: AlertCircle,
              color: unjustified > 0 ? "text-amber-600" : "text-emerald-600",
              bg: unjustified > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-emerald-50 dark:bg-emerald-900/20",
            },
            {
              label: "Semestres",
              value: String(semesterResults.length),
              icon: GraduationCap,
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              label: "Hébergement",
              value: activeHousing ? `${activeHousing.buildingName} ${activeHousing.roomNumber}` : "Non logé",
              icon: Home,
              color: activeHousing ? "text-teal-600" : "text-muted-foreground",
              bg: activeHousing ? "bg-teal-50 dark:bg-teal-900/20" : "bg-muted/50",
            },
          ].map((stat, i) => (
            <Card key={i} className="border-border shadow-sm">
              <CardContent className="p-5 flex flex-col items-center text-center gap-2">
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Tabs */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <Tabs defaultValue="notes">
            <TabsList className="bg-muted/60 rounded-xl p-1 mb-4 flex-wrap gap-1 h-auto">
              <TabsTrigger value="notes" className="rounded-lg text-xs sm:text-sm">Notes & Résultats</TabsTrigger>
              <TabsTrigger value="absences" className="rounded-lg text-xs sm:text-sm">Absences</TabsTrigger>
              <TabsTrigger value="suivi" className="rounded-lg text-xs sm:text-sm">Suivi Académique</TabsTrigger>
              <TabsTrigger value="scolarite" className="rounded-lg text-xs sm:text-sm">Scolarité</TabsTrigger>
              <TabsTrigger value="housing" className="rounded-lg text-xs sm:text-sm">Hébergement</TabsTrigger>
              <TabsTrigger value="infos" className="rounded-lg text-xs sm:text-sm">Infos personnelles</TabsTrigger>
              {canRecordPayment && (
                <TabsTrigger value="carte" className="rounded-lg text-xs sm:text-sm">Carte Étudiante</TabsTrigger>
              )}
            </TabsList>

            {/* ── Notes & Résultats ── */}
            <TabsContent value="notes" className="space-y-4">
              {semesterResults.length === 0 ? (
                <Card><CardContent className="py-16 text-center text-muted-foreground">Aucune note enregistrée.</CardContent></Card>
              ) : (
                semesterResults.map((sem: any) => (
                  <Card key={sem.semesterId} className="border-border shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/30 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-primary" />
                          {sem.semesterName}
                          <span className="text-xs font-normal text-muted-foreground">({sem.academicYear})</span>
                        </CardTitle>
                        <div className="flex items-center gap-3">
                          {sem.average !== null && (
                            <span className={`text-lg font-bold font-mono ${sem.average >= 10 ? "text-emerald-600" : "text-destructive"}`}>
                              {sem.average.toFixed(2)} / 20
                            </span>
                          )}
                          <DecisionBadge decision={sem.decision} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-muted/20">
                          <TableRow>
                            <TableHead>Matière</TableHead>
                            <TableHead className="text-center">Coef.</TableHead>
                            <TableHead className="text-center">Note /20</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sem.grades.map((g: any) => (
                            <TableRow key={g.subjectId}>
                              <TableCell className="font-medium">{g.subjectName}</TableCell>
                              <TableCell className="text-center text-muted-foreground">{g.coefficient}</TableCell>
                              <TableCell className="text-center">
                                {g.value !== null ? (
                                  <span className={`font-mono font-bold ${g.value >= 10 ? "text-emerald-600" : "text-destructive"}`}>
                                    {g.value.toFixed(2)}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* ── Absences ── */}
            <TabsContent value="absences">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertCircle className="w-4 h-4 text-amber-500" /> Historique des absences
                    </CardTitle>
                    <div className="flex gap-3 text-sm">
                      <span className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-3 py-1 rounded-full font-medium">{unjustified} non justifiée{unjustified > 1 ? "s" : ""}</span>
                      <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full font-medium">{justified} justifiée{justified > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {absences.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                      <p>Aucune absence enregistrée.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Matière</TableHead>
                          <TableHead>Classe</TableHead>
                          <TableHead className="text-center">Statut</TableHead>
                          <TableHead className="text-center">Justification</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {absences.map((a: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{fmtDate(a.sessionDate)}</TableCell>
                            <TableCell className="font-medium">{a.subjectName ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{a.className ?? "—"}</TableCell>
                            <TableCell className="text-center">
                              {a.status === "absent" && <Badge variant="destructive" className="text-xs">Absent</Badge>}
                              {a.status === "late" && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">En retard</Badge>}
                              {a.status === "excused" && <Badge variant="secondary" className="text-xs">Excusé</Badge>}
                            </TableCell>
                            <TableCell className="text-center">
                              {a.justified
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                                : <span className="text-muted-foreground text-xs">Non justifiée</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Suivi Académique ── */}
            <TabsContent value="suivi">
              <AdminStudentSuiviTab studentId={studentId} />
            </TabsContent>

            {/* ── Scolarité ── */}
            <TabsContent value="scolarite" className="space-y-4">
              {/* Balance summary */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Frais totaux", value: `${fmt(scolarite.totalDue)} F`, color: "text-foreground" },
                  { label: "Total payé", value: `${fmt(scolarite.totalPaid)} F`, color: "text-emerald-600" },
                  { label: "Solde restant", value: scolarite.balance > 0 ? `${fmt(scolarite.balance)} F` : "Soldé", color: scolarite.balance > 0 ? "text-destructive" : "text-emerald-600" },
                ].map((s, i) => (
                  <Card key={i} className="border-border shadow-sm">
                    <CardContent className="p-5 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Payment history */}
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />Historique des paiements
                    </CardTitle>
                    {canRecordPayment && (
                      <Button size="sm" className="gap-1.5" onClick={() => setShowPayDialog(true)}>
                        <Plus className="w-4 h-4" />
                        Enregistrer
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {scolarite.payments.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">Aucun paiement enregistré.</div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Moyen</TableHead>
                          <TableHead className="text-right">Montant</TableHead>
                          {canRecordPayment && <TableHead className="w-10" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scolarite.payments.map((p: any) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm">{fmtDate(p.paymentDate)}</TableCell>
                            <TableCell>{p.description ?? "—"}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                {p.paymentMethod === "mobile_money" && <Smartphone className="w-3.5 h-3.5" />}
                                {p.paymentMethod === "virement" && <CreditCard className="w-3.5 h-3.5" />}
                                {p.paymentMethod === "cheque" && <CreditCard className="w-3.5 h-3.5" />}
                                {(!p.paymentMethod || p.paymentMethod === "especes") && <Banknote className="w-3.5 h-3.5" />}
                                {p.paymentMethod === "especes" ? "Espèces"
                                  : p.paymentMethod === "mobile_money" ? "Mobile Money"
                                  : p.paymentMethod === "virement" ? "Virement"
                                  : p.paymentMethod === "cheque" ? "Chèque"
                                  : "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-emerald-700">+{fmt(p.amount)} F</TableCell>
                            {canRecordPayment && (
                              <TableCell>
                                <button
                                  onClick={() => setDeletePayId(p.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Hébergement ── */}
            <TabsContent value="housing">
              <Card className="border-border shadow-sm">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Home className="w-4 h-4 text-teal-600" />Historique d'hébergement</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {housing.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">Aucun hébergement enregistré.</div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead>Bâtiment</TableHead>
                          <TableHead>Chambre</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Entrée</TableHead>
                          <TableHead>Sortie</TableHead>
                          <TableHead className="text-center">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {housing.map((h: any) => (
                          <TableRow key={h.assignmentId}>
                            <TableCell className="font-medium">{h.buildingName}</TableCell>
                            <TableCell>
                              <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">Ch. {h.roomNumber}</span>
                              {h.floor > 0 && <span className="text-xs text-muted-foreground ml-2">Étage {h.floor}</span>}
                            </TableCell>
                            <TableCell className="capitalize text-sm text-muted-foreground">{h.type}</TableCell>
                            <TableCell className="text-sm">{fmtDate(h.startDate)}</TableCell>
                            <TableCell className="text-sm">{h.endDate ? fmtDate(h.endDate) : <span className="text-muted-foreground italic">En cours</span>}</TableCell>
                            <TableCell className="text-center">
                              {h.status === "active" && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Actif</Badge>}
                              {h.status === "ended" && <Badge variant="secondary" className="text-xs">Terminé</Badge>}
                              {h.status === "cancelled" && <Badge variant="destructive" className="text-xs">Annulé</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Infos personnelles ── */}
            <TabsContent value="infos">
              <Card className="border-border shadow-sm">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-primary" />Informations personnelles</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {[
                      { label: "Nom complet", value: student.name, icon: User },
                      { label: "Email", value: student.email, icon: Mail },
                      { label: "Téléphone", value: student.phone || "—", icon: Phone },
                      { label: "Adresse", value: student.address || "—", icon: MapPin },
                      { label: "Date de naissance", value: student.dateNaissance || "—", icon: Calendar },
                      { label: "Lieu de naissance", value: student.lieuNaissance || "—", icon: MapPin },
                    ].map(({ label, value, icon: Icon }, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">{label}</p>
                          <p className="text-sm text-foreground font-semibold mt-0.5">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {enrollments.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-border">
                      <p className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                        <GraduationCap className="w-4 h-4" /> Inscriptions
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {enrollments.map((e: any, i: number) => (
                          <Badge key={i} variant="outline" className="gap-1.5">
                            <Clock className="w-3 h-3" />
                            {e.className} — {e.enrolledAt ? fmtDate(e.enrolledAt) : "—"}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Carte Étudiante ── */}
            {canRecordPayment && (
              <TabsContent value="carte" className="space-y-4">
                <AdminStudentCardTab studentId={studentId} studentName={student.name} />
              </TabsContent>
            )}
          </Tabs>
        </motion.div>
      </div>

      {/* Dialog: Enregistrer un paiement */}
      <Dialog open={showPayDialog} onOpenChange={(o) => { if (!o) setShowPayDialog(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              Enregistrer un paiement
            </DialogTitle>
            <DialogDescription>
              Saisissez les informations du versement pour {student?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Montant (FCFA) *</Label>
              <InputMontant
                value={payAmount}
                onChange={(raw) => setPayAmount(raw)}
                placeholder="Ex: 150 000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                placeholder="ex: Versement 1re tranche"
                value={payDesc}
                onChange={(e) => setPayDesc(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Moyen de paiement</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="especes">Espèces</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="virement">Virement bancaire</SelectItem>
                  <SelectItem value="cheque">Chèque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date du paiement</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(false)}>Annuler</Button>
            <Button onClick={handleAddPayment} disabled={payLoading}>
              {payLoading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmer suppression paiement */}
      <Dialog open={deletePayId !== null} onOpenChange={(o) => { if (!o) setDeletePayId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce paiement ?</DialogTitle>
            <DialogDescription>Cette action est irréversible. Le paiement sera définitivement effacé.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePayId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => deletePayId && handleDeletePayment(deletePayId)} disabled={deleteLoading}>
              {deleteLoading ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
