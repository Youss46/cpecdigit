import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { BarChart3, XCircle, Clock, AlertTriangle, Download, Bell, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadBilanAbsencesPdf } from "@/lib/pdf-engine/documents";

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export default function AttendanceSummary() {
  const [semesterId, setSemesterId] = useState("");
  const [classId, setClassId] = useState("all");
  const { toast } = useToast();
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState("3");
  const [alertLoading, setAlertLoading] = useState(false);

  const handleSendAlerts = async () => {
    setAlertLoading(true);
    try {
      const res = await fetch("/api/admin/absences/send-alerts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semesterId: parseInt(semesterId),
          classId: classId !== "all" ? parseInt(classId) : undefined,
          threshold: parseInt(alertThreshold) || 3,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Erreur"); }
      const data = await res.json();
      toast({
        title: "Alertes envoyées",
        description: data.sent === 0
          ? "Aucun étudiant ne dépasse le seuil fixé."
          : `${data.sent} étudiant(s) notifié(s).`,
      });
      setShowAlertDialog(false);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setAlertLoading(false);
    }
  };

  const { data: semesters = [] } = useQuery({
    queryKey: ["/api/admin/semesters"],
    queryFn: () => apiFetch("/admin/semesters"),
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["/api/admin/classes"],
    queryFn: () => apiFetch("/admin/classes"),
  });

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["/api/admin/attendance/summary", semesterId, classId],
    queryFn: () => {
      const params = new URLSearchParams({ semesterId });
      if (classId !== "all") params.set("classId", classId);
      return apiFetch(`/admin/attendance/summary?${params}`);
    },
    enabled: !!semesterId,
    refetchInterval: 15000,
  });

  const rows = summary as any[];
  const selectedSemester = (semesters as any[]).find((s: any) => s.id.toString() === semesterId);

  const totalAbsences = rows.reduce((s: number, r: any) => s + r.absenceCount, 0);
  const totalLates = rows.reduce((s: number, r: any) => s + r.lateCount, 0);
  const totalMinutes = rows.reduce((s: number, r: any) => s + r.totalMinutes, 0);

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadBilanPdf = async () => {
    if (!semesterId) return;
    setPdfLoading(true);
    try {
      const cls = classId !== "all" ? (classes as any[]).find((c: any) => c.id.toString() === classId) : undefined;
      await downloadBilanAbsencesPdf(
        parseInt(semesterId),
        selectedSemester?.name ?? "Semestre",
        cls ? parseInt(classId) : undefined,
        cls?.name,
      );
    } catch (e: any) {
      toast({ title: "Erreur PDF", description: e.message, variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!rows.length) return;
    const semLabel = selectedSemester ? selectedSemester.name.replace(/\s+/g, "_") : "bilan";
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ["Étudiant", "Classe", "Absences", "Retards", "Total heures d'absence"];
    const data = rows.map((r: any) => [
      r.studentName,
      r.className ?? "",
      String(r.absenceCount),
      String(r.lateCount),
      formatDuration(r.totalMinutes),
    ]);
    const bom = "\uFEFF";
    const csv = bom + [header, ...data].map(row => row.map(escape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `absences_${semLabel}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            Bilan des Absences
          </h1>
          <p className="text-muted-foreground">
            Récapitulatif des heures d'absence par étudiant sur un semestre.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1.5">
            <label className="text-sm font-medium text-foreground">Semestre</label>
            <Select value={semesterId} onValueChange={setSemesterId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Sélectionner un semestre…" />
              </SelectTrigger>
              <SelectContent>
                {(semesters as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52 space-y-1.5">
            <label className="text-sm font-medium text-foreground">Classe</label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Toutes les classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {(classes as any[]).map((c: any) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {semesterId && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50 h-10"
              onClick={() => setShowAlertDialog(true)}
            >
              <Bell className="w-4 h-4" />
              Envoyer des alertes
            </Button>
          )}
        </div>

        {!semesterId && (
          <div className="text-center py-16 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Sélectionnez un semestre pour afficher le bilan.</p>
          </div>
        )}

        {semesterId && (
          <>
            {/* Summary stats */}
            {rows.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total absences</p>
                    <p className="text-2xl font-bold text-foreground">{totalAbsences}</p>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total retards</p>
                    <p className="text-2xl font-bold text-foreground">{totalLates}</p>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Heures cumulées</p>
                    <p className="text-2xl font-bold text-foreground">{formatDuration(totalMinutes)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              {rows.length > 0 && (
                <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{rows.length}</span> étudiant{rows.length > 1 ? "s" : ""} concerné{rows.length > 1 ? "s" : ""}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    onClick={handleExportCSV}
                  >
                    <Download className="w-4 h-4" />
                    Exporter CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={pdfLoading}
                    onClick={handleDownloadBilanPdf}
                  >
                    {pdfLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    PDF
                  </Button>
                </div>
              )}
              <div className="overflow-y-auto max-h-[calc(100vh-420px)]">
                <Table>
                  <TableHeader className="bg-secondary/50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead>Étudiant</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead className="text-center">Absences</TableHead>
                      <TableHead className="text-center">Retards</TableHead>
                      <TableHead className="text-right">Total heures d'absence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement…</TableCell>
                      </TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <BarChart3 className="w-8 h-8 opacity-20" />
                            <span>
                              {selectedSemester ? `Aucune absence enregistrée pour ${selectedSemester.name}.` : "Aucune donnée."}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((r: any) => (
                        <TableRow key={r.studentId} className="hover:bg-muted/40">
                          <TableCell className="font-medium">{r.studentName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.className}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {r.absenceCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full">
                                <XCircle className="w-3.5 h-3.5" />
                                {r.absenceCount}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.lateCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
                                <Clock className="w-3.5 h-3.5" />
                                {r.lateCount}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.totalMinutes > 0 ? (
                              <span className={`inline-flex items-center gap-1 text-sm font-bold px-2.5 py-0.5 rounded-full ${
                                r.totalMinutes >= 600
                                  ? "text-red-700 bg-red-100"
                                  : r.totalMinutes >= 300
                                  ? "text-amber-700 bg-amber-50"
                                  : "text-foreground bg-secondary"
                              }`}>
                                {r.totalMinutes >= 600 && <AlertTriangle className="w-3.5 h-3.5" />}
                                {formatDuration(r.totalMinutes)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">Non renseigné</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {rows.length > 0 && (
                <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                  {rows.length} étudiant{rows.length > 1 ? "s" : ""} avec absences ou retards
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Dialog: Envoyer des alertes */}
      <Dialog open={showAlertDialog} onOpenChange={(o) => { if (!o) setShowAlertDialog(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              Envoyer des alertes d'absences
            </DialogTitle>
            <DialogDescription>
              Les étudiants ayant atteint ou dépassé le seuil d'absences non justifiées recevront une notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Seuil d'absences non justifiées</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                placeholder="ex: 3"
              />
              <p className="text-xs text-muted-foreground">
                Les étudiants avec ≥ {alertThreshold} absence(s) seront notifiés.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAlertDialog(false)}>Annuler</Button>
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-700"
              onClick={handleSendAlerts}
              disabled={alertLoading}
            >
              <Bell className="w-4 h-4" />
              {alertLoading ? "Envoi…" : "Envoyer les alertes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
