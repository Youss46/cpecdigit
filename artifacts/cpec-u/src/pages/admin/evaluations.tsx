import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useListEvaluationPeriods, useCreateEvaluationPeriod, useUpdateEvaluationPeriod,
  useGetEvaluationResults, useSendEvaluationReminder, useListSemesters,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Bell, Eye, EyeOff, CheckCircle, Clock, BarChart3,
  MessageSquare, Trophy, ChevronDown, ChevronRight, Users, Lock,
  AlertTriangle, BookOpen,
} from "lucide-react";

const UTILITE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  "1": { label: "Très utile", icon: "⭐", color: "text-green-600" },
  "2": { label: "Utile", icon: "👍", color: "text-blue-600" },
  "3": { label: "Peu utile", icon: "👎", color: "text-orange-500" },
  "4": { label: "Inutile", icon: "❌", color: "text-red-500" },
};

function getMentionColor(mention: string | null) {
  if (!mention) return "text-muted-foreground";
  if (mention === "Excellent") return "text-green-600";
  if (mention === "Bien") return "text-blue-600";
  if (mention === "Moyen") return "text-yellow-600";
  if (mention === "Insuffisant") return "text-orange-500";
  return "text-red-500";
}

function ScoreBar({ value, max = 10 }: { value: number | null; max?: number }) {
  if (value === null) return null;
  const pct = Math.round((value / max) * 100);
  const color = value >= 8 ? "bg-green-500" : value >= 6 ? "bg-blue-500" : value >= 4 ? "bg-yellow-400" : value >= 2 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-10 text-right tabular-nums">{value.toFixed(2)}/10</span>
    </div>
  );
}

function CriteriaGrid({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {labels.map((label, i) => (
        <div key={i}>
          <div className="text-xs text-muted-foreground mb-1 truncate">{i + 1}. {label}</div>
          <ScoreBar value={values[i] ?? null} />
        </div>
      ))}
    </div>
  );
}

const SECTION_A_LABELS = [
  "Contenu du cours", "Objectifs fixés", "Progression", "Clarté des concepts", "Théorie/Pratique",
];
const SECTION_B_LABELS = [
  "Maîtrise du contenu", "Approche pédagogique", "Organisation", "Qualité des échanges",
  "Comportement", "Difficultés individuelles", "Voix", "Présentation", "Gestion du temps",
];
const SECTION_C_LABELS = [
  "Satisfaction attentes", "Réponses aux questions", "Documentation", "Application", "TD", "Évaluations",
];
const SECTION_D_QUESTIONS = [
  { key: "d1" as const, label: "Thèmes les plus appréciés" },
  { key: "d2" as const, label: "Thèmes les moins appréciés" },
  { key: "d3" as const, label: "Éléments à modifier" },
  { key: "d4" as const, label: "Propositions d'amélioration" },
];

