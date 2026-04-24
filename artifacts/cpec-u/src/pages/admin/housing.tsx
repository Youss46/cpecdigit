import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Building2, BedDouble, Users, Plus, Pencil, Trash2, Home,
  CheckCircle2, Wrench, XCircle, Search, DoorOpen, CalendarDays, ArrowRightLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const text = await res.text();
    try { throw new Error(JSON.parse(text).error ?? text); } catch { throw new Error(text); }
  }
  return res.json();
}

const ROOM_TYPES = [
  { value: "simple", label: "Simple (1 pers.)" },
  { value: "double", label: "Double (2 pers.)" },
];

const ROOM_STATUSES = [
  { value: "available", label: "Disponible", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "occupied", label: "Occupée", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "maintenance", label: "Maintenance", color: "bg-orange-100 text-orange-700 border-orange-200" },
];

// Statuts autorisés uniquement à la création (pas "Occupée" — attribué automatiquement)
const CREATION_ROOM_STATUSES = ROOM_STATUSES.filter(s => s.value !== "occupied");

function StatusBadge({ status, occupantCount, capacity }: { status: string; occupantCount?: number; capacity?: number }) {
  // Show "Partielle" for double rooms with 1 occupant
  if (status === "available" && capacity && capacity > 1 && occupantCount && occupantCount > 0) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-yellow-100 text-yellow-700 border-yellow-200">
        Partielle ({occupantCount}/{capacity})
      </span>
    );
  }
  const s = ROOM_STATUSES.find(r => r.value === status);
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s?.color ?? "bg-muted text-muted-foreground border-border"}`}>
      {s?.label ?? status}
    </span>
  );
}

function AssignmentStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="bg-green-500 hover:bg-green-500">Active</Badge>;
  if (status === "ended") return <Badge variant="secondary">Terminée</Badge>;
  if (status === "cancelled") return <Badge variant="destructive">Annulée</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

// ─── Stats Dashboard ──────────────────────────────────────────────────────────
function StatsTab() {
  const { data: stats } = useQuery({
    queryKey: ["/api/housing/stats"],
    queryFn: () => apiFetch("/housing/stats"),
  });
  const s = stats as any;
  const occupancyRate = s?.totalRooms > 0 ? Math.round((s.occupied / s.totalRooms) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Bâtiments", value: s?.totalBuildings ?? 0, icon: Building2, color: "text-violet-600 bg-violet-50" },
          { label: "Total chambres", value: s?.totalRooms ?? 0, icon: BedDouble, color: "text-blue-600 bg-blue-50" },
          { label: "Disponibles", value: s?.available ?? 0, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "Occupées", value: s?.occupied ?? 0, icon: Home, color: "text-indigo-600 bg-indigo-50" },
          { label: "Maintenance", value: s?.maintenance ?? 0, icon: Wrench, color: "text-orange-600 bg-orange-50" },
          { label: "Taux d'occupation", value: `${occupancyRate}%`, icon: Users, color: "text-primary bg-primary/5" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {s?.totalRooms > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm font-semibold mb-3">Répartition des chambres</p>
          <div className="flex h-6 rounded-full overflow-hidden gap-0.5">
            {s.occupied > 0 && (
              <div
                style={{ width: `${(s.occupied / s.totalRooms) * 100}%` }}
                className="bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold"
              >
                {s.occupied > 0 && `${Math.round((s.occupied / s.totalRooms) * 100)}%`}
              </div>
            )}
            {s.available > 0 && (
              <div
                style={{ width: `${(s.available / s.totalRooms) * 100}%` }}
                className="bg-green-500 flex items-center justify-center text-[10px] text-white font-bold"
              >
                {s.available > 0 && `${Math.round((s.available / s.totalRooms) * 100)}%`}
              </div>
            )}
            {s.maintenance > 0 && (
              <div
                style={{ width: `${(s.maintenance / s.totalRooms) * 100}%` }}
                className="bg-orange-400 flex items-center justify-center text-[10px] text-white font-bold"
              />
            )}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Occupées</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Disponibles</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" /> Maintenance</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Buildings Tab ────────────────────────────────────────────────────────────
function BuildingsTab() {
  const { data: buildings = [], refetch } = useQuery({
    queryKey: ["/api/housing/buildings"],
    queryFn: () => apiFetch("/housing/buildings"),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", floors: "1" });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const { toast } = useToast();

  const openNew = () => { setEditing(null); setForm({ name: "", description: "", floors: "1" }); setOpen(true); };
  const openEdit = (b: any) => { setEditing(b); setForm({ name: b.name, description: b.description ?? "", floors: String(b.floors) }); setOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { name: form.name, description: form.description, floors: parseInt(form.floors) };
      if (editing) {
        await apiFetch(`/housing/buildings/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await apiFetch("/housing/buildings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setOpen(false);
      refetch();
      toast({ title: editing ? "Bâtiment modifié" : "Bâtiment créé" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (deleteConfirm === null) return;
    try {
      await apiFetch(`/housing/buildings/${deleteConfirm}`, { method: "DELETE" });
      refetch();
      toast({ title: "Bâtiment supprimé" });
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setDeleteConfirm(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Nouveau bâtiment</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(buildings as any[]).map((b: any) => (
          <div key={b.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.floors} étage{b.floors > 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(b)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(b.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            {b.description && <p className="text-sm text-muted-foreground">{b.description}</p>}
            <div className="flex gap-3 text-xs text-muted-foreground border-t border-border pt-3">
              <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {b.roomCount} chambre{b.roomCount !== 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1"><Home className="w-3.5 h-3.5 text-blue-500" /> {b.occupiedCount} occupée{b.occupiedCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
        ))}
        {(buildings as any[]).length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Aucun bâtiment. Commencez par en créer un.</p>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Modifier le bâtiment" : "Nouveau bâtiment"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5"><Label>Nom</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Résidence A" /></div>
            <div className="space-y-1.5"><Label>Nombre d'étages</Label><Input type="number" min={0} value={form.floors} onChange={e => setForm(f => ({ ...f, floors: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Description (optionnel)</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirm !== null} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce bâtiment ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible. Toutes les chambres associées seront également supprimées.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Rooms Tab ────────────────────────────────────────────────────────────────
function RoomsTab() {
  const { data: rooms = [], refetch } = useQuery({
    queryKey: ["/api/housing/rooms"],
    queryFn: () => apiFetch("/housing/rooms"),
  });
  const { data: buildings = [] } = useQuery({
    queryKey: ["/api/housing/buildings"],
    queryFn: () => apiFetch("/housing/buildings"),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ buildingId: "", roomNumber: "", floor: "0", capacity: "1", type: "simple", pricePerMonth: "0", status: "available", description: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const { toast } = useToast();

  const openNew = () => { setEditing(null); setForm({ buildingId: "", roomNumber: "", floor: "0", capacity: "1", type: "simple", pricePerMonth: "0", status: "available", description: "" }); setOpen(true); };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ buildingId: String(r.buildingId), roomNumber: r.roomNumber, floor: String(r.floor), capacity: String(r.capacity), type: r.type, pricePerMonth: String(r.pricePerMonth), status: r.status, description: r.description ?? "" });
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { ...form, buildingId: parseInt(form.buildingId), floor: parseInt(form.floor), capacity: parseInt(form.capacity), pricePerMonth: parseFloat(form.pricePerMonth) };
      if (editing) {
        await apiFetch(`/housing/rooms/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await apiFetch("/housing/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setOpen(false);
      refetch();
      toast({ title: editing ? "Chambre modifiée" : "Chambre créée" });
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (deleteConfirm === null) return;
    try {
      await apiFetch(`/housing/rooms/${deleteConfirm}`, { method: "DELETE" });
      refetch();
      toast({ title: "Chambre supprimée" });
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setDeleteConfirm(null); }
  };

  const filtered = (rooms as any[]).filter(r =>
    (filterStatus === "all" || r.status === filterStatus) &&
    (r.roomNumber.toLowerCase().includes(search.toLowerCase()) || r.buildingName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" /><Input placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-48 h-9" /></div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {ROOM_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Nouvelle chambre</Button>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border sticky top-0 z-10">
            <tr>
              {["Chambre", "Bâtiment", "Étage", "Type", "Capacité", "Prix/mois", "Statut", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r: any) => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-semibold">{r.roomNumber}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.buildingName}</td>
                <td className="px-4 py-3 text-muted-foreground">Ét. {r.floor}</td>
                <td className="px-4 py-3">{ROOM_TYPES.find(t => t.value === r.type)?.label ?? r.type}</td>
                <td className="px-4 py-3 text-center">
                  {r.type === "double" ? `${r.occupantCount ?? 0}/${r.capacity}` : r.capacity}
                </td>
                <td className="px-4 py-3 font-medium">{parseFloat(r.pricePerMonth).toLocaleString("fr-FR")} FCFA</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} occupantCount={r.occupantCount} capacity={r.capacity} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">Aucune chambre trouvée</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Modifier la chambre" : "Nouvelle chambre"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Bâtiment</Label>
              <Select value={form.buildingId} onValueChange={v => setForm(f => ({ ...f, buildingId: v }))}>
                <SelectTrigger><SelectValue placeholder="Choisir un bâtiment" /></SelectTrigger>
                <SelectContent>{(buildings as any[]).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>N° Chambre</Label><Input value={form.roomNumber} onChange={e => setForm(f => ({ ...f, roomNumber: e.target.value }))} placeholder="Ex: 101" /></div>
            <div className="space-y-1.5"><Label>Étage</Label><Input type="number" min={0} value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v, capacity: v === "double" ? "2" : "1" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROOM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Capacité</Label><Input type="number" min={1} max={form.type === "double" ? 2 : 1} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Prix/mois (FCFA)</Label><Input type="number" min={0} value={form.pricePerMonth} onChange={e => setForm(f => ({ ...f, pricePerMonth: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>Statut{!editing && <span className="ml-1 text-xs text-muted-foreground">(automatique si occupée)</span>}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(editing ? ROOM_STATUSES : CREATION_ROOM_STATUSES).map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>Description (optionnel)</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.buildingId || !form.roomNumber.trim()}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirm !== null} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette chambre ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible. Les affectations liées à cette chambre seront également supprimées.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Assignments Tab ──────────────────────────────────────────────────────────
function AssignmentsTab() {
  const queryClient = useQueryClient();
  const { data: assignments = [], refetch } = useQuery({
    queryKey: ["/api/housing/assignments"],
    queryFn: () => apiFetch("/housing/assignments"),
  });
  const { data: availableRooms = [] } = useQuery({
    queryKey: ["/api/housing/rooms/available"],
    queryFn: () => apiFetch("/housing/rooms/available"),
  });
  const { data: unassignedStudents = [] } = useQuery({
    queryKey: ["/api/housing/unassigned-students"],
    queryFn: () => apiFetch("/housing/unassigned-students"),
  });

  const [open, setOpen] = useState(false);
  const [endOpen, setEndOpen] = useState<any>(null);
  const [form, setForm] = useState({ studentId: "", roomId: "", startDate: new Date().toISOString().split("T")[0], endDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
  const studentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (studentRef.current && !studentRef.current.contains(e.target as Node)) {
        setStudentDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const { toast } = useToast();

  const filtered = (assignments as any[]).filter(a =>
    (filterStatus === "all" || a.status === filterStatus) &&
    (a.studentName.toLowerCase().includes(search.toLowerCase()) ||
      a.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
      a.buildingName.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCreate = async () => {
    setSaving(true);
    try {
      await apiFetch("/housing/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, endDate: form.endDate || undefined }),
      });
      setOpen(false);
      setForm({ studentId: "", roomId: "", startDate: new Date().toISOString().split("T")[0], endDate: "", notes: "" });
      setStudentSearch("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/housing/rooms/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/housing/unassigned-students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/housing/stats"] });
      toast({ title: "Chambre attribuée avec succès" });
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleEnd = async (a: any) => {
    try {
      await apiFetch(`/housing/assignments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended", endDate: new Date().toISOString().split("T")[0] }),
      });
      setEndOpen(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/housing/rooms/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/housing/unassigned-students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/housing/stats"] });
      toast({ title: "Hébergement terminé" });
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="flex gap-2">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" /><Input placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-48 h-9" /></div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="active">Actifs</SelectItem>
              <SelectItem value="ended">Terminés</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setForm({ studentId: "", roomId: "", startDate: new Date().toISOString().split("T")[0], endDate: "", notes: "" }); setStudentSearch(""); setOpen(true); }} className="gap-2"><Plus className="w-4 h-4" /> Attribuer une chambre</Button>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border sticky top-0 z-10">
            <tr>
              {["Étudiant", "Chambre", "Bâtiment", "Entrée", "Sortie", "Prix/mois", "Statut", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((a: any) => (
              <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{a.studentName}</p>
                  <p className="text-xs text-muted-foreground">{a.studentEmail}</p>
                </td>
                <td className="px-4 py-3 font-semibold">{a.roomNumber}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.buildingName}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.startDate}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.endDate ?? "—"}</td>
                <td className="px-4 py-3 font-medium">{parseFloat(a.pricePerMonth).toLocaleString("fr-FR")} FCFA</td>
                <td className="px-4 py-3"><AssignmentStatusBadge status={a.status} /></td>
                <td className="px-4 py-3">
                  {a.status === "active" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEndOpen(a)}>
                      <ArrowRightLeft className="w-3 h-3" /> Libérer
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">Aucune affectation trouvée</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Create assignment dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BedDouble className="w-5 h-5 text-primary" />Attribuer une chambre</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Étudiant</Label>
              <div ref={studentRef} className="relative">
                <Input
                  placeholder="Rechercher un étudiant…"
                  value={studentSearch}
                  onChange={e => {
                    setStudentSearch(e.target.value);
                    setStudentDropdownOpen(true);
                    if (!e.target.value) setForm(f => ({ ...f, studentId: "" }));
                  }}
                  onFocus={() => setStudentDropdownOpen(true)}
                  className={form.studentId ? "border-primary/60 bg-primary/5" : ""}
                />
                {studentDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-52 overflow-y-auto">
                    {(unassignedStudents as any[])
                      .filter((s: any) =>
                        s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                        s.email.toLowerCase().includes(studentSearch.toLowerCase())
                      )
                      .map((s: any) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2"
                          onMouseDown={() => {
                            setForm(f => ({ ...f, studentId: String(s.id) }));
                            setStudentSearch(s.name);
                            setStudentDropdownOpen(false);
                          }}
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="text-muted-foreground text-xs truncate">{s.email}</span>
                        </button>
                      ))}
                    {(unassignedStudents as any[]).filter((s: any) =>
                      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                      s.email.toLowerCase().includes(studentSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="text-sm text-muted-foreground px-3 py-3">Aucun étudiant trouvé</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Chambre disponible</Label>
              <Select value={form.roomId} onValueChange={v => setForm(f => ({ ...f, roomId: v }))}>
                <SelectTrigger><SelectValue placeholder="Choisir une chambre" /></SelectTrigger>
                <SelectContent className="max-h-52 overflow-y-auto">
                  {(availableRooms as any[]).map((r: any) => {
                    const spotsLeft = r.capacity - (r.occupantCount ?? 0);
                    const label = r.type === "double"
                      ? `${r.buildingName} — Ch. ${r.roomNumber} · Ét. ${r.floor} · Double (${spotsLeft} place${spotsLeft > 1 ? "s" : ""} libre${spotsLeft > 1 ? "s" : ""})`
                      : `${r.buildingName} — Ch. ${r.roomNumber} · Ét. ${r.floor} · Simple`;
                    return (
                      <SelectItem key={r.id} value={String(r.id)}>{label}</SelectItem>
                    );
                  })}
                  {(availableRooms as any[]).length === 0 && <div className="text-sm text-muted-foreground px-2 py-3">Aucune chambre disponible</div>}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Date d'entrée</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Date de sortie (opt.)</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notes (optionnel)</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={saving || !form.studentId || !form.roomId || !form.startDate}>{saving ? "Enregistrement…" : "Attribuer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End assignment dialog */}
      <Dialog open={!!endOpen} onOpenChange={v => !v && setEndOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Libérer la chambre</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            Voulez-vous marquer l'hébergement de <strong>{endOpen?.studentName}</strong> (Ch. {endOpen?.roomNumber}, {endOpen?.buildingName}) comme terminé ? La chambre redeviendra disponible.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEndOpen(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => handleEnd(endOpen)}>Libérer la chambre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HousingPage() {
  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-8 h-8 text-primary" />
            Gestion de l'Hébergement
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gérez les bâtiments, chambres et affectations des étudiants.</p>
        </div>

        <Tabs defaultValue="dashboard" onValueChange={() => window.scrollTo({ top: 0, behavior: "instant" })}>
          <TabsList className="mb-2">
            <TabsTrigger value="dashboard" className="gap-2"><Home className="w-3.5 h-3.5" />Tableau de bord</TabsTrigger>
            <TabsTrigger value="buildings" className="gap-2"><Building2 className="w-3.5 h-3.5" />Bâtiments</TabsTrigger>
            <TabsTrigger value="rooms" className="gap-2"><BedDouble className="w-3.5 h-3.5" />Chambres</TabsTrigger>
            <TabsTrigger value="assignments" className="gap-2"><Users className="w-3.5 h-3.5" />Affectations</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard"><StatsTab /></TabsContent>
          <TabsContent value="buildings"><BuildingsTab /></TabsContent>
          <TabsContent value="rooms"><RoomsTab /></TabsContent>
          <TabsContent value="assignments"><AssignmentsTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
