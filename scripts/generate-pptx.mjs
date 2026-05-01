import PptxGenJS from "pptxgenjs";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
pptx.author = "M15 EduTech";
pptx.company = "M15 EduTech";
pptx.subject = "CPEC-U — Plateforme de Gestion Académique";
pptx.title = "CPEC-U · M15 EduTech";

// ─── DESIGN SYSTEM ───────────────────────────────────────────────────────────
const C = {
  bg:       "060C1A",   // deep navy-black
  surface:  "0D1B32",   // dark navy surface
  surface2: "111F38",   // lighter navy card
  gold:     "E8A838",   // warm amber-gold (prestige, Afrique)
  goldMid:  "D4912A",   // gold mid
  blue:     "3A7EFF",   // electric blue (tech)
  blueDeep: "1A4BAA",   // deeper blue for contrast
  white:    "FFFFFF",
  offWhite: "E2EAF5",
  gray:     "94A3B8",
  grayLight:"C8D6E8",
  dark:     "1E2D45",
};

const F = {
  display: "Space Grotesk",
  body:    "DM Sans",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function addBg(slide, color = C.bg) {
  slide.background = { color };
}

// Top gold stripe
function addTopStripe(slide, wFraction = 0.35) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33 * wFraction, h: 0.055,
    fill: { color: C.gold }, line: { color: C.gold },
  });
}

// Bottom blue stripe
function addBottomStripe(slide) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.445, w: 13.33, h: 0.055,
    fill: { color: C.blue }, line: { color: C.blue },
  });
}

// Footer label (right-aligned)
function addFooter(slide, label = "CPEC-U · M15 EduTech") {
  slide.addText(label, {
    x: 0, y: 7.15, w: 13.33, h: 0.25,
    align: "right", valign: "middle",
    fontFace: F.body, fontSize: 8.5,
    color: C.gray, italic: false,
    margin: [0, 0.25, 0, 0],
  });
}

function addSlideNumber(slide, n, total = 10) {
  slide.addText(`${n}  /  ${total}`, {
    x: 0, y: 7.15, w: 1.2, h: 0.25,
    align: "left", valign: "middle",
    fontFace: F.body, fontSize: 8.5,
    color: C.gray,
    margin: [0, 0, 0, 0.35],
  });
}

// Section badge (gold pill label)
function addBadge(slide, text, x, y) {
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w: text.length * 0.085 + 0.35, h: 0.22,
    fill: { color: C.gold }, line: { color: C.gold },
  });
  slide.addText(text.toUpperCase(), {
    x: x + 0.015, y, w: text.length * 0.085 + 0.35, h: 0.22,
    align: "center", valign: "middle",
    fontFace: F.body, fontSize: 7.5, bold: true,
    color: C.bg,
  });
}

// Big display headline
function headline(slide, text, x, y, w, size = 36, color = C.white, align = "left") {
  slide.addText(text, {
    x, y, w, h: 1.1,
    align, valign: "top",
    fontFace: F.display, fontSize: size, bold: true,
    color,
    charSpacing: -0.5,
  });
}

// Body paragraph
function body(slide, text, x, y, w, h = 0.35, size = 12.5, color = C.offWhite) {
  slide.addText(text, {
    x, y, w, h,
    align: "left", valign: "top",
    fontFace: F.body, fontSize: size,
    color, lineSpacingMultiple: 1.4,
  });
}

// Accent line (horizontal rule)
function rule(slide, x, y, w, color = C.gold, h = 0.03) {
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color }, line: { color },
  });
}

// Card (dark surface)
function card(slide, x, y, w, h) {
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: C.surface2 },
    line: { color: "1E3A60", width: 0.5 },
    shadow: { type: "outer", color: "000000", opacity: 0.3, blur: 12, offset: 4, angle: 270 },
  });
}

// Stat block: big number + label
function stat(slide, number, label, x, y) {
  slide.addText(number, {
    x, y, w: 2.6, h: 0.75,
    align: "center", valign: "middle",
    fontFace: F.display, fontSize: 40, bold: true,
    color: C.gold,
  });
  slide.addText(label, {
    x, y: y + 0.65, w: 2.6, h: 0.4,
    align: "center", valign: "middle",
    fontFace: F.body, fontSize: 10.5,
    color: C.gray,
  });
}

