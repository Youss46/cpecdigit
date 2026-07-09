import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  MessageSquare, Send, Search, UserCircle2, GraduationCap, BookOpen, Plus, Users,
  CheckCircle2, Paperclip, X, FileText, Sheet, Presentation, FileArchive, Download,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSocket } from "@/lib/socket";

type MsgStatus = "sending" | "sent" | "received" | "read";

function MessageStatus({ status, isMe }: { status: MsgStatus; isMe: boolean }) {
  if (!isMe) return null;
  if (status === "sending")
    return <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", lineHeight: 1 }}>🕒</span>;
  if (status === "sent")
    return <span style={{ color: "rgba(255,255,255,0.80)", fontSize: "12px", lineHeight: 1, fontWeight: 700 }}>✓</span>;
  if (status === "received")
    return <span style={{ color: "rgba(255,255,255,0.80)", fontSize: "11px", lineHeight: 1, fontWeight: 700, letterSpacing: "-1px" }}>✓✓</span>;
  if (status === "read")
    return <span style={{ color: "#67e8f9", fontSize: "11px", lineHeight: 1, fontWeight: 700, letterSpacing: "-1px" }}>✓✓</span>;
  return null;
}

function getMsgStatus(m: any, overrides: Map<number, MsgStatus>): MsgStatus {
  const ov = overrides.get(m.id);
  if (ov) return ov;
  if (m.readAt) return "read";
  if (m.receivedAt) return "received";
  return "sent";
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    console.error("Download failed:", err);
    alert("Impossible de télécharger le fichier.");
  }
}

function roleLabel(role: string, subRole?: string) {
  if (role === "student") return "Étudiant";
  if (role === "teacher") return "Enseignant";
  if (role === "admin") {
    if (subRole === "scolarite") return "Scolarité";
    if (subRole === "planificateur") return "Direction pédagogique";
    if (subRole === "directeur") return "Directeur";
  }
  return role;
}

