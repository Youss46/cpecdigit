import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import {
  useGetNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  AppNotification,
} from "@workspace/api-client-react";
import { Bell, Calendar, CheckCheck, Loader2, MessageSquare, CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useLocation } from "wouter";
import { PushNotificationToggle } from "@/components/push-notification-toggle";

function NotifIcon({ type }: { type: string }) {
  if (type === "schedule_assigned") return <Calendar className="w-5 h-5 text-blue-500" />;
  if (type === "schedule_cancelled") return <CalendarX className="w-5 h-5 text-red-500" />;
  if (type === "message") return <MessageSquare className="w-5 h-5 text-primary" />;
  return <Bell className="w-5 h-5 text-muted-foreground" />;
}

export default function TeacherNotificationsPage() {
  const { data: notifications = [], isLoading } = useGetNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleMarkRead = async (n: AppNotification) => {
    if (!n.read) {
      await markRead.mutateAsync(n.id);
      invalidate();
    }
    if (n.type === "message") {
      setLocation("/teacher/messages");
    }
  };

  const handleMarkAll = async () => {
    await markAll.mutateAsync();
    invalidate();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-serif font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PushNotificationToggle />
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAll}
                disabled={markAll.isPending}
                className="gap-2"
              >
                {markAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                Tout marquer lu
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">Aucune notification pour le moment</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleMarkRead(n)}
                className={cn(
                  "w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-colors",
                  n.read
                    ? "bg-card border-border opacity-70"
                    : "bg-primary/5 border-primary/20 hover:bg-primary/10"
                )}
              >
                <div className="shrink-0 mt-0.5 w-10 h-10 rounded-full flex items-center justify-center bg-background border border-border shadow-sm">
                  <NotifIcon type={n.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("font-semibold text-sm", !n.read && "text-foreground")}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-snug whitespace-pre-line">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: fr })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
