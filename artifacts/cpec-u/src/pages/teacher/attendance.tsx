import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherAssignments, useGetClassStudents, useTeacherAttendanceHistory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ClipboardCheck, Send, Save, CheckCircle2, XCircle, Clock,
  History, CalendarDays, Users, TrendingUp, WifiOff, MapPin, Loader2,
} from "lucide-react";
import { useOffline } from "@/lib/offline/offline-context";
import { saveAttendanceOffline } from "@/lib/offline/offline-actions";

// ── Formule Haversine — distance entre 2 points GPS en mètres ────────────────
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type GpsState = "idle" | "checking" | "ok" | "too_far" | "error" | "no_gps_config";
type GpsData = { latitude: number; longitude: number; precision_metres: number; distance_etablissement: number; localisation_validee: boolean } | null;

const STATUS_CONFIG = {
  present: { label: "Présent(e)", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700 border-emerald-300", dot: "bg-emerald-500" },
  absent: { label: "Absent(e)", icon: XCircle, color: "bg-red-100 text-red-700 border-red-300", dot: "bg-red-500" },
  late: { label: "Retard", icon: Clock, color: "bg-amber-100 text-amber-700 border-amber-300", dot: "bg-amber-500" },
} as const;

type Status = keyof typeof STATUS_CONFIG;

type StudentRow = {
  studentId: number;
  studentName: string;
  status: Status;
  note: string;
  startTime: string;
  endTime: string;
};

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function NewSessionTab() {
  const { data: assignments } = useGetTeacherAssignments();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [sessionDate, setSessionDate] = useState(todayDate());
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [gpsData, setGpsData] = useState<GpsData>(null);
  const { toast } = useToast();
  const { isOnline } = useOffline();

  const selectedAssignment = useMemo(
    () => assignments?.find((a: any) => a.id.toString() === selectedAssignmentId),
    [assignments, selectedAssignmentId]
  );

  const { data: enrolledStudents = [] } = useGetClassStudents(
    selectedAssignment?.classId ?? 0,
    { query: { enabled: !!selectedAssignment } } as any
  );

  useEffect(() => {
    if (!selectedAssignment || !sessionDate) return;
    const students = enrolledStudents as any[];
    setRows(students.map((s: any) => ({ studentId: s.id, studentName: s.name, status: "present", note: "", startTime: "", endTime: "" })));
    setSentAt(null);

    const { subjectId, classId } = selectedAssignment;
    apiFetch(`/teacher/attendance?subjectId=${subjectId}&classId=${classId}&sessionDate=${sessionDate}`)
      .then(({ records, sentAt: sa }) => {
        setSentAt(sa);
        if (records.length > 0) {
          setRows(prev =>
            prev.map(row => {
              const found = records.find((r: any) => r.studentId === row.studentId);
              return found
                ? { ...row, status: found.status as Status, note: found.note ?? "", startTime: found.startTime ?? "", endTime: found.endTime ?? "" }
                : row;
            })
          );
        }
      })
      .catch(() => {});
  }, [selectedAssignment, sessionDate, (enrolledStudents as any[]).length]);

  const setStatus = (studentId: number, status: Status) => setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, status } : r));
  const setNote = (studentId: number, note: string) => setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, note } : r));
  const setStartTime = (studentId: number, startTime: string) => setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, startTime } : r));
  const setEndTime = (studentId: number, endTime: string) => setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, endTime } : r));

  const buildPayload = () => ({
    subjectId: selectedAssignment!.subjectId,
    classId: selectedAssignment!.classId,
    semesterId: selectedAssignment!.semesterId,
    sessionDate,
    records: rows.map(r => ({
      studentId: r.studentId,
      status: r.status,
      note: r.note || undefined,
      startTime: r.status !== "present" && r.startTime ? r.startTime : undefined,
      endTime: r.status !== "present" && r.endTime ? r.endTime : undefined,
    })),
  });

  const handleSave = async () => {
    if (!selectedAssignment) return;
    setIsSaving(true);
    try {
      const payload = buildPayload();
      if (!isOnline) {
        await saveAttendanceOffline(payload);
        toast({ title: "Hors ligne — Présences sauvegardées localement", description: "Elles seront synchronisées dès le retour de connexion." });
      } else {
        await apiFetch("/teacher/attendance/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast({ title: "Présences sauvegardées" });
      }
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const doSend = async (gps: GpsData) => {
    if (!selectedAssignment) return;
    await apiFetch("/teacher/attendance/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload()) });
    const { sentAt: sa } = await apiFetch("/teacher/attendance/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: selectedAssignment.subjectId,
        classId: selectedAssignment.classId,
        semesterId: selectedAssignment.semesterId,
        sessionDate,
        ...(gps ?? {}),
      }),
    });
    setSentAt(sa);
    const distMsg = gps?.localisation_validee ? ` (Position vérifiée — ${gps.distance_etablissement}m)` : "";
    toast({ title: `Feuille transmise à la scolarité ✓${distMsg}` });
  };

  const handleSend = async () => {
    if (!selectedAssignment) return;
    setIsSending(true);
    try {
      // Récupérer la configuration GPS du tenant
      let locationSettings: { latitude: number | null; longitude: number | null; rayon_metres: number } | null = null;
      try {
        locationSettings = await apiFetch("/teacher/attendance/location-settings");
      } catch { /* ignore */ }

      const hasGpsConfig = locationSettings?.latitude != null && locationSettings?.longitude != null;

      if (!hasGpsConfig) {
        // Pas de config GPS → soumission directe
        setGpsState("no_gps_config");
        await doSend(null);
        setGpsState("idle");
        return;
      }

      // Vérification GPS obligatoire
      if (!navigator.geolocation) {
        toast({ title: "Géolocalisation non disponible sur cet appareil. Contactez l'administration.", variant: "destructive" });
        setIsSending(false);
        return;
      }

      setGpsState("checking");
      toast({ title: "📍 Vérification de votre position en cours…", description: "Patientez, cela peut prendre quelques secondes." });

      // Helper: wrap getCurrentPosition in a Promise
      const getPosition = (opts: PositionOptions): Promise<GeolocationPosition> =>
        new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));

      let position: GeolocationPosition | null = null;
      try {
        // Tentative 1 : GPS haute précision (accepte position récente ≤ 60s)
        position = await getPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
      } catch (err1: any) {
        if (err1?.code === 1) {
          // Permission refusée — inutile de retenter
          setGpsState("error");
          toast({ title: "📍 Accès à la localisation refusé. Autorisez-le dans les paramètres de votre navigateur.", variant: "destructive" });
          setIsSending(false);
          return;
        }
        // Timeout ou position indisponible → repli sur géolocalisation réseau (WiFi/cellulaire)
        toast({ title: "📡 GPS lent, basculement sur la géolocalisation réseau…" });
        try {
          position = await getPosition({ enableHighAccuracy: false, timeout: 25000, maximumAge: 120000 });
        } catch {
          setGpsState("error");
          toast({
            title: "📍 Impossible d'obtenir votre position.",
            description: "Activez la localisation sur votre appareil et autorisez-la dans le navigateur.",
            variant: "destructive",
          });
          setIsSending(false);
          return;
        }
      }

      try {
        const { latitude, longitude, accuracy } = position.coords;
        const rayon = locationSettings!.rayon_metres ?? 200;
        const distance = Math.round(haversineMetres(latitude, longitude, locationSettings!.latitude!, locationSettings!.longitude!));

        // Rayon effectif = rayon configuré + incertitude GPS mesurée (plafonnée à 1000m).
        // LTE peut dériver de 300-600m d'une session à l'autre depuis le même endroit.
        // On absorbe cette dérive en élargissant dynamiquement le rayon autorisé.
        const accuracyMargin = Math.min(Math.round(accuracy), 1000);
        const effectiveRayon = rayon + accuracyMargin;

        if (distance > effectiveRayon) {
          setGpsState("too_far");
          apiFetch("/teacher/attendance/location-incident", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subjectId: selectedAssignment!.subjectId,
              classId: selectedAssignment!.classId,
              sessionDate,
              latitude, longitude,
              distance_metres: distance,
              precision_metres: Math.round(accuracy),
            }),
          }).catch(() => {});
          toast({
            title: `🔴 Vous êtes trop loin de l'établissement (${distance}m, précision ±${Math.round(accuracy)}m).`,
            description: `Rayon autorisé : ${rayon}m. Vous devez être physiquement dans l'établissement.`,
            variant: "destructive",
          });
          setIsSending(false);
          return;
        }

        // Position valide
        setGpsState("ok");
        const gps: GpsData = {
          latitude, longitude,
          precision_metres: Math.round(accuracy),
          distance_etablissement: distance,
          localisation_validee: true,
        };
        setGpsData(gps);
        await doSend(gps);
        setGpsState("idle");
      } catch {
        toast({ title: "Erreur lors de l'envoi", variant: "destructive" });
        setGpsState("idle");
      } finally {
        setIsSending(false);
      }
    } catch {
      toast({ title: "Erreur lors de l'envoi", variant: "destructive" });
      setIsSending(false);
    }
  };

  const absentCount = rows.filter(r => r.status === "absent").length;
  const lateCount = rows.filter(r => r.status === "late").length;
  const presentCount = rows.filter(r => r.status === "present").length;

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Cours</label>
              <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Sélectionner un cours…" />
                </SelectTrigger>
                <SelectContent>
                  {(assignments as any[] ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id.toString()}>
                      {a.subjectName} — {a.className}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Date du cours</label>
              <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="bg-background" />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedAssignment && rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />{presentCount} présent{presentCount > 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-red-500" />{absentCount} absent{absentCount > 1 ? "s" : ""}
            </span>
            {lateCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-amber-500" />{lateCount} en retard
              </span>
            )}
            {sentAt && (
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 ml-auto">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Transmis le {new Date(sentAt).toLocaleDateString("fr-FR")}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            {rows.map((row) => {
              const cfg = STATUS_CONFIG[row.status];
              const isAbsentOrLate = row.status !== "present";
              return (
                <div key={row.studentId} className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <span className="font-medium text-foreground truncate">{row.studentName}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {(["present", "absent", "late"] as Status[]).map((s) => {
                        const c = STATUS_CONFIG[s];
                        const active = row.status === s;
                        return (
                          <button
                            key={s}
                            onClick={() => setStatus(row.studentId, s)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${active ? c.color : "border-border text-muted-foreground hover:border-primary/40"}`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {isAbsentOrLate && (
                    <div className="flex flex-wrap gap-2 items-center pl-5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground font-medium">De</span>
                        <Input type="time" value={row.startTime} onChange={(e) => setStartTime(row.studentId, e.target.value)} className="h-7 text-xs w-28 bg-background" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground font-medium">À</span>
                        <Input type="time" value={row.endTime} onChange={(e) => setEndTime(row.studentId, e.target.value)} className="h-7 text-xs w-28 bg-background" />
                      </div>
                      <Input value={row.note} onChange={(e) => setNote(row.studentId, e.target.value)} placeholder="Motif (optionnel)" className="h-7 text-xs w-40 bg-background" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!isOnline && (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
              <WifiOff className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">Mode hors ligne — Vous pouvez sauvegarder les présences localement.</span>
            </div>
          )}
          {/* GPS status indicator */}
          {gpsState === "checking" && (
            <div className="flex items-center gap-2 text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              Vérification de votre position GPS en cours…
            </div>
          )}
          {gpsState === "ok" && gpsData && (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl text-sm font-medium">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              Position validée — à {gpsData.distance_etablissement}m de l'établissement (±{gpsData.precision_metres}m)
            </div>
          )}
          {gpsState === "too_far" && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl text-sm font-medium">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              Position refusée — vous êtes trop loin de l'établissement.
            </div>
          )}
          {gpsState === "error" && (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl text-sm font-medium">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              Impossible d'obtenir votre position. Vérifiez les permissions GPS.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button variant="outline" onClick={handleSave} disabled={isSaving} className="flex-1">
              {!isOnline && <WifiOff className="w-4 h-4 mr-2" />}
              <Save className="w-4 h-4 mr-2" />{isSaving ? "Sauvegarde…" : isOnline ? "Sauvegarder le brouillon" : "Sauvegarder hors ligne"}
            </Button>
            <Button onClick={handleSend} disabled={isSending || isSaving || !isOnline || gpsState === "checking"} className="flex-1 bg-primary hover:bg-primary/90">
              {isSending && gpsState === "checking" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Vérification GPS…</>
              ) : isSending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Envoi…</>
              ) : (
                <><Send className="w-4 h-4 mr-2" />Envoyer à l'Assistant de Direction</>
              )}
            </Button>
          </div>
        </>
      )}

      {selectedAssignment && rows.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Aucun étudiant inscrit dans cette classe.</div>
      )}

      {!selectedAssignment && (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>Sélectionnez un cours pour commencer la saisie des présences.</p>
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const { data: history = [], isLoading } = useTeacherAttendanceHistory();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if ((history as any[]).length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>Aucune feuille de présence envoyée pour le moment.</p>
        <p className="text-sm mt-1">Les feuilles transmises à la scolarité apparaîtront ici.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-border shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Séances totales</p>
            <p className="text-3xl font-bold text-foreground">{(history as any[]).length}</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Transmises</p>
            <p className="text-3xl font-bold text-primary">{(history as any[]).filter((h: any) => h.sentAt).length}</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm col-span-2 sm:col-span-1">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cours différents</p>
            <p className="text-3xl font-bold text-foreground">
              {new Set((history as any[]).map((h: any) => `${h.subjectId}-${h.classId}`)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* History table */}
      <Card className="overflow-hidden border-border shadow-sm">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow>
              <TableHead className="pl-5"><CalendarDays className="w-3.5 h-3.5 inline mr-1" />Date</TableHead>
              <TableHead>Matière</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead className="text-center"><Users className="w-3.5 h-3.5 inline mr-1" />Présents</TableHead>
              <TableHead className="text-center">Absents</TableHead>
              <TableHead className="text-center">Retards</TableHead>
              <TableHead className="text-right pr-5">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(history as any[]).map((session: any) => (
              <TableRow key={session.id} className="hover:bg-muted/30">
                <TableCell className="pl-5 font-medium text-foreground">
                  {new Date(session.sessionDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                </TableCell>
                <TableCell className="text-muted-foreground">{session.subjectName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs font-semibold">{session.className}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{session.presentCount}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {session.absentCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{session.absentCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {session.lateCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{session.lateCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right pr-5">
                  {session.sentAt ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border text-xs font-semibold">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Transmise
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-xs">Brouillon</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export default function TeacherAttendance() {
  const [tab, setTab] = useState<"new" | "history">("new");

  return (
    <AppLayout allowedRoles={["teacher", "admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-8 h-8 text-primary" />
            Gestion des Présences
          </h1>
          <p className="text-muted-foreground">Enregistrez les présences et absences de vos cours.</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border gap-1">
          <button
            onClick={() => setTab("new")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === "new" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Nouvelle Feuille
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="w-4 h-4" />
            Historique
          </button>
        </div>

        {tab === "new" ? <NewSessionTab /> : <HistoryTab />}
      </div>
    </AppLayout>
  );
}
