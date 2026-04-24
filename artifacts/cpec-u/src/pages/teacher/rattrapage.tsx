import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, BookOpen, CheckCircle2, Clock, History, Lock, Send } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type RetakeGrade = {
  id: number;
  studentId: number;
  subjectId: number;
  value: number | null;
  observation: string | null;
  submissionStatus: "draft" | "submitted" | "validated";
  submittedAt: string | null;
  validatedAt: string | null;
};

type StudentRow = {
  studentId: number;
  studentName: string;
  matricule: string | null;
  normalGrade: number | null;
  status: "Ajourné" | "Absent";
  retakeGrade: RetakeGrade | null;
};

type SubjectGroup = {
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  students: StudentRow[];
};

type RetakeSession = {
  id: number;
  label: string;
  status: "open" | "closed";
  semesterId: number;
  semesterName: string;
  openedAt: string;
  closedAt: string | null;
};

type SessionData = {
  session: RetakeSession | null;
  subjects: SubjectGroup[];
};

type HistorySession = RetakeSession & {
  grades: Array<{
    id: number;
    studentId: number;
    studentName: string;
    subjectId: number;
    subjectName: string;
    value: number | null;
    observation: string | null;
    submissionStatus: string;
    submittedAt: string | null;
    validatedAt: string | null;
  }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === "validated") return <Badge className="bg-green-600 text-white">Validé</Badge>;
  if (status === "submitted") return <Badge className="bg-blue-600 text-white">Soumis</Badge>;
  return <Badge variant="outline">Brouillon</Badge>;
}

