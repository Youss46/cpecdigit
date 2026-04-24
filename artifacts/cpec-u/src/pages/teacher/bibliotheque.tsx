import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Upload, Plus, Trash2, Pencil, Download, Eye, Link2,
  Youtube, FileText, FileImage, Archive, BarChart2, Users, AlertCircle,
  CheckCircle2, Clock, X, File, BrainCircuit, Trophy,
  TrendingUp, Bell,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const RESOURCE_ICONS: Record<string, any> = {
  pdf: FileText, word: FileText, powerpoint: FileText,
  image: FileImage, archive: Archive, youtube: Youtube, link: Link2,
};
const RESOURCE_LABELS: Record<string, string> = {
  pdf: "PDF", word: "Word", powerpoint: "PowerPoint",
  image: "Image", archive: "Archive", youtube: "Vidéo YouTube", link: "Lien externe",
};
const RESOURCE_COLORS: Record<string, string> = {
  pdf: "bg-red-100 text-red-700 border-red-200",
  word: "bg-blue-100 text-blue-700 border-blue-200",
  powerpoint: "bg-orange-100 text-orange-700 border-orange-200",
  image: "bg-green-100 text-green-700 border-green-200",
  archive: "bg-yellow-100 text-yellow-700 border-yellow-200",
  youtube: "bg-red-100 text-red-700 border-red-200",
  link: "bg-purple-100 text-purple-700 border-purple-200",
};

function formatSize(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
function formatDuration(seconds: number) {
  const s = Number(seconds) || 0;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${(m % 60).toString().padStart(2, "0")}`;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}/api${path}`;
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur réseau" }));
    throw new Error(err.error || "Erreur");
  }
  return res.json();
}

// ── Quiz Question type ───────────────────────────────────────────────────────
type QuizReponse = { texte: string; estCorrecte: boolean };
type QuizQuestion = {
  texte: string;
  type: "qcm" | "qcm_multi" | "vrai_faux" | "libre";
  explication: string;
  points: number;
  reponses: QuizReponse[];
};
type QuizFormData = {
  titre: string;
  durreeMinutes: string;
  noteMinimale: string;
  nbTentatives: string;
  questions: QuizQuestion[];
};

function emptyQuestion(): QuizQuestion {
  return { texte: "", type: "qcm", explication: "", points: 1, reponses: [{ texte: "", estCorrecte: true }, { texte: "", estCorrecte: false }] };
}
function emptyQuizForm(): QuizFormData {
  return { titre: "", durreeMinutes: "", noteMinimale: "", nbTentatives: "2", questions: [emptyQuestion()] };
}

