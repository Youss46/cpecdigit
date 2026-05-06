import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Search, GraduationCap, Users, X, ArrowRight, LayoutDashboard } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface NavSearchItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface UserResult {
  id: number;
  name: string;
  email: string;
  role: "student" | "teacher";
  className?: string;
  matricule?: string;
}

let debounceTimer: ReturnType<typeof setTimeout>;

interface Props {
  navItems?: NavSearchItem[];
  isAdmin?: boolean;
}

export function GlobalSearch({ navItems = [], isAdmin = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Keyboard shortcut ⌘K / Ctrl+K ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setQuery("");
      setUserResults([]);
      setCursor(0);
    }
  }, [open]);

  // ── Nav item filtering (instant, client-side) ─────────────────────────
  const filteredNav: NavSearchItem[] = query.trim().length < 1
    ? []
    : navItems.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8);

  // ── User search (debounced API call, admin only) ──────────────────────
  const doUserSearch = useCallback(async (q: string) => {
    if (!q.trim() || !isAdmin) { setUserResults([]); return; }
    setLoading(true);
    try {
      const [studRes, teachRes] = await Promise.all([
        fetch(`/api/admin/users?role=student&search=${encodeURIComponent(q)}`, { credentials: "include" }).then(r => r.json()),
        fetch(`/api/admin/users?role=teacher&search=${encodeURIComponent(q)}`, { credentials: "include" }).then(r => r.json()),
      ]);
      const students: UserResult[] = (Array.isArray(studRes) ? studRes : []).slice(0, 5).map((u: any) => ({
        id: u.id, name: u.name, email: u.email, role: "student",
        className: u.className, matricule: u.matricule,
      }));
      const teachers: UserResult[] = (Array.isArray(teachRes) ? teachRes : []).slice(0, 3).map((u: any) => ({
        id: u.id, name: u.name, email: u.email, role: "teacher",
      }));
      setUserResults([...students, ...teachers]);
    } catch {
      setUserResults([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const handleInput = (val: string) => {
    setQuery(val);
    setCursor(0);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doUserSearch(val), 300);
  };

  // ── Unified flat result list for keyboard nav ─────────────────────────
  const totalItems = filteredNav.length + userResults.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor < filteredNav.length) {
        navigateToPage(filteredNav[cursor].href);
      } else {
        const ur = userResults[cursor - filteredNav.length];
        if (ur) navigateToUser(ur);
      }
    }
  };

  // scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const navigateToPage = (href: string) => {
    setOpen(false);
    setLocation(href);
  };

  const navigateToUser = (r: UserResult) => {
    setOpen(false);
    if (r.role === "student") {
      setLocation(`/admin/students/${r.id}`);
    } else {
      setLocation(`/admin/users`);
    }
  };

  const students = userResults.filter(r => r.role === "student");
  const teachers = userResults.filter(r => r.role === "teacher");
  const hasResults = filteredNav.length > 0 || userResults.length > 0;

  return (
    <>
      {/* Trigger button (sidebar) */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors border border-border/50"
        title="Recherche globale (Ctrl+K)"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">Rechercher…</span>
        <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded border border-border/70">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" aria-describedby={undefined}>

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isAdmin ? "Rechercher une page, un étudiant, un enseignant…" : "Rechercher une page du menu…"}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button onClick={() => { setQuery(""); setUserResults([]); setCursor(0); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[420px] overflow-y-auto py-2">

            {/* Empty state */}
            {!query && (
              <div className="px-4 py-8 text-center">
                <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">
                  {isAdmin
                    ? "Saisissez pour naviguer vers une page ou rechercher un utilisateur."
                    : "Saisissez pour naviguer vers une page du menu."}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Utilisez <kbd className="font-mono bg-muted px-1 rounded border text-[10px]">↑↓</kbd> pour naviguer,{" "}
                  <kbd className="font-mono bg-muted px-1 rounded border text-[10px]">↵</kbd> pour accéder
                </p>
              </div>
            )}

            {/* No results */}
            {query && !loading && !hasResults && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Aucun résultat pour « {query} »
              </p>
            )}

            {/* ── Navigation pages section ─────────────────────────── */}
            {filteredNav.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <LayoutDashboard className="w-3 h-3" /> Pages
                </p>
                {filteredNav.map((item, i) => {
                  const Icon = item.icon;
                  const isSelected = cursor === i;
                  return (
                    <button
                      key={item.href}
                      data-idx={i}
                      onClick={() => navigateToPage(item.href)}
                      onMouseEnter={() => setCursor(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left group ${
                        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-secondary/50"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "bg-primary-foreground/20" : "bg-muted"
                      }`}>
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`} />
                      </div>
                      <span className={`text-sm font-medium flex-1 ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                        {item.name}
                      </span>
                      <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground opacity-0 group-hover:opacity-100"} transition-opacity`} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── User search section (admin only) ─────────────────── */}
            {loading && (
              <p className="text-center text-sm text-muted-foreground py-4">Recherche utilisateurs…</p>
            )}

            {!loading && students.length > 0 && (
              <div>
                {filteredNav.length > 0 && <div className="mx-4 my-1 border-t border-border/50" />}
                <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> Étudiants
                </p>
                {students.map((r, i) => {
                  const idx = filteredNav.length + i;
                  const isSelected = cursor === idx;
                  return (
                    <button
                      key={r.id}
                      data-idx={idx}
                      onClick={() => navigateToUser(r)}
                      onMouseEnter={() => setCursor(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left group ${
                        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-secondary/50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full font-bold text-sm flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-purple-100 text-purple-700"
                      }`}>
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>{r.name}</p>
                        <p className={`text-xs truncate ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {r.matricule && <span className="mr-2">{r.matricule}</span>}
                          {r.className || r.email}
                        </p>
                      </div>
                      <ArrowRight className={`w-4 h-4 shrink-0 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground opacity-0 group-hover:opacity-100"} transition-opacity`} />
                    </button>
                  );
                })}
              </div>
            )}

            {!loading && teachers.length > 0 && (
              <div>
                {(filteredNav.length > 0 || students.length > 0) && <div className="mx-4 my-1 border-t border-border/50" />}
                <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="w-3 h-3" /> Enseignants
                </p>
                {teachers.map((r, i) => {
                  const idx = filteredNav.length + students.length + i;
                  const isSelected = cursor === idx;
                  return (
                    <button
                      key={r.id}
                      data-idx={idx}
                      onClick={() => navigateToUser(r)}
                      onMouseEnter={() => setCursor(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left group ${
                        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-secondary/50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full font-bold text-sm flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-green-100 text-green-700"
                      }`}>
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>{r.name}</p>
                        <p className={`text-xs truncate ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{r.email}</p>
                      </div>
                      <ArrowRight className={`w-4 h-4 shrink-0 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground opacity-0 group-hover:opacity-100"} transition-opacity`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {hasResults && (
            <div className="px-4 py-2 border-t border-border/50 flex items-center gap-3 text-[10px] text-muted-foreground bg-muted/30">
              <span><kbd className="font-mono bg-background px-1 rounded border">↑↓</kbd> naviguer</span>
              <span><kbd className="font-mono bg-background px-1 rounded border">↵</kbd> accéder</span>
              <span><kbd className="font-mono bg-background px-1 rounded border">Esc</kbd> fermer</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
