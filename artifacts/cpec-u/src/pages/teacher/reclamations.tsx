import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, CheckCircle, XCircle, ChevronDown, ChevronRight,
  Eye, RefreshCw, Gavel, AlertTriangle, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentViewer } from "@/components/attachment-viewer";

const API = (path: string) => `/api${path}`;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  soumise:      { label: "Soumise",       color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: Clock },
  en_cours:     { label: "En cours",      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: RefreshCw },
  en_arbitrage: { label: "En arbitrage",  color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", icon: Gavel },
  acceptee:     { label: "Acceptée",      color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle },
  rejetee:      { label: "Rejetée",       color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: XCircle },
  cloturee:     { label: "Clôturée",      color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300", icon: FileText },
};

const CLAIM_TYPE_LABELS: Record<string, string> = {
  erreur_saisie:      "Erreur de saisie",
  copie_non_corrigee: "Copie non corrigée",
  bareme_conteste:    "Barème contesté",
  autre:              "Autre",
};

const ACTION_LABELS: Record<string, string> = {
  submitted:               "Réclamation soumise par l'étudiant",
  teacher_opened:          "Ouverte par l'enseignant",
  teacher_accepted:        "Acceptée par l'enseignant",
  teacher_rejected:        "Rejetée par l'enseignant",
  teacher_transmitted:     "Transmise à l'administration",
  admin_validated_accept:  "Validée par l'administration",
  admin_rejected_accept:   "Modification refusée par l'administration",
  admin_overrode_rejection:"Note modifiée par l'administration",
  admin_closed:            "Clôturée",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function formatDateTime(d: string) {
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TeacherReclamations() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [decision, setDecision] = useState<"accept" | "reject" | "transmit" | "">("");
  const [teacherComment, setTeacherComment] = useState("");
  const [proposedGrades, setProposedGrades] = useState<Record<number, string>>({});
  const [filterStatus, setFilterStatus] = useState<string>("pending");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam) {
      setExpandedId(Number(idParam));
      setFilterStatus("all");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: reclamations = [], isLoading } = useQuery({
    queryKey: ["/api/teacher/reclamations"],
    queryFn: () => fetch(API("/teacher/reclamations"), { credentials: "include" }).then(r => r.json()),
    staleTime: 60 * 1000,
  });

  const { data: detailData } = useQuery({
    queryKey: ["/api/teacher/reclamations", expandedId],
    queryFn: async () => {
      if (!expandedId) return null;
      // Mark as en_cours
      await fetch(API(`/teacher/reclamations/${expandedId}/open`), { method: "POST", credentials: "include" });
      return fetch(API(`/teacher/reclamations/${expandedId}`), { credentials: "include" }).then(r => r.json());
    },
    enabled: expandedId !== null,
    staleTime: 0,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, contestedEvals }: { id: number; contestedEvals: any[] }) => {
      const proposedEvaluations = decision === "accept" && contestedEvals.length > 0
        ? contestedEvals.map(ev => ({
            evaluationNumber: ev.evaluationNumber,
            proposedGrade: Number(proposedGrades[ev.evaluationNumber] ?? 0),
          }))
        : undefined;

      const r = await fetch(API(`/teacher/reclamations/${id}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          teacherComment,
          proposedEvaluations,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "Erreur");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Réponse envoyée", description: "La réclamation a été traitée." });
      setExpandedId(null);
      setDecision("");
      setTeacherComment("");
      setProposedGrades({});
      qc.invalidateQueries({ queryKey: ["/api/teacher/reclamations"] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const filtered = (reclamations as any[]).filter((r: any) => {
    if (filterStatus === "pending") return ["soumise", "en_cours"].includes(r.status);
    if (filterStatus === "done") return ["acceptee", "rejetee", "en_arbitrage", "cloturee"].includes(r.status);
    return true;
  });

  const pendingCount = (reclamations as any[]).filter(r => ["soumise", "en_cours"].includes(r.status)).length;

  const getCanRespond = (contestedEvals: any[]) => {
    if (!decision || teacherComment.trim().length < 10) return false;
    if (decision === "accept" && contestedEvals.length > 0) {
      return contestedEvals.every(ev => {
        const v = Number(proposedGrades[ev.evaluationNumber] ?? "");
        return !isNaN(v) && v >= 0 && v <= 20 && proposedGrades[ev.evaluationNumber] !== "";
      });
    }
    return true;
  };

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Réclamations</h1>
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Réclamations soumises sur vos matières</p>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {[
            { value: "pending", label: "À traiter" },
            { value: "done", label: "Traitées" },
            { value: "all", label: "Toutes" },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                filterStatus === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {f.label}
              {f.value === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 rounded-full">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucune réclamation dans cette catégorie</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r: any) => {
              const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.cloturee;
              const Icon = cfg.icon;
              const isOpen = expandedId === r.id;
              const canAct = ["soumise", "en_cours"].includes(r.status);

              return (
                <div key={r.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <button
                    className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                    onClick={() => {
                      if (isOpen) { setExpandedId(null); setDecision(""); setTeacherComment(""); setProposedGrades({}); }
                      else setExpandedId(r.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm">
                            {r.studentName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.claimNumber} · {r.subjectName} · {r.semesterName} · Note : {r.contestedGrade}/20
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {CLAIM_TYPE_LABELS[r.type] ?? r.type} · {formatDate(r.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {canAct && (
                          <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">
                            Action requise
                          </span>
                        )}
                        <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", cfg.color)}>
                          {cfg.label}
                        </span>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </button>

                  {isOpen && detailData && detailData.id === r.id && (() => {
                    const contestedEvals: any[] = detailData.contestedEvaluations ?? [];
                    const proposedEvals: any[] = detailData.proposedEvaluations ?? [];
                    const canRespond = getCanRespond(contestedEvals);
                    return (
                    <div className="border-t px-4 py-4 space-y-4 bg-muted/20">

                      {/* Contested evaluations */}
                      {contestedEvals.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Évaluations contestées
                          </p>
                          <div className="rounded-xl border divide-y overflow-hidden">
                            {contestedEvals.map((ev: any) => (
                              <div key={ev.evaluationNumber} className="flex items-center justify-between px-4 py-2.5 bg-background">
                                <span className="text-sm font-medium text-foreground">Évaluation {ev.evaluationNumber}</span>
                                <span className={cn(
                                  "text-sm font-bold tabular-nums",
                                  ev.currentGrade < 10 ? "text-red-600" : "text-foreground"
                                )}>
                                  {ev.currentGrade}/20
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Student's motif */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Motif de l'étudiant</p>
                        <p className="text-sm text-foreground bg-background rounded-lg p-3 border">{detailData.motif}</p>
                      </div>

                      {/* Attachment */}
                      {detailData.attachmentPath && (
                        <div>
                          <AttachmentViewer url={API(`/teacher/reclamations/attachment/${r.id}`)} />
                        </div>
                      )}

                      {/* Response form */}
                      {canAct && (
                        <div className="rounded-xl bg-background border p-4 space-y-4">
                          <p className="text-sm font-semibold text-foreground">Votre réponse</p>

                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { value: "accept", label: "✅ Accepter", color: "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300" },
                              { value: "reject", label: "❌ Rejeter", color: "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" },
                              { value: "transmit", label: "⏳ Transmettre", color: "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300" },
                            ].map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => { setDecision(opt.value as any); setProposedGrades({}); }}
                                className={cn(
                                  "border-2 rounded-lg p-2.5 text-xs font-medium transition-all",
                                  decision === opt.value ? opt.color : "border-border bg-background text-muted-foreground hover:bg-muted"
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {decision === "accept" && contestedEvals.length > 0 && (
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-foreground">
                                Notes proposées * (pour chaque évaluation contestée)
                              </label>
                              <div className="rounded-xl border divide-y overflow-hidden">
                                {contestedEvals.map((ev: any) => (
                                  <div key={ev.evaluationNumber} className="flex items-center gap-3 px-4 py-2.5 bg-background">
                                    <span className="text-sm text-foreground flex-1">
                                      Évaluation {ev.evaluationNumber}
                                      <span className="text-muted-foreground ml-2">({ev.currentGrade}/20 actuellement)</span>
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={20}
                                        step={0.25}
                                        value={proposedGrades[ev.evaluationNumber] ?? ""}
                                        onChange={e => setProposedGrades(prev => ({ ...prev, [ev.evaluationNumber]: e.target.value }))}
                                        placeholder="—"
                                        className="w-20 text-center"
                                      />
                                      <span className="text-xs text-muted-foreground">/20</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">
                              Commentaire * <span className="text-muted-foreground font-normal">(obligatoire, min 10 caractères)</span>
                            </label>
                            <Textarea
                              value={teacherComment}
                              onChange={e => setTeacherComment(e.target.value)}
                              placeholder="Justification de votre décision..."
                              className="min-h-[100px] resize-none"
                            />
                            <p className={cn("text-xs", teacherComment.length >= 10 ? "text-green-600" : "text-muted-foreground")}>
                              {teacherComment.length} caractères
                            </p>
                          </div>

                          <Button
                            onClick={() => respondMutation.mutate({ id: r.id, contestedEvals })}
                            disabled={!canRespond || respondMutation.isPending}
                            className="w-full"
                          >
                            {respondMutation.isPending ? "Envoi..." : "Envoyer ma réponse"}
                          </Button>
                        </div>
                      )}

                      {/* Already responded */}
                      {!canAct && detailData.teacherComment && (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Votre réponse</p>
                            <p className="text-sm text-foreground bg-background rounded-lg p-3 border">{detailData.teacherComment}</p>
                          </div>
                          {proposedEvals.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes proposées</p>
                              <div className="rounded-xl border divide-y overflow-hidden">
                                {proposedEvals.map((ev: any) => (
                                  <div key={ev.evaluationNumber} className="flex items-center justify-between px-4 py-2.5 bg-background">
                                    <span className="text-sm text-foreground">Évaluation {ev.evaluationNumber}</span>
                                    <span className="text-sm font-bold tabular-nums text-blue-600">{ev.proposedGrade}/20</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Admin comment */}
                      {detailData.adminComment && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Décision administrative</p>
                          <p className="text-sm text-foreground bg-background rounded-lg p-3 border">{detailData.adminComment}</p>
                        </div>
                      )}

                      {/* History timeline */}
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
                    </div>
                  );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
