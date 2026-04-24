import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useOfflineQuery } from "@/hooks/use-offline-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BookText, Search, BookOpen, User, Clock, AlertTriangle, WifiOff } from "lucide-react";

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default function StudentCahierDeTexte() {
  const [search, setSearch] = useState("");

  const { data: entries = [], isLoading, isFromCache } = useOfflineQuery<any[]>({
    queryKey: ["/api/student/cahier-de-texte"],
    queryFn: () => apiFetch("/student/cahier-de-texte"),
    cacheKey: "student:cahier-de-texte",
    refetchInterval: 60_000,
  });

  const rows = (entries as any[]).filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.title?.toLowerCase().includes(q) ||
      e.subjectName?.toLowerCase().includes(q) ||
      e.teacherName?.toLowerCase().includes(q) ||
      e.contenu?.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
              <BookText className="w-8 h-8 text-primary" />
              Cahier de texte
            </h1>
            {isFromCache && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <WifiOff className="w-3 h-3" /> cache
              </span>
            )}
          </div>
          <p className="text-muted-foreground">
            Séances et travaux enregistrés par vos enseignants.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par matière, titre ou enseignant…"
            className="pl-9"
          />
        </div>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 bg-muted animate-pulse rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <BookText className="w-12 h-12 opacity-20" />
            <p className="text-base font-medium">
              {search ? "Aucune séance ne correspond à votre recherche." : "Aucune séance enregistrée pour votre classe."}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {rows.map((entry: any) => (
            <Card key={entry.id} className="border-border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-medium text-xs">
                      <BookOpen className="w-3 h-3 mr-1" />
                      {entry.subjectName}
                    </Badge>
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {entry.semesterName}
                    </Badge>
                    {entry.heuresEffectuees > 0 && (
                      <Badge className="bg-primary/10 text-primary border-0 text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        {entry.heuresEffectuees}h
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground capitalize">{fmtDate(entry.sessionDate)}</span>
                </div>

                {entry.title && (
                  <h3 className="font-semibold text-foreground mb-1">{entry.title}</h3>
                )}

                {entry.contenu && (
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed mb-3">
                    {entry.contenu}
                  </p>
                )}

                {entry.devoirs && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-0.5">Travaux à faire</p>
                      <p className="text-sm text-amber-900 dark:text-amber-300 whitespace-pre-wrap">{entry.devoirs}</p>
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  {entry.teacherName}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
