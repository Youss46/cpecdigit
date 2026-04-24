import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  Wallet, CheckCircle2, AlertTriangle, Clock, Download, ChevronRight,
  ArrowLeft, Banknote, Smartphone, CreditCard, Calendar, User2,
  Info, TrendingUp, AlertCircle,
} from "lucide-react";
import { jsPDF } from "jspdf";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Payment {
  id: number;
  amount: number;
  description?: string;
  paymentDate: string;
  paymentMethod?: string;
  reference?: string;
  status?: string;
  recordedByName?: string;
}
interface Installment {
  id: number;
  label?: string;
  dueDate: string;
  amount: number;
  paidAt?: string;
  status: "Payée" | "En attente" | "En retard";
}
interface ScolariteData {
  fee: { academicYear?: string } | null;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  status: "À jour" | "Partiellement payé" | "Impayé";
  academicYear?: string;
  payments: Payment[];
  installments: Installment[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0") + " FCFA";
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function methodLabel(m?: string) {
  if (!m) return "—";
  if (m === "mobile_money") return "Mobile Money";
  if (m === "especes") return "Espèces";
  if (m === "virement") return "Virement bancaire";
  if (m === "cheque") return "Chèque";
  return m;
}
function MethodIcon({ method }: { method?: string }) {
  if (method === "mobile_money") return <Smartphone className="w-3.5 h-3.5" />;
  if (method === "virement" || method === "cheque") return <CreditCard className="w-3.5 h-3.5" />;
  return <Banknote className="w-3.5 h-3.5" />;
}

// ─── PDF Receipt ──────────────────────────────────────────────────────────────
function generateReceipt(payment: Payment, studentName: string) {
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, w, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("CPEC-U — REÇU DE PAIEMENT", w / 2, 12, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Institut National Polytechnique Houphouët-Boigny — Bouaké", w / 2, 20, { align: "center" });

  doc.setTextColor(0, 0, 0);
  let y = 38;
  const left = 14;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Référence :", left, y);
  doc.setFont("helvetica", "normal");
  doc.text(payment.reference ?? "—", left + 30, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Date :", left, y);
  doc.setFont("helvetica", "normal");
  doc.text(fmtDate(payment.paymentDate), left + 30, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Étudiant :", left, y);
  doc.setFont("helvetica", "normal");
  doc.text(studentName, left + 30, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Mode :", left, y);
  doc.setFont("helvetica", "normal");
  doc.text(methodLabel(payment.paymentMethod ?? undefined), left + 30, y);
  y += 7;

  if (payment.description) {
    doc.setFont("helvetica", "bold");
    doc.text("Motif :", left, y);
    doc.setFont("helvetica", "normal");
    doc.text(payment.description, left + 30, y);
    y += 7;
  }

  y += 4;
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(left, y, w - left * 2, 18, 3, 3, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 58, 138);
  doc.text("Montant versé :", left + 4, y + 7);
  doc.setFontSize(13);
  doc.text(fmt(payment.amount), w - left - 4, y + 7, { align: "right" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 100, 100);
  doc.text("Ce reçu est généré automatiquement. CPEC-Digital — Système de Gestion Académique.", w / 2, 190, { align: "center" });

  doc.save(`Recu-${payment.reference ?? payment.id}.pdf`);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useParentProfile() {
  return useQuery({
    queryKey: ["/api/parent/profile"],
    queryFn: async () => {
      const r = await fetch("/api/parent/profile", { credentials: "include" });
      if (!r.ok) throw new Error("Erreur");
      return r.json() as Promise<{
        parent: { id: number; name: string };
        students: Array<{ id: number; name: string; className?: string }>;
      }>;
    },
  });
}

function useScolarite(studentId: number | null) {
  return useQuery({
    queryKey: ["/api/parent/student", studentId, "scolarite"],
    queryFn: async () => {
      const r = await fetch(`/api/parent/student/${studentId}/scolarite`, { credentials: "include" });
      if (!r.ok) throw new Error("Erreur");
      return r.json() as Promise<ScolariteData>;
    },
    enabled: studentId !== null,
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ s }: { s: string }) {
  if (s === "À jour") return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-sm px-3 py-1">
      <CheckCircle2 className="w-3.5 h-3.5" />{s}
    </Badge>
  );
  if (s === "Partiellement payé") return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-sm px-3 py-1">
      <Clock className="w-3.5 h-3.5" />{s}
    </Badge>
  );
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-sm px-3 py-1">
      <AlertTriangle className="w-3.5 h-3.5" />{s}
    </Badge>
  );
}

// ─── Installment status badge ─────────────────────────────────────────────────
function InstBadge({ s }: { s: Installment["status"] }) {
  if (s === "Payée") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Payée</Badge>;
  if (s === "En retard") return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs"><AlertCircle className="w-3 h-3 mr-1" />En retard</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs"><Clock className="w-3 h-3 mr-1" />En attente</Badge>;
}

// ─── Payment status badge ─────────────────────────────────────────────────────
function PayBadge({ s }: { s?: string }) {
  if (!s || s === "validé") return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Validé</Badge>;
  return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">En attente</Badge>;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ParentScolarite() {
  const { data: profile, isLoading: profileLoading } = useParentProfile();
  const students = profile?.students ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const studentId = selectedId ?? students[0]?.id ?? null;
  const selectedStudent = students.find(s => s.id === studentId);

  const { data, isLoading } = useScolarite(studentId);

  const handleDownload = useCallback((p: Payment) => {
    generateReceipt(p, selectedStudent?.name ?? "Étudiant");
  }, [selectedStudent]);

  return (
    <AppLayout allowedRoles={["parent"]} noScroll={false}>
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-5 h-5 text-indigo-600" />
            <h1 className="text-2xl font-bold">Scolarité de l'Enfant</h1>
          </div>
          <p className="text-muted-foreground text-sm">Situation financière des frais de scolarité</p>
        </motion.div>

        {/* Student selector */}
        {students.length > 1 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <User2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <Select value={String(studentId)} onValueChange={v => setSelectedId(Number(v))}>
                  <SelectTrigger className="max-w-xs h-9">
                    <SelectValue placeholder="Choisir un enfant…" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}{s.className ? ` — ${s.className}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {profileLoading || isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm animate-pulse">
            Chargement…
          </div>
        ) : !data?.fee ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Info className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Aucun frais de scolarité configuré</p>
              <p className="text-sm mt-1">Veuillez contacter l'administration pour plus d'informations.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ── Summary cards ───────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-3"
            >
              <Card className="border-indigo-100 bg-indigo-50/40">
                <CardContent className="p-4">
                  <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Total dû</p>
                  <p className="text-lg font-bold text-indigo-900 mt-1">{fmt(data.totalAmount)}</p>
                  {data.academicYear && <p className="text-xs text-indigo-400 mt-0.5">{data.academicYear}</p>}
                </CardContent>
              </Card>
              <Card className="border-emerald-100 bg-emerald-50/40">
                <CardContent className="p-4">
                  <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Montant payé</p>
                  <p className="text-lg font-bold text-emerald-800 mt-1">{fmt(data.totalPaid)}</p>
                  <div className="mt-1 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: data.totalAmount > 0 ? `${Math.min(100, (data.totalPaid / data.totalAmount) * 100)}%` : "0%" }}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card className={data.remaining > 0 ? "border-amber-100 bg-amber-50/40" : "border-slate-100"}>
                <CardContent className="p-4">
                  <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Reste à payer</p>
                  <p className="text-lg font-bold text-amber-800 mt-1">{fmt(data.remaining)}</p>
                  {data.totalAmount > 0 && (
                    <p className="text-xs text-amber-500 mt-0.5">
                      {Math.round((data.totalPaid / data.totalAmount) * 100)}% réglé
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col items-start gap-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Statut</p>
                  <StatusBadge s={data.status} />
                </CardContent>
              </Card>
            </motion.div>

            {/* ── Payments list ────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-500" />
                    Historique des paiements
                    <Badge variant="secondary" className="ml-auto text-xs">{data.payments.length} versement{data.payments.length > 1 ? "s" : ""}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.payments.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">Aucun versement enregistré.</p>
                  ) : (
                    <div className="divide-y">
                      {data.payments.map(p => (
                        <div key={p.id} className="px-5 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                            <MethodIcon method={p.paymentMethod ?? undefined} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{fmt(p.amount)}</span>
                              <PayBadge s={p.status ?? undefined} />
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />{fmtDate(p.paymentDate)}
                              </span>
                              <span className="flex items-center gap-1">
                                <MethodIcon method={p.paymentMethod ?? undefined} />{methodLabel(p.paymentMethod ?? undefined)}
                              </span>
                              {p.reference && (
                                <span className="font-mono text-xs text-indigo-400">{p.reference}</span>
                              )}
                              {p.description && <span className="truncate max-w-[140px]">{p.description}</span>}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1.5"
                            onClick={() => handleDownload(p)}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline text-xs">Reçu PDF</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* ── Installments / Échéancier ─────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    Échéancier de paiement
                    <Badge variant="secondary" className="ml-auto text-xs">{data.installments.length} échéance{data.installments.length > 1 ? "s" : ""}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.installments.length === 0 ? (
                    <div className="px-6 pb-6 text-sm text-muted-foreground flex items-center gap-2">
                      <Info className="w-4 h-4 text-slate-300" />
                      Aucun échéancier défini. Contactez l'administration.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {data.installments.map((inst, i) => (
                        <div
                          key={inst.id}
                          className={`px-5 py-4 flex items-center gap-4 ${inst.status === "En retard" ? "bg-red-50/40" : ""}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            inst.status === "Payée" ? "bg-emerald-100 text-emerald-700" :
                            inst.status === "En retard" ? "bg-red-100 text-red-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{fmt(inst.amount)}</span>
                              {inst.label && <span className="text-xs text-muted-foreground">{inst.label}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Échéance : {fmtDate(inst.dueDate)}
                              </span>
                              {inst.paidAt && (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Payée le {fmtDate(inst.paidAt)}
                                </span>
                              )}
                            </div>
                          </div>
                          <InstBadge s={inst.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Disclaimer */}
            <p className="text-xs text-center text-muted-foreground pb-4">
              Les informations financières sont en lecture seule. Pour toute question, contactez le service de scolarité.
            </p>
          </>
        )}
      </div>
    </AppLayout>
  );
}
