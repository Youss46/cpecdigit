import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListPlanningAssignments,
  useCreatePlanningAssignment,
  useUpdatePlanningAssignment,
  useDeletePlanningAssignment,
} from "@workspace/api-client-react";
import { useListUsers, useListSubjects, useListClasses, useListSemesters } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil, AlertCircle, CheckCircle, Lock, ChevronsUpDown, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const QK = ["/api/admin/teacher-assignments"];

export default function PlanningAssignments() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const { data: assignments = [], isLoading } = useListPlanningAssignments();
  const { data: allUsers = [] } = useListUsers();
  const { data: subjects = [] } = useListSubjects();
  const { data: classes = [] } = useListClasses();
  const { data: semesters = [] } = useListSemesters();

  const teachers = (allUsers as any[]).filter((u) => u.role === "teacher");

  const createAssign = useCreatePlanningAssignment();
  const updateAssign = useUpdatePlanningAssignment();
  const deleteAssign = useDeletePlanningAssignment();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [form, setForm] = useState({
    teacherId: "", subjectId: "", classId: "", semesterId: "", plannedHours: "30",
  });
  const [editHours, setEditHours] = useState("30");
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);

  const resetForm = () => {
    setForm({ teacherId: "", subjectId: "", classId: "", semesterId: "", plannedHours: "30" });
    setTeacherOpen(false);
    setSubjectOpen(false);
  };

  // ── Map: subjectId → assignment (for the selected semester) ──────────────
  const assignedBySubjectInSemester = useMemo(() => {
    if (!form.semesterId) return new Map<number, any>();
    const semId = parseInt(form.semesterId);
    const map = new Map<number, any>();
    (assignments as any[]).forEach((a) => {
      if (a.semesterId === semId) map.set(a.subjectId, a);
    });
    return map;
  }, [assignments, form.semesterId]);

  // Group subjects by class for the combobox
  const subjectsByClass = useMemo(() => {
    const allSubjects = (subjects as any[]);
    const groups: Record<string, any[]> = {};
    for (const s of allSubjects) {
      const key = s.className ?? "Sans classe";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [subjects]);

  const selectedTeacher = teachers.find((u: any) => String(u.id) === form.teacherId);
  const selectedSubject = (subjects as any[]).find((s: any) => String(s.id) === form.subjectId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.teacherId || !form.subjectId || !form.classId || !form.semesterId) {
      toast({ title: "Tous les champs sont requis", variant: "destructive" });
      return;
    }
    try {
      await createAssign.mutateAsync({
        teacherId: parseInt(form.teacherId),
        subjectId: parseInt(form.subjectId),
        classId: parseInt(form.classId),
        semesterId: parseInt(form.semesterId),
        plannedHours: parseInt(form.plannedHours),
      });
      toast({ title: "Affectation créée avec succès" });
      invalidate();
      setIsCreateOpen(false);
      resetForm();
    } catch (err: any) {
      const msg = err?.data?.message ?? err?.message ?? "Erreur lors de la création de l'affectation.";
      toast({ title: "Affectation impossible", description: msg, variant: "destructive" });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await updateAssign.mutateAsync({ id: editingItem.id, plannedHours: parseInt(editHours) });
      toast({ title: "Volume horaire mis à jour" });
      invalidate();
      setEditingItem(null);
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAssign.mutateAsync({ id });
      toast({ title: "Affectation supprimée" });
      invalidate();
      setPendingDelete(null);
    } catch {
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Affectations & Volumes Horaires</h1>
            <p className="text-muted-foreground">Définissez quel enseignant donne quelle matière et suivez le volume horaire.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="shadow-md"><Plus className="w-4 h-4 mr-2" />Nouvelle Affectation</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Créer une affectation</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">

                {/* ── Enseignant combobox ── */}
                <div className="space-y-2">
                  <Label>
                    Enseignant
                    <span className="ml-2 text-xs text-muted-foreground font-normal">({teachers.length} au total)</span>
                  </Label>
                  <Popover open={teacherOpen} onOpenChange={setTeacherOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={teacherOpen} className="w-full justify-between font-normal">
                        <span className={cn("truncate", !selectedTeacher && "text-muted-foreground")}>
                          {selectedTeacher ? selectedTeacher.name : "Rechercher un enseignant..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Nom ou email..." />
                        <CommandList>
                          <CommandEmpty>Aucun enseignant trouvé.</CommandEmpty>
                          <CommandGroup>
                            {teachers.map((u: any) => (
                              <CommandItem
                                key={u.id}
                                value={`${u.name} ${u.email ?? ""}`}
                                onSelect={() => { setForm(f => ({ ...f, teacherId: String(u.id) })); setTeacherOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4 shrink-0", form.teacherId === String(u.id) ? "opacity-100" : "opacity-0")} />
                                <span className="flex-1 truncate">{u.name}</span>
                                {u.email && <span className="text-muted-foreground text-xs ml-2 truncate">{u.email}</span>}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* ── Semestre (avant Matière pour alimenter le filtre) ── */}
                <div className="space-y-2">
                  <Label>Semestre</Label>
                  <Select value={form.semesterId} onValueChange={(v) => setForm(f => ({ ...f, semesterId: v, subjectId: "" }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir un semestre" /></SelectTrigger>
                    <SelectContent>
                      {(semesters as any[]).map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* ── Matière combobox ── */}
                <div className="space-y-2">
                  <Label>
                    Matière
                    <span className="ml-2 text-xs text-muted-foreground font-normal">({(subjects as any[]).length} au total)</span>
                  </Label>
                  {!form.semesterId && (
                    <p className="text-xs text-muted-foreground italic">Sélectionnez d'abord un semestre pour voir la disponibilité des matières.</p>
                  )}
                  <Popover open={subjectOpen} onOpenChange={v => { if (form.semesterId) setSubjectOpen(v); }}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={subjectOpen}
                        disabled={!form.semesterId}
                        className="w-full justify-between font-normal"
                      >
                        <span className={cn("truncate", !selectedSubject && "text-muted-foreground")}>
                          {selectedSubject
                            ? `${selectedSubject.name}${selectedSubject.className ? ` — ${selectedSubject.className}` : ""}`
                            : "Rechercher une matière..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Nom, classe ou UE..." />
                        <CommandList className="max-h-56">
                          <CommandEmpty>Aucune matière trouvée.</CommandEmpty>
                          {subjectsByClass.map(([className, items]) => (
                            <CommandGroup key={className} heading={className}>
                              {items.map((s: any) => {
                                const existing = assignedBySubjectInSemester.get(s.id);
                                const isLocked = !!existing;
                                return (
                                  <CommandItem
                                    key={s.id}
                                    value={`${s.name} ${s.className ?? ""} ${s.ueName ?? ""} ${s.ueCode ?? ""}`}
                                    disabled={isLocked}
                                    onSelect={() => {
                                      if (isLocked) return;
                                      setForm(f => ({ ...f, subjectId: String(s.id) }));
                                      setSubjectOpen(false);
                                    }}
                                    className={isLocked ? "opacity-50" : ""}
                                  >
                                    {isLocked
                                      ? <Lock className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                      : <Check className={cn("mr-2 h-4 w-4 shrink-0", form.subjectId === String(s.id) ? "opacity-100" : "opacity-0")} />
                                    }
                                    <span className="flex-1 truncate">{s.name}</span>
                                    {isLocked
                                      ? <span className="text-muted-foreground text-xs ml-2 shrink-0">{existing.teacherName}</span>
                                      : <span className="text-muted-foreground text-xs ml-2 shrink-0">
                                          {s.ueCode ?? s.ueName ? `${s.ueCode ?? s.ueName} · ` : ""}Coef. {s.coefficient}
                                        </span>
                                    }
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* Avertissement si la matière sélectionnée est déjà attribuée */}
                  {form.subjectId && assignedBySubjectInSemester.has(parseInt(form.subjectId)) && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Cette matière est déjà attribuée à {assignedBySubjectInSemester.get(parseInt(form.subjectId))?.teacherName}.
                    </p>
                  )}
                </div>

                {/* ── Classe ── */}
                <div className="space-y-2">
                  <Label>Classe</Label>
                  <Select value={form.classId} onValueChange={(v) => setForm(f => ({ ...f, classId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
                    <SelectContent>
                      {(classes as any[]).map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* ── Volume horaire ── */}
                <div className="space-y-2">
                  <Label>Volume horaire prévu (heures)</Label>
                  <Input type="number" min="1" max="200" value={form.plannedHours}
                    onChange={(e) => setForm(f => ({ ...f, plannedHours: e.target.value }))} />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    createAssign.isPending ||
                    !form.teacherId || !form.subjectId || !form.classId || !form.semesterId ||
                    assignedBySubjectInSemester.has(parseInt(form.subjectId || "0"))
                  }
                >
                  {createAssign.isPending ? "Création..." : "Créer l'affectation"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Légende ── */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            Matière déjà attribuée (non sélectionnable)
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 text-amber-500" />
            Heures restantes
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-green-500" />
            Volume complété
          </span>
        </div>

        {/* ── Edit dialog ── */}
        <Dialog open={!!editingItem} onOpenChange={(o) => { if (!o) setEditingItem(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Modifier le volume horaire</DialogTitle></DialogHeader>
            <form onSubmit={handleUpdate} className="space-y-4 mt-4">
              {editingItem && (
                <p className="text-muted-foreground text-sm">
                  {editingItem.teacherName} — {editingItem.subjectName} ({editingItem.className})
                </p>
              )}
              <div className="space-y-2">
                <Label>Heures prévues</Label>
                <Input type="number" min="1" max="200" value={editHours}
                  onChange={(e) => setEditHours(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={updateAssign.isPending}>Enregistrer</Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Tableau des affectations ── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead>Enseignant</TableHead>
                <TableHead>Matière</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Semestre</TableHead>
                <TableHead>Volume Horaire</TableHead>
                <TableHead className="text-center">Heures restantes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
              ) : (assignments as any[]).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucune affectation.</TableCell></TableRow>
              ) : (
                (assignments as any[]).map((a: any) => {
                  const pct = Math.min(100, Math.round((a.completedHours / a.plannedHours) * 100));
                  const isComplete = a.completedHours >= a.plannedHours;
                  const remaining = Math.max(0, a.plannedHours - a.completedHours);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-semibold">{a.teacherName}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {a.subjectName}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
                            1 enseignant
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell>{a.className}</TableCell>
                      <TableCell className="text-muted-foreground">{a.semesterName}</TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="flex items-center gap-2">
                          {isComplete
                            ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                            : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                          <div className="flex-1 space-y-1">
                            <Progress value={pct} className="h-2" />
                            <p className="text-xs text-muted-foreground">{a.completedHours}h / {a.plannedHours}h ({pct}%)</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {isComplete ? (
                          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Terminé</span>
                        ) : (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${remaining > 0 ? "text-amber-700 bg-amber-50" : "text-muted-foreground bg-muted"}`}>
                            {remaining}h
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground"
                            onClick={() => { setEditingItem(a); setEditHours(String(a.plannedHours)); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10"
                            onClick={() => setPendingDelete(a)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        onConfirm={() => handleDelete(pendingDelete!.id)}
        title="Retirer l'affectation"
        description={
          pendingDelete
            ? `Êtes-vous sûr de vouloir retirer ${pendingDelete.teacherName} de la matière "${pendingDelete.subjectName}" (${pendingDelete.semesterName}) ? Cette action libérera la matière pour une nouvelle affectation.`
            : "Cette action est irréversible."
        }
        confirmLabel="Retirer"
      />
    </AppLayout>
  );
}
