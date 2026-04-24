import { CpecPdfDoc, apiFetch, fmtDate, BRAND } from "../index";

interface StudentDetail {
  id: number;
  name: string;
  email: string;
  role?: string;
  matricule?: string | null;
  sexe?: string | null;
  dateNaissance?: string | null;
  lieuNaissance?: string | null;
  nationalite?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  className?: string | null;
  filiere?: string | null;
  academicYear?: string | null;
  photoUrl?: string | null;
  inscriptionDate?: string | null;
  balance?: number | null;
}

export async function downloadFicheEtudiantPdf(studentId: number): Promise<void> {
  const data = await apiFetch<StudentDetail>(`/api/admin/students/${studentId}/detail`);

  const pdf = new CpecPdfDoc({
    title: "FICHE INDIVIDUELLE",
    subtitle: "Dossier étudiant",
    reference: `FIC-${data.matricule ?? studentId}`,
  });
  await pdf.init();

  pdf.addSectionTitle("IDENTITÉ", 1);
  pdf.addInfoGrid([
    { label: "Nom & Prénom", value: data.name },
    { label: "Matricule", value: data.matricule },
    { label: "Date de naissance", value: fmtDate(data.dateNaissance) },
    { label: "Lieu de naissance", value: data.lieuNaissance },
    { label: "Sexe", value: data.sexe },
    { label: "Nationalité", value: data.nationalite },
  ], 3);

  pdf.addSectionTitle("CONTACT", 2);
  pdf.addInfoGrid([
    { label: "Email", value: data.email },
    { label: "Téléphone", value: data.telephone },
    { label: "Adresse", value: data.adresse },
  ], 3);

  pdf.addSectionTitle("SCOLARITÉ", 2);
  pdf.addInfoGrid([
    { label: "Classe", value: data.className },
    { label: "Filière", value: data.filiere },
    { label: "Année académique", value: data.academicYear },
    { label: "Date d'inscription", value: fmtDate(data.inscriptionDate) },
  ], 4);

  if (data.balance !== null && data.balance !== undefined) {
    pdf.addSectionTitle("SITUATION FINANCIÈRE", 2);
    const balanceColor = (data.balance ?? 0) >= 0 ? BRAND.green : BRAND.red;
    pdf.doc.setFontSize(11);
    pdf.doc.setFont("helvetica", "bold");
    pdf.doc.setTextColor(...balanceColor);
    pdf.doc.text(
      `Solde : ${Math.round(Number(data.balance)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`,
      pdf.margin,
      pdf.y + 5,
    );
    pdf.y += 10;
  }

  pdf.addVSpace(4);
  pdf.addSignatureBlock([
    { title: "La Scolarité", name: "" },
    { title: "Le Directeur", name: "CPEC-U" },
  ]);

  pdf.finalizeAndSave(`fiche_${(data.name ?? studentId).toString().replace(/\s+/g, "_")}.pdf`);
}
