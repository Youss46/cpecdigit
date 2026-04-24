import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useListRooms, useCreateRoom, useUpdateRoom, useDeleteRoom } from "@workspace/api-client-react";
import { Plus, Pencil, Trash2, DoorOpen, Users, Building } from "lucide-react";

const ROOM_TYPES = ["Salle de cours", "Amphithéâtre", "Laboratoire", "Salle TD", "Salle de conférence"];

const typeColors: Record<string, string> = {
  "Amphithéâtre": "bg-purple-100 text-purple-700 border-purple-200",
  "Laboratoire": "bg-green-100 text-green-700 border-green-200",
  "Salle TD": "bg-blue-100 text-blue-700 border-blue-200",
  "Salle de cours": "bg-slate-100 text-slate-700 border-slate-200",
  "Salle de conférence": "bg-amber-100 text-amber-700 border-amber-200",
};

export default function AdminRooms() {
  const { toast } = useToast();
  const { data: rooms = [], isLoading, refetch } = useListRooms();
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const deleteRoom = useDeleteRoom();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any>(null);
  const [form, setForm] = useState({ name: "", capacity: "30", type: "Salle de cours", description: "" });
  const [pendingDeleteRoom, setPendingDeleteRoom] = useState<{ id: number; name: string } | null>(null);

  const resetForm = () => setForm({ name: "", capacity: "30", type: "Salle de cours", description: "" });

  const handleCreate = async () => {
    if (!form.name || !form.type || !form.capacity) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs obligatoires.", variant: "destructive" });
      return;
    }
    createRoom.mutate(
      { data: { name: form.name, capacity: parseInt(form.capacity), type: form.type, description: form.description || null } },
      {
        onSuccess: () => {
          toast({ title: "Salle créée", description: `La salle ${form.name} a été créée.` });
          resetForm();
          setIsCreateOpen(false);
          refetch();
        },
        onError: () => toast({ title: "Erreur", description: "Impossible de créer la salle.", variant: "destructive" }),
      }
    );
  };

  const handleUpdate = async () => {
    if (!editingRoom || !form.name || !form.type || !form.capacity) return;
    updateRoom.mutate(
      { roomId: editingRoom.id, data: { name: form.name, capacity: parseInt(form.capacity), type: form.type, description: form.description || null } },
      {
        onSuccess: () => {
          toast({ title: "Salle modifiée", description: "La salle a été mise à jour." });
          setEditingRoom(null);
          resetForm();
          refetch();
        },
        onError: () => toast({ title: "Erreur", description: "Impossible de modifier la salle.", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (room: any) => {
    deleteRoom.mutate(
      { roomId: room.id },
      {
        onSuccess: () => {
          toast({ title: "Salle supprimée" });
          refetch();
        },
        onError: () => toast({ title: "Erreur", description: "Impossible de supprimer la salle.", variant: "destructive" }),
      }
    );
  };

  const openEdit = (room: any) => {
    setEditingRoom(room);
    setForm({ name: room.name, capacity: String(room.capacity), type: room.type, description: room.description || "" });
  };

  const roomFormJSX = (onSubmit: () => void, isLoading: boolean) => (
    <div className="space-y-4">
      <div>
        <Label>Nom de la salle *</Label>
        <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Salle A101" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Capacité *</Label>
          <Input type="number" min="1" max="500" value={form.capacity} onChange={(e) => setForm(f => ({ ...f, capacity: e.target.value }))} />
        </div>
        <div>
          <Label>Type *</Label>
          <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROOM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="ex: Bâtiment A, 1er étage" />
      </div>
      <Button onClick={onSubmit} disabled={isLoading} className="w-full">
        {isLoading ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </div>
  );

  const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-serif tracking-tight">Gestion des Salles</h1>
            <p className="text-muted-foreground mt-1">Gérer les salles de cours, amphithéâtres et laboratoires</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle Salle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Créer une Salle</DialogTitle></DialogHeader>
              {roomFormJSX(handleCreate, createRoom.isPending)}
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Salles</CardDescription>
              <CardTitle className="text-3xl">{rooms.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <DoorOpen className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Capacité Totale</CardDescription>
              <CardTitle className="text-3xl">{totalCapacity}</CardTitle>
            </CardHeader>
            <CardContent>
              <Users className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Types Distincts</CardDescription>
              <CardTitle className="text-3xl">{new Set(rooms.map((r) => r.type)).size}</CardTitle>
            </CardHeader>
            <CardContent>
              <Building className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacité</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : rooms.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune salle enregistrée</TableCell></TableRow>
                ) : (
                  rooms.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="font-semibold">{room.name}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-1 rounded border ${typeColors[room.type] ?? "bg-slate-100 text-slate-700"}`}>
                          {room.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          {room.capacity} places
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{room.description ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Dialog open={editingRoom?.id === room.id} onOpenChange={(o) => { if (!o) setEditingRoom(null); }}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(room)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>Modifier la Salle</DialogTitle></DialogHeader>
                              {roomFormJSX(handleUpdate, updateRoom.isPending)}
                            </DialogContent>
                          </Dialog>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPendingDeleteRoom({ id: room.id, name: room.name })}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={pendingDeleteRoom !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteRoom(null); }}
        onConfirm={() => handleDelete(pendingDeleteRoom!)}
        title="Supprimer la salle"
        description={`Voulez-vous vraiment supprimer la salle "${pendingDeleteRoom?.name}" ? Cette action est irréversible.`}
      />
    </AppLayout>
  );
}
