import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Download, RefreshCw, XCircle, CheckCircle2, Clock,
  Users, Search, LayoutList, QrCode, ExternalLink,
} from "lucide-react";
import { useLocation } from "wouter";
import { downloadCardAsPdf } from "@/lib/download-card-pdf";

type CardEntry = {
  studentId: number;
  studentName: string;
  matricule: string | null;
  className: string | null;
  card: {
    id: number;
    hash: string;
    academicYear: string;
    issuedAt: string;
    expiresAt: string;
    isValid: boolean;
    isExpired: boolean;
    status: "active" | "expired" | "invalidated" | "none";
  } | null;
};

type ClassInfo = { id: number; name: string; filiere: string | null };

function StatusBadge({ status }: { status: "active" | "expired" | "invalidated" | "none" }) {
  if (status === "active") return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
      <CheckCircle2 className="w-3 h-3" /> Active
    </Badge>
  );
  if (status === "expired") return (
    <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 gap-1">
      <Clock className="w-3 h-3" /> Expirée
    </Badge>
  );
  if (status === "invalidated") return (
    <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
      <XCircle className="w-3 h-3" /> Invalidée
    </Badge>
  );
  return <Badge variant="outline" className="text-muted-foreground gap-1">— Aucune</Badge>;
}

export default function AdminCards() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const { data: classes } = useQuery<ClassInfo[]>({
    queryKey: ["/api/admin/cards/classes"],
    queryFn: async () => {
      const r = await fetch("/api/admin/classes-list", { credentials: "include" });
      if (!r.ok) throw new Error("Erreur classes");
      return r.json();
    },
    retry: false,
  });

  const { data: entries, isLoading, refetch } = useQuery<CardEntry[]>({
    queryKey: ["/api/admin/cards/list", selectedClassId],
    queryFn: async () => {
      const url = selectedClassId
        ? `/api/admin/cards/students?classId=${selectedClassId}`
        : "/api/admin/cards/students";
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement");
      return r.json();
    },
    retry: false,
  });

  const filtered = (entries ?? []).filter((e) =>
    !search ||
    e.studentName.toLowerCase().includes(search.toLowerCase()) ||
    (e.matricule ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = (entries ?? []).filter((e) => e.card?.status === "active").length;
  const noneCount = (entries ?? []).filter((e) => !e.card).length;
  const expiredCount = (entries ?? []).filter((e) => e.card?.status === "expired" || e.card?.status === "invalidated").length;

  const handleGenerate = async (studentId: number, name: string) => {
    setGeneratingId(studentId);
    try {
      const r = await fetch(`/api/admin/students/${studentId}/card/generate`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Erreur"); }
      toast({ title: "Carte générée", description: `Carte de ${name} créée avec succès.` });
      refetch();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDownloadCard = async (entry: CardEntry) => {
    setDownloadingId(entry.studentId);
    try {
      const r = await fetch(`/api/admin/students/${entry.studentId}/card`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur récupération carte");
      const data = await r.json();
      await downloadCardAsPdf({
        studentName: data.studentName,
        matricule: data.matricule,
        className: data.className,
        filiere: data.filiere,
        academicYear: data.academicYear,
        photoUrl: data.photoUrl,
        dateNaissance: data.dateNaissance,
        issuedAt: data.issuedAt,
        expiresAt: data.expiresAt,
        isValid: data.isValid,
        isExpired: data.isExpired,
        verifyUrl: data.verifyUrl,
      });
    } catch (err: any) {
      toast({ title: "Erreur PDF", description: err.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleBulkGenerate = async () => {
    if (!selectedClassId) {
      toast({ title: "Sélectionnez une classe", description: "Choisissez une classe pour la génération en masse.", variant: "destructive" });
      return;
    }
    setBulkLoading(true);
    try {
      const r = await fetch(`/api/admin/classes/${selectedClassId}/cards`, { credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Erreur"); }
      const className = classes?.find((c) => c.id === selectedClassId)?.name ?? "la classe";
      toast({ title: "Cartes générées", description: `Toutes les cartes de ${className} ont été générées.` });
      refetch();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Cartes Étudiantes</h1>
              <p className="text-sm text-muted-foreground">Gestion des cartes numériques — {new Date().getFullYear()}</p>
            </div>
          </div>
          {selectedClassId && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/admin/classes/${selectedClassId}/cards`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5">
                  <Download className="w-4 h-4" /> Imprimer toute la classe
                </a>
              </Button>
              <Button size="sm" onClick={handleBulkGenerate} disabled={bulkLoading}>
                <QrCode className="w-4 h-4 mr-1.5" />
                {bulkLoading ? "Génération…" : "Générer toute la classe"}
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Actives", value: activeCount, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
            { label: "Sans carte", value: noneCount, color: "text-muted-foreground", bg: "bg-muted/40" },
            { label: "Expirées / Invalidées", value: expiredCount, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" },
          ].map((stat) => (
            <Card key={stat.label} className={`${stat.bg} border-0`}>
              <CardContent className="py-4 text-center">
                <div className={`text-3xl font-black font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un étudiant, matricule…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedClassId === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedClassId(null)}
            >
              <LayoutList className="w-3.5 h-3.5 mr-1.5" /> Tous
            </Button>
            {(classes ?? []).map((c) => (
              <Button
                key={c.id}
                variant={selectedClassId === c.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedClassId(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {filtered.length} étudiant{filtered.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {search ? "Aucun résultat pour cette recherche." : "Aucun étudiant trouvé."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Étudiant</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Classe</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Statut</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Expiration</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry) => (
                      <tr key={entry.studentId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{entry.studentName}</div>
                          {entry.matricule && (
                            <div className="text-xs text-muted-foreground">{entry.matricule}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{entry.className ?? "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={entry.card ? entry.card.status : "none"} />
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                          {entry.card?.expiresAt
                            ? new Date(entry.card.expiresAt).toLocaleDateString("fr-FR")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {entry.card && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                disabled={downloadingId === entry.studentId}
                                onClick={() => handleDownloadCard(entry)}
                                title="Télécharger PDF"
                              >
                                {downloadingId === entry.studentId
                                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  : <Download className="w-3.5 h-3.5" />}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              disabled={generatingId === entry.studentId}
                              onClick={() => handleGenerate(entry.studentId, entry.studentName)}
                            >
                              {generatingId === entry.studentId
                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                : <RefreshCw className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-muted-foreground"
                              onClick={() => navigate(`/admin/students/${entry.studentId}?from=cards`)}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
