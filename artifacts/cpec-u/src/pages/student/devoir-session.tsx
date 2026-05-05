import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Reponse { id: number; texte: string; ordre: number; }
interface Question {
  id: number; texte: string; type: string; points: number; explication?: string;
  reponses: Reponse[];
}
interface Session {
  id: number; devoirId: number; finPrevue: string; statut: string;
  ordreQuestions: number[]; nbIncidents: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function DevoirSessionPage() {
  const [, params] = useRoute("/student/devoirs/:id");
  const [, setLocation] = useLocation();
  const devoirId = params?.id;
  const { toast } = useToast();

  // ── État local ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"loading" | "intro" | "exam" | "submitting" | "done">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<number, { reponseIds: number[]; reponseTexte: string; reponseNumerique: string }>>(new Map());
  const [timeLeft, setTimeLeft] = useState(0);
  const [incidents, setIncidents] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [opts, setOpts] = useState<any>({});
  const [devoir, setDevoir] = useState<any>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [pageHideStart, setPageHideStart] = useState<Date | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const currentIdxRef = useRef(0);
  const answersRef = useRef(answers);
  const incidentsRef = useRef(0);
  const submittedRef = useRef(false);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { incidentsRef.current = incidents; }, [incidents]);

  // ── Fetch devoir ────────────────────────────────────────────────────────
  const { data: devoirData } = useQuery<any>({
    queryKey: [`/api/devoirs/${devoirId}`],
    queryFn: () => fetch(`/api/devoirs/${devoirId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!devoirId,
  });

  useEffect(() => {
    if (devoirData && !devoirData.error) {
      setDevoir(devoirData);
      setOpts(devoirData.options_antitiche ?? {});
      setPhase("intro");
    }
  }, [devoirData]);

  // ── Start session mutation ───────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/devoirs/${devoirId}/demarrer`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      setSession(data.session);
      setQuestions(data.questions ?? []);

      // Restaurer les réponses sauvegardées
      const savedMap = new Map<number, any>();
      for (const rep of (data.savedReponses ?? [])) {
        savedMap.set(rep.question_id, {
          reponseIds: rep.reponse_ids ?? [],
          reponseTexte: rep.reponse_texte ?? "",
          reponseNumerique: rep.reponse_numerique?.toString() ?? "",
        });
      }
      setAnswers(savedMap);

      const fin = new Date(data.session.fin_prevue);
      const secs = Math.max(0, Math.floor((fin.getTime() - Date.now()) / 1000));
      setTimeLeft(secs);
      setIncidents(data.session.nb_incidents ?? 0);
      setPhase("exam");
    },
    onError: () => toast({ title: "Erreur lors du démarrage", variant: "destructive" }),
  });

  // ── Submit mutation ──────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: ({ forceStatut }: { forceStatut?: string }) => {
      if (submittedRef.current) return Promise.resolve({ ok: true });
      submittedRef.current = true;
      const ses = sessionRef.current;
      if (!ses) return Promise.resolve({ ok: true });

      const reponses = Array.from(answersRef.current.entries()).map(([questionId, ans]) => ({
        questionId,
        reponseIds: ans.reponseIds,
        reponseTexte: ans.reponseTexte || null,
        reponseNumerique: ans.reponseNumerique ? Number(ans.reponseNumerique) : null,
      }));

