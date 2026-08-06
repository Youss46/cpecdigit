import { Resend } from "resend";

const CONNECTORS_HOSTNAME = process.env.REPLIT_CONNECTORS_HOSTNAME;

async function getResendCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  // Try Replit connector first (dev environment)
  if (CONNECTORS_HOSTNAME) {
    const xReplitToken =
      process.env.REPL_IDENTITY
        ? "repl " + process.env.REPL_IDENTITY
        : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

    if (xReplitToken) {
      try {
        const data = await fetch(
          `https://${CONNECTORS_HOSTNAME}/api/v2/connection?include_secrets=true&connector_names=resend`,
          {
            headers: {
              Accept: "application/json",
              "X-Replit-Token": xReplitToken,
            },
          },
        ).then((r) => r.json());

        const settings = data?.items?.[0]?.settings;
        if (settings?.api_key) {
          // RESEND_FROM_EMAIL env var always wins (production with verified domain).
          // Otherwise fall back to Resend's sandbox sender that works without
          // domain verification — useful for Replit dev / testing.
          const fromEmail =
            process.env.RESEND_FROM_EMAIL ??
            "onboarding@resend.dev";
          return { apiKey: settings.api_key, fromEmail };
        }
      } catch {
        // fall through to env var
      }
    }
  }

  // Fall back to plain env var (Railway / production)
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend not configured: set RESEND_API_KEY environment variable.");
  }
  return {
    apiKey,
    fromEmail: process.env.RESEND_FROM_EMAIL ?? "noreply@m15edutech.ci",
  };
}

export async function getResendClient() {
  const { apiKey, fromEmail } = await getResendCredentials();
  return { client: new Resend(apiKey), fromEmail };
}

