import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetCurrentUser, useGetTeacherAssignments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { User, Mail, Phone, BookOpen, Clock, Calendar, TrendingUp, Award, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { WebAuthnDevicesSection } from "@/components/webauthn-devices-section";

export default function TeacherProfile() {
  const { data: user } = useGetCurrentUser();
  const { data: assignments = [], isLoading } = useGetTeacherAssignments();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const openEdit = () => {
    setEditName((user as any)?.name ?? "");
    setEditEmail((user as any)?.email ?? "");
    setEditPhone((user as any)?.phone ?? "");
    setShowEdit(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      toast({ title: "Nom requis", variant: "destructive" });
      return;
    }
    setEditLoading(true);
    try {
      const res = await fetch("/api/teacher/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Erreur"); }
      toast({ title: "Profil mis à jour", description: "Vos informations ont été enregistrées." });
      setShowEdit(false);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  };

  const totalPlanned = (assignments as any[]).reduce((s: number, a: any) => s + (a.plannedHours ?? 0), 0);
  const totalCompleted = (assignments as any[]).reduce((s: number, a: any) => s + (a.completedHours ?? 0), 0);
  const totalPerWeek = (assignments as any[]).reduce((s: number, a: any) => s + (a.scheduledHoursPerWeek ?? 0), 0);
  const completionPct = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-8 max-w-3xl mx-auto">

        {/* Header hero */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-gradient-to-br from-primary to-primary/80 rounded-3xl p-8 text-primary-foreground shadow-xl shadow-primary/20">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <User className="w-10 h-10 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-serif font-bold">{(user as any)?.name ?? "—"}</h1>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge className="bg-white/20 text-white border-0 text-xs font-semibold">Enseignant</Badge>
                  <span className="flex items-center gap-1.5 text-primary-foreground/80 text-sm">
                    <Mail className="w-3.5 h-3.5" />
                    {(user as any)?.email ?? "—"}
                  </span>
                  {(user as any)?.phone && (
                    <span className="flex items-center gap-1.5 text-primary-foreground/80 text-sm">
                      <Phone className="w-3.5 h-3.5" />
                      {(user as any).phone}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 bg-white/20 text-white hover:bg-white/30 border-0 shrink-0"
                onClick={openEdit}
              >
                <Pencil className="w-3.5 h-3.5" />
                Modifier
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {[
            { label: "Matières", value: (assignments as any[]).length, icon: BookOpen, color: "text-primary", bg: "bg-primary/10" },
            { label: "Heures prévues", value: `${totalPlanned}h`, icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Heures réalisées", value: `${totalCompleted}h`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Par semaine", value: `${Math.round(totalPerWeek * 10) / 10}h`, icon: Calendar, color: "text-amber-600", bg: "bg-amber-50" },
          ].map((s, i) => (
            <Card key={i} className="border-border shadow-sm">
              <CardContent className="p-5 flex flex-col items-center text-center gap-2">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Overall progress */}
        {totalPlanned > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-border shadow-sm">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground flex items-center gap-2">
                    <Award className="w-4 h-4 text-primary" />
                    Progression globale
                  </p>
                  <span className={`text-lg font-bold ${completionPct >= 80 ? "text-emerald-600" : completionPct >= 40 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {completionPct}%
                  </span>
                </div>
                <Progress value={completionPct} className="h-3" />
                <p className="text-sm text-muted-foreground">
                  {totalCompleted}h réalisées sur {totalPlanned}h prévues
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Assignments list */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Mes matières assignées
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
              ) : (assignments as any[]).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucune matière assignée pour le moment.</p>
              ) : (
                <div className="space-y-3">
                  {(assignments as any[]).map((a: any) => {
                    const pct = a.plannedHours > 0 ? Math.min(100, Math.round((a.completedHours / a.plannedHours) * 100)) : 0;
                    const isComplete = a.completedHours >= a.plannedHours;
                    return (
                      <div key={a.id} className="rounded-xl border border-border p-4 space-y-3 hover:border-primary/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground">{a.subjectName}</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{a.className}</Badge>
                              <Badge variant="outline" className="text-xs">{a.semesterName}</Badge>
                              <span className="text-xs text-muted-foreground">Coef. {a.coefficient}</span>
                            </div>
                          </div>
                          {isComplete ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-0 shrink-0">Terminé</Badge>
                          ) : (
                            <Badge variant="secondary" className="shrink-0">{a.completedHours}/{a.plannedHours}h</Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Progress value={pct} className="h-2" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{a.completedHours}h réalisées</span>
                            <span>{pct}% du volume horaire</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Biometric devices */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <WebAuthnDevicesSection userEmail={(user as any)?.email ?? ""} />
        </motion.div>
      </div>

      {/* Dialog: Modifier le profil */}
      <Dialog open={showEdit} onOpenChange={(o) => { if (!o) setShowEdit(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Modifier mon profil
            </DialogTitle>
            <DialogDescription>Mettez à jour vos informations de contact.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nom complet *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Votre nom" />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse email</Label>
              <Input type="email" autoComplete="off" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email@exemple.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+225 07 00 00 00 00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Annuler</Button>
            <Button onClick={handleSaveProfile} disabled={editLoading}>
              {editLoading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
