import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject,
  useListTeachingUnits, useCreateTeachingUnit, useUpdateTeachingUnit, useDeleteTeachingUnit,
  useListClasses, useListSemesters, useGetCurrentUser,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, BookOpen, Layers, ChevronDown, ChevronRight, Award, FlaskConical, Globe2, Star, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

function resolveId(val: string): number | undefined {
  return val && val !== "none" ? parseInt(val) : undefined;
}

const UE_CATEGORIES = [
  { value: "culture_generale", label: "UE CULTURE GÉNÉRALE", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Globe2 },
  { value: "connaissances_fondamentales", label: "UE DE CONNAISSANCES FONDAMENTALES", color: "bg-amber-100 text-amber-800 border-amber-200", icon: FlaskConical },
  { value: "specialite", label: "UE DE SPÉCIALITÉ", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Star },
] as const;

type UeCategory = typeof UE_CATEGORIES[number]["value"];

function getCategoryMeta(cat?: string | null) {
  return UE_CATEGORIES.find(c => c.value === cat) ?? null;
}

type UEFormData = { code: string; name: string; category: string; coefficient: string; classId: string; semesterId: string };
type ECFormData = { name: string; coefficient: string; ueId: string; classId: string; semesterId: string };

const emptyUE: UEFormData = { code: "", name: "", category: "none", coefficient: "1", classId: "none", semesterId: "none" };
const emptyEC: ECFormData = { name: "", coefficient: "1", ueId: "none", classId: "none", semesterId: "none" };

