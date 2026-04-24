import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Search, GraduationCap, Users, X, ArrowRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface SearchResult {
  id: number;
  name: string;
  email: string;
  role: "student" | "teacher";
  className?: string;
  matricule?: string;
}

let debounceTimer: ReturnType<typeof setTimeout>;

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

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
      setResults([]);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const [studRes, teachRes] = await Promise.all([
        fetch(`/api/admin/users?role=student&search=${encodeURIComponent(q)}`, { credentials: "include" }).then(r => r.json()),
        fetch(`/api/admin/users?role=teacher&search=${encodeURIComponent(q)}`, { credentials: "include" }).then(r => r.json()),
      ]);
      const students: SearchResult[] = (Array.isArray(studRes) ? studRes : []).slice(0, 6).map((u: any) => ({
        id: u.id, name: u.name, email: u.email, role: "student",
        className: u.className, matricule: u.matricule,
      }));
      const teachers: SearchResult[] = (Array.isArray(teachRes) ? teachRes : []).slice(0, 4).map((u: any) => ({
        id: u.id, name: u.name, email: u.email, role: "teacher",
      }));
      setResults([...students, ...teachers]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(val), 280);
  };

  const navigate = (r: SearchResult) => {
    setOpen(false);
    if (r.role === "student") {
      setLocation(`/admin/students/${r.id}`);
    } else {
      setLocation(`/admin/users`);
    }
  };

  const students = results.filter(r => r.role === "student");
  const teachers = results.filter(r => r.role === "teacher");

  return (
    <>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" aria-describedby={undefined}>
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleInput(e.target.value)}
              placeholder="Rechercher un étudiant ou un enseignant…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button onClick={() => { setQuery(""); setResults([]); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto py-2">
            {!query && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Saisissez un nom ou un email pour rechercher.
              </p>
            )}
            {loading && (
              <p className="text-center text-sm text-muted-foreground py-8">Recherche en cours…</p>
            )}
            {!loading && query && results.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Aucun résultat pour « {query} »</p>
            )}

            {students.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> Étudiants
                </p>
                {students.map(r => (
                  <button
                    key={r.id}
                    onClick={() => navigate(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-bold text-sm flex items-center justify-center shrink-0">
                      {r.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.matricule && <span className="mr-2">{r.matricule}</span>}
                        {r.className || r.email}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {teachers.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="w-3 h-3" /> Enseignants
                </p>
                {teachers.map(r => (
                  <button
                    key={r.id}
                    onClick={() => navigate(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold text-sm flex items-center justify-center shrink-0">
                      {r.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
