import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import {
  User2, Mail, Phone, GraduationCap, CalendarOff,
  CalendarDays, Bell, MessageSquare, ChevronRight, BookOpen, AlertCircle, Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

function useParentProfile() {
  return useQuery({
    queryKey: ["/api/parent/profile"],
    queryFn: async () => {
      const res = await fetch("/api/parent/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json() as Promise<{
        parent: { id: number; name: string; email: string; phone?: string };
        students: Array<{ id: number; name: string; email: string; matricule?: string; photoUrl?: string; phone?: string; className?: string; classId?: number }>;
      }>;
    },
  });
}

function useUnreadNotifs() {
  return useQuery({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json() as Promise<{ count: number }>;
    },
  });
}

const LINKS = [
  { href: "/parent/results", label: "Résultats", icon: GraduationCap, color: "text-violet-600 bg-violet-50" },
  { href: "/parent/absences", label: "Absences", icon: CalendarOff, color: "text-red-600 bg-red-50" },
  { href: "/parent/schedule", label: "Emploi du temps", icon: CalendarDays, color: "text-blue-600 bg-blue-50" },
  { href: "/parent/scolarite", label: "Scolarité", icon: Wallet, color: "text-indigo-600 bg-indigo-50" },
  { href: "/parent/notifications", label: "Notifications", icon: Bell, color: "text-amber-600 bg-amber-50" },
  { href: "/parent/messages", label: "Messages", icon: MessageSquare, color: "text-emerald-600 bg-emerald-50" },
];

export default function ParentDashboard() {
  const { data, isLoading } = useParentProfile();
  const { data: notifData } = useUnreadNotifs();
  const unreadCount = notifData?.count ?? 0;

  return (
    <AppLayout allowedRoles={["parent"]} noScroll={false}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold">Espace Parents</h1>
          <p className="text-muted-foreground text-sm mt-1">Bienvenue, {data?.parent.name ?? "—"}</p>
        </motion.div>

        {/* Parent info card */}
        <Card>
          <CardContent className="p-5 flex flex-wrap gap-4 items-center">
            <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
              <User2 className="w-6 h-6 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base">{data?.parent.name ?? "—"}</p>
              <div className="flex flex-wrap gap-3 mt-1">
                {data?.parent.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{data.parent.email}</span>}
                {data?.parent.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{data.parent.phone}</span>}
              </div>
            </div>
            {unreadCount > 0 && <Badge className="bg-red-500 text-white">{unreadCount} notif.</Badge>}
          </CardContent>
        </Card>

        {/* Linked students */}
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
            <BookOpen className="w-4 h-4 inline mr-1 -mt-0.5" />Enfants liés
          </h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !data?.students.length ? (
            <Card><CardContent className="p-5 flex items-center gap-3 text-muted-foreground text-sm"><AlertCircle className="w-4 h-4" /> Aucun étudiant lié à ce compte.</CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.students.map(s => (
                <Card key={s.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center gap-3">
                    {s.photoUrl ? (
                      <img src={s.photoUrl} alt={s.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <User2 className="w-5 h-5 text-violet-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{s.name}</p>
                      {s.className && <p className="text-xs text-muted-foreground">{s.className}</p>}
                      {s.matricule && <p className="text-xs text-muted-foreground font-mono">{s.matricule}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Accès rapide</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {LINKS.map(l => (
              <Link key={l.href} href={l.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${l.color}`}>
                      <l.icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium flex-1">{l.label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
