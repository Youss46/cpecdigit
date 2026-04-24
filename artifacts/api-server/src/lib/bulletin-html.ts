import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);

function getLogoBase64(): string {
  try {
    const logoPath = path.resolve(__dirname_local, "../../../../artifacts/cpec-u/public/logo-inphb.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function fmt(v: number | null | undefined, dec = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(dec);
}

function ordinalStr(n: number): string {
  return n === 1 ? "1er" : `${n}ème`;
}

const CAT_ORDER = ["culture_generale", "connaissances_fondamentales", "specialite"];
const CAT_LABELS: Record<string, string> = {
  culture_generale: "UE DE CULTURE GÉNÉRALE",
  connaissances_fondamentales: "UE DE CONNAISSANCES FONDAMENTALES",
  specialite: "UE DE SPÉCIALITÉ",
};

export interface BulletinUE {
  ueId: number;
  ueCode: string;
  ueName: string;
  category: string | null;
  credits: number;
  coefficient: number;
  average: number | null;
  acquis: boolean;
  eliminatorySubjectName?: string | null;
  subjects: Array<{
    subjectId: number;
    subjectName: string;
    coefficient: number;
    value: number | null;
  }>;
}

export interface BulletinSchool {
  acronym: string;
  name: string;
}

export interface BulletinData {
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
  ueResults: BulletinUE[];
  unassignedSubjects: Array<{
    subjectId: number;
    subjectName: string;
    coefficient: number;
    value: number | null;
  }>;
  editionDate: string;
  schools?: BulletinSchool[];
  qrCodeDataUrl?: string;
}

export function generateBulletinHTML(data: BulletinData): string {
  const logo = getLogoBase64();

  // Rank only shown when semester average is fully calculable
  const rankStr = (data.rank !== null && data.totalStudents !== null && data.averageNette !== null)
    ? `${ordinalStr(data.rank)} sur ${data.totalStudents}`
    : "—";

  const notesComplete = data.averageNette !== null;

  const decisionLabel = data.decision === "Admis"
    ? "Admis"
    : data.decision === "Ajourné"
    ? "Ajourné"
    : "En attente";

  const decisionColor = data.decision === "Admis"
    ? "#1a7a3a"
    : data.decision === "Ajourné"
    ? "#c0392b"
    : "#b7860b";

  // Jury cell HTML: full (with stamp) when notes are complete, neutral placeholder otherwise
  function juryHtml(): string {
    if (!notesComplete) {
      return `<div class="jury-inner" style="justify-content:center;align-items:center;">
        <div style="color:#b7860b;font-size:8pt;font-weight:bold;text-align:center;padding:8px;">
          Notes incomplètes<br/>
          <span style="font-weight:normal;font-size:7pt;color:#888;">La délibération ne peut<br/>avoir lieu que lorsque<br/>toutes les notes sont saisies.</span>
        </div>
      </div>`;
    }
    return `<div class="jury-inner">
      <div class="jury-header">APPRÉCIATIONS DU JURY DU PROGRAMME</div>
      <div class="jury-decision" style="color:${decisionColor};">${decisionLabel}</div>
      <div class="jury-signataire">
        <div class="jury-stamp-label">LE COORDONNATEUR DU CENTRE</div>
        <div class="jury-stamp-sublabel">P.O LE RESPONSABLE D'ETUDE</div>
        <div class="jury-stamp">
          <div class="stamp-circle">
            <span>ESCAE</span>
            <span>CPEC-UEMOA</span>
          </div>
        </div>
        <div class="jury-name">Dr. KPOLIE DEFFO CASIMIR</div>
      </div>
    </div>`;
  }

  // ── Build table rows HTML ─────────────────────────────────────────────────
  // We need to know total row count ahead of time for rowspan.
  // Collect rows as objects first, then render.
  type Row =
    | { kind: "bloc"; label: string }
    | { kind: "ue"; label: string; note: number | null; coef: number; acquis: boolean; eliminatorySubjectName?: string | null }
    | { kind: "subject"; name: string; note: number | null; coef: number; eliminatory?: boolean }
    | { kind: "result"; label: string; val: string; midLabel: string; midVal: string; bold?: boolean };

  const rows: Row[] = [];

  // ── Group by category ──────────────────────────────────────────────────────
  const grouped: Record<string, BulletinUE[]> = {};
  const uncategorized: BulletinUE[] = [];

  for (const ue of data.ueResults) {
    const cat = ue.category ?? "";
    if (CAT_ORDER.includes(cat)) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ue);
    } else {
      uncategorized.push(ue);
    }
  }

  let ueIndex = 1;
  for (const cat of CAT_ORDER) {
    const ues = grouped[cat];
    if (!ues || ues.length === 0) continue;
    rows.push({ kind: "bloc", label: CAT_LABELS[cat] });
    for (const ue of ues) {
      rows.push({ kind: "ue", label: `UE ${ueIndex}`, note: ue.average, coef: ue.coefficient, acquis: ue.acquis, eliminatorySubjectName: ue.eliminatorySubjectName });
      ueIndex++;
      for (const sub of ue.subjects) {
        rows.push({ kind: "subject", name: sub.subjectName, note: sub.value, coef: sub.coefficient, eliminatory: sub.value !== null && sub.value <= 6 });
      }
    }
  }
  for (const ue of uncategorized) {
    rows.push({ kind: "ue", label: `UE ${ueIndex}`, note: ue.average, coef: ue.coefficient, acquis: ue.acquis, eliminatorySubjectName: ue.eliminatorySubjectName });
    ueIndex++;
    for (const sub of ue.subjects) {
      rows.push({ kind: "subject", name: sub.subjectName, note: sub.value, coef: sub.coefficient, eliminatory: sub.value !== null && sub.value <= 6 });
    }
  }
  for (const sub of data.unassignedSubjects) {
    rows.push({ kind: "subject", name: sub.subjectName, note: sub.value, coef: sub.coefficient });
  }

  // Two result rows at the bottom
  rows.push({
    kind: "result",
    label: `Moyenne ${data.semesterName} Brute`,
    val: fmt(data.average),
    midLabel: `Abt. Absence ${data.absenceDeductionHours}h`,
    midVal: fmt(data.absenceDeduction),
  });
  rows.push({
    kind: "result",
    label: `Moyenne ${data.semesterName} Nette`,
    val: fmt(data.averageNette),
    midLabel: "Rang",
    midVal: rankStr,
    bold: true,
  });

  // Total rows for rowspan (we add 1 for the header row of the table)
  const totalRowCount = rows.length;

  // ── Render rows ────────────────────────────────────────────────────────────
  let tableRowsHtml = "";
  let firstRow = true;

  for (const row of rows) {
    const juryCell = firstRow ? `<td rowspan="${totalRowCount}" class="jury-cell">${juryHtml()}</td>` : "";
    if (row.kind === "bloc") {
      tableRowsHtml += `
        <tr>
          <td colspan="4" class="bloc-title">${row.label}</td>
          ${juryCell}
        </tr>`;
      firstRow = false;
    } else if (row.kind === "ue") {
      const pts = row.note !== null ? fmt(row.note * row.coef) : "—";
      const eliminMsg = !row.acquis && row.eliminatorySubjectName
        ? `<div style="color:#c0392b;font-size:6.5pt;font-style:italic;margin-top:2px;">⚠ Note éliminatoire — ${row.eliminatorySubjectName}</div>`
        : "";
      tableRowsHtml += `
        <tr class="ue-row">
          <td class="ue-label">${row.label}${eliminMsg}</td>
          <td class="num ue-num">${fmt(row.note)}</td>
          <td class="num ue-num">${row.coef}</td>
          <td class="num ue-num">${pts}</td>
          ${juryCell}
        </tr>`;
      firstRow = false;
    } else if (row.kind === "subject") {
      const pts = row.note !== null ? fmt(row.note * row.coef) : "—";
      const elimStyle = row.eliminatory ? ' style="background:#fff0f0;color:#c0392b;font-weight:bold;"' : "";
      const elimIcon = row.eliminatory ? " ⚠" : "";
      tableRowsHtml += `
        <tr class="subject-row"${row.eliminatory ? ' style="background:#fff8f8;"' : ""}>
          <td class="subject-name"${elimStyle}>${row.name}${elimIcon}</td>
          <td class="num"${elimStyle}>${row.note !== null ? fmt(row.note) : "—"}</td>
          <td class="num">${row.coef}</td>
          <td class="num">${pts}</td>
          ${juryCell}
        </tr>`;
      firstRow = false;
    } else if (row.kind === "result") {
      tableRowsHtml += `
        <tr class="result-row${row.bold ? " result-bold" : ""}">
          <td class="result-label">${row.label}</td>
          <td class="num result-num">${row.val}</td>
          <td class="num result-mid">${row.midLabel}</td>
          <td class="num result-num">${row.midVal}</td>
          ${juryCell}
        </tr>`;
      firstRow = false;
    }
  }

  // If no rows at all (empty), still render the jury cell
  if (firstRow) {
    tableRowsHtml = `<tr>
      <td colspan="4" style="text-align:center;padding:8px;font-size:8pt;color:#888;">Aucune matière enregistrée.</td>
      <td class="jury-cell">${juryHtml()}</td>
    </tr>`;
  }

  const schools = data.schools && data.schools.length > 0
    ? data.schools
    : [
        { acronym: "EDSAPT", name: "École de Formation Spécialisée en Agriculture et Production Tropicale" },
        { acronym: "EDSTI",  name: "École Doctorale des Sciences, Technologies et Innovation" },
        { acronym: "EFSPC",  name: "École de Formation Spécialisée en Physico-Chimie" },
        { acronym: "EPGE",   name: "École Préparatoire aux Grandes Écoles" },
        { acronym: "ESA",    name: "École Supérieure d'Agronomie" },
        { acronym: "ESAS",   name: "École Supérieure d'Aménagement et de Santé" },
        { acronym: "ESCAE",  name: "École Supérieure de Commerce et d'Administration des Entreprises" },
        { acronym: "ESCPE",  name: "École Supérieure de Chimie, Pétrole et Énergie" },
        { acronym: "ESI",    name: "École Supérieure d'Industrie" },
        { acronym: "ESMG",   name: "École Supérieure des Mines et de Géologie" },
        { acronym: "ESTP",   name: "École Supérieure des Travaux Publics" },
      ];

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bulletin — ${data.studentName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      color: #1A1A1A;
      background: #b0b0b0;
    }

    /* ── Toolbar ── */
    .no-print {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #2c2c2c;
      padding: 10px 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border-bottom: 2px solid #444;
    }
    .no-print span { color: #aaa; font-size: 12px; }
    .no-print button {
      padding: 7px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 0.3px;
    }
    .btn-print { background: #1a6cb5; color: white; }
    .btn-print:hover { background: #155499; }
    .btn-close  { background: #555; color: #ddd; }
    .btn-close:hover { background: #444; }

    /* ── Page container ── */
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 16px auto;
      background: #FDFCF0;
      padding: 8mm 10mm 6mm;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
    }

    /* ── Watermark ── */
    .watermark {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .watermark-img {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 260px;
      opacity: 0.04;
    }

    /* ── Content layers ── */
    .content { position: relative; z-index: 1; }

    /* ── Header band ── */
    .header-band {
      padding: 4px 2px 4px;
      margin-bottom: 2px;
      border-bottom: 1.5px solid #8B0000;
    }
    /* Rangée 1 : Ministère | République */
    .header-row1 {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      font-size: 6.5pt;
      line-height: 1.55;
      color: #1A1A1A;
      margin-bottom: 4px;
    }
    .header-row1-right { text-align: right; }
    /* Rangée 2 : Logo (gauche) + Institut (centre-droite) */
    .header-row2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-logo { flex-shrink: 0; }
    .header-inst { flex: 1; text-align: center; color: #1A1A1A; }
    .header-inst .inst-name { font-size: 15pt; font-weight: bold; letter-spacing: 0.2px; }
    .header-inst .inst-sub  { font-size: 9pt; font-style: italic; letter-spacing: 1.5px; margin-top: 1px; }

    /* ── Info block (école + étudiant) ── */
    .info-block {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 4px;
      padding: 4px 2px;
      font-size: 7.5pt;
      line-height: 1.65;
      border-bottom: 1px solid #1A1A1A;
      align-items: start;
    }
    .info-school { color: #1A1A1A; }
    .info-school .school-ref { font-size: 6pt; color: #555; margin-top: 2px; }

    /* ── Carte étudiant ── */
    .student-card {
      border: 1px solid #1a3a6b;
      border-left: 4px solid #1a3a6b;
      border-radius: 2px;
      overflow: hidden;
      font-size: 7.5pt;
    }
    .student-card-header {
      background: #1a3a6b;
      color: white;
      padding: 3px 8px;
      font-size: 6.5pt;
      letter-spacing: 1px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .student-card-name {
      font-size: 9.5pt;
      font-weight: bold;
      padding: 4px 8px 3px;
      color: #1a3a6b;
      letter-spacing: 0.3px;
      border-bottom: 0.5px solid #c8d4e8;
      background: #f4f7fb;
    }
    .student-card-body {
      padding: 4px 8px 5px;
      color: #1A1A1A;
      line-height: 1.9;
    }
    .student-card-row {
      display: flex;
      gap: 6px;
      align-items: baseline;
    }
    .student-card-label {
      font-weight: bold;
      white-space: nowrap;
      font-size: 7pt;
    }
    .student-card-dotline {
      border-bottom: 1px dotted #999;
      display: inline-block;
      min-width: 50px;
    }

    /* ── Title bar ── */
    .title-bar {
      background: #dce6f1;
      border: 1px solid #1A1A1A;
      padding: 4px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .title-bar-left  { font-weight: bold; font-size: 9pt; }
    .title-bar-right { font-weight: bold; font-size: 9pt; }


    /* ── Notes table ── */
    .notes-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
    }
    .notes-table th, .notes-table td {
      border: 1px solid #1A1A1A;
      padding: 0;
    }
    /* Column widths */
    .col-matiere  { width: 46%; }
    .col-note     { width: 11%; }
    .col-coef     { width: 8%;  }
    .col-pts      { width: 11%; }
    .col-jury     { width: 24%; vertical-align: top; }

    /* Header row */
    .notes-table thead th {
      background: #E8ECEF;
      font-size: 7.5pt;
      text-align: center;
      padding: 3px 3px;
      font-weight: bold;
      line-height: 1.3;
    }
    .notes-table thead th.th-matiere { text-align: left; padding-left: 5px; }

    /* Bloc title row */
    .bloc-title {
      background: #E8ECEF;
      font-weight: bold;
      font-size: 7.5pt;
      text-transform: uppercase;
      padding: 3px 6px;
      letter-spacing: 0.3px;
    }

    /* UE row */
    .ue-row td { background: #E8ECEF; }
    .ue-label {
      font-weight: bold;
      font-style: italic;
      padding: 2px 6px !important;
      font-size: 8pt;
    }
    .ue-num {
      font-weight: bold;
      font-size: 8pt;
    }

    /* Subject row */
    .subject-row td { background: #FDFCF0; }
    .subject-name {
      padding: 2px 4px 2px 14px !important;
      font-size: 7.5pt;
    }

    /* Numeric cells */
    .num { text-align: center; padding: 2px 3px !important; }

    /* Result rows */
    .result-row td { background: #F0EFE8; }
    .result-row.result-bold td { background: #E8F2E9; }
    .result-label {
      font-size: 7.5pt;
      padding: 3px 6px !important;
    }
    .result-bold .result-label { font-weight: bold; }
    .result-num { font-weight: bold; font-size: 8pt; }
    .result-mid { font-size: 7pt; font-weight: normal; text-align: center; padding: 3px 2px !important; }
    .result-bold .result-num { color: #1a3a6b; }

    /* Jury cell (5th column, rowspan all) */
    .jury-cell {
      vertical-align: top;
      padding: 0 !important;
      border: 1px solid #1A1A1A;
    }
    .jury-inner {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 120px;
    }
    .jury-header {
      background: #E8ECEF;
      font-weight: bold;
      font-size: 6.5pt;
      text-align: center;
      padding: 4px 4px;
      border-bottom: 1px solid #1A1A1A;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      line-height: 1.4;
    }
    .jury-decision {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-weight: bold;
      font-size: 9pt;
      padding: 8px 6px;
      min-height: 30px;
    }
    .jury-signataire {
      border-top: 1px solid #ccc;
      padding: 6px 4px 8px;
      text-align: center;
    }
    .jury-stamp-label {
      font-weight: bold;
      font-size: 6pt;
      line-height: 1.4;
    }
    .jury-stamp-sublabel {
      font-size: 6pt;
      color: #555;
      margin-bottom: 4px;
      line-height: 1.4;
    }
    .jury-stamp {
      display: flex;
      justify-content: center;
      margin: 4px 0;
    }
    .stamp-circle {
      width: 54px;
      height: 54px;
      border: 2px solid #1a3a6b;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #1a3a6b;
      font-weight: bold;
      font-size: 6pt;
      line-height: 1.4;
    }
    .jury-name {
      font-weight: bold;
      font-size: 6.5pt;
      margin-top: 4px;
      border-top: 1px solid #aaa;
      padding-top: 4px;
    }

    /* ── Edition date ── */
    .edition-date {
      text-align: center;
      font-size: 7pt;
      font-style: italic;
      margin-top: 5px;
    }

    /* ── Footer ── */
    .footer-schools {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #1A1A1A;
      padding-top: 4px;
      margin-top: 6px;
      gap: 2px;
    }
    .footer-school-item {
      flex: 1;
      text-align: center;
      min-width: 0;
    }
    .footer-school-acronym {
      display: block;
      font-size: 6.5px;
      font-weight: bold;
      color: #1a3a6b;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      margin-bottom: 1px;
    }
    .footer-school-name {
      display: block;
      font-size: 5px;
      color: #1A1A1A;
      text-transform: uppercase;
      line-height: 1.3;
      word-break: break-word;
    }
    .footer-contacts {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      font-size: 5.5px;
      color: #333;
      border-top: 0.5px solid #aaa;
      padding-top: 3px;
      margin-top: 4px;
      gap: 8px;
    }
    .footer-contacts-group {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    /* ── Print ── */
    @media print {
      body { background: #FDFCF0; color: #1A1A1A; font-size: 9pt; }
      .no-print { display: none !important; }
      .page {
        margin: 0;
        padding: 8mm 10mm 6mm;
        box-shadow: none;
        width: 210mm;
        min-height: 297mm;
        background: #FDFCF0;
      }
      @page { size: A4 portrait; margin: 0; }
    }
  </style>
</head>
<body>

<!-- Toolbar -->
<div class="no-print">
  <span>Bulletin de notes — ${data.studentName}</span>
  <button class="btn-print" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button>
  <button class="btn-close"  onclick="window.close()">✕ Fermer</button>
</div>

<div class="page">

  <!-- Watermark -->
  <div class="watermark">
    ${logo ? `<img class="watermark-img" src="${logo}" alt="">` : ""}
  </div>

  <div class="content">

    <!-- ═══ HEADER BAND ═══ -->
    <div class="header-band">
      <!-- Rangée 1 : Ministère | République -->
      <div class="header-row1">
        <div>Ministère de l'Enseignement Supérieur<br>et de la Recherche Scientifique</div>
        <div class="header-row1-right">République de Côte d'Ivoire<br>Union &nbsp;-&nbsp; Discipline &nbsp;-&nbsp; Travail</div>
      </div>
      <!-- Rangée 2 : Logo gauche + Institut centré -->
      <div class="header-row2">
        <div class="header-logo">
          ${logo ? `<img src="${logo}" style="height:48px;" alt="INP-HB">` : ""}
        </div>
        <div class="header-inst">
          <div class="inst-name">Institut National Polytechnique</div>
          <div class="inst-sub">F&eacute;lix &nbsp;H O U P H O U &Euml; T - B O I G N Y</div>
        </div>
      </div>
    </div>

    <!-- ═══ INFO BLOCK (école + étudiant) ═══ -->
    <div class="info-block">
      <div class="info-school">
        École Supérieure de Commerce<br>
        et d'Administration des Entreprises<br>
        <strong>ESCAE</strong><br>
        Centre Préparatoire à l'Expertise Comptable-UEMOA<br>
        <strong>CPEC-U</strong><br>
        <span class="school-ref">Réf : 023/2024/INP-HB/ESCAE/CPEC-U/RE/CC</span>
      </div>
      <div class="student-card">
        <div class="student-card-header">Étudiant(e)</div>
        <div class="student-card-name">${data.studentName.toUpperCase()}</div>
        <div class="student-card-body">
          <div class="student-card-row">
            <span class="student-card-label">Né(e) le</span>
            ${data.dateNaissance
              ? `<span>${data.dateNaissance}</span>`
              : `<span class="student-card-dotline">&nbsp;</span>`}
            <span class="student-card-label" style="margin-left:4px;">à</span>
            ${data.lieuNaissance
              ? `<span>${data.lieuNaissance}</span>`
              : `<span class="student-card-dotline">&nbsp;</span>`}
          </div>
          <div class="student-card-row">
            <span class="student-card-label">Sexe :</span>
            ${data.sexe === "M"
              ? `<span>Masculin</span>`
              : data.sexe === "F"
              ? `<span>Féminin</span>`
              : `<span class="student-card-dotline">&nbsp;</span>`}
          </div>
          <div class="student-card-row">
            <span class="student-card-label">Classe :</span>
            <span>${data.className}</span>
          </div>
          <div class="student-card-row">
            <span class="student-card-label">Redoublant(e) :</span>
            <span>NON</span>
          </div>
          <div class="student-card-row">
            <span class="student-card-label">N° Matricule :</span>
            <span>${data.studentMatricule}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ TITLE BAR ═══ -->
    <div class="title-bar">
      <div class="title-bar-left">${data.filiere.toUpperCase()}</div>
      <div class="title-bar-right">BULLETIN ${data.semesterName.toUpperCase()}</div>
    </div>

    <!-- ═══ NOTES TABLE ═══ -->
    <table class="notes-table">
      <colgroup>
        <col class="col-matiere">
        <col class="col-note">
        <col class="col-coef">
        <col class="col-pts">
        <col class="col-jury">
      </colgroup>
      <thead>
        <tr>
          <th class="th-matiere">MATIÈRES</th>
          <th>NOTES<br>/20</th>
          <th>Coef.</th>
          <th>Notes<br>× Coef.</th>
          <th>APPRÉCIATIONS<br>DU JURY D'ÉCOLE</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <!-- ═══ EDITION DATE ═══ -->
    <div class="edition-date">${data.editionDate}</div>

    <!-- ═══ FOOTER ═══ -->
    <div class="footer-schools">
      ${schools.map(s => `
        <div class="footer-school-item">
          <span class="footer-school-acronym">${s.acronym}</span>
          <span class="footer-school-name">${s.name}</span>
        </div>`).join("")}
    </div>
    <div class="footer-contacts">
      <div class="footer-contacts-group">
        <span>&#127968; 1093 Yamoussoukro (RCI)</span>
        <span>&#127968; V 79 Abidjan (RCI)</span>
        <span>&#9654; @inp-hbpageoffficielle6975</span>
      </div>
      <div class="footer-contacts-group">
        <span>&#127760; www.inphb.ci</span>
        <span>&#9993; polytec@inphb.ci</span>
      </div>
      <div class="footer-contacts-group">
        <span>&#9410; @inphb.polytech</span>
        <span>&#10005; @inphbpolytech</span>
      </div>
      <div class="footer-contacts-group">
        <span>in Linkedin.com</span>
        <span>&#9432; inphb2021</span>
      </div>
      <div class="footer-contacts-group" style="text-align:right;">
        <span>&#128222; (225) 27 30 64 66 66</span>
        <span>&#128222; (225) 05 01 80 00 24</span>
        <span>&#128222; (225) 05 01 80 00 19</span>
      </div>
    </div>

  </div><!-- /content -->

  ${data.qrCodeDataUrl ? `<div style="position:absolute;bottom:20mm;right:10mm;text-align:center;z-index:5;background:rgba(255,255,255,0.92);border:0.5pt solid #ccc;border-radius:3pt;padding:3pt;">
    <img src="${data.qrCodeDataUrl}" style="width:22mm;height:22mm;display:block;" alt="QR Code bulletin">
    <div style="font-size:4pt;color:#555;margin-top:2pt;max-width:22mm;line-height:1.3;text-align:center;">Vérifier l'authenticité<br>de ce bulletin</div>
  </div>` : ""}

</div><!-- /page -->

</body>
</html>`;
}
