import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherAssignments, useGetTeacherGrades, useSubmitGradesBulk } from "@workspace/api-client-react";
import { useGetTeacherApprovals, useGetClassStudents, useSubmitGradesForReview, useGetGradeSubmissionStatus, useSendGradesToStudents } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { WifiOff, Save, CheckCircle2, Send, Clock, BellRing, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useOffline } from "@/lib/offline/offline-context";
import { saveGradesOffline } from "@/lib/offline/offline-actions";

const EVAL_LABELS = ["Éval 1", "Éval 2", "Éval 3", "Éval 4"] as const;
const EVAL_COUNT = 4;

type GradeKey = `${number}_${number}`;
function gradeKey(studentId: number, evalNum: number): GradeKey {
  return `${studentId}_${evalNum}`;
}

export default function GradeEntry() {
  const { data: assignments } = useGetTeacherAssignments();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");

  const selectedAssignment = assignments?.find(a => a.id.toString() === selectedAssignmentId);

  const { data: initialGrades, isLoading } = useGetTeacherGrades(
    {
      subjectId: selectedAssignment?.subjectId,
      semesterId: selectedAssignment?.semesterId,
      classId: selectedAssignment?.classId
    },
    { query: { enabled: !!selectedAssignment } as any }
  );

  const { data: enrolledStudents = [] } = useGetClassStudents(
    selectedAssignment?.classId ?? 0,
    { query: { enabled: !!selectedAssignment } } as any
  );

  // Build one row per student with their existing evaluations
  const studentRows = useMemo(() => {
    if (!selectedAssignment) return [];
    // Group existing grades by studentId → Map<studentId, Map<evalNum, value>>
    const existingMap = new Map<number, Map<number, number>>();
    for (const g of (initialGrades ?? []) as any[]) {
      if (!existingMap.has(g.studentId)) existingMap.set(g.studentId, new Map());
      existingMap.get(g.studentId)!.set(g.evaluationNumber ?? 1, g.value);
    }
    return (enrolledStudents as any[]).map((s: any) => ({
      studentId: s.id,
      studentName: s.name,
      subjectId: selectedAssignment.subjectId,
      semesterId: selectedAssignment.semesterId,
      evalValues: existingMap.get(s.id) ?? new Map<number, number>(),
    }));
  }, [enrolledStudents, initialGrades, selectedAssignment]);

  // localGrades: key = `studentId_evalNum`, value = string input
  const [localGrades, setLocalGrades] = useState<Record<GradeKey, string>>({});

  const { toast } = useToast();
  const submitBulk = useSubmitGradesBulk();
  const submitForReview = useSubmitGradesForReview();
  const sendGrades = useSendGradesToStudents();

  const { isOnline } = useOffline();

  // Check which of the teacher's assignments are approved by admin
  const { data: teacherApprovals = [] } = useGetTeacherApprovals();
  const approvedKey = (subjectId: number, classId: number, semesterId: number) =>
    `${subjectId}-${classId}-${semesterId}`;
  const approvedSet = useMemo(() => new Set(teacherApprovals.map(a => approvedKey(a.subjectId, a.classId, a.semesterId))), [teacherApprovals]);
  const isLocked = selectedAssignment
    ? approvedSet.has(approvedKey(selectedAssignment.subjectId, selectedAssignment.classId, selectedAssignment.semesterId))
    : false;
  const currentApproval = selectedAssignment
    ? teacherApprovals.find(a => a.subjectId === selectedAssignment.subjectId && a.classId === selectedAssignment.classId && a.semesterId === selectedAssignment.semesterId)
    : undefined;

  const submissionStatusParams = selectedAssignment && !isLocked
    ? { subjectId: selectedAssignment.subjectId, classId: selectedAssignment.classId, semesterId: selectedAssignment.semesterId }
    : null;
  const { data: submissionStatus, refetch: refetchSubmissionStatus } = useGetGradeSubmissionStatus(submissionStatusParams);
  const isSubmitted = !!submissionStatus?.submitted;

  const handleSubmitForReview = async () => {
    if (!selectedAssignment || isLocked) return;
    try {
      await submitForReview.mutateAsync({
        subjectId: selectedAssignment.subjectId,
        classId: selectedAssignment.classId,
        semesterId: selectedAssignment.semesterId,
      });
      refetchSubmissionStatus();
      toast({ title: "Notes soumises pour validation — l'admin sera notifié." });
    } catch (e: any) {
      toast({ title: e?.message ?? "Erreur lors de la soumission.", variant: "destructive" });
    }
  };

  const handleSendToStudents = async () => {
    if (!selectedAssignment) return;
    try {
      const result = await sendGrades.mutateAsync({
        subjectId: selectedAssignment.subjectId,
        classId: selectedAssignment.classId,
        semesterId: selectedAssignment.semesterId,
      });
      toast({ title: `Notes envoyées à ${result.notifiedCount} étudiant${result.notifiedCount > 1 ? "s" : ""}.` });
    } catch (e: any) {
      toast({ title: e?.message ?? "Erreur lors de l'envoi.", variant: "destructive" });
    }
  };

  // Populate localGrades from server data when studentRows change
  useEffect(() => {
    if (studentRows.length === 0) return;
    const map: Record<GradeKey, string> = {};
    for (const row of studentRows) {
      for (let e = 1; e <= EVAL_COUNT; e++) {
        const existing = row.evalValues.get(e);
        map[gradeKey(row.studentId, e)] = existing !== undefined ? existing.toString() : "";
      }
    }
    setLocalGrades(map);
  }, [studentRows]);

  const handleGradeChange = (studentId: number, evalNum: number, raw: string) => {
    if (isLocked) return;
    if (raw !== "" && (parseFloat(raw) < 0 || parseFloat(raw) > 20)) return;
    setLocalGrades(prev => ({ ...prev, [gradeKey(studentId, evalNum)]: raw }));
  };

  // Compute average for a student from current local inputs
  const getStudentAverage = (studentId: number): string => {
    const vals: number[] = [];
    for (let e = 1; e <= EVAL_COUNT; e++) {
      const v = localGrades[gradeKey(studentId, e)];
      if (v !== "" && v !== undefined) vals.push(parseFloat(v));
    }
    if (vals.length === 0) return "—";
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg.toFixed(2);
  };

  const handleSave = async () => {
    if (!selectedAssignment || isLocked) return;

    const gradesToSubmit: any[] = [];
    for (const row of studentRows) {
      for (let e = 1; e <= EVAL_COUNT; e++) {
        const val = localGrades[gradeKey(row.studentId, e)];
        if (val !== "" && val !== undefined) {
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 20) {
            gradesToSubmit.push({
              studentId: row.studentId,
              subjectId: row.subjectId,
              semesterId: row.semesterId,
              evaluationNumber: e,
              value: parsed,
            });
          }
        }
      }
    }

    if (gradesToSubmit.length === 0) {
      toast({ title: "Aucune note à enregistrer", variant: "destructive" });
      return;
    }

    try {
      if (!isOnline) {
        await saveGradesOffline(gradesToSubmit);
        toast({ title: "Hors ligne — Notes sauvegardées localement", description: `${gradesToSubmit.length} note${gradesToSubmit.length > 1 ? "s" : ""} seront synchronisée${gradesToSubmit.length > 1 ? "s" : ""} au retour de connexion.` });
      } else {
        await submitBulk.mutateAsync({ data: { grades: gradesToSubmit } });
        toast({ title: `${gradesToSubmit.length} note${gradesToSubmit.length > 1 ? "s" : ""} enregistrée${gradesToSubmit.length > 1 ? "s" : ""} avec succès` });
      }
    } catch (e: any) {
      const msg = e?.message ?? "Erreur lors de l'enregistrement";
      toast({
        title: msg.includes("verrouillées") ? "Notes verrouillées par le Assistant(e) de Direction." : msg,
        variant: "destructive"
      });
    }
  };

  const filledCount = studentRows.reduce((count, row) => {
    let rowFilled = 0;
    for (let e = 1; e <= EVAL_COUNT; e++) {
      const v = localGrades[gradeKey(row.studentId, e)];
      if (v !== "" && v !== undefined) rowFilled++;
    }
    return count + rowFilled;
  }, 0);
  const totalFields = studentRows.length * EVAL_COUNT;

  const studentsWithoutAnyGrade = studentRows.filter(row => {
    for (let e = 1; e <= EVAL_COUNT; e++) {
      const v = localGrades[gradeKey(row.studentId, e)];
      if (v !== "" && v !== undefined) return false;
    }
    return true;
  }).length;

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6 max-w-5xl mx-auto pb-24">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-serif font-bold text-foreground">Saisie des Notes</h1>
          {!isOnline && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
              <WifiOff className="w-5 h-5" />
              <span className="font-semibold text-sm">Connexion perdue. Vos modifications seront perdues si vous quittez.</span>
            </div>
          )}
        </div>

        <Card className="p-4 shadow-sm border-border bg-card sticky top-4 z-20">
          <label className="text-sm font-semibold text-muted-foreground block mb-2">Choisir la classe et matière</label>
          <Select value={selectedAssignmentId} onValueChange={v => { setSelectedAssignmentId(v); setLocalGrades({}); }}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue placeholder="Sélectionner une affectation..." />
            </SelectTrigger>
            <SelectContent>
              {assignments?.map(a => {
                const approved = approvedSet.has(approvedKey(a.subjectId, a.classId, a.semesterId));
                return (
                  <SelectItem key={a.id} value={a.id.toString()} className="py-3">
                    <span className="flex items-center gap-2">
                      <span>{a.subjectName} — {a.className} ({a.semesterName})</span>
                      {approved && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded-full shrink-0">
                          <ShieldCheck className="w-2.5 h-2.5" />VALIDÉ
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Card>

        {/* Validation badge — shown when admin has approved the grades */}
        {isLocked && selectedAssignment && (
          <div className="flex items-start gap-4 bg-emerald-50 border border-emerald-300 rounded-xl p-4 shadow-sm">
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 border-2 border-emerald-400">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-emerald-800 text-sm flex items-center gap-2">
                Notes validées par l'administration
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-2.5 h-2.5" />APPROUVÉ
                </span>
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {currentApproval?.approvedByName
                  ? `Validé par ${currentApproval.approvedByName}${currentApproval.approvedAt ? " · " + new Date(currentApproval.approvedAt).toLocaleDateString("fr-FR", { dateStyle: "long" }) : ""}.`
                  : "L'administration a validé et verrouillé ces notes."}
                {" "}Les notes sont désormais officielles — toute modification passe par dérogation.
              </p>
            </div>
          </div>
        )}

        {selectedAssignment && (
          <div className="space-y-4 mt-8">
            <div className="flex justify-between items-end mb-4 px-2 flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-xl">Liste des étudiants</h3>
                {!isLoading && studentRows.length > 0 && studentsWithoutAnyGrade > 0 && !isLocked && (
                  <p className="text-sm text-amber-600 font-medium mt-0.5 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                    {studentsWithoutAnyGrade} étudiant{studentsWithoutAnyGrade > 1 ? "s" : ""} sans aucune note saisie
                  </p>
                )}
              </div>
              <span className="text-sm text-muted-foreground font-semibold">
                {studentRows.length} étudiant{studentRows.length > 1 ? "s" : ""} · {filledCount}/{totalFields} notes
              </span>
            </div>

            {/* Column headers */}
            {!isLoading && studentRows.length > 0 && (
              <div className="hidden sm:grid grid-cols-[1fr_repeat(4,5.5rem)_5rem] gap-2 px-4 pb-1">
                <span />
                {EVAL_LABELS.map(label => (
                  <span key={label} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                ))}
                <span className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Moy.</span>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Chargement de la liste...</div>
            ) : studentRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Aucun étudiant inscrit dans cette classe.</div>
            ) : (
              <div className="space-y-3">
                {studentRows.map(row => {
                  const avg = getStudentAverage(row.studentId);
                  const hasAll = Array.from({ length: EVAL_COUNT }, (_, i) => localGrades[gradeKey(row.studentId, i + 1)]).every(v => v !== "" && v !== undefined);
                  const hasNone = avg === "—";

                  return (
                    <div
                      key={row.studentId}
                      className={`p-4 bg-card rounded-xl border shadow-sm transition-colors ${isLocked ? "border-emerald-200 bg-emerald-50/30" : hasNone ? "border-amber-200 hover:border-amber-400" : "border-border hover:border-primary/30"}`}
                    >
                      {/* Mobile: stacked layout */}
                      <div className="flex items-center justify-between mb-3 sm:hidden">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-base text-foreground">{row.studentName}</p>
                          {isLocked && <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />}
                        </div>
                        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${avg === "—" ? "text-muted-foreground bg-muted" : parseFloat(avg) >= 10 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
                          Moy. {avg}/20
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:hidden">
                        {Array.from({ length: EVAL_COUNT }, (_, i) => i + 1).map(e => {
                          const k = gradeKey(row.studentId, e);
                          return (
                            <div key={e}>
                              <label className="text-xs text-muted-foreground font-semibold block mb-1">{EVAL_LABELS[e - 1]}</label>
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                max="20"
                                placeholder="—"
                                value={localGrades[k] !== undefined ? localGrades[k] : ""}
                                onChange={ev => handleGradeChange(row.studentId, e, ev.target.value)}
                                readOnly={isLocked}
                                className={`text-center font-mono font-bold h-11 focus:ring-primary/30 ${isLocked ? "bg-muted cursor-not-allowed" : ""}`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop: row layout */}
                      <div className="hidden sm:grid grid-cols-[1fr_repeat(4,5.5rem)_5rem] gap-2 items-center">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-base text-foreground">{row.studentName}</p>
                          {hasAll && !isLocked && <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-60" />}
                          {isLocked && <ShieldCheck className="w-4 h-4 text-emerald-500" title="Notes validées par l'administration" />}
                        </div>
                        {Array.from({ length: EVAL_COUNT }, (_, i) => i + 1).map(e => {
                          const k = gradeKey(row.studentId, e);
                          return (
                            <Input
                              key={e}
                              type="number"
                              step="0.5"
                              min="0"
                              max="20"
                              placeholder="—"
                              value={localGrades[k] !== undefined ? localGrades[k] : ""}
                              onChange={ev => handleGradeChange(row.studentId, e, ev.target.value)}
                              readOnly={isLocked}
                              className={`text-center font-mono font-bold h-11 focus:ring-primary/30 ${isLocked ? "bg-muted cursor-not-allowed" : ""}`}
                            />
                          );
                        })}
                        <div className={`text-center font-bold text-sm px-2 py-1 rounded-lg ${avg === "—" ? "text-muted-foreground" : parseFloat(avg) >= 10 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
                          {avg}/20
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Send to students button — always available when grades exist */}
        {selectedAssignment && filledCount > 0 && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400"
              onClick={handleSendToStudents}
              disabled={sendGrades.isPending}
            >
              <BellRing className="w-4 h-4 mr-2" />
              {sendGrades.isPending ? "Envoi en cours..." : "Envoyer les notes aux étudiants"}
            </Button>
          </div>
        )}

        {/* Submission status banner */}
        {selectedAssignment && !isLocked && isSubmitted && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <Clock className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <p className="font-semibold text-blue-800 text-sm">Notes soumises — en attente de validation</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Soumises le {submissionStatus?.submittedAt ? new Date(submissionStatus.submittedAt).toLocaleDateString("fr-FR", { dateStyle: "long" }) : "—"}.
                Vous pouvez encore modifier et re-soumettre.
              </p>
            </div>
          </div>
        )}

        {/* Save + Submit buttons — hidden when locked */}
        {selectedAssignment && !isLocked && (
          <div className="fixed bottom-6 left-0 right-0 px-4 md:static md:px-0 md:mt-4 z-30 flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              variant="outline"
              className="flex-1 h-14 text-base font-semibold"
              onClick={handleSave}
              disabled={submitBulk.isPending}
            >
              <Save className="w-5 h-5 mr-2" />
              {submitBulk.isPending ? "Enregistrement..." : `Enregistrer (${filledCount}/${totalFields} notes)`}
            </Button>
            <Button
              size="lg"
              className={`flex-1 h-14 text-base font-bold shadow-xl shadow-primary/30 md:shadow-none hover:-translate-y-1 transition-transform ${isSubmitted ? "bg-blue-600 hover:bg-blue-700" : "bg-primary"}`}
              onClick={handleSubmitForReview}
              disabled={submitForReview.isPending || filledCount === 0}
            >
              <Send className="w-5 h-5 mr-2" />
              {submitForReview.isPending ? "Soumission..." : isSubmitted ? "Re-soumettre pour validation" : "Soumettre pour validation"}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
