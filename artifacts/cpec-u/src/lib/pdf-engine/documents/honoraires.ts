import { CpecPdfDoc, apiFetch, fmtDate, BRAND } from "../index";

interface TeacherHonoraire {
  id: number;
  name: string;
  email: string;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  periodLabel: string | null;
  notes: string | null;
  status: "paid" | "partial" | "unpaid";
}

interface Payment {
  id: number;
  amount: number;
  paymentDate: string;
  paymentMethod: string | null;
  description: string | null;
}

function fmtCFA(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  const rounded = Math.round(Number(n));
  const str = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${str} FCFA`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  especes: "Espèces",
  virement: "Virement bancaire",
  orange_money: "Orange Money",
  mtn_momo: "MTN Mobile Money",
  wave: "Wave",
  moov_money: "Moov Money",
  cheque: "Chèque",
};

function fmtPaymentMethod(m: string | null | undefined): string {
  if (!m) return "—";
  return PAYMENT_METHOD_LABELS[m] ?? m;
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Soldé",
  partial: "Partiel",
  unpaid: "Impayé",
};
const STATUS_COLOR: Record<string, [number, number, number]> = {
  paid: BRAND.green,
  partial: BRAND.orange,
  unpaid: BRAND.red,
};

export async function downloadHonorairesRecapPdf(): Promise<void> {
  const teachers = await apiFetch<TeacherHonoraire[]>("/api/honoraires/teachers");

  const totalExpected = teachers.reduce((s, t) => s + (t.totalAmount ?? 0), 0);
  const totalPaid = teachers.reduce((s, t) => s + (t.totalPaid ?? 0), 0);
  const totalRemaining = teachers.reduce((s, t) => s + (t.remaining ?? 0), 0);

  const pdf = new CpecPdfDoc({
    title: "RÉCAPITULATIF DES HONORAIRES",
    subtitle: `Année ${new Date().getFullYear()}`,
    reference: `HON-RECAP-${new Date().getFullYear()}`,
  });
  await pdf.init();

  pdf.addInfoGrid([
    { label: "Total prévu", value: fmtCFA(totalExpected) },
    { label: "Total versé", value: fmtCFA(totalPaid) },
    { label: "Reste à payer", value: fmtCFA(totalRemaining) },
    { label: "Taux de recouvrement", value: totalExpected > 0 ? `${Math.round((totalPaid / totalExpected) * 100)}%` : "—" },
    { label: "Enseignants soldés", value: String(teachers.filter((t) => t.status === "paid").length) },
    { label: "Enseignants avec solde", value: String(teachers.filter((t) => t.status !== "paid").length) },
  ], 3);

  pdf.addSectionTitle("DÉTAIL PAR ENSEIGNANT", 1);

  pdf.addTable(
    ["Enseignant", "Période", "Montant prévu", "Versé", "Restant", "Statut"],
    teachers
      .sort((a, b) => b.remaining - a.remaining)
      .map((t) => [
        t.name,
        t.periodLabel ?? "—",
        fmtCFA(t.totalAmount),
        fmtCFA(t.totalPaid),
        fmtCFA(t.remaining),
        STATUS_LABEL[t.status] ?? t.status,
      ]),
    {
      columnStyles: {
        2: { halign: "right", cellWidth: 38 },
        3: { halign: "right", cellWidth: 38 },
        4: { halign: "right", cellWidth: 38 },
        5: { halign: "center", cellWidth: 18 },
      },
      stripe: true,
      fontSize: 8,
    },
  );

  pdf.addSignatureBlock([
    { title: "Le Planificateur", name: "" },
    { title: "Le Directeur", name: "CPEC-U" },
  ]);

  pdf.finalizeAndSave(`honoraires_recap_${new Date().getFullYear()}.pdf`);
}

export async function downloadFicheHonorairesPdf(teacherId: number, teacherName: string): Promise<void> {
  const [teacher] = (await apiFetch<TeacherHonoraire[]>("/api/honoraires/teachers"))
    .filter((t) => t.id === teacherId);

  const payments = await apiFetch<Payment[]>(`/api/honoraires/payments/${teacherId}`);

  const pdf = new CpecPdfDoc({
    title: "FICHE D'HONORAIRES",
    subtitle: teacherName,
    reference: `HON-${teacherId}-${new Date().getFullYear()}`,
  });
  await pdf.init();

  if (!teacher) {
    pdf.addText("Aucune donnée d'honoraires trouvée pour cet enseignant.", { color: BRAND.red });
    pdf.finalizeAndSave(`fiche_honoraires_${teacherName.replace(/\s+/g, "_")}.pdf`);
    return;
  }

  pdf.addSectionTitle("INFORMATIONS ENSEIGNANT", 2);
  pdf.addInfoGrid([
    { label: "Nom", value: teacher.name },
    { label: "Email", value: teacher.email },
    { label: "Période", value: teacher.periodLabel ?? "—" },
    { label: "Statut", value: STATUS_LABEL[teacher.status] ?? teacher.status },
  ], 2);

  pdf.addSectionTitle("RÉCAPITULATIF FINANCIER", 1);
  pdf.addInfoGrid([
    { label: "Montant prévu", value: fmtCFA(teacher.totalAmount) },
    { label: "Montant versé", value: fmtCFA(teacher.totalPaid) },
    { label: "Montant restant", value: fmtCFA(teacher.remaining) },
    { label: "Taux", value: teacher.totalAmount > 0 ? `${Math.round((teacher.totalPaid / teacher.totalAmount) * 100)}%` : "—" },
  ], 2);

  if (payments.length > 0) {
    pdf.addSectionTitle("HISTORIQUE DES PAIEMENTS", 2);
    pdf.addTable(
      ["Date", "Montant", "Moyen de paiement", "Description"],
      payments.map((p) => [
        fmtDate(p.paymentDate),
        fmtCFA(p.amount),
        fmtPaymentMethod(p.paymentMethod),
        p.description ?? "—",
      ]),
      {
        columnStyles: {
          0: { halign: "center", cellWidth: 26 },
          1: { halign: "right", cellWidth: 46 },
          2: { halign: "left", cellWidth: 40 },
        },
        stripe: true,
        fontSize: 8,
      },
    );
  } else {
    pdf.addText("Aucun paiement enregistré.", { color: BRAND.gray });
  }

  if (teacher.notes) {
    pdf.addSectionTitle("OBSERVATIONS", 3);
    pdf.addText(teacher.notes);
  }

  pdf.addSignatureBlock([
    { title: "L'enseignant", name: teacher.name },
    { title: "Le Directeur", name: "CPEC-U" },
  ]);

  pdf.finalizeAndSave(`fiche_honoraires_${teacherName.replace(/\s+/g, "_")}.pdf`);
}
