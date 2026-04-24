import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { useTeacherEvaluationResults } from "@workspace/api-client-react";
import { Lock, TrendingUp, ChevronDown, ChevronUp, MessageSquare, Info } from "lucide-react";
import { useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  Tooltip, Legend,
} from "recharts";

const SECTION_A_LABELS = [
  "Contenu du cours", "Objectifs fixés", "Progression", "Clarté concepts", "Théorie/Pratique",
];
const SECTION_B_LABELS = [
  "Maîtrise", "Pédagogie", "Organisation", "Échanges",
  "Comportement", "Difficultés ind.", "Voix", "Présentation", "Gestion temps",
];
const SECTION_C_LABELS = [
  "Satisfaction", "Réponses", "Documentation", "Application", "TD", "Évaluations",
];

const SECTION_D_QUESTIONS = [
  { key: "d1" as const, label: "Thèmes les plus appréciés" },
  { key: "d2" as const, label: "Thèmes les moins appréciés" },
  { key: "d3" as const, label: "Éléments à modifier" },
  { key: "d4" as const, label: "Propositions d'amélioration" },
];

const UTILITE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  "1": { label: "Très utile", icon: "⭐", color: "text-green-600" },
  "2": { label: "Utile", icon: "👍", color: "text-blue-600" },
  "3": { label: "Peu utile", icon: "👎", color: "text-orange-500" },
  "4": { label: "Inutile", icon: "❌", color: "text-red-500" },
};

function getScoreColor(val: number | null): string {
  if (val === null) return "text-muted-foreground";
  if (val >= 8) return "text-green-600";
  if (val >= 6) return "text-blue-600";
  if (val >= 4) return "text-yellow-600";
  if (val >= 2) return "text-orange-500";
  return "text-red-500";
}