// Dot bullet
function bullet(slide, text, x, y, size = 11.5) {
  slide.addShape(pptx.ShapeType.rect, {
    x: x - 0.18, y: y + 0.065, w: 0.055, h: 0.055,
    fill: { color: C.gold }, line: { color: C.gold },
  });
  slide.addText(text, {
    x, y, w: 5.0, h: 0.35,
    align: "left", valign: "middle",
    fontFace: F.body, fontSize: size,
    color: C.offWhite,
  });
}

// Tech badge pill (dark + blue outline)
function techBadge(slide, label, x, y) {
  const w = label.length * 0.078 + 0.45;
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h: 0.28,
    fill: { color: C.dark },
    line: { color: C.blue, width: 0.75 },
  });
  slide.addText(label, {
    x, y, w, h: 0.28,
    align: "center", valign: "middle",
    fontFace: F.body, fontSize: 9, bold: false,
    color: C.blue,
  });
  return w;
}

// ─── SLIDE 1 — TITRE ─────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  // Background gradient feel: large dark shapes
  s.addShape(pptx.ShapeType.rect, {
    x: 7.2, y: 0, w: 6.13, h: 7.5,
    fill: { color: C.surface }, line: { color: C.surface },
  });
  // Grid accent lines (vertical)
  for (let i = 0; i < 6; i++) {
    s.addShape(pptx.ShapeType.rect, {
      x: 7.2 + i * 0.95, y: 0, w: 0.008, h: 7.5,
      fill: { color: "142840" }, line: { color: "142840" },
    });
  }
  // Horizontal lines
  for (let i = 1; i < 8; i++) {
    s.addShape(pptx.ShapeType.rect, {
      x: 7.2, y: i * 0.94, w: 6.13, h: 0.008,
      fill: { color: "142840" }, line: { color: "142840" },
    });
  }

  // Gold vertical accent bar
  s.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 1.5, w: 0.07, h: 2.8,
    fill: { color: C.gold }, line: { color: C.gold },
  });
  // Blue thin bar below gold
  s.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 4.3, w: 0.07, h: 1.2,
    fill: { color: C.blue }, line: { color: C.blue },
  });

  // Institution label
  addBadge(s, "INP-HB · Côte d'Ivoire", 0.85, 1.58);

  // Main title
  s.addText("CPEC-U", {
    x: 0.85, y: 2.0, w: 6.0, h: 1.45,
    fontFace: F.display, fontSize: 82, bold: true,
    color: C.white, charSpacing: -2,
  });

  // Subtitle
  s.addText("Plateforme de Gestion Académique", {
    x: 0.85, y: 3.42, w: 6.0, h: 0.6,
    fontFace: F.display, fontSize: 22, bold: false,
    color: C.gold, charSpacing: 0.5,
  });

  rule(s, 0.85, 4.15, 4.5, C.blue, 0.025);

  // Body
  s.addText("Solution SaaS multi-tenant dédiée à l'INP-HB,\ncouvrant la scolarité, les notes, les absences\net la vie étudiante — de bout en bout.", {
    x: 0.85, y: 4.3, w: 6.2, h: 1.1,
    fontFace: F.body, fontSize: 13.5,
    color: C.offWhite, lineSpacingMultiple: 1.55,
  });

  // Right panel — app tag lines
  const tags = [
    ["Multi-tenant",    "Une instance, N établissements"],
    ["Temps réel",      "Données synchronisées instantanément"],
    ["Sécurisé",        "Auth multi-rôle, sessions protégées"],
    ["Moderne",         "React · Express · PostgreSQL"],
  ];
  tags.forEach(([title, sub], i) => {
    const y = 1.0 + i * 1.45;
    s.addShape(pptx.ShapeType.rect, {
      x: 7.5, y, w: 5.5, h: 1.25,
      fill: { color: C.dark },
      line: { color: "1E3A60", width: 0.5 },
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 7.5, y, w: 0.055, h: 1.25,
      fill: { color: C.gold }, line: { color: C.gold },
    });
    s.addText(title, {
      x: 7.7, y: y + 0.2, w: 5.1, h: 0.38,
      fontFace: F.display, fontSize: 14, bold: true,
      color: C.white,
    });
    s.addText(sub, {
      x: 7.7, y: y + 0.58, w: 5.1, h: 0.38,
      fontFace: F.body, fontSize: 11,
      color: C.gray,
    });
  });

  // Bottom bar
  addBottomStripe(s);
  s.addText("M15 EduTech  —  Mai 2025", {
    x: 0.85, y: 7.1, w: 4, h: 0.28,
    fontFace: F.body, fontSize: 9,
    color: C.gray,
  });
}

