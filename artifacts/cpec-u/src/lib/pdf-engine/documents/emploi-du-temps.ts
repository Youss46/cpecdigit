import { CpecPdfDoc, apiFetch, BRAND } from "../index";

interface ScheduleEntry {
  id: number;
  subjectName: string;
  teacherName: string;
  className: string;
  classId: number;
  teacherId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  semesterName: string;
  semesterId: number;
}

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAY_NUMS = [1, 2, 3, 4, 5, 6];

type FilterMode = "class" | "teacher";

export async function downloadEmploiDuTempsPdf(
  params: { classId?: number; className?: string; teacherId?: number; teacherName?: string; semesterId?: number; semesterName?: string },
  options?: { print?: boolean },
): Promise<string | void> {
  let url = "/api/schedules/publications?";
  if (params.classId) url += `classId=${params.classId}&`;
  if (params.semesterId) url += `semesterId=${params.semesterId}&`;

  const entries = await apiFetch<ScheduleEntry[]>(url.replace(/&$/, ""));

  const filtered = entries.filter((e) => {
    if (params.classId && e.classId !== params.classId) return false;
    if (params.teacherId && e.teacherId !== params.teacherId) return false;
    return true;
  });

  const mode: FilterMode = params.teacherId ? "teacher" : "class";
  const label = mode === "teacher"
    ? (params.teacherName ?? "Enseignant")
    : (params.className ?? "Classe");
  const semLabel = params.semesterName ?? "";

  const pdf = new CpecPdfDoc({
    title: "EMPLOI DU TEMPS",
    subtitle: `${label}${semLabel ? " — " + semLabel : ""}`,
    orientation: "landscape",
    reference: `EDT-${label.replace(/\s+/g, "-")}-${new Date().getFullYear()}`,
  });
  await pdf.init();

  pdf.addInfoGrid([
    { label: mode === "teacher" ? "Enseignant" : "Classe", value: label },
    { label: "Semestre", value: semLabel || "—" },
    { label: "Nombre de séances", value: String(filtered.length) },
  ], 3);

  if (filtered.length === 0) {
    pdf.addText("Aucune séance dans l'emploi du temps publié.", { color: BRAND.gray });
    if (options?.print) return pdf.finalizeAndGetBlobUrl();
    pdf.finalizeAndSave(`emploi_du_temps_${label.replace(/\s+/g, "_")}.pdf`);
    return;
  }

  // Group by day
  const byDay = new Map<number, ScheduleEntry[]>();
  for (const day of DAY_NUMS) byDay.set(day, []);
  for (const e of filtered) {
    byDay.get(e.dayOfWeek)?.push(e);
  }

  // Sort by time within each day
  for (const entries of byDay.values()) {
    entries.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  const activeDays = DAY_NUMS.filter((d) => (byDay.get(d)?.length ?? 0) > 0);

  pdf.addSectionTitle("PLANNING HEBDOMADAIRE", 1);

  for (const day of activeDays) {
    const dayEntries = byDay.get(day) ?? [];
    pdf.addSectionTitle(DAYS[day - 1], 2);

    pdf.addTable(
      mode === "teacher"
        ? ["Horaire", "Matière", "Classe", "Salle"]
        : ["Horaire", "Matière", "Enseignant", "Salle"],
      dayEntries.map((e) => [
        `${e.startTime}–${e.endTime}`,
        e.subjectName,
        mode === "teacher" ? e.className : e.teacherName,
        e.room ?? "—",
      ]),
      {
        columnStyles: {
          0: { halign: "center", cellWidth: 30 },
          3: { halign: "center", cellWidth: 25 },
        },
        stripe: true,
        fontSize: 8,
      },
    );
  }

  if (options?.print) return pdf.finalizeAndGetBlobUrl();
  pdf.finalizeAndSave(`emploi_du_temps_${label.replace(/\s+/g, "_")}.pdf`);
}
