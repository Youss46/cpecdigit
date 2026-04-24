import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, CheckCircle, XCircle, ChevronDown, ChevronRight, RefreshCw, Gavel,
  FileText, Plus, Eye, BarChart3, AlertTriangle, Settings, BookOpen, User,
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

type Tab = "list" | "stats" | "periods";

export default function AdminReclamations() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("list");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [decision, setDecision] = useState<string>("");
  const [adminComment, setAdminComment] = useState("");
  const [finalGrade, setFinalGrade] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam) {
      setExpandedId(Number(idParam));
      setTab("list");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Periods form
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [periodForm, setPeriodForm] = useState({
    semesterId: "",
    openDate: "",
    closeDate: "",
    teacherResponseDays: "5",
  });

  const { data: reclamations = [], isLoading } = useQuery({
    queryKey: ["/api/admin/reclamations", filterStatus],
    queryFn: () => {
      const qs = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      return fetch(API(`/admin/reclamations${qs}`), { credentials: "include" }).then(r => r.json());
    },
    staleTime: 60 * 1000,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/admin/reclamations/stats"],
    queryFn: () => fetch(API("/admin/reclamations/stats"), { credentials: "include" }).then(r => r.json()),
    enabled: tab === "stats",
    staleTime: 2 * 60 * 1000,
  });

  const { data: periods = [], isLoading: periodsLoading } = useQuery({
    queryKey: ["/api/admin/reclamations/periods"],
    queryFn: () => fetch(API("/admin/reclamations/periods"), { credentials: "include" }).then(r => r.json()),
    enabled: tab === "periods",
    staleTime: 60 * 1000,
  });

  const { data: semesters = [] } = useQuery({
    queryKey: ["/api/admin/semesters"],
    queryFn: () => fetch(API("/admin/semesters"), { credentials: "include" }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: detailData } = useQuery({
    queryKey: ["/api/admin/reclamations", expandedId],
    queryFn: () => expandedId
      ? fetch(API(`/admin/reclamations/${expandedId}`), { credentials: "include" }).then(r => r.json())
      : null,
    enabled: expandedId !== null,
    staleTime: 0,
  });

  const arbitrateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(API(`/admin/reclamations/${id}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          adminComment,
          finalGrade: finalGrade ? Number(finalGrade) : undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "Erreur");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Décision enregistrée", description: "La décision administrative a été appliquée." });
      setExpandedId(null);
      setDecision("");
      setAdminComment("");
      setFinalGrade("");
      qc.invalidateQueries({ queryKey: ["/api/admin/reclamations"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/reclamations/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/alertes/resume"] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(API("/admin/reclamations/periods"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semesterId: Number(periodForm.semesterId),
          openDate: periodForm.openDate,
          closeDate: periodForm.closeDate,
          teacherResponseDays: Number(periodForm.teacherResponseDays),
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "Erreur");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Période créée", description: "La période de réclamation est maintenant active." });
      setShowPeriodForm(false);
      setPeriodForm({ semesterId: "", openDate: "", closeDate: "", teacherResponseDays: "5" });
      qc.invalidateQueries({ queryKey: ["/api/admin/reclamations/periods"] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const togglePeriodMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await fetch(API(`/admin/reclamations/periods/${id}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("Erreur");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/reclamations/periods"] });
    },
  });

  const pendingCount = (reclamations as any[]).filter(r =>
    ["soumise", "en_cours", "en_arbitrage"].includes(r.status)
  ).length;

  const needsArbitrage = detailData && ["en_arbitrage", "soumise", "en_cours"].includes(detailData.status);
  const needsGrade = decision === "validate_accept" || decision === "override_reject";
  const canArbitrate = decision && adminComment.trim().length >= 5 &&
    (!needsGrade || (finalGrade !== "" && Number(finalGrade) >= 0 && Number(finalGrade) <= 20));

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">Gestion des Réclamations</h1>
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {pendingCount}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">Circuit officiel de contestation des notes</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {([
            { id: "list", label: "Réclamations", icon: FileText },
            { id: "stats", label: "Statistiques", icon: BarChart3 },
            { id: "periods", label: "Périodes", icon: Settings },
          ] as { id: Tab; label: string; icon: any }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                tab === t.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── LIST TAB ── */}
        {tab === "list" && (
          <>
            {/* Filter */}
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "Toutes" },
                { value: "soumise", label: "Soumises" },
                { value: "en_cours", label: "En cours" },
                { value: "en_arbitrage", label: "Arbitrage" },
                { value: "acceptee", label: "Acceptées" },
                { value: "rejetee", label: "Rejetées" },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilterStatus(f.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    filterStatus === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
            ) : (reclamations as any[]).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Aucune réclamation dans cette catégorie</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(reclamations as any[]).map((r: any) => {
                  const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.cloturee;
                  const Icon = cfg.icon;
                  const isOpen = expandedId === r.id;
                  const needsAction = ["en_arbitrage"].includes(r.status) ||
                    (["soumise", "en_cours"].includes(r.status));

                  return (
                    <div key={r.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <button
                        className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                        onClick={() => {
                          if (isOpen) { setExpandedId(null); setDecision(""); setAdminComment(""); setFinalGrade(""); }
                          else setExpandedId(r.id);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground text-sm">
                                {r.studentName}
                                <span className="text-muted-foreground font-normal ml-2">— {r.subjectName}</span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {r.claimNumber} · {r.semesterName} · Note contestée : {r.contestedGrade}/20
                                {r.finalGrade && ` → ${r.finalGrade}/20`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {CLAIM_TYPE_LABELS[r.type] ?? r.type} · {formatDate(r.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {r.status === "en_arbitrage" && (
                              <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 px-2 py-0.5 rounded-full font-medium">
                                Arbitrage requis
                              </span>
                            )}
                            <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", cfg.color)}>
                              {cfg.label}
                            </span>
                            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </button>

                      {isOpen && detailData && detailData.id === r.id && (
                        <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
                          {/* Grade change result */}
                          {r.finalGrade && (
                            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-300 font-medium">
                              Note finale : {r.finalGrade}/20 (ancienne : {r.contestedGrade}/20)
                            </div>
                          )}

                          {/* Contested evaluations */}
                          {detailData.contestedEvaluations && detailData.contestedEvaluations.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Évaluations contestées</p>
                              <div className="rounded-xl border divide-y overflow-hidden">
                                {detailData.contestedEvaluations.map((ev: any) => (
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

                          {/* Motif */}
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Motif de l'étudiant</p>
                            <p className="text-sm text-foreground bg-background rounded-lg p-3 border">{detailData.motif}</p>
                          </div>

                          {/* Attachment */}
                          {detailData.attachmentPath && (
                            <div>
                              <AttachmentViewer url={API(`/admin/reclamations/attachment/${r.id}`)} />
                            </div>
                          )}

                          {/* Teacher response */}
                          {detailData.teacherComment && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Réponse de l'enseignant</p>
                              <p className="text-sm text-foreground bg-background rounded-lg p-3 border">{detailData.teacherComment}</p>
                              {detailData.proposedEvaluations && detailData.proposedEvaluations.length > 0 ? (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">Notes proposées par évaluation :</p>
                                  <div className="rounded-xl border divide-y overflow-hidden">
                                    {detailData.proposedEvaluations.map((ev: any) => (
                                      <div key={ev.evaluationNumber} className="flex items-center justify-between px-4 py-2 bg-background">
                                        <span className="text-sm text-foreground">Évaluation {ev.evaluationNumber}</span>
                                        <span className="text-sm font-bold tabular-nums text-blue-600">{ev.proposedGrade}/20</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : detailData.proposedGrade !== null && detailData.proposedGrade !== undefined ? (
                                <p className="text-xs text-muted-foreground">Note proposée : <strong>{detailData.proposedGrade}/20</strong></p>
                              ) : null}
                            </div>
                          )}

                          {/* Admin arbitration form */}
                          {!["acceptee", "rejetee", "cloturee"].includes(r.status) && (
                            <div className="rounded-xl bg-background border-2 border-primary/20 p-4 space-y-4">
                              <div className="flex items-center gap-2">
                                <Gavel className="h-4 w-4 text-primary" />
                                <p className="text-sm font-semibold text-foreground">Décision administrative</p>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                {r.status === "en_arbitrage" && detailData.proposedGrade !== null ? (
                                  <>
                                    <button
                                      onClick={() => setDecision("validate_accept")}
                                      className={cn(
                                        "border-2 rounded-lg p-3 text-xs font-medium transition-all",
                                        decision === "validate_accept"
                                          ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                                      )}
                                    >
                                      ✅ Valider la modification
                                      <br /><span className="font-normal">→ {detailData.proposedGrade}/20</span>
                                    </button>
                                    <button
                                      onClick={() => setDecision("reject_accept")}
                                      className={cn(
                                        "border-2 rounded-lg p-3 text-xs font-medium transition-all",
                                        decision === "reject_accept"
                                          ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                                      )}
                                    >
                                      ❌ Refuser la modification
                                      <br /><span className="font-normal">Note maintenue</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setDecision("override_reject")}
                                      className={cn(
                                        "border-2 rounded-lg p-3 text-xs font-medium transition-all",
                                        decision === "override_reject"
                                          ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                                      )}
                                    >
                                      ✅ Modifier la note
                                      <br /><span className="font-normal">Passer outre le rejet</span>
                                    </button>
                                    <button
                                      onClick={() => setDecision("close")}
                                      className={cn(
                                        "border-2 rounded-lg p-3 text-xs font-medium transition-all",
                                        decision === "close"
                                          ? "border-gray-500 bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300"
                                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                                      )}
                                    >
                                      ⚫ Clôturer
                                      <br /><span className="font-normal">Note maintenue</span>
                                    </button>
                                  </>
                                )}
                              </div>

                              {needsGrade && (
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium text-foreground">
                                    Nouvelle note * (/ 20)
                                    {decision === "validate_accept" && detailData.proposedGrade && (
                                      <span className="text-muted-foreground font-normal ml-1">
                                        — proposée : {detailData.proposedGrade}
                                      </span>
                                    )}
                                  </label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={20}
                                    step={0.25}
                                    value={finalGrade || (decision === "validate_accept" && detailData.proposedGrade ? String(detailData.proposedGrade) : "")}
                                    onChange={e => setFinalGrade(e.target.value)}
                                    placeholder="Ex: 14.5"
                                    className="max-w-[160px]"
                                  />
                                </div>
                              )}

                              <div className="space-y-1.5">
                                <label className="text-xs font-medium text-foreground">
                                  Commentaire administratif * <span className="text-muted-foreground font-normal">(obligatoire)</span>
                                </label>
                                <Textarea
                                  value={adminComment}
                                  onChange={e => setAdminComment(e.target.value)}
                                  placeholder="Motivez la décision..."
                                  className="min-h-[90px] resize-none"
                                />
                              </div>

                              <div className="flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3">
                                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                <p className="text-xs text-amber-800 dark:text-amber-300">
                                  La décision de l'administration est <strong>définitive et non contestable</strong>.
                                </p>
                              </div>

                              <Button
                                onClick={() => arbitrateMutation.mutate(r.id)}
                                disabled={!canArbitrate || arbitrateMutation.isPending}
                                className="w-full"
                              >
                                {arbitrateMutation.isPending ? "Enregistrement..." : "Appliquer la décision"}
                              </Button>
                            </div>
                          )}

                          {/* Admin comment (already decided) */}
                          {detailData.adminComment && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Décision administrative</p>
                              <p className="text-sm text-foreground bg-background rounded-lg p-3 border">{detailData.adminComment}</p>
                            </div>
                          )}

                          {/* History */}
                          {detailData.history?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Historique complet</p>
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── STATS TAB ── */}
        {tab === "stats" && (
          <div className="space-y-6">
            {!stats ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
            ) : (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Total", value: (stats as any).total, color: "text-foreground" },
                    { label: "En attente", value: (stats as any).pending, color: "text-amber-600" },
                    { label: "Acceptées", value: (stats as any).accepted, color: "text-green-600" },
                    { label: "Taux d'acceptation", value: `${(stats as any).acceptRate}%`, color: "text-primary" },
                  ].map(k => (
                    <div key={k.label} className="rounded-xl border bg-card p-4 text-center">
                      <p className={cn("text-3xl font-bold", k.color)}>{k.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                    </div>
                  ))}
                </div>

                {(stats as any).avgDays !== null && (
                  <div className="rounded-xl border bg-card p-4 text-center">
                    <p className="text-3xl font-bold text-foreground">{(stats as any).avgDays}j</p>
                    <p className="text-xs text-muted-foreground mt-1">Délai moyen de traitement</p>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-6">
                  {/* Top subjects */}
                  {(stats as any).topSubjects?.length > 0 && (
                    <div className="rounded-xl border bg-card p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">Matières les plus réclamées</p>
                      </div>
                      {(stats as any).topSubjects.map(([name, ct]: [string, number]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="text-foreground truncate">{name}</span>
                          <span className="font-semibold text-primary ml-2">{ct}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top teachers */}
                  {(stats as any).topTeachers?.length > 0 && (
                    <div className="rounded-xl border bg-card p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">Enseignants avec le plus de réclamations</p>
                      </div>
                      {(stats as any).topTeachers.map(([name, ct]: [string, number]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="text-foreground truncate">{name}</span>
                          <span className="font-semibold text-primary ml-2">{ct}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── PERIODS TAB ── */}
        {tab === "periods" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Périodes de réclamation</h2>
              <Button size="sm" onClick={() => setShowPeriodForm(!showPeriodForm)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nouvelle période
              </Button>
            </div>

            {showPeriodForm && (
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Créer une période de réclamation</h3>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Semestre *</label>
                    <select
                      value={periodForm.semesterId}
                      onChange={e => setPeriodForm(f => ({ ...f, semesterId: e.target.value }))}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                    >
                      <option value="">— Sélectionner —</option>
                      {(semesters as any[]).map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Délai réponse enseignant (jours) *</label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={periodForm.teacherResponseDays}
                      onChange={e => setPeriodForm(f => ({ ...f, teacherResponseDays: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Date d'ouverture *</label>
                    <Input
                      type="datetime-local"
                      value={periodForm.openDate}
                      onChange={e => setPeriodForm(f => ({ ...f, openDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Date limite *</label>
                    <Input
                      type="datetime-local"
                      value={periodForm.closeDate}
                      onChange={e => setPeriodForm(f => ({ ...f, closeDate: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowPeriodForm(false)}>Annuler</Button>
                  <Button
                    onClick={() => createPeriodMutation.mutate()}
                    disabled={!periodForm.semesterId || !periodForm.openDate || !periodForm.closeDate || createPeriodMutation.isPending}
                  >
                    {createPeriodMutation.isPending ? "Création..." : "Créer la période"}
                  </Button>
                </div>
              </div>
            )}

            {periodsLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
            ) : (periods as any[]).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Aucune période configurée</div>
            ) : (
              <div className="space-y-3">
                {(periods as any[]).map((p: any) => {
                  const now = new Date();
                  const open = new Date(p.openDate);
                  const close = new Date(p.closeDate);
                  const isCurrentlyOpen = p.isActive && open <= now && close >= now;
                  return (
                    <div key={p.id} className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-foreground text-sm">{p.semesterName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Du {formatDate(p.openDate)} au {formatDate(p.closeDate)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Délai enseignant : {p.teacherResponseDays} jours
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={cn(
                          "text-xs px-2.5 py-1 rounded-full font-medium",
                          isCurrentlyOpen
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        )}>
                          {isCurrentlyOpen ? "Ouverte" : p.isActive ? "Inactive" : "Désactivée"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => togglePeriodMutation.mutate({ id: p.id, isActive: !p.isActive })}
                          disabled={togglePeriodMutation.isPending}
                        >
                          {p.isActive ? "Désactiver" : "Activer"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
