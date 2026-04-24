import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, GraduationCap, Calendar, CreditCard, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function getApiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

export default function VerifyCard() {
  const params = useParams<{ hash: string }>();
  const hash = params.hash;

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/verify", hash],
    queryFn: () =>
      fetch(`${getApiBase()}/api/verify/${hash}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!hash,
    retry: false,
  });

  const isValid = data?.valid;
  const status = data?.status;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-xl tracking-tight">CPEC-Digital</div>
          <div className="text-blue-300/80 text-xs font-semibold tracking-wider">VÉRIFICATION DE CARTE ÉTUDIANTE</div>
        </div>
      </div>

      {/* Result Card */}
      <div className="w-full max-w-md">
        {isLoading && (
          <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
              <p className="text-white/60 text-sm">Vérification en cours…</p>
            </CardContent>
          </Card>
        )}

        {isError && (
          <Card className="border-red-500/30 bg-red-500/10 backdrop-blur-xl">
            <CardContent className="py-8 text-center space-y-3">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
              <p className="text-white font-semibold">Erreur de vérification</p>
              <p className="text-white/60 text-sm">Impossible de contacter le serveur. Réessayez.</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <Card className={`backdrop-blur-xl border ${isValid ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            <CardContent className="py-8 space-y-6">
              {/* Status icon */}
              <div className="flex flex-col items-center gap-3">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isValid ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                  {isValid
                    ? <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    : status === "expirée"
                    ? <Clock className="w-10 h-10 text-orange-400" />
                    : <XCircle className="w-10 h-10 text-red-400" />}
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-black ${isValid ? "text-emerald-400" : status === "expirée" ? "text-orange-400" : "text-red-400"}`}>
                    {isValid ? "CARTE VALIDE" : status === "expirée" ? "CARTE EXPIRÉE" : "CARTE INVALIDE"}
                  </div>
                  {data.reason && (
                    <p className="text-white/50 text-xs mt-1">{data.reason}</p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/10" />

              {/* Student info */}
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-4 h-4 text-white/70" />
                  </div>
                  <div>
                    <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Étudiant</div>
                    <div className="text-white font-bold text-sm">{data.studentName}</div>
                  </div>
                </div>

                {data.matricule && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4 text-white/70" />
                    </div>
                    <div>
                      <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Matricule</div>
                      <div className="text-white font-semibold text-sm">{data.matricule}</div>
                    </div>
                  </div>
                )}

                {data.className && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-4 h-4 text-white/70" />
                    </div>
                    <div>
                      <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Classe</div>
                      <div className="text-white font-semibold text-sm">
                        {data.className}{data.filiere ? ` — ${data.filiere}` : ""}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-white/70" />
                  </div>
                  <div>
                    <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Année académique</div>
                    <div className="text-white font-semibold text-sm">{data.academicYear}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-white/5 rounded-lg p-2.5">
                    <div className="text-white/40 text-[9px] font-bold uppercase tracking-wider">Délivrée</div>
                    <div className="text-white/80 text-xs font-semibold mt-0.5">
                      {data.issuedAt ? new Date(data.issuedAt).toLocaleDateString("fr-FR") : "—"}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5">
                    <div className="text-white/40 text-[9px] font-bold uppercase tracking-wider">Expire</div>
                    <div className={`text-xs font-semibold mt-0.5 ${!isValid ? "text-red-400" : "text-white/80"}`}>
                      {data.expiresAt ? new Date(data.expiresAt).toLocaleDateString("fr-FR") : "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer note */}
              <div className="border-t border-white/10 pt-4">
                <p className="text-white/30 text-[10px] text-center leading-relaxed">
                  Vérification officielle CPEC-Digital — INP-HB<br />
                  Cette page confirme l'authenticité de la carte étudiante.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!hash && (
          <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
              <p className="text-white font-semibold">Hash de vérification manquant</p>
              <p className="text-white/40 text-sm mt-1">Scannez le QR code sur la carte étudiante.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom branding */}
      <p className="text-white/20 text-xs mt-8 text-center">
        © CPEC-Digital — Système de gestion académique INP-HB
      </p>
    </div>
  );
}
