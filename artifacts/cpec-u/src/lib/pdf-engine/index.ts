import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const BRAND = {
  navy: [15, 37, 71] as [number, number, number],
  navyMid: [26, 58, 107] as [number, number, number],
  gold: [180, 145, 40] as [number, number, number],
  goldLight: [212, 175, 55] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  black: [30, 30, 30] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  green: [16, 185, 129] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  orange: [249, 115, 22] as [number, number, number],
};

let _logoDataUrl: string | null = null;

async function getLogoDataUrl(): Promise<string | null> {
  if (_logoDataUrl !== null) return _logoDataUrl;
  try {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const url = `${base}/images/logo.jpg`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("logo not found");
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        _logoDataUrl = reader.result as string;
        resolve(_logoDataUrl);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    _logoDataUrl = "";
    return "";
  }
}

export type Orientation = "portrait" | "landscape";

export interface DocOptions {
  title: string;
  subtitle?: string;
  reference?: string;
  orientation?: Orientation;
  institution?: string;
  verifyUrl?: string;
  compact?: boolean;
}

interface SpacingCfg {
  margin: number;
  headerBarH: number;
  headerAdvY: number;
  sL1BoxH: number;
  sL1Adv: number;
  sL2BoxH: number;
  sL2Adv: number;
  sL3Adv: number;
  infoRowH: number;
  infoSpacing: number;
  infoTrail: number;
  tableAfterGap: number;
  breakBuffer: number;
}

const STANDARD_CFG: SpacingCfg = {
  margin: 14,
  headerBarH: 14,
  headerAdvY: 19,
  sL1BoxH: 7,
  sL1Adv: 10,
  sL2BoxH: 6,
  sL2Adv: 9,
  sL3Adv: 8,
  infoRowH: 8,
  infoSpacing: 3,
  infoTrail: 2,
  tableAfterGap: 6,
  breakBuffer: 18,
};

const COMPACT_CFG: SpacingCfg = {
  margin: 10,
  headerBarH: 11,
  headerAdvY: 14,
  sL1BoxH: 5,
  sL1Adv: 7,
  sL2BoxH: 4,
  sL2Adv: 6,
  sL3Adv: 6,
  infoRowH: 6,
  infoSpacing: 1.5,
  infoTrail: 1,
  tableAfterGap: 2,
  breakBuffer: 28,
};

export class CpecPdfDoc {
  doc: jsPDF;
  margin: number;
  y: number;
  pageW: number;
  pageH: number;
  contentW: number;
  private cfg: SpacingCfg;
  private opts: DocOptions;
  private pageCount = 1;
  private logoDataUrl: string = "";

  constructor(opts: DocOptions) {
    this.opts = opts;
    this.cfg = opts.compact ? COMPACT_CFG : STANDARD_CFG;
    this.margin = this.cfg.margin;
    this.doc = new jsPDF({
      orientation: opts.orientation ?? "portrait",
      unit: "mm",
      format: "a4",
    });
    this.pageW = this.doc.internal.pageSize.getWidth();
    this.pageH = this.doc.internal.pageSize.getHeight();
    this.contentW = this.pageW - this.margin * 2;
    this.y = this.margin;
  }

  async init(): Promise<void> {
    this.logoDataUrl = (await getLogoDataUrl()) ?? "";
    this.addHeader();
  }

  addHeader(): void {
    const { doc, margin, pageW, contentW, cfg } = this;

    doc.setFillColor(...BRAND.navy);
    doc.rect(margin, margin, contentW, cfg.headerBarH, "F");

    if (this.logoDataUrl) {
      try {
        const logoH = cfg.headerBarH - 2;
        doc.addImage(this.logoDataUrl, "JPEG", margin + 2, margin + 1, logoH, logoH);
      } catch { /* ignore */ }
    }

    const logoOffset = cfg.headerBarH;
    doc.setTextColor(...BRAND.white);
    doc.setFontSize(cfg.compact ? 8.5 : 9.5);
    doc.setFont("helvetica", "bold");
    doc.text("CPEC-U — INP-HB", margin + logoOffset + 3, margin + (cfg.headerBarH * 0.42));

    doc.setFontSize(cfg.compact ? 7 : 8);
    doc.setFont("helvetica", "normal");
    const inst = this.opts.institution ?? "Établissement d'Enseignement Supérieur";
    doc.text(inst, margin + logoOffset + 3, margin + (cfg.headerBarH * 0.8));

    doc.setFontSize(cfg.compact ? 8.5 : 10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.white);
    const titleWidth = doc.getTextWidth(this.opts.title);
    doc.text(this.opts.title, pageW - margin - titleWidth, margin + (cfg.headerBarH * 0.42));

    if (this.opts.subtitle) {
      doc.setFontSize(cfg.compact ? 7 : 7.5);
      doc.setFont("helvetica", "normal");
      const subW = doc.getTextWidth(this.opts.subtitle);
      doc.text(this.opts.subtitle, pageW - margin - subW, margin + (cfg.headerBarH * 0.8));
    }

    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(0.8);
    doc.line(margin, margin + cfg.headerBarH + 0.5, pageW - margin, margin + cfg.headerBarH + 0.5);

    this.y = margin + cfg.headerAdvY;
  }

