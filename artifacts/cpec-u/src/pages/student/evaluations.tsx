import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useStudentEvaluationsCurrent, useSubmitEvaluation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle, Clock, Lock, ChevronRight, Send, ShieldCheck,
  ChevronLeft, AlertCircle,
} from "lucide-react";

// ─── Sections definition ──────────────────────────────────────────────────────

const SECTION_A = [
  { key: "a1", label: "Contenu du cours", desc: "Texte, illustrations et supports pédagogiques" },
  { key: "a2", label: "Prise en compte des objectifs fixés", desc: "Les objectifs du cours sont clairement respectés" },
  { key: "a3", label: "Qualité de la progression", desc: "La formation progresse de manière logique et cohérente" },
  { key: "a4", label: "Clarté des concepts abordés", desc: "Les notions sont expliquées de façon compréhensible" },
  { key: "a5", label: "Alternance théorie / pratique", desc: "Équilibre entre cours théoriques et exercices pratiques" },
] as const;

const SECTION_B = [
  { key: "b1", label: "Maîtrise du contenu", desc: "L'enseignant maîtrise parfaitement sa matière" },
  { key: "b2", label: "Approche pédagogique", desc: "Méthode d'enseignement adaptée aux apprenants" },
  { key: "b3", label: "Organisation du cours", desc: "Le cours est bien structuré et ordonné" },
  { key: "b4", label: "Qualité des échanges", desc: "Interactions enrichissantes avec les apprenants" },
  { key: "b5", label: "Comportement vis-à-vis des apprenants", desc: "Attitude respectueuse et professionnelle" },
  { key: "b6", label: "Prise en compte des difficultés individuelles", desc: "Attention portée aux élèves en difficulté" },
  { key: "b7", label: "Voix et articulation", desc: "Qualité et portée de la voix, articulation" },
  { key: "b8", label: "Présentation physique", desc: "Tenue vestimentaire et présentation générale" },
  { key: "b9", label: "Gestion du temps", desc: "Rythme, durée et respect des horaires" },
] as const;

const SECTION_C = [
  { key: "c1", label: "Satisfaction par rapport aux attentes", desc: "La formation répond à vos attentes initiales" },
  { key: "c2", label: "Satisfaction des réponses aux questions", desc: "Les questions trouvent des réponses satisfaisantes" },
  { key: "c3", label: "Utilité de la documentation", desc: "Richesse et pertinence des documents fournis" },
  { key: "c4", label: "Possibilité d'application", desc: "Les thèmes abordés sont applicables en pratique" },
  { key: "c5", label: "Qualité des travaux dirigés", desc: "Pertinence et qualité des TD/exercices" },
  { key: "c6", label: "Qualité des évaluations", desc: "Interrogations écrites, devoirs et examens" },
] as const;

type AllScoreKeys =
  | typeof SECTION_A[number]["key"]
  | typeof SECTION_B[number]["key"]
  | typeof SECTION_C[number]["key"];

const ALL_SCORE_KEYS: AllScoreKeys[] = [
  "a1","a2","a3","a4","a5",
  "b1","b2","b3","b4","b5","b6","b7","b8","b9",
  "c1","c2","c3","c4","c5","c6",
];

type SectionId = 0 | 1 | 2 | 3;

const SECTION_KEYS: Record<SectionId, AllScoreKeys[]> = {
  0: ["a1","a2","a3","a4","a5"],
  1: ["b1","b2","b3","b4","b5","b6","b7","b8","b9"],
  2: ["c1","c2","c3","c4","c5","c6"],
  3: [],
};

