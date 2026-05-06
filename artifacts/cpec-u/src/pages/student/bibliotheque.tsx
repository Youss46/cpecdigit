import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Download, ExternalLink, Play, FileText, FileImage,
  Archive, Link2, Youtube, File, ChevronDown, ChevronRight, Search,
  CheckCircle2, Eye, X, BrainCircuit, Clock, Trophy, Target,
  ChevronLeft, ChevronRight as ChevronRightIcon, BarChart2, Zap,
  BookMarked, TrendingUp, Lightbulb, Bell, AlertTriangle, CheckCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    console.error("Download failed:", err);
    alert("Impossible de télécharger le fichier.");
  }
}

const RESOURCE_ICONS: Record<string, any> = {
  pdf: FileText, word: FileText, powerpoint: FileText,
  image: FileImage, archive: Archive, youtube: Youtube, link: Link2,
};
const RESOURCE_COLORS: Record<string, string> = {
  pdf: "text-red-500", word: "text-blue-500", powerpoint: "text-orange-500",
  image: "text-green-500", archive: "text-yellow-600", youtube: "text-red-600", link: "text-purple-500",
};
const RESOURCE_LABELS: Record<string, string> = {
  pdf: "PDF", word: "Word", powerpoint: "PowerPoint",
  image: "Image", archive: "Archive", youtube: "Vidéo", link: "Lien",
};

