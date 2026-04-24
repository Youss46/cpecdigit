import { ReactNode, useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { CpecLogo } from "@/components/cpec-logo";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useGetCurrentUser, useLogout, useGetUnreadNotificationCount, useGetPendingGradeSubmissionsCount, useGetUnreadMessageCount, useStudentEvaluationsCurrent } from "@workspace/api-client-react";
import { useSocket } from "@/hooks/use-socket";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ActivationKeyModal } from "@/components/activation-key-modal";
import { InstallButton, InstallBannerMobile } from "@/components/install-banner";
import { useOffline } from "@/lib/offline/offline-context";
import { clearAllOfflineData } from "@/lib/offline/db";
import { SyncStatusBar } from "@/components/sync-status";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  School,
  BookOpen,
  Calendar,
  ClipboardList,
  GraduationCap,
  LogOut,
  PenTool,
  FileText,
  Menu,
  DoorOpen,
  CalendarDays,
  ShieldCheck,
  LayoutList,
  BarChart,
  BarChart2,
  BarChart3,
  CalendarOff,
  ScrollText,
  Bell,
  MessageSquare,
  Building2,
  Rocket,
  Archive,
  Wallet,
  Sun,
  Moon,
  UserCircle,
  BookText,
  TrendingUp,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Layers,
  Gavel,
  CreditCard,
  Star,
  User2,
  Scale,
  ShieldAlert,
  Settings2,
  WifiOff,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// Persist sidebar scroll position across route-driven remounts
let _sidebarScrollTop = 0;

interface AppLayoutProps {
  children: ReactNode;
  allowedRoles: ("admin" | "teacher" | "student" | "parent")[];
  noScroll?: boolean;
}