// ─── SLIDE 2 — CONSTAT ───────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);
  addTopStripe(s, 0.25);
  addBottomStripe(s);
  addFooter(s);
  addSlideNumber(s, 2);

  addBadge(s, "Contexte", 0.6, 0.55);

  s.addText("Le défi de la gestion académique", {
    x: 0.6, y: 0.9, w: 7.5, h: 0.9,
    fontFace: F.display, fontSize: 34, bold: true,
    color: C.white, charSpacing: -0.5,
  });

  rule(s, 0.6, 1.82, 2.8, C.gold, 0.025);

  s.addText("Les établissements académiques africains font face à des défis\nd'organisation que les outils traditionnels ne résolvent plus.", {
    x: 0.6, y: 1.95, w: 7.8, h: 0.7,
    fontFace: F.body, fontSize: 13,
    color: C.gray, lineSpacingMultiple: 1.5,
  });

  // 3 pain cards
  const pains = [
    {
      icon: "01",
      title: "Gestion fragmentée",
      desc: "Emplois du temps sur papier, notes dans des tableurs disparates, aucune vision consolidée pour la direction.",
    },
    {
      icon: "02",
      title: "Suivi étudiant lacunaire",
      desc: "Absences non centralisées, paiements de frais non tracés, bulletins générés manuellement avec risques d'erreur.",
    },
    {
      icon: "03",
      title: "Communication silotée",
      desc: "Enseignants, étudiants et administration sans canal commun. L'information circule lentement et se perd.",
    },
  ];

  pains.forEach((p, i) => {
    const x = 0.6 + i * 4.2;
    card(s, x, 2.85, 3.85, 3.85);

    // Number
    s.addText(p.icon, {
      x: x + 0.25, y: 2.95, w: 0.8, h: 0.55,
      fontFace: F.display, fontSize: 28, bold: true,
      color: C.gold,
    });

    // Title
    s.addText(p.title, {
      x: x + 0.25, y: 3.55, w: 3.3, h: 0.45,
      fontFace: F.display, fontSize: 14.5, bold: true,
      color: C.white,
    });

    rule(s, x + 0.25, 4.02, 0.8, C.gold, 0.025);

    // Desc
    s.addText(p.desc, {
      x: x + 0.25, y: 4.15, w: 3.35, h: 1.3,
      fontFace: F.body, fontSize: 11.5,
      color: C.offWhite, lineSpacingMultiple: 1.5,
    });
  });
}

// ─── SLIDE 3 — LA SOLUTION ────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);
  addTopStripe(s, 1.0);  // full width gold stripe
  addBottomStripe(s);
  addFooter(s);
  addSlideNumber(s, 3);

  // Left dark panel
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0.055, w: 5.8, h: 7.39,
    fill: { color: C.surface }, line: { color: C.surface },
  });

  addBadge(s, "Solution", 0.55, 0.7);

  s.addText("CPEC-U", {
    x: 0.55, y: 1.1, w: 5.0, h: 0.95,
    fontFace: F.display, fontSize: 54, bold: true,
    color: C.white, charSpacing: -1.5,
  });

  s.addText("Une plateforme unique pour\nunifier l'académique, le\npédagogique et l'administratif.", {
    x: 0.55, y: 2.1, w: 4.9, h: 1.3,
    fontFace: F.body, fontSize: 15.5,
    color: C.offWhite, lineSpacingMultiple: 1.6,
  });

  rule(s, 0.55, 3.55, 3.5, C.gold, 0.025);

  s.addText("Pensé pour les grandes structures comme l'INP-HB\navec plusieurs écoles, filières et populations distinctes.", {
    x: 0.55, y: 3.72, w: 5.0, h: 0.9,
    fontFace: F.body, fontSize: 12.5,
    color: C.gray, lineSpacingMultiple: 1.5,
  });

  // Right: 4 key stats in a 2×2 grid
  const stats = [
    ["Multi-école",    "1 plateforme, N établissements"],
    ["Temps réel",     "Synchronisation instantanée"],
    ["Multi-rôle",     "Directeur · Enseignant · Élève"],
    ["Full-stack",     "React · Express · PostgreSQL"],
  ];

  stats.forEach(([title, sub], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 6.2 + col * 3.4;
    const y = 0.9 + row * 2.85;

    card(s, x, y, 3.1, 2.55);

    // Icon number
    s.addShape(pptx.ShapeType.rect, {
      x: x + 0.25, y: y + 0.3, w: 0.42, h: 0.42,
      fill: { color: C.gold }, line: { color: C.gold },
    });
    s.addText(`0${i + 1}`, {
      x: x + 0.25, y: y + 0.3, w: 0.42, h: 0.42,
      fontFace: F.display, fontSize: 11, bold: true,
      color: C.bg, align: "center", valign: "middle",
    });

    s.addText(title, {
      x: x + 0.25, y: y + 0.95, w: 2.7, h: 0.45,
      fontFace: F.display, fontSize: 15, bold: true,
      color: C.white,
    });
    s.addText(sub, {
      x: x + 0.25, y: y + 1.42, w: 2.7, h: 0.65,
      fontFace: F.body, fontSize: 11,
      color: C.gray, lineSpacingMultiple: 1.4,
    });
  });
}

