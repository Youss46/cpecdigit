import PptxGenJS from "pptxgenjs";
import { mkdirSync } from "fs";

mkdirSync("dist", { recursive: true });

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author  = "M15 EduTech";
pptx.company = "M15 EduTech";
pptx.title   = "M15 EduTech — Plateforme SaaS Académique";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:      "060C1A",
  surface: "0D1B32",
  card:    "111F38",
  gold:    "E8A838",
  goldLight: "F5C842",
  blue:    "3A7EFF",
  teal:    "0EA5B0",
  green:   "16A34A",
  purple:  "7C3AED",
  red:     "DC2626",
  white:   "FFFFFF",
  offWhite:"E2EAF5",
  gray:    "94A3B8",
  dark:    "1A2C46",
};
const F = { display: "Calibri", body: "Calibri" };
const TOTAL = 15;

// ─── Shared helpers ───────────────────────────────────────────────────────────
function bg(s)  { s.background = { color: C.bg }; }
function topBar(s, w = 13.33) {
  s.addShape(pptx.ShapeType.rect, { x:0, y:0, w, h:0.055, fill:{color:C.gold}, line:{color:C.gold} });
}
function botBar(s) {
  s.addShape(pptx.ShapeType.rect, { x:0, y:7.445, w:13.33, h:0.055, fill:{color:C.blue}, line:{color:C.blue} });
}
function footer(s, n) {
  s.addText("M15 EduTech  |  www.m15-edutech.ci", {
    x:0, y:7.1, w:13.33, h:0.28, align:"center",
    fontFace:F.body, fontSize:8.5, color:C.gray,
  });
  s.addText(`${n} / ${TOTAL}`, {
    x:12.5, y:7.1, w:0.7, h:0.28, align:"right",
    fontFace:F.body, fontSize:8.5, color:C.gray,
  });
}
function rule(s, x, y, w, color=C.gold) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h:0.028, fill:{color}, line:{color} });
}
function badge(s, text, x, y, color=C.gold) {
  const w = Math.max(1.1, text.length * 0.092 + 0.4);
  s.addShape(pptx.ShapeType.rect, { x, y, w, h:0.26, fill:{color}, line:{color} });
  s.addText(text.toUpperCase(), { x, y, w, h:0.26, align:"center", valign:"middle",
    fontFace:F.body, fontSize:8, bold:true, color:C.bg });
}
function card(s, x, y, w, h, borderColor=C.blue) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h,
    fill:{color:C.card}, line:{color:borderColor, width:0.75} });
}
function leftAccent(s, x, y, h, color=C.gold) {
  s.addShape(pptx.ShapeType.rect, { x, y, w:0.06, h, fill:{color}, line:{color} });
}
function heading(s, text, x, y, w, size=32, color=C.white) {
  s.addText(text, { x, y, w, h:1.1, align:"left", valign:"top",
    fontFace:F.display, fontSize:size, bold:true, color, charSpacing:-0.3 });
}
function bullets(s, items, x, y, w, h, size=12, color=C.offWhite) {
  const rows = items.map(t => ({
    text: t,
    options: { bullet:{code:"25B8"}, color, fontSize:size, fontFace:F.body,
               paraSpaceAfter:7, lineSpacingMultiple:1.35 },
  }));
  s.addText(rows, { x, y, w, h, valign:"top" });
}

