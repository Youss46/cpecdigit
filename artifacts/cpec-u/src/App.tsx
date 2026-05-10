import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SplashScreen } from "@/components/splash-screen";
import { OfflineProvider } from "@/lib/offline/offline-context";
import { OfflineBanner } from "@/components/offline-banner";
import NotFound from "@/pages/not-found";

// Pages
import Login from "@/pages/login";
import ChangePassword from "@/pages/change-password";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminClasses from "@/pages/admin/classes";
import AdminSubjects from "@/pages/admin/subjects";
import AdminSemesters from "@/pages/admin/semesters";
import AdminAssignments from "@/pages/admin/assignments";
import AdminResults from "@/pages/admin/results";
import AdminRooms from "@/pages/admin/rooms";
import AdminSchedules from "@/pages/admin/schedules";
import PlanningAssignments from "@/pages/admin/planning-assignments";
import BlockedDates from "@/pages/admin/blocked-dates";
import ActivityLog from "@/pages/admin/activity-log";
import TeacherDashboard from "@/pages/teacher/dashboard";
import GradeEntry from "@/pages/teacher/grade-entry";
import TeacherSchedule from "@/pages/teacher/schedule";
import TeacherAttendance from "@/pages/teacher/attendance";
import TeacherProfile from "@/pages/teacher/profile";
import TeacherStudents from "@/pages/teacher/students";
import TeacherStudentDetail from "@/pages/teacher/student-detail";
import CahierDeTexte from "@/pages/teacher/cahier-de-texte";
import TeacherBibliotheque from "@/pages/teacher/bibliotheque";
import StudentBibliotheque from "@/pages/student/bibliotheque";
import AdminBibliotheque from "@/pages/admin/bibliotheque";
import AdminAttendance from "@/pages/admin/attendance";
import HonorairesPage from "@/pages/admin/honoraires";
import AttendanceSummary from "@/pages/admin/attendance-summary";
import StudentDashboard from "@/pages/student/dashboard";
import StudentGrades from "@/pages/student/grades";
import StudentSchedule from "@/pages/student/schedule";
import StudentNotifications from "@/pages/student/notifications";
import TeacherNotifications from "@/pages/teacher/notifications";
import StudentAbsences from "@/pages/student/absences";
import AdminMessages from "@/pages/admin/messages";
import SharedMessages from "@/pages/shared/messages";
import HousingPage from "@/pages/admin/housing";
import AnnualPromotion from "@/pages/admin/promotion";
import ArchivesPage from "@/pages/admin/archives";
import AdminStudentDetail from "@/pages/admin/student-detail";
import AdminCahierDeTexte from "@/pages/admin/cahier-de-texte";
import AdminSuiviHeures from "@/pages/admin/suivi-heures";
import AdminReports from "@/pages/admin/reports";
import AdminRattrapage from "@/pages/admin/rattrapage";
import TeacherRattrapage from "@/pages/teacher/rattrapage";
import JurySpecial from "@/pages/admin/jury-special";
import StudentCahierDeTexte from "@/pages/student/cahier-de-texte";
import DevDashboard from "@/pages/dev/index";
import StudentCard from "@/pages/student/card";
import VerifyCard from "@/pages/verify";
import VerifyBulletin from "@/pages/verify-bulletin";
import AdminCards from "@/pages/admin/cards";
import AdminEvaluations from "@/pages/admin/evaluations";
import StudentEvaluations from "@/pages/student/evaluations";
import TeacherEvaluations from "@/pages/teacher/evaluations";
import AdminReclamations from "@/pages/admin/reclamations";
import StudentReclamations from "@/pages/student/reclamations";
import TeacherReclamations from "@/pages/teacher/reclamations";
import AdminDocuments from "@/pages/admin/documents";
import AdminParents from "@/pages/admin/parents";
import ParentDashboard from "@/pages/parent/dashboard";
import ParentResults from "@/pages/parent/results";
import ParentAbsences from "@/pages/parent/absences";
import ParentSchedule from "@/pages/parent/schedule";
import ParentNotifications from "@/pages/parent/notifications";
import ParentScolarite from "@/pages/parent/scolarite";
import AtRiskPage from "@/pages/admin/at-risk";
import StudentSuiviPage from "@/pages/student/suivi";
import AdminScolarite from "@/pages/admin/scolarite";
import SettingsPage from "@/pages/settings";
import ResetPassword from "@/pages/reset-password";
import TeacherDevoirs from "@/pages/teacher/devoirs";
import TeacherDevoirRapport from "@/pages/teacher/devoir-rapport";
import StudentDevoirs from "@/pages/student/devoirs";
import StudentDevoirSession from "@/pages/student/devoir-session";
import StudentDevoirResultats from "@/pages/student/devoir-resultats";
import AdminMemoires from "@/pages/admin/memoires";
import StudentMemoires from "@/pages/student/memoires";
import EspaceDiplome from "@/pages/student/espace-diplome";
import VerifyDiploma from "@/pages/verify-diploma";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location]);
  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
      {/* Public / Auth */}
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/change-password" component={ChangePassword} />
      <Route path="/reset-password" component={ResetPassword} />

      {/* Admin Routes */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/classes" component={AdminClasses} />
      <Route path="/admin/subjects" component={AdminSubjects} />
      <Route path="/admin/semesters" component={AdminSemesters} />
      <Route path="/admin/assignments" component={AdminAssignments} />
      <Route path="/admin/results" component={AdminResults} />
      <Route path="/admin/promotion" component={AnnualPromotion} />
      <Route path="/admin/archives" component={ArchivesPage} />
      <Route path="/admin/rooms" component={AdminRooms} />
      <Route path="/admin/schedules" component={AdminSchedules} />
      <Route path="/admin/planning-assignments" component={PlanningAssignments} />
      <Route path="/admin/blocked-dates" component={BlockedDates} />
      <Route path="/admin/activity-log" component={ActivityLog} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/attendance" component={AdminAttendance} />
      <Route path="/admin/attendance/summary" component={AttendanceSummary} />
      <Route path="/admin/messages" component={AdminMessages} />
      <Route path="/admin/housing" component={HousingPage} />
      <Route path="/admin/honoraires" component={HonorairesPage} />
      <Route path="/admin/scolarite" component={AdminScolarite} />
      <Route path="/admin/students/:id" component={AdminStudentDetail} />
      <Route path="/admin/cahier-de-texte" component={AdminCahierDeTexte} />
      <Route path="/admin/bibliotheque" component={AdminBibliotheque} />
      <Route path="/admin/suivi-heures" component={AdminSuiviHeures} />
      <Route path="/admin/rattrapage" component={AdminRattrapage} />
      <Route path="/admin/jury-special" component={JurySpecial} />

      {/* Teacher Routes */}
      <Route path="/teacher" component={TeacherDashboard} />
      <Route path="/teacher/grades" component={GradeEntry} />
      <Route path="/teacher/schedule" component={TeacherSchedule} />
      <Route path="/teacher/attendance" component={TeacherAttendance} />
      <Route path="/teacher/profile" component={TeacherProfile} />
      <Route path="/teacher/students" component={TeacherStudents} />
      <Route path="/teacher/students/:id" component={TeacherStudentDetail} />
      <Route path="/teacher/rattrapage" component={TeacherRattrapage} />
      <Route path="/teacher/cahier-de-texte" component={CahierDeTexte} />
      <Route path="/teacher/bibliotheque" component={TeacherBibliotheque} />
      <Route path="/teacher/notifications" component={TeacherNotifications} />
      <Route path="/teacher/messages">
        {() => <SharedMessages allowedRoles={["teacher"]} />}
      </Route>

      {/* Student Routes */}
      <Route path="/student" component={StudentDashboard} />
      <Route path="/student/absences" component={StudentAbsences} />
      <Route path="/student/bibliotheque" component={StudentBibliotheque} />
      <Route path="/student/cahier-de-texte" component={StudentCahierDeTexte} />
      <Route path="/student/schedule" component={StudentSchedule} />
      <Route path="/student/grades" component={StudentGrades} />
      <Route path="/student/notifications" component={StudentNotifications} />
      <Route path="/student/card" component={StudentCard} />
      <Route path="/student/messages">
        {() => <SharedMessages allowedRoles={["student"]} />}
      </Route>

      <Route path="/admin/cards" component={AdminCards} />
      <Route path="/admin/evaluations" component={AdminEvaluations} />
      <Route path="/admin/documents" component={AdminDocuments} />
      <Route path="/admin/parents" component={AdminParents} />

      {/* Parent Routes */}
      <Route path="/parent" component={ParentDashboard} />
      <Route path="/parent/results" component={ParentResults} />
      <Route path="/parent/absences" component={ParentAbsences} />
      <Route path="/parent/schedule" component={ParentSchedule} />
      <Route path="/parent/notifications" component={ParentNotifications} />
      <Route path="/parent/scolarite" component={ParentScolarite} />
      <Route path="/parent/messages">
        {() => <SharedMessages allowedRoles={["parent"]} />}
      </Route>
      <Route path="/admin/at-risk" component={AtRiskPage} />
      <Route path="/student/suivi" component={StudentSuiviPage} />
      <Route path="/student/evaluations" component={StudentEvaluations} />
      <Route path="/teacher/evaluations" component={TeacherEvaluations} />
      <Route path="/student/reclamations" component={StudentReclamations} />
      <Route path="/teacher/reclamations" component={TeacherReclamations} />
      <Route path="/admin/reclamations" component={AdminReclamations} />
      <Route path="/teacher/devoirs" component={TeacherDevoirs} />
      <Route path="/teacher/devoirs/:id" component={TeacherDevoirRapport} />
      <Route path="/student/devoirs" component={StudentDevoirs} />
      <Route path="/student/devoirs/:id/resultats/:sessionId" component={StudentDevoirResultats} />
      <Route path="/student/devoirs/:id" component={StudentDevoirSession} />
      <Route path="/admin/memoires" component={AdminMemoires} />
      <Route path="/student/memoires" component={StudentMemoires} />
      <Route path="/settings" component={SettingsPage} />

      <Route path="/student/espace-diplome" component={EspaceDiplome} />

      {/* Public: Diploma attestation verification */}
      <Route path="/verify/diploma/:token" component={VerifyDiploma} />

      {/* Public: Bulletin verification (must come before /verify/:hash) */}
      <Route path="/verify/bulletin/:token" component={VerifyBulletin} />

      {/* Public: Card verification (no auth required) */}
      <Route path="/verify/:hash" component={VerifyCard} />

      {/* Developer portal — hidden from navigation */}
      <Route path="/dev" component={DevDashboard} />

      <Route component={NotFound} />
    </Switch>
    </>
  );
}

function App() {
  const isDevPortal = window.location.pathname.endsWith("/dev") || window.location.pathname.includes("/dev/");
  const isPublicPage = window.location.pathname.includes("/verify/") || window.location.pathname.includes("/verify-diploma");
  const [showSplash, setShowSplash] = useState(() => {
    if (isDevPortal || isPublicPage) return false;
    const seen = sessionStorage.getItem("cpec_splash_seen");
    return !seen;
  });

  const handleSplashDone = () => {
    sessionStorage.setItem("cpec_splash_seen", "1");
    setShowSplash(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineProvider>
        <TooltipProvider>
          {showSplash && <SplashScreen onDone={handleSplashDone} />}
          <OfflineBanner />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </OfflineProvider>
    </QueryClientProvider>
  );
}

export default App;
