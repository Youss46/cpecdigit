import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, ShieldAlert, CheckCircle2, AlertTriangle, XCircle,
  Clock, User, Eye, RotateCcw, Ban, ChevronDown, ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function statutSession(s: any) {
  if (s.statut === "tricherie") return { label: "Tricherie", color: "bg-red-100 text-red-700", icon: <XCircle className="w-3.5 h-3.5" /> };
  if (s.statut === "annule") return { label: "Annulé", color: "bg-gray-100 text-gray-500", icon: <Ban className="w-3.5 h-3.5" /> };
  if (s.statut === "expire") return { label: "Hors délai", color: "bg-orange-100 text-orange-700", icon: <AlertTriangle className="w-3.5 h-3.5" /> };
  if (s.statut === "soumis") {
    const nb = Number(s.nb_incidents ?? 0);
    if (nb >= 3) return { label: "Suspect", color: "bg-yellow-100 text-yellow-700", icon: <AlertTriangle className="w-3.5 h-3.5" /> };
    return { label: "Normal", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
  }
  return { label: "En cours", color: "bg-blue-100 text-blue-700", icon: <Clock className="w-3.5 h-3.5" /> };
}

const INCIDENT_LABELS: Record<string, string> = {
  quitter_page: "Sortie de page",
  quitter_plein_ecran: "Sortie plein écran",
  copier: "Tentative de copie",
  coller: "Tentative de collage",
  couper: "Tentative de couper",
  clic_droit: "Clic droit",
  raccourci_clavier: "Raccourci clavier bloqué",
};

export default function DevoirRapport() {
  const [, params] = useRoute("/teacher/devoirs/:id");
  const id = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/devoirs/${id}/rapport`],
    queryFn: () => fetch(`/api/devoirs/${id}/rapport`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });

  const annulerMutation = useMutation({
    mutationFn: (sessionId: number) =>
      fetch(`/api/devoirs/${id}/sessions/${sessionId}/annuler`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/devoirs/${id}/rapport`] });
      toast({ title: "Session annulée" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const retentativeMutation = useMutation({
    mutationFn: (sessionId: number) =>
      fetch(`/api/devoirs/${id}/sessions/${sessionId}/retentative`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/devoirs/${id}/rapport`] });
      toast({ title: "Nouvelle tentative accordée à l'étudiant" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  function toggleExpand(id: number) {
    setExpandedSessions(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["teacher", "admin"]}>
        <div className="flex items-center justify-center h-64 text-gray-400">Chargement du rapport...</div>
      </AppLayout>
    );
  }

  const devoir = data?.devoir;
  const sessions: any[] = data?.sessions ?? [];

  const stats = {
    total: sessions.length,
    soumis: sessions.filter(s => s.statut === "soumis").length,
    tricherie: sessions.filter(s => s.statut === "tricherie").length,
    enCours: sessions.filter(s => s.statut === "en_cours").length,
  };

  return (
    <AppLayout allowedRoles={["teacher", "admin"]}>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/teacher/devoirs">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Retour
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{devoir?.titre}</h1>
            <p className="text-sm text-gray-500">Rapport de surveillance</p>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Participants", value: stats.total, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Soumis", value: stats.soumis, color: "text-green-600", bg: "bg-green-50" },
            { label: "En cours", value: stats.enCours, color: "text-orange-600", bg: "bg-orange-50" },
            { label: "Tricheries", value: stats.tricherie, color: "text-red-600", bg: "bg-red-50" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
              <div className={`text-3xl font-bold ${color}`}>{value}</div>
              <div className="text-sm text-gray-600 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Tableau des sessions */}
        {sessions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <User className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p>Aucun étudiant n'a encore démarré ce devoir.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s: any) => {
              const { label, color, icon } = statutSession(s);
              const expanded = expandedSessions.has(s.id);
              const dureeMin = s.soumis_le
                ? Math.round((new Date(s.soumis_le).getTime() - new Date(s.debut_le).getTime()) / 60000)
                : null;

              return (
                <Card key={s.id} className={s.statut === "tricherie" ? "border-red-200" : ""}>
                  <CardContent className="p-0">
                    {/* Row header */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleExpand(s.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{s.etudiant_nom}</span>
                          <Badge className={`${color} gap-1 text-xs`}>{icon}{label}</Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500 mt-1">
                          {s.resultat && (
                            <span className="font-medium text-gray-700">
                              Note : {s.resultat.note_sur_20?.toFixed(2)} / {devoir?.note_sur}
                            </span>
                          )}
                          {dureeMin !== null && <span><Clock className="w-3 h-3 inline mr-0.5" />{dureeMin} min</span>}
                          <span className={Number(s.nb_incidents) > 0 ? "text-orange-600 font-medium" : ""}>
                            <ShieldAlert className="w-3 h-3 inline mr-0.5" />{s.nb_incidents} incident{s.nb_incidents > 1 ? "s" : ""}
                          </span>
                          <span>Tentative {s.tentative_numero}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {(s.statut === "soumis" || s.statut === "tricherie" || s.statut === "expire") && (
                          <>
                            <Button
                              size="sm" variant="outline"
                              className="text-xs h-7 gap-1 text-blue-600"
                              onClick={e => { e.stopPropagation(); retentativeMutation.mutate(s.id); }}
                            >
                              <RotateCcw className="w-3 h-3" /> Retentative
                            </Button>
                            {s.statut !== "annule" && (
                              <Button
                                size="sm" variant="outline"
                                className="text-xs h-7 gap-1 text-red-500 border-red-200"
                                onClick={e => { e.stopPropagation(); if (confirm("Annuler cette session ?")) annulerMutation.mutate(s.id); }}
                              >
                                <Ban className="w-3 h-3" /> Annuler
                              </Button>
                            )}
                          </>
                        )}
                        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>

                    {/* Détail incidents */}
                    {expanded && (
                      <div className="border-t px-4 pb-4 pt-3">
                        {s.incidents?.length === 0 ? (
                          <p className="text-sm text-gray-400">Aucun incident enregistré.</p>
                        ) : (
                          <div>
                            <p className="text-xs font-semibold text-gray-600 mb-2">Détail des incidents</p>
                            <div className="space-y-1.5">
                              {s.incidents?.map((inc: any, i: number) => (
                                <div key={i} className="flex items-center gap-3 text-xs text-gray-600 bg-orange-50 rounded-lg px-3 py-1.5">
                                  <ShieldAlert className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                  <span className="font-medium">{INCIDENT_LABELS[inc.type] ?? inc.type}</span>
                                  <span className="text-gray-400">
                                    {new Date(inc.occurree_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                  </span>
                                  {inc.question_en_cours != null && (
                                    <span className="text-gray-400">Q{inc.question_en_cours + 1}</span>
                                  )}
                                  {inc.duree_secondes != null && (
                                    <span className="text-gray-400">{inc.duree_secondes}s d'absence</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Résultats */}
                        {s.resultat && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs font-semibold text-gray-600 mb-1">Résultats</p>
                            <div className="flex gap-4 text-sm">
                              <span>Score : <strong>{s.resultat.score_brut?.toFixed(1)} / {s.resultat.score_possible?.toFixed(1)}</strong></span>
                              <span>Note : <strong>{s.resultat.note_sur_20?.toFixed(2)} / {devoir?.note_sur}</strong></span>
                              {s.resultat.statut === "partiel" && (
                                <Badge className="bg-yellow-100 text-yellow-700 text-xs">Questions libres à corriger</Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