// ─── SLIDE 4 — ARCHITECTURE ───────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);
  addTopStripe(s, 0.4);
  addBottomStripe(s);
  addFooter(s);
  addSlideNumber(s, 4);

  addBadge(s, "Architecture", 0.6, 0.55);

  s.addText("Stack technique & déploiement", {
    x: 0.6, y: 0.9, w: 8.0, h: 0.8,
    fontFace: F.display, fontSize: 34, bold: true,
    color: C.white, charSpacing: -0.5,
  });

  rule(s, 0.6, 1.72, 3.2, C.gold, 0.025);

  // Architecture diagram (3 layers)
  const layers = [
    {
      label: "Frontend",
      tech: ["React 18", "Vite", "Tailwind CSS", "shadcn/ui"],
      color: C.blue,
      x: 0.6,
    },
    {
      label: "Backend",
      tech: ["Node.js", "Express", "Drizzle ORM", "TypeScript"],
      color: C.gold,
      x: 4.85,
    },
    {
      label: "Infrastructure",
      tech: ["PostgreSQL", "Railway", "Vercel", "Resend"],
      color: "2EC2A0",
      x: 9.1,
    },
  ];

  layers.forEach((layer) => {
    // Column header
    s.addShape(pptx.ShapeType.rect, {
      x: layer.x, y: 2.05, w: 3.8, h: 0.5,
      fill: { color: layer.color }, line: { color: layer.color },
    });
    s.addText(layer.label, {
      x: layer.x, y: 2.05, w: 3.8, h: 0.5,
      fontFace: F.display, fontSize: 14.5, bold: true,
      color: layer.label === "Backend" ? C.bg : C.bg,
      align: "center", valign: "middle",
    });

    // Tech list
    layer.tech.forEach((t, i) => {
      card(s, layer.x, 2.7 + i * 1.0, 3.8, 0.82);
      s.addText(t, {
        x: layer.x + 0.3, y: 2.7 + i * 1.0, w: 3.2, h: 0.82,
        fontFace: F.body, fontSize: 13.5, bold: false,
        color: C.offWhite, valign: "middle",
      });
      s.addShape(pptx.ShapeType.rect, {
        x: layer.x, y: 2.7 + i * 1.0, w: 0.045, h: 0.82,
        fill: { color: layer.color }, line: { color: layer.color },
      });
    });
  });

  // Bottom: architecture principle
  s.addShape(pptx.ShapeType.rect, {
    x: 0.6, y: 6.7, w: 12.13, h: 0.42,
    fill: { color: C.dark },
    line: { color: "1E3A60", width: 0.5 },
  });
  s.addText("Architecture multi-tenant  ·  Isolation complète des données par école  ·  Sessions sécurisées  ·  API REST documentée", {
    x: 0.6, y: 6.7, w: 12.13, h: 0.42,
    fontFace: F.body, fontSize: 11.5,
    color: C.gray, align: "center", valign: "middle",
  });
}

