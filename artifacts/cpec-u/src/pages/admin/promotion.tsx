import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useListSemesters,
  useGetAnnualPromotionPreview,
  useLaunchAnnualPromotion,
  useRollbackAnnualPromotion,
  useArchiveYear,
  useInitializeYear,
  useGetCurrentUser,
  type AnnualPromotionClassPreview,
  type AnnualPromotionResponse,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import {
  GraduationCap,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Rocket,
  Search,
  Users,
  AlertTriangle,
  Undo2,
  Archive,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Lock,
  Layers,
  Trophy,
} from "lucide-react";

type Step = "select" | "preview" | "done";

const DECISION_CONFIG = {
  Admis: { label: "Admis", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2, iconColor: "text-green-600" },
  Ajourné: { label: "Ajourné", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle, iconColor: "text-red-500" },
  "En attente": { label: "En attente", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock, iconColor: "text-amber-500" },
} as const;

function DecisionBadge({ decision }: { decision: string }) {
  const cfg = DECISION_CONFIG[decision as keyof typeof DECISION_CONFIG] ?? {
    label: decision,
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: Clock,
    iconColor: "text-gray-400",
  };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color}`}>
      <Icon className={`w-3 h-3 ${cfg.iconColor}`} />
      {cfg.label}
    </span>
  );
}

function ClassCard({ cls }: { cls: AnnualPromotionClassPreview }) {
  const [open, setOpen] = useState(false);
  const total = cls.students.length;
  const hasIssues = cls.pendingCount > 0 || cls.deferredCount > 0;

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-all ${hasIssues ? "border-amber-200" : "border-gray-200"}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {open ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{cls.className}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ArrowRight className="w-3 h-3 text-blue-400" />
                    <p className="text-xs text-blue-600 font-medium">{cls.nextClassName}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-500">{total} étudiant{total > 1 ? "s" : ""}</span>
              {cls.admittedCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 text-xs font-semibold">
                  <CheckCircle2 className="w-3 h-3" />{cls.admittedCount} admis
                </span>
              )}
              {cls.deferredCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 text-xs font-semibold">
                  <XCircle className="w-3 h-3" />{cls.deferredCount} ajourné{cls.deferredCount > 1 ? "s" : ""}
                </span>
              )}
              {cls.pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold">
                  <Clock className="w-3 h-3" />{cls.pendingCount} en attente
                </span>
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-gray-100 bg-gray-50/50">
            {cls.students.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400 italic">Aucun étudiant inscrit dans cette classe.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Étudiant</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Décision annuelle</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Détail par semestre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cls.students.map((s) => (
                    <tr key={s.id} className="hover:bg-white transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-800">{s.name}</td>
                      <td className="px-4 py-3"><DecisionBadge decision={s.decision} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{s.semesterDecisions.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ResultCard({ result }: { result: AnnualPromotionResponse["results"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              <div>
                <p className="font-semibold text-gray-900 text-sm">{result.className}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ArrowRight className="w-3 h-3 text-blue-400" />
                  <p className="text-xs text-blue-600 font-medium">{result.nextClassName}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {result.promoted.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 text-xs font-semibold">
                  <CheckCircle2 className="w-3 h-3" />{result.promoted.length} promu{result.promoted.length > 1 ? "s" : ""}
                </span>
              )}
              {result.notPromoted.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 text-xs font-semibold">
                  <XCircle className="w-3 h-3" />{result.notPromoted.length} non promu{result.notPromoted.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-gray-100 bg-gray-50/50 divide-y divide-gray-100">
            {result.promoted.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <span className="text-sm font-medium text-gray-800">{s.name}</span>
                <span className="text-xs text-green-600 ml-auto">Promu → {result.nextClassName}</span>
              </div>
            ))}
            {result.notPromoted.map((s, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm font-medium text-gray-800">{s.name}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{s.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function nextAcademicYear(year: string): string {
  const parts = year.split("-");
  if (parts.length === 2) {
    const end = parseInt(parts[1]);
    if (!isNaN(end)) return `${end}-${end + 1}`;
  }
  return "";
}

function getApiBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${getApiBase()}${path}`, { credentials: "include", ...init });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Erreur"); }
  return r.json();
}

