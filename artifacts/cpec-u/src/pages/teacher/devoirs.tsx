import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus, Trash2, ChevronDown, ChevronUp, ClipboardCheck,
  Clock, Users, BarChart2, BookOpen, GripVertical,
  FileQuestion, Pencil, AlertTriangle,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  qcm: "QCM (1 réponse)",
  qcm_multiple: "QCM multiple",
  vrai_faux: "Vrai / Faux",
  texte_libre: "Texte libre",
  ordre: "Mise en ordre",
  correspondance: "Correspondance",
  numerique: "Numérique",
};

interface Reponse { texte: string; estCorrecte: boolean; }
interface Question {
  texte: string; type: string; points: number;
  explication: string; reponses: Reponse[];
  valeurNumerique: string; toleranceNumerique: string;
}

const defaultQuestion = (): Question => ({
  texte: "", type: "qcm", points: 1, explication: "",
  reponses: [{ texte: "", estCorrecte: false }, { texte: "", estCorrecte: false }],
  valeurNumerique: "", toleranceNumerique: "0",
});

export default function TeacherDevoirs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedQ, setExpandedQ] = useState<Set<number>>(new Set([0]));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editHasSessions, setEditHasSessions] = useState(false);

  // Form state
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [matiereId, setMatiereId] = useState("");
  const [classeIds, setClasseIds] = useState<number[]>([]);
  const [typeDevoir, setTypeDevoir] = useState("exercice");
  const [dureeMinutes, setDureeMinutes] = useState("60");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [nbTentatives, setNbTentatives] = useState("1");
  const [noteSur, setNoteSur] = useState("20");
  const [questions, setQuestions] = useState<Question[]>([defaultQuestion()]);
  const [opts, setOpts] = useState({
    pleinEcran: true, blocageCopier: true, blocageClic: true,
    detectionOnglet: true, melangeQuestions: false, melangeReponses: false,
    minuteurVisible: true, uneQuestionALaFois: true,
  });

  const { data: assignments = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/assignments"],
    queryFn: () => fetch("/api/teacher/assignments", { credentials: "include" }).then(r => r.json()),
  });

  const { data: devoirs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/devoirs"],
    queryFn: () => fetch("/api/devoirs", { credentials: "include" }).then(r => r.json()),
  });

  const uniqueSubjects = Array.from(new Map((assignments as any[]).map((a: any) => [a.subjectId, a])).values());

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch("/api/devoirs", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devoirs"] });
      toast({ title: "Devoir créé avec succès !" });
      resetForm();
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const r = await fetch(`/api/devoirs/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devoirs"] });
      toast({ title: "Devoir modifié avec succès !" });
      resetForm();
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/devoirs/${id}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/devoirs"] }),
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: ({ id, statut }: { id: number; statut: string }) =>
      fetch(`/api/devoirs/${id}/statut`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/devoirs"] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setEditHasSessions(false);
    setTitre(""); setDescription(""); setMatiereId("");
    setClasseIds([]); setTypeDevoir("exercice"); setDureeMinutes("60");
    setDateDebut(""); setDateFin(""); setNbTentatives("1"); setNoteSur("20");
    setQuestions([defaultQuestion()]);
    setOpts({ pleinEcran: true, blocageCopier: true, blocageClic: true, detectionOnglet: true, melangeQuestions: false, melangeReponses: false, minuteurVisible: true, uneQuestionALaFois: true });
    setExpandedQ(new Set([0]));
  }

  async function startEdit(d: any) {
    try {
      const res = await fetch(`/api/devoirs/${d.id}`, { credentials: "include" });
      const data = await res.json();

      setEditingId(d.id);
      const hasSess = Number(d.stats?.soumis ?? 0) > 0;
      setEditHasSessions(hasSess);

      setTitre(data.titre ?? "");
      setDescription(data.description ?? "");
      setMatiereId(String(data.matiere_id ?? ""));
      setClasseIds(data.classe_ids ?? []);
      setTypeDevoir(data.type_devoir ?? "exercice");
      setDureeMinutes(String(data.duree_minutes ?? 60));
      setDateDebut(data.date_debut ? data.date_debut.slice(0, 16) : "");
      setDateFin(data.date_fin ? data.date_fin.slice(0, 16) : "");
      setNbTentatives(String(data.nb_tentatives ?? 1));
      setNoteSur(String(data.note_sur ?? 20));

      const antitiche = data.options_antitiche ?? {};
      setOpts({
        pleinEcran: antitiche.pleinEcran ?? true,
        blocageCopier: antitiche.blocageCopier ?? true,
        blocageClic: antitiche.blocageClic ?? true,
        detectionOnglet: antitiche.detectionOnglet ?? true,
        melangeQuestions: antitiche.melangeQuestions ?? false,
        melangeReponses: antitiche.melangeReponses ?? false,
        minuteurVisible: antitiche.minuteurVisible ?? true,
        uneQuestionALaFois: antitiche.uneQuestionALaFois ?? true,
      });

      if (data.questions?.length) {
        setQuestions(data.questions.map((q: any) => ({
          texte: q.texte ?? "",
          type: q.type ?? "qcm",
          points: q.points ?? 1,
          explication: q.explication ?? "",
          valeurNumerique: q.valeur_numerique != null ? String(q.valeur_numerique) : "",
          toleranceNumerique: String(q.tolerance_numerique ?? 0),
          reponses: (q.reponses ?? []).map((r: any) => ({
            texte: r.texte ?? "",
            estCorrecte: r.est_correcte ?? false,
          })),
        })));
        setExpandedQ(new Set([0]));
      }

      setShowForm(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast({ title: "Impossible de charger le devoir", variant: "destructive" });
    }
  }

  function addQuestion() {
    setQuestions(q => [...q, defaultQuestion()]);
    setExpandedQ(prev => new Set([...prev, questions.length]));
  }

  function removeQuestion(i: number) {
    setQuestions(q => q.filter((_, idx) => idx !== i));
    setExpandedQ(prev => { const s = new Set(prev); s.delete(i); return s; });
  }

  function updateQuestion(i: number, field: string, value: any) {
    setQuestions(q => q.map((qu, idx) => idx === i ? { ...qu, [field]: value } : qu));
  }

  function addReponse(qi: number) {
    setQuestions(q => q.map((qu, idx) => idx === qi
      ? { ...qu, reponses: [...qu.reponses, { texte: "", estCorrecte: false }] }
      : qu));
  }

  function removeReponse(qi: number, ri: number) {
    setQuestions(q => q.map((qu, idx) => idx === qi
      ? { ...qu, reponses: qu.reponses.filter((_, ridx) => ridx !== ri) }
      : qu));
  }

  function updateReponse(qi: number, ri: number, field: string, value: any) {
    setQuestions(q => q.map((qu, idx) => {
      if (idx !== qi) return qu;
      const reponses = qu.reponses.map((r, ridx) => {
        if (ridx !== ri) {
          if (field === "estCorrecte" && value && (qu.type === "qcm" || qu.type === "vrai_faux")) {
            return { ...r, estCorrecte: false };
          }
          return r;
        }
        return { ...r, [field]: value };
      });
      return { ...qu, reponses };
    }));
  }

  function toggleVraiFaux(qi: number, isVrai: boolean) {
    setQuestions(q => q.map((qu, idx) => idx === qi
      ? { ...qu, reponses: [{ texte: "Vrai", estCorrecte: isVrai }, { texte: "Faux", estCorrecte: !isVrai }] }
      : qu));
  }

  function handleTypeChange(qi: number, type: string) {
    setQuestions(q => q.map((qu, idx) => {
      if (idx !== qi) return qu;
      let reponses = qu.reponses;
      if (type === "vrai_faux") {
        reponses = [{ texte: "Vrai", estCorrecte: true }, { texte: "Faux", estCorrecte: false }];
      } else if (type === "texte_libre" || type === "numerique") {
        reponses = [];
      } else if (reponses.length === 0) {
        reponses = [{ texte: "", estCorrecte: false }, { texte: "", estCorrecte: false }];
      }
      return { ...qu, type, reponses };
    }));
  }

  function buildPayload() {
    return {
      titre, description, matiereId: Number(matiereId), classeIds,
      typeDevoir, dureeMinutes: Number(dureeMinutes), dateDebut, dateFin,
      nbTentatives: Number(nbTentatives), noteSur: Number(noteSur),
      optionsAntitiche: {
        pleinEcran: opts.pleinEcran, blocageCopier: opts.blocageCopier,
        blocageClic: opts.blocageClic, detectionOnglet: opts.detectionOnglet,
        melangeQuestions: opts.melangeQuestions, melangeReponses: opts.melangeReponses,
        minuteurVisible: opts.minuteurVisible, uneQuestionALaFois: opts.uneQuestionALaFois,
      },
      questions: questions.map(q => ({
        texte: q.texte, type: q.type, points: q.points, explication: q.explication,
        valeurNumerique: q.valeurNumerique ? Number(q.valeurNumerique) : null,
        toleranceNumerique: q.toleranceNumerique ? Number(q.toleranceNumerique) : 0,
        reponses: q.reponses,
      })),
    };
  }

  function handleSubmit() {
    if (!titre.trim()) return toast({ title: "Titre requis", variant: "destructive" });
    if (!matiereId) return toast({ title: "Matière requise", variant: "destructive" });
    if (!editHasSessions && !classeIds.length) return toast({ title: "Au moins une classe requise", variant: "destructive" });
    if (!dateDebut || !dateFin) return toast({ title: "Dates requises", variant: "destructive" });
    if (!editHasSessions && questions.length === 0) return toast({ title: "Au moins une question requise", variant: "destructive" });

    if (!editHasSessions) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.texte.trim()) return toast({ title: `Question ${i + 1} : texte requis`, variant: "destructive" });
        if (q.type !== "texte_libre" && q.type !== "numerique") {
          if (!q.reponses.some(r => r.estCorrecte)) {
            return toast({ title: `Question ${i + 1} : au moins une bonne réponse requise`, variant: "destructive" });
          }
        }
      }
    }

    const payload = buildPayload();
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function statutBadge(d: any) {
    const now = new Date();
    const debut = new Date(d.date_debut);
    const fin = new Date(d.date_fin);
    if (d.statut === "clos") return <Badge className="bg-gray-200 text-gray-700">Clôturé</Badge>;
    if (now < debut) return <Badge className="bg-blue-100 text-blue-700">Programmé</Badge>;
    if (now > fin) return <Badge className="bg-gray-100 text-gray-600">Terminé</Badge>;
    return <Badge className="bg-green-100 text-green-700">En cours</Badge>;
  }

  function toggleClasse(id: number) {
    setClasseIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout allowedRoles={["teacher", "admin"]}>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Devoirs & Évaluations</h1>
            <p className="text-gray-500 text-sm mt-1">Créez et gérez vos évaluations en ligne avec anti-triche</p>
          </div>
          <Button
            onClick={() => { if (showForm && editingId) resetForm(); else { resetForm(); setShowForm(v => !v); } }}
            className="gap-2"
            variant={showForm ? "outline" : "default"}
          >
            {showForm ? "Annuler" : <><Plus className="w-4 h-4" /> Nouveau devoir</>}
          </Button>
        </div>

        {/* ── FORMULAIRE CRÉATION / ÉDITION ─────────────────────────────────── */}
        {showForm && (
          <Card className={`border-2 shadow-lg ${editingId ? "border-amber-300" : "border-blue-200"}`}>
            <CardHeader className={`rounded-t-lg ${editingId ? "bg-amber-50" : "bg-blue-50"}`}>
              <CardTitle className={`flex items-center gap-2 ${editingId ? "text-amber-800" : "text-blue-800"}`}>
                {editingId ? <Pencil className="w-5 h-5" /> : <ClipboardCheck className="w-5 h-5" />}
                {editingId ? "Modifier le devoir" : "Créer un nouveau devoir"}
              </CardTitle>
              {editingId && editHasSessions && (
                <div className="flex items-start gap-2 mt-2 p-3 bg-amber-100 rounded-lg border border-amber-300 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Des étudiants ont déjà commencé ce devoir. Seuls le titre, la description, les dates et les options peuvent être modifiés.</span>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Infos générales */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Titre du devoir *</Label>
                  <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex: Contrôle de thermodynamique — Chapitre 3" />
                </div>
                <div className="md:col-span-2">
                  <Label>Description (optionnelle)</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Instructions pour les étudiants..." rows={2} />
                </div>
                <div>
                  <Label>Matière *</Label>
                  <Select value={matiereId} onValueChange={v => { setMatiereId(v); if (!editingId) setClasseIds([]); }} disabled={editHasSessions}>
                    <SelectTrigger><SelectValue placeholder="Choisir une matière" /></SelectTrigger>
                    <SelectContent>
                      {uniqueSubjects.map((a: any) => (
                        <SelectItem key={a.subjectId} value={String(a.subjectId)}>{a.subjectName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type de devoir</Label>
                  <Select value={typeDevoir} onValueChange={setTypeDevoir}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exercice">Exercice libre (non noté officiellement)</SelectItem>
                      <SelectItem value="note_officiel">Noté officiel (intégré aux évaluations)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Durée (minutes) *</Label>
                  <Input type="number" min={5} value={dureeMinutes} onChange={e => setDureeMinutes(e.target.value)} />
                </div>
                <div>
                  <Label>Note sur</Label>
                  <Input type="number" min={1} max={100} value={noteSur} onChange={e => setNoteSur(e.target.value)} />
                </div>
                <div>
                  <Label>Date / heure de début *</Label>
                  <Input type="datetime-local" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
                </div>
                <div>
                  <Label>Date / heure de fin *</Label>
                  <Input type="datetime-local" value={dateFin} onChange={e => setDateFin(e.target.value)} />
                </div>
                <div>
                  <Label>Nombre de tentatives autorisées</Label>
                  <Input type="number" min={1} max={10} value={nbTentatives} onChange={e => setNbTentatives(e.target.value)} />
                </div>
              </div>

              {/* Classes cibles */}
              {!editHasSessions && (
                <div>
                  <Label className="mb-2 block">Classes cibles *</Label>
                  {!matiereId ? (
                    <p className="text-sm text-gray-400 italic">Sélectionnez d'abord une matière pour voir les classes disponibles.</p>
                  ) : (() => {
                    const classesForSubject = (assignments as any[])
                      .filter((a: any) => a.subjectId === Number(matiereId))
                      .map((a: any) => ({ id: a.classId, name: a.className }));
                    const uniqueClasses = Array.from(new Map(classesForSubject.map(c => [c.id, c])).values());
                    if (!uniqueClasses.length) {
                      return <p className="text-sm text-orange-500 italic">Vous n'êtes pas affecté à cette matière dans aucune classe.</p>;
                    }
                    return (
                      <div className="flex flex-wrap gap-2">
                        {uniqueClasses.map((c: any) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleClasse(c.id)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                              classeIds.includes(c.id)
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                            }`}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  {classeIds.length > 0 && (
                    <p className="text-xs text-blue-600 mt-1">{classeIds.length} classe(s) sélectionnée(s)</p>
                  )}
                </div>
              )}

              {/* Options anti-triche */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs">🔒</span>
                  Options anti-triche
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: "pleinEcran", label: "Plein écran obligatoire" },
                    { key: "blocageCopier", label: "Bloquer copier/coller" },
                    { key: "blocageClic", label: "Bloquer clic droit" },
                    { key: "detectionOnglet", label: "Détecter sortie d'onglet" },
                    { key: "melangeQuestions", label: "Mélanger les questions" },
                    { key: "melangeReponses", label: "Mélanger les réponses" },
                    { key: "minuteurVisible", label: "Minuteur visible" },
                    { key: "uneQuestionALaFois", label: "1 question à la fois" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border">
                      <Switch
                        checked={(opts as any)[key]}
                        onCheckedChange={v => setOpts(o => ({ ...o, [key]: v }))}
                      />
                      <span className="text-xs text-gray-700">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Questions — masquées si sessions existent */}
              {!editHasSessions && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800">Questions ({questions.length})</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="gap-1">
                      <Plus className="w-3.5 h-3.5" /> Ajouter une question
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {questions.map((q, qi) => (
                      <div key={qi} className="border rounded-lg overflow-hidden">
                        <div
                          className="flex items-center gap-2 p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                          onClick={() => setExpandedQ(prev => {
                            const s = new Set(prev);
                            s.has(qi) ? s.delete(qi) : s.add(qi);
                            return s;
                          })}
                        >
                          <GripVertical className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="font-medium text-gray-700 text-sm w-8 shrink-0">Q{qi + 1}</span>
                          <span className="text-sm text-gray-600 flex-1 truncate">
                            {q.texte || <span className="text-gray-400 italic">Question sans titre</span>}
                          </span>
                          <Badge variant="outline" className="text-xs shrink-0">{TYPE_LABELS[q.type]}</Badge>
                          <span className="text-xs text-gray-500 shrink-0">{q.points} pt{q.points > 1 ? "s" : ""}</span>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); removeQuestion(qi); }}
                            className="text-red-400 hover:text-red-600 ml-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {expandedQ.has(qi) ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                        </div>

                        {expandedQ.has(qi) && (
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="md:col-span-2">
                                <Label className="text-xs">Énoncé *</Label>
                                <Textarea value={q.texte} onChange={e => updateQuestion(qi, "texte", e.target.value)} rows={2} placeholder="Saisissez l'énoncé de la question..." />
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <Label className="text-xs">Type</Label>
                                  <Select value={q.type} onValueChange={v => handleTypeChange(qi, v)}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(TYPE_LABELS).map(([v, l]) => (
                                        <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Points</Label>
                                  <Input type="number" min={0.25} step={0.25} value={q.points} onChange={e => updateQuestion(qi, "points", Number(e.target.value))} className="h-8 text-xs" />
                                </div>
                              </div>
                            </div>

                            {q.type === "texte_libre" && (
                              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <p className="text-xs text-yellow-700">
                                  ✏️ Réponse libre — l'étudiant saisit un texte. Correction manuelle requise.
                                </p>
                              </div>
                            )}

                            {q.type === "numerique" && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs">Valeur attendue *</Label>
                                  <Input type="number" step="any" value={q.valeurNumerique} onChange={e => updateQuestion(qi, "valeurNumerique", e.target.value)} placeholder="Ex: 9.81" className="h-8 text-xs" />
                                </div>
                                <div>
                                  <Label className="text-xs">Tolérance (± )</Label>
                                  <Input type="number" step="any" min={0} value={q.toleranceNumerique} onChange={e => updateQuestion(qi, "toleranceNumerique", e.target.value)} placeholder="Ex: 0.1" className="h-8 text-xs" />
                                </div>
                              </div>
                            )}

                            {q.type === "vrai_faux" && (
                              <div>
                                <Label className="text-xs mb-1 block">Bonne réponse</Label>
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleVraiFaux(qi, true)}
                                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${q.reponses[0]?.estCorrecte ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-700 border-gray-300"}`}
                                  >✓ Vrai</button>
                                  <button
                                    type="button"
                                    onClick={() => toggleVraiFaux(qi, false)}
                                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${q.reponses[1]?.estCorrecte ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-700 border-gray-300"}`}
                                  >✗ Faux</button>
                                </div>
                              </div>
                            )}

                            {(q.type === "qcm" || q.type === "qcm_multiple" || q.type === "ordre" || q.type === "correspondance") && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <Label className="text-xs">
                                    Réponses — {q.type === "qcm" || q.type === "vrai_faux" ? "une seule bonne réponse" : "plusieurs bonnes réponses possibles"}
                                  </Label>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => addReponse(qi)} className="h-6 text-xs gap-1">
                                    <Plus className="w-3 h-3" /> Ajouter
                                  </Button>
                                </div>
                                <div className="space-y-2">
                                  {q.reponses.map((r, ri) => (
                                    <div key={ri} className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => updateReponse(qi, ri, "estCorrecte", !r.estCorrecte)}
                                        className={`w-5 h-5 rounded-full border-2 shrink-0 transition-colors ${r.estCorrecte ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}
                                      />
                                      <Input
                                        value={r.texte}
                                        onChange={e => updateReponse(qi, ri, "texte", e.target.value)}
                                        placeholder={`Option ${ri + 1}`}
                                        className="h-7 text-xs flex-1"
                                      />
                                      <button type="button" onClick={() => removeReponse(qi, ri)} className="text-gray-400 hover:text-red-500">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Cercle vert = bonne réponse</p>
                              </div>
                            )}

                            <div>
                              <Label className="text-xs">Explication (affichée après correction)</Label>
                              <Input value={q.explication} onChange={e => updateQuestion(qi, "explication", e.target.value)} placeholder="Optionnelle — ex: D'après le cours, chapitre 4..." className="text-xs h-8" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                {!editHasSessions ? (
                  <Button type="button" variant="outline" onClick={addQuestion} className="gap-1">
                    <Plus className="w-3.5 h-3.5" /> Ajouter une question
                  </Button>
                ) : <div />}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={resetForm}>Annuler</Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isPending}
                    className={editingId ? "gap-2 bg-amber-600 hover:bg-amber-700" : "gap-2"}
                  >
                    {isPending
                      ? (editingId ? "Enregistrement..." : "Création...")
                      : (editingId ? <><Pencil className="w-4 h-4" /> Enregistrer les modifications</> : "Publier le devoir")
                    }
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── LISTE DES DEVOIRS ───────────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Chargement...</div>
        ) : (devoirs as any[]).length === 0 ? (
          <div className="text-center py-16">
            <FileQuestion className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Aucun devoir créé</p>
            <p className="text-gray-400 text-sm mt-1">Cliquez sur « Nouveau devoir » pour commencer</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(devoirs as any[]).map((d: any) => {
              const soumis = Number(d.stats?.soumis ?? 0);
              const total = Number(d.stats?.total ?? 0);
              return (
                <Card key={d.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{d.titre}</h3>
                        <p className="text-sm text-gray-500">{d.matiere_nom}</p>
                      </div>
                      {statutBadge(d)}
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{d.duree_minutes} min</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{soumis}/{total} soumis</span>
                      <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />
                        {d.type_devoir === "note_officiel" ? "Noté officiel" : "Exercice libre"}
                      </span>
                    </div>

                    <div className="text-xs text-gray-400 mb-3">
                      <div>Début : {new Date(d.date_debut).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>
                      <div>Fin : {new Date(d.date_fin).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/teacher/devoirs/${d.id}`}>
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                          <BarChart2 className="w-3.5 h-3.5" /> Rapport
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => startEdit(d)}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Modifier
                      </Button>
                      {d.statut === "publie" ? (
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 text-orange-600 border-orange-300"
                          onClick={() => closeMutation.mutate({ id: d.id, statut: "clos" })}>
                          Clôturer
                        </Button>
                      ) : d.statut === "clos" ? (
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 text-green-600 border-green-300"
                          onClick={() => closeMutation.mutate({ id: d.id, statut: "publie" })}>
                          Rouvrir
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 text-red-500 hover:text-red-700"
                        onClick={() => { if (confirm("Supprimer ce devoir ?")) deleteMutation.mutate(d.id); }}>
                        <Trash2 className="w-3.5 h-3.5" /> Supprimer
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
