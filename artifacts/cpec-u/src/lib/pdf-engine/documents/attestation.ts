import QRCode from "qrcode";
import { CpecPdfDoc, apiFetch, fmtDate, BRAND } from "../index";

interface StudentDetail {
  id: number;
  name: string;
  email: string;
  matricule?: string | null;
  sexe?: string | null;
  dateNaissance?: string | null;
  lieuNaissance?: string | null;
  className?: string | null;
  filiere?: string | null;
  academicYear?: string | null;
  photoUrl?: string | null;
  inscriptionDate?: string | null;
}

export async function downloadAttestationPdf(studentId: number): Promise<void> {
  const data = await apiFetch<StudentDetail>(`/api/admin/students/${studentId}/detail`);

  const ref = `ATT-${data.matricule ?? studentId}-${new Date().getFullYear()}`;

  const pdf = new CpecPdfDoc({
    title: "ATTESTATION DE SCOLARITÉ",
    reference: ref,
  });
  await pdf.init();

  // Official header text
  pdf.addVSpace(6);
  pdf.addSectionTitle("L'ÉTABLISSEMENT CPEC-DIGITAL ATTESTE QUE", 1);
  pdf.addVSpace(4);

  // Student identity block
  pdf.doc.setFillColor(248, 250, 252);
  pdf.doc.roundedRect(pdf.margin, pdf.y, pdf.contentW, 42, 3, 3, "F");
  pdf.doc.setDrawColor(...BRAND.navyMid);
  pdf.doc.setLineWidth(0.5);
  pdf.doc.roundedRect(pdf.margin, pdf.y, pdf.contentW, 42, 3, 3, "D");

  pdf.doc.setFontSize(14);
  pdf.doc.setFont("helvetica", "bold");
  pdf.doc.setTextColor(...BRAND.navy);
  pdf.doc.text(
    (data.name ?? "").toUpperCase(),
    pdf.pageW / 2,
    pdf.y + 12,
    { align: "center" }
  );

  pdf.doc.setFontSize(9);
  pdf.doc.setFont("helvetica", "normal");
  pdf.doc.setTextColor(...BRAND.gray);
  const subLines = [
    data.matricule ? `Matricule : ${data.matricule}` : null,
    data.dateNaissance ? `Né(e) le ${fmtDate(data.dateNaissance)}${data.lieuNaissance ? ` à ${data.lieuNaissance}` : ""}` : null,
    data.sexe ? `Sexe : ${data.sexe}` : null,
  ].filter(Boolean) as string[];

  let lineY = pdf.y + 22;
  for (const line of subLines) {
    pdf.doc.text(line, pdf.pageW / 2, lineY, { align: "center" });
    lineY += 5;
  }
  pdf.y += 48;

  // Attestation body text
  const year = data.academicYear ?? new Date().getFullYear();
  const className = data.className ?? "—";
  const filiere = data.filiere ?? "—";

  pdf.addText(
    `est régulièrement inscrit(e) à l'établissement CPEC-U (INP-HB) pour l'année académique ${year} en classe de ${className}, filière ${filiere}.`,
    { size: 10 }
  );
  pdf.addVSpace(3);
  pdf.addText(
    `Cette attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.`,
    { size: 10 }
  );
  pdf.addVSpace(6);

  // Date and place
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  pdf.addText(`Bouaké, le ${today}`, { size: 9, color: BRAND.gray });
  pdf.addVSpace(6);

  // QR verification
  try {
    const verifyUrl = `${window.location.origin}/cpec-u/verify/student/${studentId}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 1 });
    pdf.checkPageBreak(28);
    pdf.doc.addImage(qrDataUrl, "PNG", pdf.margin, pdf.y, 20, 20);
    pdf.doc.setFontSize(7);
    pdf.doc.setFont("helvetica", "italic");
    pdf.doc.setTextColor(...BRAND.gray);
    pdf.doc.text("QR de vérification", pdf.margin, pdf.y + 23);
    pdf.y += 28;
  } catch { /* optional */ }

  pdf.addSignatureBlock([
    { title: "Le Directeur", name: "CPEC-U" },
    { title: "La Scolarité", name: "" },
  ]);

  pdf.finalizeAndSave(`attestation_${(data.name ?? studentId).toString().replace(/\s+/g, "_")}.pdf`);
}
