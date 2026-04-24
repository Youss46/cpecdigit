import { CpecPdfDoc, apiFetch, fmtDate } from "../index";

interface StudentEntry {
  id: number;
  name: string;
  email: string;
  matricule?: string | null;
  sexe?: string | null;
  dateNaissance?: string | null;
  lieuNaissance?: string | null;
  photoUrl?: string | null;
}

interface ClassInfo {
  id: number;
  name: string;
  filiere: string | null;
  academicYear?: string | null;
}

export async function downloadListeEtudiantsPdf(classId: number, className: string, filiere?: string | null): Promise<void> {
  const students = await apiFetch<StudentEntry[]>(`/api/admin/classes/${classId}/students`);

  const pdf = new CpecPdfDoc({
    title: "LISTE DES ÉTUDIANTS",
    subtitle: className,
    reference: `LST-${classId}-${new Date().getFullYear()}`,
  });
  await pdf.init();

  pdf.addInfoGrid([
    { label: "Classe", value: className },
    { label: "Filière", value: filiere },
    { label: "Nombre d'étudiants", value: String(students.length) },
    { label: "Date d'édition", value: new Date().toLocaleDateString("fr-FR") },
  ], 4);

  pdf.addSectionTitle("LISTE NOMINATIVE", 1);

  pdf.addTable(
    ["N°", "Nom & Prénom", "Matricule", "Sexe", "Date de naissance", "Email"],
    students.map((s, i) => [
      String(i + 1),
      s.name,
      s.matricule ?? "—",
      s.sexe ?? "—",
      s.dateNaissance ? fmtDate(s.dateNaissance) : "—",
      s.email,
    ]),
    {
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        2: { halign: "center", cellWidth: 25 },
        3: { halign: "center", cellWidth: 12 },
        4: { halign: "center", cellWidth: 28 },
      },
      stripe: true,
      fontSize: 7.5,
    },
  );

  pdf.addSignatureBlock([
    { title: "Le Directeur", name: "CPEC-U" },
    { title: "La Scolarité", name: "" },
  ]);

  pdf.finalizeAndSave(`liste_etudiants_${className.replace(/\s+/g, "_")}.pdf`);
}
