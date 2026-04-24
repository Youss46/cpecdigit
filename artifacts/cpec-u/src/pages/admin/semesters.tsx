import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListSemesters,
  useCreateSemester,
  usePublishSemesterResults,
  useGetCurrentUser,
  useUpdateSemester,
  useListClasses,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, CheckCircle, XCircle, CalendarDays, Pencil, Clock, CalendarCheck, CalendarOff, GraduationCap, BookOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";

type SemesterStatus = "en_cours" | "a_venir" | "termine" | "non_defini";

function getSemesterStatus(sem: any): SemesterStatus {
  if (!sem.startDate || !sem.endDate) return "non_defini";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(sem.startDate);
  const end = new Date(sem.endDate);
  if (today < start) return "a_venir";
  if (today > end) return "termine";
  return "en_cours";
}

const STATUS_CONFIG: Record<SemesterStatus, { label: string; icon: typeof Clock; color: string; dot: string }> = {
  en_cours:   { label: "En cours",    icon: CalendarCheck, color: "bg-blue-100 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  a_venir:    { label: "A venir",     icon: Clock,         color: "bg-amber-100 text-amber-700 border-amber-200",  dot: "bg-amber-400" },
  termine:    { label: "Termine",     icon: CalendarOff,   color: "bg-secondary text-muted-foreground border-border", dot: "bg-muted-foreground" },
  non_defini: { label: "Non defini",  icon: CalendarDays,  color: "bg-secondary text-muted-foreground border-border", dot: "bg-muted-foreground/50" },
};

const NIVEAU_MAP: Record<string, string> = {
  "1": "L1", "2": "L2", "3": "L3", "4": "M1", "5": "M2",
};

function deriveNiveauLmd(className: string): string {
  const lower = className.toLowerCase();
  if (lower.includes("licence 1") || lower.includes("l1")) return "L1";
  if (lower.includes("licence 2") || lower.includes("l2")) return "L2";
  if (lower.includes("licence 3") || lower.includes("l3")) return "L3";
  if (lower.includes("master 1") || lower.includes("m1")) return "M1";
  if (lower.includes("master 2") || lower.includes("m2")) return "M2";
  return "";
}

function getLmdSemesterLabel(niveauLmd: string, semesterNumber: number): string {
  const base: Record<string, number> = { L1: 0, L2: 2, L3: 4, M1: 6, M2: 8 };
  const offset = base[niveauLmd];
  if (offset === undefined) return `Semestre ${semesterNumber}`;
  return `Semestre ${offset + semesterNumber}`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "---";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

type SemesterFormValues = {
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  classId: string;
  semesterNumber: string;
  niveauLmd: string;
};

function SemesterForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  classes,
}: {
  defaultValues?: Partial<SemesterFormValues>;
  onSubmit: (values: SemesterFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  classes: Array<{ id: number; name: string; filiere: string | null }>;
}) {
  const [form, setForm] = useState<SemesterFormValues>({
    name: defaultValues?.name ?? "",
    academicYear: defaultValues?.academicYear ?? "",
    startDate: defaultValues?.startDate ?? "",
    endDate: defaultValues?.endDate ?? "",
    classId: defaultValues?.classId ?? "",
    semesterNumber: defaultValues?.semesterNumber ?? "",
    niveauLmd: defaultValues?.niveauLmd ?? "",
  });

  const set = (k: keyof SemesterFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleClassChange = (val: string) => {
    const cls = classes.find(c => String(c.id) === val);
    const niveau = cls ? deriveNiveauLmd(cls.name) : "";
    const autoName = form.semesterNumber && niveau
      ? getLmdSemesterLabel(niveau, parseInt(form.semesterNumber))
      : form.name;
    setForm(f => ({ ...f, classId: val, niveauLmd: niveau, name: autoName }));
  };

  const handleSemesterNumberChange = (val: string) => {
    const autoName = form.niveauLmd
      ? getLmdSemesterLabel(form.niveauLmd, parseInt(val))
      : form.name;
    setForm(f => ({ ...f, semesterNumber: val, name: autoName }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.startDate && form.endDate && form.endDate < form.startDate) return;
    onSubmit(form);
  };

  const dateError = form.startDate && form.endDate && form.endDate < form.startDate;
  const selectedClass = classes.find(c => String(c.id) === form.classId);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="space-y-2">
        <Label>Classe liee</Label>
        <Select value={form.classId} onValueChange={handleClassChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selectionner une classe" />
          </SelectTrigger>
          <SelectContent>
            {classes.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}{c.filiere ? ` — ${c.filiere}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>N. dans l'annee</Label>
          <Select value={form.semesterNumber} onValueChange={handleSemesterNumberChange}>
            <SelectTrigger>
              <SelectValue placeholder="N." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1er semestre</SelectItem>
              <SelectItem value="2">2eme semestre</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Niveau LMD</Label>
          <div className="h-9 flex items-center px-3 bg-secondary/60 rounded-md text-sm font-medium">
            {form.niveauLmd || "---"}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Nom du semestre</Label>
        <Input id="name" value={form.name} onChange={set("name")} placeholder="ex : Semestre 1" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="academicYear">Annee academique</Label>
        <Input id="academicYear" value={form.academicYear} onChange={set("academicYear")} placeholder="ex : 2024-2025" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="startDate">Date de debut</Label>
          <Input id="startDate" type="date" value={form.startDate} onChange={set("startDate")} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Date de fin</Label>
          <Input id="endDate" type="date" value={form.endDate} onChange={set("endDate")} min={form.startDate || undefined} required />
        </div>
      </div>
      {dateError && (
        <p className="text-xs text-destructive font-medium">La date de fin doit etre apres la date de debut.</p>
      )}
      <Button type="submit" className="w-full" disabled={isPending || !!dateError || !form.classId || !form.semesterNumber}>
        {isPending ? "Enregistrement..." : submitLabel}
      </Button>
    </form>
  );
}

interface SemesterWithClass {
  id: number;
  name: string;
  academicYear: string;
  published: boolean;
  startDate: string | null;
  endDate: string | null;
  classId: number | null;
  semesterNumber: number | null;
  niveauLmd: string | null;
  createdAt: string;
  className: string | null;
  classFiliere: string | null;
}

function SemesterSlot({
  sem,
  slotNumber,
  canPublish,
  onEdit,
  onPublish,
  onUnpublish,
  publishPending,
}: {
  sem: SemesterWithClass | null;
  slotNumber: number;
  canPublish: boolean;
  onEdit: (sem: SemesterWithClass) => void;
  onPublish: (id: number) => void;
  onUnpublish: (id: number) => void;
  publishPending: boolean;
}) {
  if (!sem) {
    return (
      <div className="border-2 border-dashed border-muted rounded-xl p-4 flex flex-col items-center justify-center text-muted-foreground min-h-[120px]">
        <BookOpen className="w-6 h-6 mb-2 opacity-30" />
        <p className="text-xs font-semibold">Semestre {slotNumber}</p>
        <p className="text-[10px]">Non cree</p>
      </div>
    );
  }

  const status = getSemesterStatus(sem);
  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;

  const pct = (() => {
    if (!sem.startDate || !sem.endDate) return 0;
    const start = new Date(sem.startDate).getTime();
    const end = new Date(sem.endDate).getTime();
    const now = Date.now();
    const total = end - start;
    if (total <= 0) return 0;
    return Math.round(Math.max(0, Math.min(now - start, total)) / total * 100);
  })();

  return (
    <div className={`border rounded-xl p-4 space-y-3 transition-all ${
      status === "en_cours" ? "border-blue-300 bg-blue-50/30" :
      sem.published ? "border-emerald-300 bg-emerald-50/20" :
      "border-border"
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-sm">{sem.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Badge className={`text-[10px] px-1.5 py-0 font-semibold border ${cfg.color}`}>
              <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
              {cfg.label}
            </Badge>
            {sem.published && (
              <Badge className="text-[10px] px-1.5 py-0 font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200">
                <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                Publie
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost" size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(sem)}
        >
          <Pencil className="w-3 h-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-secondary/40 rounded-lg px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Debut</p>
          <p className="font-semibold">{formatDate(sem.startDate)}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Fin</p>
          <p className="font-semibold">{formatDate(sem.endDate)}</p>
        </div>
      </div>

      {sem.startDate && sem.endDate && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{pct}% ecoule</span>
            {status === "en_cours" && (
              <span className="font-semibold text-blue-600">
                {Math.max(0, Math.ceil((new Date(sem.endDate).getTime() - Date.now()) / 86400000))} j. restants
              </span>
            )}
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                status === "en_cours" ? "bg-blue-500" :
                status === "termine" ? "bg-muted-foreground/40" : "bg-amber-400/30"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {canPublish && (
        <Button
          onClick={() => sem.published ? onUnpublish(sem.id) : onPublish(sem.id)}
          variant={sem.published ? "outline" : "default"}
          size="sm"
          className={`w-full text-xs font-bold ${
            sem.published
              ? "hover:bg-destructive hover:text-white border-destructive text-destructive"
              : "bg-primary hover:bg-primary/90"
          }`}
          disabled={publishPending}
        >
          {sem.published ? "Retirer" : "Publier les resultats"}
        </Button>
      )}
    </div>
  );
}

export default function AdminSemesters() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSem, setEditingSem] = useState<SemesterWithClass | null>(null);
  const [pendingUnpublishId, setPendingUnpublishId] = useState<number | null>(null);

  const { data: semesters = [], isLoading } = useListSemesters() as { data: SemesterWithClass[] | undefined; isLoading: boolean };
  const { data: classes = [] } = useListClasses() as { data: Array<{ id: number; name: string; filiere: string | null }> | undefined };
  const { data: currentUser } = useGetCurrentUser();
  const canPublish = (currentUser as any)?.adminSubRole !== "planificateur";

  const createSemester = useCreateSemester();
  const updateSemester = useUpdateSemester();
  const publishMutation = usePublishSemesterResults();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/semesters"] });

  const handleCreate = async (values: SemesterFormValues) => {
    try {
      await createSemester.mutateAsync({
        data: {
          ...values,
          classId: values.classId ? parseInt(values.classId) : undefined,
          semesterNumber: values.semesterNumber ? parseInt(values.semesterNumber) : undefined,
        } as any,
      });
      toast({ title: "Semestre cree" });
      invalidate();
      setIsCreateOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Erreur lors de la creation";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleUpdate = async (values: SemesterFormValues) => {
    if (!editingSem) return;
    try {
      await updateSemester.mutateAsync({
        id: editingSem.id,
        data: {
          ...values,
          classId: values.classId ? parseInt(values.classId) : undefined,
          semesterNumber: values.semesterNumber ? parseInt(values.semesterNumber) : undefined,
        } as any,
      });
      toast({ title: "Semestre mis a jour" });
      invalidate();
      setEditingSem(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Erreur lors de la mise a jour";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const doPublish = async (id: number, publish: boolean) => {
    try {
      await publishMutation.mutateAsync({ id, data: { published: publish } });
      toast({ title: `Resultats ${publish ? "publies" : "retires"} avec succes` });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, { className: string; classFiliere: string | null; classId: number; academicYear: string; niveauLmd: string; semesters: (SemesterWithClass | null)[] }>();
    const ungrouped: SemesterWithClass[] = [];

    for (const sem of semesters) {
      if (!sem.classId || !sem.className) {
        ungrouped.push(sem);
        continue;
      }
      const key = `${sem.classId}-${sem.academicYear}`;
      if (!map.has(key)) {
        map.set(key, {
          className: sem.className,
          classFiliere: sem.classFiliere,
          classId: sem.classId,
          academicYear: sem.academicYear,
          niveauLmd: sem.niveauLmd ?? "",
          semesters: [null, null],
        });
      }
      const group = map.get(key)!;
      const idx = (sem.semesterNumber ?? 1) - 1;
      if (idx >= 0 && idx < 2) group.semesters[idx] = sem;
    }

    const groups = [...map.values()].sort((a, b) => {
      if (a.academicYear !== b.academicYear) return b.academicYear.localeCompare(a.academicYear);
      return a.className.localeCompare(b.className);
    });

    return { groups, ungrouped };
  }, [semesters]);

  const pendingSemester = semesters.find(s => s.id === pendingUnpublishId);

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Semestres & Publications</h1>
            <p className="text-muted-foreground">Gerez les periodes academiques liees aux classes (referentiel LMD).</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md flex-shrink-0">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Semestre
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Creer un semestre</DialogTitle>
              </DialogHeader>
              <SemesterForm
                classes={classes}
                onSubmit={handleCreate}
                isPending={createSemester.isPending}
                submitLabel="Creer le semestre"
              />
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={!!editingSem} onOpenChange={(open) => { if (!open) setEditingSem(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Modifier le semestre</DialogTitle>
            </DialogHeader>
            {editingSem && (
              <SemesterForm
                classes={classes}
                defaultValues={{
                  name: editingSem.name,
                  academicYear: editingSem.academicYear,
                  startDate: editingSem.startDate ?? "",
                  endDate: editingSem.endDate ?? "",
                  classId: editingSem.classId ? String(editingSem.classId) : "",
                  semesterNumber: editingSem.semesterNumber ? String(editingSem.semesterNumber) : "",
                  niveauLmd: editingSem.niveauLmd ?? "",
                }}
                onSubmit={handleUpdate}
                isPending={updateSemester.isPending}
                submitLabel="Enregistrer les modifications"
              />
            )}
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : grouped.groups.length === 0 && grouped.ungrouped.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-2xl">
            <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">Aucun semestre cree</p>
            <p className="text-sm mt-1">Commencez par creer un semestre pour organiser l'annee academique.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.groups.map((g) => {
              const bothExist = g.semesters[0] !== null && g.semesters[1] !== null;
              const bothTermine = bothExist && g.semesters.every(s => s && getSemesterStatus(s) === "termine");

              return (
                <Card key={`${g.classId}-${g.academicYear}`} className="overflow-hidden border-2 transition-all">
                  <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-blue-700" />
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                          <GraduationCap className="w-5 h-5 text-blue-700" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">
                            {g.className}{g.classFiliere ? ` — ${g.classFiliere}` : ""}
                          </h3>
                          <p className="text-sm text-muted-foreground font-serif">{g.academicYear}</p>
                        </div>
                      </div>
                      {g.niveauLmd && (
                        <Badge className="text-xs font-bold bg-blue-100 text-blue-700 border-blue-200">
                          {g.niveauLmd}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SemesterSlot
                        sem={g.semesters[0]}
                        slotNumber={1}
                        canPublish={canPublish}
                        onEdit={setEditingSem}
                        onPublish={(id) => doPublish(id, true)}
                        onUnpublish={(id) => setPendingUnpublishId(id)}
                        publishPending={publishMutation.isPending}
                      />
                      <SemesterSlot
                        sem={g.semesters[1]}
                        slotNumber={2}
                        canPublish={canPublish}
                        onEdit={setEditingSem}
                        onPublish={(id) => doPublish(id, true)}
                        onUnpublish={(id) => setPendingUnpublishId(id)}
                        publishPending={publishMutation.isPending}
                      />
                    </div>

                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                      bothTermine
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-secondary/50 text-muted-foreground"
                    }`}>
                      {bothTermine ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          Moyenne annuelle calculable
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          Moyenne annuelle non calculable {!bothExist ? "(semestre manquant)" : "(semestres non termines)"}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {grouped.ungrouped.length > 0 && (
              <>
                <h2 className="text-lg font-bold text-muted-foreground mt-6">Semestres non lies a une classe</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {grouped.ungrouped.map((sem) => {
                    const status = getSemesterStatus(sem);
                    const cfg = STATUS_CONFIG[status];
                    const StatusIcon = cfg.icon;
                    return (
                      <Card key={sem.id} className="overflow-hidden border">
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold">{sem.name}</h3>
                              <p className="text-sm text-muted-foreground">{sem.academicYear}</p>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingSem(sem)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </div>
                          <Badge className={`text-[10px] px-1.5 py-0 font-semibold border ${cfg.color}`}>
                            <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                            {cfg.label}
                          </Badge>
                          <p className="text-xs text-amber-600 font-medium">
                            Ce semestre n'est lie a aucune classe. Modifiez-le pour l'associer.
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <ConfirmDialog
          open={pendingUnpublishId !== null}
          onOpenChange={(open) => { if (!open) setPendingUnpublishId(null); }}
          title="Retirer la publication des resultats ?"
          description={`Les etudiants n'auront plus acces aux resultats du semestre "${pendingSemester?.name ?? ""}" (${pendingSemester?.academicYear ?? ""}). Cette action est reversible.`}
          confirmLabel="Retirer la publication"
          onConfirm={() => {
            if (pendingUnpublishId !== null) doPublish(pendingUnpublishId, false);
            setPendingUnpublishId(null);
          }}
        />
      </div>
    </AppLayout>
  );
}