const UTILITE_OPTIONS = [
  { value: 1, label: "Très utile", icon: "⭐" },
  { value: 2, label: "Utile", icon: "👍" },
  { value: 3, label: "Peu utile", icon: "👎" },
  { value: 4, label: "Inutile", icon: "❌" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function getScoreColor(n: number, selected: number) {
  if (n > selected) return "bg-muted border border-border text-muted-foreground hover:bg-muted/80";
  if (n <= 2) return "bg-red-500 border border-red-600 text-white shadow-sm";
  if (n <= 4) return "bg-orange-500 border border-orange-600 text-white shadow-sm";
  if (n <= 6) return "bg-yellow-500 border border-yellow-600 text-white shadow-sm";
  if (n <= 8) return "bg-blue-500 border border-blue-600 text-white shadow-sm";
  return "bg-green-500 border border-green-600 text-white shadow-sm";
}

function getScoreLabel(n: number): string {
  if (n === 1) return "Mauvais";
  if (n <= 3) return "Insuffisant";
  if (n <= 5) return "Moyen";
  if (n <= 7) return "Bien";
  return "Excellent";
}

function ScorePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-9 h-9 rounded-lg text-sm font-bold transition-all hover:scale-105 ${getScoreColor(n, value)}`}
          >
            {n}
          </button>
        ))}
      </div>
      {value > 0 && (
        <p className="text-xs text-muted-foreground">
          {value}/10 — <span className="font-medium">{getScoreLabel(value)}</span>
        </p>
      )}
    </div>
  );
}

function SectionProgressBar({ scores, sectionKeys }: { scores: Record<string, number>; sectionKeys: string[] }) {
  const filled = sectionKeys.filter((k) => scores[k] > 0).length;
  const pct = sectionKeys.length > 0 ? Math.round((filled / sectionKeys.length) * 100) : 100;
  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {filled} / {sectionKeys.length} critère{sectionKeys.length > 1 ? "s" : ""} noté{sectionKeys.length > 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudentEvaluations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useStudentEvaluationsCurrent();
  const submitEval = useSubmitEvaluation();

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [currentSection, setCurrentSection] = useState<SectionId>(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState({ d1: "", d2: "", d3: "", d4: "" });
  const [utilite, setUtilite] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const period = data?.period ?? null;
  const teachers = data?.teachers ?? [];
  const classId = data?.classId;

  const completedCount = teachers.filter((t) => t.submitted).length;
  const total = teachers.length;

  const openForm = (idx: number) => {
    setSelectedIdx(idx);
    setCurrentSection(0);
    setScores({});
    setTexts({ d1: "", d2: "", d3: "", d4: "" });
    setUtilite(null);
  };

  const closeForm = () => setSelectedIdx(null);

  const sectionIsComplete = (section: SectionId): boolean => {
    if (section === 3) return utilite !== null;
    return SECTION_KEYS[section].every((k) => (scores[k] ?? 0) > 0);
  };

  const handleNext = () => {
    if (!sectionIsComplete(currentSection)) {
      toast({
        title: "Section incomplète",
        description: currentSection < 3
          ? "Veuillez noter tous les critères avant de continuer."
          : "Veuillez sélectionner l'utilité globale de la formation.",
        variant: "destructive",
      });
      return;
    }
    if (currentSection < 3) {
      setCurrentSection((prev) => (prev + 1) as SectionId);
    }
  };

  const handleSubmit = async () => {
    if (!sectionIsComplete(3)) {
      toast({ title: "Veuillez sélectionner l'utilité globale", variant: "destructive" });
      return;
    }
    if (selectedIdx === null || !period || !classId) return;
    const teacher = teachers[selectedIdx];

    for (const key of ALL_SCORE_KEYS) {
      if (!scores[key] || scores[key] < 1) {
        toast({ title: "Veuillez noter tous les critères (sections A, B et C)", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      await submitEval.mutateAsync({
        periodId: period.id,
        teacherId: teacher.teacherId!,
        subjectId: teacher.subjectId!,
        classId,
        a1: scores.a1, a2: scores.a2, a3: scores.a3, a4: scores.a4, a5: scores.a5,
        b1: scores.b1, b2: scores.b2, b3: scores.b3, b4: scores.b4, b5: scores.b5,
        b6: scores.b6, b7: scores.b7, b8: scores.b8, b9: scores.b9,
        c1: scores.c1, c2: scores.c2, c3: scores.c3, c4: scores.c4, c5: scores.c5, c6: scores.c6,
        d1: texts.d1.trim() || undefined,
        d2: texts.d2.trim() || undefined,
        d3: texts.d3.trim() || undefined,
        d4: texts.d4.trim() || undefined,
        utilite: utilite ?? undefined,
      });
      toast({ title: "Évaluation soumise !", description: "Merci pour votre retour anonyme." });
      qc.invalidateQueries({ queryKey: ["/api/student/evaluations/current"] });
      closeForm();
    } catch (err: any) {
      if (err?.status === 409) {
        toast({ title: "Déjà soumis", description: "Vous avez déjà évalué cet enseignant.", variant: "destructive" });
      } else {
        toast({ title: "Erreur lors de la soumission", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["student"]}>
        <p className="text-muted-foreground text-center py-10">Chargement...</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Évaluation des Enseignants</h1>
          <p className="text-muted-foreground">Fiche officielle d'évaluation de formation — anonyme et confidentielle.</p>
        </div>

        {/* Anonymity badge */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">Votre évaluation est strictement anonyme — aucune information vous identifiant n'est liée à vos réponses.</p>
        </div>

        {/* No active period */}
        {!period ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <Clock className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold text-foreground">Aucune évaluation en cours</p>
            <p className="text-sm text-muted-foreground mt-1">L'administration n'a pas encore ouvert la période d'évaluation des enseignants.</p>
          </div>
        ) : period.expired ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <Lock className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold text-foreground">Période clôturée</p>
            <p className="text-sm text-muted-foreground mt-1">La date limite d'évaluation est passée.</p>
          </div>
        ) : (
          <>
            {/* Period info + progress */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Date limite : {new Date(period.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {completedCount} / {total} complétée{total !== 1 ? "s" : ""}
                </Badge>
              </div>
              <div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: total > 0 ? `${(completedCount / total) * 100}%` : "0%" }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {completedCount === total && total > 0
                    ? "Toutes vos évaluations sont complètes !"
                    : `${total - completedCount} évaluation${total - completedCount > 1 ? "s" : ""} restante${total - completedCount > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {/* Teachers list */}
            <div className="space-y-3">
              {teachers.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">Aucun enseignant à évaluer pour le moment.</p>
              ) : teachers.map((teacher, idx) => (
                <div key={`${teacher.teacherId}-${teacher.subjectId}`}>
                  {/* Teacher card */}
                  {selectedIdx !== idx && (
                    <div
                      className={`border rounded-2xl p-4 flex items-center justify-between gap-3 transition-all ${
                        teacher.submitted
                          ? "bg-green-50/50 border-green-200"
                          : "bg-background border-border hover:border-primary/40 hover:shadow-sm cursor-pointer"
                      }`}
                      onClick={() => !teacher.submitted && openForm(idx)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{teacher.teacherName}</p>
                        <p className="text-sm text-muted-foreground truncate">{teacher.subjectName}</p>
                      </div>
                      {teacher.submitted ? (
                        <div className="flex items-center gap-1.5 text-green-600">
                          <CheckCircle className="w-5 h-5" />
                          <span className="text-sm font-medium hidden sm:block">Évaluation soumise</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm hidden sm:block">Commencer</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Evaluation wizard */}
                  {selectedIdx === idx && !teacher.submitted && (
                    <div className="border-2 border-primary/30 rounded-2xl overflow-hidden shadow-lg">
                      {/* Wizard header */}
                      <div className="bg-primary/5 px-5 py-4 border-b border-primary/20">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-foreground text-lg">{teacher.teacherName}</p>
                            <p className="text-sm text-muted-foreground">{teacher.subjectName}</p>
                          </div>
                          <button onClick={closeForm} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
                        </div>

                        {/* Section tabs */}
                        <div className="flex gap-1 mt-4">
                          {[
                            { id: 0, label: "A. Contenu" },
                            { id: 1, label: "B. Formateur" },
                            { id: 2, label: "C. Apprenants" },
                            { id: 3, label: "D. Appréciations" },
                          ].map((s) => (
                            <div
                              key={s.id}
                              className={`flex-1 text-center py-1.5 px-1 rounded-lg text-xs font-medium transition-colors ${
                                currentSection === s.id
                                  ? "bg-primary text-primary-foreground"
                                  : sectionIsComplete(s.id as SectionId)
                                  ? "bg-green-100 text-green-700"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {sectionIsComplete(s.id as SectionId) && s.id !== currentSection ? "✓ " : ""}{s.label.split(".")[0]}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section content */}
                      <div className="p-5 space-y-5">
                        {/* Scale legend */}
                        <div className="bg-muted/30 rounded-xl p-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span><span className="inline-block w-3 h-3 rounded bg-red-500 mr-1" />1-2 Mauvais</span>
                          <span><span className="inline-block w-3 h-3 rounded bg-orange-500 mr-1" />3-4 Insuffisant</span>
                          <span><span className="inline-block w-3 h-3 rounded bg-yellow-500 mr-1" />5-6 Moyen</span>
                          <span><span className="inline-block w-3 h-3 rounded bg-blue-500 mr-1" />7-8 Bien</span>
                          <span><span className="inline-block w-3 h-3 rounded bg-green-500 mr-1" />9-10 Excellent</span>
                        </div>

                        {/* Section A */}
                        {currentSection === 0 && (
                          <div className="space-y-5">
                            <div>
                              <h3 className="font-bold text-foreground text-base">Section A — Contenu de la Formation</h3>
                              <p className="text-xs text-muted-foreground">Poids : 30% de la note globale</p>
                              <SectionProgressBar scores={scores} sectionKeys={["a1","a2","a3","a4","a5"]} />
                            </div>
                            {SECTION_A.map((c) => (
                              <div key={c.key} className="space-y-2">
                                <div>
                                  <p className="font-medium text-sm text-foreground">{c.label}</p>
                                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                                </div>
                                <ScorePicker
                                  value={scores[c.key] ?? 0}
                                  onChange={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Section B */}
                        {currentSection === 1 && (
                          <div className="space-y-5">
                            <div>
                              <h3 className="font-bold text-foreground text-base">Section B — Formateur</h3>
                              <p className="text-xs text-muted-foreground">Poids : 50% de la note globale</p>
                              <SectionProgressBar scores={scores} sectionKeys={["b1","b2","b3","b4","b5","b6","b7","b8","b9"]} />
                            </div>
                            {SECTION_B.map((c) => (
                              <div key={c.key} className="space-y-2">
                                <div>
                                  <p className="font-medium text-sm text-foreground">{c.label}</p>
                                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                                </div>
                                <ScorePicker
                                  value={scores[c.key] ?? 0}
                                  onChange={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Section C */}
                        {currentSection === 2 && (
                          <div className="space-y-5">
                            <div>
                              <h3 className="font-bold text-foreground text-base">Section C — Apprenants</h3>
                              <p className="text-xs text-muted-foreground">Poids : 20% de la note globale</p>
                              <SectionProgressBar scores={scores} sectionKeys={["c1","c2","c3","c4","c5","c6"]} />
                            </div>
                            {SECTION_C.map((c) => (
                              <div key={c.key} className="space-y-2">
                                <div>
                                  <p className="font-medium text-sm text-foreground">{c.label}</p>
                                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                                </div>
                                <ScorePicker
                                  value={scores[c.key] ?? 0}
                                  onChange={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Section D */}
                        {currentSection === 3 && (
                          <div className="space-y-5">
                            <div>
                              <h3 className="font-bold text-foreground text-base">Section D — Appréciations Générales</h3>
                              <p className="text-xs text-muted-foreground">Champs libres (optionnels sauf la question finale)</p>
                            </div>

                            {[
                              { key: "d1" as const, label: "Thèmes les plus appréciés", placeholder: "Quels thèmes vous ont le plus marqué positivement ?" },
                              { key: "d2" as const, label: "Thèmes les moins appréciés", placeholder: "Quels thèmes vous ont le moins satisfait ?" },
                              { key: "d3" as const, label: "Éléments manquants, inutiles ou à modifier", placeholder: "Qu'est-ce qui devrait être ajouté, supprimé ou modifié ?" },
                              { key: "d4" as const, label: "Propositions d'amélioration", placeholder: "Vos suggestions pour améliorer cette formation..." },
                            ].map((field) => (
                              <div key={field.key} className="space-y-1.5">
                                <p className="font-medium text-sm text-foreground">{field.label} <span className="text-muted-foreground font-normal text-xs">(optionnel)</span></p>
                                <textarea
                                  value={texts[field.key]}
                                  onChange={(e) => setTexts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                  placeholder={field.placeholder}
                                  className="w-full min-h-[80px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                                  maxLength={600}
                                />
                              </div>
                            ))}

                            {/* Final question */}
                            <div className="space-y-3 border-t pt-4">
                              <p className="font-semibold text-sm text-foreground">
                                Globalement, cette formation vous a paru :{" "}
                                {!utilite && <span className="text-red-500 text-xs">*requis</span>}
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {UTILITE_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setUtilite(opt.value)}
                                    className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all flex items-center gap-2 ${
                                      utilite === opt.value
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border bg-background text-foreground hover:border-primary/40"
                                    }`}
                                  >
                                    <span className="text-xl">{opt.icon}</span>
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Navigation */}
                        <div className="flex gap-3 pt-2 border-t border-border">
                          {currentSection > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setCurrentSection((prev) => (prev - 1) as SectionId)}
                              className="flex items-center gap-1.5"
                            >
                              <ChevronLeft className="w-4 h-4" />Précédent
                            </Button>
                          ) : (
                            <Button type="button" variant="outline" onClick={closeForm}>
                              Annuler
                            </Button>
                          )}

                          {currentSection < 3 ? (
                            <Button type="button" onClick={handleNext} className="flex-1">
                              Suivant <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              onClick={handleSubmit}
                              className="flex-1"
                              disabled={submitting || !utilite}
                            >
                              {submitting ? "Envoi..." : <><Send className="w-4 h-4 mr-1.5" />Soumettre l'évaluation</>}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