// ─── SLIDE 5 — GESTION ACADÉMIQUE ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);
  addTopStripe(s, 0.3);
  addBottomStripe(s);
  addFooter(s);
  addSlideNumber(s, 5);

  addBadge(s, "Fonctionnalités", 0.6, 0.55);

  s.addText("Gestion académique complète", {
    x: 0.6, y: 0.9, w: 8.0, h: 0.8,
    fontFace: F.display, fontSize: 34, bold: true,
    color: C.white, charSpacing: -0.5,
  });

  rule(s, 0.6, 1.72, 3.8, C.gold, 0.025);

  const features = [
    {
      title: "Classes & Filières",
      items: ["Création et organisation des classes", "Gestion des filières et niveaux", "Affectation des enseignants", "Emplois du temps intégrés"],
    },
    {
      title: "Notes & Bulletins",
      items: ["Saisie des notes par matière", "Calcul automatique des moyennes", "Génération de bulletins PDF", "Classements et statistiques"],
    },
    {
      title: "Emplois du temps",
      items: ["Planning hebdomadaire visuel", "Gestion des salles et horaires", "Affichage par classe ou enseignant", "Export PDF"],
    },
  ];

  features.forEach((f, i) => {
    const x = 0.6 + i * 4.28;
    card(s, x, 2.05, 3.9, 4.65);

    s.addShape(pptx.ShapeType.rect, {
      x, y: 2.05, w: 3.9, h: 0.52,
      fill: { color: C.surface2 },
      line: { color: C.gold, width: 0.75 },
    });
    s.addText(f.title, {
      x: x + 0.22, y: 2.05, w: 3.5, h: 0.52,
      fontFace: F.display, fontSize: 13.5, bold: true,
      color: C.gold, valign: "middle",
    });

    f.items.forEach((item, j) => {
      s.addShape(pptx.ShapeType.rect, {
        x: x + 0.22, y: 2.9 + j * 0.82 - 0.05, w: 0.06, h: 0.06,
        fill: { color: C.gold }, line: { color: C.gold },
      });
      s.addText(item, {
        x: x + 0.38, y: 2.8 + j * 0.82, w: 3.3, h: 0.7,
        fontFace: F.body, fontSize: 11.5,
        color: C.offWhite, valign: "middle", lineSpacingMultiple: 1.3,
      });
    });
  });
}

// ─── SLIDE 6 — VIE ÉTUDIANTE ──────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  // Right accent panel
  s.addShape(pptx.ShapeType.rect, {
    x: 7.8, y: 0, w: 5.53, h: 7.5,
    fill: { color: C.surface }, line: { color: C.surface },
  });

  addTopStripe(s, 0.55);
  addBottomStripe(s);
  addFooter(s);
  addSlideNumber(s, 6);

  addBadge(s, "Vie Étudiante", 0.6, 0.55);

  s.addText("Suivi complet\nde l'étudiant", {
    x: 0.6, y: 0.9, w: 7.0, h: 1.45,
    fontFace: F.display, fontSize: 38, bold: true,
    color: C.white, charSpacing: -0.5, lineSpacingMultiple: 1.2,
  });

  rule(s, 0.6, 2.42, 3.5, C.gold, 0.025);

  s.addText("Chaque étudiant dispose d'un profil centralisé\ncouvrant sa scolarité de l'inscription à la diplomation.", {
    x: 0.6, y: 2.6, w: 6.8, h: 0.7,
    fontFace: F.body, fontSize: 13,
    color: C.gray, lineSpacingMultiple: 1.5,
  });

  // Left feature list
  const leftFeatures = [
    ["Gestion des absences",   "Pointage, justificatifs, seuils d'alerte"],
    ["Paiements de frais",     "Suivi des tranches, relances automatisées"],
    ["Dossier étudiant",       "Documents, historique, parcours complet"],
    ["Messagerie interne",     "Communication directe enseignant–élève"],
  ];

  leftFeatures.forEach(([title, sub], i) => {
    const y = 3.45 + i * 0.82;
    s.addShape(pptx.ShapeType.rect, {
      x: 0.6, y, w: 0.35, h: 0.62,
      fill: { color: i === 0 ? C.gold : C.dark },
      line: { color: i === 0 ? C.gold : "1E3A60", width: 0.5 },
    });
    s.addText(`0${i + 1}`, {
      x: 0.6, y, w: 0.35, h: 0.62,
      fontFace: F.display, fontSize: 11, bold: true,
      color: i === 0 ? C.bg : C.gray,
      align: "center", valign: "middle",
    });
    s.addText(title, {
      x: 1.1, y: y + 0.02, w: 6.4, h: 0.3,
      fontFace: F.display, fontSize: 12.5, bold: true,
      color: C.white,
    });
    s.addText(sub, {
      x: 1.1, y: y + 0.3, w: 6.4, h: 0.28,
      fontFace: F.body, fontSize: 11,
      color: C.gray,
    });
  });

  // Right panel: quick stats
  const rightStats = [
    ["Profil étudiant",   "Dossier académique unifié, accessible en temps réel par les équipes pédagogiques."],
    ["Bibliothèque",      "Catalogue de ressources numériques accessible à tous les étudiants de l'établissement."],
    ["Recommandations",   "Algorithme de recommandations pédagogiques basé sur les performances individuelles."],
  ];

  rightStats.forEach(([title, desc], i) => {
    const y = 0.6 + i * 2.15;
    card(s, 8.05, y, 4.95, 1.85);
    s.addShape(pptx.ShapeType.rect, {
      x: 8.05, y, w: 0.05, h: 1.85,
      fill: { color: C.blue }, line: { color: C.blue },
    });
    s.addText(title, {
      x: 8.25, y: y + 0.3, w: 4.55, h: 0.38,
      fontFace: F.display, fontSize: 13.5, bold: true,
      color: C.white,
    });
    s.addText(desc, {
      x: 8.25, y: y + 0.72, w: 4.55, h: 0.88,
      fontFace: F.body, fontSize: 11,
      color: C.gray, lineSpacingMultiple: 1.4,
    });
  });
}

