import { useState, useMemo, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { useListAssignments, useCreateAssignment, useDeleteAssignment, useListUsers, useListClasses, useListSubjects, useListSemesters } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronsUpDown, Check, Clock, Pencil } from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type FormState = { teacherId: string; subjectId: string; classId: string; semesterId: string; plannedHours: string };
const emptyForm: FormState = { teacherId: "", subjectId: "", classId: "", semesterId: "", plannedHours: "30" };

async function patchAssignmentHours(id: number, plannedHours: number) {
  const res = await fetch(`/api/admin/assignments/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plannedHours }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function InlineHoursEditor({ id, initialHours, onSaved }: { id: number; initialHours: number; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(initialHours));
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (h: number) => patchAssignmentHours(id, h),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/assignments"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
      onSaved();
      setEditing(false);
    },
    onError: () => toast({ title: "Erreur lors de la mise à jour", variant: "destructive" }),
  });

  const commit = () => {
    const h = parseInt(value);
    if (isNaN(h) || h < 1) { setValue(String(initialHours)); setEditing(false); return; }
    if (h === initialHours) { setEditing(false); return; }
    mutation.mutate(h);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          type="number"
          min="1"
          max="500"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setValue(String(initialHours)); setEditing(false); } }}
          className="w-20 h-7 text-sm text-center px-2"
          autoFocus
          disabled={mutation.isPending}
        />
        <span className="text-xs text-muted-foreground">h</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(String(initialHours)); setEditing(true); }}
      className="group flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/60 transition-colors"
      title="Cliquer pour modifier le volume horaire"
    >
      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="font-semibold tabular-nums">{initialHours}h</span>
      <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

export default function AdminAssignments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);

  const { data: assignments, isLoading } = useListAssignments();
  const { data: users } = useListUsers({ role: "teacher" });
  const { data: classes } = useListClasses();
  const { data: subjects } = useListSubjects();
  const { data: semesters } = useListSemesters();

  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubjectSelect = (subjectId: string) => {
    const subject = (subjects as any[])?.find((s: any) => String(s.id) === subjectId);
    setForm(f => ({
      ...f,
      subjectId,
      classId: subject?.classId ? String(subject.classId) : f.classId,
      semesterId: subject?.semesterId ? String(subject.semesterId) : f.semesterId,
    }));
    setSubjectOpen(false);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.teacherId || !form.subjectId || !form.classId || !form.semesterId) {
      toast({ title: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }
    const hours = parseInt(form.plannedHours);
    if (isNaN(hours) || hours < 1) {
      toast({ title: "Volume horaire invalide (minimum 1 heure)", variant: "destructive" });
      return;
    }
    try {
      await createAssignment.mutateAsync({
        data: {
          teacherId: parseInt(form.teacherId),
          subjectId: parseInt(form.subjectId),
          classId: parseInt(form.classId),
          semesterId: parseInt(form.semesterId),
          plannedHours: hours,
        } as any
      });
      toast({ title: "Affectation créée" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
      setIsDialogOpen(false);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAssignment.mutateAsync({ id });
      toast({ title: "Affectation supprimée" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const selectedTeacher = useMemo(
    () => (users as any[])?.find((u: any) => String(u.id) === form.teacherId),
    [users, form.teacherId]
  );

  const selectedSubject = useMemo(
    () => (subjects as any[])?.find((s: any) => String(s.id) === form.subjectId),
    [subjects, form.subjectId]
  );

  const subjectsByClass = useMemo(() => {
    const allSubjects = (subjects as any[]) ?? [];
    const groups: Record<string, any[]> = {};
    for (const s of allSubjects) {
      const key = s.className ?? "Sans classe";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [subjects]);

  // Group assignments by teacher for summary stats
  const teacherStats = useMemo(() => {
    const stats: Record<string, { name: string; totalHours: number; count: number }> = {};
    for (const a of (assignments as any[]) ?? []) {
      if (!stats[a.teacherId]) stats[a.teacherId] = { name: a.teacherName, totalHours: 0, count: 0 };
      stats[a.teacherId].totalHours += a.plannedHours ?? 0;
      stats[a.teacherId].count++;
    }
    return stats;
  }, [assignments]);

  const totalHoursAll = Object.values(teacherStats).reduce((s, t) => s + t.totalHours, 0);

  const allTeachers = (users as any[]) ?? [];

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Affectations</h1>
            <p className="text-muted-foreground">Assignez les enseignants aux matières et définissez les volumes horaires.</p>
          </div>
          <div className="flex items-center gap-3">
            {totalHoursAll > 0 && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total volume horaire</p>
                <p className="text-lg font-bold text-primary">{totalHoursAll}h</p>
              </div>
            )}
            <Dialog open={isDialogOpen} onOpenChange={o => { setIsDialogOpen(o); if (!o) { setForm(emptyForm); setTeacherOpen(false); setSubjectOpen(false); } }}>
              <DialogTrigger asChild>
                <Button className="shadow-md shrink-0">
                  <Plus className="w-4 h-4 mr-2" />
                  Nouvelle Affectation
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Créer une affectation</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 mt-4">

                  {/* ── Enseignant combobox ── */}
                  <div className="space-y-2">
                    <Label>
                      Enseignant
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        ({allTeachers.length} au total)
                      </span>
                    </Label>
                    <Popover open={teacherOpen} onOpenChange={setTeacherOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={teacherOpen}
                          className="w-full justify-between font-normal"
                        >
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
                              {allTeachers.map((u: any) => (
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

                  {/* ── Matière combobox ── */}
                  <div className="space-y-2">
                    <Label>
                      Matière
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        ({(subjects as any[])?.length ?? 0} au total)
                      </span>
                    </Label>
                    <Popover open={subjectOpen} onOpenChange={setSubjectOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={subjectOpen}
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
                                {items.map((s: any) => (
                                  <CommandItem
                                    key={s.id}
                                    value={`${s.name} ${s.className ?? ""} ${s.ueName ?? ""} ${s.ueCode ?? ""}`}
                                    onSelect={() => handleSubjectSelect(String(s.id))}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4 shrink-0", form.subjectId === String(s.id) ? "opacity-100" : "opacity-0")} />
                                    <span className="flex-1 truncate">{s.name}</span>
                                    <span className="text-muted-foreground text-xs ml-2 shrink-0">
                                      {s.ueCode ?? s.ueName ? `${s.ueCode ?? s.ueName} · ` : ""}Coef. {s.coefficient}
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* ── Classe ── */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Classe
                      {form.classId && <span className="text-xs text-primary font-normal">(auto-rempli)</span>}
                    </Label>
                    <Select value={form.classId} onValueChange={v => setForm(f => ({ ...f, classId: v }))} required>
                      <SelectTrigger><SelectValue placeholder="Sélectionner une classe..." /></SelectTrigger>
                      <SelectContent>
                        {classes?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* ── Semestre ── */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Semestre
                      {form.semesterId && <span className="text-xs text-primary font-normal">(auto-rempli)</span>}
                    </Label>
                    <Select value={form.semesterId} onValueChange={v => setForm(f => ({ ...f, semesterId: v }))} required>
                      <SelectTrigger><SelectValue placeholder="Sélectionner un semestre..." /></SelectTrigger>
                      <SelectContent>
                        {semesters?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.academicYear})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* ── Volume horaire ── */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      Volume horaire prévu (heures)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="500"
                        value={form.plannedHours}
                        onChange={e => setForm(f => ({ ...f, plannedHours: e.target.value }))}
                        className="w-32"
                        required
                      />
                      <span className="text-sm text-muted-foreground">heures au total</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Utilisé pour le calcul automatique des honoraires (taux horaire × heures prévues).
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={createAssignment.isPending}>
                    {createAssignment.isPending ? "Création..." : "Affecter"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground">
            <Pencil className="w-3.5 h-3.5" />
            Cliquez sur le volume horaire dans le tableau pour le modifier directement.
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="bg-secondary/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Semestre</TableHead>
                  <TableHead>Enseignant</TableHead>
                  <TableHead>Matière</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead className="text-center">Volume horaire</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Chargement...</TableCell></TableRow>
                ) : (assignments as any[])?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune affectation.</TableCell></TableRow>
                ) : (
                  (assignments as any[])?.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="text-muted-foreground text-sm">{a.semesterName}</TableCell>
                      <TableCell className="font-bold text-primary">{a.teacherName}</TableCell>
                      <TableCell>
                        {a.subjectName}
                        <span className="text-xs text-muted-foreground ml-1">(Coef. {a.coefficient})</span>
                      </TableCell>
                      <TableCell>{a.className}</TableCell>
                      <TableCell className="text-center">
                        <InlineHoursEditor
                          id={a.id}
                          initialHours={a.plannedHours ?? 30}
                          onSaved={() => {}}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => setPendingDeleteId(a.id)}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        onConfirm={() => handleDelete(pendingDeleteId!)}
        title="Supprimer l'affectation"
        description="L'enseignant perdra l'accès à la saisie des notes pour cette configuration."
      />
    </AppLayout>
  );
}