export default function AdminSubjects() {
  const [filterClass, setFilterClass] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchSubject, setSearchSubject] = useState("");
  const [expandedUEs, setExpandedUEs] = useState<Set<number>>(new Set());

  const [isCreateUEOpen, setIsCreateUEOpen] = useState(false);
  const [editingUE, setEditingUE] = useState<any>(null);
  const [pendingDeleteUEId, setPendingDeleteUEId] = useState<number | null>(null);
  const [ueForm, setUeForm] = useState<UEFormData>(emptyUE);

  const [isCreateECOpen, setIsCreateECOpen] = useState(false);
  const [editingEC, setEditingEC] = useState<any>(null);
  const [pendingDeleteECId, setPendingDeleteECId] = useState<number | null>(null);
  const [ecForm, setEcForm] = useState<ECFormData>(emptyEC);
  const [defaultUeId, setDefaultUeId] = useState<string>("none");

  const { data: subjects = [], isLoading: subjectsLoading } = useListSubjects();
  const { data: teachingUnits = [], isLoading: uesLoading } = useListTeachingUnits({});
  const { data: classes = [] } = useListClasses();
  const { data: semesters = [] } = useListSemesters();
  const { data: currentUser } = useGetCurrentUser();
  const isScolarite = (currentUser as any)?.adminSubRole === "scolarite";

  const createUE = useCreateTeachingUnit();
  const updateUE = useUpdateTeachingUnit();
  const deleteUE = useDeleteTeachingUnit();
  const createEC = useCreateSubject();
  const updateEC = useUpdateSubject();
  const deleteEC = useDeleteSubject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/teaching-units"] });
  };

  const filteredUEs = useMemo(() => {
    if (!teachingUnits) return [];
    return (teachingUnits as any[]).filter((u: any) => {
      const matchClass = filterClass === "all" || String(u.classId ?? "none") === filterClass;
      const matchSem = filterSemester === "all" || String(u.semesterId ?? "none") === filterSemester;
      const matchCat = filterCategory === "all" || (u.category ?? "none") === filterCategory;
      const q = searchSubject.toLowerCase();
      const matchSearch = !q || u.name.toLowerCase().includes(q) || (u.code ?? "").toLowerCase().includes(q);
      return matchClass && matchSem && matchCat && matchSearch;
    });
  }, [teachingUnits, filterClass, filterSemester, filterCategory, searchSubject]);

  const filteredSubjects = useMemo(() => {
    if (!subjects) return [];
    return (subjects as any[]).filter((s: any) => {
      const matchClass = filterClass === "all" || String(s.classId ?? "none") === filterClass;
      const matchSem = filterSemester === "all" || String(s.semesterId ?? "none") === filterSemester;
      const q = searchSubject.toLowerCase();
      const matchSearch = !q || s.name.toLowerCase().includes(q);
      return matchClass && matchSem && matchSearch;
    });
  }, [subjects, filterClass, filterSemester, searchSubject]);

  const subjectsByUE = useMemo(() => {
    const map = new Map<number | null, any[]>();
    for (const s of filteredSubjects) {
      const key = s.ueId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [filteredSubjects]);

  const toggleUE = (id: number) => {
    setExpandedUEs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateUE = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUE.mutateAsync({ data: {
        code: ueForm.code,
        name: ueForm.name,
        category: ueForm.category !== "none" ? ueForm.category : null,
        coefficient: parseFloat(ueForm.coefficient),
        classId: resolveId(ueForm.classId) ?? null,
        semesterId: resolveId(ueForm.semesterId) ?? null,
      } as any });
      toast({ title: "UE créée" });
      invalidateAll();
      setIsCreateUEOpen(false);
      setUeForm(emptyUE);
    } catch { toast({ title: "Erreur lors de la création", variant: "destructive" }); }
  };

  const handleUpdateUE = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUE) return;
    try {
      await updateUE.mutateAsync({ id: editingUE.id, data: {
        code: ueForm.code, name: ueForm.name,
        category: ueForm.category !== "none" ? ueForm.category : null,
        coefficient: parseFloat(ueForm.coefficient),
        classId: resolveId(ueForm.classId) ?? null, semesterId: resolveId(ueForm.semesterId) ?? null,
      } as any });
      toast({ title: "UE modifiée" });
      invalidateAll();
      setEditingUE(null);
      setUeForm(emptyUE);
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleDeleteUE = async (id: number) => {
    try {
      await deleteUE.mutateAsync({ id });
      toast({ title: "UE supprimée" });
      invalidateAll();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleCreateEC = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEC.mutateAsync({ data: {
        name: ecForm.name,
        coefficient: parseFloat(ecForm.coefficient),
        ueId: resolveId(ecForm.ueId) ?? null,
        classId: resolveId(ecForm.classId) ?? null,
        semesterId: resolveId(ecForm.semesterId) ?? null,
      } as any });
      toast({ title: "ECUE créé" });
      invalidateAll();
      setIsCreateECOpen(false);
      setEcForm(emptyEC);
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleUpdateEC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEC) return;
    try {
      await updateEC.mutateAsync({ id: editingEC.id, data: {
        name: ecForm.name,
        coefficient: parseFloat(ecForm.coefficient),
        ueId: resolveId(ecForm.ueId) ?? null,
        classId: resolveId(ecForm.classId) ?? null,
        semesterId: resolveId(ecForm.semesterId) ?? null,
      } as any });
      toast({ title: "ECUE modifié" });
      invalidateAll();
      setEditingEC(null);
      setEcForm(emptyEC);
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleDeleteEC = async (id: number) => {
    try {
      await deleteEC.mutateAsync({ id });
      toast({ title: "ECUE supprimé" });
      invalidateAll();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const openEditUE = (ue: any) => {
    setEditingUE(ue);
    setUeForm({
      code: ue.code, name: ue.name,
      category: ue.category ?? "none",
      coefficient: String(ue.coefficient),
      classId: ue.classId ? String(ue.classId) : "none",
      semesterId: ue.semesterId ? String(ue.semesterId) : "none",
    });
  };

  const openEditEC = (ec: any) => {
    setEditingEC(ec);
    setEcForm({
      name: ec.name,
      coefficient: String(ec.coefficient),
      ueId: ec.ueId ? String(ec.ueId) : "none",
      classId: ec.classId ? String(ec.classId) : "none",
      semesterId: ec.semesterId ? String(ec.semesterId) : "none",
    });
  };

  const openAddEC = (ueId?: number) => {
    setEcForm({
      ...emptyEC,
      ueId: ueId ? String(ueId) : "none",
      classId: filterClass !== "all" ? filterClass : "none",
      semesterId: filterSemester !== "all" ? filterSemester : "none",
    });
    setIsCreateECOpen(true);
  };

  const ueFormJSX = (onSubmit: (e: React.FormEvent) => void, isPending: boolean) => (
    <form onSubmit={onSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Code UE</Label>
        <Input value={ueForm.code} onChange={e => setUeForm(f => ({ ...f, code: e.target.value }))} placeholder="ex: UE1" required />
      </div>
      <div className="space-y-2">
        <Label>Intitulé de l'UE</Label>
        <Input value={ueForm.name} onChange={e => setUeForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Fondamentaux Comptables" required />
      </div>
      <div className="space-y-2">
        <Label>Catégorie</Label>
        <Select value={ueForm.category} onValueChange={v => setUeForm(f => ({ ...f, category: v }))}>
          <SelectTrigger><SelectValue placeholder="Choisir une catégorie..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Sans catégorie —</SelectItem>
            {UE_CATEGORIES.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Coefficient de l'UE</Label>
        <Input type="number" step="0.5" min="0.5" max="10" value={ueForm.coefficient} onChange={e => setUeForm(f => ({ ...f, coefficient: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Classe</Label>
          <Select value={ueForm.classId} onValueChange={v => setUeForm(f => ({ ...f, classId: v }))}>
            <SelectTrigger><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Aucune —</SelectItem>
              {classes?.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Semestre</Label>
          <Select value={ueForm.semesterId} onValueChange={v => setUeForm(f => ({ ...f, semesterId: v }))}>
            <SelectTrigger><SelectValue placeholder="Tous les semestres" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Aucun —</SelectItem>
              {semesters?.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name} {s.academicYear ? `(${s.academicYear})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>{isPending ? "Enregistrement..." : "Enregistrer"}</Button>
    </form>
  );

  const ecFormJSX = (onSubmit: (e: React.FormEvent) => void, isPending: boolean) => (
    <form onSubmit={onSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Nom de l'ECUE (matière)</Label>
        <Input value={ecForm.name} onChange={e => setEcForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Comptabilité Générale" required />
      </div>
      <div className="space-y-2">
        <Label>Coefficient</Label>
        <Input type="number" step="0.5" min="0.5" max="10" value={ecForm.coefficient} onChange={e => setEcForm(f => ({ ...f, coefficient: e.target.value }))} required />
      </div>
      <div className="space-y-2">
        <Label>UE de rattachement <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
        <Select value={ecForm.ueId} onValueChange={v => setEcForm(f => ({ ...f, ueId: v }))}>
          <SelectTrigger><SelectValue placeholder="Sans UE" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Sans UE —</SelectItem>
            {(teachingUnits as any[]).map((u: any) => (
              <SelectItem key={u.id} value={u.id.toString()}>{u.code} – {u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Classe</Label>
          <Select value={ecForm.classId} onValueChange={v => setEcForm(f => ({ ...f, classId: v }))}>
            <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Aucune —</SelectItem>
              {classes?.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Semestre</Label>
          <Select value={ecForm.semesterId} onValueChange={v => setEcForm(f => ({ ...f, semesterId: v }))}>
            <SelectTrigger><SelectValue placeholder="Tous" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Aucun —</SelectItem>
              {semesters?.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name} {s.academicYear ? `(${s.academicYear})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>{isPending ? "Enregistrement..." : "Enregistrer"}</Button>
    </form>
  );

  const isLoading = subjectsLoading || uesLoading;
  const unassignedECs = subjectsByUE.get(null) ?? [];

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Matières — Système LMD</h1>
            <p className="text-muted-foreground">Organisation par UE (Unités d'Enseignement) et ECUE (Éléments Constitutifs d'UE).</p>
          </div>
          {!isScolarite && (
            <div className="flex gap-2">
              <Dialog open={isCreateUEOpen} onOpenChange={o => { setIsCreateUEOpen(o); if (!o) setUeForm(emptyUE); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="shadow-sm">
                    <Layers className="w-4 h-4 mr-2" /> Nouvelle UE
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Créer une Unité d'Enseignement</DialogTitle></DialogHeader>
                  {ueFormJSX(handleCreateUE, createUE.isPending)}
                </DialogContent>
              </Dialog>
              <Button className="shadow-md" onClick={() => openAddEC()}>
                <Plus className="w-4 h-4 mr-2" /> Nouvel ECUE
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger className="w-48 bg-card border-border">
              <SelectValue placeholder="Toutes les classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              {classes?.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSemester} onValueChange={setFilterSemester}>
            <SelectTrigger className="w-52 bg-card border-border">
              <SelectValue placeholder="Tous les semestres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les semestres</SelectItem>
              {semesters?.map((s: any) => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name} {s.academicYear ? `(${s.academicYear})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-64 bg-card border-border">
              <SelectValue placeholder="Toutes les catégories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {UE_CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Rechercher une matière ou UE..."
              value={searchSubject}
              onChange={e => setSearchSubject(e.target.value)}
              className="pl-9 w-60 bg-card border-border"
            />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-24 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
        ) : (
          <div className="space-y-4">
            {/* UE blocks */}
            {filteredUEs.length === 0 && filteredSubjects.length === 0 ? (
              <div className="bg-card rounded-2xl border border-dashed border-border flex flex-col items-center justify-center py-20 text-muted-foreground">
                <BookOpen className="w-12 h-12 opacity-20 mb-4" />
                <p className="font-medium text-lg">Aucune UE ni matière</p>
                <p className="text-sm">Créez d'abord des UE, puis ajoutez des ECUE.</p>
              </div>
            ) : (
              <>
                {filteredUEs.map((ue: any) => {
                  const ecs = subjectsByUE.get(ue.id) ?? [];
                  const isOpen = expandedUEs.has(ue.id);
                  return (
                    <div key={ue.id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                      <div
                        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                        onClick={() => toggleUE(ue.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-wrap">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-primary font-bold text-sm">{ue.code}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-foreground truncate">{ue.name}</p>
                            <p className="text-xs text-muted-foreground">{ecs.length} ECUE{ecs.length > 1 ? "s" : ""}</p>
                          </div>
                          {(() => {
                            const meta = getCategoryMeta(ue.category);
                            if (!meta) return null;
                            const Icon = meta.icon;
                            return (
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                                <Icon className="w-3 h-3" />
                                {meta.label}
                              </span>
                            );
                          })()}
                          {ue.className && <Badge variant="secondary" className="text-xs">{ue.className}</Badge>}
                          {ue.semesterName && <Badge variant="outline" className="text-xs">{ue.semesterName}</Badge>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          {!isScolarite && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openAddEC(ue.id); }}>
                                <Plus className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={e => { e.stopPropagation(); openEditUE(ue); }}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={e => { e.stopPropagation(); setPendingDeleteUEId(ue.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border">
                              {ecs.length === 0 ? (
                                <p className="px-6 py-4 text-sm text-muted-foreground italic">Aucun ECUE dans cette UE.</p>
                              ) : (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-secondary/20 text-muted-foreground text-xs uppercase tracking-wide">
                                      <th className="text-left px-6 py-2 pl-14">ECUE</th>
                                      <th className="text-center px-4 py-2">Coefficient</th>
                                      <th className="text-left px-4 py-2">Enseignant</th>
                                      {!isScolarite && <th className="w-16 py-2"></th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ecs.map((ec: any) => (
                                      <tr key={ec.id} className="border-t border-border/50 hover:bg-secondary/10">
                                        <td className="px-6 py-3 pl-14 font-semibold text-foreground">{ec.name}</td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-md text-xs">Coef. {ec.coefficient}</span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{ec.teacherName ?? <span className="italic opacity-50">Non assigné</span>}</td>
                                        {!isScolarite && (
                                          <td className="px-4 py-3">
                                            <div className="flex gap-1 justify-end">
                                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEC(ec)}>
                                                <Pencil className="w-3 h-3" />
                                              </Button>
                                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setPendingDeleteECId(ec.id)}>
                                                <Trash2 className="w-3 h-3" />
                                              </Button>
                                            </div>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* Unassigned ECs */}
                {unassignedECs.length > 0 && (
                  <div className="bg-card border border-dashed border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border/50 bg-secondary/10">
                      <p className="font-semibold text-muted-foreground text-sm">ECUE sans UE ({unassignedECs.length})</p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground text-xs uppercase tracking-wide bg-secondary/10">
                          <th className="text-left px-6 py-2">Matière</th>
                          <th className="text-center px-4 py-2">Coefficient</th>
                          <th className="text-left px-4 py-2">Classe</th>
                          <th className="text-left px-4 py-2">Semestre</th>
                          {!isScolarite && <th className="w-20 py-2"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {unassignedECs.map((ec: any) => (
                          <tr key={ec.id} className="border-t border-border/50 hover:bg-secondary/10">
                            <td className="px-6 py-3 font-semibold text-foreground">{ec.name}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="bg-secondary text-foreground font-bold px-2 py-0.5 rounded-md text-xs">Coef. {ec.coefficient}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{ec.className ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{ec.semesterName ?? "—"}</td>
                            {!isScolarite && (
                              <td className="px-4 py-3">
                                <div className="flex gap-1 justify-end">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEC(ec)}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setPendingDeleteECId(ec.id)}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit UE Dialog */}
      <Dialog open={!!editingUE} onOpenChange={o => { if (!o) { setEditingUE(null); setUeForm(emptyUE); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'UE</DialogTitle></DialogHeader>
          {ueFormJSX(handleUpdateUE, updateUE.isPending)}
        </DialogContent>
      </Dialog>

      {/* Create EC Dialog */}
      <Dialog open={isCreateECOpen} onOpenChange={o => { setIsCreateECOpen(o); if (!o) setEcForm(emptyEC); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Créer un ECUE</DialogTitle></DialogHeader>
          {ecFormJSX(handleCreateEC, createEC.isPending)}
        </DialogContent>
      </Dialog>

      {/* Edit EC Dialog */}
      <Dialog open={!!editingEC} onOpenChange={o => { if (!o) { setEditingEC(null); setEcForm(emptyEC); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'ECUE</DialogTitle></DialogHeader>
          {ecFormJSX(handleUpdateEC, updateEC.isPending)}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDeleteUEId !== null}
        onOpenChange={open => { if (!open) setPendingDeleteUEId(null); }}
        onConfirm={() => handleDeleteUE(pendingDeleteUEId!)}
        title="Supprimer l'UE"
        description="Cette action supprimera l'UE. Les EC rattachés ne seront pas supprimés mais perdront leur rattachement."
      />
      <ConfirmDialog
        open={pendingDeleteECId !== null}
        onOpenChange={open => { if (!open) setPendingDeleteECId(null); }}
        onConfirm={() => handleDeleteEC(pendingDeleteECId!)}
        title="Supprimer l'ECUE"
        description="Cette action est irréversible. L'ECUE et ses données associées seront supprimées."
      />
    </AppLayout>
  );
}
