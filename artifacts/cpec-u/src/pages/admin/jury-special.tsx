import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListJurySessions,
  useActivateJurySession,
  useGetJuryEligibleStudents,
  useRecordJuryDecision,
  useCloseJurySession,
  useListSemesters,
  type SpecialJuryEligibleStudent,
  type JurySemesterResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Gavel, CheckCircle, XCircle, AlertTriangle, Lock, Plus, FileText,
  Download, RefreshCw, ChevronDown, ChevronUp, Clock, Users,
} from "lucide-react";
import { downloadPvJuryPdf } from "@/lib/pdf-engine/documents";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const DECISION_LABELS: Record<string, string> = {
  validated: "Validé par jury",
  failed: "Ajourné",
  conditional: "Passage conditionnel",
};
const DECISION_COLORS: Record<string, string> = {
  validated: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  conditional: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function JurySpecial() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: sessions = [], isLoading: sessionsLoading } = useListJurySessions();
  const { data: allSemesters = [] } = useListSemesters();

  const activeSession = sessions.find((s) => s.status === "active") ?? null;
  const closedSessions = sessions.filter((s) => s.status === "closed");

  const [viewSession, setViewSession] = useState<typeof sessions[0] | null>(null);
  const currentSessionId = activeSession?.id ?? viewSession?.id ?? null;

  const { data: eligibleStudents = [], isLoading: studentsLoading, refetch: refetchStudents } =
    useGetJuryEligibleStudents(currentSessionId);

  const activateMutation = useActivateJurySession();
  const closeMutation = useCloseJurySession();
  const recordDecision = useRecordJuryDecision(currentSessionId);

  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [activateYear, setActivateYear] = useState("");
  const [activateNotes, setActivateNotes] = useState("");

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<{
    student: SpecialJuryEligibleStudent;
    semester: JurySemesterResult;
  } | null>(null);
  const [decisionType, setDecisionType] = useState<"validated" | "failed" | "conditional">("failed");
  const [newAverage, setNewAverage] = useState("");
  const [justification, setJustification] = useState("");

  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggleRow = (id: number) =>
    setExpandedRows((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const pvRef = useRef<HTMLDivElement>(null);

  const academicYears = [...new Set(allSemesters.map((s: any) => s.academicYear))].sort().reverse();

  const handleActivate = async () => {
    if (!activateYear) { toast({ title: "Erreur", description: "Sélectionnez une année académique.", variant: "destructive" }); return; }
    try {
      await activateMutation.mutateAsync({ academicYear: activateYear, notes: activateNotes || undefined });
      qc.invalidateQueries({ queryKey: ["/api/admin/jury-special/sessions"] });
      setShowActivateDialog(false);
      setActivateYear("");
      setActivateNotes("");
      toast({ title: "Jury activé", description: `Le Jury Spécial ${activateYear} a été activé avec succès.` });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.data?.error ?? e.message, variant: "destructive" });
    }
  };

  const handleClose = async () => {
    if (!currentSessionId) return;
    try {
      const result = await closeMutation.mutateAsync(currentSessionId);
      qc.invalidateQueries({ queryKey: ["/api/admin/jury-special/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/jury-special/sessions", currentSessionId, "eligible"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/alertes/resume"] });
      setShowCloseDialog(false);
      setViewSession(null);
      toast({
        title: "Jury clôturé",
        description: `Le jury a été clôturé. ${result.notifiedCount} étudiant(s) notifié(s).`,
      });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.data?.error ?? e.message, variant: "destructive" });
    }
  };

  const openDecisionDialog = (student: SpecialJuryEligibleStudent, semester: JurySemesterResult) => {
    const existing = semester.decision;
    setDecisionType(existing?.decision ?? "failed");
    setNewAverage(existing?.newAverage?.toFixed(2) ?? "");
    setJustification(existing?.justification ?? "");
    setDecisionDialog({ student, semester });
  };

  const handleSaveDecision = async () => {
    if (!decisionDialog) return;
    if (!justification.trim()) {
      toast({ title: "Motif requis", description: "Veuillez saisir un motif de décision.", variant: "destructive" });
      return;
    }
    if (decisionType === "validated" || decisionType === "conditional") {
      const avg = parseFloat(newAverage);
      if (isNaN(avg) || avg < 0 || avg > 20) {
        toast({ title: "Moyenne invalide", description: "Saisissez une moyenne entre 0 et 20.", variant: "destructive" });
        return;
      }
    }
    try {
      await recordDecision.mutateAsync({
        studentId: decisionDialog.student.studentId,
        semesterId: decisionDialog.semester.semesterId,
        decision: decisionType,
        newAverage: (decisionType === "validated" || decisionType === "conditional") ? parseFloat(newAverage) : undefined,
        justification: justification.trim(),
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/jury-special/sessions", currentSessionId, "eligible"] });
      setDecisionDialog(null);
      toast({ title: "Décision enregistrée", description: "La décision du jury a été sauvegardée." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.data?.error ?? e.message, variant: "destructive" });
    }
  };

  const [pvLoading, setPvLoading] = useState(false);

  const handleGeneratePV = async () => {
    if (!currentSessionId) return;
    setPvLoading(true);
    try {
      await downloadPvJuryPdf(currentSessionId);
    } catch (e: any) {
      toast({ title: "Erreur PV", description: e.message, variant: "destructive" });
    } finally {
      setPvLoading(false);
    }
  };

  const generatePVPrint_UNUSED = (data: any) => {
    const decisionLabel = (d: string) => DECISION_LABELS[d] ?? d;
    const rows = data.decisions.map((d: any) => `
      <tr>
        <td>${d.studentName}</td>
        <td>${d.studentEmail}</td>
        <td>${d.semesterName}</td>
        <td>${d.previousAverage != null ? d.previousAverage.toFixed(2) + "/20" : "—"}</td>
        <td>${d.newAverage != null ? d.newAverage.toFixed(2) + "/20" : "—"}</td>
        <td class="${d.decision === "validated" ? "verdict-ok" : d.decision === "conditional" ? "verdict-cond" : "verdict-ko"}">${decisionLabel(d.decision)}</td>
        <td>${d.justification}</td>
        <td>${d.decidedBy}</td>
        <td>${d.decidedAt ? format(new Date(d.decidedAt), "dd/MM/yyyy HH:mm", { locale: fr }) : "—"}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>PV Jury Spécial – ${data.academicYear}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; padding: 20mm 15mm; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 13pt; text-align: center; margin-bottom: 20px; color: #555; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9pt; }
  th { background: #1e3a5f; color: #fff; padding: 6px 4px; text-align: left; border: 1px solid #ccc; }
  td { padding: 5px 4px; border: 1px solid #ccc; vertical-align: top; }
  tr:nth-child(even) td { background: #f5f5f5; }
  .verdict-ok { color: #166534; font-weight: bold; }
  .verdict-ko { color: #991b1b; font-weight: bold; }
  .verdict-cond { color: #92400e; font-weight: bold; }
  .signatures { margin-top: 40px; display: flex; justify-content: space-around; }
  .sig-box { text-align: center; width: 200px; }
  .sig-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 4px; font-size: 10pt; }
  .footer { text-align: center; font-size: 9pt; color: #888; margin-top: 30px; }
  @media print { body { padding: 10mm; } }
</style>
</head>
<body>
  <h1>CPEC-U — Procès-Verbal du Jury Spécial</h1>
  <h2>Année Académique ${data.academicYear}</h2>
  <div class="meta">
    <span>Date de génération : ${format(new Date(data.generatedAt), "dd MMMM yyyy à HH:mm", { locale: fr })}</span>
    <span>Statut du jury : ${data.session.status === "closed" ? "Clôturé" : "En cours"}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Nom & Prénom</th>
        <th>Email / Matricule</th>
        <th>Semestre</th>
        <th>Moy. initiale</th>
        <th>Moy. jury</th>
        <th>Décision</th>
        <th>Motif</th>
        <th>Décidé par</th>
        <th>Date décision</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="signatures">
    <div class="sig-box"><div class="sig-line">Le Directeur</div></div>
    <div class="sig-box"><div class="sig-line">Le Chef Scolarité</div></div>
    <div class="sig-box"><div class="sig-line">Le Secrétaire du Jury</div></div>
  </div>
  <div class="footer">Document généré automatiquement par M15 EduTech — Confidentiel</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1000,height=800");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const displaySession = activeSession ?? viewSession;
  const isSessionActive = displaySession?.status === "active";

  const pendingCount = eligibleStudents.filter((s) =>
    s.semesters.some((sem) => !sem.decision)
  ).length;
  const decidedCount = eligibleStudents.filter((s) =>
    s.semesters.every((sem) => !!sem.decision || sem.validated)
  ).length;

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Gavel className="h-6 w-6 text-indigo-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Jury Spécial de Fin d'Année</h1>
              <p className="text-sm text-gray-500">Délibération sur les étudiants n'ayant pas validé un ou deux semestres</p>
            </div>
          </div>
          {!activeSession && (
            <Button onClick={() => setShowActivateDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Activer un jury
            </Button>
          )}
        </div>

        {/* Active session banner */}
        {activeSession && (
          <Alert className="border-amber-300 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <span className="font-semibold">Jury actif — Année {activeSession.academicYear}</span>
              {activeSession.notes && <span className="ml-2 text-amber-700">· {activeSession.notes}</span>}
              <span className="ml-2 text-xs text-amber-600">
                Activé le {format(new Date(activeSession.createdAt), "dd/MM/yyyy", { locale: fr })}
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Main content: active or viewed session */}
        {displaySession && (
          <div className="space-y-4">
            {/* Session header */}
            <div className="flex items-center justify-between bg-white border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-sm font-semibold ${isSessionActive ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>
                  {isSessionActive ? "En cours" : "Clôturé"}
                </div>
                <span className="font-medium text-gray-800">Année {displaySession.academicYear}</span>
                {displaySession.closedAt && (
                  <span className="text-xs text-gray-500">
                    · Clôturé le {format(new Date(displaySession.closedAt), "dd/MM/yyyy", { locale: fr })}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={handleGeneratePV} disabled={pvLoading}>
                  {pvLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  PV PDF
                </Button>
                {isSessionActive && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowCloseDialog(true)}
                  >
                    <Lock className="h-4 w-4" />
                    Clôturer le jury
                  </Button>
                )}
              </div>
            </div>

            {/* Stats */}
            {eligibleStudents.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">{eligibleStudents.length}</div>
                  <div className="text-sm text-gray-500 mt-1">Étudiants éligibles</div>
                </div>
                <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
                  <div className="text-sm text-gray-500 mt-1">En attente de décision</div>
                </div>
                <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-green-600">{eligibleStudents.length - pendingCount}</div>
                  <div className="text-sm text-gray-500 mt-1">Délibérés</div>
                </div>
              </div>
            )}

            {/* Eligible students table */}
            {studentsLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Chargement des étudiants éligibles…
              </div>
            ) : eligibleStudents.length === 0 ? (
              <div className="bg-white border rounded-xl p-12 text-center text-gray-400">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">Aucun étudiant éligible</p>
                <p className="text-sm mt-1">Tous les étudiants ont validé leurs semestres, ou les résultats ne sont pas encore disponibles.</p>
              </div>
            ) : (
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-8" />
                      <TableHead>Nom & Prénom</TableHead>
                      <TableHead>Semestre(s) échoué(s)</TableHead>
                      <TableHead className="text-center">Moy. annuelle</TableHead>
                      <TableHead className="text-center">Décisions</TableHead>
                      <TableHead className="text-center">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligibleStudents.map((student) => {
                      const isExpanded = expandedRows.has(student.studentId);
                      const allDecided = student.semesters
                        .filter((s) => !s.validated && s.average !== null)
                        .every((s) => !!s.decision);
                      const anyDecision = student.semesters.some((s) => !!s.decision);

                      return (
                        <>
                          <TableRow
                            key={student.studentId}
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => toggleRow(student.studentId)}
                          >
                            <TableCell>
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </TableCell>
                            <TableCell className="font-medium">{student.studentName}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {student.failedSemesters.map((sem) => (
                                  <Badge key={sem} variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                                    {sem}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {student.annualAverage != null ? (
                                <span className={`font-semibold ${student.annualAverage >= 12 ? "text-green-700" : "text-red-700"}`}>
                                  {student.annualAverage.toFixed(2)}/20
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-center text-sm text-gray-500">
                              {student.semesters.filter((s) => !!s.decision).length}/{student.semesters.filter((s) => !s.validated && s.average !== null).length} sem.
                            </TableCell>
                            <TableCell className="text-center">
                              {allDecided ? (
                                <Badge className="bg-green-100 text-green-800 border-green-200">Délibéré</Badge>
                              ) : anyDecision ? (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200">Partiel</Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-500">En attente</Badge>
                              )}
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${student.studentId}-detail`}>
                              <TableCell colSpan={6} className="bg-gray-50 p-0">
                                <div className="p-4 space-y-3">
                                  {student.semesters.map((sem) => (
                                    <div
                                      key={sem.semesterId}
                                      className={`rounded-lg border p-4 ${sem.validated ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <span className="font-semibold text-gray-800">{sem.semesterName}</span>
                                          <span className={`text-sm font-medium ${sem.average !== null && sem.average >= 12 ? "text-green-700" : "text-red-700"}`}>
                                            {sem.average != null ? `${sem.average.toFixed(2)}/20` : "Non calculé"}
                                          </span>
                                          {sem.validated ? (
                                            <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                                              <CheckCircle className="h-3 w-3 mr-1" />Validé
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                                              <XCircle className="h-3 w-3 mr-1" />Non validé
                                            </Badge>
                                          )}
                                        </div>

                                        {!sem.validated && sem.average !== null && isSessionActive && (
                                          <Button
                                            size="sm"
                                            variant={sem.decision ? "outline" : "default"}
                                            onClick={(e) => { e.stopPropagation(); openDecisionDialog(student, sem); }}
                                          >
                                            <Gavel className="h-3.5 w-3.5 mr-1.5" />
                                            {sem.decision ? "Modifier" : "Statuer"}
                                          </Button>
                                        )}
                                      </div>

                                      {sem.decision && (
                                        <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${DECISION_COLORS[sem.decision.decision]}`}>
                                          <div className="flex items-start gap-2">
                                            <div className="flex-1">
                                              <span className="font-semibold">{DECISION_LABELS[sem.decision.decision]}</span>
                                              {sem.decision.newAverage != null && (
                                                <span className="ml-2">
                                                  · Nouvelle moyenne : <strong>{sem.decision.newAverage.toFixed(2)}/20</strong>
                                                  {sem.decision.previousAverage != null && (
                                                    <span className="text-xs ml-1 opacity-70">
                                                      (ancienne : {sem.decision.previousAverage.toFixed(2)})
                                                    </span>
                                                  )}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="mt-1 text-xs opacity-80">
                                            Motif : {sem.decision.justification}
                                            <span className="ml-2">
                                              · {format(new Date(sem.decision.decidedAt), "dd/MM/yyyy HH:mm", { locale: fr })}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Closed sessions list */}
        {!activeSession && closedSessions.length > 0 && !viewSession && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Jurys passés</h2>
            {closedSessions.map((session) => (
              <div
                key={session.id}
                className="bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm hover:bg-gray-50 cursor-pointer"
                onClick={() => setViewSession(session)}
              >
                <div className="flex items-center gap-3">
                  <Lock className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">Jury — Année {session.academicYear}</span>
                  <Badge variant="outline" className="text-gray-500 text-xs">Clôturé</Badge>
                  {session.closedAt && (
                    <span className="text-xs text-gray-400">
                      {format(new Date(session.closedAt), "dd/MM/yyyy", { locale: fr })}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm">Consulter</Button>
              </div>
            ))}
          </div>
        )}

        {viewSession && !activeSession && (
          <Button variant="ghost" size="sm" className="text-gray-500" onClick={() => setViewSession(null)}>
            ← Retour à la liste
          </Button>
        )}

        {!activeSession && !viewSession && closedSessions.length === 0 && !sessionsLoading && (
          <div className="bg-white border rounded-xl p-12 text-center text-gray-400">
            <Gavel className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium">Aucun jury spécial</p>
            <p className="text-sm mt-1">Activez un jury en fin d'année académique, après la clôture du Semestre 2.</p>
          </div>
        )}
      </div>

      {/* Dialog: Activate jury */}
      <Dialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-indigo-600" />
              Activer le Jury Spécial
            </DialogTitle>
            <DialogDescription>
              Le jury spécial permet de statuer sur les étudiants n'ayant pas validé un ou deux semestres.
              Cette action n'est effectuée qu'une fois par année académique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Année académique *</Label>
              <Select value={activateYear} onValueChange={setActivateYear}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner l'année" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((y: string) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optionnel)</Label>
              <Textarea
                className="mt-1"
                placeholder="Observations, contexte du jury…"
                value={activateNotes}
                onChange={(e) => setActivateNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivateDialog(false)}>Annuler</Button>
            <Button onClick={handleActivate} disabled={activateMutation.isPending}>
              {activateMutation.isPending ? "Activation…" : "Activer le jury"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Decision */}
      <Dialog open={!!decisionDialog} onOpenChange={(o) => !o && setDecisionDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-indigo-600" />
              Décision du jury
            </DialogTitle>
            <DialogDescription>
              {decisionDialog?.student.studentName} · {decisionDialog?.semester.semesterName}
              {decisionDialog?.semester.average != null && (
                <span className="ml-2 font-medium text-red-600">
                  Moyenne : {decisionDialog.semester.average.toFixed(2)}/20
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Décision du jury *</Label>
              <Select value={decisionType} onValueChange={(v) => setDecisionType(v as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="validated">
                    <span className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-4 w-4" />Valider le semestre
                    </span>
                  </SelectItem>
                  <SelectItem value="conditional">
                    <span className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />Passage conditionnel
                    </span>
                  </SelectItem>
                  <SelectItem value="failed">
                    <span className="flex items-center gap-2 text-red-700">
                      <XCircle className="h-4 w-4" />Ajourner (maintenir l'échec)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(decisionType === "validated" || decisionType === "conditional") && (
              <div>
                <Label>Nouvelle moyenne attribuée par le jury *</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.01}
                  className="mt-1"
                  placeholder="Ex. 12.50"
                  value={newAverage}
                  onChange={(e) => setNewAverage(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Valeur entre 0 et 20. Cette moyenne remplacera la moyenne calculée.</p>
              </div>
            )}

            <div>
              <Label>Motif de décision *</Label>
              <Textarea
                className="mt-1"
                placeholder="Ex. Validation jury sur dossier, Rachat de moyenne, Circonstances atténuantes…"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">Champ obligatoire pour la traçabilité. Figurera dans le PV.</p>
            </div>

            {decisionDialog?.semester.decision && (
              <Alert className="bg-amber-50 border-amber-200">
                <Clock className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-700">
                  Décision existante ({DECISION_LABELS[decisionDialog.semester.decision.decision]}) —
                  enregistrée le {format(new Date(decisionDialog.semester.decision.decidedAt), "dd/MM/yyyy HH:mm", { locale: fr })}.
                  Cette modification la remplacera.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>Annuler</Button>
            <Button onClick={handleSaveDecision} disabled={recordDecision.isPending}>
              {recordDecision.isPending ? "Enregistrement…" : "Enregistrer la décision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Close jury */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Lock className="h-5 w-5" />
              Clôturer le Jury Spécial
            </DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Une fois le jury clôturé :
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700 py-2">
            <li>Les décisions ne pourront plus être modifiées</li>
            <li>Les bulletins des étudiants concernés seront mis à jour automatiquement</li>
            <li>Les étudiants seront notifiés individuellement de la décision du jury</li>
            <li>Le PV de jury pourra être téléchargé en PDF</li>
          </ul>
          {pendingCount > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>{pendingCount} étudiant(s)</strong> n'ont pas encore de décision enregistrée.
                Ils seront automatiquement considérés comme <strong>Ajournés</strong>.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleClose} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? "Clôture en cours…" : "Confirmer la clôture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