type CloseYearResult = {
  academicYear: string;
  toAcademicYear: string;
  totalPromoted: number;
  totalNotPromoted: number;
  totalPending: number;
  graduates: { id: number; name: string; className: string }[];
  promotionResults: { classId: number; className: string; nextClassName: string; promoted: { id: number; name: string }[]; notPromoted: { name: string }[] }[];
  newSemestersCreated: number;
};

export default function AnnualPromotionPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const isDirecteur = (currentUser as any)?.adminSubRole === "directeur";

  const [step, setStep] = useState<Step>("select");
  const [selectedYear, setSelectedYear] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const [launchResult, setLaunchResult] = useState<AnnualPromotionResponse | null>(null);
  const [reverted, setReverted] = useState(false);
  const [archiveDone, setArchiveDone] = useState(false);
  const [toAcademicYear, setToAcademicYear] = useState("");
  const [initDone, setInitDone] = useState(false);

  // Clôture Annuelle state
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureYear, setClosureYear] = useState("");
  const [closureToYear, setClosureToYear] = useState("");
  const [closureConfirmText, setClosureConfirmText] = useState("");
  const [closureResult, setClosureResult] = useState<CloseYearResult | null>(null);
  const expectedConfirmText = closureYear ? `CLOTURER ${closureYear}` : "";

  const closureMutation = useMutation({
    mutationFn: (body: { academicYear: string; toAcademicYear: string }) =>
      apiFetch<CloseYearResult>("/api/admin/annual-promotion/close-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setClosureResult(data);
      setClosureOpen(false);
      setClosureConfirmText("");
      qc.invalidateQueries({ queryKey: ["/api/admin/semesters"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/archives"] });
      toast({ title: "Clôture effectuée", description: `${data.totalPromoted} étudiants promus, ${data.graduates.length} diplômés. Année ${data.toAcademicYear} initialisée.` });
    },
    onError: (err: any) => {
      toast({ title: "Erreur de clôture", description: err.message, variant: "destructive" });
    },
  });

  const { data: semesters } = useListSemesters();
  const academicYears = useMemo(() => {
    const years = [...new Set((semesters as any[] ?? []).map((s: any) => s.academicYear as string))].sort().reverse();
    return years;
  }, [semesters]);

  const { data: preview, isLoading: previewLoading, error: previewError, refetch: refetchPreview } = useGetAnnualPromotionPreview(
    selectedYear,
    { enabled: false }
  );

  const archiveMutation = useArchiveYear({
    onSuccess: () => {
      setArchiveDone(true);
      qc.invalidateQueries({ queryKey: ["/api/admin/archives"] });
      toast({ title: "Année archivée", description: `L'année ${selectedYear} a été archivée avec succès.` });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message ?? "Échec de l'archivage.", variant: "destructive" });
    },
  });

  const initMutation = useInitializeYear({
    onSuccess: (data) => {
      setInitDone(true);
      qc.invalidateQueries({ queryKey: ["/api/admin/semesters"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/archives"] });
      toast({ title: "Nouvelle année créée", description: `${data.semestersCreated} semestre(s) créé(s) pour ${data.toAcademicYear}.` });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message ?? "Échec de l'initialisation.", variant: "destructive" });
    },
  });

  const launchMutation = useLaunchAnnualPromotion({
    onSuccess: (data) => {
      setLaunchResult(data);
      setConfirmOpen(false);
      setReverted(false);
      setArchiveDone(false);
      setInitDone(false);
      setToAcademicYear(nextAcademicYear(data.academicYear));
      setStep("done");
      qc.invalidateQueries({ queryKey: ["/api/admin/semesters"] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message ?? "Une erreur est survenue.", variant: "destructive" });
      setConfirmOpen(false);
    },
  });

  const rollbackMutation = useRollbackAnnualPromotion({
    onSuccess: (data) => {
      setReverted(true);
      setRollbackConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/semesters"] });
      toast({
        title: "Promotion révoquée",
        description: `${data.totalReverted} étudiant${data.totalReverted > 1 ? "s remis" : " remis"} dans leur classe d'origine.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message ?? "Échec de la révocation.", variant: "destructive" });
      setRollbackConfirmOpen(false);
    },
  });

  const hasPending = preview?.classes.some(c => c.pendingCount > 0) ?? false;
  const totalAdmitted = preview?.classes.reduce((sum, c) => sum + c.admittedCount, 0) ?? 0;

  async function handlePreview() {
    if (!selectedYear) return;
    await refetchPreview();
    setStep("preview");
  }

  function handleLaunch() {
    launchMutation.mutate({ academicYear: selectedYear });
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-3">
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            Tableau de bord
          </Link>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-600 rounded-xl shadow-md shrink-0">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Promotion Annuelle</h1>
              <p className="text-gray-500 text-sm mt-1">
                Délibération et passage des étudiants admis vers la classe supérieure.
              </p>
            </div>
          </div>
        </div>

        {/* ── Clôture Annuelle — Directeur only ──────────────────────── */}
        {isDirecteur && (
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-red-50 rounded-xl shrink-0">
                  <Lock className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Clôture de l'année académique</p>
                  <p className="text-xs text-gray-500 mt-0.5">Action irréversible réservée au Directeur — promotion, archivage et initialisation en une seule opération.</p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2 shrink-0"
                onClick={() => { setClosureOpen(true); setClosureResult(null); setClosureYear(""); setClosureToYear(""); setClosureConfirmText(""); }}
              >
                <ShieldAlert className="w-4 h-4" />
                Clôturer l'année académique
              </Button>
            </div>

            {/* Transition dashboard after closure */}
            {closureResult && (
              <div className="border-t border-red-100 px-6 py-5 space-y-4 bg-red-50/30">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="font-semibold text-gray-900 text-sm">
                    Transition {closureResult.academicYear} → {closureResult.toAcademicYear} effectuée
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl border border-green-200 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{closureResult.totalPromoted}</p>
                    <p className="text-xs text-green-600 mt-0.5 font-medium">Promus vers la classe supérieure</p>
                  </div>
                  <div className="bg-white rounded-xl border border-yellow-200 p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{closureResult.totalNotPromoted}</p>
                    <p className="text-xs text-yellow-600 mt-0.5 font-medium">Maintenus (ajournés)</p>
                  </div>
                  <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{closureResult.graduates.length}</p>
                    <p className="text-xs text-blue-600 mt-0.5 font-medium">Diplômés (dernière classe)</p>
                  </div>
                  <div className="bg-white rounded-xl border border-purple-200 p-3 text-center">
                    <p className="text-2xl font-bold text-purple-700">{closureResult.newSemestersCreated}</p>
                    <p className="text-xs text-purple-600 mt-0.5 font-medium">Semestres créés pour {closureResult.toAcademicYear}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {closureResult.totalPromoted > 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-800">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      {closureResult.totalPromoted} étudiant{closureResult.totalPromoted > 1 ? "s" : ""} promu{closureResult.totalPromoted > 1 ? "s" : ""} vers la classe supérieure
                    </div>
                  )}
                  {closureResult.graduates.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-blue-800">
                      <Trophy className="w-4 h-4 text-blue-500 shrink-0" />
                      {closureResult.graduates.length} étudiant{closureResult.graduates.length > 1 ? "s" : ""} diplômé{closureResult.graduates.length > 1 ? "s" : ""} ({closureResult.graduates.map(g => g.className).filter((v, i, a) => a.indexOf(v) === i).join(", ")})
                    </div>
                  )}
                  {closureResult.newSemestersCreated > 0 && (
                    <div className="flex items-center gap-2 text-sm text-purple-800">
                      <Layers className="w-4 h-4 text-purple-500 shrink-0" />
                      Nouvelle année {closureResult.toAcademicYear} initialisée — {closureResult.newSemestersCreated} semestre{closureResult.newSemestersCreated > 1 ? "s" : ""} créé{closureResult.newSemestersCreated > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Steps indicator */}
        <div className="flex items-center gap-2">
          {([ 
            { key: "select", label: "Sélection" },
            { key: "preview", label: "Délibération" },
            { key: "done", label: "Résultats" },
          ] as const).map((s, i, arr) => {
            const currentIdx = arr.findIndex(x => x.key === step);
            const isPast = currentIdx > i;
            const isCurrent = step === s.key;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => isPast ? setStep(s.key) : undefined}
                  disabled={!isPast && !isCurrent}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors select-none
                    ${isCurrent ? "bg-blue-600 text-white cursor-default" :
                      isPast ? "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer" :
                      "bg-gray-100 text-gray-400 cursor-default"}`}
                >
                  <span>{i + 1}</span>
                  <span>{s.label}</span>
                </button>
                {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-gray-300" />}
              </div>
            );
          })}
        </div>

        {/* Step 1: Select academic year */}
        {step === "select" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Étape 1 — Sélectionner l'année académique</h2>
              <p className="text-sm text-gray-500">Choisissez l'année pour laquelle vous souhaitez lancer la promotion.</p>
            </div>

            <div className="flex items-center gap-3">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Année académique…" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handlePreview} disabled={!selectedYear || previewLoading} className="gap-2">
                <Search className="w-4 h-4" />
                {previewLoading ? "Calcul en cours…" : "Prévisualiser la délibération"}
              </Button>
            </div>

            {previewError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <XCircle className="w-4 h-4 shrink-0" />
                {(previewError as any)?.message ?? "Erreur lors du calcul."}
              </div>
            )}

            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-4 space-y-2">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Processus de promotion</p>
              <ol className="space-y-1.5 text-sm text-blue-800">
                <li className="flex items-start gap-2"><span className="font-bold shrink-0">1.</span> Sélectionner l'année académique à clôturer</li>
                <li className="flex items-start gap-2"><span className="font-bold shrink-0">2.</span> Vérifier la délibération automatique (admis / ajournés)</li>
                <li className="flex items-start gap-2"><span className="font-bold shrink-0">3.</span> Lancer la promotion — les étudiants admis sont affectés à la classe supérieure</li>
              </ol>
            </div>
          </div>
        )}

        {/* Step 2: Preview / Délibération */}
        {step === "preview" && preview && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Étape 2 — Délibération · <span className="text-blue-600">{preview.academicYear}</span>
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Semestres pris en compte : {preview.semesters.join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep("select")} disabled={launchMutation.isPending}>
                    ← Retour
                  </Button>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={totalAdmitted === 0 || launchMutation.isPending}
                    className="gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <Rocket className="w-4 h-4" />
                    Lancer la promotion annuelle
                  </Button>
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-4 mt-5">
                <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{totalAdmitted}</p>
                  <p className="text-xs text-green-600 mt-0.5 font-medium">Admis à promouvoir</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{preview.classes.reduce((s, c) => s + c.deferredCount, 0)}</p>
                  <p className="text-xs text-red-500 mt-0.5 font-medium">Ajournés</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600">{preview.classes.reduce((s, c) => s + c.pendingCount, 0)}</p>
                  <p className="text-xs text-amber-500 mt-0.5 font-medium">En attente de notes</p>
                </div>
              </div>

              {hasPending && (
                <div className="mt-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Certains étudiants ont des notes manquantes. Ils ne seront pas promus tant que leur dossier n'est pas complet.</span>
                </div>
              )}

              {totalAdmitted === 0 && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <Users className="w-4 h-4 shrink-0" />
                  Aucun étudiant admis à promouvoir pour cette année académique.
                </div>
              )}
            </div>

            {/* Per-class breakdown */}
            <div className="space-y-3">
              {preview.classes.map(cls => (
                <ClassCard key={cls.classId} cls={cls} />
              ))}
              {preview.classes.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                  Aucune classe promotable trouvée (toutes marquées comme fin de cycle ou sans classe supérieure).
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && launchResult && (
          <div className="space-y-5">
            {/* Result summary banner */}
            {reverted ? (
              <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-xl">
                    <Undo2 className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Promotion révoquée</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Les étudiants promus en <span className="font-semibold text-blue-600">{launchResult.academicYear}</span> ont été remis dans leur classe d'origine.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-xl">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">Promotion annuelle terminée</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Année <span className="font-semibold text-blue-600">{launchResult.academicYear}</span> ·{" "}
                        <span className="font-semibold text-green-600">{launchResult.totalPromoted} étudiant{launchResult.totalPromoted > 1 ? "s" : ""}</span> promu{launchResult.totalPromoted > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  {launchResult.totalPromoted > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRollbackConfirmOpen(true)}
                      disabled={rollbackMutation.isPending}
                      className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50 hover:border-orange-400"
                    >
                      <Undo2 className="w-4 h-4" />
                      Révoquer cette promotion
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {launchResult.results.map(r => (
                <ResultCard key={r.classId} result={r} />
              ))}
            </div>

            {/* Post-promotion actions — only when not reverted */}
            {!reverted && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
                  <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-slate-500" />
                    Étapes suivantes
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Complétez le cycle académique avant de passer à la nouvelle année.</p>
                </div>

                <div className="divide-y divide-slate-100">
                  {/* Step A: Archive */}
                  <div className="px-6 py-5 flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl shrink-0 ${archiveDone ? "bg-green-100" : "bg-slate-100"}`}>
                      <Archive className={`w-5 h-5 ${archiveDone ? "text-green-600" : "text-slate-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">
                          1. Archiver l'année {launchResult.academicYear}
                        </p>
                        {archiveDone && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold border border-green-200">
                            <CheckCircle2 className="w-3 h-3" /> Archivée
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Conserve toutes les notes, moyennes et décisions. Les données restent consultables mais non modifiables.
                      </p>
                      {!archiveDone && (
                        <Button
                          size="sm"
                          className="mt-3 bg-slate-700 hover:bg-slate-800 text-white gap-1.5"
                          disabled={archiveMutation.isPending}
                          onClick={() => archiveMutation.mutate({ academicYear: launchResult.academicYear })}
                        >
                          <Archive className="w-3.5 h-3.5" />
                          {archiveMutation.isPending ? "Archivage…" : `Archiver ${launchResult.academicYear}`}
                        </Button>
                      )}
                      {archiveDone && (
                        <Link href="/admin/archives">
                          <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-slate-600">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Voir les archives
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Step B: Initialize new year */}
                  <div className={`px-6 py-5 flex items-start gap-4 ${!archiveDone ? "opacity-50" : ""}`}>
                    <div className={`p-2.5 rounded-xl shrink-0 ${initDone ? "bg-green-100" : "bg-blue-50"}`}>
                      <Sparkles className={`w-5 h-5 ${initDone ? "text-green-600" : "text-blue-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">
                          2. Initialiser la nouvelle année
                        </p>
                        {initDone && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold border border-green-200">
                            <CheckCircle2 className="w-3 h-3" /> {toAcademicYear} créée
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Crée les semestres de la nouvelle année. Les étudiants déjà promus dans leurs nouvelles classes conservent leurs inscriptions.
                      </p>
                      {!initDone && (
                        <div className="flex items-center gap-2 mt-3">
                          <input
                            type="text"
                            value={toAcademicYear}
                            onChange={(e) => setToAcademicYear(e.target.value)}
                            placeholder="ex. 2025-2026"
                            disabled={!archiveDone}
                            className="w-36 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                            disabled={!archiveDone || !toAcademicYear || initMutation.isPending}
                            onClick={() => initMutation.mutate({ fromAcademicYear: launchResult.academicYear, toAcademicYear })}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {initMutation.isPending ? "Création…" : "Initialiser"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => { setStep("select"); setSelectedYear(""); setLaunchResult(null); setReverted(false); setArchiveDone(false); setInitDone(false); setToAcademicYear(""); }}
              >
                Nouvelle promotion
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-blue-600" />
              Lancer la promotion annuelle
            </DialogTitle>
            <DialogDescription className="space-y-2 text-sm pt-1">
              <p>
                Vous êtes sur le point de lancer la <strong>promotion annuelle {selectedYear}</strong>.
              </p>
              <p>
                <strong className="text-green-700">{totalAdmitted} étudiant{totalAdmitted > 1 ? "s" : ""}</strong> admis seront déplacés vers leur classe supérieure respective.
              </p>
              {hasPending && (
                <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  Les étudiants avec des notes manquantes ne seront pas promus.
                </p>
              )}
              <p className="text-gray-500 text-xs">Une révocation sera possible immédiatement après si nécessaire.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={launchMutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={handleLaunch}
              disabled={launchMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              <Rocket className="w-4 h-4" />
              {launchMutation.isPending ? "En cours…" : "Confirmer la promotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Confirmation Dialog */}
      <Dialog open={rollbackConfirmOpen} onOpenChange={setRollbackConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-orange-500" />
              Révoquer la promotion
            </DialogTitle>
            <DialogDescription className="space-y-2 text-sm pt-1">
              <p>
                Vous allez <strong>révoquer la promotion annuelle {launchResult?.academicYear}</strong>.
              </p>
              <p>
                Les <strong className="text-orange-700">{launchResult?.totalPromoted} étudiant{(launchResult?.totalPromoted ?? 0) > 1 ? "s" : ""}</strong> promus seront remis dans leur classe d'origine.
              </p>
              <p className="text-gray-500">Cette action remet le système dans l'état avant la promotion. Confirmez-vous ?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackConfirmOpen(false)} disabled={rollbackMutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={() => launchResult && rollbackMutation.mutate({ academicYear: launchResult.academicYear, results: launchResult.results })}
              disabled={rollbackMutation.isPending}
              className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Undo2 className="w-4 h-4" />
              {rollbackMutation.isPending ? "Révocation…" : "Confirmer la révocation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clôture Annuelle Dialog */}
      <Dialog open={closureOpen} onOpenChange={setClosureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="w-5 h-5" />
              ⚠️ Clôture de l'année académique
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2">
                {/* Checklist */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Avant de continuer, vérifiez :</p>
                  {[
                    "Tous les résultats sont publiés",
                    "Le jury spécial est clôturé",
                    "Les bulletins finaux sont générés",
                    "Les honoraires sont réglés",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>

                {/* Year selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">Année à clôturer</p>
                    <Select value={closureYear} onValueChange={(v) => {
                      setClosureYear(v);
                      const parts = v.split("-");
                      if (parts.length === 2) {
                        const end = parseInt(parts[1]);
                        if (!isNaN(end)) setClosureToYear(`${end}-${end + 1}`);
                      }
                    }}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Sélectionner…" />
                      </SelectTrigger>
                      <SelectContent>
                        {academicYears.map((y) => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">Nouvelle année</p>
                    <Input
                      value={closureToYear}
                      onChange={(e) => setClosureToYear(e.target.value)}
                      placeholder="ex. 2026-2027"
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Warning */}
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-semibold text-red-700">Cette action est IRRÉVERSIBLE.</p>
                  <p className="text-xs text-red-600 mt-1">Elle va promouvoir les admis, archiver l'année {closureYear || "…"} et initialiser {closureToYear || "…"}.</p>
                </div>

                {/* Text confirmation */}
                {closureYear && closureToYear && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-600">
                      Tapez <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-red-700">{expectedConfirmText}</span> pour confirmer
                    </p>
                    <Input
                      value={closureConfirmText}
                      onChange={(e) => setClosureConfirmText(e.target.value)}
                      placeholder={expectedConfirmText}
                      className={`text-sm font-mono ${closureConfirmText === expectedConfirmText ? "border-green-400 bg-green-50" : ""}`}
                    />
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setClosureOpen(false)} disabled={closureMutation.isPending}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={
                !closureYear ||
                !closureToYear ||
                closureConfirmText !== expectedConfirmText ||
                closureMutation.isPending
              }
              className="gap-2"
              onClick={() => closureMutation.mutate({ academicYear: closureYear, toAcademicYear: closureToYear })}
            >
              <Lock className="w-4 h-4" />
              {closureMutation.isPending ? "Clôture en cours…" : "Confirmer la clôture →"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