// ─── SLIDE 1 — Titre ──────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  // Right panel
  s.addShape(pptx.ShapeType.rect, {
    x:7.0, y:0, w:6.33, h:7.5, fill:{color:C.surface}, line:{color:C.surface} });
  // Grid lines decoration on right
  for (let i=0;i<6;i++) s.addShape(pptx.ShapeType.rect,{
    x:7.0+i*0.95,y:0,w:0.008,h:7.5,fill:{color:"142840"},line:{color:"142840"}});
  for (let i=1;i<8;i++) s.addShape(pptx.ShapeType.rect,{
    x:7.0,y:i*0.94,w:6.33,h:0.008,fill:{color:"142840"},line:{color:"142840"}});
  // Gold left accent bar
  s.addShape(pptx.ShapeType.rect,{x:0.5,y:1.4,w:0.07,h:3.2,fill:{color:C.gold},line:{color:C.gold}});
  // badge
  badge(s, "Plateforme SaaS Académique", 0.85, 1.45);
  // Main title
  s.addText("M15 EduTech", { x:0.85, y:1.85, w:5.8, h:1.5,
    fontFace:F.display, fontSize:72, bold:true, color:C.white, charSpacing:-2 });
  // Gold subtitle
  s.addText("Gestion académique multi-tenant\npour l'enseignement supérieur", {
    x:0.85, y:3.38, w:5.8, h:0.9,
    fontFace:F.body, fontSize:16.5, color:C.gold, lineSpacingMultiple:1.5 });
  rule(s, 0.85, 4.4, 5.0, C.blue);
  s.addText("Multi-rôles  ·  PWA  ·  WebAuthn  ·  Notifications Push  ·  Export PDF", {
    x:0.85, y:4.55, w:5.8, h:0.35,
    fontFace:F.body, fontSize:11, color:C.gray });
  // Right panel — 4 highlights
  const hl = [
    ["Multi-tenant",  "Une instance, N établissements isolés"],
    ["5 rôles",       "Directeur · Enseignant · Étudiant · Parent"],
    ["PWA",           "Installable, sync hors-ligne, mobile-first"],
    ["Sécurisé",      "WebAuthn biométrique + sessions protégées"],
  ];
  hl.forEach(([t,d],i)=>{
    const y = 0.7 + i*1.65;
    card(s, 7.25, y, 5.75, 1.42, C.blue);
    leftAccent(s, 7.25, y, 1.42, C.gold);
    s.addText(t, { x:7.48, y:y+0.2, w:5.3, h:0.38,
      fontFace:F.display, fontSize:14.5, bold:true, color:C.white });
    s.addText(d, { x:7.48, y:y+0.62, w:5.3, h:0.5,
      fontFace:F.body, fontSize:11.5, color:C.gray, lineSpacingMultiple:1.4 });
  });
  botBar(s);
  s.addText("Mai 2025", { x:0.85, y:7.1, w:3, h:0.28,
    fontFace:F.body, fontSize:8.5, color:C.gray });
}

// ─── SLIDE 2 — Vue d'ensemble ─────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,5.5); botBar(s); footer(s,2);
  badge(s,"Vue d'ensemble",0.6,0.6);
  heading(s,"Solution complète pour l'académique",0.6,0.95,12.0,33);
  rule(s,0.6,2.0,3.5);
  // 4 feature cards 2×2
  const cards = [
    { t:"Gestion Académique", d:"Classes, matières, semestres, promotions et emplois du temps unifiés.", color:C.blue },
    { t:"Multi-Tenant & Rôles", d:"5 rôles distincts — Directeur, Scolarité, Planificateur, Enseignant, Étudiant, Parent.", color:C.purple },
    { t:"PWA & Mobile", d:"Application Progressive Web App : installable sur tous les appareils, fonctionnelle hors-ligne.", color:C.teal },
    { t:"Sécurisé & Traçable", d:"WebAuthn biométrique, sessions sécurisées, audit trail, isolation totale par tenant.", color:C.gold },
  ];
  cards.forEach((c,i)=>{
    const x = 0.6 + (i%2)*6.45;
    const y = 2.25 + Math.floor(i/2)*2.48;
    card(s,x,y,6.1,2.22,c.color);
    leftAccent(s,x,y,2.22,c.color);
    s.addText(c.t,{ x:x+0.25,y:y+0.28,w:5.6,h:0.48,
      fontFace:F.display,fontSize:16,bold:true,color:C.white });
    rule(s,x+0.25,y+0.8,1.2,c.color);
    s.addText(c.d,{ x:x+0.25,y:y+0.95,w:5.6,h:1.1,
      fontFace:F.body,fontSize:12.5,color:C.offWhite,lineSpacingMultiple:1.5 });
  });
}

// ─── SLIDE 3 — Architecture Technique ────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,7); botBar(s); footer(s,3);
  badge(s,"Architecture Technique",0.6,0.6);
  heading(s,"Stack & Déploiement",0.6,0.95,10,33);
  rule(s,0.6,2.0,3.0);

  const layers = [
    { label:"FRONTEND", color:C.blue, items:[
      "React 19 + Vite 7","Tailwind CSS 4 + shadcn/ui",
      "TanStack Query + Wouter","Framer Motion + PWA","Orval codegen (React Query)"] },
    { label:"BACKEND", color:C.green, items:[
      "Express 5 + TypeScript","Drizzle ORM + PostgreSQL",
      "express-session (cookies SameSite=None)","Multer (uploads 50 Mo)","Web Push VAPID"] },
    { label:"INFRA", color:C.gold, items:[
      "Vercel (frontend, CDN global)","Railway (API, auto-scaling)",
      "PostgreSQL (Replit / prod)","Resend (emails transac.)","pnpm monorepo workspaces"] },
  ];
  layers.forEach((l,i)=>{
    const x = 0.55 + i*4.28;
    s.addShape(pptx.ShapeType.rect,{x,y:2.25,w:4.0,h:0.52,
      fill:{color:l.color},line:{color:l.color}});
    s.addText(l.label,{x,y:2.25,w:4.0,h:0.52,align:"center",valign:"middle",
      fontFace:F.display,fontSize:14,bold:true,color:i===2?C.bg:C.white});
    l.items.forEach((item,j)=>{
      card(s,x,2.88+j*0.84,4.0,0.76,l.color);
      leftAccent(s,x,2.88+j*0.84,0.76,l.color);
      s.addText(item,{x:x+0.22,y:2.88+j*0.84,w:3.65,h:0.76,
        fontFace:F.body,fontSize:12,color:C.offWhite,valign:"middle"});
    });
  });
  // Bottom principles strip
  s.addShape(pptx.ShapeType.rect,{x:0.55,y:7.0,w:12.23,h:0.38,
    fill:{color:C.dark},line:{color:C.blue,width:0.75}});
  s.addText("API REST documentée (OpenAPI + Zod)  ·  Cookies cross-origin SameSite=None  ·  Migration auto au démarrage  ·  Health check /api/healthz",{
    x:0.55,y:7.0,w:12.23,h:0.38,align:"center",valign:"middle",
    fontFace:F.body,fontSize:10.5,color:C.gray});
}

