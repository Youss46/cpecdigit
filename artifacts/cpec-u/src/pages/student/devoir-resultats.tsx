import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { CheckCircle2, XCircle, Clock, AlertTriangle, ArrowLeft, HelpCircle, BookOpen } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  qcm: "QCM", qcm_multiple: "QCM multiple", vrai_faux: "Vrai/Faux",
  texte_libre: "Texte libre", ordre: "Ordre", correspondance: "Correspondance", numerique: "Numérique",
};

export default function DevoirResultats() {
  const [, params] = useRoute("/student/devoirs/:id/resultats/:sessionId");
  const devoirId = params?.id;
  const sessionId = params?.sessionId;

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/devoirs/${devoirId}/resultats/${sessionId}`],
    queryFn: () =>
      fetch(`/api/devoirs/${devoirId}/resultats/${sessionId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!devoirId && !!sessionId,
  });

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["student", "teacher", "admin"]}>
        <div className="flex items-center justify-center h-64 text-gray-400">Chargement des résultats...</div>
      </AppLayout>
    );
  }

  const { devoir, session, resultat, questions = [] } = data ?? {};

  return (
    <AppLayout allowedRoles={["student", "teacher", "admin"]}>
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/student/devoirs">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Mes devoirs
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{devoir?.titre}</h1>
            <p className="text-sm text-gray-500">{devoir?.matiere_nom}</p>
          </div>
        </div>

        {/* Résumé */}
        {resultat ? (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
            <div className="text-center mb-4">
              {session?.statut === "tricherie" ? (
                <div>
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-yellow-300" />
                  <p className="text-lg font-bold">Soumission automatique — Tricherie détectée</p>
                </div>
              ) : (
                <div>
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-300" />
                  <p className="text-lg font-bold">Devoir soumis</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold">{resultat.note_sur_20?.toFixed(2)}</div>
                <div className="text-blue-200 text-xs mt-1">Note / {devoir?.note_sur}</div>
              </div>
              <div>
                <div className="text-3xl font-bold">{resultat.score_brut?.toFixed(1)}</div>
                <div className="text-blue-200 text-xs mt-1">Points / {resultat.score_possible?.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-3xl font-bold">
                  {session?.soumis_le
                    ? Math.round((new Date(session.soumis_le).getTime() - new Date(session.debut_le).getTime()) / 60000)
                    : "—"}
                </div>
                <div className="text-blue-200 text-xs mt-1">Minutes</div>
              </div>
            </div>

            {resultat.statut === "partiel" && (
              <div className="mt-4 bg-yellow-500/20 rounded-lg p-3 text-yellow-200 text-sm text-center">
                ⏳ Certaines questions texte libre sont en attente de correction manuelle par l'enseignant.
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-100 rounded-xl p-6 text-center text-gray-500">
            Les résultats ne sont pas encore disponibles.
          </div>
        )}

        {/* Détail par question */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> Détail par question
          </h2>
          <div className="space-y-3">
            {questions.map((q: any, i: number) => {
              const rep = q.reponseDonnee;
              const estCorrect = rep?.est_correcte;
              const isTexteLibre = q.type === "texte_libre";

              return (
                <Card key={q.id} className={`border-l-4 ${
                  isTexteLibre ? "border-l-yellow-400" :
                  estCorrect ? "border-l-green-400" : "border-l-red-400"
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        {isTexteLibre ? (
                          <HelpCircle className="w-5 h-5 text-yellow-500" />
                        ) : estCorrect ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">Q{i + 1}. {q.texte}</span>
                          <Badge variant="outline" className="text-xs">{TYPE_LABELS[q.type]}</Badge>
                          {rep && (
                            <span className={`text-xs font-medium ${estCorrect ? "text-green-600" : isTexteLibre ? "text-yellow-600" : "text-red-500"}`}>
                              {isTexteLibre ? "En attente" : estCorrect ? `+${rep.points_obtenus} pt${rep.points_obtenus > 1 ? "s" : ""}` : `0 / ${q.points} pt${q.points > 1 ? "s" : ""}`}
                            </span>
                          )}
                        </div>

                        {/* Réponse de l'étudiant */}
                        {rep && (
                          <div className="text-xs text-gray-600 mb-1">
                            <span className="font-medium">Votre réponse : </span>
                            {q.type === "texte_libre" && (
                              <span className="italic">{rep.reponse_texte || <em className="text-gray-400">Sans réponse</em>}</span>
                            )}
                            {q.type === "numerique" && (
                              <span>{rep.reponse_numerique ?? <em className="text-gray-400">Sans réponse</em>}</span>
                            )}
                            {(q.type !== "texte_libre" && q.type !== "numerique") && (
                              <span>
                                {(rep.reponse_ids ?? []).length === 0
                                  ? <em className="text-gray-400">Sans réponse</em>
                                  : (rep.reponse_ids ?? []).map((rid: number) => {
                                      const r = q.reponses?.find((r: any) => r.id === rid);
                                      return r?.texte ?? `#${rid}`;
                                    }).join(", ")}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Bonnes réponses (pour les questions objectives) */}
                        {!estCorrect && !isTexteLibre && q.reponses?.some((r: any) => r.est_correcte) && (
                          <div className="text-xs text-green-600">
                            <span className="font-medium">Bonne réponse : </span>
                            {q.reponses?.filter((r: any) => r.est_correcte).map((r: any) => r.texte).join(", ")}
                          </div>
                        )}
                        {q.type === "numerique" && !estCorrect && q.valeur_numerique != null && (
                          <div className="text-xs text-green-600">
                            <span className="font-medium">Valeur attendue : </span>
                            {q.valeur_numerique}
                            {q.tolerance_numerique > 0 && ` (±${q.tolerance_numerique})`}
                          </div>
                        )}

                        {/* Explication */}
                        {q.explication && (
                          <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                            💡 {q.explication}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
