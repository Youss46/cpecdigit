import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  GraduationCap, Award, FileText, Download, ExternalLink,
  CreditCard, BookOpen, CheckCircle2, Shield, Star, ArrowRight, Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import { useEffect, useRef } from "react";

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function getMentionColor(mention: string) {
  if (mention === "Très Bien") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (mention === "Bien") return "bg-blue-100 text-blue-800 border-blue-200";
  if (mention === "Assez Bien") return "bg-violet-100 text-violet-800 border-violet-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

function QRCodeCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, { width: 120, margin: 1, color: { dark: "#0f2540", light: "#ffffff" } });
    }
  }, [value]);
  return <canvas ref={ref} className="rounded-lg border border-border" />;
}

export default function EspaceDiplomePage() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/student/diploma"],
    queryFn: () => apiFetch("/student/diploma"),
  });

  const { data: continuation } = useQuery<{ available: boolean; classes: any[] }>({
    queryKey: ["/api/student/diploma/continuation"],
    queryFn: () => apiFetch("/student/diploma/continuation"),
    enabled: data?.status === "diplome",
    staleTime: 120_000,
  });

  const verifyUrl = data?.attestation?.token
    ? `${window.location.origin}/verify/diploma/${data.attestation.token}`
    : null;

  if (isLoading) {
    return (
      <AppLayout allowedRoles={["student"]}>
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!data || data.status !== "diplome") {
    return (
      <AppLayout allowedRoles={["student"]}>
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <GraduationCap className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Espace Diplômé non disponible</h2>
          <p className="text-muted-foreground text-sm">
            Cet espace sera accessible une fois votre diplôme validé par l'administration.
          </p>
        </div>
      </AppLayout>
    );
  }

  const { attestation, bulletins, studentName, className } = data;

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-6">

        {/* Header banner */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2540] to-[#1a3a5c] text-white p-6 md:p-8"
        >
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="absolute rounded-full border border-white/20"
                style={{ width: `${60 + i * 40}px`, height: `${60 + i * 40}px`, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
            ))}
          </div>
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-8 h-8 text-amber-300" />
            </div>
            <div>
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-1">Espace Diplômé</p>
              <h1 className="text-2xl font-bold font-serif">{studentName}</h1>
              <p className="text-white/70 text-sm mt-0.5">{className}</p>
            </div>
          </div>
          {attestation && (
            <div className="relative mt-4 flex items-center gap-3 flex-wrap">
              <Badge className={`${getMentionColor(attestation.mention)} text-xs font-bold px-3 py-1 rounded-full border`}>
                <Star className="w-3 h-3 mr-1" />
                {attestation.mention}
              </Badge>
              {attestation.average && (
                <span className="text-white/60 text-sm">Moyenne générale : <strong className="text-white">{parseFloat(attestation.average).toFixed(2)} / 20</strong></span>
              )}
              <span className="text-white/60 text-sm">Année : <strong className="text-white">{attestation.academic_year}</strong></span>
            </div>
          )}
        </motion.div>

        {/* Attestation de diplôme */}
        {attestation && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0">
                    <Award className="w-5 h-5 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base mb-0.5">Attestation de Réussite</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Document officiel avec QR code de vérification authentifié. Valable partout.
                    </p>
                    <div className="flex items-start gap-6 flex-wrap">
                      {verifyUrl && <QRCodeCanvas value={verifyUrl} />}
                      <div className="flex-1 space-y-3 min-w-0">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Diplôme</p>
                            <p className="font-semibold truncate">{attestation.class_name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Année</p>
                            <p className="font-semibold">{attestation.academic_year}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Mention</p>
                            <p className="font-semibold">{attestation.mention}</p>
                          </div>
                          {attestation.average && (
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Moyenne</p>
                              <p className="font-semibold">{parseFloat(attestation.average).toFixed(2)} / 20</p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <p className="text-xs text-emerald-700 font-medium">Attestation vérifiable publiquement via QR code</p>
                        </div>
                        {verifyUrl && (
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => window.open(verifyUrl, "_blank")}>
                            <Shield className="w-3.5 h-3.5" />
                            Vérifier l'attestation
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Bulletins semestriels */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Mes Bulletins Semestriels</h3>
                  <p className="text-xs text-muted-foreground">{bulletins?.length ?? 0} bulletin{(bulletins?.length ?? 0) !== 1 ? "s" : ""} archivé{(bulletins?.length ?? 0) !== 1 ? "s" : ""}</p>
                </div>
              </div>
              {(!bulletins || bulletins.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun bulletin disponible.</p>
              ) : (
                <div className="space-y-2">
                  {(bulletins as any[]).map((b: any) => (
                    <div key={b.semester_id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{b.semester_name}</p>
                          <p className="text-xs text-muted-foreground">{b.academic_year}</p>
                        </div>
                      </div>
                      <Button
                        size="sm" variant="ghost"
                        className="gap-1.5 text-xs flex-shrink-0"
                        onClick={() => window.open(`/api/student/diploma/bulletin/${b.semester_id}`, "_blank")}
                      >
                        <Download className="w-3.5 h-3.5" />
                        Voir
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Poursuivre en Master */}
        {continuation?.available && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5">
              <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
                <Sparkles className="w-32 h-32 -translate-y-6 translate-x-6" />
              </div>
              <div className="relative flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
                    <ArrowRight className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">Poursuite d'études</p>
                    <h3 className="text-base font-bold">Poursuivre en Master</h3>
                    <p className="text-white/80 text-xs mt-0.5">
                      Des formations Master sont disponibles dans votre établissement.
                      Contactez la scolarité pour procéder à votre inscription.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {(continuation.classes as any[]).slice(0, 3).map((c: any) => (
                    <span key={c.id} className="text-xs font-semibold bg-white/20 border border-white/30 px-2.5 py-1 rounded-full text-white">
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Carte étudiante archivée */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-violet-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Carte Étudiante Archivée</h3>
                    <p className="text-xs text-muted-foreground">Accès permanent à votre carte avec QR code</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => window.open("/student/card", "_blank")}>
                  <CreditCard className="w-3.5 h-3.5" />
                  Voir ma carte
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Info bloc lecture seule */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Accès en lecture seule.</strong> En tant que diplômé(e), vous avez un accès permanent à vos documents.
              Les soumissions de notes, réclamations et évaluations ne sont plus disponibles.
            </p>
          </div>
        </motion.div>

      </div>
    </AppLayout>
  );
}
