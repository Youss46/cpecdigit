import { useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherAssignments, useGetTeacherSchedule } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { BookOpen, PenTool, Calendar, Clock, TrendingUp, MapPin, Users, CalendarDays, ChevronRight, BookText, Bell, BellOff, BellRing } from "lucide-react";
import { useOfflineGrades } from "@/lib/offline-sync";
import { OfflineCapabilities } from "@/components/offline-banner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function TeacherDashboard() {
  const { data: assignments, isLoading } = useGetTeacherAssignments();
  const { data: allEntries = [] } = useGetTeacherSchedule();
  const { isOnline, pendingGrades } = useOfflineGrades();
  const { state: pushState, subscribe, unsubscribe } = usePushNotifications();

  const today = new Date().toISOString().slice(0, 10);

  const todaySessions = useMemo(() => {
    return (allEntries as any[])
      .filter((e: any) => e.sessionDate === today)
      .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
  }, [allEntries, today]);

  const totalPlanned = (assignments as any[] ?? []).reduce((s: number, a: any) => s + (a.plannedHours ?? 0), 0);
  const totalScheduledPerWeek = (assignments as any[] ?? []).reduce((s: number, a: any) => s + (a.scheduledHoursPerWeek ?? 0), 0);

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-8">
        <OfflineCapabilities role="teacher" />
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Espace Enseignant</h1>
            <p className="text-muted-foreground mt-2">Gérez vos classes et la saisie des notes.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {!isOnline && <Badge variant="destructive" className="animate-pulse">Mode Hors Ligne</Badge>}
            {pendingGrades.length > 0 && (
              <Badge className="bg-amber-500 hover:bg-amber-600">
                {pendingGrades.length} note(s) en attente de synchro
              </Badge>
            )}
            {pushState !== "unsupported" && pushState !== "loading" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {pushState === "subscribed" ? (
                      <Button variant="outline" size="sm" onClick={unsubscribe} className="gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                        <BellRing className="w-4 h-4" />
                        Notifications actives
                      </Button>
                    ) : pushState === "denied" ? (
                      <Button variant="outline" size="sm" disabled className="gap-2 text-muted-foreground">
                        <BellOff className="w-4 h-4" />
                        Notifications bloquées
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={subscribe} className="gap-2">
                        <Bell className="w-4 h-4" />
                        Activer les notifications
                      </Button>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    {pushState === "subscribed"
                      ? "Vous recevez des notifications push quand l'emploi du temps change. Cliquez pour désactiver."
                      : pushState === "denied"
                      ? "Les notifications sont bloquées par votre navigateur. Modifiez les paramètres du site pour les réactiver."
                      : "Recevez une notification instantanée dès que le responsable pédagogique programme ou modifie un de vos cours."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Cours du jour */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            Cours du jour —{" "}
            <span className="font-normal text-muted-foreground capitalize">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </h2>
          {todaySessions.length === 0 ? (
            <div className="bg-muted/40 border border-border rounded-2xl flex items-center gap-3 px-5 py-4 text-muted-foreground text-sm">
              <CalendarDays className="w-5 h-5 opacity-50" />
              Aucun cours prévu aujourd'hui.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {todaySessions.map((e: any, i: number) => (
                <div key={e.id ?? i} className="bg-card border border-border rounded-2xl px-4 py-3 space-y-2 shadow-sm hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground leading-tight">{e.subjectName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{e.className}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{e.semesterName}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {e.startTime} – {e.endTime}
                    </span>
                    {e.roomName && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {e.roomName}
                      </span>
                    )}
                  </div>
                  <Link href={`/teacher/cahier-de-texte?open=1&subjectId=${e.subjectId}&classId=${e.classId}&semesterId=${e.semesterId}&date=${today}`}>
                    <div className="flex items-center gap-1.5 text-xs text-primary font-semibold bg-primary/8 hover:bg-primary/15 rounded-lg px-2.5 py-1.5 transition-colors w-full justify-center mt-1">
                      <BookText className="w-3 h-3" />
                      Saisir le cours
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="col-span-1 md:col-span-2 lg:col-span-3 bg-primary text-primary-foreground shadow-xl shadow-primary/20 border-none">
            <CardContent className="p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Prêt pour la saisie ?</h2>
                <p className="text-primary-foreground/80 max-w-xl">
                  L'interface de saisie des notes est optimisée pour mobile et fonctionne même sans connexion internet. Vos saisies seront synchronisées automatiquement.
                </p>
              </div>
              <div className="flex gap-3 flex-wrap justify-center sm:justify-end">
                <Link href="/teacher/schedule" className="bg-white/20 border border-white/40 text-white px-5 py-3 rounded-xl font-semibold hover:bg-white/30 transition-all flex items-center gap-2 whitespace-nowrap">
                  <Calendar className="w-5 h-5" />
                  Mon planning
                </Link>
                <Link href="/teacher/grades" className="bg-white text-primary px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2 whitespace-nowrap">
                  <PenTool className="w-5 h-5" />
                  Saisir les notes
                </Link>
              </div>
            </CardContent>
          </Card>

          {!isLoading && (assignments as any[] ?? []).length > 0 && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{totalPlanned}h</p>
                    <p className="text-sm text-muted-foreground">Volume horaire total attribué</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{Math.round(totalScheduledPerWeek * 10) / 10}h</p>
                    <p className="text-sm text-muted-foreground">Programmé par semaine</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    <BookOpen className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{(assignments as any[]).length}</p>
                    <p className="text-sm text-muted-foreground">Matière{(assignments as any[]).length > 1 ? "s" : ""} assignée{(assignments as any[]).length > 1 ? "s" : ""}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="col-span-1 md:col-span-2 lg:col-span-3">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Vos classes et matières assignées
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />
                ))
              ) : (assignments as any[] ?? []).length === 0 ? (
                <p className="text-muted-foreground">Aucune classe ne vous a été assignée.</p>
              ) : (
                (assignments as any[]).map((a: any) => {
                  const planned = a.plannedHours ?? 0;
                  const perWeek = a.scheduledHoursPerWeek ?? 0;
                  const pct = planned > 0 ? Math.min(100, Math.round((perWeek / planned) * 100 * 10)) : 0;
                  return (
                    <Card key={a.id} className="border-border hover:border-primary/50 transition-colors shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg leading-tight">{a.subjectName}</CardTitle>
                        <p className="text-xs text-muted-foreground font-medium">Coef. {a.coefficient}</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Classe</span>
                            <span className="font-bold">{a.className}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Semestre</span>
                            <span className="font-medium flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {a.semesterName}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />Volume horaire
                            </span>
                            <span className="font-bold text-primary">{planned}h</span>
                          </div>
                          {perWeek > 0 && (
                            <>
                              <Progress value={pct} className="h-1.5" />
                              <p className="text-xs text-muted-foreground text-right">
                                {perWeek}h/sem. planifiée{perWeek > 1 ? "s" : ""}
                              </p>
                            </>
                          )}
                        </div>
                        <Link href={`/teacher/students?classId=${a.classId}`}>
                          <div className="flex items-center justify-between text-xs text-primary font-medium hover:underline underline-offset-2 pt-1">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />Voir les étudiants</span>
                            <ChevronRight className="w-3 h-3" />
                          </div>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
