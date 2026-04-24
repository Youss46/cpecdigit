import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, FileText, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight,
  Upload, Info, Plus, RefreshCw, Gavel, CheckSquare, Square, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentViewer } from "@/components/attachment-viewer";

const API = (path: string) => `/api${path}`;

const CLAIM_TYPES = [
  { value: "erreur_saisie", label: "Erreur de saisie" },
  { value: "copie_non_corrigee", label: "Copie non corrigée" },
  { value: "bareme_conteste", label: "Barème contesté" },
  { value: "autre", label: "Autre" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  soumise:      { label: "Soumise",       color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: Clock },
  en_cours:     { label: "En cours",      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: RefreshCw },
  en_arbitrage: { label: "En arbitrage",  color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", icon: Gavel },
  acceptee:     { label: "Acceptée",      color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle },
  rejetee:      { label: "Rejetée",       color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: XCircle },
  cloturee:     { label: "Clôturée",      color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300", icon: FileText },
};

const ACTION_LABELS: Record<string, string> = {
  submitted:                "Réclamation soumise",
  teacher_opened:           "Examinée par l'enseignant",
  teacher_accepted:         "Acceptée par l'enseignant",
  teacher_rejected:         "Rejetée par l'enseignant",
  teacher_transmitted:      "Transmise à l'administration",
  admin_validated_accept:   "Validée par l'administration",
  admin_rejected_accept:    "Modification refusée par l'administration",
  admin_overrode_rejection: "Note modifiée par l'administration",
  admin_closed:             "Clôturée par l'administration",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function formatDateTime(d: string) {
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Step = "subject" | "evals" | "details" | "confirm";

interface ContestedEval {
  evaluationNumber: number;
  currentGrade: number;
}

export default function StudentReclamations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("subject");

  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedEvals, setSelectedEvals] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({ type: "", motif: "" });
  const [file, setFile] = useState<File | null>(null);

  const resetForm = () => {
    setStep("subject");
    setSelectedSubjectId("");
    setSelectedEvals(new Set());
    setForm({ type: "", motif: "" });
    setFile(null);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam) {
      setExpandedId(Number(idParam));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: periodData } = useQuery({
    queryKey: ["/api/student/reclamations/period"],
    queryFn: () => fetch(API("/student/reclamations/period"), { credentials: "include" }).then(r => r.json()),
    staleTime: 2 * 60 * 1000,
  });
  const period = (periodData as any)?.period;
  const periodSemesterId = period?.semesterId ? String(period.semesterId) : null;

  const { data: reclamations = [], isLoading } = useQuery({
    queryKey: ["/api/student/reclamations"],
    queryFn: () => fetch(API("/student/reclamations"), { credentials: "include" }).then(r => r.json()),
    staleTime: 60 * 1000,
  });

  const { data: detailData } = useQuery({
    queryKey: ["/api/student/reclamations", expandedId],
    queryFn: () => expandedId
      ? fetch(API(`/student/reclamations/${expandedId}`), { credentials: "include" }).then(r => r.json())
      : null,
    enabled: expandedId !== null,
    staleTime: 30 * 1000,
  });

  const { data: gradesData } = useQuery({
    queryKey: ["/api/student/grades", periodSemesterId],
    queryFn: () => fetch(API(`/student/grades?semesterId=${periodSemesterId}`), { credentials: "include" }).then(r => r.json()),
    enabled: !!periodSemesterId,
    staleTime: 5 * 60 * 1000,
  });
  const gradeRows: any[] = gradesData?.grades ?? [];

  // Fetch individual evaluations for selected subject
  const { data: evalsData, isFetching: evalsLoading } = useQuery({
    queryKey: ["/api/student/grades/evaluations", selectedSubjectId, periodSemesterId],
    queryFn: () => fetch(
      API(`/student/grades/evaluations?subjectId=${selectedSubjectId}&semesterId=${periodSemesterId}`),
      { credentials: "include" }
    ).then(r => r.json()),
    enabled: !!selectedSubjectId && !!periodSemesterId && step === "evals",
    staleTime: 5 * 60 * 1000,
  });
  const evaluations: Array<{ evaluationNumber: number; value: number }> = evalsData?.evaluations ?? [];

  // Already-claimed subject IDs for the active semester
  const claimedSubjectIds = new Set(
    (reclamations as any[])
      .filter((r: any) => periodSemesterId && String(r.semesterId ?? "") === periodSemesterId)
      .map((r: any) => String(r.subjectId))
  );

  const availableSubjects = gradeRows.filter((g: any) => g.value !== null && g.value !== undefined);
  const selectedGrade = gradeRows.find((g: any) => String(g.subjectId) === selectedSubjectId);

  // ── Derived values ────────────────────────────────────────────────────────────

  const contestedEvalsList: ContestedEval[] = evaluations
    .filter(e => selectedEvals.has(e.evaluationNumber))
    .map(e => ({ evaluationNumber: e.evaluationNumber, currentGrade: e.value }));

  const avgContested = contestedEvalsList.length > 0
    ? Math.round((contestedEvalsList.reduce((s, e) => s + e.currentGrade, 0) / contestedEvalsList.length) * 100) / 100
    : null;

  // ── Mutation ─────────────────────────────────────────────────────────────────

  const submitMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("subjectId", selectedSubjectId);
      fd.append("semesterId", periodSemesterId ?? "");
      fd.append("type", form.type);
      fd.append("motif", form.motif);
      fd.append("evaluationsContestees", JSON.stringify(contestedEvalsList));
      if (file) fd.append("attachment", file);
      const r = await fetch(API("/student/reclamations"), {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json();
        if (err.alreadyExists) return { alreadyExists: true, claimNumber: err.claimNumber, existingId: err.existingId };
        throw new Error(err.error ?? "Erreur");
      }
      return r.json();
    },
    onSuccess: (data: any) => {
      if (data.alreadyExists) {
        toast({
          title: "Réclamation déjà enregistrée",
          description: `Votre réclamation N° ${data.claimNumber} est déjà en cours. Consultez son statut ci-dessous.`,
        });
        setShowForm(false);
        resetForm();
        setExpandedId(data.existingId);
        qc.invalidateQueries({ queryKey: ["/api/student/reclamations"] });
        return;
      }
      toast({
        title: "Réclamation soumise",
        description: `N° ${data.claimNumber} — Vous recevrez une notification lors de la réponse.`,
      });
      setShowForm(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["/api/student/reclamations"] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  // ── Step navigation ───────────────────────────────────────────────────────────

  const goToEvals = () => {
    setSelectedEvals(new Set());
    setStep("evals");
  };

  const toggleEval = (num: number) => {
    setSelectedEvals(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  // ── Render form steps ─────────────────────────────────────────────────────────

  const renderStep = () => {
    // Step 1 — Select subject
    if (step === "subject") {
      return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Matière concernée *</label>
            {!periodSemesterId ? (
              <p className="text-sm text-muted-foreground italic">Aucune période active.</p>
            ) : gradeRows.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Chargement des matières…</p>
            ) : (
              <select
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">— Sélectionner une matière —</option>
                {gradeRows.map((g: any) => {
                  const isClaimed = claimedSubjectIds.has(String(g.subjectId));
                  const hasGrade = g.value !== null && g.value !== undefined;
                  const disabled = isClaimed || !hasGrade;
                  const label = isClaimed
                    ? `${g.subjectName} — Réclamation déjà soumise`
                    : !hasGrade
                    ? `${g.subjectName} — Aucune note disponible`
                    : `${g.subjectName} — Moyenne : ${g.value}/20`;
                  return (
                    <option key={g.subjectId} value={g.subjectId} disabled={disabled}>
                      {label}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Annuler</Button>
            <Button disabled={!selectedSubjectId} onClick={goToEvals}>
              Suivant — Choisir les évaluations
            </Button>
          </div>
        </div>
      );
    }

    // Step 2 — Select evaluations
    if (step === "evals") {
      return (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">{selectedGrade?.subjectName}</p>
            <p className="text-xs text-muted-foreground">Moyenne actuelle : {selectedGrade?.value}/20</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Évaluation(s) à contester * <span className="text-muted-foreground font-normal">(au moins une)</span>
            </label>

            {evalsLoading ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">Chargement des évaluations…</p>
            ) : evaluations.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucune évaluation trouvée.</p>
            ) : (
              <div className="rounded-xl border divide-y overflow-hidden">
                {evaluations.map((ev) => {
                  const checked = selectedEvals.has(ev.evaluationNumber);
                  const isLow = ev.value < 10;
                  return (
                    <button
                      key={ev.evaluationNumber}
                      type="button"
                      onClick={() => toggleEval(ev.evaluationNumber)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                        checked ? "bg-primary/5" : "bg-card hover:bg-muted/40"
                      )}
                    >
                      {checked
                        ? <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                        : <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <span className="flex-1 text-sm font-medium text-foreground">
                        Évaluation {ev.evaluationNumber}
                      </span>
                      <span className={cn(
                        "text-sm font-bold tabular-nums",
                        isLow ? "text-red-600" : "text-foreground"
                      )}>
                        {ev.value}/20
                      </span>
                      {isLow && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedEvals.size > 0 && (
              <div className="flex items-center gap-2 text-xs bg-primary/5 rounded-md px-3 py-2 border border-primary/20">
                <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-primary font-medium">
                  {selectedEvals.size} évaluation{selectedEvals.size > 1 ? "s" : ""} sélectionnée{selectedEvals.size > 1 ? "s" : ""} — Moyenne contestée : {avgContested}/20
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("subject")}>Retour</Button>
            <Button disabled={selectedEvals.size === 0} onClick={() => setStep("details")}>
              Suivant — Motif
            </Button>
          </div>
        </div>
      );
    }

    // Step 3 — Type + Motif + Attachment
    if (step === "details") {
      return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Type de réclamation *</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
            >
              <option value="">— Sélectionner un type —</option>
              {CLAIM_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Motif détaillé * <span className="text-muted-foreground font-normal">(min 50 caractères)</span>
            </label>
            <Textarea
              value={form.motif}
              onChange={e => setForm(f => ({ ...f, motif: e.target.value }))}
              placeholder="Décrivez précisément le motif de votre réclamation..."
              className="min-h-[120px] resize-none"
            />
            <p className={cn("text-xs", form.motif.length >= 50 ? "text-green-600" : "text-muted-foreground")}>
              {form.motif.length} / 50 caractères minimum
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Pièce jointe (optionnel)</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed rounded-lg p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : "Glisser ou cliquer — PDF, JPG, PNG (max 10 Mo)"}
              </span>
              {file && (
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="ml-auto text-xs text-red-500 hover:text-red-700"
                >
                  Supprimer
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("evals")}>Retour</Button>
            <Button
              disabled={!form.type || form.motif.length < 50}
              onClick={() => setStep("confirm")}
            >
              Vérifier et soumettre
            </Button>
          </div>
        </div>
      );
    }

    // Step 4 — Recap + Submit
    if (step === "confirm") {
      return (
        <div className="space-y-5">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
              Toute réclamation abusive peut entraîner des sanctions disciplinaires. Assurez-vous que votre demande est fondée.
            </p>
          </div>

          <div className="rounded-lg border divide-y text-sm overflow-hidden">
            <div className="flex justify-between px-4 py-2.5 bg-muted/30">
              <span className="text-muted-foreground">Matière</span>
              <span className="font-medium text-right">{selectedGrade?.subjectName}</span>
            </div>
            <div className="px-4 py-2.5">
              <p className="text-muted-foreground mb-2">Évaluations contestées</p>
              <div className="space-y-1">
                {contestedEvalsList.map(e => (
                  <div key={e.evaluationNumber} className="flex justify-between items-center">
                    <span className="text-foreground font-medium">Évaluation {e.evaluationNumber}</span>
                    <span className={cn(
                      "font-bold tabular-nums",
                      e.currentGrade < 10 ? "text-red-600" : "text-foreground"
                    )}>
                      {e.currentGrade}/20
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{CLAIM_TYPES.find(t => t.value === form.type)?.label}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground shrink-0 mr-4">Motif</span>
              <span className="font-medium text-right line-clamp-2">{form.motif}</span>
            </div>
            {file && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Pièce jointe</span>
                <span className="font-medium text-right">{file.name}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("details")}>Modifier</Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="gap-2"
            >
              {submitMutation.isPending ? "Envoi..." : "Confirmer et soumettre"}
            </Button>
          </div>
        </div>
      );
    }
    return null;
  };

  // ── Step indicator ────────────────────────────────────────────────────────────

  const steps: Array<{ key: Step; label: string }> = [
    { key: "subject", label: "Matière" },
    { key: "evals", label: "Évaluations" },
    { key: "details", label: "Motif" },
    { key: "confirm", label: "Confirmation" },
  ];
  const stepIndex = steps.findIndex(s => s.key === step);

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mes Réclamations</h1>
            <p className="text-sm text-muted-foreground mt-1">Contestation de notes — circuit officiel</p>
          </div>
          {period && !showForm && (
            <Button onClick={() => { setShowForm(true); resetForm(); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouvelle réclamation
            </Button>
          )}
        </div>

        {/* Active period banner */}
        {period ? (
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 flex gap-3 items-start">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div className="text-sm text-green-800 dark:text-green-300">
              <span className="font-semibold">Période de réclamation ouverte</span> — Semestre : {period.semesterName}<br />
              Du {formatDate(period.openDate)} au {formatDate(period.closeDate)}.
              Délai de réponse enseignant : {period.teacherResponseDays} jours ouvrables.
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-muted border p-4 flex gap-3 items-center text-sm text-muted-foreground">
            <Info className="h-5 w-5 shrink-0" />
            Aucune période de réclamation active en ce moment.
          </div>
        )}

        {/* Submission form */}
        {showForm && period && (
          <div className="rounded-xl border bg-card shadow-sm p-6 space-y-5">
            {/* Step bar */}
            <div className="flex items-center gap-0 mb-4">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                      i < stepIndex
                        ? "bg-primary border-primary text-primary-foreground"
                        : i === stepIndex
                        ? "border-primary text-primary bg-primary/10"
                        : "border-muted text-muted-foreground bg-muted/30"
                    )}>
                      {i < stepIndex ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={cn(
                      "text-[10px] mt-1 font-medium hidden sm:block",
                      i === stepIndex ? "text-primary" : "text-muted-foreground"
                    )}>
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={cn(
                      "h-0.5 flex-1 mx-1 transition-colors",
                      i < stepIndex ? "bg-primary" : "bg-muted"
                    )} />
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">
                {steps[stepIndex]?.label === "Matière" && "Étape 1 — Sélectionner la matière"}
                {steps[stepIndex]?.label === "Évaluations" && "Étape 2 — Choisir les évaluations à contester"}
                {steps[stepIndex]?.label === "Motif" && "Étape 3 — Type et motif"}
                {steps[stepIndex]?.label === "Confirmation" && "Étape 4 — Récapitulatif"}
              </h2>
            </div>

            {renderStep()}
          </div>
        )}

        {/* List of reclamations */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
        ) : (reclamations as any[]).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucune réclamation</p>
            <p className="text-sm mt-1">
              {period ? "Cliquez sur « Nouvelle réclamation » pour commencer." : "Aucune période de réclamation active."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Mes réclamations</h2>
            {(reclamations as any[]).map((r: any) => {
              const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.cloturee;
              const Icon = cfg.icon;
              const isOpen = expandedId === r.id;
              return (
                <div key={r.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <button
                    className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(isOpen ? null : r.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">{r.subjectName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.claimNumber} · {r.semesterName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", cfg.color)}>
                          {cfg.label}
                        </span>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </button>

                  {isOpen && detailData && detailData.id === r.id && (
                    <div className="border-t px-4 py-4 space-y-4 bg-muted/20">

                      {/* Final grade result */}
                      {r.finalGrade && (
                        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-300 font-medium">
                          Note finale attribuée : {r.finalGrade}/20 (ancienne moyenne : {r.contestedGrade}/20)
                        </div>
                      )}

                      {/* Contested evaluations */}
                      {detailData.contestedEvaluations && detailData.contestedEvaluations.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Évaluations contestées
                          </p>
                          <div className="rounded-lg border divide-y overflow-hidden">
                            {detailData.contestedEvaluations.map((ev: any) => (
                              <div key={ev.evaluationNumber} className="flex items-center justify-between px-3 py-2 text-sm">
                                <span className="text-foreground">Évaluation {ev.evaluationNumber}</span>
                                <span className={cn("font-bold tabular-nums", ev.currentGrade < 10 ? "text-red-600" : "text-foreground")}>
                                  {ev.currentGrade}/20
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Proposed evaluations (teacher) */}
                      {detailData.proposedEvaluations && detailData.proposedEvaluations.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Notes proposées par l'enseignant
                          </p>
                          <div className="rounded-lg border divide-y overflow-hidden">
                            {detailData.proposedEvaluations.map((ev: any) => (
                              <div key={ev.evaluationNumber} className="flex items-center justify-between px-3 py-2 text-sm">
                                <span className="text-foreground">Évaluation {ev.evaluationNumber}</span>
                                <span className="font-bold tabular-nums text-blue-600">{ev.proposedGrade}/20</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Motif */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Motif</p>
                        <p className="text-sm text-foreground bg-muted/40 rounded-lg p-3">{detailData.motif}</p>
                      </div>

                      {/* Teacher comment */}
                      {detailData.teacherComment && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Réponse de l'enseignant</p>
                          <p className="text-sm text-foreground bg-muted/40 rounded-lg p-3">{detailData.teacherComment}</p>
                        </div>
                      )}

                      {/* Admin comment */}
                      {detailData.adminComment && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Décision de l'administration</p>
                          <p className="text-sm text-foreground bg-muted/40 rounded-lg p-3">{detailData.adminComment}</p>
                        </div>
                      )}

                      {/* Attachment */}
                      {detailData.attachmentPath && (
                        <div>
                          <AttachmentViewer url={API(`/student/reclamations/attachment/${r.id}`)} />
                        </div>
                      )}

                      {/* Timeline */}
                      {detailData.history?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Historique</p>
                          <div className="space-y-2 border-l-2 border-muted pl-4">
                            {detailData.history.map((h: any) => (
                              <div key={h.id} className="relative">
                                <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                                <p className="text-xs font-medium text-foreground">{ACTION_LABELS[h.action] ?? h.action}</p>
                                {h.detail && <p className="text-xs text-muted-foreground mt-0.5">{h.detail}</p>}
                                <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(h.createdAt)} — {h.actorName}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">Soumise le {formatDate(r.createdAt)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
