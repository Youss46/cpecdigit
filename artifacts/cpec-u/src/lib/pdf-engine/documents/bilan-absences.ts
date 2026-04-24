import { CpecPdfDoc, apiFetch, BRAND } from "../index";

interface AbsenceRow {
  studentId: number;
  studentName: string;
  classId: number;
  className: string;
  totalHours: number;
  justifiedHours: number;
  unjustifiedHours: number;
  absenceCount: number;
}

export async function downloadBilanAbsencesPdf(
  semesterId: number,
  semesterName: string,
  classId?: number,
  className?: string,
  options?: { print?: boolean },
): Promise<string | void> {
  let url = `/api/admin/attendance/summary?semesterId=${semesterId}`;
  if (classId) url += `&classId=${classId}`;
  const rows = await apiFetch<AbsenceRow[]>(url);

  const subtitle = className ? `${className} — ${semesterName}` : semesterName;
  const pdf = new CpecPdfDoc({
    title: "BILAN DES ABSENCES",
    subtitle,
    reference: `ABS-${semesterId}${classId ? "-" + classId : ""}`,
  });
  await pdf.init();

  const totalH = rows.reduce((s, r) => s + (r.totalHours ?? 0), 0);
  const justH = rows.reduce((s, r) => s + (r.justifiedHours ?? 0), 0);
  const unjustH = rows.reduce((s, r) => s + (r.unjustifiedHours ?? 0), 0);

  pdf.addInfoGrid([
    { label: "Semestre", value: semesterName },
    { label: className ? "Classe" : "Toutes classes", value: className ?? "Toutes" },
    { label: "Étudiants concernés", value: String(rows.length) },
    { label: "Total heures d'absence", value: `${totalH} h` },
    { label: "Heures justifiées", value: `${justH} h` },
    { label: "Heures non justifiées", value: `${unjustH} h` },
  ], 3);

  pdf.addSectionTitle("DÉTAIL PAR ÉTUDIANT", 1);

  pdf.addTable(
    ["N°", "Nom & Prénom", "Classe", "Total (h)", "Justifiées (h)", "Non justif. (h)", "Séances"],
    rows
      .sort((a, b) => (b.totalHours ?? 0) - (a.totalHours ?? 0))
      .map((r, i) => [
        String(i + 1),
        r.studentName,
        r.className,
        String(r.totalHours ?? 0),
        String(r.justifiedHours ?? 0),
        String(r.unjustifiedHours ?? 0),
        String(r.absenceCount ?? 0),
      ]),
    {
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        3: { halign: "center", cellWidth: 22 },
        4: { halign: "center", cellWidth: 28 },
        5: { halign: "center", cellWidth: 28 },
        6: { halign: "center", cellWidth: 18 },
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
  pdf.finalizeAndSave(`bilan_absences_${subtitle.replace(/\s+/g, "_")}.pdf`);
}