// ─── SLIDE 4 — Multi-Tenancy & Rôles ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,13.33); botBar(s); footer(s,4);
  badge(s,"Multi-Tenancy & Rôles",0.6,0.6);
  heading(s,"Architecture multi-école, accès par rôle",0.6,0.95,12,33);
  rule(s,0.6,2.0,4.0);

  // Role badges
  const roles=[
    {r:"Directeur",c:C.purple},{r:"Scolarité",c:C.blue},
    {r:"Planificateur",c:C.teal},{r:"Enseignant",c:C.green},
    {r:"Étudiant",c:C.gold},{r:"Parent",c:"9D174D"},
  ];
  roles.forEach((ro,i)=>{
    s.addShape(pptx.ShapeType.rect,{x:0.55+i*2.2,y:2.25,w:2.0,h:0.52,
      fill:{color:ro.c},line:{color:ro.c}});
    s.addText(ro.r,{x:0.55+i*2.2,y:2.25,w:2.0,h:0.52,align:"center",valign:"middle",
      fontFace:F.display,fontSize:12.5,bold:true,color:ro.c===C.gold?C.bg:C.white});
  });

  // Two columns
  const leftItems=[
    "Résolution du tenant à la connexion par email",
    "Chaque table porte un tenantId (clé étrangère vers tenants)",
    "Emails uniques par (email, tenantId) — pas globalement",
    "Session stocke userId + role + tenantId après connexion",
    "Middleware tenantMiddleware sur toutes les routes /api",
  ];
  const rightItems=[
    "Portail super-admin /dev — protégé par DEV_MASTER_KEY",
    "Token SHA-256 côté client — pas de cookie de session",
    "Créer établissement + admin + clé d'activation en un seul formulaire",
    "Gérer directeurs, tenants et clés depuis /dev",
    "5 rôles distincts avec portails et permissions dédiés",
  ];
  s.addText("Architecture Multi-Tenant",{x:0.6,y:2.95,w:5.8,h:0.4,
    fontFace:F.display,fontSize:14.5,bold:true,color:C.goldLight});
  bullets(s,leftItems,0.75,3.4,5.65,3.4,12.5);
  s.addText("Gestion & Administration",{x:6.8,y:2.95,w:5.9,h:0.4,
    fontFace:F.display,fontSize:14.5,bold:true,color:C.goldLight});
  bullets(s,rightItems,6.95,3.4,5.75,3.4,12.5);
  // Vertical rule
  s.addShape(pptx.ShapeType.rect,{x:6.55,y:2.95,w:0.028,h:4.0,fill:{color:C.dark},line:{color:C.dark}});
}

// ─── SLIDE 5 — Gestion Académique ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,4.5); botBar(s); footer(s,5);
  badge(s,"Gestion Académique",0.6,0.6);
  heading(s,"Classes, matières, semestres & promotions",0.6,0.95,12,33);
  rule(s,0.6,2.0,5.0);

  // LMD badges
  const lmds=[["L1","1D4ED8"],["L2","2563EB"],["L3","3B82F6"],["M1",C.purple],["M2","9333EA"]];
  lmds.forEach(([l,c],i)=>{
    s.addShape(pptx.ShapeType.rect,{x:0.55+i*1.55,y:2.28,w:1.38,h:0.52,fill:{color:c},line:{color:c}});
    s.addText(l,{x:0.55+i*1.55,y:2.28,w:1.38,h:0.52,align:"center",valign:"middle",
      fontFace:F.display,fontSize:16,bold:true,color:C.white});
  });
  s.addShape(pptx.ShapeType.rect,{x:8.3,y:2.28,w:4.5,h:0.52,fill:{color:C.dark},line:{color:C.gold,width:0.75}});
  s.addText("Référentiel LMD",{x:8.3,y:2.28,w:4.5,h:0.52,align:"center",valign:"middle",
    fontFace:F.body,fontSize:13,color:C.goldLight});

  bullets(s,[
    "Classes & filières : groupes d'étudiants par niveau et spécialité",
    "Matières et unités d'enseignement (UE) associées aux classes",
    "Semestres liés aux classes — niveauLmd (L1–M2) + numéro 1 ou 2",
    "Contrainte unique : max 2 semestres par classe par année académique",
    "Promotions annuelles : affectation des étudiants par classe et année",
    "Page admin : semestres groupés par classe, indicateurs de progression",
  ],0.6,3.0,12.2,4.2,14.5);
}

