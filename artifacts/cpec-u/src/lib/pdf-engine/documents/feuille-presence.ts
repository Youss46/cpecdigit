import { CpecPdfDoc, apiFetch, fmtDate, BRAND } from "../index";

interface AttendanceSession {
  id: number;
  teacherId: number;
  subjectId: number;
  classId: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  subjectName?: string;
  teacherName?: string;
  className?: string;
  duration?: number;
}

interface AttendanceRecord {
  studentId: number;
  studentName: string;
  status: "present" | "absent" | "late" | "excused";
  note: string | null;
  justified: boolean;
}

interface SessionResponse {
  session: AttendanceSession;
  records: AttendanceRecord[];
}

const STATUS_LABEL: Record<string, string> = {
  present: "Présent(e)",
  absent: "Absent(e)",
  late: "En retard",
  excused: "Excusé(e)",
};

export async function downloadFeuillePresencePdf(sessionId: number): Promise<void> {
  const { session, records } = await apiFetch<SessionResponse>(`/api/admin/attendance/sessions/${sessionId}`);

  const label = session.className ?? `Session #${sessionId}`;
  const dateStr = fmtDate(session.sessionDate);

  const presentCount = records.filter((r) => r.status === "present").length;
  const absentCount = records.filter((r) => r.status === "absent" || r.status === "late").length;

  const pdf = new CpecPdfDoc({
    title: "FEUILLE DE PRÉSENCE",
    subtitle: `${label} — ${dateStr}`,
    reference: `FP-${sessionId}-${session.sessionDate}`,
  });
  await pdf.init();

  pdf.addInfoGrid([
    { label: "Classe", value: label },
    { label: "Matière", value: session.subjectName ?? "—" },
    { label: "Enseignant", value: session.teacherName ?? "—" },
    { label: "Date", value: dateStr },
    { label: "Horaire", value: `${session.startTime ?? "—"} – ${session.endTime ?? "—"}` },
    { label: "Présents", value: `${presentCount} / ${records.length}` },
  ], 3);

  pdf.addSectionTitle("LISTE DE PRÉSENCE", 1);

  pdf.addTable(
    ["N°", "Nom & Prénom", "Statut", "Note / Justification", "Émargement"],
    records.map((r, i) => [
      String(i + 1),
      r.studentName,
      STATUS_LABEL[r.status] ?? r.status,
      r.note ?? (r.justified ? "Justifié" : ""),
      "",
    ]),
    {
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        2: { halign: "center", cellWidth: 25 },
        4: { halign: "center", cellWidth: 35 },
      },
      headColor: presentCount > absentCount ? BRAND.navyMid : BRAND.orange,
      stripe: true,
      fontSize: 8,
    },
  );

  // Summary row
  pdf.addVSpace(2);
  pdf.doc.setFontSize(8.5);
  pdf.doc.setFont("helvetica", "bold");
  pdf.doc.setTextColor(...BRAND.navy);
  pdf.doc.text(
    `Total présents : ${presentCount} | Absents/Retards : ${absentCount} | Taux de présence : ${records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0}%`,
    pdf.margin,
    pdf.y + 4,
  );
  pdf.y += 10;

  pdf.addSignatureBlock([
    { title: "L'enseignant", name: session.teacherName ?? "" },
    { title: "Le surveillant", name: "" },
  ]);

  pdf.finalizeAndSave(`presence_${label.replace(/\s+/g, "_")}_${session.sessionDate}.pdf`);
}

export async function downloadFeuillePresenceViergePdf(
  className: string,
  subjectName: string,
  teacherName: string,
  studentNames: string[],
): Promise<void> {
  const pdf = new CpecPdfDoc({
    title: "FEUILLE DE PRÉSENCE",
    subtitle: "Vierge",
    reference: `FPV-${className.replace(/\s+/g, "-")}`,
  });
  await pdf.init();

  pdf.addInfoGrid([
    { label: "Classe", value: className },
    { label: "Matière", value: subjectName },
    { label: "Enseignant", value: teacherName },
    { label: "Date", value: "_____ / _____ / _______" },
    { label: "Horaire", value: "________ – ________" },
  ], 3);

  pdf.addSectionTitle("LISTE DE PRÉSENCE", 1);

  pdf.addTable(
    ["N°", "Nom & Prénom", "Statut", "Émargement"],
    studentNames.map((name, i) => [String(i + 1), name, "", ""]),
    {
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        2: { halign: "center", cellWidth: 25 },
        3: { halign: "center", cellWidth: 45 },
      },
      stripe: false,
      fontSize: 8,
    },
  );

  pdf.addSignatureBlock([
    { title: "L'enseignant", name: teacherName },
    { title: "Le surveillant", name: "" },
  ]);

  pdf.finalizeAndSave(`presence_vierge_${className.replace(/\s+/g, "_")}.pdf`);
}
