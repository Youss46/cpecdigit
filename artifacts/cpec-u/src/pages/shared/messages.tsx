import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Send, UserCircle2, Paperclip, X,
  FileText, Sheet, Presentation, FileArchive, Download,
  Plus, Search, Users, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function roleLabel(role: string, subRole?: string) {
  if (role === "student") return "Étudiant";
  if (role === "teacher") return "Enseignant";
  if (role === "admin") {
    if (subRole === "scolarite") return "Scolarité";
    if (subRole === "planificateur") return "Direction pédagogique";
    if (subRole === "directeur") return "Directeur";
    if (subRole === "hebergement") return "Responsable Hébergement";
  }
  return role;
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
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    if (downloading) return;
    setDownloading(true);
    try {
      const storedFilename = fileUrl.split("/").pop() ?? "";
      const url = `/api/messages/download/${storedFilename}?name=${encodeURIComponent(fileName)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      toast({ title: "Téléchargement échoué", description: "Impossible de télécharger le fichier.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={`flex items-center gap-2.5 rounded-xl p-2.5 mt-1 transition-colors w-full text-left ${
        isMe
          ? "bg-primary-foreground/15 hover:bg-primary-foreground/25"
          : "bg-background/60 hover:bg-background border border-border/50"
      } disabled:opacity-60`}
    >
      <FileIcon type={fileType} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isMe ? "text-primary-foreground" : "text-foreground"}`}>
          {fileName}
        </p>
        <p className={`text-[10px] ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          {formatSize(fileSize)} {downloading ? "— téléchargement…" : ""}
        </p>
      </div>
      <Download className={`w-4 h-4 flex-shrink-0 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`} />
    </button>
  );
}

export default function SharedMessages({ allowedRoles }: { allowedRoles: string[] }) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ name: string; size: number; type: string; file: File } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactTab, setContactTab] = useState<"contacts" | "classes">("contacts");

  // Broadcast state
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastFile, setBroadcastFile] = useState<{ name: string; size: number; type: string; file: File } | null>(null);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastUploading, setBroadcastUploading] = useState(false);
  const [broadcastDone, setBroadcastDone] = useState<{ count: number } | null>(null);
  const broadcastFileRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (selectedUserId) {
      setShowContactPicker(false);
      setContactSearch("");
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  }, [selectedUserId]);

  const { data: currentUser } = useGetCurrentUser();
  const isStudent = (currentUser as any)?.role === "student";

  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/messages"],
    queryFn: () => apiFetch("/messages"),
    refetchInterval: 60000,
  });

  const { data: allContacts = [] } = useQuery({
    queryKey: ["/api/messages/contacts/list"],
    queryFn: () => apiFetch("/messages/contacts/list"),
    enabled: showContactPicker,
  });

  const { data: classesList = [] } = useQuery({
    queryKey: ["/api/messages/classes/list"],
    queryFn: () => apiFetch("/messages/classes/list"),
    enabled: !isStudent,
  });

  const { data: thread } = useQuery({
    queryKey: ["/api/messages", selectedUserId],
    queryFn: () => apiFetch(`/messages/${selectedUserId}`),
    enabled: selectedUserId !== null,
    refetchInterval: 30000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages]);

  useEffect(() => {
    if (selectedUserId) {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    }
  }, [(thread?.messages as any[])?.length]);

  const convs = conversations as any[];
  const msgs = (thread?.messages ?? []) as any[];
  const other = thread?.other as any;
  const contacts = (allContacts as any[]).filter((c: any) =>
    !contactSearch.trim() ||
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED_TYPES = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = !sending && !uploading && (!!messageText.trim() || !!pendingFile);

  const handleSelectClass = (cls: any) => {
    setSelectedUserId(null);
    setSelectedClassId(cls.id);
    setSelectedClass(cls);
    setShowContactPicker(false);
    setBroadcastDone(null);
    setBroadcastText("");
    setBroadcastFile(null);
  };

  const handleBroadcastFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED_TYPES = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
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
    if (!selectedClassId || (!broadcastText.trim() && !broadcastFile)) return;
    setBroadcastSending(true);
    try {
      let fileData: { fileUrl?: string; fileName?: string; fileType?: string; fileSize?: number } = {};
      if (broadcastFile) {
        setBroadcastUploading(true);
        const fd = new FormData();
        fd.append("file", broadcastFile.file);
        const uploadRes = await fetch("/api/messages/upload", { method: "POST", credentials: "include", body: fd });
        setBroadcastUploading(false);
        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          toast({ title: "Erreur d'envoi du fichier", description: err.error, variant: "destructive" });
          return;
        }
        fileData = await uploadRes.json();
      }
      const result = await apiFetch(`/messages/class/${selectedClassId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: broadcastText.trim(), ...fileData }),
      });
      setBroadcastDone({ count: result.sent });
      setBroadcastText("");
      setBroadcastFile(null);
    } catch {
      toast({ title: "Erreur lors de l'envoi", variant: "destructive" });
    } finally {
      setBroadcastSending(false);
      setBroadcastUploading(false);
    }
  };

  const mobileThreadOpen = !!(selectedUserId || selectedClassId);

  const handleBack = () => {
    setSelectedUserId(null);
    setSelectedClassId(null);
    setSelectedClass(null);
    setBroadcastDone(null);
  };

  return (
    <AppLayout allowedRoles={allowedRoles} noScroll>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header — hidden on mobile when thread is open */}
        <div className={`mb-4 flex-shrink-0 ${mobileThreadOpen ? "hidden md:block" : ""}`}>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-primary" />
            Messages
          </h1>
          <p className="text-muted-foreground text-sm">
            {isStudent
              ? "Consultez les messages reçus de l'administration et des enseignants."
              : "Vos échanges avec l'administration et les étudiants."}
          </p>
        </div>

        <div className="flex flex-1 min-h-0 rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
          {/* Left: conversations — hidden on mobile when thread open */}
          <div className={`${mobileThreadOpen ? "hidden md:flex" : "flex"} w-full md:w-64 flex-shrink-0 border-r border-border flex-col`}>
            <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversations</p>
              {!isStudent && (
                <button
                  onClick={() => setShowContactPicker(v => !v)}
                  title="Nouveau message"
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${showContactPicker ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {showContactPicker ? (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Tabs: Contacts / Classes */}
                <div className="flex border-b border-border">
                  <button
                    onClick={() => setContactTab("contacts")}
                    className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${contactTab === "contacts" ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Contacts
                  </button>
                  <button
                    onClick={() => setContactTab("classes")}
                    className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${contactTab === "classes" ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Classes
                  </button>
                </div>

                {contactTab === "contacts" ? (
                  <>
                    <div className="px-2 py-2 border-b border-border">
                      <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1.5 border border-border focus-within:border-primary transition-colors">
                        <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <input
                          autoFocus
                          placeholder="Rechercher…"
                          value={contactSearch}
                          onChange={e => setContactSearch(e.target.value)}
                          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {contacts.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                          Aucun contact trouvé
                        </div>
                      ) : contacts.map((c: any) => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedUserId(c.id); setSelectedClassId(null); setSelectedClass(null); }}
                          className="w-full text-left px-3 py-2.5 flex gap-2.5 items-center hover:bg-muted/50 transition-colors border-b border-border/40"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-xs">
                            {c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{roleLabel(c.role, c.adminSubRole)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    {(classesList as any[]).length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                        Aucune classe disponible
                      </div>
                    ) : (classesList as any[]).map((cls: any) => (
                      <button
                        key={cls.id}
                        onClick={() => handleSelectClass(cls)}
                        className={`w-full text-left px-3 py-2.5 flex gap-2.5 items-center hover:bg-muted/50 transition-colors border-b border-border/40 ${selectedClassId === cls.id ? "bg-primary/5" : ""}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-700">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{cls.name}</p>
                          <p className="text-[10px] text-muted-foreground">{cls.studentCount} étudiant{cls.studentCount !== 1 ? "s" : ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {convs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-4 text-center">
                    <MessageSquare className="w-7 h-7 opacity-20" />
                    <p className="text-xs">Aucune conversation.</p>
                    {!isStudent && (
                      <button
                        onClick={() => setShowContactPicker(true)}
                        className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                      >
                        <Plus className="w-3 h-3" />
                        Nouveau message
                      </button>
                    )}
                  </div>
                ) : (
                  convs.map((c: any) => (
                    <button
                      key={c.userId}
                      onClick={() => setSelectedUserId(c.userId)}
                      className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-muted/50 transition-colors border-b border-border/50 ${
                        selectedUserId === c.userId ? "bg-primary/5 border-l-2 border-l-primary" : ""
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                        <UserCircle2 className="w-4 h-4" />
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
            )}
          </div>

          {/* Right: thread or broadcast — hidden on mobile when list is showing */}
          <div className={`${mobileThreadOpen ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
            {/* Broadcast panel */}
            {selectedClassId && !selectedUserId ? (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                  {/* Back button — mobile only */}
                  <button onClick={handleBack} className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{selectedClass?.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedClass?.studentCount} étudiant{selectedClass?.studentCount !== 1 ? "s" : ""} — diffusion</p>
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
                  {broadcastDone ? (
                    <div className="flex flex-col items-center gap-3 text-center">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                      <p className="font-semibold text-foreground">Message envoyé !</p>
                      <p className="text-sm text-muted-foreground">Votre message a été transmis à <strong>{broadcastDone.count}</strong> étudiant{broadcastDone.count !== 1 ? "s" : ""} de la classe <strong>{selectedClass?.name}</strong>.</p>
                      <button
                        onClick={() => { setBroadcastDone(null); setBroadcastText(""); setBroadcastFile(null); }}
                        className="text-sm text-primary hover:underline font-medium mt-1"
                      >
                        Envoyer un autre message
                      </button>
                    </div>
                  ) : (
                    <div className="w-full max-w-lg space-y-4">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                        Ce message sera envoyé à <strong>tous les étudiants</strong> de la classe <strong>{selectedClass?.name}</strong> et ils recevront une notification.
                      </div>

                      <textarea
                        placeholder="Rédigez votre message…"
                        value={broadcastText}
                        onChange={e => setBroadcastText(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
                      />

                      {/* File attachment */}
                      <input ref={broadcastFileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={handleBroadcastFileSelect} />
                      {broadcastFile ? (
                        <div className="flex items-center gap-2 bg-muted/60 rounded-xl px-3 py-2 border border-border">
                          <FileIcon type={broadcastFile.type} className="w-4 h-4" />
                          <span className="text-sm font-medium flex-1 truncate">{broadcastFile.name}</span>
                          <span className="text-xs text-muted-foreground">{formatSize(broadcastFile.size)}</span>
                          <button onClick={() => setBroadcastFile(null)} className="text-muted-foreground hover:text-foreground ml-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => broadcastFileRef.current?.click()}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Paperclip className="w-4 h-4" />
                          Joindre un document (PDF, Word, Excel, PowerPoint)
                        </button>
                      )}

                      <button
                        onClick={handleBroadcast}
                        disabled={broadcastSending || broadcastUploading || (!broadcastText.trim() && !broadcastFile)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {broadcastSending || broadcastUploading ? (
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        {broadcastUploading ? "Envoi du fichier…" : broadcastSending ? "Envoi en cours…" : `Envoyer à ${selectedClass?.studentCount ?? "tous les"} étudiant${(selectedClass?.studentCount ?? 0) !== 1 ? "s" : ""}`}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : !selectedUserId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <MessageSquare className="w-12 h-12 opacity-15" />
                <p className="text-sm">Sélectionnez une conversation.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                  {/* Back button — mobile only */}
                  <button onClick={handleBack} className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <UserCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{other?.name ?? "…"}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel(other?.role ?? "", other?.adminSubRole)}</p>
                  </div>
                </div>

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
                          <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            {formatTime(m.createdAt)}
                          </p>
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

                {isStudent ? (
                  <div className="px-4 py-3 border-t border-border flex-shrink-0">
                    <p className="text-xs text-muted-foreground text-center italic py-1">
                      Lecture seule — vous ne pouvez pas répondre à ce message.
                    </p>
                  </div>
                ) : (
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
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