// ─── SLIDE 6 — Notes & Bulletins ─────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,13.33); botBar(s); footer(s,6);
  badge(s,"Notes & Bulletins",0.6,0.6);
  heading(s,"De la saisie au bulletin PDF vérifié par QR code",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,5.5);

  // Workflow steps
  const steps=[
    {t:"Saisie",d:"Enseignant saisit les notes par matière",c:C.blue},
    {t:"Approbation",d:"Validation du responsable pédagogique",c:C.teal},
    {t:"Rattrapage",d:"Sessions configurables par semestre",c:C.purple},
    {t:"Jury Spécial",d:"Délibérations fin d'année + PV PDF",c:"7C3AED"},
    {t:"Bulletin",d:"PDF jsPDF + QR code unique par bulletin",c:C.gold},
  ];
  steps.forEach((st,i)=>{
    card(s,0.55+i*2.56,2.28,2.38,2.0,st.c);
    s.addShape(pptx.ShapeType.rect,{x:0.55+i*2.56,y:2.28,w:2.38,h:0.5,fill:{color:st.c},line:{color:st.c}});
    s.addText(st.t,{x:0.55+i*2.56,y:2.28,w:2.38,h:0.5,align:"center",valign:"middle",
      fontFace:F.display,fontSize:13,bold:true,color:i===4?C.bg:C.white});
    s.addText(st.d,{x:0.72+i*2.56,y:2.95,w:2.05,h:1.15,
      fontFace:F.body,fontSize:11.5,color:C.offWhite,lineSpacingMultiple:1.4,valign:"top"});
    if(i<4){
      s.addShape(pptx.ShapeType.rect,{x:2.93+i*2.56,y:3.08,w:0.18,h:0.14,fill:{color:C.gray},line:{color:C.gray}});
    }
  });

  bullets(s,[
    "Calcul automatique des moyennes pondérées par coefficient",
    "Approbation requise avant publication — workflow contrôlé",
    "Jury Spécial : traceabilité complète, mise à jour des bulletins, PV PDF généré",
    "Bulletins PDF avec logo institutionnel, barre dorée, tableau jspdf-autotable",
    "QR code unique par bulletin — page publique /verify/:code pour authentification",
  ],0.6,4.55,12.2,2.45,13.5);
}

// ─── SLIDE 7 — Emplois du Temps & Assiduité ──────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,6.0); botBar(s); footer(s,7);
  badge(s,"Emplois du Temps & Assiduité",0.6,0.6);
  heading(s,"Planification, émargement & suivi des heures",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,5.0);

  // Left col
  s.addText("Planification",{x:0.6,y:2.28,w:5.8,h:0.42,
    fontFace:F.display,fontSize:15,bold:true,color:C.goldLight});
  s.addShape(pptx.ShapeType.rect,{x:0.6,y:2.72,w:1.0,h:0.028,fill:{color:C.gold},line:{color:C.gold}});
  bullets(s,[
    "Créneaux : salle, enseignant, groupe, matière",
    "Détection automatique de conflits de salle et d'enseignant",
    "Programmation par période — génération en masse",
    "Vues filtrées par rôle (admin, enseignant, étudiant)",
    "Export PDF des emplois du temps",
  ],0.75,2.85,5.65,3.5,13.5);

  // Right col — Suivi des heures
  s.addText("Suivi des Heures",{x:7.0,y:2.28,w:5.8,h:0.42,
    fontFace:F.display,fontSize:15,bold:true,color:C.goldLight});
  s.addShape(pptx.ShapeType.rect,{x:7.0,y:2.72,w:1.0,h:0.028,fill:{color:C.gold},line:{color:C.gold}});
  bullets(s,[
    "Heure réalisée = feuille d'émargement soumise (sentAt ≠ null)",
    "Aucune validation admin requise — statut calculé dynamiquement",
    "Statuts : À_JOUR / À_SURVEILLER / EN_RETARD / NON_DÉMARRÉ",
    "Calculé en temps réel vs. avancement du semestre",
    "Page admin : planifiées / réalisées / restantes + export CSV",
  ],7.15,2.85,5.65,3.5,13.5);

  // Vertical rule
  s.addShape(pptx.ShapeType.rect,{x:6.6,y:2.28,w:0.028,h:4.3,fill:{color:C.dark},line:{color:C.dark}});

  // Status badge row
  const statuses=[
    {l:"À_JOUR",c:C.green},{l:"À_SURVEILLER",c:C.gold},
    {l:"EN_RETARD",c:C.red},{l:"NON_DÉMARRÉ",c:C.gray},
  ];
  statuses.forEach((st,i)=>{
    s.addShape(pptx.ShapeType.rect,{x:7.0+i*1.55,y:6.65,w:1.42,h:0.38,fill:{color:st.c},line:{color:st.c}});
    s.addText(st.l,{x:7.0+i*1.55,y:6.65,w:1.42,h:0.38,align:"center",valign:"middle",
      fontFace:F.body,fontSize:9.5,bold:true,color:[C.gold,C.green].includes(st.c)?C.bg:C.white});
  });
}