function RoleIcon({ role }: { role: string }) {
  if (role === "student") return <GraduationCap className="w-4 h-4" />;
  if (role === "teacher") return <BookOpen className="w-4 h-4" />;
  return <UserCircle2 className="w-4 h-4" />;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function FileIcon({ type, className = "w-5 h-5" }: { type: string; className?: string }) {
  if (type?.includes("pdf")) return <FileText className={`${className} text-red-500`} />;
  if (type?.includes("word") || type?.includes("document")) return <FileText className={`${className} text-blue-500`} />;
  if (type?.includes("excel") || type?.includes("sheet")) return <Sheet className={`${className} text-green-600`} />;
  if (type?.includes("powerpoint") || type?.includes("presentation")) return <Presentation className={`${className} text-orange-500`} />;
  return <FileArchive className={`${className} text-muted-foreground`} />;
}

function FileAttachment({ fileUrl, fileName, fileType, fileSize, isMe }: {
  fileUrl: string; fileName: string; fileType: string; fileSize: number; isMe: boolean;
}) {
  return (
    <button
      onClick={() => downloadFile(fileUrl, fileName)}
      className={`flex items-center gap-2.5 rounded-xl p-2.5 mt-1 transition-colors w-full text-left ${
        isMe
          ? "bg-primary-foreground/15 hover:bg-primary-foreground/25"
          : "bg-background/60 hover:bg-background border border-border/50"
      }`}
    >
      <FileIcon type={fileType} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isMe ? "text-primary-foreground" : "text-foreground"}`}>
          {fileName}
        </p>
        <p className={`text-[10px] ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          {formatSize(fileSize)}
        </p>
      </div>
      <Download className={`w-4 h-4 flex-shrink-0 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`} />
    </button>
  );
}

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export default function AdminMessages() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [pendingFile, setPendingFile] = useState<{ name: string; size: number; type: string; file: File } | null>(null);
  const [uploading, setUploading] = useState(false);
  // Broadcast state
  const [broadcastClassId, setBroadcastClassId] = useState<number | null>(null);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastSent, setBroadcastSent] = useState<number | null>(null);
  const [broadcastFile, setBroadcastFile] = useState<{ name: string; size: number; type: string; file: File } | null>(null);
  const [broadcastUploading, setBroadcastUploading] = useState(false);

  const [msgStatuses, setMsgStatuses] = useState<Map<number, MsgStatus>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const broadcastFileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    const onStatus = ({ messageIds, status }: { messageIds: number[]; status: MsgStatus }) => {
      setMsgStatuses(prev => {
        const next = new Map(prev);
        for (const id of messageIds) next.set(id, status);
        return next;
      });
    };
    socket.on("message:status", onStatus);
    return () => { socket.off("message:status", onStatus); };
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  }, [selectedUserId]);

  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/messages"],
    queryFn: () => apiFetch("/messages"),
    refetchInterval: 60000,
  });

  const { data: thread } = useQuery({
    queryKey: ["/api/messages", selectedUserId],
    queryFn: () => apiFetch(`/messages/${selectedUserId}`),
    enabled: selectedUserId !== null,
    refetchInterval: 30000,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["/api/messages/contacts/list"],
    queryFn: () => apiFetch("/messages/contacts/list"),
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["/api/messages/classes/list"],
    queryFn: () => apiFetch("/messages/classes/list"),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages]);

  useEffect(() => {
    if (selectedUserId) {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alertes/resume"] });
    }
  }, [(thread?.messages as any[])?.length]);

  const convs = conversations as any[];
  const msgs = (thread?.messages ?? []) as any[];
  const other = thread?.other as any;
  const allContacts = contacts as any[];
  const allClasses = classes as any[];

  const filteredConvs = convs.filter((c: any) =>
    c.userName?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredContacts = allContacts.filter((c: any) =>
    c.name?.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Type de fichier non supporté", description: "PDF, Word, Excel ou PowerPoint uniquement.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: "Taille maximale : 20 Mo", variant: "destructive" });
      return;
    }
    setPendingFile({ name: file.name, size: file.size, type: file.type, file });
    e.target.value = "";
  };

  const handleSend = async () => {
    if ((!messageText.trim() && !pendingFile) || !selectedUserId) return;
    setSending(true);
    try {
      let fileData: { fileUrl?: string; fileName?: string; fileType?: string; fileSize?: number } = {};

      if (pendingFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", pendingFile.file);
        const uploadRes = await fetch("/api/messages/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        setUploading(false);
        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          toast({ title: "Erreur d'envoi du fichier", description: err.error, variant: "destructive" });
          return;
        }
        fileData = await uploadRes.json();
      }

      await apiFetch("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: selectedUserId,
          content: messageText.trim(),
          ...fileData,
        }),
      });
      setMessageText("");
      setPendingFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    } catch {
      toast({ title: "Erreur lors de l'envoi", variant: "destructive" });
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startConversation = (userId: number) => {
    setSelectedUserId(userId);
    setShowNewDialog(false);
    setContactSearch("");
  };

  const handleBroadcastFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Type de fichier non supporté", description: "PDF, Word, Excel ou PowerPoint uniquement.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: "Taille maximale : 20 Mo", variant: "destructive" });
      return;
    }
    setBroadcastFile({ name: file.name, size: file.size, type: file.type, file });
    e.target.value = "";
  };

  const handleBroadcast = async () => {
    if (!broadcastClassId || (!broadcastText.trim() && !broadcastFile)) return;
    setBroadcastSending(true);
    setBroadcastSent(null);
    try {
      let fileData: { fileUrl?: string; fileName?: string; fileType?: string; fileSize?: number } = {};

      if (broadcastFile) {
        setBroadcastUploading(true);
        const fd = new FormData();
        fd.append("file", broadcastFile.file);
        const uploadRes = await fetch("/api/messages/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        setBroadcastUploading(false);
        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          toast({ title: "Erreur d'envoi du fichier", description: err.error, variant: "destructive" });
          return;
        }
        fileData = await uploadRes.json();
      }

      const data = await apiFetch(`/messages/class/${broadcastClassId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: broadcastText.trim(), ...fileData }),
      });
      setBroadcastSent(data.sent);
      setBroadcastText("");
      setBroadcastFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    } catch (e: any) {
      toast({ title: "Erreur lors de l'envoi", description: e.message, variant: "destructive" });
    } finally {
      setBroadcastSending(false);
      setBroadcastUploading(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setShowNewDialog(open);
    if (!open) {
      setBroadcastClassId(null);
      setBroadcastText("");
      setBroadcastSent(null);
      setBroadcastFile(null);
      setContactSearch("");
    }
  };

  const canSend = !sending && !uploading && (!!messageText.trim() || !!pendingFile);

  const mobileThreadOpen = !!selectedUserId;

  const handleBack = () => {
    setSelectedUserId(null);
  };

  return (
    <AppLayout allowedRoles={["admin"]} noScroll>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header — hidden on mobile when thread is open */}
        <div className={`flex items-center justify-between mb-4 flex-shrink-0 ${mobileThreadOpen ? "hidden md:flex" : "flex"}`}>
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="w-8 h-8 text-primary" />
              Messages
            </h1>
            <p className="text-muted-foreground text-sm">Échangez avec les étudiants et enseignants.</p>
          </div>
          <Button onClick={() => setShowNewDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nouveau message
          </Button>
        </div>

        {/* Chat layout */}
        <div className="flex flex-1 min-h-0 rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
          {/* Left: conversations list — hidden on mobile when thread open */}
          <div className={`${mobileThreadOpen ? "hidden md:flex" : "flex"} w-full md:w-72 flex-shrink-0 border-r border-border flex-col`}>
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-background"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredConvs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 px-4 text-center">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Aucune conversation. Commencez par envoyer un message.</p>
                </div>
              ) : (
                filteredConvs.map((c: any) => (
                  <button
                    key={c.userId}
                    onClick={() => setSelectedUserId(c.userId)}
                    className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-muted/50 transition-colors border-b border-border/50 ${
                      selectedUserId === c.userId ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                      <RoleIcon role={c.userRole} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-semibold truncate">{c.userName}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatTime(c.lastAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>
                        {c.unreadCount > 0 && (
                          <Badge className="h-4 min-w-4 text-[10px] px-1 bg-primary flex-shrink-0">{c.unreadCount}</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: thread — hidden on mobile when no thread open */}
          <div className={`${mobileThreadOpen ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
            {!selectedUserId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <MessageSquare className="w-12 h-12 opacity-15" />
                <p className="text-sm">Sélectionnez une conversation ou démarrez-en une nouvelle.</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                  {/* Back button — mobile only */}
                  <button
                    onClick={handleBack}
                    className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0"
                    aria-label="Retour"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <RoleIcon role={other?.role ?? ""} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{other?.name ?? "…"}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel(other?.role ?? "", other?.adminSubRole)}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {msgs.map((m: any) => {
                    const isMe = m.senderId !== selectedUserId;
                    return (
                      <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] min-w-0 rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                          isMe
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        }`}>
                          {m.content && !m.content.startsWith("📎") && (
                            <p className="leading-relaxed whitespace-normal break-words block w-full">{m.content}</p>
                          )}
                          {m.fileUrl && (
                            <FileAttachment
                              fileUrl={m.fileUrl}
                              fileName={m.fileName}
                              fileType={m.fileType}
                              fileSize={m.fileSize}
                              isMe={isMe}
                            />
                          )}
                          {m.content && m.content.startsWith("📎") && !m.fileUrl && (
                            <p className="leading-relaxed whitespace-normal break-words block w-full">{m.content}</p>
                          )}
                          <div className={`flex items-center gap-0.5 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                            <span className={`text-[10px] ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {formatTime(m.createdAt)}
                            </span>
                            <MessageStatus status={getMsgStatus(m, msgStatuses)} isMe={isMe} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Pending file preview */}
                {pendingFile && (
                  <div className="px-4 pt-2 flex-shrink-0">
                    <div className="flex items-center gap-2 bg-muted/60 rounded-xl px-3 py-2 border border-border">
                      <FileIcon type={pendingFile.type} className="w-4 h-4" />
                      <span className="text-sm font-medium flex-1 truncate">{pendingFile.name}</span>
                      <span className="text-xs text-muted-foreground">{formatSize(pendingFile.size)}</span>
                      <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-foreground ml-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-border flex-shrink-0">
                  <div className="flex items-center gap-2 bg-muted/50 rounded-2xl px-3 py-1.5 border border-border focus-within:border-primary focus-within:bg-background transition-colors max-w-2xl mx-auto">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      onChange={handleFileSelect}
                    />
                    <button
                      type="button"
                      className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors p-1 rounded-lg hover:bg-primary/10"
                      onClick={() => fileInputRef.current?.click()}
                      title="Joindre un fichier (PDF, Word, Excel, PowerPoint)"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <input
                      ref={messageInputRef}
                      placeholder={pendingFile ? "Ajouter un message (optionnel)…" : "Écrire un message…"}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={sending || uploading}
                      className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground text-foreground py-1.5"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!canSend}
                      className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${canSend ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
                    >
                      {uploading ? (
                        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* New conversation dialog */}
        <Dialog open={showNewDialog} onOpenChange={handleDialogClose}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Nouveau message
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="individuel" className="mt-1">
              <TabsList className="w-full">
                <TabsTrigger value="individuel" className="flex-1 gap-2">
                  <UserCircle2 className="w-3.5 h-3.5" />
                  Individuel
                </TabsTrigger>
                <TabsTrigger value="classe" className="flex-1 gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Toute une classe
                </TabsTrigger>
              </TabsList>

              {/* Individual tab */}
              <TabsContent value="individuel" className="space-y-3 mt-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un étudiant ou enseignant…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-8"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {filteredContacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Aucun résultat</p>
                  ) : (
                    filteredContacts.map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => startConversation(c.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                          <RoleIcon role={c.role} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{roleLabel(c.role)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Broadcast tab */}
              <TabsContent value="classe" className="space-y-3 mt-3">
                {broadcastSent !== null ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <CheckCircle2 className="w-12 h-12 text-green-500" />
                    <p className="text-sm font-semibold text-foreground">
                      Message envoyé à {broadcastSent} étudiant{broadcastSent > 1 ? "s" : ""} !
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setBroadcastSent(null)}>
                      Envoyer un autre message
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Sélectionnez une classe :</p>
                      <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto pr-1">
                        {allClasses.map((cls: any) => (
                          <button
                            key={cls.id}
                            onClick={() => setBroadcastClassId(cls.id)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors text-sm ${
                              broadcastClassId === cls.id
                                ? "border-primary bg-primary/5 text-primary font-medium"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 flex-shrink-0" />
                              {cls.name}
                            </span>
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              {cls.studentCount} étud.
                            </Badge>
                          </button>
                        ))}
                        {allClasses.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">Aucune classe disponible</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Message :</p>
                      <Textarea
                        placeholder="Rédigez votre message pour toute la classe…"
                        value={broadcastText}
                        onChange={(e) => setBroadcastText(e.target.value)}
                        rows={4}
                        className="resize-none"
                      />
                    </div>

                    {/* Broadcast file attachment */}
                    <input
                      ref={broadcastFileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      onChange={handleBroadcastFileSelect}
                    />
                    {broadcastFile ? (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted border text-sm">
                        <FileIcon className="w-4 h-4 text-primary shrink-0" />
                        <span className="flex-1 truncate font-medium">{broadcastFile.name}</span>
                        <span className="text-muted-foreground whitespace-nowrap text-xs">
                          {(broadcastFile.size / 1024).toFixed(0)} Ko
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          onClick={() => setBroadcastFile(null)}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => broadcastFileInputRef.current?.click()}
                      >
                        <Paperclip className="w-4 h-4" />
                        Joindre un fichier (PDF, Word, Excel, PowerPoint — max 20 Mo)
                      </button>
                    )}

                    <Button
                      className="w-full gap-2"
                      disabled={!broadcastClassId || (!broadcastText.trim() && !broadcastFile) || broadcastSending}
                      onClick={handleBroadcast}
                    >
                      <Send className="w-4 h-4" />
                      {broadcastUploading ? "Envoi du fichier…" : broadcastSending ? "Envoi en cours…" : "Envoyer à toute la classe"}
                    </Button>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
