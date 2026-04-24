import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListUsers, useCreateUser, useDeleteUser, useListClasses, useGetCurrentUser,
  useGetScolariteStudents, useGetScolariteStats, useGetStudentPayments,
  useSetStudentFee, useAddPayment, useDeletePayment,
  useGetHonorairesTeachers, useGetHonorairesStats, useGetTeacherPayments,
  useSetTeacherHonorarium, useAddTeacherPayment, useDeleteTeacherPayment,
  useListSubjects, useListSemesters, useCreateAssignment,
} from "@workspace/api-client-react";
import type { StudentFeeRow, StudentPayment, TeacherHonorariumRow, TeacherPayment } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { InputMontant } from "@/components/ui/input-montant";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ShieldCheck, GraduationCap, BookOpen, Wallet, AlertCircle, CheckCircle2, Clock, PenLine, Pencil, X, Phone, MapPin, Users, Eye, Mail, School, BadgeCheck, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";

const ROLE_LABELS: Record<string, string> = { admin: "Admin", teacher: "Enseignant", student: "Étudiant" };
const SUB_ROLE_LABELS: Record<string, string> = {
  scolarite: "Assistant(e) de Direction",
  planificateur: "Responsable pédagogique",
  directeur: "Directeur du Centre",
  hebergement: "Responsable Hébergement",
};
const SUB_ROLE_COLORS: Record<string, string> = {
  scolarite: "bg-blue-100 text-blue-700 border-blue-200",
  planificateur: "bg-amber-100 text-amber-700 border-amber-200",
  directeur: "bg-violet-100 text-violet-700 border-violet-200",
  hebergement: "bg-teal-100 text-teal-700 border-teal-200",
};

type Tab = "teachers" | "students" | "scolarite" | "responsables" | "honoraires";

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className={`p-4 flex flex-col gap-1 ${color ?? ""}`}>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Card>
  );
}

function StatusBadge({ status }: { status: "paid" | "partial" | "unpaid" }) {
  if (status === "paid") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3" /> Soldé</span>;
  if (status === "partial") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><Clock className="w-3 h-3" /> Partiel</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"><AlertCircle className="w-3 h-3" /> Non payé</span>;
}

