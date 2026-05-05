import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Clock, BookOpen, CheckCircle2, Lock, AlertTriangle, Play, FileText } from "lucide-react";

function statutDevoir(d: any) {
  const now = new Date();
  const debut = new Date(d.date_debut);
  const fin = new Date(d.date_fin);
  const session = d.session;

  if (session?.statut === "soumis" || session?.statut === "expire" || session?.statut === "tricherie") {
    return { label: "Soumis", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-3.5 h-3.5" />, action: "resultats" };
  }
  if (session?.statut === "en_cours") {
    return { label: "En cours", color: "bg-blue-100 text-blue-700", icon: <Play className="w-3.5 h-3.5" />, action: "reprendre" };
  }
  if (now < debut) {
    return { label: "Pas encore ouvert", color: "bg-gray-100 text-gray-500", icon: <Lock className="w-3.5 h-3.5" />, action: "locked" };
  }
  if (now > fin) {
    return { label: "Délai dépassé", color: "bg-red-100 text-red-600", icon: <AlertTriangle className="w-3.5 h-3.5" />, action: "locked" };
  }
  return { label: "Disponible", color: "bg-emerald-100 text-emerald-700", icon: <Play className="w-3.5 h-3.5" />, action: "demarrer" };
}

export default function StudentDevoirs() {
  const { data: devoirs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/devoirs"],
    queryFn: () => fetch("/api/devoirs", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Devoirs</h1>
          <p className="text-gray-500 text-sm mt-1">Évaluations et exercices en ligne</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Chargement...</div>
        ) : (devoirs as any[]).length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Aucun devoir disponible pour le moment</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(devoirs as any[]).map((d: any) => {
              const { label, color, icon, action } = statutDevoir(d);
              const debutFmt = new Date(d.date_debut).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
              const finFmt = new Date(d.date_fin).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

              return (
                <Card key={d.id} className={`hover:shadow-md transition-shadow ${action === "demarrer" || action === "reprendre" ? "border-blue-200" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-gray-900">{d.titre}</h3>
                          <Badge className={`${color} gap-1 text-xs`}>{icon}{label}</Badge>
                          {d.type_devoir === "note_officiel" && (
                            <Badge className="bg-purple-100 text-purple-700 text-xs">Noté officiel</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-2">{d.matiere_nom} — {d.enseignant_nom}</p>

                        <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-2">
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{d.duree_minutes} min</span>
                          <span>Note sur {d.note_sur}</span>
                          <span>{d.nb_tentatives} tentative{d.nb_tentatives > 1 ? "s" : ""}</span>
                        </div>

                        <div className="text-xs text-gray-400">
                          <span>Du {debutFmt} au {finFmt}</span>
                        </div>

                        {/* Résultat si soumis */}
                        {d.resultat && (
                          <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
                            <p className="text-sm font-medium text-green-700">
                              Note obtenue : {d.resultat.note_sur_20?.toFixed(2)} / {d.note_sur}
                            </p>
                            {d.resultat.statut === "partiel" && (
                              <p className="text-xs text-yellow-600 mt-0.5">Correction manuelle en attente pour certaines questions</p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0">
                        {action === "demarrer" && (
                          <Link href={`/student/devoirs/${d.id}`}>
                            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                              <Play className="w-3.5 h-3.5" /> Commencer
                            </Button>
                          </Link>
                        )}
                        {action === "reprendre" && (
                          <Link href={`/student/devoirs/${d.id}`}>
                            <Button size="sm" variant="outline" className="gap-1.5 border-blue-300 text-blue-600">
                              <Play className="w-3.5 h-3.5" /> Reprendre
                            </Button>
                          </Link>
                        )}
                        {action === "resultats" && d.session && (
                          <Link href={`/student/devoirs/${d.id}/resultats/${d.session.id}`}>
                            <Button size="sm" variant="outline" className="gap-1.5">
                              <FileText className="w-3.5 h-3.5" /> Résultats
                            </Button>
                          </Link>
                        )}
                        {action === "locked" && (
                          <Button size="sm" variant="ghost" disabled className="gap-1.5">
                            <Lock className="w-3.5 h-3.5" /> Fermé
                          </Button>
                        )}
                      </div>
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
