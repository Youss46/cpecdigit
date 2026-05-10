import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, XCircle, Loader2, Award, GraduationCap, Shield } from "lucide-react";
import { CpecLogo } from "@/components/cpec-logo";

export default function VerifyDiploma() {
  const [, params] = useRoute("/verify/diploma/:token");
  const token = params?.token ?? "";

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`/api/public/verify-diploma/${token}`)
      .then((r) => r.json())
      .then((d) => { setResult(d); setLoading(false); })
      .catch(() => { setResult({ valid: false, reason: "Erreur de connexion. Veuillez réessayer." }); setLoading(false); });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f4f8] to-[#e8eef5] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CpecLogo variant="icon" size={36} />
            <span className="text-xl font-bold font-serif text-[#0f2540]">M15 <span className="text-amber-500">EduTech</span></span>
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Vérification d'Attestation de Diplôme</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-border overflow-hidden">
          {/* Top accent */}
          <div className="h-1.5 bg-gradient-to-r from-[#0f2540] via-amber-400 to-[#0f2540]" />

          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Vérification en cours…</p>
              </div>
            ) : result?.valid ? (
              <div className="space-y-5">
                {/* Success badge */}
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-emerald-700">Attestation Valide</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Document authentifié par {result.institution}</p>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Details */}
                <div className="space-y-3">
                  <InfoRow icon={<GraduationCap className="w-4 h-4" />} label="Titulaire" value={result.studentName} />
                  <InfoRow icon={<Award className="w-4 h-4" />} label="Diplôme" value={result.className} />
                  <InfoRow icon={<Shield className="w-4 h-4" />} label="Mention" value={result.mention} highlight />
                  {result.average && (
                    <InfoRow label="Moyenne générale" value={`${parseFloat(result.average).toFixed(2)} / 20`} />
                  )}
                  <InfoRow label="Année académique" value={result.academicYear} />
                  <InfoRow label="Établissement" value={result.institution} />
                  <InfoRow label="Délivré le" value={new Date(result.issuedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 border-2 border-red-200 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
                <div>
                  <p className="text-base font-bold text-red-700">Attestation Non Valide</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    {result?.reason ?? "Cette attestation n'a pas pu être vérifiée."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-muted/30 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              Vérification effectuée le {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              {" "}à {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Plateforme officielle M15 EduTech — Toute falsification est passible de poursuites.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, highlight }: { icon?: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <span className={`text-sm font-semibold text-right ${highlight ? "text-amber-700" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
