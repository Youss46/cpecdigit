import QRCode from "qrcode";
import { CpecPdfDoc, apiFetch, fmt, fmtDate, BRAND } from "../index";

interface JuryDecisionRow {
  studentName: string;
  studentEmail: string;
  semesterName: string;
  decision: string;
  previousAverage: number | null;
  newAverage: number | null;
  justification: string | null;
  decidedBy: string;
  decidedAt: string;
}

interface PvData {
  session: {
    id: number;
    title: string;
    academicYear: string;
    closedAt?: string | null;
    createdAt: string;
  };
  academicYear: string;
  decisions: JuryDecisionRow[];
  generatedAt: string;
}

const DECISION_COLORS: Record<string, [number, number, number]> = {
  ADMIS: BRAND.green,
  AJOURNÉ: BRAND.red,
  PASSABLE: BRAND.orange,
  "ADMIS AVEC RÉSERVE": BRAND.gold,
};

export async function downloadPvJuryPdf(sessionId: number): Promise<void> {
  const data = await apiFetch<PvData>(`/api/jury-special/sessions/${sessionId}/pv`);

  const pdf = new CpecPdfDoc({
    title: "PV DE DÉLIBÉRATION",
    subtitle: data.session.title,
    reference: `PV-${sessionId}-${data.academicYear}`,
  });
  await pdf.init();

  // Official notice
  pdf.addVSpace(2);
  pdf.addText(
    "PROCÈS-VERBAL DE DÉLIBÉRATION DU JURY SPÉCIAL",
    { bold: true, size: 12, color: BRAND.navy }
  );
  pdf.addVSpace(4);

  pdf.addInfoGrid([
    { label: "Titre de la session", value: data.session.title },
    { label: "Année académique", value: data.academicYear },
    { label: "Date de création", value: fmtDate(data.session.createdAt) },
    { label: "Date de clôture", value: data.session.closedAt ? fmtDate(data.session.closedAt) : "En cours" },
    { label: "Nombre de décisions", value: String(data.decisions.length) },
    { label: "Document généré le", value: fmtDate(data.generatedAt) },
  ], 3);

  pdf.addSectionTitle("DÉCISIONS DU JURY", 1);

  if (data.decisions.length === 0) {
    pdf.addText("Aucune décision enregistrée pour cette session.", { color: BRAND.gray });
  } else {
    pdf.addTable(
      ["Étudiant", "Semestre", "Moy. avant", "Moy. après", "Décision", "Décidé par"],
      data.decisions.map((d) => [
        d.studentName,
        d.semesterName,
        d.previousAverage !== null ? fmt(d.previousAverage) : "—",
        d.newAverage !== null ? fmt(d.newAverage) : "—",
        d.decision,
        d.decidedBy,
      ]),
      {
        columnStyles: {
          2: { halign: "center", cellWidth: 22 },
          3: { halign: "center", cellWidth: 22 },
          4: { halign: "center", cellWidth: 28 },
        },
        stripe: true,
        fontSize: 7.5,
      },
    );
  }

  // Stats
  const admis = data.decisions.filter((d) => d.decision?.toUpperCase().includes("ADMIS")).length;
  const ajournes = data.decisions.filter((d) => d.decision?.toUpperCase().includes("AJOURNÉ")).length;

  pdf.addVSpace(3);
  pdf.addInfoGrid([
    { label: "Admis", value: String(admis) },
    { label: "Ajournés", value: String(ajournes) },
    { label: "Autres", value: String(data.decisions.length - admis - ajournes) },
  ], 3);

  pdf.addVSpace(4);
  pdf.addText(
    "Le présent procès-verbal engage la responsabilité des membres du jury signataires. Toute modification ultérieure est soumise à l'approbation du Directeur.",
    { size: 7.5, color: BRAND.gray }
  );

  pdf.addSignatureBlock([
    { title: "Le Président du Jury", name: "" },
    { title: "Le Secrétaire", name: "" },
    { title: "Le Directeur", name: "CPEC-U" },
  ]);

  pdf.finalizeAndSave(`pv_jury_${sessionId}_${data.academicYear}.pdf`);
}
