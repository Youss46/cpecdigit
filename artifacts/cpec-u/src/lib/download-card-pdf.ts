import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import QRCode from "qrcode";

export interface CardPdfData {
  studentName: string;
  matricule?: string | null;
  className?: string | null;
  filiere?: string | null;
  academicYear: string;
  photoUrl?: string | null;
  dateNaissance?: string | null;
  issuedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  isValid?: boolean;
  isExpired?: boolean;
  verifyUrl: string;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  // Already in DD/MM/YYYY French format — return as-is
  if (typeof d === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return typeof d === "string" ? d : "—";
  return parsed.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

async function buildCardHtml(card: CardPdfData): Promise<{ recto: string; verso: string; qrDataUrl: string }> {
  const qrDataUrl = await QRCode.toDataURL(card.verifyUrl, {
    width: 200,
    margin: 1,
    color: { dark: "#1a3a6b", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });

  const isExpired = card.isExpired ?? (card.expiresAt ? new Date() > new Date(card.expiresAt) : false);
  const validityColor = card.isValid && !isExpired ? "#10b981" : "#ef4444";
  const validityLabel = card.isValid === false ? "INVALIDÉE" : isExpired ? "EXPIRÉE" : "VALIDE";

  // Recto
  const recto = `
    <div style="
      width:322px; height:203px;
      background:linear-gradient(135deg,#0f2547 0%,#1a3a6b 45%,#1e4d9b 100%);
      border-radius:13px; overflow:hidden; position:relative;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
    ">
      <!-- Watermark -->
      <div style="position:absolute;right:-12px;bottom:-16px;font-size:152px;font-weight:900;color:rgba(255,255,255,0.03);line-height:1;letter-spacing:-6px;pointer-events:none;">CPEC</div>
      <!-- Gold accent -->
      <div style="position:absolute;top:0;right:0;width:114px;height:100%;background:linear-gradient(135deg,transparent,rgba(212,175,55,0.07));pointer-events:none;"></div>

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 15px 8px;border-bottom:1px solid rgba(212,175,55,0.3);">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:30px;height:30px;border-radius:6px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          </div>
          <div>
            <div style="color:white;font-weight:800;font-size:12px;letter-spacing:0.5px;">CPEC-U</div>
            <div style="color:rgba(212,175,55,0.85);font-size:7.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">INP-HB</div>
          </div>
        </div>
        <div style="border:1px solid rgba(212,175,55,0.5);color:rgba(212,175,55,0.9);font-size:7px;font-weight:800;padding:3px 7px;border-radius:3px;letter-spacing:1.5px;">CARTE ÉTUDIANTE</div>
      </div>

      <!-- Body -->
      <div style="display:flex;padding:9px 15px 0;gap:10px;flex:1;">
        <!-- Photo -->
        <div style="flex-shrink:0;">
          ${card.photoUrl
            ? `<img src="${card.photoUrl}" alt="Photo" crossorigin="anonymous" style="width:62px;height:78px;object-fit:cover;border-radius:6px;border:2px solid rgba(212,175,55,0.5);" />`
            : `<div style="width:62px;height:78px;background:rgba(255,255,255,0.1);border-radius:6px;border:1.5px dashed rgba(212,175,55,0.4);display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span style="font-size:7px;color:rgba(255,255,255,0.3);margin-top:2px;text-align:center;">Photo</span>
              </div>`}
        </div>
        <!-- Info -->
        <div style="display:flex;flex-direction:column;gap:5px;flex:1;padding-top:2px;">
          <div style="color:white;font-weight:900;font-size:13px;line-height:1.1;text-transform:uppercase;letter-spacing:0.5px;">${card.studentName}</div>
          ${card.matricule ? `
            <div>
              <div style="color:rgba(212,175,55,0.75);font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Matricule</div>
              <div style="color:rgba(255,255,255,0.92);font-size:9.5px;font-weight:700;">${card.matricule}</div>
            </div>` : ""}
          ${card.className ? `
            <div>
              <div style="color:rgba(212,175,55,0.75);font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Classe</div>
              <div style="color:rgba(255,255,255,0.92);font-size:9.5px;font-weight:700;">${card.className}</div>
            </div>` : ""}
          ${card.filiere ? `
            <div>
              <div style="color:rgba(212,175,55,0.75);font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Filière</div>
              <div style="color:rgba(255,255,255,0.92);font-size:9px;font-weight:700;">${card.filiere}</div>
            </div>` : ""}
        </div>
      </div>

      <!-- Footer -->
      <div style="position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:5px 15px;background:rgba(212,175,55,0.12);border-top:1px solid rgba(212,175,55,0.2);">
        <div style="color:rgba(212,175,55,0.92);font-weight:900;font-size:9.5px;letter-spacing:2px;">${card.academicYear}</div>
        <img src="${qrDataUrl}" alt="QR" style="width:32px;height:32px;" />
      </div>
    </div>
  `;

  // Verso
  const verso = `
    <div style="
      width:322px; height:203px;
      background:#f8fafc;
      border-radius:13px; overflow:hidden; position:relative;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
    ">
      <!-- Header -->
      <div style="background:linear-gradient(90deg,#0f2547,#1a3a6b);padding:9px 15px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="color:white;font-weight:800;font-size:11px;letter-spacing:0.5px;">CPEC-U</div>
          <div style="color:rgba(255,255,255,0.65);font-size:7.5px;font-weight:600;margin-top:1px;">CARTE ÉTUDIANTE OFFICIELLE</div>
        </div>
        <div style="background:${validityColor};color:white;font-size:7.5px;font-weight:800;padding:3px 8px;border-radius:4px;letter-spacing:1px;">${validityLabel}</div>
      </div>

      <!-- Body grid -->
      <div style="padding:10px 15px;display:grid;grid-template-columns:1fr 1fr;gap:9px 18px;">
        <div>
          <div style="font-size:7px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Date de naissance</div>
          <div style="font-size:9.5px;color:#1e293b;font-weight:700;margin-top:2px;">${fmtDate(card.dateNaissance)}</div>
        </div>
        <div>
          <div style="font-size:7px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Année académique</div>
          <div style="font-size:9.5px;color:#1e293b;font-weight:700;margin-top:2px;">${card.academicYear}</div>
        </div>
        <div>
          <div style="font-size:7px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Délivrée le</div>
          <div style="font-size:9.5px;color:#1e293b;font-weight:700;margin-top:2px;">${fmtDate(card.issuedAt)}</div>
        </div>
        <div>
          <div style="font-size:7px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Expire le</div>
          <div style="font-size:9.5px;color:${isExpired ? "#ef4444" : "#1e293b"};font-weight:700;margin-top:2px;">${fmtDate(card.expiresAt)}</div>
        </div>
      </div>

      <!-- QR + Footer -->
      <div style="position:absolute;bottom:0;left:0;right:0;background:#1a3a6b;padding:8px 15px;display:flex;align-items:center;justify-content:space-between;">
        <div style="color:rgba(255,255,255,0.7);font-size:7px;font-style:italic;">Scanner le QR code pour vérifier cette carte</div>
        <img src="${qrDataUrl}" alt="QR Code" style="width:44px;height:44px;border-radius:4px;" />
      </div>
    </div>
  `;

  return { recto, verso, qrDataUrl };
}

export async function downloadCardAsPdf(card: CardPdfData): Promise<void> {
  const { recto, verso } = await buildCardHtml(card);

  const CARD_W_PX = 322;
  const CARD_H_PX = 203;

  // Create hidden container
  const container = document.createElement("div");
  container.style.cssText = `
    position:fixed; left:-9999px; top:0;
    width:${CARD_W_PX}px; height:${CARD_H_PX}px;
    z-index:-1; overflow:hidden;
  `;
  document.body.appendChild(container);

  const SCALE = 4;

  // Capture recto
  container.innerHTML = recto;
  await new Promise((r) => setTimeout(r, 200));
  const canvasRecto = await html2canvas(container.firstElementChild as HTMLElement, {
    scale: SCALE,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    width: CARD_W_PX,
    height: CARD_H_PX,
    logging: false,
  });

  // Capture verso
  container.innerHTML = verso;
  await new Promise((r) => setTimeout(r, 100));
  const canvasVerso = await html2canvas(container.firstElementChild as HTMLElement, {
    scale: SCALE,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    width: CARD_W_PX,
    height: CARD_H_PX,
    logging: false,
  });

  document.body.removeChild(container);

  // Exact credit card dimensions: 85.6mm × 54mm
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [85.6, 54],
  });

  pdf.addImage(canvasRecto.toDataURL("image/png", 1.0), "PNG", 0, 0, 85.6, 54);
  pdf.addPage([85.6, 54], "landscape");
  pdf.addImage(canvasVerso.toDataURL("image/png", 1.0), "PNG", 0, 0, 85.6, 54);

  const safeName = (card.matricule ?? card.studentName).replace(/[^a-zA-Z0-9_-]/g, "_");
  pdf.save(`carte_${safeName}.pdf`);
}
