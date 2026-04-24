import { useState } from "react";
import { Link } from "wouter";
import { useGetArchives, useGetArchiveDetail } from "@workspace/api-client-react";
import {
  Archive,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Users,
  GraduationCap,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-400 text-xs font-medium">
        <Clock className="w-3 h-3" />
        —
      </span>
    );
  if (decision === "Admis")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700 text-xs font-semibold">
        <CheckCircle2 className="w-3 h-3" />
        Admis
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700 text-xs font-semibold">
      <XCircle className="w-3 h-3" />
      Ajourné
    </span>
  );
}

function YearDetailPanel({ academicYear }: { academicYear: string }) {
  const { data, isLoading, error } = useGetArchiveDetail(academicYear);

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2" />
        Chargement de l'archive…
      </div>
    );
  if (error || !data)
    return (
      <div className="flex items-center gap-2 text-sm text-red-500 py-8 justify-center">
        <XCircle className="w-4 h-4" />
        Impossible de charger les données de cette archive.
      </div>
    );

  const { semesters, classes, enrollments, grades } = data;

  const byClass = classes.map((cls) => {
    const students = enrollments.filter((e) => e.classId === cls.id);
    return {
      ...cls,
      students: students.map((s) => {
        const semGrades = semesters.map((sem) => {
          const g = grades.find((gr) => gr.studentId === s.studentId && gr.semesterId === sem.id);
          return { semName: sem.name, average: g?.average ?? null, decision: g?.decision ?? null };
        });
        const allAdmis = semGrades.length > 0 && semGrades.every((sg) => sg.decision === "Admis");
        const annualDecision = semGrades.every((sg) => sg.decision === null)
          ? null
          : allAdmis
          ? "Admis"
          : "Ajourné";
        return { ...s, semGrades, annualDecision };
      }),
    };
  });

  const totalStudents = enrollments.length;
  const admis = byClass.flatMap((c) => c.students).filter((s) => s.annualDecision === "Admis").length;

  return (
    <div className="space-y-5 pt-2">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{semesters.length}</p>
          <p className="text-xs text-blue-600 mt-0.5 font-medium">Semestre{semesters.length > 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{admis}</p>
          <p className="text-xs text-green-600 mt-0.5 font-medium">Admis</p>
        </div>
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{totalStudents - admis}</p>
          <p className="text-xs text-red-500 mt-0.5 font-medium">Ajournés</p>
        </div>
      </div>

      {/* Per-class breakdown */}
      <div className="space-y-3">
        {byClass
          .filter((cls) => cls.students.length > 0)
          .map((cls) => (
            <ClassResultTable key={cls.id} cls={cls} semesters={semesters} />
          ))}
        {byClass.every((c) => c.students.length === 0) && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
            Aucune donnée étudiante disponible pour cette archive.
          </div>
        )}
      </div>
    </div>
  );
}

function ClassResultTable({
  cls,
  semesters,
}: {
  cls: {
    id: number;
    name: string;
    students: {
      studentId: number;
      studentName: string;
      semGrades: { semName: string; average: number | null; decision: string | null }[];
      annualDecision: string | null;
    }[];
  };
  semesters: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const admisCount = cls.students.filter((s) => s.annualDecision === "Admis").length;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              <div>
                <p className="font-semibold text-gray-900 text-sm">{cls.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{cls.students.length} étudiant{cls.students.length > 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {admisCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 text-xs font-semibold">
                  <CheckCircle2 className="w-3 h-3" />
                  {admisCount} admis
                </span>
              )}
              {cls.students.length - admisCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 text-xs font-semibold">
                  <XCircle className="w-3 h-3" />
                  {cls.students.length - admisCount} ajourné{cls.students.length - admisCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Étudiant</th>
                    {semesters.map((sem) => (
                      <th key={sem.id} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {sem.name}
                      </th>
                    ))}
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Décision annuelle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cls.students.map((s) => (
                    <tr key={s.studentId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-800">{s.studentName}</td>
                      {s.semGrades.map((sg, i) => (
                        <td key={i} className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {sg.average !== null && (
                              <span className="text-xs font-mono text-gray-600">{sg.average.toFixed(2)}/20</span>
                            )}
                            <DecisionBadge decision={sg.decision} />
                          </div>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <DecisionBadge decision={s.annualDecision} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ArchiveCard({ archive }: { archive: ReturnType<typeof useGetArchives>["data"] extends (infer T)[] | undefined ? T : never }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-2xl border shadow-sm overflow-hidden bg-white transition-all ${open ? "border-blue-200" : "border-gray-200"}`}>
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex items-center justify-between px-6 py-5 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-xl ${open ? "bg-blue-600" : "bg-gray-100"} transition-colors`}>
                <BookOpen className={`w-5 h-5 ${open ? "text-white" : "text-gray-500"}`} />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-base">{archive.academicYear}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <CalendarDays className="w-3 h-3 text-gray-400" />
                  <p className="text-xs text-gray-500">Archivée le {formatDate(archive.archivedAt)}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {archive.newAcademicYear ? (
                <Badge className="bg-green-50 text-green-700 border-green-200 border text-xs">
                  <Layers className="w-3 h-3 mr-1" />
                  Initialisée → {archive.newAcademicYear}
                </Badge>
              ) : (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200 border text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  Non initialisée
                </Badge>
              )}
              {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-gray-100 bg-gray-50/30 px-6 py-5">
            <YearDetailPanel academicYear={archive.academicYear} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function ArchivesPage() {
  const { data: archives, isLoading, error } = useGetArchives();

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-3">
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            Tableau de bord
          </Link>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-slate-700 rounded-xl shadow-md shrink-0">
              <Archive className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Archives Académiques</h1>
              <p className="text-gray-500 text-sm mt-1">
                Années archivées — données consultables et non modifiables.
              </p>
            </div>
          </div>
        </div>

        {/* Read-only notice */}
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">
            Les données archivées sont <strong>consultables uniquement</strong>. Notes, moyennes et décisions sont conservées à titre historique et ne peuvent pas être modifiées.
          </p>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm text-gray-400">Chargement des archives…</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <XCircle className="w-4 h-4 shrink-0" />
            Erreur lors du chargement des archives.
          </div>
        )}

        {!isLoading && !error && archives && archives.length === 0 && (
          <div className="flex flex-col items-center py-20 text-gray-400 text-center">
            <div className="p-5 bg-gray-100 rounded-2xl mb-4">
              <Archive className="w-10 h-10 opacity-40" />
            </div>
            <p className="font-semibold text-base text-gray-500 mb-1">Aucune archive</p>
            <p className="text-sm max-w-xs">
              Aucune année académique n'a encore été archivée. Lancez une promotion annuelle puis archivez l'année depuis la page{" "}
              <Link href="/admin/promotion" className="text-blue-600 hover:underline">Promotion Annuelle</Link>.
            </p>
          </div>
        )}

        {!isLoading && archives && archives.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">
                {archives.length} année{archives.length > 1 ? "s" : ""} archivée{archives.length > 1 ? "s" : ""}
              </span>
            </div>
            {archives.map((arc) => (
              <ArchiveCard key={arc.id} archive={arc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