// ─── SLIDE 8 — Devoirs & Évaluations ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,8); botBar(s); footer(s,8);
  badge(s,"Devoirs & Évaluations en Ligne",0.6,0.6);
  heading(s,"Évaluations interactives avec anti-triche intégré",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,5.0);

  // 7 question types
  const qtypes=["QCM","QCM multiple","Vrai / Faux","Texte libre","Ordre","Correspondance","Numérique"];
  qtypes.forEach((qt,i)=>{
    const col=i%4, row=Math.floor(i/4);
    card(s,0.55+col*3.2,2.28+row*0.72,3.0,0.64,C.blue);
    s.addText(qt,{x:0.55+col*3.2,y:2.28+row*0.72,w:3.0,h:0.64,align:"center",valign:"middle",
      fontFace:F.display,fontSize:13.5,bold:true,color:C.offWhite});
  });

  // Anti-cheat panel
  s.addShape(pptx.ShapeType.rect,{x:0.55,y:3.55,w:12.23,h:0.48,
    fill:{color:"7F1D1D"},line:{color:C.red,width:1}});
  s.addText("Système Anti-Triche",{x:0.55,y:3.55,w:12.23,h:0.48,align:"center",valign:"middle",
    fontFace:F.display,fontSize:14,bold:true,color:C.white});

  bullets(s,[
    "Plein écran obligatoire via requestFullscreen API — quitter = incident enregistré",
    "Blocage copier-coller, clic droit, raccourcis clavier Ctrl+C/V/U/A et PrintScreen",
    "Détection changement d'onglet via visibilitychange — 3 infractions = auto-soumission TRICHERIE_DETECTEE",
    "Mélange Fisher-Yates côté serveur (seed unique par étudiant) — stable au rechargement de page",
    "Timer côté serveur (fin_prevue en DB) — auto-sauvegarde toutes les 30s — rapport de surveillance enseignant",
  ],0.7,4.18,12.05,2.75,12.5);
}

// ─── SLIDE 9 — Mémoires & Soutenances ────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,9); botBar(s); footer(s,9);
  badge(s,"Mémoires & Soutenances",0.6,0.6);
  heading(s,"Cycle de vie complet du mémoire à l'archivage",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,5.0);

  // Status workflow
  const statuses=[
    {t:"SOUMIS",c:"1D4ED8"},{t:"VALIDÉ",c:C.teal},
    {t:"PLANIFIÉ",c:C.purple},{t:"SOUTENU",c:C.green},{t:"ARCHIVÉ",c:C.gold},
  ];
  statuses.forEach((st,i)=>{
    s.addShape(pptx.ShapeType.rect,{x:0.55+i*2.56,y:2.28,w:2.38,h:0.52,fill:{color:st.c},line:{color:st.c}});
    s.addText(st.t,{x:0.55+i*2.56,y:2.28,w:2.38,h:0.52,align:"center",valign:"middle",
      fontFace:F.display,fontSize:13,bold:true,color:i===4?C.bg:C.white});
    if(i<4) s.addShape(pptx.ShapeType.rect,{x:2.93+i*2.56,y:2.49,w:0.18,h:0.11,fill:{color:C.gray},line:{color:C.gray}});
  });

  bullets(s,[
    "Dépôt de mémoires PDF ou Word — taille jusqu'à 50 Mo par fichier",
    "Composition du jury : enseignants internes ou membres externes (nom + email)",
    "Planification de la soutenance : date, heure, salle, durée configurable",
    "Convocations automatiques envoyées par email via Resend à l'étudiant et aux membres externes",
    "Génération de la convocation PDF côté client avec jsPDF (logo, jury, date, salle)",
    "Résultat enregistré après soutenance : note, mention, observations du jury",
    "Archive / bibliothèque filtrée par domaine, année académique, mention et mots-clés",
  ],0.6,3.05,12.2,3.9,13);
}