  addFooter(): void {
    const { doc, margin, pageW, pageH, contentW } = this;
    const footerY = pageH - 10;

    doc.setDrawColor(...BRAND.navyMid);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 2, pageW - margin, footerY - 2);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.gray);

    const now = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    doc.text(`Document généré le ${now}`, margin, footerY + 2);

    if (this.opts.reference) {
      const refW = doc.getTextWidth(`Réf: ${this.opts.reference}`);
      doc.text(`Réf: ${this.opts.reference}`, (pageW - refW) / 2, footerY + 2);
    }

    const pageLabel = `Page ${this.pageCount}`;
    const pw = doc.getTextWidth(pageLabel);
    doc.text(pageLabel, pageW - margin - pw, footerY + 2);
  }

  addNewPage(): void {
    this.doc.addPage();
    this.pageCount++;
    this.y = this.margin;
    this.addHeader();
  }

  checkPageBreak(needed = 15): void {
    if (this.y + needed > this.pageH - this.cfg.breakBuffer) {
      this.addNewPage();
    }
  }

  addSectionTitle(text: string, level: 1 | 2 | 3 = 1): void {
    const { cfg } = this;
    this.checkPageBreak(cfg.sL1BoxH + 4);
    const { doc, margin, contentW } = this;

    if (level === 1) {
      doc.setFillColor(...BRAND.navyMid);
      doc.rect(margin, this.y, contentW, cfg.sL1BoxH, "F");
      doc.setFontSize(cfg.compact ? 7.5 : 9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.white);
      doc.text(text.toUpperCase(), margin + 3, this.y + cfg.sL1BoxH - 1.5);
      this.y += cfg.sL1Adv;
    } else if (level === 2) {
      doc.setFillColor(...BRAND.lightGray);
      doc.rect(margin, this.y, contentW, cfg.sL2BoxH, "F");
      doc.setFontSize(cfg.compact ? 7 : 8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.navy);
      doc.text(text, margin + 3, this.y + cfg.sL2BoxH - 1);
      this.y += cfg.sL2Adv;
    } else {
      doc.setFontSize(cfg.compact ? 7 : 8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.navyMid);
      doc.text(text, margin, this.y + 4);
      doc.setDrawColor(...BRAND.gold);
      doc.setLineWidth(0.3);
      doc.line(margin, this.y + 5, margin + contentW, this.y + 5);
      this.y += cfg.sL3Adv;
    }
  }

  addInfoGrid(
    items: Array<{ label: string; value: string | null | undefined }>,
    cols = 2,
  ): void {
    const { doc, margin, contentW, cfg } = this;
    const colW = contentW / cols;
    const rowH = cfg.infoRowH;
    let col = 0;
    let rowY = this.y;

    for (const item of items) {
      this.checkPageBreak(rowH);
      const x = margin + col * colW;
      doc.setFontSize(cfg.compact ? 6 : 7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.gray);
      doc.text(item.label.toUpperCase(), x, rowY + (rowH * 0.35));
      doc.setFontSize(cfg.compact ? 7.5 : 8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.black);
      const valStr = String(item.value ?? "—");
      const maxValW = colW - 2;
      const valLines = doc.splitTextToSize(valStr, maxValW);
      const displayVal = valLines.length > 1 ? valLines[0].trimEnd() + "…" : valLines[0];
      doc.text(displayVal, x, rowY + (rowH * 0.85));

      col++;
      if (col >= cols) {
        col = 0;
        rowY += rowH + cfg.infoSpacing;
        this.y = rowY;
      }
    }
    if (col > 0) {
      this.y = rowY + rowH + cfg.infoSpacing;
    }
    this.y += cfg.infoTrail;
  }

  addText(text: string, opts?: { bold?: boolean; size?: number; color?: [number, number, number]; indent?: number }): void {
    this.checkPageBreak(8);
    const { doc, margin } = this;
    doc.setFontSize(opts?.size ?? 8.5);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color ?? BRAND.black));
    const lines = doc.splitTextToSize(text, this.contentW - (opts?.indent ?? 0));
    doc.text(lines, margin + (opts?.indent ?? 0), this.y + 4);
    this.y += lines.length * 4.5 + 2;
  }

  addTable(
    head: string[],
    body: (string | number | null | undefined)[][],
    opts?: {
      columnStyles?: Record<number, { halign?: "left" | "center" | "right"; cellWidth?: number }>;
      headColor?: [number, number, number];
      stripe?: boolean;
      fontSize?: number;
      cellPadding?: number;
    },
  ): void {
    const { cfg } = this;
    const cp = opts?.cellPadding ?? (cfg.compact ? 1.5 : 2.5);
    autoTable(this.doc, {
      startY: this.y,
      head: [head],
      body: body.map((row) =>
        row.map((cell) => (cell === null || cell === undefined ? "—" : String(cell)))
      ),
      theme: "grid",
      styles: {
        fontSize: opts?.fontSize ?? 8,
        cellPadding: cp,
        overflow: "linebreak",
        textColor: [30, 30, 30],
      },
      headStyles: {
        fillColor: opts?.headColor ?? BRAND.navyMid,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: opts?.fontSize ?? 8,
        cellPadding: cp,
      },
      alternateRowStyles: opts?.stripe !== false ? { fillColor: [248, 250, 252] } : {},
      columnStyles: opts?.columnStyles,
      margin: { left: this.margin, right: this.margin },
      didDrawPage: (data) => {
        if (data.pageCount > 1) {
          this.pageCount = data.pageCount;
          this.addHeader();
        }
      },
    });
    this.y = (this.doc as any).lastAutoTable.finalY + cfg.tableAfterGap;
  }

  addSignatureBlock(
    entries: Array<{ title: string; name: string }>,
    lineOffset = 16,
  ): void {
    const totalH = lineOffset + 14;
    this.checkPageBreak(totalH);
    const { doc, margin, contentW, cfg } = this;
    const colW = contentW / entries.length;
    const baseY = this.y + (cfg.compact ? 2 : 5);

    for (let i = 0; i < entries.length; i++) {
      const x = margin + i * colW;
      doc.setFontSize(cfg.compact ? 7 : 8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.navy);
      doc.text(entries[i].title, x + colW / 2, baseY, { align: "center" });

      doc.setDrawColor(...BRAND.gray);
      doc.setLineWidth(0.3);
      doc.line(x + 5, baseY + lineOffset, x + colW - 5, baseY + lineOffset);

      doc.setFontSize(cfg.compact ? 6.5 : 7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.gray);
      doc.text(entries[i].name, x + colW / 2, baseY + lineOffset + 4, { align: "center" });
    }
    this.y += totalH + (cfg.compact ? 0 : 5);
  }

  addDivider(): void {
    this.checkPageBreak(4);
    this.doc.setDrawColor(...BRAND.lightGray);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, this.y, this.margin + this.contentW, this.y);
    this.y += 4;
  }

  addVSpace(mm = 4): void {
    this.y += mm;
  }

  finalizeAndSave(filename: string): void {
    const totalPages = this.doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.pageCount = i;
      this.addFooter();
    }
    this.doc.save(filename);
  }

  finalizeAndGetBlobUrl(): string {
    const totalPages = this.doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.pageCount = i;
      this.addFooter();
    }
    return this.doc.output("bloburl") as string;
  }

  finalizeWithQrFooter(filename: string, qrDataUrl: string | null): void {
    const totalPages = this.doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.pageCount = i;
      this.addFooterWithQr(qrDataUrl, i === totalPages);
    }
    this.doc.save(filename);
  }

  private addFooterWithQr(qrDataUrl: string | null, isLastPage: boolean): void {
    const { doc, margin, pageW, pageH } = this;
    const qrSize = 14;
    const footerH = qrDataUrl && isLastPage ? 22 : 10;
    const footerTop = pageH - footerH - 2;

    doc.setDrawColor(...BRAND.navyMid);
    doc.setLineWidth(0.3);
    doc.line(margin, footerTop, pageW - margin, footerTop);

    if (qrDataUrl && isLastPage) {
      try {
        doc.addImage(qrDataUrl, "PNG", margin, footerTop + 2, qrSize, qrSize);
      } catch { /* ignore */ }

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...BRAND.gray);
      doc.text("Scannez pour verifier", margin + qrSize + 2, footerTop + 6);
      doc.text("l'authenticite de ce bulletin", margin + qrSize + 2, footerTop + 10);

      const infoY = footerTop + qrSize + 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);

      const now = new Date().toLocaleDateString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });
      doc.text(`Document genere le ${now}`, margin, infoY);

      if (this.opts.reference) {
        const refText = `Ref: ${this.opts.reference}`;
        const refW = doc.getTextWidth(refText);
        doc.text(refText, (pageW - refW) / 2, infoY);
      }

      const pageLabel = `Page ${this.pageCount}`;
      const pw = doc.getTextWidth(pageLabel);
      doc.text(pageLabel, pageW - margin - pw, infoY);
    } else {
      const infoY = footerTop + 6;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.gray);

      const now = new Date().toLocaleDateString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });
      doc.text(`Document genere le ${now}`, margin, infoY);

      if (this.opts.reference) {
        const refText = `Ref: ${this.opts.reference}`;
        const refW = doc.getTextWidth(refText);
        doc.text(refText, (pageW - refW) / 2, infoY);
      }

      const pageLabel = `Page ${this.pageCount}`;
      const pw = doc.getTextWidth(pageLabel);
      doc.text(pageLabel, pageW - margin - pw, infoY);
    }
  }
}

export function fmt(v: number | null | undefined, dec = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(dec);
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "---";
  const s = typeof d === "string" ? d : d.toISOString();
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) return s;
  }
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return s;
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function getApiBase(): string {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

export async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${getApiBase()}${path}`, { credentials: "include" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error ?? `Erreur ${r.status}: ${path}`);
  }
  return r.json();
}
