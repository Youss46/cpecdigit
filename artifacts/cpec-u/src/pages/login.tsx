import { useState, useEffect } from "react";
import { CpecLogo } from "@/components/cpec-logo";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Phone, HelpCircle, Eye, EyeOff, Fingerprint, Loader2, ChevronDown } from "lucide-react";
import {
  useWebAuthnAuthenticate,
  hasWebAuthnForEmail,
  getWebAuthnEmails,
  browserSupportsWebAuthn,
} from "@/hooks/useWebAuthn";
import { WebAuthnRegisterPrompt } from "@/components/webauthn-register-prompt";

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

type LoginForm = z.infer<typeof loginSchema>;

const SLIDES = [
  { src: "images/login-bg.jpg", alt: "Étudiants M15 EduTech", quote: "L'Excellence Académique au Quotidien." },
  { src: "images/student-1.jpg", alt: "Étudiante M15 EduTech", quote: "M15 EduTech : La gestion académique à l'ère du numérique." },
  { src: "images/student-2.jpg", alt: "Étudiant M15 EduTech", quote: "Plus qu'une plateforme, un accélérateur de compétences." },
  { src: "images/student-3.jpg", alt: "Étudiante M15 EduTech", quote: "La connaissance, une science au service de l'avenir." },
  { src: "images/group-1.jpg", alt: "Promotion M15 EduTech", quote: "L'excellence académique commence avec M15 EduTech." },
  { src: "images/group-2.jpg", alt: "Promotion M15 EduTech", quote: "Maîtriser les données, piloter l'avenir." },
];

const SLIDE_DURATION = 4000;