// ─── SLIDE 7 — ESPACE DIRECTION ───────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);
  addTopStripe(s, 1.0); // full gold top
  addBottomStripe(s);
  addFooter(s);
  addSlideNumber(s, 7);

  addBadge(s, "Direction", 0.6, 0.7);

  s.addText("Un tableau de bord\npour les décideurs", {
    x: 0.6, y: 1.05, w: 6.5, h: 1.6,
    fontFace: F.display, fontSize: 38, bold: true,
    color: C.white, charSpacing: -0.5, lineSpacingMultiple: 1.2,
  });

  rule(s, 0.6, 2.7, 3.0, C.gold, 0.025);

  s.addText("Le directeur dispose d'une vision globale consolidée\nen temps réel — sans extraction manuelle.", {
    x: 0.6, y: 2.85, w: 5.8, h: 0.75,
    fontFace: F.body, fontSize: 13,
    color: C.gray, lineSpacingMultiple: 1.5,
  });

  // Director capabilities
  const caps = [
    "Gestion des établissements et des licences",
    "Suivi des performances académiques globales",
    "Rapport de taux d'assiduité en temps réel",
    "Supervision des enseignants et des classes",
    "Administration des accès et des rôles",
  ];

  caps.forEach((c, i) => {
    s.addShape(pptx.ShapeType.rect, {
      x: 0.6, y: 3.75 + i * 0.58, w: 0.06, h: 0.06,
      fill: { color: C.gold }, line: { color: C.gold },
    });
    s.addText(c, {
      x: 0.82, y: 3.68 + i * 0.58, w: 5.2, h: 0.52,
      fontFace: F.body, fontSize: 12.5,
      color: C.offWhite, valign: "middle",
    });
  });

  // Right: dashboard mock cards (2 × 2)
  const dCards = [
    { label: "Étudiants actifs",  value: "1 247",  delta: "+12 ce mois" },
    { label: "Taux de présence",  value: "91 %",   delta: "Cible : 90 %" },
    { label: "Bulletins générés", value: "3 812",  delta: "Semestre 1" },
    { label: "Paiements à jour",  value: "87 %",   delta: "Taux de recouvrement" },
  ];

  dCards.forEach((dc, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 6.8 + col * 3.35;
    const y = 0.8 + row * 3.0;

    card(s, x, y, 3.1, 2.55);

    s.addText(dc.value, {
      x, y: y + 0.45, w: 3.1, h: 0.95,
      fontFace: F.display, fontSize: 42, bold: true,
      color: C.gold, align: "center",
    });
    s.addText(dc.label, {
      x, y: y + 1.42, w: 3.1, h: 0.45,
      fontFace: F.body, fontSize: 12.5,
      color: C.offWhite, align: "center",
    });
    s.addText(dc.delta, {
      x, y: y + 1.88, w: 3.1, h: 0.38,
      fontFace: F.body, fontSize: 10.5,
      color: C.gray, align: "center",
    });
  });
}

