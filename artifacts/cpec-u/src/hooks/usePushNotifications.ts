import { useState, useEffect, useCallback } from "react";

type SubscriptionState = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading";

export function usePushNotifications() {
  const [state, setState] = useState<SubscriptionState>("loading");
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  useEffect(() => {
    if (!supported) {
      setState("unsupported");
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      try {
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "subscribed" : "unsubscribed");
      } catch {
        setState("unsubscribed");
      }
    });
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return;
    setState("loading");
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const keyRes = await fetch("/api/push/vapid-public-key", { credentials: "include" });
      if (!keyRes.ok) throw new Error("Clés VAPID non disponibles");
      const { publicKey } = await keyRes.json();

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!r.ok) throw new Error("Impossible d'enregistrer l'abonnement");
      setState("subscribed");
    } catch (err: any) {
      setError(err?.message ?? "Erreur inattendue");
      setState("unsubscribed");
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setState("loading");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("unsubscribed");
    } catch (err: any) {
      setError(err?.message ?? "Erreur inattendue");
      setState("subscribed");
    }
  }, [supported]);

  return { state, error, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