// ─── SLIDE 10 — Bibliothèque Numérique ───────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,5); botBar(s); footer(s,10);
  badge(s,"Bibliothèque Numérique",0.6,0.6);
  heading(s,"Ressources, quiz et analytiques d'engagement",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,5.0);

  const cards4=[
    {t:"Ressources par Matière",d:"PDF, Word, PowerPoint, images, archives\nLiens YouTube et URLs externes\nOrganisés par UE / matière / semestre / classe",c:C.blue},
    {t:"Quiz Interactifs",d:"QCM, multi-sélect, vrai/faux, texte libre\nCréés par l'enseignant par ressource\nCorrection et score instantanés pour l'étudiant",c:C.teal},
    {t:"Suivi du Temps",d:"Temps de consultation mesuré automatiquement\nTableau 'Mon Suivi' — progression par ressource\nAccumulation par matière et par semestre",c:C.green},
    {t:"Analytiques Enseignant",d:"Nombre de consultations par ressource\nTemps moyen passé, taux de participation\nScores moyens aux quiz par classe",c:C.gold},
  ];
  cards4.forEach((c,i)=>{
    const x=0.55+(i%2)*6.45, y=2.28+Math.floor(i/2)*2.4;
    card(s,x,y,6.1,2.22,c.c);
    leftAccent(s,x,y,2.22,c.c);
    s.addText(c.t,{x:x+0.25,y:y+0.18,w:5.6,h:0.45,fontFace:F.display,fontSize:15,bold:true,color:C.white});
    rule(s,x+0.25,y+0.66,1.0,c.c);
    s.addText(c.d,{x:x+0.25,y:y+0.82,w:5.6,h:1.28,fontFace:F.body,fontSize:12,color:C.offWhite,lineSpacingMultiple:1.4});
  });
}

// ─── SLIDE 11 — Espace Parents & Communication ───────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,7); botBar(s); footer(s,11);
  badge(s,"Espace Parents & Communication",0.6,0.6);
  heading(s,"Parents connectés, notifications temps réel",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,4.5);

  s.addText("Espace Parents",{x:0.6,y:2.25,w:5.8,h:0.42,fontFace:F.display,fontSize:15,bold:true,color:C.goldLight});
  s.addShape(pptx.ShapeType.rect,{x:0.6,y:2.69,w:0.9,h:0.028,fill:{color:C.gold},line:{color:C.gold}});
  bullets(s,[
    "Comptes parents liés aux comptes étudiants",
    "Accès aux résultats des semestres publiés",
    "Suivi des absences en temps réel",
    "Consultation des emplois du temps de l'enfant",
    "Notifications automatiques : absences, résultats publiés",
  ],0.75,2.85,5.65,3.6,13.5);

  s.addText("Notifications & Rappels",{x:7.0,y:2.25,w:5.8,h:0.42,fontFace:F.display,fontSize:15,bold:true,color:C.goldLight});
  s.addShape(pptx.ShapeType.rect,{x:7.0,y:2.69,w:0.9,h:0.028,fill:{color:C.gold},line:{color:C.gold}});
  bullets(s,[
    "Web Push VAPID — notifications natives sur tous les appareils",
    "Rappels de paiement automatisés : J-7, J-3, J0, J+7",
    "Confirmation de paiement = notification push immédiate",
    "Journal détaillé des notifications avec statut d'envoi",
    "Notifications à chaque étape des workflows académiques",
  ],7.15,2.85,5.65,3.6,13.5);

  s.addShape(pptx.ShapeType.rect,{x:6.6,y:2.25,w:0.028,h:4.3,fill:{color:C.dark},line:{color:C.dark}});

  // Rappel timeline
  const rappels=[{l:"J-7",c:C.blue},{l:"J-3",c:C.teal},{l:"J0",c:C.gold},{l:"J+7",c:C.red}];
  rappels.forEach((r,i)=>{
    s.addShape(pptx.ShapeType.rect,{x:7.0+i*1.5,y:6.65,w:1.32,h:0.38,fill:{color:r.c},line:{color:r.c}});
    s.addText(r.l,{x:7.0+i*1.5,y:6.65,w:1.32,h:0.38,align:"center",valign:"middle",
      fontFace:F.display,fontSize:14,bold:true,color:r.c===C.gold?C.bg:C.white});
  });
  s.addText("Échéances de rappel de paiement",{x:7.0,y:7.08,w:6.0,h:0.22,
    fontFace:F.body,fontSize:9,color:C.gray});
}