function getMentionColor(mention: string | null): string {
  if (!mention) return "text-muted-foreground";
  if (mention === "Excellent") return "text-green-600";
  if (mention === "Bien") return "text-blue-600";
  if (mention === "Moyen") return "text-yellow-600";
  if (mention === "Insuffisant") return "text-orange-500";
  return "text-red-500";
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round((value / 10) * 100);
  const color = value >= 8 ? "bg-green-500" : value >= 6 ? "bg-blue-500" : value >= 4 ? "bg-yellow-400" : value >= 2 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-foreground w-36 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums w-8 text-right ${getScoreColor(value)}`}>{value.toFixed(1)}</span>
    </div>
  );
}

function SectionRadar({ avgA, avgB, avgC }: { avgA: number | null; avgB: number | null; avgC: number | null }) {
  const data = [
    { subject: "Contenu (A)", value: avgA ?? 0, fullMark: 10 },
    { subject: "Formateur (B)", value: avgB ?? 0, fullMark: 10 },
    { subject: "Apprenants (C)", value: avgC ?? 0, fullMark: 10 },
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(2)}/10`, "Moyenne"]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Radar
          name="Note"
          dataKey="value"
          stroke="#4f46e5"
          fill="#4f46e5"
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export default function TeacherEvaluations() {
  const { data, isLoading } = useTeacherEvaluationResults();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});

  const results = data?.results ?? [];

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleComments = (key: string) =>
    setShowComments((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Mes Évaluations</h1>
          <p className="text-muted-foreground">Retours anonymes de vos étudiants — fiche officielle en 4 sections.</p>
        </div>

        {/* Anonymity notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Évaluations anonymes</p>
            <p className="text-xs text-blue-700 mt-0.5">Ces retours visent à améliorer la qualité pédagogique. Aucune information permettant d'identifier un étudiant n'est associée à ces réponses. Résultats visibles à partir de 5 évaluations minimum.</p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-10">Chargement...</p>
        ) : results.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold text-foreground">Aucun résultat disponible</p>
            <p className="text-sm text-muted-foreground mt-1">Les résultats seront accessibles après la clôture de la période et leur publication par l'administration.</p>
            <p className="text-xs text-muted-foreground mt-1">Un minimum de 5 évaluations est requis pour garantir l'anonymat.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {results.map((group) => (
              <div key={group.periodId} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Période — {new Date(group.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {group.belowThreshold && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Certains résultats sont masqués — moins de 5 évaluations reçues pour cette matière/classe.
                  </div>
                )}

                {group.rows.map((row, idx) => {
                  const rowKey = `${group.periodId}-${idx}`;
                  const globalColor = getScoreColor(row.globalAvg);
                  const mentionColor = getMentionColor(row.mention);

                  return (
                    <div key={idx} className="border border-border rounded-2xl overflow-hidden shadow-sm">
                      {/* Card header */}
                      <div className="p-5 bg-gradient-to-r from-primary/5 to-transparent border-b border-border">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary">{row.subjectName}</Badge>
                              <Badge variant="outline">{row.className}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">
                              {row.evaluationCount} évaluation{row.evaluationCount > 1 ? "s" : ""} reçue{row.evaluationCount > 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-3xl font-bold tabular-nums ${globalColor}`}>
                              {row.globalAvg?.toFixed(2)}<span className="text-base text-muted-foreground">/10</span>
                            </p>
                            <p className={`text-sm font-semibold ${mentionColor}`}>{row.mention}</p>
                            <p className="text-xs text-muted-foreground">Note globale pondérée</p>
                          </div>
                        </div>

                        {/* Section averages */}
                        <div className="grid grid-cols-3 gap-3 mt-4">
                          {[
                            { label: "A — Contenu", value: row.avgA, weight: "30%" },
                            { label: "B — Formateur", value: row.avgB, weight: "50%" },
                            { label: "C — Apprenants", value: row.avgC, weight: "20%" },
                          ].map((s) => (
                            <div key={s.label} className={`rounded-xl p-3 text-center border ${
                              s.value !== null && s.value < 5 ? "bg-red-50 border-red-200" : "bg-background border-border"
                            }`}>
                              <p className="text-xs text-muted-foreground">{s.label}</p>
                              <p className={`font-bold tabular-nums text-lg ${getScoreColor(s.value)}`}>
                                {s.value?.toFixed(1) ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">{s.weight}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Radar chart */}
                      <div className="p-4 border-b border-border">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                          <Info className="w-3.5 h-3.5" />Visualisation radar par section
                        </p>
                        <SectionRadar avgA={row.avgA} avgB={row.avgB} avgC={row.avgC} />
                      </div>

                      {/* Section A criteria */}
                      <div className="border-b border-border">
                        <button
                          onClick={() => toggleSection(`${rowKey}-A`)}
                          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted/30"
                        >
                          <span>Section A — Contenu de la Formation ({row.avgA?.toFixed(2)}/10)</span>
                          {expandedSections[`${rowKey}-A`] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {expandedSections[`${rowKey}-A`] && (
                          <div className="px-5 pb-4">
                            {SECTION_A_LABELS.map((label, i) => (
                              <ScoreBar key={i} label={label} value={row.criteriaA[i] ?? 0} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Section B criteria */}
                      <div className="border-b border-border">
                        <button
                          onClick={() => toggleSection(`${rowKey}-B`)}
                          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted/30"
                        >
                          <span>Section B — Formateur ({row.avgB?.toFixed(2)}/10)</span>
                          {expandedSections[`${rowKey}-B`] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {expandedSections[`${rowKey}-B`] && (
                          <div className="px-5 pb-4">
                            {SECTION_B_LABELS.map((label, i) => (
                              <ScoreBar key={i} label={label} value={row.criteriaB[i] ?? 0} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Section C criteria */}
                      <div className="border-b border-border">
                        <button
                          onClick={() => toggleSection(`${rowKey}-C`)}
                          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted/30"
                        >
                          <span>Section C — Apprenants ({row.avgC?.toFixed(2)}/10)</span>
                          {expandedSections[`${rowKey}-C`] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {expandedSections[`${rowKey}-C`] && (
                          <div className="px-5 pb-4">
                            {SECTION_C_LABELS.map((label, i) => (
                              <ScoreBar key={i} label={label} value={row.criteriaC[i] ?? 0} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Section D & utilité — shown for first row */}
                      {idx === 0 && (
                        <>
                          {/* Section D comments */}
                          {SECTION_D_QUESTIONS.some((q) => group.sectionDComments[q.key]?.length > 0) && (
                            <div className="border-b border-border">
                              <button
                                onClick={() => toggleComments(`${rowKey}-D`)}
                                className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted/30"
                              >
                                <span className="flex items-center gap-2">
                                  <MessageSquare className="w-4 h-4 text-primary" />
                                  Section D — Appréciations libres
                                </span>
                                {showComments[`${rowKey}-D`] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              {showComments[`${rowKey}-D`] && (
                                <div className="px-5 pb-4 space-y-4">
                                  {SECTION_D_QUESTIONS.map((q) => {
                                    const items = group.sectionDComments[q.key];
                                    if (!items || items.length === 0) return null;
                                    return (
                                      <div key={q.key}>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{q.label}</p>
                                        <div className="space-y-1.5">
                                          {items.map((c, i) => (
                                            <div key={i} className="bg-muted/50 rounded-lg px-3 py-2.5 text-sm text-foreground italic border-l-2 border-primary/40">
                                              "{c}"
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Utilité distribution */}
                          {Object.keys(group.utiliteDistribution ?? {}).length > 0 && (
                            <div className="px-5 py-4">
                              <p className="text-sm font-semibold text-foreground mb-3">Utilité globale de la formation</p>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(group.utiliteDistribution).map(([k, count]) => {
                                  const opt = UTILITE_LABELS[k];
                                  return opt ? (
                                    <div key={k} className="flex items-center gap-2 bg-muted rounded-xl px-4 py-2.5">
                                      <span className="text-xl">{opt.icon}</span>
                                      <div>
                                        <p className={`text-sm font-semibold ${opt.color}`}>{opt.label}</p>
                                        <p className="text-xs text-muted-foreground">{count} réponse{count > 1 ? "s" : ""}</p>
                                      </div>
                                    </div>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
