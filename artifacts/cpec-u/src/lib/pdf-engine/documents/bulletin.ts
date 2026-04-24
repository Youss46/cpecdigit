import QRCode from "qrcode";
import { CpecPdfDoc, apiFetch, fmt, fmtDate, BRAND } from "../index";

const CAT_ORDER = ["culture_generale", "connaissances_fondamentales", "specialite"];
const CAT_LABELS: Record<string, string> = {
  culture_generale: "UE DE CULTURE GÉNÉRALE",
  connaissances_fondamentales: "UE DE CONNAISSANCES FONDAMENTALES",
  specialite: "UE DE SPÉCIALITÉ",
};

interface UEResult {
  ueId: number;
  ueCode: string;
  ueName: string;
  category: string | null;
  credits: number;
  coefficient: number;
  average: number | null;
  acquis: boolean;
  subjects: Array<{ subjectName: string; coefficient: number; value: number | null }>;
}

interface BulletinJson {
  studentName: string;
  studentMatricule: string;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  sexe: string | null;
  filiere: string;
  className: string;
  semesterName: string;
  academicYear: string;
  average: number | null;
  averageNette: number | null;
  decision: string;
  rank: number | null;
  totalStudents: number | null;
  absenceDeductionHours: number;
  absenceDeduction: number;
  creditsValidated: number;
  totalCredits: number;
  ueResults: UEResult[];
  unassignedSubjects: Array<{ subjectName: string; coefficient: number; value: number | null }>;
  verifyUrl: string;
}

function pickFontSize(totalSubjects: number): number {
  if (totalSubjects <= 8)  return 7.5;
  if (totalSubjects <= 12) return 7;
  if (totalSubjects <= 16) return 6.5;
  return 6;
}

export async function downloadBulletinPdf(studentId: number, semesterId: number): Promise<void> {
  const data = await apiFetch<BulletinJson>(`/api/admin/bulletin-json/${studentId}/${semesterId}`);

  const totalSubjects =
    data.ueResults.reduce((acc, ue) => acc + ue.subjects.length, 0) +
    data.unassignedSubjects.length;

  const fontSize = pickFontSize(totalSubjects);

  const pdf = new CpecPdfDoc({
    title: "BULLETIN DE NOTES",
    subtitle: data.semesterName,
    reference: `BLT-${data.studentMatricule}-${semesterId}`,
    compact: true,
  });
  await pdf.init();

  // ── Infos étudiant ──────────────────────────────────────────────────────────
  pdf.addInfoGrid([
    { label: "Nom & Prénom", value: data.studentName },
    { label: "Matricule", value: data.studentMatricule },
    { label: "Date de naissance", value: fmtDate(data.dateNaissance) },
    { label: "Lieu de naissance", value: data.lieuNaissance },
    { label: "Sexe", value: data.sexe },
    { label: "Filière", value: data.filiere },
    { label: "Classe", value: data.className },
    { label: "Année académique", value: data.academicYear },
  ], 4);

  // ── Notes par UE ─────────────────────────────────────────────────────────────
  const byCategory = new Map<string, UEResult[]>();
  for (const ue of data.ueResults) {
    const cat = ue.category ?? "_none";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(ue);
  }

  const orderedCats = [
    ...CAT_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !CAT_ORDER.includes(c) && c !== "_none"),
    ...(byCategory.has("_none") ? ["_none"] : []),
  ];

  pdf.addVSpace(4);

  let firstCat = true;
  for (const cat of orderedCats) {
    const ues = byCategory.get(cat) ?? [];
    if (ues.length === 0) continue;

    if (!firstCat) pdf.addVSpace(4);
    firstCat = false;

    const catLabel =
      cat === "_none" ? "MATIÈRES SANS UE" : (CAT_LABELS[cat] ?? cat.toUpperCase());
    pdf.addSectionTitle(catLabel, 2);

    for (const ue of ues) {
      const ueAvg = ue.average !== null ? fmt(ue.average) : "—";
      const ueAcquis = ue.acquis ? "✓ Acquis" : "✗ Non acquis";
      pdf.addSectionTitle(
        `${ue.ueCode} — ${ue.ueName}  |  Moy: ${ueAvg}/20  |  ${ueAcquis}`,
        3,
      );

      pdf.addTable(
        ["Matière", "Coef.", "Note /20"],
        ue.subjects.map((s) => [
          s.subjectName,
          String(s.coefficient),
          s.value !== null ? fmt(s.value) : "—",
        ]),
        {
          columnStyles: {
            1: { halign: "center", cellWidth: 18 },
            2: { halign: "center", cellWidth: 22 },
          },
          headColor: BRAND.navyMid,
          stripe: true,
          fontSize,
          cellPadding: 1.5,
        },
      );
    }
  }

  // Matières sans UE
  if (data.unassignedSubjects.length > 0) {
    pdf.addSectionTitle("AUTRES MATIÈRES", 2);
    pdf.addTable(
      ["Matière", "Coef.", "Note /20"],
      data.unassignedSubjects.map((s) => [
        s.subjectName,
        String(s.coefficient),
        s.value !== null ? fmt(s.value) : "—",
      ]),
      {
        columnStyles: {
          1: { halign: "center", cellWidth: 18 },
          2: { halign: "center", cellWidth: 22 },
        },
        headColor: BRAND.navyMid,
        stripe: true,
        fontSize,
        cellPadding: 1.5,
      },
    );
  }

  // ── Récapitulatif ─────────────────────────────────────────────────────────
  pdf.addSectionTitle("RÉCAPITULATIF", 1);
  pdf.addInfoGrid([
    { label: "Moyenne brute", value: fmt(data.average) + " / 20" },
    { label: "Heures d'absence", value: String(data.absenceDeductionHours) + " h" },
    { label: "Déduction absences", value: fmt(data.absenceDeduction) },
    { label: "Moyenne nette", value: fmt(data.averageNette) + " / 20" },
    {
      label: "Classement",
      value:
        data.rank && data.totalStudents
          ? `${data.rank === 1 ? "1er" : `${data.rank}ème`} / ${data.totalStudents}`
          : "---",
    },
    { label: "Décision", value: data.decision },
  ], 4);

  // ── Signatures ───────────────────────────────────────────────────────────
  pdf.addVSpace(3);
  pdf.addSignatureBlock(
    [
      { title: "Le Directeur", name: "CPEC-U" },
      { title: "Cachet de l'établissement", name: "" },
      { title: "L'étudiant(e)", name: data.studentName },
    ],
    18,
  );

  // ── QR Code footer ───────────────────────────────────────────────────────
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(data.verifyUrl, { width: 200, margin: 1 });
  } catch { /* QR optional */ }

  pdf.finalizeWithQrFooter(
    `bulletin_${data.studentMatricule}_${data.semesterName.replace(/\s+/g, "_")}.pdf`,
    qrDataUrl,
  );
}