// ─── SLIDE 12 — Suivi Académique & Tableaux de Bord ──────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,6); botBar(s); footer(s,12);
  badge(s,"Suivi Académique & Tableaux de Bord",0.6,0.6);
  heading(s,"Pilotage, alertes et gestion des réclamations",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,5.0);

  // Top two cards
  card(s,0.55,2.28,6.1,2.42,C.blue);
  leftAccent(s,0.55,2.28,2.42,C.blue);
  s.addText("Suivi Individualisé",{x:0.8,y:2.42,w:5.6,h:0.42,fontFace:F.display,fontSize:15,bold:true,color:C.white});
  bullets(s,["Courbes de progression par matière","Taux d'absence avec seuil d'alerte","Analyse multi-critères : étudiants à risque","Vue admin et vue étudiant dédiées"],0.95,2.95,5.5,1.6,12.5);

  card(s,6.85,2.28,6.0,2.42,C.purple);
  leftAccent(s,6.85,2.28,2.42,C.purple);
  s.addText("Tableau de Bord Multi-Années",{x:7.1,y:2.42,w:5.5,h:0.42,fontFace:F.display,fontSize:15,bold:true,color:C.white});
  bullets(s,["KPIs comparatifs sur plusieurs années","Taux de réussite / échec par promotion","Tendances des absences et identification des matières à fort taux d'échec","Données consolidées pour la direction"],7.25,2.95,5.4,1.6,12.5);

  // Réclamations block
  s.addShape(pptx.ShapeType.rect,{x:0.55,y:4.9,w:12.3,h:0.48,fill:{color:C.dark},line:{color:C.gold,width:1}});
  s.addText("Gestion des Réclamations de Notes",{x:0.55,y:4.9,w:12.3,h:0.48,align:"center",valign:"middle",
    fontFace:F.display,fontSize:14,bold:true,color:C.goldLight});
  bullets(s,[
    "Périodes de réclamation configurables — wizard de soumission multi-étapes pour l'étudiant",
    "Réponse de l'enseignant + arbitrage admin — journal d'audit immuable à chaque action",
    "Notifications push à chaque étape : soumission, réponse, arbitrage, clôture",
  ],0.7,5.52,12.1,1.62,13);
}

// ─── SLIDE 13 — Sécurité & Fonctionnalités Avancées ──────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,7); botBar(s); footer(s,13);
  badge(s,"Sécurité & Fonctionnalités Avancées",0.6,0.6);
  heading(s,"WebAuthn, carte étudiante, évaluation & PDF",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,5.0);

  const cards4=[
    {t:"Connexion Biométrique WebAuthn",d:"Standard FIDO2 — empreinte digitale ou Face ID\nAucun mot de passe stocké côté serveur\nEnregistrement et révocation depuis les paramètres",c:C.blue},
    {t:"Carte Étudiante Numérique",d:"Carte générée avec QR code unique par étudiant\nPage publique /verify/:code pour authentifier\nAdmin : génération et invalidation des cartes",c:C.teal},
    {t:"Évaluation des Enseignants",d:"Évaluation anonyme par les étudiants en fin de semestre\nWizard multi-étapes avec scoring pondéré par critère\nSeuil minimal d'évaluations pour garantir l'anonymat",c:C.purple},
    {t:"Centre de Documents PDF",d:"Service centralisé jsPDF + jspdf-autotable\nBulletins, feuilles de présence, PV jury, convocations\nBranding institutionnel uniforme — logo + barre dorée",c:C.gold},
  ];
  cards4.forEach((c,i)=>{
    const x=0.55+(i%2)*6.45, y=2.28+Math.floor(i/2)*2.4;
    card(s,x,y,6.1,2.22,c.c);
    leftAccent(s,x,y,2.22,c.c);
    s.addText(c.t,{x:x+0.25,y:y+0.18,w:5.6,h:0.45,fontFace:F.display,fontSize:14.5,bold:true,color:C.white});
    rule(s,x+0.25,y+0.66,1.0,c.c);
    s.addText(c.d,{x:x+0.25,y:y+0.82,w:5.6,h:1.28,fontFace:F.body,fontSize:12,color:C.offWhite,lineSpacingMultiple:1.4});
  });
}