// ─── SLIDE 8 — MULTI-TENANT & SÉCURITÉ ───────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);
  addTopStripe(s, 0.45);
  addBottomStripe(s);
  addFooter(s);
  addSlideNumber(s, 8);

  addBadge(s, "Sécurité & Infrastructure", 0.6, 0.55);

  s.addText("Données isolées,\ninfrastructure robuste", {
    x: 0.6, y: 0.9, w: 8.5, h: 1.45,
    fontFace: F.display, fontSize: 36, bold: true,
    color: C.white, charSpacing: -0.5, lineSpacingMultiple: 1.2,
  });

  rule(s, 0.6, 2.42, 4.0, C.gold, 0.025);

  // Left: security principles
  const principles = [
    ["Isolation multi-tenant",    "Chaque école voit uniquement ses propres données. L'accès inter-tenant est architecturalement impossible."],
    ["Sessions sécurisées",       "express-session avec invalidation immédiate à la modification des credentials. Cookies HttpOnly."],
    ["Contrôle d'accès par rôle", "Superadmin · Directeur · Enseignant · Étudiant — chaque rôle voit exactement ce qui le concerne."],
    ["Licences & expiration",     "Chaque établissement a une licence à durée définie. Accès coupé automatiquement à expiration."],
  ];

  principles.forEach(([title, desc], i) => {
    const y = 2.65 + i * 1.05;
    s.addShape(pptx.ShapeType.rect, {
      x: 0.6, y, w: 3.9, h: 0.88,
      fill: { color: C.dark },
      line: { color: "1E3A60", width: 0.5 },
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 0.6, y, w: 0.045, h: 0.88,
      fill: { color: C.gold }, line: { color: C.gold },
    });
    s.addText(title, {
      x: 0.78, y: y + 0.04, w: 3.55, h: 0.3,
      fontFace: F.display, fontSize: 11.5, bold: true,
      color: C.white,
    });
    s.addText(desc, {
      x: 0.78, y: y + 0.34, w: 3.55, h: 0.5,
      fontFace: F.body, fontSize: 9.5,
      color: C.gray, lineSpacingMultiple: 1.35,
    });
  });

  // Right: deployment stack
  s.addText("Déploiement", {
    x: 5.2, y: 2.55, w: 4.0, h: 0.5,
    fontFace: F.display, fontSize: 16, bold: true,
    color: C.white,
  });

  const deploys = [
    { label: "Railway",     role: "API · Backend · Base de données",  color: C.blue },
    { label: "Vercel",      role: "Frontend · CDN mondial",           color: C.gold },
    { label: "PostgreSQL",  role: "Données relationnelles + migrations", color: "2EC2A0" },
    { label: "Resend",      role: "Emails transactionnels",           color: "A78BFA" },
  ];

  deploys.forEach((d, i) => {
    const y = 3.15 + i * 1.02;
    s.addShape(pptx.ShapeType.rect, {
      x: 5.2, y, w: 7.5, h: 0.82,
      fill: { color: C.surface2 },
      line: { color: "1E3A60", width: 0.5 },
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 5.2, y, w: 0.045, h: 0.82,
      fill: { color: d.color }, line: { color: d.color },
    });
    s.addText(d.label, {
      x: 5.4, y: y + 0.04, w: 2.5, h: 0.35,
      fontFace: F.display, fontSize: 13.5, bold: true,
      color: C.white,
    });
    s.addText(d.role, {
      x: 5.4, y: y + 0.38, w: 7.0, h: 0.35,
      fontFace: F.body, fontSize: 11,
      color: C.gray,
    });
  });
}

// ─── SLIDE 9 — DÉMO & ACCÈS ───────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  // Big gold accent block (left half background)
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 6.2, h: 7.5,
    fill: { color: C.surface }, line: { color: C.surface },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: 7.5,
    fill: { color: C.gold }, line: { color: C.gold },
  });

  addTopStripe(s, 0.46);
  addBottomStripe(s);
  addSlideNumber(s, 9);

  addBadge(s, "Démonstration", 0.55, 0.55);

  s.addText("Essayez CPEC-U\nen direct", {
    x: 0.55, y: 0.95, w: 5.5, h: 1.55,
    fontFace: F.display, fontSize: 42, bold: true,
    color: C.white, charSpacing: -0.8, lineSpacingMultiple: 1.15,
  });

  rule(s, 0.55, 2.58, 3.5, C.gold, 0.025);

  s.addText("Plateforme hébergée et accessible depuis n'importe\nquel appareil connecté. Aucune installation requise.", {
    x: 0.55, y: 2.75, w: 5.4, h: 0.8,
    fontFace: F.body, fontSize: 13.5,
    color: C.gray, lineSpacingMultiple: 1.5,
  });

  // Access cards
  const accesses = [
    { label: "URL de production",    value: "m15-edutech.ci",        color: C.blue },
    { label: "Compte démo directeur", value: "youss@gmail.com",      color: C.gold },
    { label: "Accès développeur",    value: "/dev — token sécurisé", color: "2EC2A0" },
  ];

  accesses.forEach((a, i) => {
    const y = 3.75 + i * 1.02;
    s.addShape(pptx.ShapeType.rect, {
      x: 0.55, y, w: 5.35, h: 0.85,
      fill: { color: C.dark },
      line: { color: a.color, width: 0.6 },
    });
    s.addText(a.label, {
      x: 0.8, y: y + 0.08, w: 4.8, h: 0.3,
      fontFace: F.body, fontSize: 10.5,
      color: C.gray,
    });
    s.addText(a.value, {
      x: 0.8, y: y + 0.4, w: 4.8, h: 0.35,
      fontFace: F.display, fontSize: 13.5, bold: true,
      color: C.white,
    });
  });

  // Right panel
  s.addText("Interface responsive,\naccessible sur ordinateur,\ntablette et mobile.", {
    x: 6.6, y: 1.5, w: 6.2, h: 1.4,
    fontFace: F.body, fontSize: 16,
    color: C.offWhite, lineSpacingMultiple: 1.6, align: "center",
  });

  // Big URL display
  s.addShape(pptx.ShapeType.rect, {
    x: 6.6, y: 3.1, w: 6.2, h: 1.05,
    fill: { color: C.dark },
    line: { color: C.gold, width: 1.0 },
  });
  s.addText("m15-edutech.ci", {
    x: 6.6, y: 3.1, w: 6.2, h: 1.05,
    fontFace: F.display, fontSize: 26, bold: true,
    color: C.gold, align: "center", valign: "middle",
  });

  s.addText("Déployé sur Vercel  ·  API sur Railway  ·  Base en production", {
    x: 6.6, y: 4.3, w: 6.2, h: 0.4,
    fontFace: F.body, fontSize: 10.5,
    color: C.gray, align: "center",
  });
}

