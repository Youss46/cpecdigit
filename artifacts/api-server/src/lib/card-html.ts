import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";

const __filename = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename);

function getLogoBase64(): string {
  try {
    const logoPath = path.resolve(__dirname_local, "../../../../artifacts/cpec-u/public/images/logo.jpg");
    const buf = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    try {
      const logoPath2 = path.resolve(__dirname_local, "../../../../artifacts/cpec-u/public/logo.png");
      const buf = fs.readFileSync(logoPath2);
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      return "";
    }
  }
}

async function generateQRCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 120,
    margin: 1,
    color: { dark: "#1a3a6b", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

export interface CardData {
  studentName: string;
  matricule: string | null;
  className: string | null;
  filiere: string | null;
  academicYear: string;
  photoUrl: string | null;
  dateNaissance: string | null;
  issuedAt: Date;
  expiresAt: Date;
  isValid: boolean;
  hash: string;
  verifyBaseUrl: string;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export async function generateCardHtml(card: CardData): Promise<string> {
  const logo = getLogoBase64();
  const verifyUrl = `${card.verifyBaseUrl}verify/${card.hash}`;
  const qrDataUrl = await generateQRCode(verifyUrl);

  const studentInitial = card.studentName.charAt(0).toUpperCase();
  const photoSection = card.photoUrl
    ? `<img src="${card.photoUrl}" alt="Photo" class="student-photo" />`
    : `<div class="photo-placeholder"><span>${studentInitial}</span><small>Photo manquante</small></div>`;

  const isExpired = new Date() > card.expiresAt;
  const validityColor = card.isValid && !isExpired ? "#10b981" : "#ef4444";
  const validityLabel = !card.isValid ? "INVALIDÉE" : isExpired ? "EXPIRÉE" : "VALIDE";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Carte Étudiante — ${card.studentName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #f0f4f8;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
    gap: 32px;
  }
  .card-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }
  .card-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #64748b;
    text-transform: uppercase;
    align-self: flex-start;
  }

  /* ── Credit card exact size: 85.6mm × 54mm ── */
  .card {
    width: 85.6mm;
    height: 54mm;
    border-radius: 3.5mm;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(26,58,107,0.25), 0 2px 8px rgba(0,0,0,0.15);
    position: relative;
    flex-shrink: 0;
  }

  /* ───────── RECTO ───────── */
  .recto {
    background: linear-gradient(135deg, #0f2547 0%, #1a3a6b 45%, #1e4d9b 100%);
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }
  .recto::before {
    content: "CPEC";
    position: absolute;
    font-size: 48mm;
    font-weight: 900;
    color: rgba(255,255,255,0.03);
    right: -8mm;
    bottom: -10mm;
    letter-spacing: -2mm;
    pointer-events: none;
    line-height: 1;
  }
  .recto-accent {
    position: absolute;
    top: 0; right: 0;
    width: 30mm;
    height: 100%;
    background: linear-gradient(135deg, transparent, rgba(212,175,55,0.08));
    pointer-events: none;
  }

  /* Header strip */
  .recto-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2.5mm 3mm 2mm;
    border-bottom: 0.3mm solid rgba(212,175,55,0.4);
  }
  .school-brand {
    display: flex;
    align-items: center;
    gap: 1.5mm;
  }
  .school-logo {
    width: 7mm;
    height: 7mm;
    border-radius: 1mm;
    object-fit: contain;
    background: white;
    padding: 0.5mm;
    flex-shrink: 0;
  }
  .school-logo-placeholder {
    width: 7mm;
    height: 7mm;
    border-radius: 1mm;
    background: rgba(255,255,255,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3mm;
    font-weight: 900;
    color: white;
    flex-shrink: 0;
  }
  .school-name {
    font-size: 3mm;
    font-weight: 800;
    color: white;
    letter-spacing: 0.3mm;
    line-height: 1.2;
  }
  .school-sub {
    font-size: 2mm;
    color: rgba(212,175,55,0.9);
    letter-spacing: 0.2mm;
    font-weight: 600;
  }
  .card-type-badge {
    font-size: 1.9mm;
    font-weight: 700;
    color: rgba(212,175,55,0.95);
    letter-spacing: 0.4mm;
    text-transform: uppercase;
    border: 0.3mm solid rgba(212,175,55,0.5);
    padding: 0.7mm 1.5mm;
    border-radius: 0.7mm;
  }

  /* Body */
  .recto-body {
    flex: 1;
    display: flex;
    padding: 2mm 3mm 0;
    gap: 2.5mm;
  }
  .student-photo {
    width: 18mm;
    height: 22mm;
    object-fit: cover;
    border-radius: 1.5mm;
    border: 0.5mm solid rgba(212,175,55,0.6);
    flex-shrink: 0;
  }
  .photo-placeholder {
    width: 18mm;
    height: 22mm;
    background: rgba(255,255,255,0.1);
    border-radius: 1.5mm;
    border: 0.5mm dashed rgba(212,175,55,0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    gap: 1mm;
  }
  .photo-placeholder span {
    font-size: 8mm;
    font-weight: 900;
    color: rgba(255,255,255,0.5);
    line-height: 1;
  }
  .photo-placeholder small {
    font-size: 1.5mm;
    color: rgba(255,255,255,0.4);
    text-align: center;
    line-height: 1.2;
  }
  .student-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 1mm;
    padding-top: 0.5mm;
  }
  .student-name {
    font-size: 3.8mm;
    font-weight: 900;
    color: white;
    line-height: 1.1;
    text-transform: uppercase;
    letter-spacing: 0.1mm;
    word-break: break-word;
  }
  .info-row {
    display: flex;
    flex-direction: column;
    gap: 0.3mm;
  }
  .info-label {
    font-size: 1.6mm;
    color: rgba(212,175,55,0.8);
    text-transform: uppercase;
    letter-spacing: 0.3mm;
    font-weight: 700;
  }
  .info-value {
    font-size: 2.2mm;
    color: rgba(255,255,255,0.92);
    font-weight: 600;
    letter-spacing: 0.1mm;
  }

  /* Footer */
  .recto-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5mm 3mm;
    background: rgba(212,175,55,0.15);
    border-top: 0.3mm solid rgba(212,175,55,0.3);
    margin-top: auto;
  }
  .academic-year {
    font-size: 2.5mm;
    font-weight: 800;
    color: rgba(212,175,55,0.95);
    letter-spacing: 0.5mm;
  }
  .qr-small {
    width: 10mm;
    height: 10mm;
    border-radius: 0.5mm;
    display: block;
  }

  /* ───────── VERSO ───────── */
  .verso {
    background: #f8fafc;
    display: flex;
    flex-direction: column;
  }
  .verso-header {
    background: linear-gradient(90deg, #0f2547, #1a3a6b);
    padding: 2mm 3mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .verso-title {
    font-size: 2.8mm;
    font-weight: 800;
    color: white;
    letter-spacing: 0.3mm;
  }
  .validity-pill {
    font-size: 1.8mm;
    font-weight: 700;
    padding: 0.5mm 1.5mm;
    border-radius: 1mm;
    background: ${validityColor};
    color: white;
    letter-spacing: 0.3mm;
  }
  .verso-body {
    flex: 1;
    padding: 2mm 3mm;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5mm 3mm;
  }
  .verso-field {
    display: flex;
    flex-direction: column;
    gap: 0.3mm;
  }
  .verso-field-label {
    font-size: 1.6mm;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.3mm;
    font-weight: 700;
  }
  .verso-field-value {
    font-size: 2.2mm;
    color: #1e293b;
    font-weight: 600;
  }
  .verso-footer {
    background: #1a3a6b;
    padding: 1.5mm 3mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .verso-contact {
    display: flex;
    flex-direction: column;
    gap: 0.4mm;
  }
  .contact-line {
    font-size: 1.7mm;
    color: rgba(255,255,255,0.8);
    letter-spacing: 0.1mm;
  }
  .legal-mention {
    font-size: 1.5mm;
    color: rgba(255,255,255,0.5);
    font-style: italic;
    margin-top: 0.5mm;
    max-width: 45mm;
    line-height: 1.3;
  }
  .qr-verso {
    width: 11mm;
    height: 11mm;
    border-radius: 0.5mm;
    display: block;
  }

  /* Print styles */
  @media print {
    @page {
      size: 85.6mm 54mm;
      margin: 0;
    }
    body {
      background: white;
      padding: 0;
      min-height: unset;
      display: block;
      gap: 0;
    }
    .card-container { display: block; }
    .card-label { display: none; }
    .card { box-shadow: none; border-radius: 0; }
    .print-page-break { page-break-after: always; }
    .no-print { display: none !important; }
  }

  /* Action buttons */
  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .btn {
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: opacity 0.2s;
  }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: #1a3a6b; color: white; }
  .btn-secondary { background: #e2e8f0; color: #1e293b; }
</style>
</head>
<body>

<div class="card-container">
  <!-- RECTO -->
  <div class="card-label">RECTO</div>
  <div class="card recto print-recto">
    <div class="recto-accent"></div>

    <!-- Header -->
    <div class="recto-header">
      <div class="school-brand">
        ${logo
          ? `<img src="${logo}" alt="Logo" class="school-logo" />`
          : `<div class="school-logo-placeholder">C</div>`}
        <div>
          <div class="school-name">CPEC-Digital</div>
          <div class="school-sub">INP-HB</div>
        </div>
      </div>
      <div class="card-type-badge">Carte Étudiante</div>
    </div>

    <!-- Body -->
    <div class="recto-body">
      ${photoSection}
      <div class="student-info">
        <div class="student-name">${card.studentName}</div>
        ${card.matricule ? `
        <div class="info-row">
          <div class="info-label">Matricule</div>
          <div class="info-value">${card.matricule}</div>
        </div>` : ""}
        ${card.className ? `
        <div class="info-row">
          <div class="info-label">Classe</div>
          <div class="info-value">${card.className}</div>
        </div>` : ""}
        ${card.filiere ? `
        <div class="info-row">
          <div class="info-label">Filière</div>
          <div class="info-value">${card.filiere}</div>
        </div>` : ""}
      </div>
    </div>

    <!-- Footer -->
    <div class="recto-footer">
      <div class="academic-year">${card.academicYear}</div>
      <img src="${qrDataUrl}" alt="QR Code" class="qr-small" />
    </div>
  </div>

  <!-- VERSO -->
  <div class="card-label">VERSO</div>
  <div class="card verso">
    <div class="verso-header">
      <div class="verso-title">CPEC-Digital — Carte Étudiante</div>
      <div class="validity-pill">${validityLabel}</div>
    </div>

    <div class="verso-body">
      <div class="verso-field">
        <div class="verso-field-label">Nom</div>
        <div class="verso-field-value">${card.studentName}</div>
      </div>
      <div class="verso-field">
        <div class="verso-field-label">Date de naissance</div>
        <div class="verso-field-value">${card.dateNaissance || "—"}</div>
      </div>
      <div class="verso-field">
        <div class="verso-field-label">Délivrée le</div>
        <div class="verso-field-value">${fmtDate(card.issuedAt)}</div>
      </div>
      <div class="verso-field">
        <div class="verso-field-label">Expire le</div>
        <div class="verso-field-value">${fmtDate(card.expiresAt)}</div>
      </div>
    </div>

    <div class="verso-footer">
      <div class="verso-contact">
        <div class="contact-line">✉ direction@cpecdigital.ci</div>
        <div class="contact-line">🌐 cpecdigital.replit.app</div>
        <div class="legal-mention">Cette carte est la propriété de l'établissement. En cas de perte, contacter la scolarité.</div>
      </div>
      <img src="${qrDataUrl}" alt="QR Code" class="qr-verso" />
    </div>
  </div>
</div>

<div class="actions no-print">
  <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimer / Télécharger PDF</button>
  <button class="btn btn-secondary" onclick="window.close()">Fermer</button>
</div>

<script>
  // Auto-print if opened with ?print=1
  if (window.location.search.includes('print=1')) {
    window.addEventListener('load', () => setTimeout(() => window.print(), 400));
  }
</script>
</body>
</html>`;
}

export async function generateBulkCardsHtml(cards: CardData[]): Promise<string> {
  const logo = getLogoBase64();
  const cardHtmls: string[] = [];

  for (const card of cards) {
    const verifyUrl = `${card.verifyBaseUrl}verify/${card.hash}`;
    const qrDataUrl = await generateQRCode(verifyUrl);
    const studentInitial = card.studentName.charAt(0).toUpperCase();
    const photoSection = card.photoUrl
      ? `<img src="${card.photoUrl}" alt="Photo" class="student-photo" />`
      : `<div class="photo-placeholder"><span>${studentInitial}</span></div>`;
    const isExpired = new Date() > card.expiresAt;
    const validityLabel = !card.isValid ? "INVALIDÉE" : isExpired ? "EXPIRÉE" : "VALIDE";
    const validityColor = card.isValid && !isExpired ? "#10b981" : "#ef4444";

    cardHtmls.push(`
      <div class="card-pair">
        <!-- RECTO -->
        <div class="card recto">
          <div class="recto-accent"></div>
          <div class="recto-header">
            <div class="school-brand">
              ${logo ? `<img src="${logo}" alt="Logo" class="school-logo" />` : `<div class="school-logo-placeholder">C</div>`}
              <div>
                <div class="school-name">CPEC-Digital</div>
                <div class="school-sub">INP-HB</div>
              </div>
            </div>
            <div class="card-type-badge">Carte Étudiante</div>
          </div>
          <div class="recto-body">
            ${photoSection}
            <div class="student-info">
              <div class="student-name">${card.studentName}</div>
              ${card.matricule ? `<div class="info-row"><div class="info-label">Matricule</div><div class="info-value">${card.matricule}</div></div>` : ""}
              ${card.className ? `<div class="info-row"><div class="info-label">Classe</div><div class="info-value">${card.className}</div></div>` : ""}
              ${card.filiere ? `<div class="info-row"><div class="info-label">Filière</div><div class="info-value">${card.filiere}</div></div>` : ""}
            </div>
          </div>
          <div class="recto-footer">
            <div class="academic-year">${card.academicYear}</div>
            <img src="${qrDataUrl}" alt="QR" class="qr-small" />
          </div>
        </div>
        <!-- VERSO -->
        <div class="card verso">
          <div class="verso-header">
            <div class="verso-title">CPEC-Digital — Carte Étudiante</div>
            <div class="validity-pill" style="background:${validityColor}">${validityLabel}</div>
          </div>
          <div class="verso-body">
            <div class="verso-field"><div class="verso-field-label">Nom</div><div class="verso-field-value">${card.studentName}</div></div>
            <div class="verso-field"><div class="verso-field-label">Naissance</div><div class="verso-field-value">${card.dateNaissance || "—"}</div></div>
            <div class="verso-field"><div class="verso-field-label">Délivrée le</div><div class="verso-field-value">${new Date(card.issuedAt).toLocaleDateString("fr-FR")}</div></div>
            <div class="verso-field"><div class="verso-field-label">Expire le</div><div class="verso-field-value">${new Date(card.expiresAt).toLocaleDateString("fr-FR")}</div></div>
          </div>
          <div class="verso-footer">
            <div class="verso-contact">
              <div class="contact-line">✉ direction@cpecdigital.ci</div>
              <div class="legal-mention">Propriété de l'établissement.</div>
            </div>
            <img src="${qrDataUrl}" alt="QR" class="qr-verso" />
          </div>
        </div>
      </div>
    `);
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Cartes Étudiantes — Lot</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; padding: 24px; }
  h1 { text-align: center; color: #1a3a6b; margin-bottom: 24px; font-size: 18px; }
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 85.6mm);
    gap: 8mm;
    justify-content: center;
  }
  .card-pair { display: flex; flex-direction: column; gap: 4mm; }
  .card { width: 85.6mm; height: 54mm; border-radius: 3.5mm; overflow: hidden; box-shadow: 0 4px 16px rgba(26,58,107,0.2); position: relative; flex-shrink: 0; }
  .recto { background: linear-gradient(135deg, #0f2547 0%, #1a3a6b 45%, #1e4d9b 100%); display: flex; flex-direction: column; }
  .recto::before { content: "CPEC"; position: absolute; font-size: 48mm; font-weight: 900; color: rgba(255,255,255,0.03); right: -8mm; bottom: -10mm; pointer-events: none; }
  .recto-accent { position: absolute; top: 0; right: 0; width: 30mm; height: 100%; background: linear-gradient(135deg, transparent, rgba(212,175,55,0.08)); pointer-events: none; }
  .recto-header { display: flex; align-items: center; justify-content: space-between; padding: 2.5mm 3mm 2mm; border-bottom: 0.3mm solid rgba(212,175,55,0.4); }
  .school-brand { display: flex; align-items: center; gap: 1.5mm; }
  .school-logo { width: 7mm; height: 7mm; border-radius: 1mm; object-fit: contain; background: white; padding: 0.5mm; }
  .school-logo-placeholder { width: 7mm; height: 7mm; border-radius: 1mm; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 3mm; font-weight: 900; color: white; }
  .school-name { font-size: 3mm; font-weight: 800; color: white; letter-spacing: 0.3mm; }
  .school-sub { font-size: 2mm; color: rgba(212,175,55,0.9); letter-spacing: 0.2mm; font-weight: 600; }
  .card-type-badge { font-size: 1.9mm; font-weight: 700; color: rgba(212,175,55,0.95); letter-spacing: 0.4mm; border: 0.3mm solid rgba(212,175,55,0.5); padding: 0.7mm 1.5mm; border-radius: 0.7mm; }
  .recto-body { flex: 1; display: flex; padding: 2mm 3mm 0; gap: 2.5mm; }
  .student-photo { width: 18mm; height: 22mm; object-fit: cover; border-radius: 1.5mm; border: 0.5mm solid rgba(212,175,55,0.6); flex-shrink: 0; }
  .photo-placeholder { width: 18mm; height: 22mm; background: rgba(255,255,255,0.1); border-radius: 1.5mm; border: 0.5mm dashed rgba(212,175,55,0.5); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .photo-placeholder span { font-size: 8mm; font-weight: 900; color: rgba(255,255,255,0.5); }
  .student-info { flex: 1; display: flex; flex-direction: column; gap: 1mm; padding-top: 0.5mm; }
  .student-name { font-size: 3.8mm; font-weight: 900; color: white; line-height: 1.1; text-transform: uppercase; }
  .info-row { display: flex; flex-direction: column; gap: 0.3mm; }
  .info-label { font-size: 1.6mm; color: rgba(212,175,55,0.8); text-transform: uppercase; letter-spacing: 0.3mm; font-weight: 700; }
  .info-value { font-size: 2.2mm; color: rgba(255,255,255,0.92); font-weight: 600; }
  .recto-footer { display: flex; align-items: center; justify-content: space-between; padding: 1.5mm 3mm; background: rgba(212,175,55,0.15); border-top: 0.3mm solid rgba(212,175,55,0.3); margin-top: auto; }
  .academic-year { font-size: 2.5mm; font-weight: 800; color: rgba(212,175,55,0.95); letter-spacing: 0.5mm; }
  .qr-small { width: 10mm; height: 10mm; }
  .verso { background: #f8fafc; display: flex; flex-direction: column; }
  .verso-header { background: linear-gradient(90deg, #0f2547, #1a3a6b); padding: 2mm 3mm; display: flex; align-items: center; justify-content: space-between; }
  .verso-title { font-size: 2.8mm; font-weight: 800; color: white; letter-spacing: 0.3mm; }
  .validity-pill { font-size: 1.8mm; font-weight: 700; padding: 0.5mm 1.5mm; border-radius: 1mm; color: white; }
  .verso-body { flex: 1; padding: 2mm 3mm; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 3mm; }
  .verso-field { display: flex; flex-direction: column; gap: 0.3mm; }
  .verso-field-label { font-size: 1.6mm; color: #64748b; text-transform: uppercase; letter-spacing: 0.3mm; font-weight: 700; }
  .verso-field-value { font-size: 2.2mm; color: #1e293b; font-weight: 600; }
  .verso-footer { background: #1a3a6b; padding: 1.5mm 3mm; display: flex; align-items: center; justify-content: space-between; }
  .verso-contact { display: flex; flex-direction: column; gap: 0.4mm; }
  .contact-line { font-size: 1.7mm; color: rgba(255,255,255,0.8); }
  .legal-mention { font-size: 1.5mm; color: rgba(255,255,255,0.5); font-style: italic; }
  .qr-verso { width: 11mm; height: 11mm; }
  .no-print { text-align: center; margin-top: 24px; }
  .btn { padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; background: #1a3a6b; color: white; }
  @media print {
    @page { size: A4; margin: 8mm; }
    body { background: white; padding: 0; }
    h1 { display: none; }
    .no-print { display: none; }
    .card { box-shadow: none; }
  }
</style>
</head>
<body>
<h1>Cartes Étudiantes — ${cards.length} étudiant(s)</h1>
<div class="cards-grid">${cardHtmls.join("\n")}</div>
<div class="no-print">
  <button class="btn" onclick="window.print()">🖨️ Imprimer / Télécharger PDF</button>
</div>
<script>
  if (window.location.search.includes('print=1')) {
    window.addEventListener('load', () => setTimeout(() => window.print(), 600));
  }
</script>
</body>
</html>`;
}
