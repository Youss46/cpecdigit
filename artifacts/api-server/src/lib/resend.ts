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
              © ${new Date().getFullYear()} M15 EduTech<br />
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
