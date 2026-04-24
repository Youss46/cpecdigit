import { useState, useRef, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Download, X, FileText, Loader2 } from "lucide-react";

interface AttachmentViewerProps {
  url: string;
  label?: string;
}

export function AttachmentViewer({ url, label = "Voir la pièce jointe" }: AttachmentViewerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const revokePrevious = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  const fetchAttachment = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    revokePrevious();
    setBlobUrl(null);

    try {
      const res = await fetch(url, { credentials: "include", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error("Impossible de charger la pièce jointe");
      const blob = await res.blob();
      if (controller.signal.aborted) return;
      const objUrl = URL.createObjectURL(blob);
      blobUrlRef.current = objUrl;
      setBlobUrl(objUrl);
      setMimeType(blob.type);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError("Erreur lors du chargement de la pièce jointe.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    fetchAttachment();
  };

  const handleClose = () => {
    abortRef.current?.abort();
    setOpen(false);
    revokePrevious();
    setBlobUrl(null);
    setError(null);
    setMimeType("");
    setLoading(false);
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    const ext = mimeType.includes("pdf") ? ".pdf" : mimeType.includes("png") ? ".png" : ".jpg";
    a.download = `piece_jointe${ext}`;
    a.click();
  };

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType.includes("pdf");

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer"
      >
        <Eye className="h-4 w-4" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Pièce jointe
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-auto">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <X className="h-8 w-8 text-red-400" />
                <p className="text-sm text-red-600">{error}</p>
                <Button variant="outline" size="sm" onClick={fetchAttachment}>Réessayer</Button>
              </div>
            )}

            {blobUrl && !loading && !error && (
              <>
                {isImage && (
                  <img
                    src={blobUrl}
                    alt="Pièce jointe"
                    className="max-w-full max-h-[65vh] mx-auto rounded-lg object-contain"
                  />
                )}
                {isPdf && (
                  <iframe
                    src={blobUrl}
                    title="Pièce jointe PDF"
                    className="w-full rounded-lg border"
                    style={{ height: "65vh" }}
                  />
                )}
                {!isImage && !isPdf && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Ce type de fichier ne peut pas être prévisualisé.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {blobUrl && !loading && !error && (
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleClose}>Fermer</Button>
              <Button size="sm" onClick={handleDownload} className="gap-2">
                <Download className="h-4 w-4" />
                Télécharger
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
