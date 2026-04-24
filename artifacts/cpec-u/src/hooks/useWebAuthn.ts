import { useState, useCallback } from "react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

export { browserSupportsWebAuthn };

// LocalStorage key for tracking registered credential IDs on this device
const LS_KEY = "cpec_webauthn_emails";

export function getWebAuthnEmails(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function addWebAuthnEmail(email: string) {
  const emails = getWebAuthnEmails();
  if (!emails.includes(email)) {
    localStorage.setItem(LS_KEY, JSON.stringify([...emails, email]));
  }
}
export function removeWebAuthnEmail(email: string) {
  const emails = getWebAuthnEmails().filter(e => e !== email);
  localStorage.setItem(LS_KEY, JSON.stringify(emails));
}
export function hasWebAuthnForEmail(email: string): boolean {
  return getWebAuthnEmails().includes(email);
}

export type WebAuthnErrorKind =
  | "cancelled"      // NotAllowedError — user dismissed the dialog
  | "already_exists" // InvalidStateError — credential already registered
  | "unsupported"    // NotSupportedError
  | "security"       // SecurityError (non-HTTPS, bad rpId, …)
  | "server"         // API returned an error
  | "unknown";

function classifyError(err: any): { kind: WebAuthnErrorKind; message: string } {
  switch (err?.name) {
    case "NotAllowedError":
      return {
        kind: "cancelled",
        message: "Scan annulé — appuyez sur Activer et complétez le scan biométrique.",
      };
    case "InvalidStateError":
      return {
        kind: "already_exists",
        message: "La biométrie est déjà enregistrée sur cet appareil.",
      };
    case "NotSupportedError":
      return {
        kind: "unsupported",
        message: "La biométrie n'est pas supportée sur ce navigateur.",
      };
    case "SecurityError":
      return {
        kind: "security",
        message: "Connexion sécurisée (HTTPS) requise pour activer la biométrie.",
      };
    default:
      return {
        kind: "unknown",
        message: err?.message ?? "Erreur inattendue lors de l'activation biométrique.",
      };
  }
}

// ── Registration ─────────────────────────────────────────────────────────────
export function useWebAuthnRegister() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<WebAuthnErrorKind | null>(null);

  const register = useCallback(async (deviceName?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setErrorKind(null);
    try {
      // 1. Get challenge from server
      const optRes = await fetch("/api/auth/webauthn/register/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!optRes.ok) {
        const err = await optRes.json();
        const msg = err.error ?? "Erreur lors de l'initialisation";
        setError(msg);
        setErrorKind("server");
        return false;
      }
      const options = await optRes.json();

      // 2. Ask browser/device to create credential (triggers Face ID / Touch ID prompt)
      const credential = await startRegistration({ optionsJSON: options });

      // 3. Verify with server and store
      const verifyRes = await fetch("/api/auth/webauthn/register/finish", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: credential, deviceName }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        const msg = err.error ?? "Vérification échouée côté serveur";
        setError(msg);
        setErrorKind("server");
        return false;
      }
      return true;
    } catch (err: any) {
      const classified = classifyError(err);
      setError(classified.message);
      setErrorKind(classified.kind);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { register, loading, error, errorKind, setError, setErrorKind };
}

// ── Authentication ───────────────────────────────────────────────────────────
export function useWebAuthnAuthenticate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<WebAuthnErrorKind | null>(null);

  const authenticate = useCallback(async (email: string): Promise<any | null> => {
    setLoading(true);
    setError(null);
    setErrorKind(null);
    try {
      // 1. Get challenge from server
      const optRes = await fetch("/api/auth/webauthn/authenticate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!optRes.ok) {
        const err = await optRes.json();
        setError(err.error ?? "Aucun identifiant biométrique trouvé");
        setErrorKind("server");
        return null;
      }
      const options = await optRes.json();

      // 2. Trigger biometric scan
      const assertion = await startAuthentication({ optionsJSON: options });

      // 3. Verify with server → get session
      const verifyRes = await fetch("/api/auth/webauthn/authenticate/finish", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, body: assertion }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        setError(err.error ?? "Authentification biométrique échouée");
        setErrorKind("server");
        return null;
      }
      return await verifyRes.json();
    } catch (err: any) {
      const classified = classifyError(err);
      setError(classified.message);
      setErrorKind(classified.kind);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { authenticate, loading, error, errorKind, setError, setErrorKind };
}