// ─── SLIDE 10 — CONCLUSION ────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addBg(s);

  // Full-screen decorative background elements
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 7.5,
    fill: { color: C.bg }, line: { color: C.bg },
  });

  // Large rotated accent shapes
  s.addShape(pptx.ShapeType.rect, {
    x: 8.5, y: -0.5, w: 5.5, h: 8.5,
    fill: { color: C.surface }, line: { color: C.surface },
    rotate: 15,
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 10.5, y: 0, w: 3, h: 7.5,
    fill: { color: C.dark }, line: { color: C.dark },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 6.5, w: 13.33, h: 1.0,
    fill: { color: C.dark }, line: { color: C.dark },
  });

  addTopStripe(s, 1.0); // full gold
  addBottomStripe(s);

  // Left content
  s.addText("CPEC-U", {
    x: 0.7, y: 0.9, w: 7.0, h: 1.3,
    fontFace: F.display, fontSize: 68, bold: true,
    color: C.white, charSpacing: -2,
  });

  rule(s, 0.7, 2.28, 5.0, C.gold, 0.04);

  s.addText("La plateforme académique de l'INP-HB,\nconstruite pour aujourd'hui\net extensible pour demain.", {
    x: 0.7, y: 2.48, w: 7.5, h: 1.4,
    fontFace: F.body, fontSize: 17,
    color: C.offWhite, lineSpacingMultiple: 1.6,
  });

  // Value summary
  const values = [
    "Centralisation de la gestion académique",
    "Autonomie pour chaque établissement",
    "Transparence pour les étudiants et les familles",
    "Décisions fondées sur des données fiables",
  ];

  values.forEach((v, i) => {
    s.addShape(pptx.ShapeType.rect, {
      x: 0.7, y: 4.15 + i * 0.54, w: 0.08, h: 0.08,
      fill: { color: C.gold }, line: { color: C.gold },
    });
    s.addText(v, {
      x: 0.95, y: 4.08 + i * 0.54, w: 6.5, h: 0.48,
      fontFace: F.body, fontSize: 13.5,
      color: C.offWhite, valign: "middle",
    });
  });

  // Contact card
  s.addShape(pptx.ShapeType.rect, {
    x: 0.7, y: 6.42, w: 7.0, h: 0.7,
    fill: { color: C.dark },
    line: { color: "1E3A60", width: 0.5 },
  });
  s.addText("M15 EduTech  ·  contact@m15-edutech.ci  ·  m15-edutech.ci", {
    x: 0.7, y: 6.42, w: 7.0, h: 0.7,
    fontFace: F.body, fontSize: 11.5,
    color: C.gray, align: "center", valign: "middle",
  });
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
await pptx.writeFile({ fileName: "CPEC-U_Presentation_M15EduTech.pptx" });
console.log("✓ PPTX generated: CPEC-U_Presentation_M15EduTech.pptx");
