import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, CalendarClock, BarChart3, Plus, Trash2, CheckCircle2,
  Clock, AlertTriangle, XCircle, ChevronRight, Users, TrendingUp,
  Check, RefreshCw, Info,
} from "lucide-react";

function fmt(n: number) {
  return n.toLocaleString("fr-FR");
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Erreur" }));
    throw new Error(e.error ?? "Erreur serveur");
  }
  return r.json();
}

// ─── Tab 1: Frais & Paiements ───────────────────────────────────────────────

function FraisPaiementsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filterClass, setFilterClass] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: classFees = [], isLoading: cfLoading } = useQuery({
    queryKey: ["/api/scolarite/class-fees"],
    queryFn: () => apiFetch("/api/scolarite/class-fees"),
  });
  const { data: students = [], isLoading: stLoading } = useQuery({
    queryKey: ["/api/scolarite/students"],
    queryFn: () => apiFetch("/api/scolarite/students"),
  });
  const { data: stats } = useQuery({
    queryKey: ["/api/scolarite/stats"],
    queryFn: () => apiFetch("/api/scolarite/stats"),
  });

  const [classFeeDialog, setClassFeeDialog] = useState<any>(null);
  const [classFeeAmount, setClassFeeAmount] = useState("");
  const [classFeeYear, setClassFeeYear] = useState(new Date().getFullYear().toString());

  const updateClassFee = useMutation({
    mutationFn: ({ classId, totalAmount, academicYear }: any) =>
      apiFetch(`/api/scolarite/class-fees/${classId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalAmount, academicYear }),
      }),
    onSuccess: () => {
      toast({ title: "Frais mis à jour et appliqués aux étudiants" });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/class-fees"] });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/students"] });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/stats"] });
      setClassFeeDialog(null);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const [payDialog, setPayDialog] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: "", description: "", paymentDate: todayISO(), paymentMethod: "Espèces" });

  const recordPayment = useMutation({
    mutationFn: (data: any) => apiFetch("/api/scolarite/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Paiement enregistré" });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/students"] });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/stats"] });
      setPayDialog(null);
      setPayForm({ amount: "", description: "", paymentDate: todayISO(), paymentMethod: "Espèces" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const classes = useMemo(() => [...new Set((classFees as any[]).map((c: any) => ({ id: c.id, name: c.name })))], [classFees]);
  const filtered = useMemo(() => {
    let list = students as any[];
    if (filterClass !== "all") list = list.filter((s: any) => String(s.classId) === filterClass);
    if (search.trim()) list = list.filter((s: any) => s.name?.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [students, filterClass, search]);

  const statusBadge = (status: string) => {
    if (status === "paid") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">Soldé</Badge>;
    if (status === "partial") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-medium">Partiel</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-red-200 font-medium">Non payé</Badge>;
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Attendu", value: `${fmt(stats.totalExpected)} FCFA`, color: "text-foreground" },
            { label: "Perçu", value: `${fmt(stats.totalPaid)} FCFA`, color: "text-emerald-600" },
            { label: "Restant", value: `${fmt(stats.totalRemaining)} FCFA`, color: "text-red-500" },
            { label: "Taux de recouvrement", value: `${stats.recoveryRate}%`, color: stats.recoveryRate >= 75 ? "text-emerald-600" : stats.recoveryRate >= 40 ? "text-amber-600" : "text-red-500" },
          ].map(s => (
            <div key={s.label} className="bg-card border rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Class fee config */}
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />Frais par classe
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(classFees as any[]).map((c: any) => (
            <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.studentCount} étudiant(s)</p>
                <p className="text-xs font-semibold text-primary mt-0.5">{c.fee ? `${fmt(c.fee.totalAmount)} FCFA` : "Non défini"}</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 ml-2 h-7 text-xs" onClick={() => {
                setClassFeeDialog(c);
                setClassFeeAmount(c.fee?.totalAmount?.toString() ?? "");
                setClassFeeYear(c.fee?.academicYear ?? new Date().getFullYear().toString());
              }}>
                Définir
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Student list */}
      <div className="bg-card border rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-b">
          <h3 className="font-semibold">Étudiants</h3>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input placeholder="Rechercher..." className="h-8 text-sm w-48" value={search} onChange={e => setSearch(e.target.value)} />
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="divide-y">
          {stLoading ? <p className="text-center text-muted-foreground py-6 text-sm">Chargement...</p>
            : filtered.length === 0 ? <p className="text-center text-muted-foreground py-8 text-sm">Aucun étudiant trouvé.</p>
            : filtered.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.className ?? "Aucune classe"}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Attendu : <strong className="text-foreground">{fmt(s.totalAmount)} F</strong></span>
                    <span>Payé : <strong className="text-emerald-600">{fmt(s.totalPaid)} F</strong></span>
                    {s.remaining > 0 && <span>Reste : <strong className="text-red-500">{fmt(s.remaining)} F</strong></span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {statusBadge(s.status)}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayDialog(s)}>
                    + Paiement
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Dialog: define class fee */}
      <Dialog open={!!classFeeDialog} onOpenChange={o => !o && setClassFeeDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Frais — {classFeeDialog?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Montant total (FCFA)</Label>
              <Input type="number" min={0} value={classFeeAmount} onChange={e => setClassFeeAmount(e.target.value)} placeholder="ex: 400000" />
            </div>
            <div className="space-y-1.5">
              <Label>Année académique</Label>
              <Input value={classFeeYear} onChange={e => setClassFeeYear(e.target.value)} placeholder="ex: 2025-2026" />
            </div>
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-xs text-blue-700">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Ce montant sera automatiquement appliqué à tous les étudiants inscrits dans cette classe ({classFeeDialog?.studentCount} étudiant(s)).</span>
            </div>
            <Button className="w-full" disabled={updateClassFee.isPending || !classFeeAmount}
              onClick={() => updateClassFee.mutate({ classId: classFeeDialog?.id, totalAmount: parseFloat(classFeeAmount), academicYear: classFeeYear || null })}>
              {updateClassFee.isPending ? "Application..." : "Appliquer à la classe"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: record payment */}
      <Dialog open={!!payDialog} onOpenChange={o => !o && setPayDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enregistrer un paiement</DialogTitle></DialogHeader>
          {payDialog && (
            <div className="space-y-3 mt-2">
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-2.5">
                <p className="font-medium text-foreground">{payDialog.name}</p>
                <p>Solde restant : <span className="font-semibold text-red-500">{fmt(payDialog.remaining)} FCFA</span></p>
              </div>
              <div className="space-y-1.5">
                <Label>Montant (FCFA)</Label>
                <Input type="number" min={0} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="ex: 150000" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={payForm.description} onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))} placeholder="ex: 1ère tranche" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Moyen</Label>
                  <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Espèces", "Virement", "Chèque", "Mobile Money", "Autre"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" disabled={recordPayment.isPending || !payForm.amount}
                onClick={() => recordPayment.mutate({ studentId: payDialog.id, amount: parseFloat(payForm.amount), description: payForm.description || null, paymentDate: payForm.paymentDate, paymentMethod: payForm.paymentMethod })}>
                {recordPayment.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 2: Échéanciers ─────────────────────────────────────────────────────

interface Installment { label: string; amount: string; dueDate: string; }

const emptyInstallment = (): Installment => ({ label: "", amount: "", dueDate: "" });

function EcheancierTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: classFees = [] } = useQuery({
    queryKey: ["/api/scolarite/class-fees"],
    queryFn: () => apiFetch("/api/scolarite/class-fees"),
  });
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["/api/scolarite/schedules"],
    queryFn: () => apiFetch("/api/scolarite/schedules"),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    classId: "",
    name: "",
    totalAmount: "",
    academicYear: new Date().getFullYear().toString(),
    installments: [emptyInstallment(), emptyInstallment()],
  });

  const installmentsSum = useMemo(() =>
    form.installments.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0),
    [form.installments]
  );
  const totalAmount = parseFloat(form.totalAmount) || 0;
  const sumMatchesTotal = totalAmount > 0 && Math.abs(installmentsSum - totalAmount) < 1;
  const sumDiff = installmentsSum - totalAmount;

  const addInstallment = () => setForm(f => ({ ...f, installments: [...f.installments, emptyInstallment()] }));
  const removeInstallment = (idx: number) => setForm(f => ({ ...f, installments: f.installments.filter((_, i) => i !== idx) }));
  const updateInstallment = (idx: number, field: keyof Installment, value: string) => {
    setForm(f => ({ ...f, installments: f.installments.map((t, i) => i === idx ? { ...t, [field]: value } : t) }));
  };

  const createSchedule = useMutation({
    mutationFn: (data: any) => apiFetch("/api/scolarite/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Échéancier créé avec succès" });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/schedules"] });
      setDialogOpen(false);
      setForm({ classId: "", name: "", totalAmount: "", academicYear: new Date().getFullYear().toString(), installments: [emptyInstallment(), emptyInstallment()] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const applySchedule = useMutation({
    mutationFn: (scheduleId: number) => apiFetch(`/api/scolarite/schedules/${scheduleId}/apply`, { method: "POST" }),
    onSuccess: (data) => {
      toast({ title: "Échéancier appliqué", description: `${data.appliedToStudents} étudiant(s), ${data.createdInstallments} échéance(s) créées.` });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/schedules"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/scolarite/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Échéancier supprimé" });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/schedules"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.name || !form.totalAmount || totalAmount <= 0) {
      toast({ title: "Remplissez le nom et le montant total", variant: "destructive" }); return;
    }
    if (form.installments.some(t => !t.label || !t.amount || !t.dueDate)) {
      toast({ title: "Complétez toutes les tranches", variant: "destructive" }); return;
    }
    if (!sumMatchesTotal) {
      toast({ title: `La somme des tranches (${fmt(installmentsSum)} F) ne correspond pas au total (${fmt(totalAmount)} F)`, variant: "destructive" }); return;
    }
    createSchedule.mutate({
      classId: form.classId || null,
      name: form.name,
      totalAmount,
      academicYear: form.academicYear || null,
      installments: form.installments.map(t => ({ label: t.label, amount: parseFloat(t.amount), dueDate: t.dueDate })),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Échéanciers de paiement</h3>
          <p className="text-sm text-muted-foreground">Créez des modèles de tranches par classe, puis appliquez-les aux étudiants.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm"><Plus className="w-4 h-4" />Créer un échéancier</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Créer un échéancier de paiement</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nom de l'échéancier</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Frais S1 2025-2026" />
                </div>
                <div className="space-y-1.5">
                  <Label>Année académique</Label>
                  <Input value={form.academicYear} onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))} placeholder="ex: 2025-2026" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Classe cible (optionnel)</Label>
                  <Select value={form.classId || "__none__"} onValueChange={v => setForm(f => ({ ...f, classId: v === "__none__" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Aucune classe spécifique —</SelectItem>
                      {(classFees as any[]).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Montant total (FCFA)</Label>
                  <Input type="number" min={0} value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} placeholder="ex: 400000" />
                </div>
              </div>

              {/* Installments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Tranches de paiement</Label>
                  {totalAmount > 0 && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sumMatchesTotal ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {sumMatchesTotal ? `✓ Total : ${fmt(installmentsSum)} FCFA` : `Écart : ${sumDiff > 0 ? "+" : ""}${fmt(sumDiff)} FCFA`}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {form.installments.map((t, idx) => (
                    <div key={idx} className="grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-2 items-end">
                      <div className="space-y-1">
                        {idx === 0 && <Label className="text-xs text-muted-foreground">Libellé</Label>}
                        <Input value={t.label} onChange={e => updateInstallment(idx, "label", e.target.value)} placeholder={`Tranche ${idx + 1}`} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && <Label className="text-xs text-muted-foreground">Montant (FCFA)</Label>}
                        <Input type="number" min={0} value={t.amount} onChange={e => updateInstallment(idx, "amount", e.target.value)} placeholder="0" className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && <Label className="text-xs text-muted-foreground">Date limite</Label>}
                        <Input type="date" value={t.dueDate} onChange={e => updateInstallment(idx, "dueDate", e.target.value)} className="h-8 text-sm" />
                      </div>
                      <button
                        onClick={() => removeInstallment(idx)}
                        disabled={form.installments.length <= 1}
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7 mt-1" onClick={addInstallment}>
                  <Plus className="w-3 h-3" />Ajouter une tranche
                </Button>
              </div>

              {/* Validation warning */}
              {totalAmount > 0 && !sumMatchesTotal && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>La somme des tranches ({fmt(installmentsSum)} FCFA) doit être égale au montant total ({fmt(totalAmount)} FCFA).</span>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button onClick={handleSubmit} disabled={createSchedule.isPending || !sumMatchesTotal}>
                  {createSchedule.isPending ? "Création..." : "Créer et enregistrer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-10">Chargement...</p>
      ) : (schedules as any[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed rounded-xl text-muted-foreground">
          <CalendarClock className="w-10 h-10 opacity-40" />
          <p className="text-sm font-medium">Aucun échéancier créé</p>
          <p className="text-xs text-center max-w-xs">Créez un modèle de tranches par classe, puis appliquez-le aux étudiants en un clic.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {(schedules as any[]).map((s: any) => (
            <div key={s.id} className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-start justify-between gap-3 border-b bg-muted/20">
                <div className="min-w-0">
                  <h4 className="font-semibold text-foreground">{s.name}</h4>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                    {s.className && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{s.className}</span>}
                    <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{fmt(s.totalAmount)} FCFA</span>
                    {s.academicYear && <span>{s.academicYear}</span>}
                    <span>{s.installments?.length ?? 0} tranche(s)</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {s.classId && (
                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-primary/30 text-primary hover:bg-primary/5"
                      disabled={applySchedule.isPending}
                      onClick={() => applySchedule.mutate(s.id)}>
                      <RefreshCw className="w-3 h-3" />Appliquer
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteSchedule.mutate(s.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="px-5 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(s.installments ?? []).map((inst: any, idx: number) => (
                    <div key={inst.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-xs text-foreground">{inst.label || `Tranche ${idx + 1}`}</p>
                        <p className="text-xs text-muted-foreground">Échéance : {fmtDate(inst.dueDate)}</p>
                      </div>
                      <p className="font-semibold text-primary text-xs">{fmt(inst.amount)} F</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Suivi des Paiements ──────────────────────────────────────────────

function SuiviPaiementsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");

  const { data: schedules = [] } = useQuery({
    queryKey: ["/api/scolarite/schedules"],
    queryFn: () => apiFetch("/api/scolarite/schedules"),
  });

  const { data: tracking, isLoading } = useQuery({
    queryKey: ["/api/scolarite/payment-tracking", selectedScheduleId],
    queryFn: () => apiFetch(`/api/scolarite/payment-tracking?scheduleId=${selectedScheduleId}`),
    enabled: !!selectedScheduleId,
  });

  const markPaid = useMutation({
    mutationFn: ({ installmentId }: any) => apiFetch("/api/scolarite/payment-tracking/mark-paid", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installmentId, paidAt: todayISO() }),
    }),
    onSuccess: () => {
      toast({ title: "Paiement enregistré" });
      qc.invalidateQueries({ queryKey: ["/api/scolarite/payment-tracking", selectedScheduleId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/alertes/resume"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const statusIcon = (status: string) => {
    if (status === "paye") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === "en_retard") return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (status === "non_genere") return <XCircle className="w-4 h-4 text-gray-300" />;
    return <Clock className="w-4 h-4 text-amber-400" />;
  };

  const statusText = (status: string) => {
    if (status === "paye") return "text-emerald-600 bg-emerald-50";
    if (status === "en_retard") return "text-red-600 bg-red-50";
    if (status === "non_genere") return "text-gray-400 bg-gray-50";
    return "text-amber-600 bg-amber-50";
  };

  const scheduleOptions = (schedules as any[]).filter((s: any) => s.classId);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!tracking?.students) return null;
    const students = tracking.students as any[];
    const totalExpected = students.reduce((a: number, s: any) => a + s.totalDue, 0);
    const totalCollected = students.reduce((a: number, s: any) => a + s.totalPaid, 0);
    const fullyPaid = students.filter((s: any) => s.progress === 100).length;
    const late = students.filter((s: any) => s.installments.some((i: any) => i.status === "en_retard")).length;
    return { totalExpected, totalCollected, fullyPaid, late };
  }, [tracking]);

  return (
    <div className="space-y-5">
      {/* Schedule picker */}
      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-sm">
          <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un échéancier..." />
            </SelectTrigger>
            <SelectContent>
              {scheduleOptions.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name} {s.className ? `— ${s.className}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {scheduleOptions.length === 0 && (
          <p className="text-sm text-muted-foreground">Créez d'abord un échéancier associé à une classe dans l'onglet "Échéanciers".</p>
        )}
      </div>

      {!selectedScheduleId ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed rounded-xl text-muted-foreground">
          <BarChart3 className="w-10 h-10 opacity-40" />
          <p className="text-sm font-medium">Sélectionnez un échéancier</p>
          <p className="text-xs">Le tableau de suivi s'affichera ici.</p>
        </div>
      ) : isLoading ? (
        <p className="text-center text-muted-foreground py-10">Chargement...</p>
      ) : tracking ? (
        <>
          {/* Summary */}
          {summaryStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total attendu", value: `${fmt(summaryStats.totalExpected)} F`, color: "text-foreground" },
                { label: "Total perçu", value: `${fmt(summaryStats.totalCollected)} F`, color: "text-emerald-600" },
                { label: "Entièrement soldés", value: `${summaryStats.fullyPaid} étudiant(s)`, color: "text-emerald-600" },
                { label: "En retard", value: `${summaryStats.late} étudiant(s)`, color: summaryStats.late > 0 ? "text-red-500" : "text-muted-foreground" },
              ].map(s => (
                <div key={s.label} className="bg-card border rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Tracking table */}
          {(tracking.students as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
              <Users className="w-8 h-8 opacity-30" />
              <p>Aucun étudiant trouvé dans cette classe.</p>
              <p className="text-xs">Appliquez l'échéancier depuis l'onglet "Échéanciers" pour générer les tranches.</p>
            </div>
          ) : (
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[180px]">Étudiant</th>
                      {(tracking.templateInstallments as any[]).map((ti: any) => (
                        <th key={ti.id} className="text-center px-3 py-3 font-semibold text-foreground min-w-[130px]">
                          <div>{ti.label}</div>
                          <div className="font-normal text-xs text-muted-foreground">{fmtDate(ti.dueDate)}</div>
                        </th>
                      ))}
                      <th className="text-center px-3 py-3 font-semibold text-foreground min-w-[80px]">Progression</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(tracking.students as any[]).map((student: any) => (
                      <tr key={student.studentId} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{student.studentName}</p>
                          <p className="text-xs text-muted-foreground">{fmt(student.totalPaid)} / {fmt(student.totalDue)} F</p>
                        </td>
                        {student.installments.map((inst: any) => (
                          <td key={inst.templateInstallmentId} className="px-3 py-3 text-center">
                            {inst.status === "non_genere" ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusText(inst.status)}`}>
                                  {statusIcon(inst.status)}
                                  <span>
                                    {inst.status === "paye" ? (inst.paidAt ? fmtDate(inst.paidAt) : "Payé")
                                      : inst.status === "en_retard" ? "En retard"
                                      : "En attente"}
                                  </span>
                                </div>
                                {inst.status !== "paye" && inst.installmentId && (
                                  <button
                                    onClick={() => markPaid.mutate({ installmentId: inst.installmentId })}
                                    disabled={markPaid.isPending}
                                    className="text-[10px] text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                                  >
                                    Marquer payé
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-full max-w-[60px] bg-muted rounded-full h-1.5 mx-auto">
                              <div
                                className={`h-1.5 rounded-full transition-all ${student.progress === 100 ? "bg-emerald-500" : student.progress > 0 ? "bg-amber-400" : "bg-red-400"}`}
                                style={{ width: `${student.progress}%` }}
                              />
                            </div>
                            <span className={`text-xs font-semibold ${student.progress === 100 ? "text-emerald-600" : student.progress > 0 ? "text-amber-600" : "text-red-500"}`}>
                              {student.progress}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30">
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        Total perçu : {fmt(summaryStats?.totalCollected ?? 0)} F / {fmt(summaryStats?.totalExpected ?? 0)} F attendus
                        {summaryStats && summaryStats.totalExpected > 0 && (
                          <span className="ml-1 text-primary">({Math.round((summaryStats.totalCollected / summaryStats.totalExpected) * 100)}%)</span>
                        )}
                      </td>
                      {(tracking.templateInstallments as any[]).map((ti: any) => {
                        const instsPaid = (tracking.students as any[]).filter((s: any) => s.installments.find((i: any) => i.templateInstallmentId === ti.id && i.status === "paye")).length;
                        const total = (tracking.students as any[]).length;
                        return (
                          <td key={ti.id} className="px-3 py-3 text-center text-xs text-muted-foreground font-medium">
                            {instsPaid}/{total} payés
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminScolarite() {
  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Scolarité & Paiements</h1>
          <p className="text-muted-foreground">Gérez les frais, créez des échéanciers et suivez les paiements par classe.</p>
        </div>

        <Tabs defaultValue="frais">
          <TabsList className="bg-muted/50 p-1 rounded-xl w-full sm:w-auto">
            <TabsTrigger value="frais" className="rounded-lg gap-2 text-sm">
              <Wallet className="w-4 h-4" />Frais & Paiements
            </TabsTrigger>
            <TabsTrigger value="echeanciers" className="rounded-lg gap-2 text-sm">
              <CalendarClock className="w-4 h-4" />Échéanciers
            </TabsTrigger>
            <TabsTrigger value="suivi" className="rounded-lg gap-2 text-sm">
              <BarChart3 className="w-4 h-4" />Suivi des Paiements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="frais" className="mt-5">
            <FraisPaiementsTab />
          </TabsContent>
          <TabsContent value="echeanciers" className="mt-5">
            <EcheancierTab />
          </TabsContent>
          <TabsContent value="suivi" className="mt-5">
            <SuiviPaiementsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
