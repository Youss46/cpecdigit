import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Search, ShieldAlert, ShieldCheck, Trash2, Download,
  FileText, FileImage, Archive, Link2, Youtube, File, Eye,
  BarChart2, Clock, BrainCircuit, Trophy, TrendingUp, Users,
  AlertTriangle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const RESOURCE_ICONS: Record<string, any> = {
  pdf: FileText, word: FileText, powerpoint: FileText,
  image: FileImage, archive: Archive, youtube: Youtube, link: Link2,
};

const RESOURCE_LABELS: Record<string, string> = {
  pdf: "PDF", word: "Word", powerpoint: "PowerPoint",
  image: "Image", archive: "Archive", youtube: "Vidéo", link: "Lien",
};

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "0 min";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${(m % 60).toString().padStart(2, "0")}`;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include", ...opts });
  if (!res.ok) throw new Error("Erreur réseau");
  return res.json();
}

export default function AdminBibliotheque() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterSemester, setFilterSemester] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"moderation" | "statistiques">("moderation");

  const { data: semData } = useQuery({
    queryKey: ["/api/bibliotheque/semesters"],
    queryFn: () => apiFetch("/bibliotheque/semesters"),
  });
  const semesters: any[] = semData?.semesters ?? [];

  const resourcesQuery = useQuery({
    queryKey: ["/api/bibliotheque/admin", filterSemester],
    queryFn: () => apiFetch(`/bibliotheque${filterSemester !== "all" ? `?semesterId=${filterSemester}` : ""}`),
  });
  const resources: any[] = resourcesQuery.data?.resources ?? [];

  const { data: statsData } = useQuery({
    queryKey: ["/api/bibliotheque/admin-stats"],
    queryFn: () => apiFetch("/bibliotheque/admin-stats"),
    enabled: activeTab === "statistiques",
  });

  const filtered = resources.filter(r => {
    if (!search) return true;
    return r.title.toLowerCase().includes(search.toLowerCase())
      || (r.teacherName ?? "").toLowerCase().includes(search.toLowerCase())
      || (r.subjectName ?? "").toLowerCase().includes(search.toLowerCase());
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, suspended }: { id: number; suspended: boolean }) =>
      apiFetch(`/bibliotheque/${id}/suspend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/admin"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/bibliotheque/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bibliotheque/admin"] });
      toast({ title: "Support supprimé" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const totalSize = resources.reduce((s, r) => s + (r.fileSize ?? 0), 0);
  const formatSize = (b: number) => b < 1e6 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1e6).toFixed(1)} Mo`;

  const gc = statsData?.globalCounts ?? {};
  const topSupports: any[] = statsData?.topSupports ?? [];
  const timePerSubject: any[] = statsData?.timePerSubject ?? [];
  const quizPerSubject: any[] = statsData?.quizPerSubject ?? [];
  const correlation: any[] = statsData?.correlation ?? [];
  const neverConnected: any[] = statsData?.neverConnected ?? [];

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              Bibliothèque Numérique
            </h1>
            <p className="text-muted-foreground mt-1">Modération et statistiques avancées</p>
          </div>
        </div>

        {/* Global counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              <div>
                <p className="text-xl font-bold">{resources.length}</p>
                <p className="text-xs text-muted-foreground">Supports publiés</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Download className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-xl font-bold">{resources.reduce((s, r) => s + (r.downloadCount ?? 0), 0)}</p>
                <p className="text-xs text-muted-foreground">Téléchargements</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ShieldAlert className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-xl font-bold">{resources.filter(r => r.suspended).length}</p>
                <p className="text-xs text-muted-foreground">Suspendus · {formatSize(totalSize)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="moderation" className="gap-2">
              <ShieldCheck className="w-4 h-4" /> Modération
            </TabsTrigger>
            <TabsTrigger value="statistiques" className="gap-2">
              <BarChart2 className="w-4 h-4" /> Statistiques
            </TabsTrigger>
          </TabsList>

          {/* ── Onglet Modération ───────────────────────────────────── */}
          <TabsContent value="moderation" className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 w-64" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
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
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{filtered.length} support{filtered.length !== 1 ? "s" : ""}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">Aucun support trouvé</div>
                ) : (
                  <div className="divide-y">
                    {filtered.map((r: any) => {
                      const Icon = RESOURCE_ICONS[r.type] ?? File;
                      return (
                        <div key={r.id} className={`flex items-center gap-4 px-4 py-3 ${r.suspended ? "bg-red-50/50" : "hover:bg-muted/30"} transition-colors`}>
                          <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">{r.title}</p>
                              {r.suspended && <Badge variant="destructive" className="text-xs">Suspendu</Badge>}
                              <Badge variant="outline" className="text-xs">{RESOURCE_LABELS[r.type] ?? r.type}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {r.teacherName} · {r.subjectName ?? "Sans matière"} · {r.semesterName ?? "Sans semestre"}
                              {r.downloadCount > 0 && ` · ${r.downloadCount} téléch.`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Button
                              size="sm"
                              variant={r.suspended ? "outline" : "secondary"}
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => suspendMutation.mutate({ id: r.id, suspended: !r.suspended })}
                              disabled={suspendMutation.isPending}
                            >
                              {r.suspended ? <><ShieldCheck className="w-3 h-3" /> Rétablir</> : <><ShieldAlert className="w-3 h-3" /> Suspendre</>}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(r)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

          {/* ── Onglet Statistiques ─────────────────────────────────── */}
          <TabsContent value="statistiques" className="space-y-6">
            {activeTab === "statistiques" && statsData === undefined ? (
              <div className="text-center py-12 text-muted-foreground">Chargement des statistiques…</div>
            ) : (
              <>
                {/* KPI globaux */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: "Supports actifs", value: gc.total_supports ?? 0, icon: BookOpen, color: "text-primary" },
                    { label: "Étudiants actifs", value: gc.active_students ?? 0, icon: Users, color: "text-blue-600" },
                    { label: "Temps de révision", value: formatDuration(Number(gc.total_secondes ?? 0)), icon: Clock, color: "text-purple-600" },
                    { label: "Passages quiz", value: gc.total_quiz_passages ?? 0, icon: BrainCircuit, color: "text-green-600" },
                    { label: "Score moyen /20", value: gc.avg_quiz_note_20 ? `${gc.avg_quiz_note_20}/20` : "—", icon: Trophy, color: "text-amber-600" },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <Card key={label}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <Icon className={`w-6 h-6 ${color} flex-shrink-0`} />
                        <div>
                          <p className="text-lg font-bold leading-none">{value}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top 10 supports */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" /> Supports les plus consultés
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {topSupports.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-6">Aucune donnée</p>
                      ) : (
                        <div className="divide-y">
                          {topSupports.map((s: any, i) => {
                            const Icon = RESOURCE_ICONS[s.type] ?? File;
                            const maxConsult = Number(topSupports[0]?.consultation_count ?? 1) || 1;
                            const pct = Math.round((Number(s.consultation_count) / maxConsult) * 100);
                            return (
                              <div key={s.id} className="px-4 py-2.5 hover:bg-muted/20">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{s.title}</p>
                                    <p className="text-xs text-muted-foreground">{s.subject_name ?? "—"}</p>
                                    <Progress value={pct} className="h-1 mt-1.5" />
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold">{s.consultation_count}</p>
                                    <p className="text-xs text-muted-foreground">{formatDuration(Number(s.total_secondes))}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Corrélation temps / notes */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary" /> Corrélation Révision / Notes
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {correlation.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-6">Données insuffisantes</p>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground mb-3">
                            Relation entre le temps passé sur la bibliothèque et la moyenne aux examens
                          </p>
                          {correlation.map((row: any) => {
                            const maxNote = 20;
                            const pct = row.moyenne_notes ? Math.round((Number(row.moyenne_notes) / maxNote) * 100) : 0;
                            const barColor = pct >= 60 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
                            return (
                              <div key={row.tranche_temps} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="font-medium">{row.tranche_temps}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground">{row.nb_etudiants} étud.</span>
                                    <span className={`font-bold ${pct >= 60 ? "text-green-600" : pct >= 40 ? "text-amber-600" : "text-red-600"}`}>
                                      {row.moyenne_notes ? `${row.moyenne_notes}/20` : "—"}
                                    </span>
                                  </div>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t italic">
                            Les étudiants révisant &gt; 2h dans la bibliothèque ont en moyenne une meilleure note.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Temps moyen par matière */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4 text-purple-500" /> Temps moyen par matière
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {timePerSubject.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-6">Aucune donnée</p>
                      ) : (
                        <div className="divide-y">
                          {timePerSubject.map((s: any) => {
                            const maxSec = Number(timePerSubject[0]?.avg_secondes_per_student ?? 1) || 1;
                            const pct = Math.round((Number(s.avg_secondes_per_student) / maxSec) * 100);
                            return (
                              <div key={s.subject_name} className="px-4 py-2.5">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-medium truncate flex-1">{s.subject_name}</p>
                                  <div className="text-right flex-shrink-0 ml-3">
                                    <p className="text-sm font-bold text-purple-600">{formatDuration(Number(s.avg_secondes_per_student))}</p>
                                    <p className="text-xs text-muted-foreground">{s.student_count} étud.</p>
                                  </div>
                                </div>
                                <Progress value={pct} className="h-1" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Score moyen quiz par matière */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-green-500" /> Score moyen quiz par matière
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {quizPerSubject.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-6">Aucune donnée</p>
                      ) : (
                        <div className="divide-y">
                          {quizPerSubject.map((s: any) => {
                            const note = Number(s.avg_note_20 ?? 0);
                            const pct = Math.round((note / 20) * 100);
                            const color = pct >= 60 ? "text-green-600" : pct >= 40 ? "text-amber-600" : "text-red-600";
                            return (
                              <div key={s.subject_name} className="px-4 py-2.5">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-medium truncate flex-1">{s.subject_name ?? "Sans matière"}</p>
                                  <div className="text-right flex-shrink-0 ml-3">
                                    <p className={`text-sm font-bold ${color}`}>{note.toFixed(1)}/20</p>
                                    <p className="text-xs text-muted-foreground">{s.participants} participants</p>
                                  </div>
                                </div>
                                <Progress value={pct} className="h-1" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Étudiants jamais connectés */}
                {neverConnected.length > 0 && (
                  <Card className="border-red-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-4 h-4" />
                        Étudiants n'ayant jamais consulté la bibliothèque ({neverConnected.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y max-h-64 overflow-y-auto">
                        {neverConnected.map((s: any) => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50/50">
                            <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                              {s.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{s.email}</p>
                            </div>
                            {s.class_name && (
                              <Badge variant="outline" className="text-xs flex-shrink-0">{s.class_name}</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer ce support ?</DialogTitle>
          </DialogHeader>
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