function sessionStatusBadge(status: "open" | "closed") {
  if (status === "open") return <Badge className="bg-emerald-600 text-white">Ouverte</Badge>;
  return <Badge variant="secondary">Clôturée</Badge>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TeacherRattrapage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Local state ──
  const [localGrades, setLocalGrades] = useState<Record<string, { value: string; observation: string }>>({});
  const [confirmSubjectId, setConfirmSubjectId] = useState<number | null>(null);

  // ── Fetch session data ──
  const { data: sessionData, isLoading, error } = useQuery<SessionData>({
    queryKey: ["teacher-rattrapage-session"],
    queryFn: () => customFetch<SessionData>("/api/teacher/rattrapage/session"),
  });

  // ── Fetch history ──
  const { data: history = [] } = useQuery<HistorySession[]>({
    queryKey: ["teacher-rattrapage-history"],
    queryFn: () => customFetch<HistorySession[]>("/api/teacher/rattrapage/history"),
  });

  const session = sessionData?.session ?? null;
  const subjects = sessionData?.subjects ?? [];

  // ── Save draft ──
  const saveDraft = useMutation({
    mutationFn: ({ sessionId, grades }: { sessionId: number; grades: any[] }) =>
      customFetch<{ saved: number }>(`/api/teacher/rattrapage/${sessionId}/grades`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-rattrapage-session"] });
      toast({ title: "Sauvegardé", description: "Notes enregistrées en brouillon." });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── Submit grades ──
  const submitGrades = useMutation({
    mutationFn: ({ sessionId, subjectId }: { sessionId: number; subjectId: number }) =>
      customFetch<{ submitted: number }>(`/api/teacher/rattrapage/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-rattrapage-session"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-rattrapage-history"] });
      setConfirmSubjectId(null);
      toast({ title: "Notes soumises", description: "Vos notes ont été transmises à l'administration pour validation." });
    },
    onError: (e: Error) => {
      setConfirmSubjectId(null);
      toast({ title: "Soumission impossible", description: e.message, variant: "destructive" });
    },
  });

  // ── Grade key ──
  function gradeKey(studentId: number, subjectId: number) {
    return `${studentId}_${subjectId}`;
  }

  function getLocal(studentId: number, subjectId: number, field: "value" | "observation") {
    return localGrades[gradeKey(studentId, subjectId)]?.[field] ?? "";
  }

  function setLocal(studentId: number, subjectId: number, field: "value" | "observation", val: string) {
    setLocalGrades(prev => ({
      ...prev,
      [gradeKey(studentId, subjectId)]: {
        value: prev[gradeKey(studentId, subjectId)]?.value ?? "",
        observation: prev[gradeKey(studentId, subjectId)]?.observation ?? "",
        [field]: val,
      },
    }));
  }

  // ── Get effective value for a student (local → retakeGrade) ──
  function effectiveValue(student: StudentRow, subjectId: number): string {
    const local = localGrades[gradeKey(student.studentId, subjectId)];
    if (local?.value !== undefined && local.value !== "") return local.value;
    if (student.retakeGrade?.value !== null && student.retakeGrade?.value !== undefined)
      return String(student.retakeGrade.value);
    return "";
  }

  function effectiveObservation(student: StudentRow, subjectId: number): string {
    const local = localGrades[gradeKey(student.studentId, subjectId)];
    if (local?.observation !== undefined && local.observation !== "") return local.observation;
    return student.retakeGrade?.observation ?? "";
  }

  // ── Handle save for a subject ──
  function handleSave(subjectId: number) {
    if (!session) return;
    const group = subjects.find(s => s.subjectId === subjectId);
    if (!group) return;
    const grades = group.students.map(student => ({
      studentId: student.studentId,
      subjectId,
      value: effectiveValue(student, subjectId) !== "" ? parseFloat(effectiveValue(student, subjectId)) : null,
      observation: effectiveObservation(student, subjectId) || null,
    }));
    saveDraft.mutate({ sessionId: session.id, grades });
  }

  // ── Confirm dialog subject info ──
  const confirmGroup = subjects.find(s => s.subjectId === confirmSubjectId);

  // ── Check if any student is missing grade AND not marked absent ──
  function hasMissingGrades(group: SubjectGroup): boolean {
    return group.students.some(student => {
      const val = effectiveValue(student, group.subjectId);
      const obs = effectiveObservation(student, group.subjectId);
      return val === "" && !obs.toLowerCase().includes("absent");
    });
  }

  // ── Check if subject is already submitted ──
  function isSubjectSubmitted(group: SubjectGroup): boolean {
    return group.students.every(s => s.retakeGrade?.submissionStatus === "submitted" || s.retakeGrade?.submissionStatus === "validated");
  }

  // ── Render ──

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["teacher"]}>
        <div className="flex items-center justify-center h-screen text-muted-foreground">Chargement...</div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout allowedRoles={["teacher"]}>
        <div className="flex flex-col items-center justify-center h-screen gap-2 text-destructive">
          <AlertCircle className="w-8 h-8" />
          <p>Erreur de chargement du module de rattrapage.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="h-screen overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Session de Rattrapage</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Saisie des notes de rattrapage pour les étudiants ajournés
              </p>
            </div>
            {session && (
              <div className="flex flex-col items-end gap-1">
                {sessionStatusBadge(session.status)}
                <span className="text-xs text-muted-foreground">{session.label}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="saisie" className="h-full">
            <div className="px-6 pt-4 border-b bg-background">
              <TabsList>
                <TabsTrigger value="saisie" className="gap-2">
                  <BookOpen className="w-4 h-4" />
                  Saisie des notes
                </TabsTrigger>
                <TabsTrigger value="historique" className="gap-2">
                  <History className="w-4 h-4" />
                  Historique
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Saisie Tab ── */}
            <TabsContent value="saisie" className="mt-0 px-6 py-5">
              {!session ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="rounded-full bg-muted p-6">
                    <Lock className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">Session de rattrapage non encore ouverte</h2>
                    <p className="text-muted-foreground text-sm mt-1 max-w-md">
                      L'administration n'a pas encore ouvert de session de rattrapage. Vous serez notifié dès qu'elle sera disponible.
                    </p>
                  </div>
                </div>
              ) : session.status === "closed" ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="rounded-full bg-muted p-6">
                    <Lock className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">Session clôturée</h2>
                    <p className="text-muted-foreground text-sm mt-1 max-w-md">
                      La session de rattrapage <strong>{session.label}</strong> a été clôturée le{" "}
                      {session.closedAt ? format(new Date(session.closedAt), "dd MMMM yyyy", { locale: fr }) : ""}.
                      Aucune modification n'est plus possible.
                    </p>
                  </div>
                </div>
              ) : subjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="rounded-full bg-muted p-6">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">Aucun étudiant éligible</h2>
                    <p className="text-muted-foreground text-sm mt-1 max-w-md">
                      Tous vos étudiants ont validé leurs matières lors de la session normale. Aucun rattrapage n'est nécessaire.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Session info card */}
                  <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                          Session ouverte : <strong>{session.label}</strong>
                        </p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          Semestre : {session.semesterName} — Ouverte le{" "}
                          {format(new Date(session.openedAt), "dd MMMM yyyy", { locale: fr })}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Subject groups */}
                  {subjects.map(group => {
                    const submitted = isSubjectSubmitted(group);
                    const missing = hasMissingGrades(group);

                    return (
                      <Card key={group.subjectId}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <CardTitle className="text-base">{group.subjectName}</CardTitle>
                              <CardDescription>{group.className}</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                              {submitted ? (
                                <Badge className="bg-blue-600 text-white gap-1">
                                  <Clock className="w-3 h-3" />
                                  Notes soumises — en attente de validation
                                </Badge>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSave(group.subjectId)}
                                    disabled={saveDraft.isPending}
                                  >
                                    Enregistrer
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => setConfirmSubjectId(group.subjectId)}
                                    disabled={missing}
                                    className="gap-2"
                                  >
                                    <Send className="w-4 h-4" />
                                    Soumettre
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          {!submitted && missing && (
                            <div className="flex items-center gap-2 text-amber-600 text-xs mt-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Des étudiants n'ont pas encore de note. Saisissez une note ou marquez "Absent au rattrapage" dans l'observation.
                            </div>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Étudiant</th>
                                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-24">Matricule</th>
                                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-28">Note normale</th>
                                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-20">Statut</th>
                                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-28">Note rattrapage</th>
                                  <th className="text-left py-2 font-medium text-muted-foreground">Observation</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.students.map(student => {
                                  const val = effectiveValue(student, group.subjectId);
                                  const obs = effectiveObservation(student, group.subjectId);
                                  const rg = student.retakeGrade;
                                  const isReadonly = submitted || rg?.submissionStatus === "submitted" || rg?.submissionStatus === "validated";

                                  return (
                                    <tr key={student.studentId} className="border-b last:border-0 hover:bg-muted/30">
                                      <td className="py-2 pr-3 font-medium">{student.studentName}</td>
                                      <td className="py-2 pr-3 text-muted-foreground">{student.matricule ?? "—"}</td>
                                      <td className="py-2 pr-3">
                                        {student.normalGrade !== null ? (
                                          <span className="text-red-600 font-semibold">{student.normalGrade}/20</span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="py-2 pr-3">
                                        <Badge variant={student.status === "Absent" ? "destructive" : "secondary"} className="text-xs">
                                          {student.status}
                                        </Badge>
                                      </td>
                                      <td className="py-2 pr-3">
                                        {isReadonly ? (
                                          <span className="font-semibold">
                                            {rg?.value !== null && rg?.value !== undefined ? `${rg.value}/20` : "—"}
                                          </span>
                                        ) : (
                                          <Input
                                            type="number"
                                            min={0}
                                            max={20}
                                            step={0.25}
                                            value={val}
                                            onChange={e => setLocal(student.studentId, group.subjectId, "value", e.target.value)}
                                            placeholder="0–20"
                                            className="w-24 h-8 text-sm"
                                          />
                                        )}
                                      </td>
                                      <td className="py-2">
                                        {isReadonly ? (
                                          <span className="text-muted-foreground text-xs">{rg?.observation ?? "—"}</span>
                                        ) : (
                                          <Input
                                            value={obs}
                                            onChange={e => setLocal(student.studentId, group.subjectId, "observation", e.target.value)}
                                            placeholder="Absent au rattrapage, Copie blanche…"
                                            className="h-8 text-sm"
                                          />
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {/* Submission status per student */}
                          {submitted && (
                            <div className="mt-3 flex items-center gap-2 text-blue-700 dark:text-blue-300 text-xs">
                              <Clock className="w-3.5 h-3.5" />
                              Notes soumises à l'administration. En attente de validation.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── Historique Tab ── */}
            <TabsContent value="historique" className="mt-0 px-6 py-5">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="rounded-full bg-muted p-6">
                    <History className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">Aucun historique disponible</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                      L'historique de vos sessions de rattrapage apparaîtra ici.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {history.map(hist => (
                    <Card key={hist.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{hist.label}</CardTitle>
                            <CardDescription>
                              {hist.semesterName} — Ouverte le {format(new Date(hist.openedAt), "dd MMM yyyy", { locale: fr })}
                              {hist.closedAt && ` — Clôturée le ${format(new Date(hist.closedAt), "dd MMM yyyy", { locale: fr })}`}
                            </CardDescription>
                          </div>
                          {sessionStatusBadge(hist.status)}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Étudiant</th>
                                <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Matière</th>
                                <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Note</th>
                                <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Observation</th>
                                <th className="text-left py-2 font-medium text-muted-foreground">Statut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hist.grades.map(g => (
                                <tr key={g.id} className="border-b last:border-0">
                                  <td className="py-2 pr-3 font-medium">{g.studentName}</td>
                                  <td className="py-2 pr-3 text-muted-foreground">{g.subjectName}</td>
                                  <td className="py-2 pr-3">
                                    {g.value !== null && g.value !== undefined ? (
                                      <span className={g.value >= 10 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                                        {g.value}/20
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="py-2 pr-3 text-muted-foreground text-xs">{g.observation ?? "—"}</td>
                                  <td className="py-2">{statusBadge(g.submissionStatus)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── Confirm Submit Dialog ── */}
      <Dialog open={confirmSubjectId !== null} onOpenChange={() => setConfirmSubjectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la soumission</DialogTitle>
          </DialogHeader>
          {confirmGroup && (
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                Vous êtes sur le point de soumettre les notes de rattrapage pour{" "}
                <strong>{confirmGroup.subjectName}</strong> ({confirmGroup.className}).
              </p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Étudiant</th>
                      <th className="text-left py-2 px-3 font-medium">Note</th>
                      <th className="text-left py-2 px-3 font-medium">Observation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmGroup.students.map(student => (
                      <tr key={student.studentId} className="border-t">
                        <td className="py-2 px-3">{student.studentName}</td>
                        <td className="py-2 px-3 font-semibold">
                          {effectiveValue(student, confirmGroup.subjectId) || "—"}{effectiveValue(student, confirmGroup.subjectId) ? "/20" : ""}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {effectiveObservation(student, confirmGroup.subjectId) || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Une fois soumises, ces notes seront transmises à l'administration pour validation finale.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubjectId(null)}>Annuler</Button>
            <Button
              onClick={() => {
                if (!session || !confirmSubjectId) return;
                // Save first, then submit
                const group = subjects.find(s => s.subjectId === confirmSubjectId);
                if (group) {
                  const grades = group.students.map(student => ({
                    studentId: student.studentId,
                    subjectId: confirmSubjectId,
                    value: effectiveValue(student, confirmSubjectId) !== "" ? parseFloat(effectiveValue(student, confirmSubjectId)) : null,
                    observation: effectiveObservation(student, confirmSubjectId) || null,
                  }));
                  saveDraft.mutateAsync({ sessionId: session.id, grades }).then(() => {
                    submitGrades.mutate({ sessionId: session.id, subjectId: confirmSubjectId });
                  }).catch(() => {});
                }
              }}
              disabled={submitGrades.isPending || saveDraft.isPending}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              Confirmer la soumission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