      return fetch(`/api/devoirs/${devoirId}/soumettre`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: ses.id, reponses, forceStatut }),
      }).then(r => r.json());
    },
    onSuccess: (data) => {
      if (data.ok) {
        setPhase("done");
        // Redirect to results after 2s
        const ses = sessionRef.current;
        setTimeout(() => {
          if (ses) setLocation(`/student/devoirs/${devoirId}/resultats/${ses.id}`);
          else setLocation("/student/devoirs");
        }, 2000);
      }
    },
  });

  // ── Auto-save ────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      const ses = sessionRef.current;
      if (!ses || ses.statut !== "en_cours") return Promise.resolve({});
      const reponses = Array.from(answersRef.current.entries()).map(([questionId, ans]) => ({
        questionId,
        reponseIds: ans.reponseIds,
        reponseTexte: ans.reponseTexte || null,
        reponseNumerique: ans.reponseNumerique ? Number(ans.reponseNumerique) : null,
      }));
      return fetch(`/api/devoirs/${devoirId}/sauvegarder`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: ses.id, reponses }),
      }).then(r => r.json());
    },
  });

  // ── Incident reporting ───────────────────────────────────────────────────
  const reportIncident = useCallback((type: string, dureeSecondes?: number) => {
    const ses = sessionRef.current;
    if (!ses || submittedRef.current) return;
    fetch(`/api/devoirs/${devoirId}/incidents`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: ses.id, type, dureeSecondes,
        questionEnCours: currentIdxRef.current,
      }),
    }).then(r => r.json()).then(data => {
      if (data.totalIncidents !== undefined) {
        const total = data.totalIncidents;
        incidentsRef.current = total;
        setIncidents(total);
      }
    });
  }, [devoirId]);

  // ── Anti-triche hooks ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "exam") return;

    // Timer
    const timerInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          if (!submittedRef.current) submitMutation.mutate({});
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-save every 30s
    const saveInterval = setInterval(() => {
      saveMutation.mutate();
    }, 30_000);

    // Fullscreen change
    const handleFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs && opts.pleinEcran && phase === "exam" && !submittedRef.current) {
        reportIncident("quitter_plein_ecran");
        // Try to re-enter fullscreen
        setTimeout(() => {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }, 500);
        setWarnings(prev => [...prev.slice(-2), "⚠️ Plein écran requis — retour automatique"]);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // Visibility change
    const handleVisibilityChange = () => {
      if (submittedRef.current) return;
      if (document.hidden) {
        setPageHideStart(new Date());
        setPageVisible(false);
      } else {
        const start = pageHideStart;
        const dur = start ? Math.round((Date.now() - start.getTime()) / 1000) : undefined;
        setPageHideStart(null);
        setPageVisible(true);

        if (opts.detectionOnglet) {
          reportIncident("quitter_page", dur);

          setIncidents(prev => {
            const newCount = prev + 1;
            if (newCount === 1) {
              setWarnings(w => [...w, "⚠️ Avertissement 1/3 — Changement d'onglet détecté !"]);
            } else if (newCount === 2) {
              setWarnings(w => [...w, "🚨 Avertissement 2/3 — Dernier avertissement !"]);
            } else if (newCount >= 3) {
              setWarnings(w => [...w, "❌ 3 sorties de page — soumission automatique !"]);
              setTimeout(() => submitMutation.mutate({ forceStatut: "TRICHERIE_DETECTEE" }), 1000);
            }
            return newCount;
          });
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Block copy/paste/cut/contextmenu
    const block = (e: Event) => {
      if (submittedRef.current) return;
      e.preventDefault();
      const type = (e as ClipboardEvent).type === "copy" ? "copier"
        : (e as ClipboardEvent).type === "paste" ? "coller"
        : (e as ClipboardEvent).type === "cut" ? "couper"
        : "clic_droit";
      if (opts.blocageCopier || (type === "clic_droit" && opts.blocageClic)) {
        reportIncident(type);
      }
    };
    const blockContextMenu = (e: Event) => {
      if (!opts.blocageClic) return;
      e.preventDefault();
      reportIncident("clic_droit");
    };
    document.addEventListener("copy", block);
    document.addEventListener("paste", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", blockContextMenu);

    // Block keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (submittedRef.current) return;
      const blocked =
        (e.ctrlKey && ["c", "v", "u", "a", "x"].includes(e.key.toLowerCase())) ||
        e.key === "PrintScreen" ||
        (e.altKey && e.key === "Tab") ||
        e.key === "F12";
      if (blocked) {
        e.preventDefault();
        reportIncident("raccourci_clavier", undefined);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // Before unload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      saveMutation.mutate();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(timerInterval);
      clearInterval(saveInterval);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [phase, opts, reportIncident]);

  // ── Démarrage plein écran ────────────────────────────────────────────────
  function enterFullscreenAndStart() {
    if (opts.pleinEcran) {
      document.documentElement.requestFullscreen?.()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    }
    startMutation.mutate();
  }

  // ── Réponse selection ────────────────────────────────────────────────────
  function toggleAnswer(questionId: number, reponseId: number, type: string) {
    setAnswers(prev => {
      const current = prev.get(questionId) ?? { reponseIds: [], reponseTexte: "", reponseNumerique: "" };
      let newIds: number[];
      if (type === "qcm" || type === "vrai_faux") {
        newIds = current.reponseIds.includes(reponseId) ? [] : [reponseId];
      } else {
        newIds = current.reponseIds.includes(reponseId)
          ? current.reponseIds.filter(id => id !== reponseId)
          : [...current.reponseIds, reponseId];
      }
      const updated = new Map(prev);
      updated.set(questionId, { ...current, reponseIds: newIds });
      return updated;
    });
  }

  function setTextAnswer(questionId: number, text: string) {
    setAnswers(prev => {
      const current = prev.get(questionId) ?? { reponseIds: [], reponseTexte: "", reponseNumerique: "" };
      const updated = new Map(prev);
      updated.set(questionId, { ...current, reponseTexte: text });
      return updated;
    });
  }

  function setNumericAnswer(questionId: number, val: string) {
    setAnswers(prev => {
      const current = prev.get(questionId) ?? { reponseIds: [], reponseTexte: "", reponseNumerique: "" };
      const updated = new Map(prev);
      updated.set(questionId, { ...current, reponseNumerique: val });
      return updated;
    });
  }

  const answeredCount = questions.filter(q => {
    const ans = answers.get(q.id);
    if (!ans) return false;
    if (q.type === "texte_libre") return !!ans.reponseTexte?.trim();
    if (q.type === "numerique") return !!ans.reponseNumerique?.trim();
    return ans.reponseIds.length > 0;
  }).length;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">Chargement du devoir...</div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="text-center">
          <CheckCircle2 className="w-20 h-20 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800">Devoir soumis !</h2>
          <p className="text-gray-500 mt-2">Redirection vers vos résultats...</p>
        </div>
      </div>
    );
  }

  if (phase === "intro" && devoir) {
    const debut = new Date(devoir.date_debut);
    const fin = new Date(devoir.date_fin);
    const now = new Date();
    const canStart = now >= debut && now <= fin;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-7 h-7 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{devoir.titre}</h1>
            <p className="text-gray-500 text-sm mt-1">{devoir.matiere_nom}</p>
          </div>

          {devoir.description && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm text-gray-700">{devoir.description}</div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="font-bold text-blue-700 text-xl">{devoir.duree_minutes} min</div>
              <div className="text-gray-500 text-xs">Durée</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="font-bold text-green-700 text-xl">/ {devoir.note_sur}</div>
              <div className="text-gray-500 text-xs">Note sur</div>
            </div>
          </div>

          {/* Options anti-triche actives */}
          {Object.values(devoir.options_antitiche ?? {}).some(Boolean) && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl">
              <p className="text-sm font-semibold text-orange-700 mb-2 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Mode surveillance actif
              </p>
              <ul className="text-xs text-orange-600 space-y-1">
                {devoir.options_antitiche?.pleinEcran && <li>• Plein écran obligatoire</li>}
                {devoir.options_antitiche?.detectionOnglet && <li>• Sortie de page détectée (3 incidents = soumission automatique)</li>}
                {devoir.options_antitiche?.blocageCopier && <li>• Copier/coller bloqué</li>}
                {devoir.options_antitiche?.blocageClic && <li>• Clic droit bloqué</li>}
                {devoir.options_antitiche?.melangeQuestions && <li>• Ordre des questions aléatoire</li>}
              </ul>
            </div>
          )}

          {canStart ? (
            <Button
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-base py-3"
              onClick={enterFullscreenAndStart}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? "Démarrage..." : "Démarrer le devoir"}
            </Button>
          ) : (
            <div className="text-center text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
              Ce devoir n'est pas encore accessible ou le délai est dépassé.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "exam" && questions.length > 0) {
    const q = questions[currentIdx];
    const ans = answers.get(q.id) ?? { reponseIds: [], reponseTexte: "", reponseNumerique: "" };
    const isLast = currentIdx === questions.length - 1;
    const isFirst = currentIdx === 0;
    const isUnderFiveMin = timeLeft <= 300;

    return (
      <div className="min-h-screen bg-gray-100 flex flex-col select-none" style={{ userSelect: "none" }}>
        {/* ── Top bar ── */}
        <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-800 text-sm truncate max-w-[200px]">{devoir?.titre}</span>
            <span className="text-xs text-gray-400 hidden sm:inline">Q {currentIdx + 1} / {questions.length}</span>
          </div>

          <div className={`font-mono font-bold text-lg flex items-center gap-2 ${isUnderFiveMin ? "text-red-600 animate-pulse" : "text-gray-700"}`}>
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{answeredCount}/{questions.length} réponses</span>
            <button
              onClick={() => {
                if (confirm("Êtes-vous sûr de vouloir soumettre le devoir maintenant ?")) {
                  submitMutation.mutate({});
                }
              }}
              className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? "Envoi..." : "Soumettre"}
            </button>
          </div>
        </div>

        {/* ── Warnings ── */}
        {warnings.map((w, i) => (
          <div key={i} className="bg-red-600 text-white text-center py-2 text-sm font-medium animate-pulse">
            {w}
          </div>
        ))}

        {/* ── Progress bar ── */}
        <div className="w-full h-1 bg-gray-200">
          <div
            className="h-1 bg-blue-500 transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            {/* Question card */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 mb-4">
              <div className="flex items-start gap-3 mb-4">
                <span className="bg-blue-100 text-blue-700 text-sm font-bold px-2.5 py-1 rounded-full shrink-0">
                  {currentIdx + 1}
                </span>
                <p className="text-gray-900 font-medium text-base leading-relaxed">{q.texte}</p>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{q.points} pt{q.points > 1 ? "s" : ""}</span>
                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                  {q.type === "qcm" ? "1 seule réponse" : q.type === "qcm_multiple" ? "Plusieurs réponses" : q.type === "vrai_faux" ? "Vrai / Faux" : q.type === "texte_libre" ? "Texte libre" : q.type === "numerique" ? "Réponse numérique" : q.type}
                </span>
              </div>

              {/* Réponses */}
              {(q.type === "qcm" || q.type === "vrai_faux" || q.type === "qcm_multiple" || q.type === "ordre" || q.type === "correspondance") && (
                <div className="space-y-2">
                  {q.reponses.map((r) => {
                    const selected = ans.reponseIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleAnswer(q.id, r.id, q.type)}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                          selected
                            ? "border-blue-500 bg-blue-50 text-blue-800 font-medium"
                            : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            selected ? "border-blue-500 bg-blue-500" : "border-gray-300"
                          }`}>
                            {selected && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          {r.texte}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "texte_libre" && (
                <Textarea
                  value={ans.reponseTexte}
                  onChange={e => setTextAnswer(q.id, e.target.value)}
                  placeholder="Rédigez votre réponse ici..."
                  rows={5}
                  className="resize-none"
                />
              )}

              {q.type === "numerique" && (
                <div className="max-w-xs">
                  <Input
                    type="number"
                    step="any"
                    value={ans.reponseNumerique}
                    onChange={e => setNumericAnswer(q.id, e.target.value)}
                    placeholder="Entrez votre réponse numérique..."
                    className="text-lg"
                  />
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                disabled={isFirst}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Précédent
              </Button>

              {/* Dot navigation */}
              <div className="flex gap-1.5 flex-wrap justify-center max-w-sm">
                {questions.map((qq, i) => {
                  const a = answers.get(qq.id);
                  const answered = a && (
                    (qq.type === "texte_libre" && a.reponseTexte?.trim()) ||
                    (qq.type === "numerique" && a.reponseNumerique?.trim()) ||
                    (a.reponseIds?.length > 0)
                  );
                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentIdx(i)}
                      className={`w-6 h-6 rounded-full text-xs font-medium transition-colors ${
                        i === currentIdx
                          ? "bg-blue-600 text-white"
                          : answered
                          ? "bg-green-400 text-white"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              {isLast ? (
                <Button
                  className="gap-1 bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    if (confirm(`Soumettre le devoir ? (${answeredCount}/${questions.length} réponses données)`)) {
                      submitMutation.mutate({});
                    }
                  }}
                  disabled={submitMutation.isPending}
                >
                  <CheckCircle2 className="w-4 h-4" /> Terminer
                </Button>
              ) : (
                <Button onClick={() => setCurrentIdx(i => Math.min(questions.length - 1, i + 1))} className="gap-1">
                  Suivant <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom surveillance banner ── */}
        <div className="bg-gray-800 text-white text-center py-2 px-4 text-xs flex items-center justify-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
          <span>Mode surveillance actif — Ne quittez pas cette page</span>
          {incidents > 0 && (
            <span className="ml-2 bg-orange-500 px-2 py-0.5 rounded-full">
              {incidents} incident{incidents > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      Chargement...
    </div>
  );
}