// ── Quiz Builder Dialog ──────────────────────────────────────────────────────
function QuizBuilderDialog({ resource, existingQuiz, onClose, onSaved }: {
  resource: any;
  existingQuiz: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<QuizFormData>(() => {
    if (existingQuiz) {
      return {
        titre: existingQuiz.titre ?? "",
        durreeMinutes: existingQuiz.duree_minutes ? String(existingQuiz.duree_minutes) : "",
        noteMinimale: existingQuiz.note_minimale ? String(existingQuiz.note_minimale) : "",
        nbTentatives: String(existingQuiz.nb_tentatives ?? 2),
        questions: (existingQuiz.questions ?? []).map((q: any) => ({
          texte: q.texte ?? "",
          type: q.type ?? "qcm",
          explication: q.explication ?? "",
          points: q.points ?? 1,
          reponses: (q.reponses ?? []).map((r: any) => ({ texte: r.texte, estCorrecte: r.est_correcte })),
        })),
      };
    }
    return emptyQuizForm();
  });
  const [saving, setSaving] = useState(false);

  function updateQ(i: number, patch: Partial<QuizQuestion>) {
    setForm(f => {
      const questions = [...f.questions];
      questions[i] = { ...questions[i], ...patch };
      if (patch.type === "vrai_faux") {
        questions[i].reponses = [{ texte: "Vrai", estCorrecte: true }, { texte: "Faux", estCorrecte: false }];
      } else if (patch.type === "libre") {
        questions[i].reponses = [];
      } else if (patch.type && questions[i].reponses.length < 2) {
        questions[i].reponses = [{ texte: "", estCorrecte: true }, { texte: "", estCorrecte: false }];
      }
      return { ...f, questions };
    });
  }
  function addReponse(qi: number) {
    setForm(f => {
      const questions = [...f.questions];
      questions[qi] = { ...questions[qi], reponses: [...questions[qi].reponses, { texte: "", estCorrecte: false }] };
      return { ...f, questions };
    });
  }
  function updateReponse(qi: number, ri: number, patch: Partial<QuizReponse>) {
    setForm(f => {
      const questions = [...f.questions];
      const reponses = [...questions[qi].reponses];
      reponses[ri] = { ...reponses[ri], ...patch };
      // For qcm: only one correct
      if (patch.estCorrecte && questions[qi].type === "qcm") {
        reponses.forEach((r, j) => { if (j !== ri) r.estCorrecte = false; });
      }
      questions[qi] = { ...questions[qi], reponses };
      return { ...f, questions };
    });
  }
  function removeReponse(qi: number, ri: number) {
    setForm(f => {
      const questions = [...f.questions];
      const reponses = questions[qi].reponses.filter((_, j) => j !== ri);
      questions[qi] = { ...questions[qi], reponses };
      return { ...f, questions };
    });
  }
  function removeQuestion(i: number) {
    setForm(f => ({ ...f, questions: f.questions.filter((_, j) => j !== i) }));
  }

  async function handleSave() {
    if (!form.titre.trim()) { toast({ title: "Le titre est requis", variant: "destructive" }); return; }
    if (form.questions.length === 0) { toast({ title: "Ajoutez au moins une question", variant: "destructive" }); return; }
    for (const q of form.questions) {
      if (!q.texte.trim()) { toast({ title: "Chaque question doit avoir un texte", variant: "destructive" }); return; }
      if (q.type !== "libre" && q.reponses.length < 2) { toast({ title: "Ajoutez au moins 2 réponses par question", variant: "destructive" }); return; }
      if (q.type !== "libre" && !q.reponses.some(r => r.estCorrecte)) { toast({ title: "Chaque question doit avoir une réponse correcte", variant: "destructive" }); return; }
    }
    setSaving(true);
    try {
      const payload = {
        resourceId: resource.id,
        titre: form.titre,
        durreeMinutes: form.durreeMinutes ? Number(form.durreeMinutes) : undefined,
        noteMinimale: form.noteMinimale ? Number(form.noteMinimale) : undefined,
        nbTentatives: Number(form.nbTentatives) || 2,
        questions: form.questions.map(q => ({
          texte: q.texte,
          type: q.type,
          explication: q.explication || undefined,
          points: q.points,
          reponses: q.reponses.map(r => ({ texte: r.texte, estCorrecte: r.estCorrecte })),
        })),
      };
      if (existingQuiz) {
        await apiFetch(`/bibliotheque/quiz/${existingQuiz.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        toast({ title: "Quiz mis à jour" });
      } else {
        await apiFetch("/bibliotheque/quiz", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        toast({ title: "Quiz créé avec succès" });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-purple-600" />
            {existingQuiz ? "Modifier le quiz" : "Créer un quiz"} — {resource.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Settings */}
          <div className="grid grid-cols-2 gap-4 bg-muted/30 rounded-lg p-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Titre du quiz <span className="text-destructive">*</span></Label>
              <Input placeholder="Ex: Quiz — Chapitre 1" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Durée (minutes)</Label>
              <Input type="number" min="1" placeholder="Sans limite" value={form.durreeMinutes} onChange={e => setForm(f => ({ ...f, durreeMinutes: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Score minimum (%)</Label>
              <Input type="number" min="0" max="100" placeholder="Ex: 50" value={form.noteMinimale} onChange={e => setForm(f => ({ ...f, noteMinimale: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tentatives max</Label>
              <Select value={form.nbTentatives} onValueChange={v => setForm(f => ({ ...f, nbTentatives: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Questions ({form.questions.length})</h3>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setForm(f => ({ ...f, questions: [...f.questions, emptyQuestion()] }))}>
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </Button>
            </div>

            {form.questions.map((q, qi) => (
              <Card key={qi} className="border-l-4 border-l-purple-400">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-bold text-purple-600 mt-2 flex-shrink-0">Q{qi + 1}</span>
                    <div className="flex-1 space-y-3">
                      <Textarea
                        placeholder="Texte de la question…"
                        value={q.texte}
                        onChange={e => updateQ(qi, { texte: e.target.value })}
                        rows={2}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Type</Label>
                          <Select value={q.type} onValueChange={(v: any) => updateQ(qi, { type: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="qcm">QCM (1 réponse)</SelectItem>
                              <SelectItem value="qcm_multi">QCM (multi)</SelectItem>
                              <SelectItem value="vrai_faux">Vrai / Faux</SelectItem>
                              <SelectItem value="libre">Réponse libre</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Points</Label>
                          <Input type="number" min="1" className="h-8 text-xs" value={q.points} onChange={e => updateQ(qi, { points: Number(e.target.value) || 1 })} />
                        </div>
                        <div className="flex items-end">
                          <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive gap-1 text-xs" onClick={() => removeQuestion(qi)} disabled={form.questions.length <= 1}>
                            <Trash2 className="w-3 h-3" /> Suppr.
                          </Button>
                        </div>
                      </div>

                      {/* Answers */}
                      {q.type !== "libre" && (
                        <div className="space-y-2">
                          <Label className="text-xs">Réponses</Label>
                          {q.reponses.map((r, ri) => (
                            <div key={ri} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${r.estCorrecte ? "border-green-300 bg-green-50" : ""}`}>
                              <button
                                onClick={() => updateReponse(qi, ri, { estCorrecte: !r.estCorrecte })}
                                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${r.estCorrecte ? "border-green-500 bg-green-500" : "border-muted-foreground"}`}
                                title={r.estCorrecte ? "Correcte" : "Marquer correcte"}
                                disabled={q.type === "vrai_faux"}
                              >
                                {r.estCorrecte && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </button>
                              <Input
                                className="h-7 text-xs flex-1 border-0 bg-transparent p-0 focus-visible:ring-0"
                                placeholder={`Réponse ${ri + 1}…`}
                                value={r.texte}
                                onChange={e => updateReponse(qi, ri, { texte: e.target.value })}
                                disabled={q.type === "vrai_faux"}
                              />
                              {q.type !== "vrai_faux" && (
                                <button onClick={() => removeReponse(qi, ri)} className="text-muted-foreground hover:text-destructive">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {q.type !== "vrai_faux" && (
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => addReponse(qi)}>
                              <Plus className="w-3 h-3" /> Réponse
                            </Button>
                          )}
                        </div>
                      )}
                      {q.type === "libre" && (
                        <p className="text-xs text-muted-foreground italic">Les réponses libres ne sont pas auto-corrigées.</p>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs">Explication (optionnel, affichée après réponse)</Label>
                        <Input className="text-xs" placeholder="Explication…" value={q.explication} onChange={e => updateQ(qi, { explication: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              variant="outline"
              className="w-full gap-2 border-dashed border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
              onClick={() => setForm(f => ({ ...f, questions: [...f.questions, emptyQuestion()] }))}
            >
              <Plus className="w-4 h-4" /> Ajouter une question
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button className="gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
            {existingQuiz ? "Mettre à jour" : "Créer le quiz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TeacherBibliotheque() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"ressources" | "stats" | "engagement">("ressources");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editResource, setEditResource] = useState<any>(null);
  const [statsResource, setStatsResource] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [quizResource, setQuizResource] = useState<any>(null); // resource being quiz-edited
  const [filterSemester, setFilterSemester] = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");

  const [form, setForm] = useState({
    title: "",
    type: "pdf" as string,
    subjectId: "",
    semesterId: "",
    classIds: [] as number[],
    description: "",
    availableFrom: "",
    url: "",
    file: null as File | null,
  });

  const { data: semData } = useQuery({
    queryKey: ["/api/bibliotheque/semesters"],
    queryFn: () => apiFetch("/bibliotheque/semesters"),
  });
  const semesters: any[] = semData?.semesters ?? [];

  const { data: subData } = useQuery({
    queryKey: ["/api/bibliotheque/subjects"],
    queryFn: () => apiFetch("/bibliotheque/subjects"),
  });
  const subjects: any[] = subData?.subjects ?? [];

  const { data: classData } = useQuery({
    queryKey: ["/api/admin/classes"],
    queryFn: () => apiFetch("/admin/classes"),
  });
  const classes: any[] = classData?.classes ?? (Array.isArray(classData) ? classData : []);

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

  const { data: statsData } = useQuery({
    queryKey: ["/api/bibliotheque/stats"],
    queryFn: () => apiFetch("/bibliotheque/stats"),
    enabled: activeTab === "stats",
  });

  const { data: nonConsultantsData } = useQuery({
    queryKey: ["/api/bibliotheque/non-consultants", statsResource?.id],
    queryFn: () => apiFetch(`/bibliotheque/${statsResource.id}/non-consultants`),
    enabled: !!statsResource,
  });

  const { data: engagementData } = useQuery({
    queryKey: ["/api/bibliotheque/student-engagement"],
    queryFn: () => apiFetch("/bibliotheque/student-engagement"),
    enabled: activeTab === "engagement",
  });
  const engagement: any[] = engagementData?.engagement ?? [];

  // Quiz data for resources (to know which have quizzes)
  const resourceIds = resources.map((r: any) => r.id);
  const { data: quizHasData } = useQuery({
    queryKey: ["/api/bibliotheque/quiz-has", resourceIds.join(",")],
    queryFn: () => resourceIds.length > 0
      ? apiFetch(`/bibliotheque/quiz-has?ids=${resourceIds.join(",")}`)
      : Promise.resolve({ resourceIdsWithQuiz: [] }),
    enabled: resourceIds.length > 0,
  });
  const resourceIdsWithQuiz = new Set<number>(quizHasData?.resourceIdsWithQuiz ?? []);

  // Existing quiz for the resource being edited
  const { data: existingQuizData } = useQuery({
    queryKey: ["/api/bibliotheque/quiz", quizResource?.id],
    queryFn: () => apiFetch(`/bibliotheque/quiz?resourceId=${quizResource.id}`),
    enabled: !!quizResource,
  });
  const existingQuiz = existingQuizData?.quizzes?.[0] ?? null;

  function resetForm() {
    setForm({ title: "", type: "pdf", subjectId: "", semesterId: "", classIds: [], description: "", availableFrom: "", url: "", file: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const uploadMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (["youtube", "link"].includes(data.type)) {
        return apiFetch("/bibliotheque/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title, type: data.type, url: data.url,
            subjectId: data.subjectId || undefined, semesterId: data.semesterId || undefined,
            classIds: data.classIds, description: data.description || undefined,
            availableFrom: data.availableFrom || undefined,
          }),
        });
      }
      const fd = new FormData();
      fd.append("title", data.title);
      if (data.file) fd.append("fichier", data.file);
      if (data.subjectId) fd.append("subjectId", data.subjectId);
      if (data.semesterId) fd.append("semesterId", data.semesterId);
      fd.append("classIds", JSON.stringify(data.classIds));
      if (data.description) fd.append("description", data.description);
      if (data.availableFrom) fd.append("availableFrom", data.availableFrom);
      const res = await fetch(`${BASE}/api/bibliotheque/upload`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Erreur" })); throw new Error(err.error || "Erreur upload"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Support ajouté avec succès" });
      queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/stats"] });
      setShowAddDialog(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/bibliotheque/${data.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Support modifié" });
      queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque"] });
      setEditResource(null);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/bibliotheque/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Support supprimé" });
      queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/stats"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const sendReminderMutation = useMutation({
    mutationFn: (resourceId: number) => apiFetch("/bibliotheque/send-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId }),
    }),
    onSuccess: (data) => {
      const msg = data.sent === 0
        ? "Tous les étudiants ont déjà consulté ce support"
        : `Rappel envoyé à ${data.sent} étudiant${data.sent > 1 ? "s" : ""}`;
      toast({ title: "Rappel envoyé", description: msg });
    },
    onError: () => toast({ title: "Erreur lors de l'envoi du rappel", variant: "destructive" }),
  });

  async function deleteQuiz(quizId: number) {
    try {
      await apiFetch(`/bibliotheque/quiz/${quizId}`, { method: "DELETE" });
      toast({ title: "Quiz supprimé" });
      queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/quiz-has"] });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    }
  }

  function toggleClass(cid: number) {
    setForm(f => ({ ...f, classIds: f.classIds.includes(cid) ? f.classIds.filter(x => x !== cid) : [...f.classIds, cid] }));
  }

  const isFileType = !["youtube", "link"].includes(form.type);
  const canSubmit = form.title && (isFileType ? !!form.file : !!form.url) && !uploadMutation.isPending;
  const uniqueSubjects = subjects.filter((s, i, arr) => arr.findIndex(x => x.subjectId === s.subjectId) === i);

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              Bibliothèque numérique
            </h1>
            <p className="text-muted-foreground mt-1">Partagez vos supports, créez des quiz et suivez l'engagement étudiant</p>
          </div>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Ajouter un support
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="ressources" className="gap-2">
              <BookOpen className="w-4 h-4" /> Mes supports
            </TabsTrigger>
            <TabsTrigger value="engagement" className="gap-2">
              <TrendingUp className="w-4 h-4" /> Engagement
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <BarChart2 className="w-4 h-4" /> Statistiques
            </TabsTrigger>
          </TabsList>

          {/* ── Onglet Ressources ────────────────────────────────────────── */}
          <TabsContent value="ressources" className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Select value={filterSemester} onValueChange={setFilterSemester}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Tous les semestres" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les semestres</SelectItem>
                  {semesters.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Toutes les matières" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les matières</SelectItem>
                  {uniqueSubjects.map(s => <SelectItem key={s.subjectId} value={String(s.subjectId)}>{s.subjectName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {resourcesQuery.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Chargement…</div>
            ) : resources.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-medium text-muted-foreground">Aucun support pour le moment</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Cliquez sur "Ajouter un support" pour commencer</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {resources.map((r: any) => {
                  const Icon = RESOURCE_ICONS[r.type] ?? File;
                  const hasQuiz = resourceIdsWithQuiz.has(r.id);
                  return (
                    <Card key={r.id} className="group hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border ${RESOURCE_COLORS[r.type] ?? "bg-muted"}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{r.title}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <Badge variant="outline" className={`text-xs ${RESOURCE_COLORS[r.type] ?? ""}`}>
                                  {RESOURCE_LABELS[r.type] ?? r.type}
                                </Badge>
                                {r.subjectName && <span className="text-xs text-muted-foreground">{r.subjectName}</span>}
                                {r.ueName && <span className="text-xs text-muted-foreground">• {r.ueName}</span>}
                                {r.semesterName && <span className="text-xs text-muted-foreground">• {r.semesterName}</span>}
                                {r.fileSize && <span className="text-xs text-muted-foreground">• {formatSize(r.fileSize)}</span>}
                                {hasQuiz && (
                                  <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200" variant="outline">
                                    <BrainCircuit className="w-3 h-3 mr-0.5" /> Quiz
                                  </Badge>
                                )}
                              </div>
                              {r.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{r.description}</p>}
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Download className="w-3 h-3" />
                                  {r.downloadCount} téléchargement{r.downloadCount !== 1 ? "s" : ""}
                                </span>
                                {r.availableFrom && new Date(r.availableFrom) > new Date() && (
                                  <span className="text-xs text-amber-600 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Disponible le {new Date(r.availableFrom).toLocaleDateString("fr-FR")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                                onClick={() => setQuizResource(r)}
                                title={hasQuiz ? "Modifier le quiz" : "Créer un quiz"}
                              >
                                <BrainCircuit className="w-3.5 h-3.5" />
                                {hasQuiz ? "Quiz" : "+ Quiz"}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setStatsResource(r)} title="Étudiants non-consultants">
                                <Users className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditResource(r)} title="Modifier">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} title="Supprimer">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Onglet Engagement ──────────────────────────────────────── */}
          <TabsContent value="engagement" className="space-y-4">
            {activeTab === "engagement" && engagementData === undefined ? (
              <div className="text-center py-12 text-muted-foreground">Chargement…</div>
            ) : engagement.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <TrendingUp className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-medium text-muted-foreground">Aucune donnée d'engagement</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Les étudiants doivent consulter vos supports pour voir les statistiques ici</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Consultations", value: engagement.reduce((s, e) => s + Number(e.consultation_count ?? 0), 0),
                      icon: Eye, color: "from-blue-50 to-blue-100 border-blue-200 text-blue-700",
                    },
                    {
                      label: "Temps total", value: formatDuration(engagement.reduce((s, e) => s + Number(e.total_secondes ?? 0), 0)),
                      icon: Clock, color: "from-purple-50 to-purple-100 border-purple-200 text-purple-700",
                    },
                    {
                      label: "Participants quiz", value: engagement.reduce((s, e) => s + Number(e.quiz_participants ?? 0), 0),
                      icon: BrainCircuit, color: "from-green-50 to-green-100 border-green-200 text-green-700",
                    },
                    {
                      label: "Score moyen", value: (() => {
                        const scores = engagement.filter(e => e.avg_score_pct !== null).map(e => Number(e.avg_score_pct));
                        return scores.length > 0 ? `${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(0)}%` : "—";
                      })(),
                      icon: Trophy, color: "from-amber-50 to-amber-100 border-amber-200 text-amber-700",
                    },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <Card key={label} className={`bg-gradient-to-br ${color} border`}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <div>
                          <p className="text-xl font-bold leading-none">{value}</p>
                          <p className="text-xs mt-0.5 opacity-80">{label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Per-resource table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Détail par support</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {engagement.map((e: any) => {
                        const pct = e.avg_score_pct ? Number(e.avg_score_pct) : null;
                        const r = resources.find((res: any) => res.id === Number(e.resource_id));
                        const Icon = r ? (RESOURCE_ICONS[r.type] ?? File) : File;
                        const totalSec = Number(e.total_secondes ?? 0);
                        const consultCount = Number(e.consultation_count ?? 0);
                        const quizPartic = Number(e.quiz_participants ?? 0);
                        return (
                          <div key={e.resource_id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3">
                              {r && <Icon className={`w-4 h-4 flex-shrink-0 ${(RESOURCE_COLORS[r.type] ?? "").replace(/bg-\S+ /g, "").replace("border-\S+", "")}`} />}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{e.title}</p>
                                <div className="flex flex-wrap items-center gap-4 mt-1">
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Eye className="w-3 h-3" /> {consultCount} consultation{consultCount !== 1 ? "s" : ""}
                                  </span>
                                  {totalSec > 0 && (
                                    <span className="text-xs text-blue-600 flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> {formatDuration(totalSec)}
                                    </span>
                                  )}
                                  {quizPartic > 0 && (
                                    <span className="text-xs text-purple-600 flex items-center gap-1">
                                      <BrainCircuit className="w-3 h-3" /> {quizPartic} au quiz
                                    </span>
                                  )}
                                  {pct !== null && (
                                    <span className={`text-xs flex items-center gap-1 ${pct >= 50 ? "text-green-600" : "text-red-600"}`}>
                                      <Trophy className="w-3 h-3" /> Moy. {pct.toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                                {totalSec > 0 && (
                                  <Progress value={Math.min(100, (totalSec / 3600) * 100)} className="h-1 mt-2 w-32" />
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5 text-xs flex-shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50"
                                disabled={sendReminderMutation.isPending}
                                onClick={() => sendReminderMutation.mutate(Number(e.resource_id))}
                                title="Envoyer un rappel push aux étudiants n'ayant pas consulté ce support"
                              >
                                <Bell className="w-3 h-3" />
                                Rappel
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── Onglet Statistiques ───────────────────────────────────── */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{statsData?.totalPublished ?? "—"}</p>
                    <p className="text-sm text-muted-foreground">Supports publiés</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Download className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{statsData?.totalDownloads ?? "—"}</p>
                    <p className="text-sm text-muted-foreground">Téléchargements totaux</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Classement par téléchargements</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!statsData?.resources?.length ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">Aucun support publié</div>
                ) : (
                  <div className="divide-y">
                    {statsData.resources.map((r: any, i: number) => {
                      const Icon = RESOURCE_ICONS[r.type] ?? File;
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                          <span className="w-6 text-center text-sm font-medium text-muted-foreground">#{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{r.title}</p>
                            {r.subjectName && <p className="text-xs text-muted-foreground">{r.subjectName}</p>}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-semibold flex items-center gap-1.5">
                              <Download className="w-3.5 h-3.5 text-muted-foreground" />
                              {r.downloadCount}
                            </span>
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setStatsResource(r)}>
                              <Users className="w-3 h-3" /> Non consultants
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Quiz Builder ──────────────────────────────────────────────── */}
      {quizResource && existingQuizData !== undefined && (
        <QuizBuilderDialog
          resource={quizResource}
          existingQuiz={existingQuiz}
          onClose={() => setQuizResource(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/quiz-has"] });
            queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/quiz", quizResource?.id] });
          }}
        />
      )}

      {/* ─── Add dialog ──────────────────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={v => { if (!v) { setShowAddDialog(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Ajouter un support
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type de support</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v, file: null, url: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">📄 Document PDF</SelectItem>
                  <SelectItem value="word">📝 Document Word</SelectItem>
                  <SelectItem value="powerpoint">📊 Présentation PowerPoint</SelectItem>
                  <SelectItem value="image">🖼️ Image (JPG/PNG)</SelectItem>
                  <SelectItem value="archive">📦 Archive (ZIP/RAR)</SelectItem>
                  <SelectItem value="youtube">🎥 Vidéo YouTube</SelectItem>
                  <SelectItem value="link">🔗 Lien externe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Titre <span className="text-destructive">*</span></Label>
              <Input placeholder="Ex: Cours magistral — Chapitre 1" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            {isFileType ? (
              <div className="space-y-1.5">
                <Label>Fichier <span className="text-destructive">*</span></Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => fileInputRef.current?.click()}>
                  {form.file ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span className="font-medium">{form.file.name}</span>
                      <span className="text-muted-foreground">({formatSize(form.file.size)})</span>
                      <button onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, file: null })); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                        <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Cliquez pour sélectionner un fichier</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef} type="file" className="hidden"
                  accept={form.type === "pdf" ? ".pdf" : form.type === "word" ? ".doc,.docx" : form.type === "powerpoint" ? ".ppt,.pptx" : form.type === "image" ? ".jpg,.jpeg,.png" : ".zip,.rar"}
                  onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{form.type === "youtube" ? "URL YouTube" : "URL du lien"} <span className="text-destructive">*</span></Label>
                <Input placeholder={form.type === "youtube" ? "https://youtube.com/watch?v=..." : "https://example.com/..."} value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Matière</Label>
                <Select value={form.subjectId || "none"} onValueChange={v => setForm(f => ({ ...f, subjectId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {uniqueSubjects.map(s => <SelectItem key={s.subjectId} value={String(s.subjectId)}>{s.subjectName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Semestre</Label>
                <Select value={form.semesterId || "none"} onValueChange={v => setForm(f => ({ ...f, semesterId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {semesters.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {classes.length > 0 && (
              <div className="space-y-1.5">
                <Label>Classes destinataires</Label>
                <div className="flex flex-wrap gap-2">
                  {classes.map((c: any) => (
                    <button key={c.id} type="button" onClick={() => toggleClass(c.id)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${form.classIds.includes(c.id) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
                {form.classIds.length === 0 && <p className="text-xs text-amber-600">Sans classe sélectionnée, le support sera visible par tous vos étudiants</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Description (optionnel)</Label>
              <Textarea placeholder="Résumé du contenu, objectifs pédagogiques…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Disponible à partir du (optionnel)</Label>
              <Input type="datetime-local" value={form.availableFrom} onChange={e => setForm(f => ({ ...f, availableFrom: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>Annuler</Button>
            <Button onClick={() => uploadMutation.mutate(form)} disabled={!canSubmit} className="gap-2">
              {uploadMutation.isPending ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Envoi…</> : <><Upload className="w-4 h-4" /> Publier</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!editResource} onOpenChange={v => !v && setEditResource(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Modifier le support</DialogTitle></DialogHeader>
          {editResource && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Titre</Label>
                <Input value={editResource.title} onChange={e => setEditResource((r: any) => ({ ...r, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={editResource.description ?? ""} onChange={e => setEditResource((r: any) => ({ ...r, description: e.target.value }))} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Date de disponibilité</Label>
                <Input type="datetime-local" value={editResource.availableFrom ? new Date(editResource.availableFrom).toISOString().slice(0, 16) : ""} onChange={e => setEditResource((r: any) => ({ ...r, availableFrom: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditResource(null)}>Annuler</Button>
            <Button onClick={() => updateMutation.mutate(editResource)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Non-consultants dialog ──────────────────────────────────── */}
      <Dialog open={!!statsResource} onOpenChange={v => !v && setStatsResource(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Étudiants non-consultants
            </DialogTitle>
          </DialogHeader>
          {statsResource && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{statsResource.title}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Download className="w-4 h-4" />
                {statsResource.downloadCount} téléchargement{statsResource.downloadCount !== 1 ? "s" : ""}
              </div>
              {nonConsultantsData?.students?.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="font-medium text-green-700">Tous les étudiants ont consulté ce support</p>
                </div>
              ) : nonConsultantsData?.students ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4" />
                    {nonConsultantsData.students.length} étudiant{nonConsultantsData.students.length > 1 ? "s" : ""} n'ont pas consulté
                  </div>
                  <div className="divide-y rounded-lg border max-h-60 overflow-y-auto">
                    {nonConsultantsData.students.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{s.name.charAt(0)}</div>
                        <div>
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="text-center py-4 text-muted-foreground text-sm">Chargement…</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ─────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer ce support ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le support <span className="font-medium">"{deleteTarget?.title}"</span> sera définitivement supprimé.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