// ─── SLIDE 14 — Déploiement en Production ────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s); topBar(s,13.33); botBar(s); footer(s,14);
  badge(s,"Déploiement en Production",0.6,0.6);
  heading(s,"Vercel + Railway — www.m15-edutech.ci",0.6,0.95,11.5,33);
  rule(s,0.6,2.0,5.0);

  // Frontend block
  s.addShape(pptx.ShapeType.rect,{x:0.55,y:2.28,w:5.9,h:0.52,fill:{color:C.blue},line:{color:C.blue}});
  s.addText("FRONTEND — Vercel",{x:0.55,y:2.28,w:5.9,h:0.52,align:"center",valign:"middle",
    fontFace:F.display,fontSize:14,bold:true,color:C.white});
  bullets(s,[
    "Build : pnpm --filter @workspace/cpec-u run build",
    "Output : dist/public — CDN global Vercel",
    "Domaine : www.m15-edutech.ci",
    "Proxy Vercel : /api/* → api.m15-edutech.ci (pas de CORS côté navigateur)",
    "SPA routing — catch-all vers index.html",
  ],0.7,2.95,5.6,3.35,13);

  // Backend block
  s.addShape(pptx.ShapeType.rect,{x:6.85,y:2.28,w:5.9,h:0.52,fill:{color:C.green},line:{color:C.green}});
  s.addText("API — Railway",{x:6.85,y:2.28,w:5.9,h:0.52,align:"center",valign:"middle",
    fontFace:F.display,fontSize:14,bold:true,color:C.white});
  bullets(s,[
    "Build esbuild — bundle ESM minifié (bundle @simplewebauthn/server)",
    "Start : pnpm --filter @workspace/api-server run start",
    "Domaine : api.m15-edutech.ci",
    "Health check : GET /api/healthz | /api/healthz/detail",
    "Variables Railway : DATABASE_URL, SESSION_SECRET, VAPID keys, DEV_MASTER_KEY",
  ],7.0,2.95,5.6,3.35,13);

  s.addShape(pptx.ShapeType.rect,{x:6.6,y:2.28,w:0.028,h:4.3,fill:{color:C.dark},line:{color:C.dark}});

  // Bottom strip
  s.addShape(pptx.ShapeType.rect,{x:0.55,y:6.48,w:12.23,h:0.52,fill:{color:C.dark},line:{color:C.gold,width:0.75}});
  s.addText("SameSite=None; Secure  ·  trust proxy:1  ·  Cookies cross-origin  ·  Crypto polyfill Node.js  ·  Migrations auto au démarrage  ·  .node-version=20",{
    x:0.55,y:6.48,w:12.23,h:0.52,align:"center",valign:"middle",
    fontFace:F.body,fontSize:10.5,color:C.gray});
}

// ─── SLIDE 15 — Closing ───────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  // Right panel
  s.addShape(pptx.ShapeType.rect,{x:7.5,y:0,w:5.83,h:7.5,fill:{color:C.surface},line:{color:C.surface}});
  for(let i=0;i<5;i++) s.addShape(pptx.ShapeType.rect,{x:7.5+i*1.0,y:0,w:0.008,h:7.5,fill:{color:"142840"},line:{color:"142840"}});
  for(let i=1;i<8;i++) s.addShape(pptx.ShapeType.rect,{x:7.5,y:i*0.94,w:5.83,h:0.008,fill:{color:"142840"},line:{color:"142840"}});

  // Gold left accent
  s.addShape(pptx.ShapeType.rect,{x:0.5,y:1.5,w:0.07,h:4.5,fill:{color:C.gold},line:{color:C.gold}});

  // Central closing block
  s.addText("M15 EduTech",{x:0.85,y:1.8,w:6.3,h:1.6,
    fontFace:F.display,fontSize:68,bold:true,color:C.white,charSpacing:-2});
  rule(s,0.85,3.45,5.5,C.gold);
  s.addText("Une plateforme complète, sécurisée et évolutive\npour la gestion académique moderne.",{
    x:0.85,y:3.65,w:6.3,h:1.1,
    fontFace:F.body,fontSize:16,color:C.offWhite,lineSpacingMultiple:1.6});
  rule(s,0.85,4.9,3.0,C.blue);
  s.addText("www.m15-edutech.ci",{x:0.85,y:5.1,w:6.3,h:0.55,
    fontFace:F.display,fontSize:22,bold:true,color:C.goldLight});

  // Right panel summary
  const feats=[
    "Multi-tenant — N établissements isolés",
    "WebAuthn biométrique (FIDO2)",
    "Devoirs en ligne + anti-triche",
    "Mémoires & soutenances",
    "Bibliothèque + quiz + analytiques",
    "Notifications Push VAPID",
    "Bulletins PDF + QR vérification",
    "Vercel + Railway en production",
  ];
  feats.forEach((f,i)=>{
    s.addShape(pptx.ShapeType.rect,{x:7.65,y:0.5+i*0.82,w:0.06,h:0.06,fill:{color:C.gold},line:{color:C.gold}});
    s.addText(f,{x:7.85,y:0.42+i*0.82,w:5.2,h:0.75,
      fontFace:F.body,fontSize:12.5,color:C.offWhite,valign:"middle"});
  });

  botBar(s);
}

// ─── Export ───────────────────────────────────────────────────────────────────
await pptx.writeFile({ fileName: "dist/M15-EduTech-Presentation.pptx" });
console.log("Done → dist/M15-EduTech-Presentation.pptx");
