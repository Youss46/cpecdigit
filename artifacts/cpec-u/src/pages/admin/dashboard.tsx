import { useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import {
  useGetCurrentUser, useListUsers, useListSubjects,
  useListSemesters, useListRooms, useListScheduleEntries, useGetScolariteStats,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, BookOpen, Calendar, DoorOpen, CalendarDays,
  GraduationCap, CheckCircle, AlertTriangle, BarChart, CalendarOff,
  ArrowRight, TrendingUp, School, ClipboardList, BarChart3, ScrollText,
  PieChart, Wallet, MessageSquareWarning, FileCheck2, Bell,
  Gavel, CreditCard, Scale, MessageSquare, Info,
} from "lucide-react";
import { motion } from "framer-motion";

function timesToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function countConflicts(entries: any[]) {
  const conflictIds = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.sessionDate !== b.sessionDate) continue;
      const aS = timesToMinutes(a.startTime), aE = timesToMinutes(a.endTime);
      const bS = timesToMinutes(b.startTime), bE = timesToMinutes(b.endTime);
      if (aS >= bE || bS >= aE) continue;
      if (a.teacherId === b.teacherId || a.roomId === b.roomId) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }
  return conflictIds.size;
}

const planificateurQuickLinks = [
  { label: "Emplois du temps", href: "/admin/schedules", icon: CalendarDays, color: "text-blue-500", bg: "bg-blue-50" },
  { label: "Volumes Horaires", href: "/admin/planning-assignments", icon: BarChart, color: "text-purple-500", bg: "bg-purple-50" },
  { label: "Vacances & Fériés", href: "/admin/blocked-dates", icon: CalendarOff, color: "text-amber-500", bg: "bg-amber-50" },
  { label: "Gestion des Salles", href: "/admin/rooms", icon: DoorOpen, color: "text-emerald-500", bg: "bg-emerald-50" },
];

const scolariteQuickLinks = [
  { label: "Utilisateurs", href: "/admin/users", icon: Users, color: "text-blue-500", bg: "bg-blue-50" },
  { label: "Classes", href: "/admin/classes", icon: School, color: "text-emerald-500", bg: "bg-emerald-50" },
  { label: "Résultats & Bulletins", href: "/admin/results", icon: GraduationCap, color: "text-purple-500", bg: "bg-purple-50" },
  { label: "Feuilles de Présence", href: "/admin/attendance", icon: ClipboardList, color: "text-teal-500", bg: "bg-teal-50" },
  { label: "Bilan des Absences", href: "/admin/attendance/summary", icon: BarChart3, color: "text-red-500", bg: "bg-red-50" },
  { label: "Semestres", href: "/admin/semesters", icon: Calendar, color: "text-amber-500", bg: "bg-amber-50" },
];

function AlertBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { data: currentUser } = useGetCurrentUser();
  const adminSubRole = (currentUser as any)?.adminSubRole as string | null;
  const isPlanificateur = adminSubRole === "planificateur";
  const isDirecteur = adminSubRole === "directeur";
  const isScolariteOrDirecteur = adminSubRole === "scolarite" || isDirecteur;

  useEffect(() => {
    if (adminSubRole === "hebergement") setLocation("/admin/housing");
  }, [adminSubRole]);

  const { data: users } = useListUsers();
  const { data: subjects } = useListSubjects();
  const { data: semesters } = useListSemesters();
  const { data: rooms } = useListRooms();
  const { data: scheduleEntries = [] } = useListScheduleEntries({});
  const { data: scolariteStatsData } = useGetScolariteStats();

  const { data: directorStats } = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetch("/api/admin/stats", { credentials: "include" }).then(r => r.json()),
    enabled: isDirecteur,
    staleTime: 5 * 60 * 1000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ["/api/admin/alertes/resume"],
    queryFn: () => fetch("/api/admin/alertes/resume", { credentials: "include" }).then(r => r.json()),
    enabled: isScolariteOrDirecteur,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  type AlertsResume = {
    pendingGradeSubmissions: number;
    openReclamations: number;
    arbitrageReclamations: number;
    overduePayments: number;
    studentsAboveThreshold: number;
    juryEnAttente: number;
    unreadMessages: number;
    unpaidHonoraires: number;
    urgentTotal: number;
    attentionTotal: number;
    total: number;
  };
  const alerts = alertsData as AlertsResume | undefined;

  const scheduledTeacherCount = useMemo(() =>
    new Set((scheduleEntries as any[]).map((e) => e.teacherId).filter(Boolean)).size,
    [scheduleEntries]
  );
  const conflictCount = useMemo(() => countConflicts(scheduleEntries as any[]), [scheduleEntries]);

  const recoveryRate: number = (scolariteStatsData as any)?.recoveryRate ?? 0;
  const recoveryColor = recoveryRate >= 75 ? "text-emerald-600" : recoveryRate >= 40 ? "text-amber-500" : "text-red-500";
  const recoveryBg = recoveryRate >= 75 ? "bg-emerald-500/10" : recoveryRate >= 40 ? "bg-amber-500/10" : "bg-red-500/10";

  const scolariteStats = [
    { title: "Étudiants Inscrits", value: (users as any[])?.filter(u => u.role === "student").length || 0, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Enseignants Actifs", value: (users as any[])?.filter(u => u.role === "teacher").length || 0, icon: GraduationCap, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Matières Dispensées", value: (subjects as any[])?.length || 0, icon: BookOpen, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "Taux de Recouvrement", value: `${recoveryRate}%`, icon: TrendingUp, color: recoveryColor, bg: recoveryBg, isRate: true, rate: recoveryRate },
  ];

  const planificateurStats = [
    { title: "Créneaux Planifiés", value: (scheduleEntries as any[]).length || 0, icon: CalendarDays, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Enseignants Programmés", value: scheduledTeacherCount, icon: GraduationCap, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Salles Disponibles", value: (rooms as any[])?.length || 0, icon: DoorOpen, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Semestres Actifs", value: (semesters as any[])?.filter((s: any) => !s.published).length || 0, icon: Calendar, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  const stats = isPlanificateur ? planificateurStats : scolariteStats;
  const recentSemesters = (semesters as any[])?.slice().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3) || [];

  // ── Notification center: 3 tiers ──────────────────────────────────────────
  const urgentItems = [
    {
      key: "grades",
      label: "Notes soumises en attente de validation",
      description: "Soumissions d'enseignants à approuver avant publication",
      count: alerts?.pendingGradeSubmissions ?? 0,
      href: "/admin/results",
      icon: FileCheck2,
      show: true,
    },
    {
      key: "payments",
      label: "Échéances de paiement dépassées",
      description: "Versements non réglés au-delà de leur date d'échéance",
      count: alerts?.overduePayments ?? 0,
      href: "/admin/users",
      icon: CreditCard,
      show: true,
    },
    {
      key: "jury",
      label: "Jury spécial en attente de clôture",
      description: "Session de jury active — délibérations à finaliser",
      count: alerts?.juryEnAttente ?? 0,
      href: "/admin/jury-special",
      icon: Gavel,
      show: isDirecteur,
    },
  ].filter(i => i.show && i.count > 0);

  const attentionItems = [
    {
      key: "absences",
      label: "Étudiants dépassant le seuil d'absences",
      description: "Au moins 3 absences non justifiées — intervention requise",
      count: alerts?.studentsAboveThreshold ?? 0,
      href: "/admin/attendance/summary",
      icon: AlertTriangle,
      show: true,
    },
    {
      key: "arbitrage",
      label: "Réclamations transmises pour arbitrage",
      description: "Réclamations escaladées — décision administrative attendue",
      count: alerts?.arbitrageReclamations ?? 0,
      href: "/admin/reclamations",
      icon: Scale,
      show: true,
    },
  ].filter(i => i.show && i.count > 0);

  const infoItems = [
    {
      key: "messages",
      label: "Messages non lus",
      description: "Messages reçus en attente de lecture",
      count: alerts?.unreadMessages ?? 0,
      href: "/admin/messages",
      icon: MessageSquare,
      show: true,
    },
    ...(isPlanificateur && conflictCount > 0 ? [{
      key: "conflicts",
      label: "Créneaux en conflit",
      description: "Enseignants ou salles doublement réservés — à corriger avant publication",
      count: conflictCount,
      href: "/admin/schedules",
      icon: CalendarDays,
      show: true,
    }] : []),
  ].filter(i => i.show && i.count > 0);

  const hasAlerts = (alerts?.total ?? 0) > 0 || infoItems.length > 0;
  const totalBadge = (alerts?.total ?? 0) + (isPlanificateur && conflictCount > 0 ? 1 : 0);

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-serif font-bold text-foreground">Tableau de bord</h1>
            <p className="text-muted-foreground mt-2">
              {isPlanificateur
                ? "Gestion de la programmation et des emplois du temps."
                : "Vue d'ensemble de la scolarité et des résultats."}
            </p>
          </div>
            {/* Global alert badge in header */}
          {(isScolariteOrDirecteur || isPlanificateur) && hasAlerts && totalBadge > 0 && (
            <div className="flex items-center gap-2 mt-1 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <Bell className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-sm font-semibold text-red-700">{totalBadge} alerte{totalBadge > 1 ? "s" : ""} en attente</span>
            </div>
          )}
        </div>

        {/* ── Centre de Notifications & Alertes ── */}
        {(isScolariteOrDirecteur || isPlanificateur) && hasAlerts && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/40">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-sm text-foreground">Centre de Notifications & Alertes</span>
                  {totalBadge > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                      {totalBadge}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">Actualisé toutes les 30s</span>
              </div>

              <div className="divide-y divide-border">
                {/* 🔴 ACTIONS URGENTES */}
                {urgentItems.length > 0 && (
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <span className="text-xs font-bold text-red-600 uppercase tracking-widest">Actions urgentes</span>
                    </div>
                    {urgentItems.map((item) => (
                      <Link key={item.key} href={item.href}>
                        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-3.5 cursor-pointer hover:shadow-sm hover:border-red-300 transition-all group">
                          <div className="p-2.5 bg-white rounded-lg shadow-sm shrink-0 border border-red-100">
                            <item.icon className="w-5 h-5 text-red-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm text-red-800">{item.label}</p>
                              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0">
                                {item.count}
                              </span>
                            </div>
                            <p className="text-xs text-red-600/70 mt-0.5 truncate">{item.description}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-red-400 group-hover:text-red-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* 🟠 ATTENTION REQUISE */}
                {attentionItems.length > 0 && (
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">Attention requise</span>
                    </div>
                    {attentionItems.map((item) => (
                      <Link key={item.key} href={item.href}>
                        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5 cursor-pointer hover:shadow-sm hover:border-amber-300 transition-all group">
                          <div className="p-2.5 bg-white rounded-lg shadow-sm shrink-0 border border-amber-100">
                            <item.icon className="w-5 h-5 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm text-amber-800">{item.label}</p>
                              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold shrink-0">
                                {item.count}
                              </span>
                            </div>
                            <p className="text-xs text-amber-600/70 mt-0.5 truncate">{item.description}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-amber-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* 🔵 INFORMATIONS */}
                {infoItems.length > 0 && (
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Informations</span>
                    </div>
                    {infoItems.map((item) => (
                      <Link key={item.key} href={item.href}>
                        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3.5 cursor-pointer hover:shadow-sm hover:border-blue-300 transition-all group">
                          <div className="p-2.5 bg-white rounded-lg shadow-sm shrink-0 border border-blue-100">
                            <item.icon className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm text-blue-800">{item.label}</p>
                              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-blue-500 text-white text-[10px] font-bold shrink-0">
                                {item.count}
                              </span>
                            </div>
                            <p className="text-xs text-blue-600/70 mt-0.5 truncate">{item.description}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-blue-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Tout est OK */}
                {urgentItems.length === 0 && attentionItems.length === 0 && infoItems.length === 0 && isScolariteOrDirecteur && (
                  <div className="px-5 py-6 flex items-center gap-3 text-muted-foreground">
                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span className="text-sm">Aucune alerte active — tout est à jour.</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className={`p-4 rounded-2xl ${stat.bg} shrink-0`}>
                    <stat.icon className={`w-8 h-8 ${stat.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-muted-foreground">{stat.title}</p>
                    <h3 className={`text-3xl font-bold mt-1 ${(stat as any).isRate ? stat.color : "text-foreground"}`}>{stat.value}</h3>
                    {(stat as any).isRate && (
                      <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            (stat as any).rate >= 75 ? "bg-emerald-500" : (stat as any).rate >= 40 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${(stat as any).rate}%` }}
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick links */}
        {(() => {
          const links = isPlanificateur ? planificateurQuickLinks : scolariteQuickLinks;
          return (
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Accès Rapides</h2>
              <div className={`grid gap-4 ${isPlanificateur ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"}`}>
                {links.map((link, i) => {
                  // Badge counts on quick link cards
                  const badgeCount =
                    link.href === "/admin/results" ? (alerts?.pendingGradeSubmissions ?? 0)
                    : link.href === "/admin/reclamations" ? (alerts?.openReclamations ?? 0)
                    : link.href === "/admin/attendance/summary" ? (alerts?.studentsAboveThreshold ?? 0)
                    : link.href === "/admin/schedules" && isPlanificateur ? conflictCount
                    : 0;
                  return (
                    <motion.div key={link.href} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.06 }}>
                      <Link href={link.href}>
                        <Card className="cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-primary/30 group relative">
                          {badgeCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 z-10 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-sm">
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                          )}
                          <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                            <div className={`p-3 rounded-xl ${link.bg} group-hover:scale-110 transition-transform`}>
                              <link.icon className={`w-5 h-5 ${link.color}`} />
                            </div>
                            <p className="text-xs font-semibold text-foreground leading-tight">{link.label}</p>
                          </CardContent>
                        </Card>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Director: pedagogical + financial KPIs */}
        {isDirecteur && directorStats && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Class progression */}
              <Card className="shadow-md border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-primary" />
                    Taux de progression pédagogique
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {((directorStats as any).progression ?? []).map((c: any) => {
                      const planned = Number(c.planned_sessions ?? 0);
                      const actual = Number(c.actual_sessions ?? 0);
                      const pct = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
                      return (
                        <div key={c.class_id} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium text-foreground truncate">{c.class_name}</span>
                            {planned > 0 ? (
                              <span className={`font-bold shrink-0 ml-2 ${pct >= 75 ? "text-emerald-600" : pct >= 40 ? "text-amber-500" : "text-red-500"}`}>
                                {pct}%
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">Non planifié</span>
                            )}
                          </div>
                          <Progress value={pct} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            {planned > 0
                              ? `${actual} séance${actual !== 1 ? "s" : ""} saisie${actual !== 1 ? "s" : ""} sur ${planned} planifiée${planned !== 1 ? "s" : ""}`
                              : `${actual > 0 ? `${actual} séance${actual !== 1 ? "s" : ""} saisie${actual !== 1 ? "s" : ""}` : "Emploi du temps non configuré"}`
                            }
                          </p>
                        </div>
                      );
                    })}
                    {((directorStats as any).progression ?? []).length === 0 && (
                      <p className="text-muted-foreground text-center py-4 text-sm">Aucune classe enregistrée.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Financial recovery by class */}
              <Card className="shadow-md border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-primary" />
                    Recouvrement financier par classe
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {((directorStats as any).financial ?? []).map((c: any) => {
                      const due = Number(c.total_due ?? 0);
                      const paid = Number(c.total_paid ?? 0);
                      const enrolled = Number(c.enrolled_count ?? 0);
                      const feePerStudent = Number(c.fee_per_student ?? 0);
                      const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
                      const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
                      return (
                        <div key={c.class_id} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium text-foreground truncate">{c.class_name}</span>
                            {due > 0 ? (
                              <span className={`font-bold shrink-0 ml-2 ${pct >= 75 ? "text-emerald-600" : pct >= 40 ? "text-amber-500" : "text-red-500"}`}>
                                {pct}%
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">Non configuré</span>
                            )}
                          </div>
                          <Progress value={pct} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            {due > 0
                              ? `${fmt(paid)} F payés sur ${fmt(due)} F dus · ${enrolled} étudiant${enrolled !== 1 ? "s" : ""}`
                              : feePerStudent === 0
                                ? `${enrolled} étudiant${enrolled !== 1 ? "s" : ""} · Frais non configurés`
                                : `${fmt(feePerStudent)} F/étudiant · ${enrolled} inscrit${enrolled !== 1 ? "s" : ""}`
                            }
                          </p>
                        </div>
                      );
                    })}
                    {((directorStats as any).financial ?? []).length === 0 && (
                      <p className="text-muted-foreground text-center py-4 text-sm">Aucune classe enregistrée.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {/* Bottom cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="shadow-md border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Semestres Récents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentSemesters.map((sem: any) => (
                  <div key={sem.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                    <div>
                      <p className="font-semibold text-foreground">{sem.name} — {sem.academicYear}</p>
                      <p className="text-sm text-muted-foreground">Créé le {new Date(sem.createdAt).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${sem.published ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {sem.published ? "Publié" : "Brouillon"}
                    </div>
                  </div>
                ))}
                {recentSemesters.length === 0 && <p className="text-muted-foreground text-center py-4">Aucun semestre trouvé.</p>}
              </div>
            </CardContent>
          </Card>

          {isPlanificateur ? (
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-primary" />
                  Inventaire des Salles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(rooms as any[])?.slice(0, 5).map((room: any) => (
                    <div key={room.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                      <div>
                        <p className="font-semibold text-sm">{room.name}</p>
                        <p className="text-xs text-muted-foreground">{room.type}</p>
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">{room.capacity} places</span>
                    </div>
                  ))}
                  {(!rooms || (rooms as any[]).length === 0) && <p className="text-muted-foreground text-center py-4">Aucune salle enregistrée.</p>}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-primary" />
                  Résultats Publiés
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(semesters as any[])?.filter((s: any) => s.published).slice(0, 4).map((sem: any) => (
                    <div key={sem.id} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50">
                      <div>
                        <p className="font-semibold text-sm">{sem.name}</p>
                        <p className="text-xs text-muted-foreground">{sem.academicYear}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Publié</span>
                    </div>
                  ))}
                  {(!(semesters as any[]) || (semesters as any[]).filter((s: any) => s.published).length === 0) && (
                    <p className="text-muted-foreground text-center py-4">Aucun résultat publié.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