function formatSize(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${(m % 60).toString().padStart(2, "0")}`;
}
function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include", ...opts });
  if (!res.ok) throw new Error("Erreur réseau");
  return res.json();
}

type PreviewState =
  | { kind: "pdf"; resourceId: number; title: string }
  | { kind: "image"; resourceId: number; title: string }
  | { kind: "youtube"; videoId: string; title: string }
  | null;

type QuizStep =
  | { step: "none" }
  | { step: "loading"; resourceId: number; resourceTitle: string }
  | { step: "intro"; quiz: any; questions: any[]; resourceTitle: string }
  | { step: "taking"; quiz: any; questions: any[]; currentQ: number; answers: Record<string, any>; startMs: number }
  | { step: "submitting" }
  | { step: "result"; result: any; questions: any[] };

// ── Time tracker hook ────────────────────────────────────────────────────────
function useTimeTracker() {
  const timerRef = useRef<{ resourceId: number; startMs: number } | null>(null);

  const startTracking = useCallback((resourceId: number) => {
    timerRef.current = { resourceId, startMs: Date.now() };
  }, []);

  const stopTracking = useCallback(() => {
    if (!timerRef.current) return;
    const elapsed = Math.round((Date.now() - timerRef.current.startMs) / 1000);
    const { resourceId } = timerRef.current;
    timerRef.current = null;
    if (elapsed >= 5) {
      fetch(`${BASE}/api/bibliotheque/tracker`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId, seconds: elapsed }),
      }).catch(() => {});
    }
  }, []);

  return { startTracking, stopTracking };
}

// ── Quiz modal ───────────────────────────────────────────────────────────────
function QuizModal({ state, setState, resources, toast }: {
  state: QuizStep;
  setState: (s: QuizStep) => void;
  resources: any[];
  toast: any;
}) {
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (state.step !== "taking") { setTimer(0); return; }
    const id = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.step]);

  if (state.step === "none") return null;

  async function submitQuiz() {
    if (state.step !== "taking") return;
    const { quiz, answers } = state;
    const durreeSecondes = Math.round((Date.now() - state.startMs) / 1000);
    setState({ step: "submitting" });
    try {
      const res = await fetch(`${BASE}/api/bibliotheque/quiz/${quiz.id}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reponses: answers, durreeSecondes }),
      });
      if (!res.ok) throw new Error("Erreur lors de la soumission");
      const result = await res.json();
      setState({ step: "result", result, questions: state.questions });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
      setState({ step: "none" });
    }
  }

  function setAnswer(questionId: string, value: any) {
    if (state.step !== "taking") return;
    setState({ ...state, answers: { ...state.answers, [questionId]: value } });
  }

  function toggleMultiAnswer(questionId: string, answerId: number) {
    if (state.step !== "taking") return;
    const current: number[] = state.answers[questionId] ?? [];
    const next = current.includes(answerId) ? current.filter(x => x !== answerId) : [...current, answerId];
    setState({ ...state, answers: { ...state.answers, [questionId]: next } });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => {
      if (state.step !== "taking" && state.step !== "submitting") setState({ step: "none" });
    }}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Loading */}
        {state.step === "loading" && (
          <div className="flex flex-col items-center justify-center p-12 gap-3">
            <BrainCircuit className="w-10 h-10 text-primary animate-pulse" />
            <p className="text-muted-foreground">Chargement du quiz…</p>
          </div>
        )}

        {/* Intro */}
        {state.step === "intro" && (
          <>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-primary" />
                <span className="font-semibold">Quiz — {state.resourceTitle}</span>
              </div>
              <button onClick={() => setState({ step: "none" })} className="p-1.5 rounded-md hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-bold">{state.quiz.titre}</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{state.questions.length}</p>
                  <p className="text-xs text-muted-foreground">Questions</p>
                </div>
                {state.quiz.durreeMinutes && (
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{state.quiz.durreeMinutes}</p>
                    <p className="text-xs text-muted-foreground">Minutes</p>
                  </div>
                )}
                {state.quiz.noteMinimale && (
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">{state.quiz.noteMinimale}%</p>
                    <p className="text-xs text-muted-foreground">Score minimum</p>
                  </div>
                )}
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{state.quiz.tentativeActuelle}/{state.quiz.nbTentatives}</p>
                  <p className="text-xs text-muted-foreground">Tentative</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Répondez à toutes les questions. Vos réponses seront corrigées automatiquement.</p>
              <Button className="w-full gap-2" onClick={() =>
                setState({ step: "taking", quiz: state.quiz, questions: state.questions, currentQ: 0, answers: {}, startMs: Date.now() })
              }>
                <Zap className="w-4 h-4" />
                Démarrer le quiz
              </Button>
            </div>
          </>
        )}

        {/* Taking */}
        {state.step === "taking" && (() => {
          const q = state.questions[state.currentQ];
          const total = state.questions.length;
          const progress = ((state.currentQ) / total) * 100;
          const qId = String(q.id);
          const answer = state.answers[qId];

          return (
            <>
              <div className="px-5 py-3 border-b">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Question {state.currentQ + 1}/{total}</span>
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />{formatDuration(timer)}
                  </span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <p className="font-semibold text-base leading-relaxed">{q.texte}</p>
                {q.points > 1 && <Badge variant="outline" className="text-xs">{q.points} pts</Badge>}

                {(q.type === "qcm" || q.type === "vrai_faux") && (
                  <div className="space-y-2">
                    {(q.reponses ?? []).map((r: any) => (
                      <button
                        key={r.id}
                        onClick={() => setAnswer(qId, r.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                          answer === r.id
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        {r.texte}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === "qcm_multi" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Plusieurs réponses possibles</p>
                    {(q.reponses ?? []).map((r: any) => {
                      const selected: number[] = answer ?? [];
                      const isSelected = selected.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleMultiAnswer(qId, r.id)}
                          className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors flex items-center gap-3 ${
                            isSelected ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          {r.texte}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.type === "libre" && (
                  <textarea
                    className="w-full min-h-[100px] border rounded-lg p-3 text-sm resize-y"
                    placeholder="Votre réponse…"
                    value={answer ?? ""}
                    onChange={e => setAnswer(qId, e.target.value)}
                  />
                )}
              </div>

              <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
                <Button variant="outline" size="sm" onClick={() => setState({ ...state, currentQ: Math.max(0, state.currentQ - 1) })} disabled={state.currentQ === 0}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Précédent
                </Button>
                {state.currentQ < total - 1 ? (
                  <Button size="sm" onClick={() => setState({ ...state, currentQ: state.currentQ + 1 })}>
                    Suivant <ChevronRightIcon className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={submitQuiz}>
                    <Trophy className="w-3.5 h-3.5" /> Terminer
                  </Button>
                )}
              </div>
            </>
          );
        })()}

        {/* Submitting */}
        {state.step === "submitting" && (
          <div className="flex flex-col items-center justify-center p-12 gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground">Correction en cours…</p>
          </div>
        )}

        {/* Result */}
        {state.step === "result" && (() => {
          const { score, maxScore, pourcentage, reussi, feedback } = state.result;
          return (
            <>
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className={`w-5 h-5 ${reussi === true ? "text-green-500" : reussi === false ? "text-red-500" : "text-amber-500"}`} />
                  <span className="font-semibold">Résultats du quiz</span>
                </div>
                <button onClick={() => setState({ step: "none" })} className="p-1.5 rounded-md hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className={`rounded-xl p-6 text-center ${reussi === true ? "bg-green-50 border border-green-200" : reussi === false ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
                  <p className="text-5xl font-bold mb-1" style={{ color: reussi === true ? "#16a34a" : reussi === false ? "#dc2626" : "#d97706" }}>
                    {pourcentage}%
                  </p>
                  <p className="text-sm text-muted-foreground">{score.toFixed(1)} / {maxScore.toFixed(1)} point{maxScore > 1 ? "s" : ""}</p>
                  {reussi !== null && (
                    <Badge className={`mt-3 ${reussi ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"}`} variant="outline">
                      {reussi ? "✓ Quiz réussi" : "✗ Score insuffisant"}
                    </Badge>
                  )}
                </div>

                <div className="space-y-3">
                  {(feedback ?? []).map((fb: any, i: number) => {
                    const q = state.questions.find((qq: any) => qq.id === fb.questionId);
                    return (
                      <div key={i} className={`rounded-lg border p-3 ${fb.correct ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
                        <div className="flex items-start gap-2">
                          <span className={`text-sm font-medium flex-shrink-0 ${fb.correct ? "text-green-700" : "text-red-700"}`}>
                            {fb.correct ? "✓" : "✗"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{q?.texte ?? `Question ${i + 1}`}</p>
                            <p className="text-xs text-muted-foreground">{fb.earned}/{fb.points} pt{fb.points > 1 ? "s" : ""}</p>
                            {fb.explication && <p className="text-xs text-muted-foreground mt-1 italic">{fb.explication}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="px-6 py-4 border-t">
                <Button className="w-full" onClick={() => setState({ step: "none" })}>Fermer</Button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function StudentBibliotheque() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"supports" | "suivi" | "recommandations">("supports");
  const [filterSemester, setFilterSemester] = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedUEs, setExpandedUEs] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [quizState, setQuizState] = useState<QuizStep>({ step: "none" });
  const { startTracking, stopTracking } = useTimeTracker();

  const { data: semData } = useQuery({
    queryKey: ["/api/bibliotheque/semesters"],
    queryFn: () => apiFetch("/bibliotheque/semesters"),
  });
  const semesters: any[] = semData?.semesters ?? [];

  const resourcesQuery = useQuery({
    queryKey: ["/api/bibliotheque", filterSemester, filterSubject],
    queryFn: () => {
      let qs = "";
      if (filterSemester !== "all") qs += `?semesterId=${filterSemester}`;
      if (filterSubject !== "all") qs += `${qs ? "&" : "?"}subjectId=${filterSubject}`;
      return apiFetch(`/bibliotheque${qs}`);
    },
  });
  const resources: any[] = resourcesQuery.data?.resources ?? [];

  const progressQuery = useQuery({
    queryKey: ["/api/bibliotheque/my-progress"],
    queryFn: () => apiFetch("/bibliotheque/my-progress"),
    enabled: activeTab === "suivi",
  });
  const progress = progressQuery.data ?? { timeByResource: [], quizResults: [], downloadedIds: [] };

  const { data: recoData, refetch: refetchRecos } = useQuery({
    queryKey: ["/api/bibliotheque/recommendations"],
    queryFn: () => apiFetch("/bibliotheque/recommendations"),
    enabled: activeTab === "recommandations",
  });
  const recommendations: any[] = recoData?.recommendations ?? [];
  const unreadRecoCount: number = recoData?.unreadCount ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/bibliotheque/recommendations/${id}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/recommendations"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiFetch("/bibliotheque/recommendations/mark-all-read", { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/recommendations"] }),
  });

  // Quiz availability badge — batch check
  const resourceIds = resources.map((r: any) => r.id);
  const { data: quizHasData } = useQuery({
    queryKey: ["/api/bibliotheque/quiz-has", resourceIds.join(",")],
    queryFn: () => resourceIds.length > 0
      ? apiFetch(`/bibliotheque/quiz-has?ids=${resourceIds.join(",")}`)
      : Promise.resolve({ resourceIdsWithQuiz: [] }),
    enabled: resourceIds.length > 0,
  });
  const resourceIdsWithQuiz = new Set<number>(quizHasData?.resourceIdsWithQuiz ?? []);

  // Track time when preview opens/closes
  function openPreview(state: PreviewState, resourceId?: number) {
    stopTracking();
    setPreview(state);
    if (resourceId) startTracking(resourceId);
  }
  function closePreview() {
    stopTracking();
    setPreview(null);
  }

  // Cleanup on unmount
  useEffect(() => () => stopTracking(), [stopTracking]);

  const filteredResources = resources.filter((r: any) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase()) &&
      !(r.subjectName ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped: Record<string, Record<string, any[]>> = {};
  for (const r of filteredResources) {
    const ueKey = r.ueName ? `${r.ueCode ?? ""} — ${r.ueName}` : "Sans UE";
    const subKey = r.subjectName ?? "Sans matière";
    if (!grouped[ueKey]) grouped[ueKey] = {};
    if (!grouped[ueKey][subKey]) grouped[ueKey][subKey] = [];
    grouped[ueKey][subKey].push(r);
  }
  const allUEs = Object.keys(grouped);
  const allSubjectsMap = new Map<number, string>();
  for (const r of resources) {
    if (r.subjectId && r.subjectName) allSubjectsMap.set(r.subjectId, r.subjectName);
  }
  const allSubjects = [...allSubjectsMap.entries()].map(([id, name]) => ({ id, name }));

  function toggleUE(ue: string) {
    setExpandedUEs(prev => {
      const next = new Set(prev);
      if (next.has(ue)) next.delete(ue); else next.add(ue);
      return next;
    });
  }
  function toggleSubject(key: string) {
    setExpandedSubjects(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleDownload(r: any) {
    setDownloadingId(r.id);
    try {
      const res = await fetch(`${BASE}/api/bibliotheque/${r.id}/download`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur téléchargement");
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        if (json.url) window.open(json.url, "_blank", "noopener,noreferrer");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.fileName ?? r.title; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Téléchargement démarré" });
    } catch {
      toast({ title: "Erreur lors du téléchargement", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handlePreview(r: any) {
    if (r.type === "youtube") {
      const videoId = getYoutubeId(r.fileUrl ?? "");
      if (!videoId) { window.open(r.fileUrl, "_blank", "noopener,noreferrer"); return; }
      await fetch(`${BASE}/api/bibliotheque/${r.id}/download`, { credentials: "include" });
      openPreview({ kind: "youtube", videoId, title: r.title });
      return;
    }
    if (r.type === "link") {
      await fetch(`${BASE}/api/bibliotheque/${r.id}/download`, { credentials: "include" });
      window.open(r.fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (r.type === "pdf") {
      openPreview({ kind: "pdf", resourceId: r.id, title: r.title }, r.id);
      return;
    }
    if (r.type === "image") {
      openPreview({ kind: "image", resourceId: r.id, title: r.title }, r.id);
      return;
    }
    handleDownload(r);
  }

  async function handleOpenQuiz(r: any) {
    setQuizState({ step: "loading", resourceId: r.id, resourceTitle: r.title });
    try {
      // Step 1: get the quiz list for this resource
      const quizData = await apiFetch(`/bibliotheque/quiz?resourceId=${r.id}`);
      const quizzes: any[] = quizData?.quizzes ?? [];
      if (quizzes.length === 0) {
        toast({ title: "Aucun quiz disponible pour ce support", variant: "destructive" });
        setQuizState({ step: "none" });
        return;
      }
      // Step 2: take the first quiz
      const quizId = quizzes[0].id;
      const res = await fetch(`${BASE}/api/bibliotheque/quiz/${quizId}/take`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.maxReached) {
          toast({ title: "Nombre maximum de tentatives atteint", variant: "destructive" });
          setQuizState({ step: "none" });
          return;
        }
        throw new Error(err.error || "Erreur");
      }
      const json = await res.json();
      setQuizState({ step: "intro", quiz: json.quiz, questions: json.questions, resourceTitle: r.title });
    } catch (e: any) {
      toast({ title: e.message || "Impossible de charger le quiz", variant: "destructive" });
      setQuizState({ step: "none" });
    }
  }

  const canPreview = (r: any) => ["pdf", "image", "youtube", "link"].includes(r.type);
  const canDownload = (r: any) => ["pdf", "word", "powerpoint", "image", "archive"].includes(r.type);

  // ── Progress stats for "Mon Suivi" ────────────────────────────────────────
  const timeByResourceMap = new Map<number, number>();
  for (const t of progress.timeByResource ?? []) {
    timeByResourceMap.set(Number(t.resource_id), Number(t.total_sec ?? 0));
  }
  const totalTimeSeconds = [...timeByResourceMap.values()].reduce((a, b) => a + b, 0);
  const quizResultsGrouped: Record<number, any[]> = {};
  for (const qr of progress.quizResults ?? []) {
    const rid = Number(qr.resource_id);
    if (!quizResultsGrouped[rid]) quizResultsGrouped[rid] = [];
    quizResultsGrouped[rid].push(qr);
  }
  const downloadedSet = new Set<number>((progress.downloadedIds ?? []).map(Number));
  const resourcesWithActivity = resources.filter((r: any) =>
    downloadedSet.has(r.id) || timeByResourceMap.has(r.id) || quizResultsGrouped[r.id]?.length > 0
  );

  return (
    <AppLayout allowedRoles={["student", "parent"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-primary" />
            Bibliothèque numérique
          </h1>
          <p className="text-muted-foreground mt-1">Consultez vos supports, passez des quiz et suivez votre progression</p>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="supports" className="gap-2">
              <BookOpen className="w-4 h-4" /> Supports
            </TabsTrigger>
            <TabsTrigger value="suivi" className="gap-2">
              <TrendingUp className="w-4 h-4" /> Mon Suivi
            </TabsTrigger>
            <TabsTrigger value="recommandations" className="gap-2 relative">
              <Lightbulb className="w-4 h-4" /> Recommandations
              {unreadRecoCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {unreadRecoCount > 9 ? "9+" : unreadRecoCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Onglet Supports ────────────────────────────────────────────── */}
          <TabsContent value="supports" className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 w-56" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterSemester} onValueChange={setFilterSemester}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Tous les semestres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les semestres</SelectItem>
                  {semesters.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Toutes les matières" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les matières</SelectItem>
                  {allSubjects.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="pdf">📄 PDF</SelectItem>
                  <SelectItem value="word">📝 Word</SelectItem>
                  <SelectItem value="powerpoint">📊 PowerPoint</SelectItem>
                  <SelectItem value="youtube">🎥 Vidéo</SelectItem>
                  <SelectItem value="link">🔗 Lien</SelectItem>
                  <SelectItem value="image">🖼️ Image</SelectItem>
                  <SelectItem value="archive">📦 Archive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {resourcesQuery.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Chargement des supports…</div>
            ) : filteredResources.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-medium text-muted-foreground">Aucun support disponible</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Vos enseignants n'ont pas encore publié de supports pour ce semestre</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {allUEs.map(ueKey => {
                  const isUEOpen = expandedUEs.has(ueKey);
                  const subjects = grouped[ueKey];
                  const totalInUE = Object.values(subjects).reduce((s, arr) => s + arr.length, 0);
                  return (
                    <div key={ueKey} className="rounded-xl border bg-card overflow-hidden shadow-sm">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                        onClick={() => toggleUE(ueKey)}
                      >
                        <div className="flex items-center gap-2">
                          {isUEOpen ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />}
                          <span className="font-semibold text-foreground">{ueKey}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">{totalInUE} support{totalInUE > 1 ? "s" : ""}</Badge>
                      </button>

                      {isUEOpen && (
                        <div className="border-t">
                          {Object.entries(subjects).map(([subjectName, items]) => {
                            const subKey = `${ueKey}__${subjectName}`;
                            const isSubOpen = expandedSubjects.has(subKey);
                            return (
                              <div key={subjectName} className="border-b last:border-b-0">
                                <button
                                  className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-muted/30 transition-colors text-left"
                                  onClick={() => toggleSubject(subKey)}
                                >
                                  <div className="flex items-center gap-2 text-sm">
                                    {isSubOpen ? <ChevronDown className="w-3.5 h-3.5 text-primary/70" /> : <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground/60" />}
                                    <span className="font-medium text-foreground/80">📘 {subjectName}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">{items.length} support{items.length > 1 ? "s" : ""}</span>
                                </button>

                                {isSubOpen && (
                                  <div className="pl-8 pr-4 pb-3 pt-1 space-y-2">
                                    {items.map((r: any) => {
                                      const Icon = RESOURCE_ICONS[r.type] ?? File;
                                      const isLoading = downloadingId === r.id;
                                      const showPreview = canPreview(r);
                                      const showDownload = canDownload(r);
                                      const hasQuiz = resourceIdsWithQuiz.has(r.id);
                                      const timeSec = timeByResourceMap.get(r.id) ?? 0;
                                      const previewLabel = r.type === "youtube" ? "Voir" : r.type === "link" ? "Ouvrir" : "Aperçu";
                                      const PreviewIcon = r.type === "youtube" ? Play : r.type === "link" ? ExternalLink : Eye;
                                      return (
                                        <div key={r.id} className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5 hover:bg-muted/30 transition-colors">
                                          <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${RESOURCE_COLORS[r.type] ?? "text-muted-foreground"}`} />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{r.title}</p>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                              <Badge variant="outline" className="text-xs px-1.5 py-0">{RESOURCE_LABELS[r.type] ?? r.type}</Badge>
                                              {r.fileSize && <span className="text-xs text-muted-foreground">{formatSize(r.fileSize)}</span>}
                                              {r.teacherName && <span className="text-xs text-muted-foreground">Par {r.teacherName}</span>}
                                              {r.alreadyDownloaded && (
                                                <span className="text-xs text-green-600 flex items-center gap-0.5">
                                                  <CheckCircle2 className="w-3 h-3" /> Consulté
                                                </span>
                                              )}
                                              {timeSec > 0 && (
                                                <span className="text-xs text-blue-600 flex items-center gap-0.5">
                                                  <Clock className="w-3 h-3" /> {formatDuration(timeSec)}
                                                </span>
                                              )}
                                              {hasQuiz && (
                                                <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200" variant="outline">
                                                  <BrainCircuit className="w-3 h-3 mr-0.5" /> Quiz
                                                </Badge>
                                              )}
                                            </div>
                                            {r.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{r.description}</p>}
                                          </div>
                                          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5 flex-wrap justify-end">
                                            {showPreview && (
                                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => handlePreview(r)} disabled={isLoading}>
                                                <PreviewIcon className="w-3 h-3" />{previewLabel}
                                              </Button>
                                            )}
                                            {showDownload && (
                                              <Button size="sm" variant={r.alreadyDownloaded ? "outline" : "default"} className="h-7 gap-1 text-xs" onClick={() => handleDownload(r)} disabled={isLoading}>
                                                {isLoading ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Download className="w-3 h-3" />}
                                                Télécharger
                                              </Button>
                                            )}
                                            {hasQuiz && (
                                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => handleOpenQuiz(r)}>
                                                <BrainCircuit className="w-3 h-3" /> Quiz
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Onglet Mon Suivi ───────────────────────────────────────────── */}
          <TabsContent value="suivi" className="space-y-5">
            {progressQuery.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Chargement de votre suivi…</div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-blue-700">{resourcesWithActivity.length}</p>
                      <p className="text-xs text-blue-600 mt-1 flex items-center justify-center gap-1"><BookMarked className="w-3 h-3" /> Supports consultés</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-purple-700">{formatDuration(totalTimeSeconds)}</p>
                      <p className="text-xs text-purple-600 mt-1 flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> Temps de lecture</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-green-700">{(progress.quizResults ?? []).length}</p>
                      <p className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1"><BrainCircuit className="w-3 h-3" /> Quiz passés</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                    <CardContent className="p-4 text-center">
                      {(() => {
                        const results = progress.quizResults ?? [];
                        const avg = results.length > 0
                          ? results.reduce((acc: number, r: any) => acc + (r.max_score > 0 ? (r.score / r.max_score) * 100 : 0), 0) / results.length
                          : null;
                        return (
                          <>
                            <p className="text-2xl font-bold text-amber-700">{avg !== null ? `${avg.toFixed(0)}%` : "—"}</p>
                            <p className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1"><Trophy className="w-3 h-3" /> Score moyen</p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>

                {/* Per-resource activity */}
                {resourcesWithActivity.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-14 text-center">
                      <BarChart2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="font-medium text-muted-foreground">Aucune activité enregistrée</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">Consultez des supports pour voir votre suivi ici</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Activité par support</h3>
                    {resourcesWithActivity.map((r: any) => {
                      const timeSec = timeByResourceMap.get(r.id) ?? 0;
                      const quizResults = quizResultsGrouped[r.id] ?? [];
                      const bestResult = quizResults.length > 0
                        ? quizResults.reduce((best: any, cur: any) => (cur.score / cur.max_score) > (best.score / best.max_score) ? cur : best)
                        : null;
                      const Icon = RESOURCE_ICONS[r.type] ?? File;
                      return (
                        <Card key={r.id} className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${RESOURCE_COLORS[r.type] ?? "text-muted-foreground"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{r.title}</p>
                                <p className="text-xs text-muted-foreground">{r.subjectName ?? "Sans matière"}</p>
                                <div className="flex flex-wrap gap-4 mt-2">
                                  {downloadedSet.has(r.id) && (
                                    <span className="text-xs text-green-600 flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Consulté
                                    </span>
                                  )}
                                  {timeSec > 0 && (
                                    <span className="text-xs text-blue-600 flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5" /> {formatDuration(timeSec)} de lecture
                                    </span>
                                  )}
                                  {bestResult && (
                                    <span className={`text-xs flex items-center gap-1 ${bestResult.score / bestResult.max_score >= 0.5 ? "text-purple-600" : "text-red-600"}`}>
                                      <Trophy className="w-3.5 h-3.5" />
                                      Meilleur quiz : {Math.round((bestResult.score / bestResult.max_score) * 100)}%
                                      {quizResults.length > 1 && ` (${quizResults.length} tentatives)`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Quiz history */}
                {(progress.quizResults ?? []).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Historique des quiz</h3>
                    <div className="space-y-2">
                      {(progress.quizResults ?? []).slice(0, 10).map((qr: any, i: number) => {
                        const pct = qr.max_score > 0 ? Math.round((qr.score / qr.max_score) * 100) : 0;
                        const success = pct >= 50;
                        return (
                          <div key={i} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {pct}%
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{qr.quiz_titre ?? "Quiz"}</p>
                              <p className="text-xs text-muted-foreground">
                                Tentative {qr.tentative} • {new Date(qr.termine_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                              </p>
                            </div>
                            <Progress value={pct} className="w-20 h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── Onglet Recommandations ─────────────────────────────────────── */}
          <TabsContent value="recommandations" className="space-y-4">
            {activeTab === "recommandations" && recoData === undefined ? (
              <div className="text-center py-12 text-muted-foreground">Chargement…</div>
            ) : recommendations.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center space-y-2">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                  <p className="font-medium text-lg">Tout est à jour !</p>
                  <p className="text-sm text-muted-foreground">
                    Aucune recommandation pour le moment. Continuez à consulter vos supports régulièrement.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {recommendations.length} recommandation{recommendations.length > 1 ? "s" : ""}
                    {unreadRecoCount > 0 && ` · ${unreadRecoCount} non lue${unreadRecoCount > 1 ? "s" : ""}`}
                  </p>
                  {unreadRecoCount > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs gap-1.5"
                      onClick={() => markAllReadMutation.mutate()}
                      disabled={markAllReadMutation.isPending}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Tout marquer comme lu
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {recommendations.map((reco: any) => {
                    const prioriteConfig = {
                      haute: { label: "PRIORITÉ HAUTE", color: "border-red-300 bg-red-50", badge: "bg-red-500 text-white", icon: AlertTriangle, iconColor: "text-red-600" },
                      moyenne: { label: "PRIORITÉ MOYENNE", color: "border-amber-300 bg-amber-50", badge: "bg-amber-500 text-white", icon: Bell, iconColor: "text-amber-600" },
                      faible: { label: "BIEN PRÉPARÉ", color: "border-green-300 bg-green-50", badge: "bg-green-500 text-white", icon: CheckCircle, iconColor: "text-green-600" },
                    }[reco.priorite as string] ?? {
                      label: "RÉVISION", color: "border-blue-300 bg-blue-50", badge: "bg-blue-500 text-white", icon: Lightbulb, iconColor: "text-blue-600",
                    };
                    const PIcon = prioriteConfig.icon;

                    const typeLabel: Record<string, string> = {
                      examen_j15: "Examen dans 15 jours",
                      examen_j7: "Examen dans 7 jours",
                      examen_j3: "Examen dans 3 jours",
                      quiz_echec: "Quiz à améliorer",
                      inactivite_7j: "7 jours sans activité",
                    };

                    return (
                      <Card key={reco.id}
                        className={`border ${prioriteConfig.color} ${!reco.lu ? "ring-2 ring-primary/20" : "opacity-90"} transition-all`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <PIcon className={`w-5 h-5 ${prioriteConfig.iconColor} flex-shrink-0`} />
                              <div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${prioriteConfig.badge}`}>
                                  {prioriteConfig.label}
                                </span>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {typeLabel[reco.type] ?? reco.type}
                                  {reco.semestre_name && ` — ${reco.semestre_name}`}
                                  {reco.jours_avant_examen && ` (${reco.jours_avant_examen}j avant examen)`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {!reco.lu && (
                                <button className="text-xs text-primary underline"
                                  onClick={() => markReadMutation.mutate(reco.id)}>
                                  Marquer lu
                                </button>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(reco.cree_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                              </span>
                            </div>
                          </div>

                          {reco.supports?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                Supports à consulter
                              </p>
                              <div className="space-y-1.5">
                                {reco.supports.map((s: any) => {
                                  const SIcon = RESOURCE_ICONS[s.type] ?? File;
                                  return (
                                    <div key={s.id} className="flex items-center justify-between gap-3 bg-white/70 rounded-lg px-3 py-2 border border-white">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <SIcon className={`w-4 h-4 flex-shrink-0 ${RESOURCE_COLORS[s.type] ?? "text-muted-foreground"}`} />
                                        <p className="text-sm font-medium truncate">{s.title}</p>
                                      </div>
                                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-shrink-0"
                                        onClick={() => {
                                          const r = resources.find((res: any) => res.id === s.id);
                                          if (r) {
                                            if (r.type === "pdf") openPreview({ kind: "pdf", resourceId: r.id, title: r.title }, r.id);
                                            else if (r.type === "image") openPreview({ kind: "image", resourceId: r.id, title: r.title }, r.id);
                                            else if (r.type === "youtube") {
                                              const vid = getYoutubeId(r.fileUrl ?? "");
                                              if (vid) openPreview({ kind: "youtube", videoId: vid, title: r.title });
                                            } else downloadFile(`${BASE}/api/bibliotheque/${r.id}/download`, r.title ?? "fichier");
                                          } else {
                                            setActiveTab("supports");
                                          }
                                        }}>
                                        <Eye className="w-3 h-3" /> Voir
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {reco.quizzes?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                Quiz à repasser
                              </p>
                              <div className="space-y-1.5">
                                {reco.quizzes.map((q: any) => (
                                  <div key={q.id} className="flex items-center justify-between gap-3 bg-white/70 rounded-lg px-3 py-2 border border-white">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <BrainCircuit className="w-4 h-4 flex-shrink-0 text-purple-500" />
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{q.titre}</p>
                                        {q.last_score_pct !== null && (
                                          <p className="text-xs text-red-600">Dernier score : {q.last_score_pct}%</p>
                                        )}
                                      </div>
                                    </div>
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-shrink-0 border-purple-300 text-purple-700 hover:bg-purple-50"
                                      onClick={async () => {
                                        setQuizState({ step: "loading", resourceId: q.resource_id, resourceTitle: q.resource_title });
                                        try {
                                          const d = await apiFetch(`/bibliotheque/quiz/${q.id}/take`);
                                          if (!d.quiz) { setQuizState({ step: "none" }); toast({ title: "Quiz non disponible", variant: "destructive" }); return; }
                                          setQuizState({ step: "intro", quiz: d.quiz, questions: d.questions, resourceTitle: q.resource_title });
                                        } catch { setQuizState({ step: "none" }); toast({ title: "Erreur", variant: "destructive" }); }
                                      }}>
                                      <Zap className="w-3 h-3" /> Revoir
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closePreview}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h2 className="font-semibold text-base truncate pr-4">{preview.title}</h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(preview.kind === "pdf" || preview.kind === "image") && (
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => handleDownload(resources.find((r: any) => r.id === (preview as any).resourceId))}>
                    <Download className="w-3 h-3" /> Télécharger
                  </Button>
                )}
                <button onClick={closePreview} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {preview.kind === "pdf" && (
                <iframe src={`${BASE}/api/bibliotheque/${preview.resourceId}/download?mode=preview`} className="w-full h-full min-h-[70vh]" title={preview.title} />
              )}
              {preview.kind === "image" && (
                <div className="flex items-center justify-center p-4 h-full min-h-[50vh]">
                  <img src={`${BASE}/api/bibliotheque/${preview.resourceId}/download?mode=preview`} alt={preview.title} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
                </div>
              )}
              {preview.kind === "youtube" && (
                <div className="aspect-video w-full">
                  <iframe src={`https://www.youtube.com/embed/${preview.videoId}?autoplay=1`} className="w-full h-full" title={preview.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quiz modal */}
      <QuizModal state={quizState} setState={setQuizState} resources={resources} toast={toast} />
    </AppLayout>
  );
}
