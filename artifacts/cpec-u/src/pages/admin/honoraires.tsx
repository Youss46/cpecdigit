import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMontant } from "@/components/ui/input-montant";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { motion } from "framer-motion";
import {
  Wallet, AlertCircle, CheckCircle, Users,
  Plus, Trash2, Pencil, ChevronRight, Download, RefreshCw,
  Calculator, ClipboardList, Info,
} from "lucide-react";
import { downloadHonorairesRecapPdf, downloadFicheHonorairesPdf } from "@/lib/pdf-engine/documents";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmtFCFA(n: number) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + " FCFA";
}

function fmtH(n: number) {
  return `${n}h`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  especes: "💵 Espèces",
  virement: "🏦 Virement bancaire",
  orange_money: "🟠 Orange Money",
  mtn_momo: "🟡 MTN Mobile Money",
  wave: "🔵 Wave",
  moov_money: "🟣 Moov Money",
  cheque: "📝 Chèque",
};

export default function HonorairesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["/api/honoraires/teachers"],
    queryFn: () => apiFetch("/honoraires/teachers"),
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/honoraires/stats"],
    queryFn: () => apiFetch("/honoraires/stats"),
  });

  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["/api/honoraires/payments", selectedTeacher?.id],
    queryFn: () => apiFetch(`/honoraires/payments/${selectedTeacher!.id}`),
    enabled: !!selectedTeacher,
  });

  // ── Fee dialog state ────────────────────────────────────────────────────────
  const [feeDialog, setFeeDialog] = useState<any | null>(null);
  const [feeMode, setFeeMode] = useState<"auto" | "manual">("auto");
  const [feeForm, setFeeForm] = useState({
    hourlyRate: "",
    totalAmount: "",
    periodLabel: "",
    notes: "",
  });

  // Load assignment breakdown when in auto mode
  const { data: assignmentsPreview = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["/api/honoraires/assignments", feeDialog?.id],
    queryFn: () => apiFetch(`/honoraires/assignments/${feeDialog!.id}`),
    enabled: !!feeDialog && feeMode === "auto",
  });

  const totalPreviewHours = (assignmentsPreview as any[]).reduce(
    (sum: number, a: any) => sum + Number(a.planned_hours ?? 0), 0
  );
  const hourlyRateNum = parseFloat(feeForm.hourlyRate.replace(/\s/g, "")) || 0;
  const calculatedAmount = feeMode === "auto" ? hourlyRateNum * totalPreviewHours : 0;

  // When dialog opens, pre-fill form from teacher data
  const openFeeDialog = (t: any) => {
    setFeeDialog(t);
    const hasHourlyRate = t.hourlyRate != null && t.hourlyRate > 0;
    setFeeMode(hasHourlyRate ? "auto" : t.totalAmount > 0 ? "manual" : "auto");
    setFeeForm({
      hourlyRate: hasHourlyRate ? String(t.hourlyRate) : "",
      totalAmount: t.totalAmount > 0 && !hasHourlyRate ? String(t.totalAmount) : "",
      periodLabel: t.periodLabel ?? "",
      notes: t.notes ?? "",
    });
  };

  // ── Payment dialog state ────────────────────────────────────────────────────
  const [payDialog, setPayDialog] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", description: "", paymentDate: "", paymentMethod: "especes" });

  const [pendingDeletePayment, setPendingDeletePayment] = useState<number | null>(null);
  const [recapPdfLoading, setRecapPdfLoading] = useState(false);
  const [fichePdfLoading, setFichePdfLoading] = useState(false);

  const handleDownloadRecapPdf = async () => {
    setRecapPdfLoading(true);
    try { await downloadHonorairesRecapPdf(); }
    catch (e: any) { toast({ title: "Erreur PDF", description: e.message, variant: "destructive" }); }
    finally { setRecapPdfLoading(false); }
  };

  const handleDownloadFichePdf = async (teacher: any) => {
    setFichePdfLoading(true);
    try { await downloadFicheHonorairesPdf(teacher.id, teacher.name); }
    catch (e: any) { toast({ title: "Erreur PDF", description: e.message, variant: "destructive" }); }
    finally { setFichePdfLoading(false); }
  };

  const setFeeMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/honoraires/fees/${feeDialog!.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Honoraires enregistrés" });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
      setFeeDialog(null);
    },
    onError: () => toast({ title: "Erreur lors de l'enregistrement", variant: "destructive" }),
  });

  const addPaymentMutation = useMutation({
    mutationFn: (data: any) => apiFetch("/honoraires/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Paiement enregistré" });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/payments", payDialog?.id] });
      if (selectedTeacher?.id === payDialog?.id) {
        qc.invalidateQueries({ queryKey: ["/api/honoraires/payments", selectedTeacher?.id] });
      }
      setPayDialog(null);
    },
    onError: () => toast({ title: "Erreur lors de l'enregistrement du paiement", variant: "destructive" }),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/honoraires/payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Paiement supprimé" });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/payments", selectedTeacher?.id] });
      setPendingDeletePayment(null);
    },
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const handleSetFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (feeMode === "auto") {
      const rate = parseFloat(feeForm.hourlyRate.replace(/\s/g, ""));
      if (isNaN(rate) || rate <= 0) {
        toast({ title: "Taux horaire invalide", variant: "destructive" }); return;
      }
      if (totalPreviewHours === 0) {
        toast({ title: "Aucune heure prévue dans les affectations", description: "Configurez d'abord des affectations pour cet enseignant.", variant: "destructive" }); return;
      }
      setFeeMutation.mutate({
        hourlyRate: rate,
        periodLabel: feeForm.periodLabel || null,
        notes: feeForm.notes || null,
      });
    } else {
      const amount = parseFloat(feeForm.totalAmount.replace(/\s/g, ""));
      if (isNaN(amount) || amount < 0) {
        toast({ title: "Montant invalide", variant: "destructive" }); return;
      }
      setFeeMutation.mutate({
        totalAmount: amount,
        hourlyRate: null,
        periodLabel: feeForm.periodLabel || null,
        notes: feeForm.notes || null,
      });
    }
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payForm.amount.replace(/\s/g, ""));
    if (isNaN(amount) || amount <= 0 || !payForm.paymentDate || !payForm.paymentMethod) {
      toast({ title: "Montant, date et moyen de paiement sont requis", variant: "destructive" }); return;
    }
    addPaymentMutation.mutate({
      teacherId: payDialog!.id, amount,
      description: payForm.description || null,
      paymentDate: payForm.paymentDate,
      paymentMethod: payForm.paymentMethod,
    });
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    paid: { label: "Réglé", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    partial: { label: "Partiel", color: "bg-amber-100 text-amber-700 border-amber-200" },
    unpaid: { label: "Non réglé", color: "bg-red-100 text-red-700 border-red-200" },
  };

  const s = stats as any;

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Gestion des Honoraires</h1>
            <p className="text-muted-foreground mt-1">Rémunérations calculées automatiquement — Taux horaire × Heures prévues.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0 mt-1" disabled={recapPdfLoading} onClick={handleDownloadRecapPdf}>
            {recapPdfLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Récapitulatif PDF
          </Button>
        </div>

        {/* Stats cards */}
        {s && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div className="bg-card border border-border rounded-2xl p-5 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total attendu</p>
              <p className="text-2xl font-bold text-foreground">{fmtFCFA(s.totalExpected ?? 0)}</p>
              <p className="text-xs text-muted-foreground">{s.teacherCount} enseignant{s.teacherCount > 1 ? "s" : ""} configuré{s.teacherCount > 1 ? "s" : ""}</p>
            </div>
            <div className="bg-card border border-emerald-200 rounded-2xl p-5 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total réglé</p>
              <p className="text-2xl font-bold text-emerald-600">{fmtFCFA(s.totalPaid ?? 0)}</p>
              <p className="text-xs text-muted-foreground">{s.fullyPaid ?? 0} enseignant{(s.fullyPaid ?? 0) > 1 ? "s" : ""} soldé{(s.fullyPaid ?? 0) > 1 ? "s" : ""}</p>
            </div>
            <div className="bg-card border border-red-200 rounded-2xl p-5 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Reste à payer</p>
              <p className="text-2xl font-bold text-red-600">{fmtFCFA(s.totalRemaining ?? 0)}</p>
              <p className="text-xs text-muted-foreground">{(s.partial ?? 0) + (s.noPay ?? 0)} dossier{((s.partial ?? 0) + (s.noPay ?? 0)) > 1 ? "s" : ""} en attente</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Taux de recouvrement</p>
                <span className={`text-lg font-bold ${(s.recoveryRate ?? 0) >= 75 ? "text-emerald-600" : (s.recoveryRate ?? 0) >= 40 ? "text-amber-600" : "text-red-600"}`}>
                  {s.recoveryRate ?? 0}%
                </span>
              </div>
              <Progress value={Math.min(100, s.recoveryRate ?? 0)} className="h-2" />
            </div>
          </motion.div>
        )}

        {/* Teachers table */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Enseignants
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">
              <Calculator className="w-3.5 h-3.5" />
              Montant dû = Taux horaire × Heures prévues dans les affectations
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
            <Table>
              <TableHeader className="bg-secondary/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Enseignant</TableHead>
                  <TableHead className="text-right">Taux horaire</TableHead>
                  <TableHead className="text-right">Heures prévues</TableHead>
                  <TableHead className="text-right">Montant dû</TableHead>
                  <TableHead className="text-right">Montant réglé</TableHead>
                  <TableHead className="text-right">Reste</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : (teachers as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Aucun enseignant.</TableCell></TableRow>
                ) : (
                  (teachers as any[]).map((t: any) => {
                    const cfg = statusConfig[t.status] ?? statusConfig.unpaid;
                    const pct = t.totalAmount > 0 ? Math.min(100, Math.round((t.totalPaid / t.totalAmount) * 100)) : 0;
                    const isAutoCalc = t.hourlyRate != null && t.hourlyRate > 0;
                    return (
                      <TableRow key={t.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div>
                            <p className="font-semibold text-foreground">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.email}</p>
                            {t.periodLabel && <p className="text-xs text-muted-foreground italic">{t.periodLabel}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {isAutoCalc ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-blue-600">{fmtFCFA(t.hourlyRate)}/h</span>
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Auto</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {t.totalPlannedHours > 0 ? (
                            <span className="font-semibold">{fmtH(t.totalPlannedHours)}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Aucune affectation</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {t.totalAmount > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="font-semibold">{fmtFCFA(t.totalAmount)}</span>
                              {isAutoCalc && t.totalPlannedHours > 0 && (
                                <span className="text-[10px] text-muted-foreground">{t.hourlyRate.toLocaleString()} × {t.totalPlannedHours}h</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-600">
                          {t.totalPaid > 0 ? fmtFCFA(t.totalPaid) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {t.remaining > 0 ? (
                            <span className="text-red-600 font-semibold">{fmtFCFA(t.remaining)}</span>
                          ) : t.totalAmount > 0 ? (
                            <span className="text-emerald-600 text-xs font-medium">Soldé</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`${cfg.color} border text-xs`}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="text-muted-foreground hover:text-foreground gap-1.5"
                              onClick={() => openFeeDialog(t)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Définir
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="text-primary hover:text-primary/80 gap-1.5"
                              onClick={() => { setSelectedTeacher(t); setPayDialog(null); }}
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                              Paiements
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

        {/* Payment history panel */}
        {selectedTeacher && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                <div>
                  <h2 className="font-semibold text-foreground">Historique des paiements</h2>
                  <p className="text-sm text-muted-foreground">{selectedTeacher.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm" className="gap-1.5" disabled={fichePdfLoading}
                    onClick={() => handleDownloadFichePdf(selectedTeacher)}
                  >
                    {fichePdfLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Fiche PDF
                  </Button>
                  <Button
                    size="sm" className="gap-1.5"
                    onClick={() => {
                      setPayDialog(selectedTeacher);
                      setPayForm({ amount: "", description: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "especes" });
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter un paiement
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTeacher(null)}>Fermer</Button>
                </div>
              </div>
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Moyen de paiement</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Enregistré par</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
                  ) : (payments as any[]).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun paiement enregistré.</TableCell></TableRow>
                  ) : (
                    (payments as any[]).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(p.paymentDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell>{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-emerald-600 whitespace-nowrap">{fmtFCFA(p.amount)}</TableCell>
                        <TableCell>{p.description || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.recordedByName ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:bg-destructive/10 w-7 h-7"
                            onClick={() => setPendingDeletePayment(p.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        )}

        {/* ── Set fee dialog ─────────────────────────────────────────────────── */}
        <Dialog open={!!feeDialog} onOpenChange={open => { if (!open) setFeeDialog(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" />
                Honoraires — {feeDialog?.name}
              </DialogTitle>
            </DialogHeader>

            {/* Mode toggle */}
            <div className="flex rounded-xl border border-border overflow-hidden flex-shrink-0">
              <button
                type="button"
                onClick={() => setFeeMode("auto")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${
                  feeMode === "auto"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <Calculator className="w-4 h-4" />
                Calcul automatique
              </button>
              <button
                type="button"
                onClick={() => setFeeMode("manual")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${
                  feeMode === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                Montant fixe
              </button>
            </div>

            <form onSubmit={handleSetFee} className="flex-1 overflow-y-auto space-y-4 pr-1">
              {feeMode === "auto" ? (
                <>
                  {/* Auto mode */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800 flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Le montant dû est calculé automatiquement : <strong>Taux horaire × Total des heures prévues</strong> dans toutes les affectations de cet enseignant.</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Taux horaire (FCFA/heure) <span className="text-destructive">*</span></Label>
                    <InputMontant
                      value={feeForm.hourlyRate}
                      onChange={raw => setFeeForm(f => ({ ...f, hourlyRate: raw }))}
                      placeholder="Ex: 10 000"
                      required
                    />
                  </div>

                  {/* Assignments preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Affectations détectées</Label>
                      {!assignmentsLoading && (
                        <span className="text-xs font-bold text-muted-foreground">
                          Total : {fmtH(totalPreviewHours)}
                        </span>
                      )}
                    </div>
                    <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                      {assignmentsLoading ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">Chargement...</div>
                      ) : (assignmentsPreview as any[]).length === 0 ? (
                        <div className="p-4 text-center text-sm text-amber-700 bg-amber-50 flex items-center gap-2 justify-center">
                          <AlertCircle className="w-4 h-4" />
                          Aucune affectation configurée — le montant calculé sera 0 FCFA.
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-secondary/60 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Matière / Classe</th>
                              <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Semestre</th>
                              <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Heures</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(assignmentsPreview as any[]).map((a: any) => (
                              <tr key={a.id} className="hover:bg-muted/30">
                                <td className="px-3 py-2">
                                  <span className="font-medium">{a.subject_name}</span>
                                  <span className="text-muted-foreground"> · {a.class_name}</span>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{a.semester_name} ({a.academic_year})</td>
                                <td className="px-3 py-2 text-right font-mono font-semibold">{a.planned_hours}h</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Calculated preview */}
                  {hourlyRateNum > 0 && totalPreviewHours > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between">
                      <div className="text-sm text-emerald-800">
                        <span className="font-semibold">{fmtFCFA(hourlyRateNum)}/h</span>
                        <span className="text-emerald-600"> × </span>
                        <span className="font-semibold">{fmtH(totalPreviewHours)}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-emerald-600 font-medium">Montant calculé</p>
                        <p className="text-xl font-bold text-emerald-700">{fmtFCFA(calculatedAmount)}</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Manual mode */}
                  <div className="space-y-1.5">
                    <Label>Montant total (FCFA) <span className="text-destructive">*</span></Label>
                    <InputMontant
                      value={feeForm.totalAmount}
                      onChange={raw => setFeeForm(f => ({ ...f, totalAmount: raw }))}
                      placeholder="Ex: 250 000"
                      required
                    />
                    <p className="text-xs text-muted-foreground">Ce montant remplacera tout calcul automatique précédent.</p>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Période (optionnel)</Label>
                <Input
                  value={feeForm.periodLabel}
                  onChange={e => setFeeForm(f => ({ ...f, periodLabel: e.target.value }))}
                  placeholder="Ex: Semestre 1 — 2024/2025"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optionnel)</Label>
                <Input
                  value={feeForm.notes}
                  onChange={e => setFeeForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Remarques..."
                />
              </div>
              <Button type="submit" className="w-full" disabled={setFeeMutation.isPending}>
                {setFeeMutation.isPending ? "Enregistrement..." : feeMode === "auto" ? `Enregistrer — ${fmtFCFA(calculatedAmount)}` : "Enregistrer"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Add payment dialog */}
        <Dialog open={!!payDialog} onOpenChange={open => { if (!open) setPayDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ajouter un paiement — {payDialog?.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddPayment} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Montant (FCFA) <span className="text-destructive">*</span></Label>
                <InputMontant
                  value={payForm.amount}
                  onChange={raw => setPayForm(f => ({ ...f, amount: raw }))}
                  placeholder="Ex: 100 000"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date de paiement <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Moyen de paiement <span className="text-destructive">*</span></Label>
                <Select value={payForm.paymentMethod} onValueChange={val => setPayForm(f => ({ ...f, paymentMethod: val }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un moyen de paiement" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Description (optionnel)</Label>
                <Input
                  value={payForm.description}
                  onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ex: Acompte, Solde final..."
                />
              </div>
              <Button type="submit" className="w-full" disabled={addPaymentMutation.isPending}>
                {addPaymentMutation.isPending ? "Enregistrement..." : "Enregistrer le paiement"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <ConfirmDialog
          open={!!pendingDeletePayment}
          title="Supprimer ce paiement ?"
          description="Cette action est irréversible."
          confirmLabel="Supprimer"
          onConfirm={() => pendingDeletePayment && deletePaymentMutation.mutate(pendingDeletePayment)}
          onCancel={() => setPendingDeletePayment(null)}
          loading={deletePaymentMutation.isPending}
          variant="destructive"
        />

      </div>
    </AppLayout>
  );
}
