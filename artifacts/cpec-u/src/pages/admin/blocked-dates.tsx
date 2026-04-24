import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListBlockedDates, useCreateBlockedDate, useDeleteBlockedDate } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CalendarOff, Ban, Calendar, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";

const QK = ["/api/admin/blocked-dates"];

const TYPE_LABELS: Record<string, string> = {
  vacances: "Vacances",
  ferie: "Jour Férié",
  autre: "Autre",
};

const TYPE_COLORS: Record<string, string> = {
  vacances: "bg-blue-100 text-blue-700 border-blue-200",
  ferie: "bg-red-100 text-red-700 border-red-200",
  autre: "bg-gray-100 text-gray-700 border-gray-200",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function countDays(from: string, to: string): number {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export default function BlockedDates() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const { data: dates = [], isLoading } = useListBlockedDates();
  const createDate = useCreateBlockedDate();
  const deleteDate = useDeleteBlockedDate();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "period">("single");
  const [form, setForm] = useState({
    date: "",
    dateEnd: "",
    reason: "",
    type: "vacances" as "vacances" | "ferie" | "autre",
  });
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const resetForm = () => {
    setForm({ date: "", dateEnd: "", reason: "", type: "vacances" });
    setMode("single");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.reason) {
      toast({ title: "Remplissez tous les champs", variant: "destructive" });
      return;
    }
    if (mode === "period" && !form.dateEnd) {
      toast({ title: "Définissez une date de fin", variant: "destructive" });
      return;
    }
    if (mode === "period" && form.dateEnd < form.date) {
      toast({ title: "La date de fin doit être après la date de début", variant: "destructive" });
      return;
    }
    try {
      await createDate.mutateAsync({
        date: form.date,
        dateEnd: mode === "period" ? form.dateEnd : undefined,
        reason: form.reason,
        type: form.type,
      });
      toast({ title: mode === "period" ? "Période bloquée avec succès" : "Date bloquée avec succès" });
      invalidate();
      setIsOpen(false);
      resetForm();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDate.mutateAsync({ id });
      toast({ title: "Supprimé avec succès" });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const grouped = (dates as any[]).reduce((acc: Record<string, any[]>, d: any) => {
    const year = d.date.substring(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year].push(d);
    return acc;
  }, {});

  const isPeriod = (d: any) => !!d.dateEnd && d.dateEnd !== d.date;

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Vacances & Jours Fériés</h1>
            <p className="text-muted-foreground">Bloquez des dates ou des périodes pour empêcher la planification de cours.</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="shadow-md"><Ban className="w-4 h-4 mr-2" />Bloquer</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Bloquer une date ou une période</DialogTitle></DialogHeader>

              {/* Mode toggle */}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors",
                    mode === "single"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  <Calendar className="w-4 h-4" />
                  Jour unique
                </button>
                <button
                  type="button"
                  onClick={() => setMode("period")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors",
                    mode === "period"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  <CalendarRange className="w-4 h-4" />
                  Période
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                {mode === "single" ? (
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      required
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Date de début</Label>
                      <Input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date de fin</Label>
                      <Input
                        type="date"
                        value={form.dateEnd}
                        min={form.date || undefined}
                        onChange={(e) => setForm({ ...form, dateEnd: e.target.value })}
                        required
                      />
                    </div>
                    {form.date && form.dateEnd && form.dateEnd >= form.date && (
                      <div className="col-span-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                        Période de <strong>{countDays(form.date, form.dateEnd)} jour{countDays(form.date, form.dateEnd) > 1 ? "s" : ""}</strong> bloquée
                        : du {formatShort(form.date)} au {formatShort(form.dateEnd)}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vacances">Vacances</SelectItem>
                      <SelectItem value="ferie">Jour Férié</SelectItem>
                      <SelectItem value="autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Raison / Libellé</Label>
                  <Input
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="ex: Fête nationale, Vacances de Noël..."
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={createDate.isPending}>
                  {createDate.isPending ? "Enregistrement..." : mode === "period" ? "Bloquer la période" : "Bloquer la date"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Chargement...</p>
        ) : dates.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <CalendarOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Aucune date bloquée. Ajoutez des congés ou jours fériés.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([year, items]) => (
              <div key={year} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-secondary/40 px-5 py-3 border-b border-border">
                  <h2 className="font-semibold text-foreground">{year}</h2>
                </div>
                <div className="divide-y divide-border">
                  {(items as any[]).sort((a, b) => a.date.localeCompare(b.date)).map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-4">
                        {isPeriod(d) ? (
                          <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center shrink-0">
                            <CalendarRange className="w-6 h-6 text-blue-500" />
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-secondary flex flex-col items-center justify-center shrink-0">
                            <span className="text-xs text-muted-foreground font-medium uppercase">
                              {new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", { month: "short" })}
                            </span>
                            <span className="text-xl font-bold text-foreground leading-none">
                              {new Date(d.date + "T00:00:00").getDate().toString().padStart(2, "0")}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-foreground">{d.reason}</p>
                          {isPeriod(d) ? (
                            <p className="text-sm text-muted-foreground">
                              Du {formatShort(d.date)} au {formatShort(d.dateEnd)}
                              <span className="ml-2 text-xs text-blue-600 font-medium">
                                ({countDays(d.date, d.dateEnd)} jours)
                              </span>
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground capitalize">{formatDate(d.date)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={TYPE_COLORS[d.type]}>
                          {TYPE_LABELS[d.type]}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingDeleteId(d.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        onConfirm={() => handleDelete(pendingDeleteId!)}
        title="Supprimer la date / période bloquée"
        description="Cette période de vacances ou jour férié sera définitivement supprimée."
      />
    </AppLayout>
  );
}
