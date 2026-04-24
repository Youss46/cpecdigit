import { CpecPdfDoc, apiFetch, fmt, BRAND } from "../index";

interface StudentResult {
  studentId: number;
  studentName: string;
  className: string | null;
  semesterName: string | null;
  average: number | null;
  averageNette: number | null;
  decision: string;
  rank: number | null;
  totalStudents: number | null;
  absenceDeductionHours: number;
  absenceDeduction: number;
}

export async function downloadResultatsClassePdf(
  semesterId: number,
  semesterName: string,
  classId?: number,
  className?: string,
  options?: { print?: boolean },
): Promise<string | void> {
  let url = `/api/admin/results/${semesterId}`;
  if (classId) url += `?classId=${classId}`;

  const results = await apiFetch<StudentResult[]>(url);

  const filtered = classId ? results.filter((r) => r.className === className || !className) : results;
  const sorted = [...filtered].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const subtitle = className ? `${className} — ${semesterName}` : semesterName;
  const admis = filtered.filter((r) => r.decision?.toUpperCase().includes("ADMIS") && !r.decision?.toUpperCase().includes("AJOURNÉ")).length;
  const ajournes = filtered.filter((r) => r.decision?.toUpperCase().includes("AJOURNÉ")).length;

  const pdf = new CpecPdfDoc({
    title: "RÉSULTATS DE CLASSE",
    subtitle,
    reference: `RES-${semesterId}${classId ? "-" + classId : ""}`,
  });
  await pdf.init();

  pdf.addInfoGrid([
    { label: "Semestre", value: semesterName },
    { label: className ? "Classe" : "Toutes classes", value: className ?? "Toutes" },
    { label: "Étudiants", value: String(filtered.length) },
    { label: "Admis", value: String(admis) },
    { label: "Ajournés", value: String(ajournes) },
    { label: "Taux de réussite", value: filtered.length > 0 ? `${Math.round((admis / filtered.length) * 100)}%` : "—" },
  ], 3);

  pdf.addSectionTitle("CLASSEMENT", 1);

  pdf.addTable(
    ["Rang", "Nom & Prénom", "Classe", "Moy. brute", "Abs.(h)", "Moy. nette", "Décision"],
    sorted.map((r) => [
      r.rank !== null ? String(r.rank) : "—",
      r.studentName,
      r.className ?? "—",
      r.average !== null ? fmt(r.average) : "—",
      String(r.absenceDeductionHours ?? 0),
      r.averageNette !== null ? fmt(r.averageNette) : "—",
      r.decision ?? "—",
    ]),
    {
      columnStyles: {
        0: { halign: "center", cellWidth: 12 },
        3: { halign: "center", cellWidth: 22 },
        4: { halign: "center", cellWidth: 16 },
        5: { halign: "center", cellWidth: 22 },
        6: { halign: "center", cellWidth: 25 },
      },
      stripe: true,
      fontSize: 7.5,
    },
  );

  pdf.addSignatureBlock([
    { title: "La Scolarité", name: "" },
    { title: "Le Directeur", name: "CPEC-U" },
  ]);

  if (options?.print) return pdf.finalizeAndGetBlobUrl();
  pdf.finalizeAndSave(`resultats_${subtitle.replace(/\s+/g, "_")}.pdf`);
}
