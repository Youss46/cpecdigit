import { AppLayout } from "@/components/layout";
import { useListActivityLog } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText, CheckCircle, FileEdit, Globe, GlobeLock, Clock, Wallet, PlusCircle, Trash2 } from "lucide-react";

const ACTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  approbation_notes: {
    label: "Approbation",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  },
  derogation_note: {
    label: "Dérogation",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <FileEdit className="w-4 h-4 text-amber-500" />,
  },
  publication_resultats: {
    label: "Publication",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: <Globe className="w-4 h-4 text-blue-500" />,
  },
  depublication_resultats: {
    label: "Dépublication",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: <GlobeLock className="w-4 h-4 text-gray-500" />,
  },
  modification_frais_scolarite: {
    label: "Frais modifiés",
    color: "bg-indigo-100 text-indigo-700 border-indigo-200",
    icon: <Wallet className="w-4 h-4 text-indigo-500" />,
  },
  enregistrement_paiement: {
    label: "Paiement enregistré",
    color: "bg-green-100 text-green-700 border-green-200",
    icon: <PlusCircle className="w-4 h-4 text-green-500" />,
  },
  suppression_paiement: {
    label: "Paiement supprimé",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: <Trash2 className="w-4 h-4 text-red-500" />,
  },
  modification_honoraires: {
    label: "Honoraires modifiés",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    icon: <Wallet className="w-4 h-4 text-violet-500" />,
  },
  paiement_honoraires: {
    label: "Honoraires versés",
    color: "bg-teal-100 text-teal-700 border-teal-200",
    icon: <PlusCircle className="w-4 h-4 text-teal-500" />,
  },
  suppression_paiement_honoraires: {
    label: "Paiement honoraires supprimé",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    icon: <Trash2 className="w-4 h-4 text-orange-500" />,
  },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function ActivityLog() {
  const { data: entries = [], isLoading } = useListActivityLog();

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <ScrollText className="w-8 h-8 text-primary" />
            Journal d'Activité
          </h1>
          <p className="text-muted-foreground mt-1">
            Traçabilité complète des actions sensibles — approbations, dérogations, publications et opérations de scolarité.
          </p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Chargement du journal...</p>
        ) : (entries as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
            <ScrollText className="w-12 h-12 mb-4 opacity-20" />
            <p>Aucune activité enregistrée pour l'instant.</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[calc(100vh-13rem)] space-y-3 pr-2">
            {(entries as any[]).map((entry) => {
              const meta = ACTION_META[entry.action] ?? {
                label: entry.action,
                color: "bg-gray-100 text-gray-700 border-gray-200",
                icon: <Clock className="w-4 h-4 text-gray-400" />,
              };
              return (
                <Card key={entry.id} className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 bg-secondary rounded-xl shrink-0">
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">{entry.userName}</span>
                          <Badge variant="outline" className={`text-xs ${meta.color}`}>
                            {meta.label}
                          </Badge>
                        </div>
                        {entry.details && (
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed break-words">{entry.details}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{formatDate(entry.createdAt)}
                        </p>
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