function getRedirectPath(user: any): string {
  if (user.mustChangePassword) return "/change-password";
  if (user.role === "admin") {
    if (user.adminSubRole === "hebergement") return "/admin/housing";
    return "/admin";
  }
  if (user.role === "teacher") return "/teacher";
  if (user.role === "parent") return "/parent";
  return "/student";
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [welcomeUser, setWelcomeUser] = useState<{ name: string; initial: string; subRole: string } | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // WebAuthn state
  const { authenticate, loading: biometricLoading, error: biometricError, setError: setBiometricError } = useWebAuthnAuthenticate();
  const [showBiometricBtn, setShowBiometricBtn] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [pendingUser, setPendingUser] = useState<{ email: string; name: string } | null>(null);
  const [pendingRedirectFn, setPendingRedirectFn] = useState<(() => void) | null>(null);

  // Emails registered with biometrics on this device
  const [deviceBiometricEmails] = useState<string[]>(() =>
    browserSupportsWebAuthn() ? getWebAuthnEmails() : []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, SLIDE_DURATION);
    return () => clearInterval(interval);
  }, []);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const emailValue = watch("email") ?? "";

  // Pre-fill email and show biometric button on mount if only one email registered
  useEffect(() => {
    if (deviceBiometricEmails.length === 1) {
      setValue("email", deviceBiometricEmails[0], { shouldValidate: true });
    }
    if (deviceBiometricEmails.length > 0) {
      setShowBiometricBtn(true);
      setShowPasswordForm(false);
    } else {
      setShowPasswordForm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show biometric button when email has a registered passkey on this device
  useEffect(() => {
    const trimmed = emailValue.trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (isValidEmail && browserSupportsWebAuthn() && hasWebAuthnForEmail(trimmed)) {
      setShowBiometricBtn(true);
      setShowPasswordForm(false);
    } else if (deviceBiometricEmails.length > 0 && !isValidEmail) {
      // Device has biometric accounts but user cleared/changed email — keep button visible
      setShowBiometricBtn(true);
      setShowPasswordForm(false);
    } else if (!hasWebAuthnForEmail(trimmed)) {
      setShowBiometricBtn(false);
      setShowPasswordForm(true);
    }
    setBiometricError(null);
  }, [emailValue, setBiometricError, deviceBiometricEmails]);

  // Ensure password form is always shown if no biometric
  useEffect(() => {
    if (!showBiometricBtn) setShowPasswordForm(true);
  }, [showBiometricBtn]);

  const buildRedirect = (user: any) => () => {
    const subRole = user.adminSubRole;
    if (subRole === "directeur") {
      setWelcomeUser({ name: user.name, initial: user.name.charAt(0), subRole: "directeur" });
      setTimeout(() => setLocation(getRedirectPath(user)), 3000);
    } else if (subRole === "scolarite" || subRole === "planificateur" || subRole === "hebergement") {
      setWelcomeUser({ name: user.name, initial: user.name.charAt(0), subRole });
      setTimeout(() => setLocation(getRedirectPath(user)), 2500);
    } else {
      toast({ title: "Connexion réussie", description: `Bienvenue ${user.name}` });
      setLocation(getRedirectPath(user));
    }
  };

  const handleAfterLogin = (user: any) => {
    // Pre-populate the current-user cache so AppLayout finds it instantly without a refetch.
    // This prevents the race condition on PC where queryClient.clear() + redirect causes
    // AppLayout to briefly see isError=true and redirect back to login.
    queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
    // Invalidate everything else (stale lists, counts, etc.) without blocking the redirect
    queryClient.invalidateQueries();
    const doRedirect = buildRedirect(user);

    // If browser supports WebAuthn and no passkey is registered yet for this email on this device, prompt
    if (
      browserSupportsWebAuthn() &&
      !hasWebAuthnForEmail(user.email)
    ) {
      setPendingUser({ email: user.email, name: user.name });
      setPendingRedirectFn(() => doRedirect);
      setShowRegisterPrompt(true);
    } else {
      doRedirect();
    }
  };

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        handleAfterLogin(data.user as any);
      },
      onError: (err: any) => {
        const apiData = err?.data ?? err?.response?.data;
        const errorCode = apiData?.error;
        const serverMessage = apiData?.message;
        const isDisabled = errorCode === "AccountDisabled";
        const isLocked = errorCode === "TooManyAttempts";
        toast({
          title: isDisabled ? "Accès refusé" : isLocked ? "Compte bloqué" : "Erreur de connexion",
          description: isDisabled
            ? "Votre compte a été désactivé. Veuillez contacter le développeur."
            : serverMessage ?? "Identifiants incorrects. Veuillez réessayer.",
          variant: "destructive",
        });
      },
    },
  });

  const handleBiometricLogin = async () => {
    // Use typed email if valid, otherwise fall back to the single registered email on this device
    const typedEmail = emailValue.trim();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedEmail);
    const email = isValid ? typedEmail : (deviceBiometricEmails.length === 1 ? deviceBiometricEmails[0] : typedEmail);

    if (!email) {
      setBiometricError("Saisissez votre adresse email pour continuer.");
      return;
    }
    // Pre-fill the email field for visibility if we're auto-using it
    if (!isValid && deviceBiometricEmails.length === 1) {
      setValue("email", email, { shouldValidate: false });
    }

    setBiometricError(null);
    const result = await authenticate(email);
    if (result?.user) {
      handleAfterLogin(result.user);
    }
    // On failure, biometricError is set by the hook — user can switch to password
  };

  const handleRegisterPromptDone = () => {
    setShowRegisterPrompt(false);
    setPendingUser(null);
    if (pendingRedirectFn) {
      pendingRedirectFn();
      setPendingRedirectFn(null);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="hidden lg:flex flex-1 relative bg-sidebar overflow-hidden">
        <AnimatePresence mode="sync">
          <motion.img
            key={currentSlide}
            src={`${import.meta.env.BASE_URL}${SLIDES[currentSlide].src}`}
            alt={SLIDES[currentSlide].alt}
            className="absolute inset-0 w-full h-full object-cover object-center"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/60 to-sidebar/20 z-20" />

        <motion.div
          className="absolute top-10 left-10 z-30"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <CpecLogo variant="icon" size={80} />
        </motion.div>

        <div className="absolute bottom-16 left-16 z-30 max-w-xl text-sidebar-foreground">
          <AnimatePresence mode="wait">
            <motion.h1
              key={currentSlide}
              className="text-5xl font-serif font-bold leading-tight mb-4 text-white"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              {SLIDES[currentSlide].quote}
            </motion.h1>
          </AnimatePresence>
          <p className="text-lg text-sidebar-foreground/80">
            Système de gestion académique intégré pour l'administration, les enseignants et les étudiants.
          </p>

          <div className="flex gap-2 mt-6">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === currentSlide ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-xl">
            <CardHeader className="space-y-4 pb-8">
              <div className="lg:hidden flex justify-center mb-4">
                <CpecLogo variant="icon" size={80} />
              </div>
              <CardTitle className="text-3xl font-serif text-center">Connexion</CardTitle>
              <CardDescription className="text-center text-base">
                Accédez à votre espace sécurisé M15 EduTech
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit((data) => loginMutation.mutate({ data }))} className="space-y-6">
                {/* Email field — always visible */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground/80 font-semibold">Adresse Email</Label>
                  <Input
                    id="email"
                    placeholder="prenom.nom@inphb.ci"
                    {...register("email")}
                    className="h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20"
                  />
                  {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
                </div>

                {/* Biometric login — shown when passkey exists on this device */}
                <AnimatePresence>
                  {showBiometricBtn && !showPasswordForm && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-3"
                    >
                      <Button
                        type="button"
                        onClick={handleBiometricLogin}
                        disabled={biometricLoading}
                        className="w-full h-14 text-base font-semibold gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all"
                      >
                        {biometricLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Authentification…
                          </>
                        ) : (
                          <>
                            <Fingerprint className="w-5 h-5" />
                            Se connecter avec la biométrie
                          </>
                        )}
                      </Button>

                      {/* Show which account will be used */}
                      {deviceBiometricEmails.length === 1 && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue.trim())) && (
                        <p className="text-xs text-center text-muted-foreground">
                          Compte : <span className="font-medium text-foreground">{deviceBiometricEmails[0]}</span>
                        </p>
                      )}

                      {biometricError && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-sm text-destructive text-center"
                        >
                          {biometricError}
                        </motion.p>
                      )}

                      <button
                        type="button"
                        onClick={() => { setShowPasswordForm(true); setBiometricError(null); }}
                        className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        <ChevronDown className="w-4 h-4" />
                        Utiliser le mot de passe
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Password form — shown when no biometric, or user chose to use password */}
                <AnimatePresence>
                  {showPasswordForm && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      {/* Biometric fallback header when biometric exists but user chose password */}
                      {showBiometricBtn && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="flex-1 h-px bg-border" />
                          <span>ou avec mot de passe</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-foreground/80 font-semibold">Mot de passe</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            {...register("password")}
                            className="h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 pr-12"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                            tabIndex={-1}
                            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                        {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-12 text-lg font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? "Connexion en cours..." : "Se connecter"}
                      </Button>

                      <p className="text-center text-sm text-muted-foreground pt-1">
                        Mot de passe oublié ?{" "}
                        <span
                          className="text-primary underline underline-offset-2 cursor-pointer hover:text-primary/80 transition-colors"
                          onClick={() => setContactDialogOpen(true)}
                        >
                          Contacter l'administration
                        </span>
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* WebAuthn register prompt — shown after successful password login */}
      {showRegisterPrompt && pendingUser && (
        <WebAuthnRegisterPrompt
          userEmail={pendingUser.email}
          userName={pendingUser.name}
          onDone={handleRegisterPromptDone}
        />
      )}

      {/* Welcome overlay */}
      <AnimatePresence>
        {welcomeUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
              className="flex flex-col items-center gap-6 text-center px-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 18 }}
                className="w-24 h-24 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center text-primary text-4xl font-bold shadow-lg"
              >
                {welcomeUser.initial}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="space-y-2"
              >
                {welcomeUser.subRole === "directeur" ? (
                  <>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                      Bienvenue
                    </p>
                    <p className="text-4xl font-serif font-bold text-foreground">
                      Monsieur le Directeur Général
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                      Connexion réussie
                    </p>
                    <p className="text-4xl font-serif font-bold text-foreground">
                      Je vous souhaite la bienvenue
                    </p>
                    <p className="text-lg text-muted-foreground mt-1 font-medium">
                      {welcomeUser.name}
                    </p>
                  </>
                )}
                <p className="text-muted-foreground text-sm mt-1">
                  Redirection vers votre tableau de bord…
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="w-56 h-1.5 rounded-full bg-muted overflow-hidden"
              >
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ animation: `farewell-progress ${welcomeUser.subRole === "directeur" ? "3" : "2.5"}s linear forwards` }}
                />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact Administration Dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              Réinitialisation du mot de passe
            </DialogTitle>
            <DialogDescription>
              Pour réinitialiser votre mot de passe, veuillez contacter le service de scolarité.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <Mail className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Email</p>
                <p className="text-sm font-semibold">support@m15edutech.ci</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <Phone className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Téléphone</p>
                <p className="text-sm font-semibold">+225 27 22 41 03 88</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Horaires d'accueil : Lun–Ven, 8h–17h
            </p>
          </div>
          <Button onClick={() => setContactDialogOpen(false)} className="w-full">
            Fermer
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
