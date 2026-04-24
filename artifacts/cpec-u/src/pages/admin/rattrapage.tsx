import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Lock, Plus, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useListSemesters } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RetakeSession = {
  id: number;
  label: string;
  status: "open" | "closed";
  semesterId: number;
  semesterName: string;
  createdByName: string;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
};

type RetakeGradeRow = {
  id: number;
  studentId: number;
  studentName: string;
  subjectId: number;
  subjectName: string;
  teacherId: number;
  value: number | null;
  observation: string | null;
  submissionStatus: "draft" | "submitted" | "validated";
  submittedAt: string | null;
  validatedAt: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === "validated") return <Badge className="bg-green-600 text-white">Validé</Badge>;
  if (status === "submitted") return <Badge className="bg-blue-600 text-white">En attente</Badge>;
  return <Badge variant="outline">Brouillon</Badge>;
}

function sessionStatusBadge(status: "open" | "closed") {
  if (status === "open") return <Badge className="bg-emerald-600 text-white">Ouverte</Badge>;
  return <Badge variant="secondary">Clôturée</Badge>;
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({ session, onClose, onValidate }: {
  session: RetakeSession;
  onClose: (id: number) => void;
  onValidate: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: grades = [], refetch } = useQuery<RetakeGradeRow[]>({
    queryKey: ["admin-retake-grades", session.id],
    queryFn: () => customFetch<RetakeGradeRow[]>(`/api/admin/retake-sessions/${session.id}/grades`),
    enabled: expanded,
  });

  const submittedGrades = grades.filter(g => g.submissionStatus === "submitted");
  const validatedGrades = grades.filter(g => g.submissionStatus === "validated");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 cursor-pointer" onClick={() => setExpanded(e => !e)}>
            <div className="flex items-center gap-2">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <CardTitle className="text-base">{session.label}</CardTitle>
              {sessionStatusBadge(session.status)}
            </div>
            <CardDescription className="ml-6 mt-0.5">
              {session.semesterName} — Créée par {session.createdByName} le{" "}
              {format(new Date(session.createdAt), "dd MMM yyyy", { locale: fr })}
              {session.closedAt && ` — Clôturée le ${format(new Date(session.closedAt), "dd MMM yyyy", { locale: fr })}`}
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            {session.status === "open" && (
              <Button size="sm" variant="outline" onClick={() => onClose(session.id)} className="gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Clôturer
              </Button>
            )}
            {submittedGrades.length > 0 && (
              <Button size="sm" onClick={() => onValidate(session.id)} className="gap-1.5 bg-green-700 hover:bg-green-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Valider ({submittedGrades.length})
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setExpanded(true); refetch(); }}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {grades.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune note saisie pour cette session.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                <span>Total : {grades.length} note(s)</span>
                <span className="text-blue-600">En attente : {submittedGrades.length}</span>
                <span className="text-green-600">Validées : {validatedGrades.length}</span>
                <span>Brouillons : {grades.length - submittedGrades.length - validatedGrades.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Étudiant</th>
                      <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Matière</th>
                      <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Note</th>
                      <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Observation</th>
                      <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Soumis le</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grades.map(g => (
                      <tr key={g.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{g.studentName}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{g.subjectName}</td>
                        <td className="py-2 pr-3">
                          {g.value !== null && g.value !== undefined ? (
                            <span className={g.value >= 10 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                              {g.value}/20
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground text-xs">{g.observation ?? "—"}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {g.submittedAt ? format(new Date(g.submittedAt), "dd MMM yyyy HH:mm", { locale: fr }) : "—"}
                        </td>
                        <td className="py-2">{statusBadge(g.submissionStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminRattrapage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newSemesterId, setNewSemesterId] = useState<string>("");

  const { data: sessions = [], isLoading } = useQuery<RetakeSession[]>({
    queryKey: ["admin-retake-sessions"],
    queryFn: () => customFetch<RetakeSession[]>("/api/admin/retake-sessions"),
  });

  const { data: semesters = [] } = useListSemesters();

  const createSession = useMutation({
    mutationFn: (body: { label: string; semesterId: number }) =>
      customFetch<RetakeSession>("/api/admin/retake-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-retake-sessions"] });
      setShowCreate(false);
      setNewLabel("");
      setNewSemesterId("");
      toast({ title: "Session créée", description: "Les enseignants concernés ont été notifiés." });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const closeSession = useMutation({
    mutationFn: (id: number) =>
      customFetch<RetakeSession>(`/api/admin/retake-sessions/${id}/close`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-retake-sessions"] });
      toast({ title: "Session clôturée", description: "Les enseignants ont été notifiés." });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const validateGrades = useMutation({
    mutationFn: (id: number) =>
      customFetch<{ validated: number }>(`/api/admin/retake-sessions/${id}/validate`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-retake-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-retake-grades"] });
      toast({ title: "Notes validées", description: `${data.validated} note(s) validée(s) et publiées sur les bulletins.` });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const openSessions = sessions.filter(s => s.status === "open");
  const closedSessions = sessions.filter(s => s.status === "closed");

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="h-screen overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Gestion des Rattrapages</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Créez et gérez les sessions de rattrapage, validez les notes soumises par les enseignants
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Ouvrir une session
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">Chargement...</div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="rounded-full bg-muted p-6">
                <AlertCircle className="w-10 h-10 text-muted-foreground" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold">Aucune session de rattrapage</h2>
                <p className="text-muted-foreground text-sm mt-1 max-w-md">
                  Créez une session de rattrapage pour permettre aux enseignants de saisir les notes.
                </p>
              </div>
            </div>
          ) : (
            <>
              {openSessions.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sessions ouvertes</h2>
                  <div className="space-y-3">
                    {openSessions.map(s => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        onClose={id => closeSession.mutate(id)}
                        onValidate={id => validateGrades.mutate(id)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {closedSessions.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sessions clôturées</h2>
                  <div className="space-y-3">
                    {closedSessions.map(s => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        onClose={id => closeSession.mutate(id)}
                        onValidate={id => validateGrades.mutate(id)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Session Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ouvrir une session de rattrapage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="session-label">Libellé de la session</Label>
              <Input
                id="session-label"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Ex : Rattrapage Semestre 1 – 2025"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Semestre concerné</Label>
              <Select value={newSemesterId} onValueChange={setNewSemesterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un semestre…" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Une notification sera envoyée à tous les enseignants du semestre sélectionné.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button
              onClick={() => createSession.mutate({ label: newLabel, semesterId: parseInt(newSemesterId) })}
              disabled={!newLabel.trim() || !newSemesterId || createSession.isPending}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Créer et notifier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