export async function sendWelcomeCredentialsEmail(opts: {
  to: string;
  name: string;
  email: string;
  tempPassword: string;
  schoolName: string;
  role: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();

  const roleLabel =
    opts.role === "teacher" ? "Enseignant"
    : opts.role === "student" ? "Étudiant"
    : opts.role === "admin" ? "Administrateur"
    : opts.role;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenue sur M15 EduTech</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a3a5c 0%,#0f2540 100%);border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:12px;">
              <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">M15 <span style="color:#22c55e;">EduTech</span></span>
            </div>
            <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.6);letter-spacing:2px;text-transform:uppercase;">Gestion Académique</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:40px 40px 32px;">
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f2540;">Bienvenue sur la plateforme !</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Bonjour <strong>${opts.name}</strong>,</p>

            <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
              Votre compte <strong>${roleLabel}</strong> vient d'être créé sur la plateforme
              <strong>${opts.schoolName}</strong>. Voici vos identifiants de connexion :
            </p>

            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 12px;font-size:13px;color:#374151;">
                    <span style="display:inline-block;width:140px;color:#6b7280;font-weight:600;">Adresse email :</span>
                    <span style="font-weight:700;color:#0f2540;">${opts.email}</span>
                  </p>
                  <p style="margin:0;font-size:13px;color:#374151;">
                    <span style="display:inline-block;width:140px;color:#6b7280;font-weight:600;">Mot de passe temporaire :</span>
                    <span style="font-family:monospace;font-size:16px;font-weight:800;color:#1a3a5c;letter-spacing:2px;">${opts.tempPassword}</span>
                  </p>
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:4px 0 24px;">
                  <a href="https://m15-edutech.ci"
                     style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#1a3a5c,#0f2540);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
                    Accéder à la plateforme
                  </a>
                </td>
              </tr>
            </table>

            <!-- Warning -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#92400e;">
                    🔑 Ce mot de passe est <strong>temporaire</strong>. Il vous sera demandé de le modifier dès votre première connexion.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
              Pour des raisons de sécurité, ne partagez pas ces identifiants avec d'autres personnes.<br />
              Si vous n'êtes pas à l'origine de cette création de compte, contactez votre administrateur.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              © ${new Date().getFullYear()} M15 EduTech — ${opts.schoolName}<br />
              Cet email a été envoyé automatiquement, merci de ne pas y répondre.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await client.emails.send({
    from: `M15 EduTech <${fromEmail}>`,
    to: opts.to,
    subject: `Vos identifiants de connexion — ${opts.schoolName}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
  schoolName: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Réinitialisation de mot de passe</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a3a5c 0%,#0f2540 100%);border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:12px;">
              <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">M15 <span style="color:#22c55e;">EduTech</span></span>
            </div>
            <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.6);letter-spacing:2px;text-transform:uppercase;">Gestion Académique</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:40px 40px 32px;">
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f2540;">Réinitialisation de mot de passe</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Bonjour <strong>${opts.name}</strong>,</p>

            <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
              Vous avez demandé la réinitialisation de votre mot de passe pour votre compte
              sur la plateforme <strong>${opts.schoolName}</strong>.<br />
              Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
            </p>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="${opts.resetUrl}"
                     style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#1a3a5c,#0f2540);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
                    Réinitialiser mon mot de passe
                  </a>
                </td>
              </tr>
            </table>

            <!-- Expiry notice -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#92400e;">
                    ⏱ Ce lien est valable pendant <strong>1 heure</strong>. Passé ce délai, vous devrez faire une nouvelle demande.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">
              Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe reste inchangé.
            </p>
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Ou copiez ce lien dans votre navigateur :<br />
              <span style="color:#1a3a5c;word-break:break-all;">${opts.resetUrl}</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              © ${new Date().getFullYear()} M15 EduTech — ${opts.schoolName}<br />
              Cet email a été envoyé automatiquement, merci de ne pas y répondre.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await client.emails.send({
    from: `M15 EduTech <${fromEmail}>`,
    to: opts.to,
    subject: "Réinitialisation de votre mot de passe — M15 EduTech",
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }
}

export async function sendConvocationEmail(opts: {
  to: string;
  studentName: string;
  titre: string;
  dateSoutenance: string;
  heureDebut: string;
  salle: string;
  dureeMinutes: number;
  jury: Array<{ nom: string; role: string }>;
  schoolName: string;
  isJuryMember?: boolean;
  juryRole?: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();

  const dateFormatted = new Date(opts.dateSoutenance).toLocaleDateString("fr-FR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const roleLabels: Record<string, string> = {
    PRESIDENT: "Président du jury",
    RAPPORTEUR: "Rapporteur",
    EXAMINATEUR: "Examinateur",
  };

  const juryRows = opts.jury
    .map((j) => `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${j.nom || "—"}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${roleLabels[j.role] ?? j.role}</td>
    </tr>`)
    .join("");

  const subjectLine = opts.isJuryMember
    ? `Convocation — Jury de soutenance de ${opts.studentName}`
    : `Convocation à votre soutenance — ${opts.titre}`;

  const greeting = opts.isJuryMember
    ? `Vous êtes convoqué(e) en tant que <strong>${roleLabels[opts.juryRole ?? ""] ?? opts.juryRole}</strong> au jury de soutenance de <strong>${opts.studentName}</strong>.`
    : `Votre soutenance a été planifiée. Vous trouverez ci-dessous les informations officielles de convocation.`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1a3a5c 0%,#0f2540 100%);border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
            <span style="font-size:26px;font-weight:800;color:#fff;">M15 <span style="color:#22c55e;">EduTech</span></span>
            <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:2px;text-transform:uppercase;">Gestion Académique · ${opts.schoolName}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:40px 40px 32px;">
            <div style="display:inline-block;background:#eff6ff;border-radius:8px;padding:6px 14px;margin-bottom:18px;">
              <span style="font-size:12px;font-weight:700;color:#1d4ed8;letter-spacing:1px;text-transform:uppercase;">CONVOCATION OFFICIELLE</span>
            </div>
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f2540;">Soutenance de Mémoire</h2>
            <p style="margin:0 0 6px;font-size:14px;color:#374151;">Bonjour <strong>${opts.isJuryMember ? "" : opts.studentName}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">${greeting}</p>

            <!-- Titre -->
            <table width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:20px;">
              <tr><td style="padding:14px 18px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Titre du mémoire</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#0f2540;">${opts.titre}</p>
              </td></tr>
            </table>

            <!-- Infos pratiques -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td width="50%" style="padding:0 6px 0 0;vertical-align:top;">
                  <table width="100%" style="background:#ecfdf5;border:1px solid #d1fae5;border-radius:8px;">
                    <tr><td style="padding:14px 16px;">
                      <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;">Date</p>
                      <p style="margin:0;font-size:13px;font-weight:600;color:#064e3b;">${dateFormatted}</p>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">
                  <table width="100%" style="background:#eff6ff;border:1px solid #dbeafe;border-radius:8px;">
                    <tr><td style="padding:14px 16px;">
                      <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;">Heure</p>
                      <p style="margin:0;font-size:13px;font-weight:600;color:#1e3a8a;">${opts.heureDebut} · ${opts.dureeMinutes} min</p>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
            <table width="100%" style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;margin-bottom:20px;">
              <tr><td style="padding:12px 16px;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;">Salle</p>
                <p style="margin:0;font-size:13px;font-weight:600;color:#78350f;">${opts.salle}</p>
              </td></tr>
            </table>

            <!-- Composition du jury -->
            ${opts.jury.length > 0 ? `
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#374151;">Composition du jury</p>
            <table width="100%" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
              <thead><tr style="background:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Nom</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Rôle</th>
              </tr></thead>
              <tbody>${juryRows}</tbody>
            </table>` : ""}

            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Veuillez vous présenter 15 minutes avant l'heure de la soutenance. Cet email a été généré automatiquement par la plateforme M15 EduTech.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:16px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} M15 EduTech — ${opts.schoolName}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await client.emails.send({
    from: `M15 EduTech <${fromEmail}>`,
    to: opts.to,
    subject: subjectLine,
    html,
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

export async function sendMemoireSessionEmail(opts: {
  to: string;
  studentName: string;
  sessionTitle: string;
  dateCloture: string | Date;
  dateOuverture?: string | Date;
  schoolName: string;
  type: "ouverture" | "reouverture" | "rappel" | "J0";
  joursRestants?: number;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();

  const dateClotureFormatted = new Date(opts.dateCloture).toLocaleDateString("fr-FR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const dateOuvertureFormatted = opts.dateOuverture
    ? new Date(opts.dateOuverture).toLocaleDateString("fr-FR", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      })
    : null;

  const subjectMap: Record<string, string> = {
    ouverture:   `Ouverture de la période de dépôt de mémoire — ${opts.sessionTitle}`,
    reouverture: `🔄 Réouverture — Nouvelle date limite de dépôt de mémoire`,
    rappel:      `⏰ Rappel J-${opts.joursRestants} — Dépôt de mémoire : ${dateClotureFormatted}`,
    J0:          `📅 Dernier jour — Clôture de la période de dépôt de mémoire`,
  };

  const headlineMap: Record<string, string> = {
    ouverture:   "La période de soumission est maintenant ouverte",
    reouverture: "La période de soumission a été réouverte",
    rappel:      `Rappel : il vous reste ${opts.joursRestants} jour${(opts.joursRestants ?? 0) > 1 ? "s" : ""}`,
    J0:          "Clôture aujourd'hui — dernière chance",
  };

  const bodyMap: Record<string, string> = {
    ouverture:   `La période de dépôt de vos travaux de fin de cycle vient d'ouvrir. Rendez-vous sur la plateforme pour déposer votre mémoire avant la date limite.`,
    reouverture: `L'administration a réouvert la période de soumission avec une nouvelle date limite. Profitez-en pour déposer votre mémoire dès que possible.`,
    rappel:      `La date limite de soumission de votre mémoire approche. Il vous reste <strong>${opts.joursRestants} jour${(opts.joursRestants ?? 0) > 1 ? "s" : ""}</strong> pour déposer votre dossier. Ne tardez pas !`,
    J0:          `C'est le dernier jour pour déposer votre mémoire. La période de soumission se clôture <strong>aujourd'hui</strong>. Connectez-vous maintenant pour finaliser votre dépôt.`,
  };

  const accentColors: Record<string, string> = {
    ouverture:   "#22c55e",
    reouverture: "#3b82f6",
    rappel:      "#f59e0b",
    J0:          "#ef4444",
  };

  const accent = accentColors[opts.type] ?? "#1a3a5c";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1a3a5c 0%,#0f2540 100%);border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
            <span style="font-size:26px;font-weight:800;color:#fff;">M15 <span style="color:#22c55e;">EduTech</span></span>
            <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:2px;text-transform:uppercase;">Gestion Académique · ${opts.schoolName}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:40px 40px 32px;">
            <div style="display:inline-block;background:${accent}1a;border-radius:8px;padding:6px 14px;margin-bottom:18px;border:1px solid ${accent}33;">
              <span style="font-size:12px;font-weight:700;color:${accent};letter-spacing:1px;text-transform:uppercase;">${headlineMap[opts.type]}</span>
            </div>
            <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f2540;">Dépôt de Mémoire — ${opts.sessionTitle}</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#374151;">Bonjour <strong>${opts.studentName}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.8;">${bodyMap[opts.type]}</p>

            <!-- Date limite -->
            <table width="100%" style="background:#fef9ec;border:1px solid #fde68a;border-radius:10px;margin-bottom:20px;">
              <tr><td style="padding:16px 20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;">📅 Date limite de soumission</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#78350f;">${dateClotureFormatted}</p>
              </td></tr>
            </table>

            ${dateOuvertureFormatted ? `
            <table width="100%" style="background:#ecfdf5;border:1px solid #d1fae5;border-radius:10px;margin-bottom:20px;">
              <tr><td style="padding:14px 20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;">🗓 Date d'ouverture</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#064e3b;">${dateOuvertureFormatted}</p>
              </td></tr>
            </table>
            ` : ""}

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 24px;">
                  <a href="https://www.m15-edutech.ci/student/memoires"
                     style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#1a3a5c,#0f2540);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">
                    Déposer mon mémoire →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Cet email a été envoyé automatiquement. Si vous avez déjà soumis votre dossier, ignorez ce message.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:16px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} M15 EduTech — ${opts.schoolName}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await client.emails.send({
    from: `M15 EduTech <${fromEmail}>`,
    to: opts.to,
    subject: subjectMap[opts.type] ?? `Période de soumission — ${opts.sessionTitle}`,
    html,
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

export async function sendDiplomaEmail(opts: {
  studentName: string;
  studentEmail: string;
  className: string;
  academicYear: string;
  mention: string;
  average?: number;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1a3a5c 0%,#0f2540 100%);border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
            <span style="font-size:26px;font-weight:800;color:#fff;">M15 <span style="color:#f59e0b;">EduTech</span></span>
            <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:2px;text-transform:uppercase;">Gestion Académique</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:40px 40px 32px;text-align:center;">
            <div style="font-size:64px;margin-bottom:16px;">&#127891;</div>
            <div style="display:inline-block;background:#fef9ec;border-radius:8px;padding:6px 18px;margin-bottom:20px;border:1px solid #fde68a;">
              <span style="font-size:12px;font-weight:700;color:#92400e;letter-spacing:1px;text-transform:uppercase;">Diplôme obtenu</span>
            </div>
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f2540;">Félicitations, ${opts.studentName}&nbsp;!</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.8;">
              Vous avez officiellement validé votre <strong style="color:#0f2540;">${opts.className}</strong>
              pour l'année académique <strong>${opts.academicYear}</strong>.
            </p>
            <table width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <table width="100%">
                  <tr>
                    <td style="text-align:left;">
                      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;">Mention</p>
                      <p style="margin:0;font-size:18px;font-weight:800;color:#15803d;">${opts.mention}</p>
                    </td>
                    ${opts.average != null ? `<td style="text-align:right;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;">Moyenne générale</p><p style="margin:0;font-size:18px;font-weight:800;color:#15803d;">${opts.average.toFixed(2)} / 20</p></td>` : ""}
                  </tr>
                </table>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.8;">
              Vos documents officiels (attestation de diplôme avec QR code de vérification, relevé de notes complet)
              sont disponibles dans votre <strong>Espace Diplômé</strong> sur la plateforme.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 24px;">
                  <a href="https://www.m15-edutech.ci/student/espace-diplome"
                     style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">
                    Accéder à mon Espace Diplômé →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;color:#9ca3af;">Toute l'équipe M15 EduTech vous souhaite une excellente continuation.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:16px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} M15 EduTech</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await client.emails.send({
    from: `M15 EduTech <${fromEmail}>`,
    to: opts.studentEmail,
    subject: `Félicitations — Vous avez obtenu votre ${opts.className} !`,
    html,
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}
