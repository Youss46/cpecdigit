import { AppLayout } from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  User2, Plus, Trash2, Link, Unlink, Search, KeyRound, Phone, Mail,
  GraduationCap, Loader2, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) { const t = await res.text(); throw new Error(t || res.statusText); }
  try { return await res.json(); } catch { return {}; }
}

type ParentRow = {
  id: number; name: string; email: string; phone?: string; createdAt: string;
  students: Array<{ studentId: number; studentName: string; studentEmail: string }>;
};
type StudentRow = { id: number; name: string; email: string };

function useParents() {
  return useQuery<ParentRow[]>({
    queryKey: ["/api/admin/parents"],
    queryFn: () => apiFetch("/admin/parents"),
  });
}

function useStudents() {
  return useQuery<StudentRow[]>({
    queryKey: ["/api/admin/users-students"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users?role=student&pageSize=999", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.users ?? data ?? []) as StudentRow[];
    },
  });
}

// ─── Create parent dialog ─────────────────────────────────────────────────────
function CreateParentDialog({ onClose, students }: { onClose: () => void; students: StudentRow[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast({ title: "Champs requis", description: "Nom, email et mot de passe sont obligatoires.", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      await apiFetch("/admin/parents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, studentIds: selectedStudentIds }),
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/parents"] });
      toast({ title: "Compte parent créé", description: `${form.name} a été ajouté(e).` });
      onClose();
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const toggleStudent = (id: number) => setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouveau compte parent</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nom complet *</label>
              <Input autoComplete="off" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kouman Kouadio" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
              <Input type="email" autoComplete="off" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="parent@exemple.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Téléphone</label>
              <Input autoComplete="off" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+225 07 00 00 00 00" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mot de passe initial *</label>
              <Input type="password" autoComplete="new-password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Lier à des étudiants</label>
            <div className="border rounded-lg max-h-40 overflow-y-auto divide-y">
              {students.map(s => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer">
                  <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} className="rounded" />
                  <span className="text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{s.email}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span className="ml-1.5">Créer</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link student dialog ──────────────────────────────────────────────────────
function LinkStudentDialog({ parent, allStudents, onClose }: { parent: ParentRow; allStudents: StudentRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const linkedIds = parent.students.map(s => s.studentId);
  const available = allStudents.filter(s => !linkedIds.includes(s.id));

  const handleLink = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await apiFetch(`/admin/parents/${parent.id}/students/${selectedId}`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["/api/admin/parents"] });
      toast({ title: "Lien créé" });
      onClose();
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Lier un étudiant à {parent.name}</DialogTitle></DialogHeader>
        <div className="py-3 space-y-3">
          {!available.length ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Tous les étudiants sont déjà liés.</p>
          ) : (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un étudiant" /></SelectTrigger>
              <SelectContent>
                {available.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleLink} disabled={loading || !selectedId}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
            <span className="ml-1.5">Lier</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset password dialog ────────────────────────────────────────────────────
function ResetPasswordDialog({ parent, onClose }: { parent: ParentRow; onClose: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!password.trim()) return;
    setLoading(true);
    try {
      await apiFetch(`/admin/parents/${parent.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      toast({ title: "Mot de passe réinitialisé" });
      onClose();
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Réinitialiser le mot de passe — {parent.name}</DialogTitle></DialogHeader>
        <div className="py-3">
          <Input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nouveau mot de passe" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleReset} disabled={loading || !password.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            <span className="ml-1.5">Réinitialiser</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminParents() {
  const { data: parents = [], isLoading } = useParents();
  const { data: allStudents = [] } = useStudents();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [linkTarget, setLinkTarget] = useState<ParentRow | null>(null);
  const [resetTarget, setResetTarget] = useState<ParentRow | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = parents.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleUnlink = async (parentId: number, studentId: number) => {
    try {
      await apiFetch(`/admin/parents/${parentId}/students/${studentId}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/admin/parents"] });
      toast({ title: "Lien supprimé" });
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer le compte parent de ${name} ? Cette action est irréversible.`)) return;
    try {
      await apiFetch(`/admin/parents/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/admin/parents"] });
      toast({ title: "Compte supprimé" });
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><User2 className="w-6 h-6 text-orange-600" /> Gestion des Parents</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{parents.length} compte{parents.length !== 1 ? "s" : ""} parent enregistré{parents.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nouveau compte parent
          </Button>
        </motion.div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher par nom ou email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
        ) : !filtered.length ? (
          <Card><CardContent className="p-6 flex items-center gap-3 text-muted-foreground text-sm"><AlertCircle className="w-4 h-4" /> {search ? "Aucun résultat." : "Aucun compte parent. Créez-en un ci-dessus."}</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(parent => (
              <motion.div key={parent.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <User2 className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{parent.name}</p>
                        <div className="flex flex-wrap gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{parent.email}</span>
                          {parent.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{parent.phone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="gap-1 text-xs">
                          <GraduationCap className="w-3 h-3" />{parent.students.length} enfant{parent.students.length !== 1 ? "s" : ""}
                        </Badge>
                        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setExpanded(expanded === parent.id ? null : parent.id)}>
                          {expanded === parent.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          Détails
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setLinkTarget(parent)}>
                          <Link className="w-3 h-3" /> Lier
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setResetTarget(parent)}>
                          <KeyRound className="w-3 h-3" /> MDP
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(parent.id, parent.name)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {expanded === parent.id && (
                      <div className="mt-4 border-t pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Étudiants liés</p>
                        {!parent.students.length ? (
                          <p className="text-sm text-muted-foreground">Aucun étudiant lié.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {parent.students.map(s => (
                              <div key={s.studentId} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                                <GraduationCap className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">{s.studentName}</p>
                                  <p className="text-xs text-muted-foreground">{s.studentEmail}</p>
                                </div>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1" onClick={() => handleUnlink(parent.id, s.studentId)}>
                                  <Unlink className="w-3 h-3" /> Délier
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateParentDialog onClose={() => setShowCreate(false)} students={allStudents} />}
      {linkTarget && <LinkStudentDialog parent={linkTarget} allStudents={allStudents} onClose={() => setLinkTarget(null)} />}
      {resetTarget && <ResetPasswordDialog parent={resetTarget} onClose={() => setResetTarget(null)} />}
    </AppLayout>
  );
}
