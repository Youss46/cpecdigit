import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import {
  useGetNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  AppNotification,
} from "@workspace/api-client-react";
import { Bell, CalendarOff, Trophy, CheckCheck, Loader2, MessageSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { PushNotificationToggle } from "@/components/push-notification-toggle";

function NotifIcon({ type }: { type: string }) {
  if (type === "results_published") return <Trophy className="w-5 h-5 text-amber-500" />;
  if (type === "absence_alert") return <CalendarOff className="w-5 h-5 text-red-500" />;
  if (type === "message") return <MessageSquare className="w-5 h-5 text-primary" />;
  return <Bell className="w-5 h-5 text-muted-foreground" />;
}

export default function ParentNotifications() {
  const { data: notifications = [], isLoading } = useGetNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();

  const handleMark = async (id: number) => {
    await markRead.mutateAsync(id);
    queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
  };

  const handleMarkAll = async () => {
    await markAll.mutateAsync();
    queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
  };

  const unread = notifications.filter((n: AppNotification) => !n.read);

  return (
    <AppLayout allowedRoles={["parent"]}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="w-6 h-6 text-amber-500" /> Notifications
            </h1>
            {unread.length > 0 && <p className="text-sm text-muted-foreground mt-0.5">{unread.length} non lue{unread.length > 1 ? "s" : ""}</p>}
          </div>
          <div className="flex gap-2 items-center">
            <PushNotificationToggle />
            {unread.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleMarkAll} disabled={markAll.isPending}>
                {markAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                <span className="ml-1.5">Tout lire</span>
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Bell className="w-10 h-10 opacity-30" />
            <p className="text-sm">Aucune notification</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n: AppNotification) => (
              <div
                key={n.id}
                onClick={() => !n.read && handleMark(n.id)}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer",
                  n.read ? "bg-background border-border/50 opacity-70" : "bg-card border-border shadow-sm hover:bg-accent/50"
                )}
              >
                <div className="mt-0.5 flex-shrink-0">
                  <NotifIcon type={n.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm leading-snug", !n.read && "font-semibold")}>{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: fr })}
                  </p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
