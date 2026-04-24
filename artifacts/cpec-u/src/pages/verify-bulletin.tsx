import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, GraduationCap, Calendar, CreditCard,
  AlertTriangle, BookOpen, TrendingUp, Award, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function getApiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function fmt(v: number | null | undefined, dec = 2): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(dec);
}

interface VerifyData {
  valid: boolean;
  reason?: string;
  studentName?: string;
  matricule?: string;
  className?: string;
  filiere?: string;
  academicYear?: string;
  semesterName?: string;
  average?: number | null;
  averageNette?: number | null;
  decision?: string;
  deliveredAt?: string;
}

export default function VerifyBulletin() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data, isLoading, isError } = useQuery<VerifyData>({
    queryKey: ["/api/verify/bulletin", token],
    queryFn: () =>
      fetch(`${getApiBase()}/api/verify/bulletin/${token}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  const isValid = data?.valid;

  const decisionColor =
    data?.decision === "Admis"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
      : data?.decision === "Ajourné"
      ? "bg-red-500/20 text-red-400 border-red-500/40"
      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4">

      {/* Logo / Branding */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-xl tracking-tight">CPEC-Digital</div>
          <div className="text-blue-300/80 text-xs font-semibold tracking-wider">VÉRIFICATION DE BULLETIN DE NOTES</div>
        </div>
      </div>

      <div className="w-full max-w-md space-y-4">

        {/* Loading */}
        {isLoading && (
          <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
              <p className="text-white/60 text-sm">Vérification en cours…</p>
            </CardContent>
          </Card>
        )}

        {/* Network error */}
        {isError && (
          <Card className="border-red-500/30 bg-red-500/10 backdrop-blur-xl">
            <CardContent className="py-8 text-center space-y-3">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
              <p className="text-white font-semibold">Erreur de connexion</p>
              <p className="text-white/60 text-sm">Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.</p>
            </CardContent>
          </Card>
        )}

        {/* No token */}
        {!token && (
          <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
              <p className="text-white font-semibold">Token de vérification manquant</p>
              <p className="text-white/40 text-sm mt-1">Scannez le QR code sur le bulletin de notes.</p>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {data && (
          <Card className={`backdrop-blur-xl border ${isValid ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            <CardContent className="py-8 space-y-6">

              {/* Status badge */}
              <div className="flex flex-col items-center gap-3">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isValid ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                  {isValid
                    ? <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    : <XCircle className="w-10 h-10 text-red-400" />}
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-black ${isValid ? "text-emerald-400" : "text-red-400"}`}>
                    {isValid ? "BULLETIN AUTHENTIQUE" : "BULLETIN INVALIDE"}
                  </div>
                  {isValid && (
                    <p className="text-emerald-300/70 text-xs mt-1">Ce bulletin est authentique et valide</p>
                  )}
                  {!isValid && data.reason && (
                    <p className="text-red-300/70 text-xs mt-2 max-w-xs mx-auto leading-relaxed">{data.reason}</p>
                  )}
                </div>
              </div>

              {/* Details — only when valid */}
              {isValid && (
                <>
                  <div className="border-t border-white/10" />

                  <div className="space-y-3">

                    {/* Student name */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                        <GraduationCap className="w-4 h-4 text-white/70" />
                      </div>
                      <div>
                        <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Étudiant(e)</div>
                        <div className="text-white font-bold text-sm">{data.studentName}</div>
                      </div>
                    </div>

                    {/* Matricule */}
                    {data.matricule && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <CreditCard className="w-4 h-4 text-white/70" />
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Matricule</div>
                          <div className="text-white font-semibold text-sm font-mono">{data.matricule}</div>
                        </div>
                      </div>
                    )}

                    {/* Classe / Filière */}
                    {data.className && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <BookOpen className="w-4 h-4 text-white/70" />
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Classe / Filière</div>
                          <div className="text-white font-semibold text-sm">
                            {data.className}{data.filiere ? ` — ${data.filiere}` : ""}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Année académique + Semestre */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4 text-white/70" />
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Année</div>
                          <div className="text-white font-semibold text-xs">{data.academicYear}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4 text-white/70" />
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Semestre</div>
                          <div className="text-white font-semibold text-xs">{data.semesterName}</div>
                        </div>
                      </div>
                    </div>

                    {/* Moyennes */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp className="w-3 h-3 text-white/40" />
                          <div className="text-white/40 text-[9px] font-bold uppercase tracking-wider">Moyenne brute</div>
                        </div>
                        <div className="text-white font-mono font-bold text-lg">{fmt(data.average)}</div>
                        <div className="text-white/30 text-[9px]">sur 20</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp className="w-3 h-3 text-blue-400/60" />
                          <div className="text-white/40 text-[9px] font-bold uppercase tracking-wider">Moyenne nette</div>
                        </div>
                        <div className="text-blue-300 font-mono font-bold text-lg">{fmt(data.averageNette)}</div>
                        <div className="text-white/30 text-[9px]">après abs.</div>
                      </div>
                    </div>

                    {/* Mention / Décision */}
                    {data.decision && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                            <Award className="w-4 h-4 text-white/70" />
                          </div>
                          <div>
                            <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Mention</div>
                          </div>
                        </div>
                        <Badge className={`font-bold text-xs border ${decisionColor}`}>
                          {data.decision}
                        </Badge>
                      </div>
                    )}

                    {/* Date de délivrance */}
                    {data.deliveredAt && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4 text-white/70" />
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Date de délivrance</div>
                          <div className="text-white font-semibold text-sm">
                            {new Date(data.deliveredAt).toLocaleDateString("fr-FR", {
                              day: "2-digit", month: "long", year: "numeric",
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Footer note */}
              <div className="border-t border-white/10 pt-4">
                <p className="text-white/30 text-[10px] text-center leading-relaxed">
                  Vérification officielle CPEC-Digital — INP-HB<br />
                  Cette page confirme l'authenticité du bulletin de notes.
                </p>
              </div>
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