function StudentPaymentModal({ student, onClose }: { student: StudentFeeRow; onClose: () => void }) {
  const { data: payments = [], isLoading } = useGetStudentPayments(student.id);
  const setFee = useSetStudentFee();
  const addPaymentMut = useAddPayment();
  const deletePaymentMut = useDeletePayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [feeAmount, setFeeAmount] = useState(student.totalAmount > 0 ? student.totalAmount.toString() : "");
  const [academicYear, setAcademicYear] = useState(student.academicYear ?? "");
  const [payAmount, setPayAmount] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["scolarite"] });

  const handleSetFee = async () => {
    const amount = parseFloat(feeAmount);
    if (isNaN(amount) || amount < 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    try {
      await setFee.mutateAsync({ studentId: student.id, totalAmount: amount, academicYear: academicYear || undefined });
      toast({ title: "Frais mis à jour" });
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    try {
      await addPaymentMut.mutateAsync({ studentId: student.id, amount, description: payDesc || undefined, paymentDate: payDate });
      toast({ title: `${amount.toLocaleString("fr-FR")} FCFA enregistré` });
      setPayAmount(""); setPayDesc("");
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleDeletePayment = async (id: number) => {
    await deletePaymentMut.mutateAsync(id);
    toast({ title: "Paiement supprimé" });
    invalidate();
  };

  const totalPaid = payments.reduce((s: number, p: StudentPayment) => s + p.amount, 0);
  const totalFee = parseFloat(feeAmount) || 0;
  const remaining = Math.max(0, totalFee - totalPaid);
  const progress = totalFee > 0 ? Math.min(100, (totalPaid / totalFee) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-bold text-lg leading-tight">{student.name}</p>
        <p className="text-sm text-muted-foreground">{student.email}{student.className ? ` · ${student.className}` : ""}</p>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm font-semibold">
          <span>Progression du paiement</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Payé : {totalPaid.toLocaleString("fr-FR")} FCFA</span>
          <span>Reste : {remaining.toLocaleString("fr-FR")} FCFA</span>
        </div>
      </div>

      {/* Set fee */}
      <div className="space-y-2 border rounded-xl p-4 bg-muted/20">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Frais de scolarité total</p>
        <div className="flex gap-2">
          <InputMontant value={feeAmount} onChange={raw => setFeeAmount(raw)} placeholder="Ex: 300 000" className="flex-1" />
          <Input value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="Année (2024-25)" className="w-32" />
          <Button size="sm" onClick={handleSetFee} disabled={setFee.isPending}>
            <PenLine className="w-4 h-4 mr-1" /> Définir
          </Button>
        </div>
      </div>

      {/* Add payment */}
      <form onSubmit={handleAddPayment} className="space-y-2 border rounded-xl p-4 bg-muted/20">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Enregistrer un paiement</p>
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => { setPayAmount(remaining.toString()); setPayDesc("Solde"); }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Solder ({remaining.toLocaleString("fr-FR")} FCFA)
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InputMontant value={payAmount} onChange={raw => setPayAmount(raw)} placeholder="Montant" required />
          <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
        </div>
        <Input value={payDesc} onChange={e => setPayDesc(e.target.value)} placeholder="Description (ex: 1ère tranche)" />
        <Button type="submit" size="sm" disabled={addPaymentMut.isPending} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Enregistrer
        </Button>
      </form>

      {/* History */}
      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2">Historique</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun paiement enregistré</p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {[...payments].reverse().map((p: StudentPayment) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-card rounded-lg border">
                <div>
                  <p className="font-semibold text-sm">{p.amount.toLocaleString("fr-FR")} FCFA</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.paymentDate).toLocaleDateString("fr-FR")}
                    {p.description ? ` · ${p.description}` : ""}
                    {p.recordedByName ? ` · par ${p.recordedByName}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={() => handleDeletePayment(p.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClassFeesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classFees = [], isLoading, refetch } = useQuery({
    queryKey: ["class-fees"],
    queryFn: () => fetch("/api/scolarite/class-fees", { credentials: "include" }).then(r => r.json()),
  });
  const [editClass, setEditClass] = useState<any | null>(null);
  const [form, setForm] = useState({ totalAmount: "", academicYear: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const openEdit = (c: any) => {
    setForm({
      totalAmount: c.fee ? String(c.fee.totalAmount) : "",
      academicYear: c.fee?.academicYear ?? "",
      notes: c.fee?.notes ?? "",
    });
    setEditClass(c);
  };

  const handleSave = async () => {
    if (!editClass) return;
    const amount = parseFloat(form.totalAmount);
    if (isNaN(amount) || amount < 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/scolarite/class-fees/${editClass.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ totalAmount: amount, academicYear: form.academicYear || undefined, notes: form.notes || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      toast({ title: `Frais appliqués à ${data.appliedToStudents} étudiant(s) de ${editClass.name}` });
      setEditClass(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["scolarite"] });
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const fmt = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Chargement...</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Classe</TableHead>
                <TableHead className="text-center">Étudiants inscrits</TableHead>
                <TableHead className="text-right">Frais configuré</TableHead>
                <TableHead>Année académique</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(classFees as any[]).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Aucune classe trouvée</TableCell></TableRow>
              ) : (classFees as any[]).map((c: any) => (
                <TableRow key={c.id} className="hover:bg-muted/30">
                  <TableCell className="font-semibold">{c.name}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{c.studentCount}</TableCell>
                  <TableCell className="text-right">
                    {c.fee ? (
                      <span className="font-semibold text-primary">{fmt(c.fee.totalAmount)} FCFA</span>
                    ) : (
                      <span className="text-muted-foreground text-sm italic">Non défini</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.fee?.academicYear ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5" />
                      {c.fee ? "Modifier" : "Définir"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editClass !== null} onOpenChange={open => { if (!open) setEditClass(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editClass?.fee ? "Modifier les frais" : "Définir les frais"} — {editClass?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Montant total (FCFA)</Label>
              <InputMontant value={form.totalAmount} onChange={raw => setForm(f => ({ ...f, totalAmount: raw }))} placeholder="Ex: 500 000" />
            </div>
            <div className="space-y-1.5">
              <Label>Année académique <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
              <Input value={form.academicYear} onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))} placeholder="Ex: 2024-2025" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Remarques..." />
            </div>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              Ce montant sera automatiquement appliqué aux <strong>{editClass?.studentCount ?? 0}</strong> étudiant(s) actuellement inscrit(s) dans cette classe.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditClass(null)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.totalAmount}>
              {saving ? "Application…" : "Appliquer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScolariteTab() {
  const { data: students = [], isLoading } = useGetScolariteStudents();
  const { data: stats } = useGetScolariteStats();
  const [selectedStudent, setSelectedStudent] = useState<StudentFeeRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"students" | "classes">("students");

  const filtered = students.filter((s: StudentFeeRow) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.className ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex gap-2">
        <Button size="sm" variant={view === "students" ? "default" : "outline"} onClick={() => setView("students")} className="gap-2">
          <GraduationCap className="w-4 h-4" /> Par étudiant
        </Button>
        <Button size="sm" variant={view === "classes" ? "default" : "outline"} onClick={() => setView("classes")} className="gap-2">
          <BookOpen className="w-4 h-4" /> Par classe
        </Button>
      </div>

      {view === "classes" && <ClassFeesSection />}

      {view === "students" && <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Frais totaux attendus"
          value={`${fmt(stats?.totalExpected ?? 0)} F`}
          sub={`${stats?.studentCount ?? 0} étudiants avec frais`}
        />
        <StatCard
          label="Total encaissé"
          value={`${fmt(stats?.totalPaid ?? 0)} F`}
          color="border-green-200"
        />
        <StatCard
          label="Reste à recouvrer"
          value={`${fmt(stats?.totalRemaining ?? 0)} F`}
          color="border-red-100"
        />
        <StatCard
          label="Taux de recouvrement"
          value={`${stats?.recoveryRate ?? 0} %`}
          sub={`${stats?.fullyPaid ?? 0} soldés · ${stats?.partial ?? 0} partiels · ${stats?.noPay ?? 0} non payés`}
          color={(stats?.recoveryRate ?? 0) >= 75 ? "border-green-200" : (stats?.recoveryRate ?? 0) >= 40 ? "border-amber-200" : "border-red-100"}
        />
      </div>

      {/* Global progress */}
      {(stats?.totalExpected ?? 0) > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">Recouvrement global</span>
            <span className="font-bold text-primary">{stats?.recoveryRate ?? 0}%</span>
          </div>
          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${stats?.recoveryRate ?? 0}%`,
                background: (stats?.recoveryRate ?? 0) >= 75 ? "#22c55e" : (stats?.recoveryRate ?? 0) >= 40 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
        </div>
      )}

      {/* Search + table */}
      <Input
        placeholder="Rechercher un étudiant ou une classe..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Chargement...</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="bg-muted/50">
                <TableHead>Étudiant</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead className="text-right">Frais total</TableHead>
                <TableHead className="text-right">Payé</TableHead>
                <TableHead className="text-right">Reste</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Aucun étudiant trouvé</TableCell></TableRow>
              ) : filtered.map((s: StudentFeeRow) => (
                <TableRow key={s.id} className="hover:bg-muted/30">
                  <TableCell className="font-semibold">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.className ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {s.totalAmount > 0 ? `${fmt(s.totalAmount)} F` : <span className="text-muted-foreground text-xs">Non défini</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-700">
                    {s.totalPaid > 0 ? `${fmt(s.totalPaid)} F` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-600">
                    {s.remaining > 0 ? `${fmt(s.remaining)} F` : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setSelectedStudent(s)}>
                      <Wallet className="w-3.5 h-3.5" /> Gérer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>
      )}

      <Dialog open={!!selectedStudent} onOpenChange={open => !open && setSelectedStudent(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Gestion de la scolarité</DialogTitle></DialogHeader>
          {selectedStudent && <StudentPaymentModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
        </DialogContent>
      </Dialog>
      </div>}
    </div>
  );
}

// ─── Teacher Payment Modal ────────────────────────────────────────────────────
function TeacherPaymentModal({ teacher, onClose }: { teacher: TeacherHonorariumRow; onClose: () => void }) {
  const { data: payments = [], isLoading } = useGetTeacherPayments(teacher.id);
  const setHonorarium = useSetTeacherHonorarium();
  const addPaymentMut = useAddTeacherPayment();
  const deletePaymentMut = useDeleteTeacherPayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [feeAmount, setFeeAmount] = useState(teacher.totalAmount > 0 ? teacher.totalAmount.toString() : "");
  const [periodLabel, setPeriodLabel] = useState(teacher.periodLabel ?? "");
  const [payAmount, setPayAmount] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["honoraires"] });

  const handleSetFee = async () => {
    const amount = parseFloat(feeAmount);
    if (isNaN(amount) || amount < 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    try {
      await setHonorarium.mutateAsync({ teacherId: teacher.id, totalAmount: amount, periodLabel: periodLabel || undefined });
      toast({ title: "Honoraires mis à jour" });
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    try {
      await addPaymentMut.mutateAsync({ teacherId: teacher.id, amount, description: payDesc || undefined, paymentDate: payDate });
      toast({ title: `${amount.toLocaleString("fr-FR")} FCFA versé` });
      setPayAmount(""); setPayDesc("");
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleDeletePayment = async (id: number) => {
    await deletePaymentMut.mutateAsync(id);
    toast({ title: "Paiement supprimé" });
    invalidate();
  };

  const totalPaid = payments.reduce((s: number, p: TeacherPayment) => s + p.amount, 0);
  const totalFee = parseFloat(feeAmount) || 0;
  const remaining = Math.max(0, totalFee - totalPaid);
  const progress = totalFee > 0 ? Math.min(100, (totalPaid / totalFee) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-bold text-lg leading-tight">{teacher.name}</p>
        <p className="text-sm text-muted-foreground">{teacher.email}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm font-semibold">
          <span>Progression du versement</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Versé : {totalPaid.toLocaleString("fr-FR")} FCFA</span>
          <span>Reste : {remaining.toLocaleString("fr-FR")} FCFA</span>
        </div>
      </div>

      <div className="space-y-2 border rounded-xl p-4 bg-muted/20">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Honoraires totaux</p>
        <div className="flex gap-2">
          <InputMontant value={feeAmount} onChange={raw => setFeeAmount(raw)} placeholder="Ex: 150 000" className="flex-1" />
          <Input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} placeholder="Période (ex: S1 2024)" className="w-36" />
          <Button size="sm" onClick={handleSetFee} disabled={setHonorarium.isPending}>
            <PenLine className="w-4 h-4 mr-1" /> Définir
          </Button>
        </div>
      </div>

      <form onSubmit={handleAddPayment} className="space-y-2 border rounded-xl p-4 bg-muted/20">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Enregistrer un versement</p>
        <div className="grid grid-cols-2 gap-2">
          <InputMontant value={payAmount} onChange={raw => setPayAmount(raw)} placeholder="Montant" required />
          <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
        </div>
        <Input value={payDesc} onChange={e => setPayDesc(e.target.value)} placeholder="Description (ex: avance sur honoraires)" />
        <Button type="submit" size="sm" disabled={addPaymentMut.isPending} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Enregistrer
        </Button>
      </form>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2">Historique</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun versement enregistré</p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {[...payments].reverse().map((p: TeacherPayment) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-card rounded-lg border">
                <div>
                  <p className="font-semibold text-sm">{p.amount.toLocaleString("fr-FR")} FCFA</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.paymentDate).toLocaleDateString("fr-FR")}
                    {p.description ? ` · ${p.description}` : ""}
                    {p.recordedByName ? ` · par ${p.recordedByName}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={() => handleDeletePayment(p.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Honoraires Tab ───────────────────────────────────────────────────────────
function HonorairesTab() {
  const { data: teachers = [], isLoading } = useGetHonorairesTeachers();
  const { data: stats } = useGetHonorairesStats();
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherHonorariumRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = teachers.filter((t: TeacherHonorariumRow) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Honoraires totaux dus" value={`${fmt(stats?.totalExpected ?? 0)} F`} sub={`${stats?.teacherCount ?? 0} enseignants enregistrés`} />
        <StatCard label="Total versé" value={`${fmt(stats?.totalPaid ?? 0)} F`} color="border-green-200" />
        <StatCard label="Reste à verser" value={`${fmt(stats?.totalRemaining ?? 0)} F`} color="border-red-100" />
        <StatCard
          label="Taux de versement"
          value={`${stats?.recoveryRate ?? 0} %`}
          sub={`${stats?.fullyPaid ?? 0} soldés · ${stats?.partial ?? 0} partiels · ${stats?.noPay ?? 0} non versés`}
          color={(stats?.recoveryRate ?? 0) >= 75 ? "border-green-200" : (stats?.recoveryRate ?? 0) >= 40 ? "border-amber-200" : "border-red-100"}
        />
      </div>

      {(stats?.totalExpected ?? 0) > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">Versement global</span>
            <span className="font-bold text-primary">{stats?.recoveryRate ?? 0}%</span>
          </div>
          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${stats?.recoveryRate ?? 0}%`,
                background: (stats?.recoveryRate ?? 0) >= 75 ? "#22c55e" : (stats?.recoveryRate ?? 0) >= 40 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
        </div>
      )}

      <Input placeholder="Rechercher un enseignant..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Chargement...</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="bg-muted/50">
                <TableHead>Enseignant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Honoraires</TableHead>
                <TableHead className="text-right">Versé</TableHead>
                <TableHead className="text-right">Reste</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Aucun enseignant trouvé</TableCell></TableRow>
              ) : filtered.map((t: TeacherHonorariumRow) => (
                <TableRow key={t.id} className="hover:bg-muted/30">
                  <TableCell className="font-semibold">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.email}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {t.totalAmount > 0 ? `${fmt(t.totalAmount)} F` : <span className="text-muted-foreground text-xs">Non défini</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-700">
                    {t.totalPaid > 0 ? `${fmt(t.totalPaid)} F` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-600">
                    {t.remaining > 0 ? `${fmt(t.remaining)} F` : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setSelectedTeacher(t)}>
                      <Wallet className="w-3.5 h-3.5" /> Gérer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>
      )}

      <Dialog open={!!selectedTeacher} onOpenChange={open => !open && setSelectedTeacher(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Gestion des honoraires</DialogTitle></DialogHeader>
          {selectedTeacher && <TeacherPaymentModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState<Tab>("teachers");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("student");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });
  const [editProfileForm, setEditProfileForm] = useState({ matricule: "", dateNaissance: "", lieuNaissance: "", sexe: "", phone: "", address: "", parentName: "", parentPhone: "", parentEmail: "", parentAddress: "" });
  const [editProfileLoading, setEditProfileLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [teacherAssignmentRows, setTeacherAssignmentRows] = useState<{ subjectId: string; classId: string; semesterId: string }[]>([]);
  const [createStudentClassId, setCreateStudentClassId] = useState<string>("");
  const [createProfileForm, setCreateProfileForm] = useState({ firstName: "", lastName: "", sexe: "", matricule: "", dateNaissance: "", lieuNaissance: "", phone: "", address: "", parentName: "", parentPhone: "", parentEmail: "", parentAddress: "" });
  const emptyCreateProfile = { firstName: "", lastName: "", sexe: "", matricule: "", dateNaissance: "", lieuNaissance: "", phone: "", address: "", parentName: "", parentPhone: "", parentEmail: "", parentAddress: "" };
  const [viewUser, setViewUser] = useState<any | null>(null);
  const [viewProfile, setViewProfile] = useState<any | null>(null);
  const [viewProfileLoading, setViewProfileLoading] = useState(false);
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterSexe, setFilterSexe] = useState<string>("all");
  const [searchStudent, setSearchStudent] = useState("");
  const [searchTeacher, setSearchTeacher] = useState("");
  const { data: currentUser } = useGetCurrentUser();
  const currentSubRole = (currentUser as any)?.adminSubRole as string | null;
  const isDirecteur = currentSubRole === "directeur";
  const isPlanificateur = currentSubRole === "planificateur";
  const { data: users, isLoading } = useListUsers();
  const { data: classes } = useListClasses();
  const { data: subjects } = useListSubjects();
  const { data: semesters } = useListSemesters();
  const createUser = useCreateUser();
  const createAssignment = useCreateAssignment();
  const deleteUser = useDeleteUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const teachers = users?.filter((u: any) => u.role === "teacher") || [];
  const students = users?.filter((u: any) => u.role === "student") || [];
  const admins = users?.filter((u: any) => u.role === "admin") || [];

  // ── Validation helpers ─────────────────────────────────────────────────────
  function parseFrenchDateFE(s: string): Date | null {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    if (d.getFullYear() !== parseInt(m[3]) || d.getMonth() !== parseInt(m[2]) - 1 || d.getDate() !== parseInt(m[1])) return null;
    return d;
  }
  function formatDateInput(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  function isDateInvalidFE(s: string): boolean {
    const d = parseFrenchDateFE(s);
    return !d || d >= new Date();
  }
  function isValidPhoneFE(s: string): boolean {
    return /^\+?[\d\s\(\)\-\.]{7,25}$/.test(s) && s.replace(/\D/g, "").length >= 7;
  }

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const role = formData.get("role") as "admin" | "teacher" | "student";
    const adminSubRole = formData.get("adminSubRole") as string;
    const phone = formData.get("phone") as string;
    if (!role) {
      toast({ title: "Veuillez sélectionner un rôle.", variant: "destructive" });
      return;
    }
    if (role === "student" && !createStudentClassId) {
      toast({ title: "Veuillez sélectionner une classe pour l'étudiant.", variant: "destructive" });
      return;
    }

    // ── Client-side validation for students ──────────────────────────────────
    if (role === "student") {
      const f = createProfileForm;
      const missing: string[] = [];
      if (!f.lastName.trim()) missing.push("Nom");
      if (!f.firstName.trim()) missing.push("Prénom");
      if (!f.sexe.trim()) missing.push("Sexe");
      if (!f.matricule.trim()) missing.push("Matricule");
      if (!f.dateNaissance.trim()) missing.push("Date de naissance");
      if (!f.lieuNaissance.trim()) missing.push("Lieu de naissance");
      if (!f.parentName.trim()) missing.push("Nom du parent/tuteur");
      if (!f.parentPhone.trim()) missing.push("Contact du parent/tuteur");
      if (missing.length > 0) {
        toast({ title: "Champs obligatoires manquants", description: missing.join(", "), variant: "destructive" });
        return;
      }
      if (!parseFrenchDateFE(f.dateNaissance.trim())) {
        toast({ title: "Date de naissance invalide", description: "Format attendu : JJ/MM/AAAA", variant: "destructive" });
        return;
      }
      if (parseFrenchDateFE(f.dateNaissance.trim())! >= new Date()) {
        toast({ title: "Date de naissance invalide", description: "La date doit être antérieure à aujourd'hui.", variant: "destructive" });
        return;
      }
      if (!isValidPhoneFE(f.parentPhone.trim())) {
        toast({ title: "Contact du parent invalide", description: "Numéro de téléphone invalide (ex : +225 07 00 00 00 00)", variant: "destructive" });
        return;
      }
    }

    try {
      const f = createProfileForm;
      const newUser = await createUser.mutateAsync({
        data: {
          name: role === "student" ? `${f.firstName.trim()} ${f.lastName.trim()}` : formData.get("name") as string,
          firstName: role === "student" ? f.firstName.trim() : undefined,
          lastName: role === "student" ? f.lastName.trim() : undefined,
          email: formData.get("email") as string,
          password: formData.get("password") as string,
          role,
          classId: role === "student" && createStudentClassId ? parseInt(createStudentClassId) : undefined,
          adminSubRole: role === "admin" ? adminSubRole : undefined,
          phone: role === "teacher" && phone ? phone : undefined,
          sexe: role === "student" ? f.sexe.trim() : undefined,
          matricule: role === "student" ? f.matricule.trim() : undefined,
          dateNaissance: role === "student" ? f.dateNaissance.trim() : undefined,
          lieuNaissance: role === "student" ? f.lieuNaissance.trim() : undefined,
          parentName: role === "student" ? f.parentName.trim() : undefined,
          parentPhone: role === "student" ? f.parentPhone.trim() : undefined,
        } as any,
      });

      if (role === "teacher" && teacherAssignmentRows.length > 0) {
        const validRows = teacherAssignmentRows.filter(r => r.subjectId && r.classId && r.semesterId);
        await Promise.allSettled(
          validRows.map(row =>
            createAssignment.mutateAsync({
              data: {
                teacherId: (newUser as any).id,
                subjectId: parseInt(row.subjectId),
                classId: parseInt(row.classId),
                semesterId: parseInt(row.semesterId),
              },
            })
          )
        );
        queryClient.invalidateQueries({ queryKey: ["/api/admin/teacher-assignments"] });
      }

      if (role === "student") {
        const p = createProfileForm;
        const hasProfile = p.matricule || p.phone || p.address || p.parentName || p.parentPhone || p.parentEmail || p.parentAddress || p.dateNaissance || p.lieuNaissance || p.sexe;
        if (hasProfile) {
          await fetch(`/api/admin/students/${(newUser as any).id}/profile`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              matricule: p.matricule || null,
              dateNaissance: p.dateNaissance.trim() || null,
              lieuNaissance: p.lieuNaissance.trim() || null,
              sexe: p.sexe || null,
              phone: p.phone || null,
              address: p.address || null,
              parentName: p.parentName || null,
              parentPhone: p.parentPhone || null,
              parentEmail: p.parentEmail || null,
              parentAddress: p.parentAddress || null,
            }),
          });
        }
      }

      toast({ title: "Utilisateur créé avec succès" });
      setTeacherAssignmentRows([]);
      setCreateProfileForm(emptyCreateProfile);
      setIsDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } catch (e: any) {
      toast({ title: e?.message ?? "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    const target = users?.find((u: any) => u.id === id);
    const isScolarite = currentSubRole === "scolarite";
    if (isScolarite && target?.role !== "student") {
      toast({ title: "L'Assistant(e) de Direction peut uniquement supprimer des étudiants.", variant: "destructive" });
      setPendingDeleteId(null);
      return;
    }
    if (isPlanificateur && target?.role !== "teacher") {
      toast({ title: "Le Responsable pédagogique peut uniquement supprimer des enseignants.", variant: "destructive" });
      setPendingDeleteId(null);
      return;
    }
    try {
      await deleteUser.mutateAsync({ id });
      toast({ title: "Utilisateur supprimé" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } catch { toast({ title: "Erreur lors de la suppression", variant: "destructive" }); }
    setPendingDeleteId(null);
  };

  const canDelete = (u: any) => {
    if (u.id === (currentUser as any)?.id) return false; // jamais son propre compte
    if (isDirecteur) return true; // le Directeur peut supprimer tout le monde sauf lui-même
    if (currentSubRole === "scolarite") return u.role === "student";
    if (isPlanificateur) return u.role === "teacher";
    return false;
  };

  const canEdit = (u: any) => {
    if (isDirecteur) return true;
    if (isPlanificateur) return u.role === "teacher";
    if (currentSubRole === "scolarite") return u.role === "student";
    return false;
  };

  const openEdit = async (u: any) => {
    setEditForm({ name: u.name, email: u.email, password: "" });
    setEditProfileForm({ matricule: "", dateNaissance: "", lieuNaissance: "", sexe: "", phone: "", address: "", parentName: "", parentPhone: "", parentEmail: "", parentAddress: "" });
    setEditUser(u);
    if (u.role === "student") {
      setEditProfileLoading(true);
      try {
        const res = await fetch(`/api/admin/students/${u.id}/profile`, { credentials: "include" });
        if (res.ok) {
          const p = await res.json();
          setEditProfileForm({
            matricule: p.matricule ?? "",
            dateNaissance: p.dateNaissance ?? "",
            lieuNaissance: p.lieuNaissance ?? "",
            sexe: p.sexe ?? "",
            phone: p.phone ?? "",
            address: p.address ?? "",
            parentName: p.parentName ?? "",
            parentPhone: p.parentPhone ?? "",
            parentEmail: p.parentEmail ?? "",
            parentAddress: p.parentAddress ?? "",
          });
        }
      } catch { /* silently ignore */ }
      finally { setEditProfileLoading(false); }
    }
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setEditSaving(true);
    try {
      const body: any = { name: editForm.name.trim(), email: editForm.email.trim() };
      if (editForm.password.trim()) body.password = editForm.password;
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      if (editUser.role === "student") {
        await fetch(`/api/admin/students/${editUser.id}/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            matricule: editProfileForm.matricule.trim() || null,
            dateNaissance: editProfileForm.dateNaissance.trim() || null,
            lieuNaissance: editProfileForm.lieuNaissance.trim() || null,
            sexe: editProfileForm.sexe.trim() || null,
            phone: editProfileForm.phone.trim() || null,
            address: editProfileForm.address.trim() || null,
            parentName: editProfileForm.parentName.trim() || null,
            parentPhone: editProfileForm.parentPhone.trim() || null,
            parentEmail: editProfileForm.parentEmail.trim() || null,
            parentAddress: editProfileForm.parentAddress.trim() || null,
          }),
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur modifié avec succès" });
      setEditUser(null);
    } catch {
      toast({ title: "Erreur lors de la modification", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const isScolarite = currentSubRole === "scolarite";

  const openView = async (u: any) => {
    setViewUser(u);
    setViewProfile(null);
    if (u.role === "student") {
      setViewProfileLoading(true);
      try {
        const res = await fetch(`/api/admin/students/${u.id}/profile`, { credentials: "include" });
        if (res.ok) setViewProfile(await res.json());
      } finally {
        setViewProfileLoading(false);
      }
    }
  };

  const tabs: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: "teachers", label: "Enseignants", icon: BookOpen, count: teachers.length },
    { key: "students", label: "Étudiants", icon: GraduationCap, count: students.length },
    ...(isDirecteur ? [{ key: "responsables" as Tab, label: "Responsables", icon: ShieldCheck, count: admins.length }] : []),
    ...(!isPlanificateur ? [{ key: "scolarite" as Tab, label: "Scolarité", icon: Wallet }] : []),
    ...(!isScolarite ? [{ key: "honoraires" as Tab, label: "Honoraires", icon: Wallet }] : []),
  ];

  const genderStats = useMemo(() => {
    const garcons = students.filter((u: any) => u.sexe === "M").length;
    const filles = students.filter((u: any) => u.sexe === "F").length;
    const total = students.length;
    const unknown = total - garcons - filles;
    const pctG = total > 0 ? Math.round((garcons / total) * 100) : 0;
    const pctF = total > 0 ? Math.round((filles / total) * 100) : 0;
    return { garcons, filles, total, unknown, pctG, pctF };
  }, [students]);

  const listToShow = useMemo(() => {
    const base = activeTab === "teachers" ? teachers : activeTab === "responsables" ? admins : students;
    if (activeTab === "students") {
      return base.filter((u: any) => {
        const matchesClass = filterClass === "all" || u.className === filterClass;
        const matchesSexe = filterSexe === "all" || u.sexe === filterSexe;
        const q = searchStudent.toLowerCase();
        const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        return matchesClass && matchesSexe && matchesSearch;
      });
    }
    if (activeTab === "teachers") {
      const q = searchTeacher.toLowerCase();
      return !q ? base : base.filter((u: any) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    return base;
  }, [activeTab, teachers, admins, students, filterClass, filterSexe, searchStudent, searchTeacher]);

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">Utilisateurs</h1>
            <p className="text-muted-foreground text-sm mt-1">Gérez les accès et les profils de l'établissement.</p>
          </div>
          {(isDirecteur || isPlanificateur || isScolarite) && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); const defaultRole = isPlanificateur ? "teacher" : isScolarite ? "student" : ""; if (open) { setSelectedRole(defaultRole); } else { setTeacherAssignmentRows([]); setSelectedRole(defaultRole); setCreateProfileForm(emptyCreateProfile); setCreateStudentClassId(""); } }}>
              <DialogTrigger asChild>
                <Button className="gap-2 shrink-0"><Plus className="w-4 h-4" /> Nouvel Utilisateur</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Créer un utilisateur</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 pt-2" autoComplete="off">
                  {selectedRole !== "student" && (
                    <div className="space-y-1"><Label>Nom complet</Label><Input name="name" required={selectedRole !== "student"} autoComplete="off" /></div>
                  )}
                  <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" required autoComplete="off" /></div>
                  <div className="space-y-1"><Label>Mot de passe</Label><PasswordInput name="password" required minLength={6} autoComplete="new-password" /></div>
                  <div className="space-y-1">
                    <Label>Rôle</Label>
                    <Select name="role" value={selectedRole} onValueChange={(v) => { setSelectedRole(v); setTeacherAssignmentRows([]); }}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner un rôle..." /></SelectTrigger>
                      <SelectContent>
                        {!isPlanificateur && <SelectItem value="student">Étudiant</SelectItem>}
                        {!isScolarite && <SelectItem value="teacher">Enseignant</SelectItem>}
                        {isDirecteur && <SelectItem value="admin">Admin</SelectItem>}
                      </SelectContent>
                    </Select>
                    {!selectedRole && <p className="text-xs text-destructive mt-0.5">Veuillez sélectionner un rôle</p>}
                  </div>
                  {selectedRole === "student" && (
                    <>
                      {/* ── Identité ── */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Prénom <span className="text-destructive">*</span></Label>
                          <Input
                            value={createProfileForm.firstName}
                            onChange={e => setCreateProfileForm(f => ({ ...f, firstName: e.target.value }))}
                            placeholder="Ex: Konan"
                            className={!createProfileForm.firstName.trim() ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}
                          />
                          {!createProfileForm.firstName.trim() && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                        </div>
                        <div className="space-y-1">
                          <Label>Nom <span className="text-destructive">*</span></Label>
                          <Input
                            value={createProfileForm.lastName}
                            onChange={e => setCreateProfileForm(f => ({ ...f, lastName: e.target.value }))}
                            placeholder="Ex: Kouassi"
                            className={!createProfileForm.lastName.trim() ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}
                          />
                          {!createProfileForm.lastName.trim() && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Sexe <span className="text-destructive">*</span></Label>
                        <Select value={createProfileForm.sexe} onValueChange={v => setCreateProfileForm(f => ({ ...f, sexe: v }))}>
                          <SelectTrigger className={!createProfileForm.sexe ? "border-destructive/50" : ""}><SelectValue placeholder="Sélectionner le sexe..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="M">Masculin</SelectItem>
                            <SelectItem value="F">Féminin</SelectItem>
                          </SelectContent>
                        </Select>
                        {!createProfileForm.sexe && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Classe <span className="text-destructive">*</span></Label>
                          <Select value={createStudentClassId} onValueChange={setCreateStudentClassId}>
                            <SelectTrigger className={!createStudentClassId ? "border-destructive/50" : ""}><SelectValue placeholder="Choisir une classe..." /></SelectTrigger>
                            <SelectContent>{classes?.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                          </Select>
                          {!createStudentClassId && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="flex items-center gap-1.5"><School className="w-3.5 h-3.5 text-muted-foreground" /> N° Matricule <span className="text-destructive">*</span></Label>
                          <Input
                            value={createProfileForm.matricule}
                            onChange={e => setCreateProfileForm(f => ({ ...f, matricule: e.target.value }))}
                            placeholder="Ex: INP-HB/2024/001"
                            className={!createProfileForm.matricule.trim() ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}
                          />
                          {!createProfileForm.matricule.trim() && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-sm">Date de naissance <span className="text-destructive">*</span></Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={createProfileForm.dateNaissance}
                            onChange={e => setCreateProfileForm(f => ({ ...f, dateNaissance: formatDateInput(e.target.value) }))}
                            placeholder="JJ/MM/AAAA"
                            maxLength={10}
                            className={!createProfileForm.dateNaissance.trim() ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}
                          />
                          {!createProfileForm.dateNaissance.trim() && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                          {createProfileForm.dateNaissance.length === 10 && isDateInvalidFE(createProfileForm.dateNaissance) && (
                            <p className="text-xs text-destructive mt-0.5">Veuillez saisir une date de naissance valide</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm">Lieu de naissance <span className="text-destructive">*</span></Label>
                          <Input
                            value={createProfileForm.lieuNaissance}
                            onChange={e => setCreateProfileForm(f => ({ ...f, lieuNaissance: e.target.value }))}
                            placeholder="Ex: Abidjan"
                            className={!createProfileForm.lieuNaissance.trim() ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}
                          />
                          {!createProfileForm.lieuNaissance.trim() && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                        </div>
                      </div>
                    </>
                  )}
                  {selectedRole === "student" && (
                    <div className="space-y-3">
                      {/* ── Contact étudiant (optionnel) ── */}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Contact <span className="normal-case font-normal">(optionnel)</span></span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="flex items-center gap-1.5 text-sm"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> Téléphone</Label>
                          <Input value={createProfileForm.phone} onChange={e => setCreateProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="+225 07 00 00 00 00" />
                        </div>
                        <div className="space-y-1">
                          <Label className="flex items-center gap-1.5 text-sm"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Adresse</Label>
                          <Input value={createProfileForm.address} onChange={e => setCreateProfileForm(f => ({ ...f, address: e.target.value }))} placeholder="Quartier, Ville" />
                        </div>
                      </div>
                      {/* ── Parent / Tuteur (obligatoire) ── */}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium uppercase tracking-wide">Parent / Tuteur <span className="text-destructive">*</span></span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Nom du parent / tuteur <span className="text-destructive">*</span></Label>
                        <Input
                          value={createProfileForm.parentName}
                          onChange={e => setCreateProfileForm(f => ({ ...f, parentName: e.target.value }))}
                          placeholder="Prénom Nom"
                          className={!createProfileForm.parentName.trim() ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}
                        />
                        {!createProfileForm.parentName.trim() && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="flex items-center gap-1.5 text-sm"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> Contact parent <span className="text-destructive">*</span></Label>
                          <Input
                            value={createProfileForm.parentPhone}
                            onChange={e => setCreateProfileForm(f => ({ ...f, parentPhone: e.target.value }))}
                            placeholder="+225 07 00 00 00 00"
                            className={!createProfileForm.parentPhone.trim() || !isValidPhoneFE(createProfileForm.parentPhone.trim()) ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}
                          />
                          {!createProfileForm.parentPhone.trim() && <p className="text-xs text-destructive mt-0.5">Requis</p>}
                          {createProfileForm.parentPhone.trim() && !isValidPhoneFE(createProfileForm.parentPhone.trim()) && (
                            <p className="text-xs text-destructive mt-0.5">Numéro invalide</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm">Email parent <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                          <Input type="email" autoComplete="off" value={createProfileForm.parentEmail} onChange={e => setCreateProfileForm(f => ({ ...f, parentEmail: e.target.value }))} placeholder="prenom.nom@exemple.ci" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1.5 text-sm"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Adresse parent <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                        <Input value={createProfileForm.parentAddress} onChange={e => setCreateProfileForm(f => ({ ...f, parentAddress: e.target.value }))} placeholder="Quartier, Ville" />
                      </div>
                    </div>
                  )}
                  {selectedRole === "admin" && (
                    <div className="space-y-1">
                      <Label>Sous-rôle</Label>
                      <Select name="adminSubRole" required defaultValue="scolarite">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scolarite">Assistant(e) de Direction</SelectItem>
                          <SelectItem value="planificateur">Responsable pédagogique</SelectItem>
                          <SelectItem value="directeur">Directeur du Centre</SelectItem>
                          <SelectItem value="hebergement">Responsable Hébergement</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {selectedRole === "teacher" && (
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> Téléphone <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                      <Input name="phone" type="tel" placeholder="+225 07 00 00 00 00" autoComplete="off" />
                    </div>
                  )}
                  {selectedRole === "teacher" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Matières associées <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs h-7"
                          onClick={() => setTeacherAssignmentRows(prev => [...prev, { subjectId: "", classId: "", semesterId: "" }])}
                        >
                          <Plus className="w-3 h-3" /> Ajouter
                        </Button>
                      </div>
                      {teacherAssignmentRows.length === 0 && (
                        <p className="text-xs text-muted-foreground italic border border-dashed rounded-md p-3 text-center">
                          Aucune matière — vous pourrez les assigner plus tard depuis la page Assignations.
                        </p>
                      )}
                      {teacherAssignmentRows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end p-3 bg-muted/40 rounded-lg border">
                          <div className="space-y-1">
                            <Label className="text-xs">Matière</Label>
                            <Select value={row.subjectId} onValueChange={val => setTeacherAssignmentRows(prev => prev.map((r, i) => i === idx ? { ...r, subjectId: val } : r))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Matière..." /></SelectTrigger>
                              <SelectContent>
                                {(subjects as any[])?.map((s: any) => <SelectItem key={s.id} value={s.id.toString()} className="text-xs">{s.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Classe</Label>
                            <Select value={row.classId} onValueChange={val => setTeacherAssignmentRows(prev => prev.map((r, i) => i === idx ? { ...r, classId: val } : r))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Classe..." /></SelectTrigger>
                              <SelectContent>
                                {classes?.map((c: any) => <SelectItem key={c.id} value={c.id.toString()} className="text-xs">{c.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Semestre</Label>
                            <Select value={row.semesterId} onValueChange={val => setTeacherAssignmentRows(prev => prev.map((r, i) => i === idx ? { ...r, semesterId: val } : r))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Semestre..." /></SelectTrigger>
                              <SelectContent>
                                {(semesters as any[])?.map((s: any) => <SelectItem key={s.id} value={s.id.toString()} className="text-xs">{s.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setTeacherAssignmentRows(prev => prev.filter((_, i) => i !== idx))}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      createUser.isPending ||
                      (selectedRole === "student" && (
                        !createProfileForm.firstName.trim() ||
                        !createProfileForm.lastName.trim() ||
                        !createProfileForm.sexe.trim() ||
                        !createProfileForm.matricule.trim() ||
                        !createProfileForm.dateNaissance.trim() ||
                        !createProfileForm.lieuNaissance.trim() ||
                        !createProfileForm.parentName.trim() ||
                        !createProfileForm.parentPhone.trim() ||
                        !isValidPhoneFE(createProfileForm.parentPhone.trim()) ||
                        !parseFrenchDateFE(createProfileForm.dateNaissance.trim())
                      ))
                    }
                  >
                    {createUser.isPending ? "Création..." : "Créer l'utilisateur"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${
                  activeTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Scolarité tab */}
        {activeTab === "scolarite" && <ScolariteTab />}

        {/* Honoraires tab */}
        {activeTab === "honoraires" && <HonorairesTab />}

        {/* Gender stats — students only */}
        {activeTab === "students" && (
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-lg shrink-0">👥</div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total</p>
                <p className="text-xl font-bold text-foreground leading-tight">{genderStats.total}</p>
                <p className="text-xs text-muted-foreground">étudiant{genderStats.total !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-lg shrink-0">👨</div>
              <div>
                <p className="text-xs text-blue-600 font-medium">Garçons</p>
                <p className="text-xl font-bold text-blue-800 leading-tight">{genderStats.garcons}</p>
                <p className="text-xs text-blue-500">{genderStats.pctG}% des étudiants</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-pink-50 border border-pink-100 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center text-lg shrink-0">👩</div>
              <div>
                <p className="text-xs text-pink-600 font-medium">Filles</p>
                <p className="text-xl font-bold text-pink-800 leading-tight">{genderStats.filles}</p>
                <p className="text-xs text-pink-500">{genderStats.pctF}% des étudiants</p>
              </div>
            </div>
          </div>
        )}

        {/* Teachers / Students / Responsables tab */}
        {(activeTab === "teachers" || activeTab === "students" || activeTab === "responsables") && (
          <div className="space-y-3">
          {activeTab === "teachers" && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Rechercher un enseignant..."
                value={searchTeacher}
                onChange={e => setSearchTeacher(e.target.value)}
                className="w-56"
              />
              {searchTeacher && (
                <button onClick={() => setSearchTeacher("")} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Réinitialiser
                </button>
              )}
            </div>
          )}
          {activeTab === "students" && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Rechercher un étudiant..."
                value={searchStudent}
                onChange={e => setSearchStudent(e.target.value)}
                className="w-56"
              />
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Toutes les classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
                  {(classes as any[])?.map((c: any) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSexe} onValueChange={setFilterSexe}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Genre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les genres</SelectItem>
                  <SelectItem value="M">👨 Garçons</SelectItem>
                  <SelectItem value="F">👩 Filles</SelectItem>
                </SelectContent>
              </Select>
              {(filterClass !== "all" || filterSexe !== "all" || searchStudent) && (
                <button
                  onClick={() => { setFilterClass("all"); setFilterSexe("all"); setSearchStudent(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          )}
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-y-auto max-h-[calc(100vh-360px)]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="bg-muted/50">
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Sous-rôle / Classe</TableHead>
                  {activeTab === "students" && <TableHead>Matricule</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={activeTab === "students" ? 6 : 5} className="text-center py-10 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : listToShow.length === 0 ? (
                  <TableRow><TableCell colSpan={activeTab === "students" ? 6 : 5} className="text-center py-10 text-muted-foreground">Aucun utilisateur</TableCell></TableRow>
                ) : listToShow.map((u: any) => (
                  <TableRow key={u.id} className="hover:bg-muted/30">
                    <TableCell className="font-semibold">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border ${
                        u.role === "admin" ? "bg-red-100 text-red-700 border-red-200"
                        : u.role === "teacher" ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-purple-100 text-purple-700 border-purple-200"
                      }`}>
                        {u.role === "admin" ? <ShieldCheck className="w-3 h-3" />
                          : u.role === "teacher" ? <BookOpen className="w-3 h-3" />
                          : <GraduationCap className="w-3 h-3" />}
                        {ROLE_LABELS[u.role]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {u.adminSubRole
                        ? <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${SUB_ROLE_COLORS[u.adminSubRole] ?? ""}`}>{SUB_ROLE_LABELS[u.adminSubRole]}</span>
                        : u.className
                        ? <span className="text-sm text-muted-foreground">{u.className}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {activeTab === "students" && (
                      <TableCell>
                        {u.matricule
                          ? <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded border border-border text-foreground">{u.matricule}</span>
                          : <span className="text-muted-foreground text-xs italic">—</span>}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(u.role === "student" || u.role === "teacher") && (
                          <Button variant="ghost" size="icon" className="text-blue-400 hover:text-blue-600" title="Voir les infos" onClick={() => openView(u)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {canEdit(u) && (
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => openEdit(u)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete(u) && (
                          <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600" onClick={() => setPendingDeleteId(u.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
          </div>
        )}

        {/* Edit User Dialog */}
        <Dialog open={editUser !== null} onOpenChange={open => { if (!open) setEditUser(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Modifier {editUser?.role === "student" ? "l'étudiant" : "l'utilisateur"}</DialogTitle>
            </DialogHeader>
            {editUser?.role === "student" ? (
              <Tabs defaultValue="identity" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="identity" className="gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Identité</TabsTrigger>
                  <TabsTrigger value="contact" className="gap-1.5"><Phone className="w-3.5 h-3.5" /> Coordonnées</TabsTrigger>
                  <TabsTrigger value="parents" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Parents</TabsTrigger>
                </TabsList>

                <TabsContent value="identity" className="space-y-4 mt-0">
                  <div className="space-y-1">
                    <Label>Nom complet</Label>
                    <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input type="email" autoComplete="off" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  {editUser?.role === "student" && (
                    <>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1.5"><School className="w-3.5 h-3.5 text-muted-foreground" /> N° Matricule</Label>
                        <Input value={editProfileForm.matricule} onChange={e => setEditProfileForm(f => ({ ...f, matricule: e.target.value }))} placeholder="Ex: INP-HB/2024/001" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-sm">Date de naissance</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={editProfileForm.dateNaissance}
                            onChange={e => setEditProfileForm(f => ({ ...f, dateNaissance: formatDateInput(e.target.value) }))}
                            placeholder="JJ/MM/AAAA"
                            maxLength={10}
                          />
                          {editProfileForm.dateNaissance.length === 10 && isDateInvalidFE(editProfileForm.dateNaissance) && (
                            <p className="text-xs text-destructive mt-0.5">Veuillez saisir une date de naissance valide</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm">Lieu de naissance</Label>
                          <Input value={editProfileForm.lieuNaissance} onChange={e => setEditProfileForm(f => ({ ...f, lieuNaissance: e.target.value }))} placeholder="Ex: Abidjan" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1.5 text-sm">Sexe</Label>
                        <Select value={editProfileForm.sexe} onValueChange={v => setEditProfileForm(f => ({ ...f, sexe: v }))}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="M">Masculin</SelectItem>
                            <SelectItem value="F">Féminin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <Label>Nouveau mot de passe <span className="text-muted-foreground text-xs">(laisser vide pour ne pas changer)</span></Label>
                    <PasswordInput autoComplete="new-password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="Nouveau mot de passe" />
                  </div>
                </TabsContent>

                <TabsContent value="contact" className="space-y-4 mt-0">
                  {editProfileLoading ? (
                    <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> Téléphone</Label>
                        <Input value={editProfileForm.phone} onChange={e => setEditProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="+225 07 00 00 00 00" />
                      </div>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Adresse</Label>
                        <Input value={editProfileForm.address} onChange={e => setEditProfileForm(f => ({ ...f, address: e.target.value }))} placeholder="Quartier, Ville" />
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="parents" className="space-y-4 mt-0">
                  {editProfileLoading ? (
                    <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label>Nom du parent / tuteur</Label>
                        <Input value={editProfileForm.parentName} onChange={e => setEditProfileForm(f => ({ ...f, parentName: e.target.value }))} placeholder="Prénom Nom" />
                      </div>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> Téléphone du parent</Label>
                        <Input value={editProfileForm.parentPhone} onChange={e => setEditProfileForm(f => ({ ...f, parentPhone: e.target.value }))} placeholder="+225 07 00 00 00 00" />
                      </div>
                      <div className="space-y-1">
                        <Label>Email du parent</Label>
                        <Input type="email" autoComplete="off" value={editProfileForm.parentEmail} onChange={e => setEditProfileForm(f => ({ ...f, parentEmail: e.target.value }))} placeholder="prenom.nom@inphb.ci" />
                      </div>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Adresse du parent</Label>
                        <Input value={editProfileForm.parentAddress} onChange={e => setEditProfileForm(f => ({ ...f, parentAddress: e.target.value }))} placeholder="Quartier, Ville" />
                      </div>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label>Nom complet</Label>
                  <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" autoComplete="off" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Nouveau mot de passe <span className="text-muted-foreground text-xs">(laisser vide pour ne pas changer)</span></Label>
                  <PasswordInput autoComplete="new-password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="Nouveau mot de passe" />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditUser(null)}>Annuler</Button>
              <Button onClick={handleEditSave} disabled={editSaving || !editForm.name.trim() || !editForm.email.trim()}>
                {editSaving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View user info dialog */}
        <Dialog open={viewUser !== null} onOpenChange={(open) => { if (!open) { setViewUser(null); setViewProfile(null); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {viewUser?.role === "student" ? <GraduationCap className="w-5 h-5 text-purple-500" /> : <BookOpen className="w-5 h-5 text-green-500" />}
                Informations — {viewUser?.name}
              </DialogTitle>
            </DialogHeader>
            {viewUser && (
              <div className="space-y-5 pt-2">
                {/* Photo (students only) */}
                {viewUser.role === "student" && viewProfile?.photoUrl && (
                  <div className="flex justify-center">
                    <img src={viewProfile.photoUrl} alt="Photo" className="w-24 h-24 rounded-full object-cover border-2 border-muted shadow" />
                  </div>
                )}

                {/* Identity section */}
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identité</p>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">Nom :</span>
                      <span>{viewUser.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">Email :</span>
                      <span className="break-all">{viewUser.email}</span>
                    </div>
                    {viewUser.className && (
                      <div className="flex items-center gap-2 text-sm">
                        <School className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">Classe :</span>
                        <span>{viewUser.className}</span>
                      </div>
                    )}
                    {/* Teacher phone from users table */}
                    {viewUser.role === "teacher" && viewUser.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">Téléphone :</span>
                        <span>{viewUser.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Student profile */}
                {viewUser.role === "student" && (
                  viewProfileLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Chargement du profil…</p>
                  ) : (
                    <>
                      {/* État civil section */}
                      {(viewProfile?.matricule || viewProfile?.sexe || viewProfile?.dateNaissance || viewProfile?.lieuNaissance) && (
                        <div className="rounded-lg border p-4 space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">État civil</p>
                          <div className="space-y-2">
                            {viewProfile.matricule && (
                              <div className="flex items-center gap-2 text-sm">
                                <BadgeCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">Matricule :</span>
                                <span className="font-mono">{viewProfile.matricule}</span>
                              </div>
                            )}
                            {viewProfile.sexe && (
                              <div className="flex items-center gap-2 text-sm">
                                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">Sexe :</span>
                                <span>{viewProfile.sexe === "M" ? "Masculin" : "Féminin"}</span>
                              </div>
                            )}
                            {viewProfile.dateNaissance && (
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">Date de naissance :</span>
                                <span>{viewProfile.dateNaissance}</span>
                              </div>
                            )}
                            {viewProfile.lieuNaissance && (
                              <div className="flex items-center gap-2 text-sm">
                                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">Lieu de naissance :</span>
                                <span>{viewProfile.lieuNaissance}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Contact section */}
                      {(viewProfile?.phone || viewProfile?.address) && (
                        <div className="rounded-lg border p-4 space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
                          <div className="space-y-2">
                            {viewProfile.phone && (
                              <div className="flex items-center gap-2 text-sm">
                                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">Téléphone :</span>
                                <span>{viewProfile.phone}</span>
                              </div>
                            )}
                            {viewProfile.address && (
                              <div className="flex items-start gap-2 text-sm">
                                <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="font-medium">Adresse :</span>
                                <span>{viewProfile.address}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Parent section */}
                      {(viewProfile?.parentName || viewProfile?.parentPhone || viewProfile?.parentEmail || viewProfile?.parentAddress) && (
                        <div className="rounded-lg border p-4 space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parents / Tuteur</p>
                          <div className="space-y-2">
                            {viewProfile.parentName && (
                              <div className="flex items-center gap-2 text-sm">
                                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">Nom :</span>
                                <span>{viewProfile.parentName}</span>
                              </div>
                            )}
                            {viewProfile.parentPhone && (
                              <div className="flex items-center gap-2 text-sm">
                                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">Téléphone :</span>
                                <span>{viewProfile.parentPhone}</span>
                              </div>
                            )}
                            {viewProfile.parentEmail && (
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">Email :</span>
                                <span className="break-all">{viewProfile.parentEmail}</span>
                              </div>
                            )}
                            {viewProfile.parentAddress && (
                              <div className="flex items-start gap-2 text-sm">
                                <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="font-medium">Adresse :</span>
                                <span>{viewProfile.parentAddress}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {!viewProfile?.phone && !viewProfile?.address && !viewProfile?.parentName && !viewProfile?.parentPhone && !viewProfile?.parentEmail && !viewProfile?.parentAddress && (
                        <p className="text-sm text-muted-foreground text-center py-2">Aucune information complémentaire renseignée.</p>
                      )}
                    </>
                  )
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={pendingDeleteId !== null}
          title="Supprimer l'utilisateur"
          description="Cette action est irréversible. Toutes les données liées seront supprimées."
          onConfirm={() => pendingDeleteId !== null && handleDelete(pendingDeleteId)}
          onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        />
      </div>
    </AppLayout>
  );
}