export function AppLayout({ children, allowedRoles, noScroll = false }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useGetCurrentUser({
    query: { retry: false, staleTime: 30_000 } as any,
  });

  useSocket((user as any)?.id);

  const { preloadCache, isOnline } = useOffline();
  const preloadedRef = useRef(false);
  useEffect(() => {
    if (user && user.role && !preloadedRef.current) {
      preloadedRef.current = true;
      preloadCache(user.role);
    }
  }, [user, preloadCache]);

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showFarewell, setShowFarewell] = useState(false);
  const [farewellSubRole, setFarewellSubRole] = useState<string | null>(null);
  const isOnClassesOrSubjects = location === "/admin/classes" || location === "/admin/subjects" ||
    location.startsWith("/admin/classes/") || location.startsWith("/admin/subjects/");
  const [classesGroupOpen, setClassesGroupOpen] = useState(false);
  const effectiveClassesOpen = classesGroupOpen || isOnClassesOrSubjects;
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("cpec-dark-mode");
      if (stored !== null) return stored === "true";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("cpec-dark-mode", String(isDark));
  }, [isDark]);

  const { data: unreadData } = useGetUnreadNotificationCount({
    enabled: !!(user && user.role === "student"),
  } as any);

  const isResultsAdmin = !!(user && user.role === "admin" && ((user as any).adminSubRole === "scolarite" || (user as any).adminSubRole === "directeur"));
  const { data: pendingCountData } = useGetPendingGradeSubmissionsCount(
    { enabled: isResultsAdmin } as any
  );
  const pendingCount = (pendingCountData as any)?.count ?? 0;
  const { data: unreadMsgData } = useGetUnreadMessageCount({ enabled: !!user } as any);
  const unreadMsgCount = (unreadMsgData as any)?.count ?? 0;

  const { data: alertesResumeData } = useQuery({
    queryKey: ["/api/admin/alertes/resume"],
    queryFn: () => fetch("/api/admin/alertes/resume", { credentials: "include" }).then(r => r.json()),
    enabled: isResultsAdmin,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const absenceAlertCount: number = (alertesResumeData as any)?.studentsAboveThreshold ?? 0;
  const juryBadgeCount: number = (alertesResumeData as any)?.juryEnAttente ?? 0;
  const overduePaymentsBadge: number = (alertesResumeData as any)?.overduePayments ?? 0;

  const isStudent = !!(user && user.role === "student");
  const { data: studentEvalData } = useStudentEvaluationsCurrent({ enabled: isStudent } as any);
  const hasActiveEvaluation = isStudent && !!(studentEvalData as any)?.period && !(studentEvalData as any)?.period?.expired;

  const isTeacher = !!(user && user.role === "teacher");
  const { data: teacherReclamData } = useQuery({
    queryKey: ["/api/teacher/reclamations/pending-count"],
    queryFn: () => fetch("/api/teacher/reclamations", { credentials: "include" })
      .then(r => r.json())
      .then((rows: any[]) => ({ count: rows.filter((r: any) => ["soumise", "en_cours"].includes(r.status)).length })),
    enabled: isTeacher,
    staleTime: 2 * 60 * 1000,
  });
  const teacherReclamCount = (teacherReclamData as any)?.count ?? 0;

  const { data: adminReclamData } = useQuery({
    queryKey: ["/api/admin/reclamations/pending-count"],
    queryFn: () => fetch("/api/admin/reclamations", { credentials: "include" })
      .then(r => r.json())
      .then((rows: any[]) => ({ count: rows.filter((r: any) => ["soumise","en_cours","en_arbitrage"].includes(r.status)).length })),
    enabled: !!(user && user.role === "admin"),
    staleTime: 2 * 60 * 1000,
  });
  const adminReclamCount = (adminReclamData as any)?.count ?? 0;

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        clearAllOfflineData().catch(() => {});
        queryClient.clear();
        setLocation("/login");
      },
    },
  });

  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false);
    const subRole = (user as any)?.adminSubRole;
    if (subRole === "directeur") {
      setFarewellSubRole("directeur");
      setShowFarewell(true);
      setTimeout(() => logoutMutation.mutate(), 2800);
    } else if (subRole === "scolarite" || subRole === "planificateur" || subRole === "hebergement") {
      setFarewellSubRole(subRole);
      setShowFarewell(true);
      setTimeout(() => logoutMutation.mutate(), 2500);
    } else {
      logoutMutation.mutate();
    }
  };

  // Timeout: if the auth check hangs for more than 8s, redirect to login
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setLoadingTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const needsLogin = (!isLoading && (isError || !user)) || loadingTimedOut;
  const wrongRole = !isLoading && !loadingTimedOut && user && !allowedRoles.includes(user.role);
  const redirectTarget = wrongRole && user ? (user.role === "admin" ? "/admin" : `/${user.role}`) : null;

  useEffect(() => {
    if (needsLogin) setLocation("/login");
  }, [needsLogin]);

  useEffect(() => {
    if (redirectTarget) setLocation(redirectTarget);
  }, [redirectTarget]);

  if (isLoading && !loadingTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (needsLogin || wrongRole) {
    return null;
  }

  const adminSubRole = (user as any).adminSubRole as string | null | undefined;

  const classesMatieresGroup = {
    type: "group" as const,
    name: "Classes & Matières",
    icon: Layers,
    children: [
      { name: "Classes", href: "/admin/classes", icon: School },
      { name: "Matières", href: "/admin/subjects", icon: BookOpen },
    ],
  };

  const scolariteNavItems = [
    { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    { name: "Utilisateurs", href: "/admin/users", icon: Users },
    { name: "Scolarité & Paiements", href: "/admin/scolarite", icon: Wallet },
    classesMatieresGroup,
    { name: "Semestres", href: "/admin/semesters", icon: Calendar },
    { name: "Feuilles de Présence", href: "/admin/attendance", icon: ClipboardList },
    { name: "Bilan des Absences", href: "/admin/attendance/summary", icon: BarChart3, badge: absenceAlertCount > 0 ? absenceAlertCount : undefined },
    { name: "Résultats & Bulletins", href: "/admin/results", icon: GraduationCap, badge: pendingCount > 0 ? pendingCount : undefined },
    { name: "Promotion Annuelle", href: "/admin/promotion", icon: Rocket },
    { name: "Archives", href: "/admin/archives", icon: Archive },
    { name: "Cahiers de texte", href: "/admin/cahier-de-texte", icon: BookText },
    { name: "Bibliothèque", href: "/admin/bibliotheque", icon: BookOpen },
    { name: "Suivi des Heures", href: "/admin/suivi-heures", icon: TrendingUp },
    { name: "Journal d'Activité", href: "/admin/activity-log", icon: ScrollText },
    { name: "Rattrapage", href: "/admin/rattrapage", icon: RotateCcw },
    { name: "Jury Spécial", href: "/admin/jury-special", icon: Gavel, badge: juryBadgeCount > 0 ? juryBadgeCount : undefined },
    { name: "Cartes Étudiantes", href: "/admin/cards", icon: CreditCard },
    { name: "Évaluations Enseignants", href: "/admin/evaluations", icon: Star },
    { name: "Réclamations", href: "/admin/reclamations", icon: Scale, badge: adminReclamCount > 0 ? adminReclamCount : undefined },
    { name: "Étudiants en Difficulté", href: "/admin/at-risk", icon: ShieldAlert },
    { name: "Rapports & Statistiques", href: "/admin/reports", icon: BarChart2 },
    { name: "Centre de Documents", href: "/admin/documents", icon: FileText },
    { name: "Gestion des Parents", href: "/admin/parents", icon: User2 },
    { name: "Messages", href: "/admin/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
    { name: "Paramètres", href: "/settings", icon: Settings2 },
  ];

  const planificateurNavItems = [
    { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    { name: "Emplois du temps", href: "/admin/schedules", icon: CalendarDays },
    { name: "Volumes Horaires", href: "/admin/planning-assignments", icon: BarChart },
    { name: "Salles", href: "/admin/rooms", icon: DoorOpen },
    { name: "Vacances & Jours Fériés", href: "/admin/blocked-dates", icon: CalendarOff },
    { name: "Affectations", href: "/admin/assignments", icon: ClipboardList },
    classesMatieresGroup,
    { name: "Semestres", href: "/admin/semesters", icon: Calendar },
    { name: "Utilisateurs", href: "/admin/users", icon: Users },
    { name: "Cahiers de texte", href: "/admin/cahier-de-texte", icon: BookText },
    { name: "Bibliothèque", href: "/admin/bibliotheque", icon: BookOpen },
    { name: "Suivi des Heures", href: "/admin/suivi-heures", icon: TrendingUp },
    { name: "Honoraires", href: "/admin/honoraires", icon: Wallet },
    { name: "Messages", href: "/admin/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
    { name: "Paramètres", href: "/settings", icon: Settings2 },
  ];

  const directeurNavItems = [
    { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    { name: "Utilisateurs", href: "/admin/users", icon: Users },
    classesMatieresGroup,
    { name: "Semestres", href: "/admin/semesters", icon: Calendar },
    { name: "Emplois du temps", href: "/admin/schedules", icon: CalendarDays },
    { name: "Salles", href: "/admin/rooms", icon: DoorOpen },
    { name: "Affectations", href: "/admin/assignments", icon: ClipboardList },
    { name: "Bilan des Absences", href: "/admin/attendance/summary", icon: BarChart3, badge: absenceAlertCount > 0 ? absenceAlertCount : undefined },
    { name: "Résultats & Bulletins", href: "/admin/results", icon: GraduationCap, badge: pendingCount > 0 ? pendingCount : undefined },
    { name: "Promotion Annuelle", href: "/admin/promotion", icon: Rocket },
    { name: "Archives", href: "/admin/archives", icon: Archive },
    { name: "Cahiers de texte", href: "/admin/cahier-de-texte", icon: BookText },
    { name: "Bibliothèque", href: "/admin/bibliotheque", icon: BookOpen },
    { name: "Suivi des Heures", href: "/admin/suivi-heures", icon: TrendingUp },
    { name: "Journal d'Activité", href: "/admin/activity-log", icon: ScrollText },
    { name: "Hébergement", href: "/admin/housing", icon: Building2 },
    { name: "Honoraires", href: "/admin/honoraires", icon: Wallet },
    { name: "Rattrapage", href: "/admin/rattrapage", icon: RotateCcw },
    { name: "Jury Spécial", href: "/admin/jury-special", icon: Gavel, badge: juryBadgeCount > 0 ? juryBadgeCount : undefined },
    { name: "Cartes Étudiantes", href: "/admin/cards", icon: CreditCard },
    { name: "Évaluations Enseignants", href: "/admin/evaluations", icon: Star },
    { name: "Réclamations", href: "/admin/reclamations", icon: Scale, badge: adminReclamCount > 0 ? adminReclamCount : undefined },
    { name: "Étudiants en Difficulté", href: "/admin/at-risk", icon: ShieldAlert },
    { name: "Rapports & Statistiques", href: "/admin/reports", icon: BarChart2 },
    { name: "Centre de Documents", href: "/admin/documents", icon: FileText },
    { name: "Gestion des Parents", href: "/admin/parents", icon: User2 },
    { name: "Messages", href: "/admin/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
    { name: "Paramètres", href: "/settings", icon: Settings2 },
  ];

  const hebergementNavItems = [
    { name: "Hébergement", href: "/admin/housing", icon: Building2 },
    { name: "Messages", href: "/admin/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
    { name: "Paramètres", href: "/settings", icon: Settings2 },
  ];

  const navItems =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? planificateurNavItems
        : adminSubRole === "directeur"
        ? directeurNavItems
        : adminSubRole === "hebergement"
        ? hebergementNavItems
        : scolariteNavItems
      : user.role === "teacher"
      ? [
          { name: "Tableau de bord", href: "/teacher", icon: LayoutDashboard },
          { name: "Mon Planning", href: "/teacher/schedule", icon: CalendarDays },
          { name: "Gestion des Présences", href: "/teacher/attendance", icon: ClipboardList },
          { name: "Saisie des Notes", href: "/teacher/grades", icon: PenTool },
          { name: "Rattrapage", href: "/teacher/rattrapage", icon: RotateCcw },
          { name: "Mes Évaluations", href: "/teacher/evaluations", icon: Star },
          { name: "Réclamations", href: "/teacher/reclamations", icon: Scale, badge: teacherReclamCount > 0 ? teacherReclamCount : undefined },
          { name: "Cahier de texte", href: "/teacher/cahier-de-texte", icon: BookText },
          { name: "Bibliothèque", href: "/teacher/bibliotheque", icon: BookOpen },
          { name: "Mes Étudiants", href: "/teacher/students", icon: Users },
          { name: "Mon Profil", href: "/teacher/profile", icon: UserCircle },
          { name: "Notifications", href: "/teacher/notifications", icon: Bell, badge: (unreadData?.count ?? 0) > 0 ? unreadData!.count : undefined },
          { name: "Messages", href: "/teacher/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
          { name: "Paramètres", href: "/settings", icon: Settings2 },
        ]
      : user.role === "parent"
      ? [
          { name: "Tableau de bord", href: "/parent", icon: LayoutDashboard, badge: null },
          { name: "Résultats", href: "/parent/results", icon: GraduationCap, badge: null },
          { name: "Absences", href: "/parent/absences", icon: CalendarOff, badge: null },
          { name: "Emploi du temps", href: "/parent/schedule", icon: CalendarDays, badge: null },
          { name: "Scolarité", href: "/parent/scolarite", icon: Wallet, badge: null },
          { name: "Notifications", href: "/parent/notifications", icon: Bell, badge: (unreadData?.count ?? 0) > 0 ? unreadData!.count : null },
          { name: "Messages", href: "/parent/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
          { name: "Paramètres", href: "/settings", icon: Settings2 },
        ]
      : [
          { name: "Mon Profil", href: "/student", icon: LayoutDashboard, badge: null },
          { name: "Mon Emploi du Temps", href: "/student/schedule", icon: CalendarDays, badge: null },
          { name: "Mes Résultats", href: "/student/grades", icon: FileText, badge: null },
          { name: "Mon Suivi Académique", href: "/student/suivi", icon: TrendingUp, badge: null },
          { name: "Mes Absences", href: "/student/absences", icon: CalendarOff, badge: null },
          { name: "Cahier de texte", href: "/student/cahier-de-texte", icon: BookText, badge: null },
          { name: "Bibliothèque", href: "/student/bibliotheque", icon: BookOpen, badge: null },
          { name: "Notifications", href: "/student/notifications", icon: Bell, badge: (unreadData?.count ?? 0) > 0 ? unreadData!.count : null },
          { name: "Ma Carte Étudiante", href: "/student/card", icon: CreditCard, badge: null },
          ...(hasActiveEvaluation ? [{ name: "Évaluer mes Enseignants", href: "/student/evaluations", icon: Star, badge: null }] : []),
          { name: "Mes Réclamations", href: "/student/reclamations", icon: Scale, badge: null },
          { name: "Messages", href: "/student/messages", icon: MessageSquare, badge: unreadMsgCount > 0 ? unreadMsgCount : undefined },
          { name: "Paramètres", href: "/settings", icon: Settings2 },
        ];

  const roleLabel =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? "Responsable pédagogique"
        : adminSubRole === "directeur"
        ? "Directeur du Centre"
        : adminSubRole === "hebergement"
        ? "Responsable Hébergement"
        : "Assistant(e) de Direction"
      : user.role === "teacher"
      ? "Enseignant"
      : user.role === "parent"
      ? "Parent d'élève"
      : "Étudiant";

  const roleBadgeColor =
    user.role === "admin"
      ? adminSubRole === "planificateur"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : adminSubRole === "directeur"
        ? "bg-violet-100 text-violet-800 border-violet-200"
        : adminSubRole === "hebergement"
        ? "bg-teal-100 text-teal-800 border-teal-200"
        : "bg-blue-100 text-blue-800 border-blue-200"
      : user.role === "teacher"
      ? "bg-green-100 text-green-800 border-green-200"
      : user.role === "parent"
      ? "bg-orange-100 text-orange-800 border-orange-200"
      : "bg-purple-100 text-purple-800 border-purple-200";

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
      <div className="p-6 flex items-center gap-3">
        <CpecLogo variant="icon" size={40} />
        <div className="flex-1 min-w-0">
          <div className="font-serif font-bold text-xl tracking-tight">M15 EduTech</div>
          <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-block mt-0.5 ${roleBadgeColor}`}>
            {roleLabel}
          </div>
        </div>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          title="Se déconnecter"
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sidebar-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
        {user.role === "admin"
          ? adminSubRole === "planificateur"
            ? "Menu Responsable pédagogique"
            : adminSubRole === "directeur"
            ? "Menu Direction"
            : "Menu Scolarité"
          : user.role === "teacher"
          ? "Menu Enseignant"
          : user.role === "parent"
          ? "Menu Parents"
          : "Menu Étudiant"}
      </div>

      {user.role === "admin" && adminSubRole !== "hebergement" && (
        <div className="px-4 pt-1 pb-2">
          <GlobalSearch />
        </div>
      )}

      <nav
        className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto"
        ref={(el) => { if (el) el.scrollTop = _sidebarScrollTop; }}
        onScroll={(e) => { _sidebarScrollTop = (e.currentTarget as HTMLElement).scrollTop; }}
      >
        {navItems.map((item) => {
          // ── Groupe accordéon (ex: Classes & Matières) ──
          if ((item as any).type === "group") {
            const group = item as typeof classesMatieresGroup;
            const isGroupActive = group.children.some(
              (child) => location === child.href || location.startsWith(child.href + "/")
            );
            const isOpen = effectiveClassesOpen;
            return (
              <div key={group.name}>
                <button
                  onClick={() => setClassesGroupOpen((o) => !o)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                    isGroupActive
                      ? "bg-sidebar-primary/15 text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <group.icon className={`w-5 h-5 ${isGroupActive ? "" : "opacity-70"}`} />
                  <span className="font-medium text-sm flex-1 text-left">{group.name}</span>
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
                    : <ChevronRight className="w-4 h-4 opacity-50 shrink-0" />
                  }
                </button>
                {isOpen && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-sidebar-border/40 pl-3">
                    {group.children.map((child) => {
                      const isChildActive = location === child.href || location.startsWith(child.href + "/");
                      return (
                        <Link
                          key={child.name}
                          href={child.href}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 ${
                            isChildActive
                              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          <child.icon className={`w-4 h-4 ${isChildActive ? "" : "opacity-70"}`} />
                          <span className="font-medium text-sm flex-1">{child.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // ── Élément simple ──
          const simpleItem = item as any;
          const ItemIcon = simpleItem.icon;
          const rootExclusions = ["/", "/teacher", "/admin", "/student"];
          const prefixMatch = !rootExclusions.includes(simpleItem.href) &&
            location.startsWith(simpleItem.href + "/") &&
            !navItems.some(
              (other) =>
                (other as any).href !== simpleItem.href &&
                location.startsWith((other as any).href) &&
                (other as any).href?.startsWith(simpleItem.href)
            );
          const isActive = location === simpleItem.href || location.startsWith(simpleItem.href + "?") || prefixMatch;
          return (
            <Link
              key={simpleItem.name}
              href={simpleItem.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <ItemIcon className={`w-5 h-5 ${isActive ? "" : "opacity-70"}`} />
              <span className="font-medium text-sm flex-1">{simpleItem.name}</span>
              {simpleItem.badge != null && (
                <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {simpleItem.badge > 9 ? "9+" : simpleItem.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border/50">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-sidebar-accent/50 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
          </div>
        </div>

        <SyncStatusBar />

        <button
          onClick={() => setIsDark(d => !d)}
          className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm font-medium"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isDark ? "Mode clair" : "Mode sombre"}
        </button>
        <InstallButton />
        <Button
          variant="outline"
          className="w-full justify-start text-sidebar-foreground border-sidebar-border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
          onClick={() => setShowLogoutConfirm(true)}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Déconnexion
        </Button>
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-72 shrink-0">
        <SidebarContent />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <CpecLogo variant="icon" size={32} />
            <span className="font-serif font-bold text-lg">M15 EduTech</span>
          </div>
          <div className="flex items-center gap-1">
            {!isOnline && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                <WifiOff className="w-3 h-3" />
                Hors ligne
              </span>
            )}
            {user?.role === "student" && (
              <Link href="/student/notifications">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5" />
                  {(unreadData?.count ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadData!.count > 9 ? "9+" : unreadData!.count}
                    </span>
                  )}
                </Button>
              </Link>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 border-none">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <div className={`flex-1 p-4 md:p-8 ${noScroll ? "overflow-hidden flex flex-col min-h-0" : "overflow-auto"}`}>
          {children}
        </div>
      </main>

      {/* Mobile install banner */}
      <InstallBannerMobile />

      {/* Logout confirmation dialog */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Confirmer la déconnexion</DialogTitle>
            <DialogDescription className="text-center pt-1">
              Êtes-vous sûr(e) de vouloir vous déconnecter ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-center pt-2 sm:justify-center">
            <Button variant="outline" onClick={() => setShowLogoutConfirm(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleLogoutConfirm}>
              <LogOut className="w-4 h-4 mr-2" />
              Déconnexion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Farewell overlay */}
      {showFarewell && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-500">
          <div className="flex flex-col items-center gap-6 text-center px-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-4xl font-bold">
              {user?.name?.charAt(0) ?? "U"}
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-serif font-bold text-foreground">
                {farewellSubRole === "directeur"
                  ? "À bientôt Monsieur le DG"
                  : "À bientôt"}
              </p>
              <p className="text-muted-foreground text-sm">Déconnexion en cours…</p>
            </div>
            <div className="w-48 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{
                  animation: `farewell-progress ${farewellSubRole === "directeur" ? "2.8" : "2.5"}s linear forwards`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Activation key modal for directeur first login */}
      {user && (user as any).adminSubRole === "directeur" && (
        <ActivationKeyModal
          userId={(user as any).id}
          activationKeyShown={!!(user as any).activationKeyShown}
          isFirstLogin={!!(user as any).isFirstLogin}
        />
      )}
    </div>
  );
}