export default function AdminEvaluations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/evaluations/periods"] });

  const { data: periods = [], isLoading } = useListEvaluationPeriods();
  const { data: semesters = [] } = useListSemesters();
  const createPeriod = useCreateEvaluationPeriod();
  const updatePeriod = useUpdateEvaluationPeriod();
  const sendReminder = useSendEvaluationReminder();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({ semesterId: "", deadline: "", isActive: false });
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<Record<string, boolean>>({});

  const { data: resultsData, isLoading: isResultsLoading, error: resultsError } =
    useGetEvaluationResults(selectedPeriodId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.semesterId || !form.deadline) {
      toast({ title: "Semestre et date limite sont requis", variant: "destructive" });
      return;
    }
    try {
      await createPeriod.mutateAsync({
        semesterId: parseInt(form.semesterId),
        deadline: new Date(form.deadline).toISOString(),
        isActive: form.isActive,
      });
      toast({ title: "Période d'évaluation créée" });
      invalidate();
      setIsCreateOpen(false);
      setForm({ semesterId: "", deadline: "", isActive: false });
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleToggleActive = async (period: any) => {
    try {
      await updatePeriod.mutateAsync({ id: period.id, isActive: !period.isActive });
      toast({ title: period.isActive ? "Période désactivée" : "Période activée et étudiants notifiés !" });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleToggleResults = async (period: any) => {
    try {
      await updatePeriod.mutateAsync({ id: period.id, resultsVisible: !period.resultsVisible });
      toast({ title: period.resultsVisible ? "Résultats masqués" : "Résultats publiés !" });
      invalidate();
      if (selectedPeriodId === period.id) {
        qc.invalidateQueries({ queryKey: ["/api/admin/evaluations/periods", period.id, "results"] });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleReminder = async (periodId: number) => {
    try {
      const result = await sendReminder.mutateAsync(periodId);
      toast({ title: `Rappel envoyé à ${result.sent} étudiant${result.sent > 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const toggleTeacher = (key: string) => setExpandedTeacher((prev) => prev === key ? null : key);
  const toggleSection = (key: string) => setExpandedSection((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Évaluation des Enseignants</h1>
            <p className="text-muted-foreground">Gérez les périodes d'évaluation et consultez les résultats.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md"><Plus className="w-4 h-4 mr-2" />Nouvelle période</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Créer une période d'évaluation</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div className="space-y-1">
                  <Label>Semestre</Label>
                  <Select value={form.semesterId} onValueChange={(v) => setForm(f => ({ ...f, semesterId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir un semestre" /></SelectTrigger>
                    <SelectContent>
                      {(semesters as any[]).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Date limite de soumission</Label>
                  <Input
                    type="datetime-local"
                    value={form.deadline}
                    onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={form.isActive}
                    onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="rounded"
                  />
                  <Label htmlFor="isActive">Activer immédiatement et notifier les étudiants</Label>
                </div>
                <Button type="submit" className="w-full" disabled={createPeriod.isPending}>
                  {createPeriod.isPending ? "Création..." : "Créer la période"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Periods list */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-10">Chargement...</p>
        ) : (periods as any[]).length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold text-foreground">Aucune période d'évaluation</p>
            <p className="text-sm text-muted-foreground mt-1">Créez une période pour lancer les évaluations.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(periods as any[]).map((period) => {
              const isPast = new Date(period.deadline) < new Date();
              const isSelected = selectedPeriodId === period.id;
              return (
                <div key={period.id}
                  className={`border rounded-2xl overflow-hidden shadow-sm transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}>
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{period.semesterName ?? `Semestre #${period.semesterId}`}</span>
                        {period.isActive ? (
                          <Badge className="bg-green-100 text-green-700 border border-green-300">
                            <CheckCircle className="w-3 h-3 mr-1" />Ouverte
                          </Badge>
                        ) : isPast ? (
                          <Badge variant="secondary">Clôturée</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                        {period.resultsVisible && (
                          <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                            <Eye className="w-3 h-3 mr-1" />Résultats publiés
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Limite : {new Date(period.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {period.submitterCount} étudiant{period.submitterCount !== 1 ? "s" : ""} — {period.evaluationCount} évaluation{period.evaluationCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => handleToggleActive(period)} disabled={updatePeriod.isPending}>
                        {period.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1" />Désactiver</> : <><CheckCircle className="w-3.5 h-3.5 mr-1" />Activer</>}
                      </Button>
                      {period.isActive && (
                        <Button variant="outline" size="sm" onClick={() => handleReminder(period.id)} disabled={sendReminder.isPending}>
                          <Bell className="w-3.5 h-3.5 mr-1" />Rappel
                        </Button>
                      )}
                      {(isPast || !period.isActive) && (
                        <Button variant="outline" size="sm" onClick={() => handleToggleResults(period)} disabled={updatePeriod.isPending}>
                          {period.resultsVisible ? <><Lock className="w-3.5 h-3.5 mr-1" />Masquer résultats</> : <><Eye className="w-3.5 h-3.5 mr-1" />Publier résultats</>}
                        </Button>
                      )}
                      <Button
                        variant={isSelected ? "default" : "secondary"}
                        size="sm"
                        onClick={() => setSelectedPeriodId(isSelected ? null : period.id)}
                      >
                        <BarChart3 className="w-3.5 h-3.5 mr-1" />{isSelected ? "Fermer" : "Résultats"}
                        {isSelected ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
                      </Button>
                    </div>
                  </div>

                  {/* Results panel */}
                  {isSelected && (
                    <div className="border-t p-5 space-y-4 bg-muted/30">
                      {isResultsLoading ? (
                        <p className="text-muted-foreground text-sm text-center py-4">Chargement des résultats...</p>
                      ) : resultsError ? (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                          <p className="text-amber-700 text-sm">{(resultsError as any)?.message ?? "Résultats non disponibles."}</p>
                        </div>
                      ) : !resultsData ? null : resultsData.results.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                          <p className="font-medium">Aucun résultat disponible</p>
                          <p className="text-xs mt-1">Un minimum de 5 évaluations par enseignant est requis.</p>
                          {resultsData.hiddenCount > 0 && (
                            <p className="text-xs mt-1 text-amber-600">{resultsData.hiddenCount} enseignant{resultsData.hiddenCount > 1 ? "s" : ""} en dessous du seuil.</p>
                          )}
                        </div>
                      ) : (
                        <>
                          {resultsData.hiddenCount > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-700">
                              <Lock className="w-4 h-4 shrink-0" />
                              {resultsData.hiddenCount} enseignant{resultsData.hiddenCount > 1 ? "s" : ""} masqué{resultsData.hiddenCount > 1 ? "s" : ""} (moins de 5 évaluations reçues).
                            </div>
                          )}

                          {/* Ranking */}
                          <div className="space-y-3">
                            <h3 className="font-semibold flex items-center gap-2 text-foreground">
                              <Trophy className="w-4 h-4 text-yellow-500" />Classement général (note /10)
                            </h3>
                            {resultsData.results.map((r, idx) => {
                              const key = `${r.teacherId}-${r.subjectId}`;
                              const isExpanded = expandedTeacher === key;
                              const isAlert = r.globalAvg !== null && r.globalAvg < 5;
                              return (
                                <div key={key}
                                  className={`bg-background border rounded-xl overflow-hidden shadow-sm ${isAlert ? "border-red-300" : "border-border"}`}>
                                  {/* Teacher header */}
                                  <div className="p-4">
                                    <div className="flex items-start justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-lg font-bold ${idx === 0 ? "text-yellow-500" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                                          #{idx + 1}
                                        </span>
                                        <div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-foreground">{r.teacherName}</span>
                                            <Badge variant="secondary" className="text-xs">{r.subjectName}</Badge>
                                            <Badge variant="outline" className="text-xs">{r.className}</Badge>
                                            {isAlert && (
                                              <Badge className="bg-red-100 text-red-700 border border-red-300 text-xs">
                                                <AlertTriangle className="w-2.5 h-2.5 mr-1" />Alerte &lt;5/10
                                              </Badge>
                                            )}
                                          </div>
                                          <p className="text-xs text-muted-foreground mt-0.5">{r.evaluationCount} évaluation{r.evaluationCount > 1 ? "s" : ""}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className={`text-2xl font-bold tabular-nums ${isAlert ? "text-red-500" : "text-foreground"}`}>
                                          {r.globalAvg?.toFixed(2)}<span className="text-sm text-muted-foreground">/10</span>
                                        </p>
                                        <p className={`text-xs font-semibold ${getMentionColor(r.mention)}`}>{r.mention}</p>
                                      </div>
                                    </div>

                                    {/* Section averages */}
                                    <div className="grid grid-cols-3 gap-3 mt-3">
                                      {[
                                        { label: "A. Contenu", value: r.avgA, weight: "30%" },
                                        { label: "B. Formateur", value: r.avgB, weight: "50%" },
                                        { label: "C. Apprenants", value: r.avgC, weight: "20%" },
                                      ].map((s) => (
                                        <div key={s.label} className="bg-muted/40 rounded-lg p-2 text-center">
                                          <p className="text-xs text-muted-foreground">{s.label}</p>
                                          <p className="font-bold text-sm tabular-nums">{s.value?.toFixed(1) ?? "—"}/10</p>
                                          <p className="text-xs text-muted-foreground">{s.weight}</p>
                                        </div>
                                      ))}
                                    </div>

                                    <button
                                      onClick={() => toggleTeacher(key)}
                                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 mt-3"
                                    >
                                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      {isExpanded ? "Masquer le détail" : "Voir le détail complet"}
                                    </button>
                                  </div>

                                  {/* Expanded detail */}
                                  {isExpanded && (
                                    <div className="border-t bg-muted/10 p-4 space-y-4">
                                      {/* Section A detail */}
                                      <div>
                                        <button
                                          onClick={() => toggleSection(`${key}-A`)}
                                          className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2"
                                        >
                                          {expandedSection[`${key}-A`] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                          Section A — Contenu ({r.avgA?.toFixed(2)}/10)
                                        </button>
                                        {expandedSection[`${key}-A`] && (
                                          <CriteriaGrid labels={SECTION_A_LABELS} values={r.criteriaA} />
                                        )}
                                      </div>

                                      {/* Section B detail */}
                                      <div>
                                        <button
                                          onClick={() => toggleSection(`${key}-B`)}
                                          className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2"
                                        >
                                          {expandedSection[`${key}-B`] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                          Section B — Formateur ({r.avgB?.toFixed(2)}/10)
                                        </button>
                                        {expandedSection[`${key}-B`] && (
                                          <CriteriaGrid labels={SECTION_B_LABELS} values={r.criteriaB} />
                                        )}
                                      </div>

                                      {/* Section C detail */}
                                      <div>
                                        <button
                                          onClick={() => toggleSection(`${key}-C`)}
                                          className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2"
                                        >
                                          {expandedSection[`${key}-C`] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                          Section C — Apprenants ({r.avgC?.toFixed(2)}/10)
                                        </button>
                                        {expandedSection[`${key}-C`] && (
                                          <CriteriaGrid labels={SECTION_C_LABELS} values={r.criteriaC} />
                                        )}
                                      </div>

                                      {/* Section D comments */}
                                      {SECTION_D_QUESTIONS.map((q) => {
                                        const items = r.sectionDComments[q.key];
                                        if (!items || items.length === 0) return null;
                                        return (
                                          <div key={q.key}>
                                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                                              <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                              {q.label} ({items.length} réponse{items.length > 1 ? "s" : ""})
                                            </div>
                                            <div className="space-y-1.5">
                                              {items.map((c, i) => (
                                                <div key={i} className="bg-background rounded-lg px-3 py-2 text-sm text-foreground italic border-l-2 border-primary/30">
                                                  "{c}"
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {/* Utilite distribution */}
                                      {Object.keys(r.sectionDComments.utilite ?? {}).length > 0 && (
                                        <div>
                                          <p className="text-sm font-semibold text-foreground mb-2">Utilité globale de la formation</p>
                                          <div className="flex flex-wrap gap-2">
                                            {Object.entries(r.sectionDComments.utilite).map(([k, count]) => {
                                              const opt = UTILITE_LABELS[k];
                                              return opt ? (
                                                <div key={k} className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5 text-sm">
                                                  <span>{opt.icon}</span>
                                                  <span className={`font-medium ${opt.color}`}>{opt.label}</span>
                                                  <span className="text-muted-foreground">× {count}</span>
                                                </div>
                                              ) : null;
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
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
