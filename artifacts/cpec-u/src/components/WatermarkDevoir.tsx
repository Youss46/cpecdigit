import { useState, useEffect, useId } from "react";

interface WatermarkDevoirProps {
  etudiant: { nom: string; matricule?: string };
  devoirTitre: string;
  ip: string;
}

export function WatermarkDevoir({ etudiant, devoirTitre, ip }: WatermarkDevoirProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const dateStr = now.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const line = [
    etudiant.nom,
    etudiant.matricule ? `[${etudiant.matricule}]` : "",
    "·",
    devoirTitre,
    "·",
    `${dateStr} ${timeStr}`,
    "·",
    ip,
  ].filter(Boolean).join("  ");

  // Repeat 3× per row to cover wide screens
  const rowText = `${line}          ${line}          ${line}`;

  // Number of rows needed to cover the full viewport height with 120px spacing
  const rowCount = Math.ceil(window.innerHeight / 120) + 4;

  return (
    <div
      id="watermark-devoir"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-50%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {Array.from({ length: rowCount * 2 }, (_, i) => (
          <div
            key={i}
            style={{
              transform: "rotate(-35deg)",
              whiteSpace: "nowrap",
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "monospace",
              color: "#000",
              opacity: 0.07,
              lineHeight: 1,
              marginBottom: "107px",
              letterSpacing: "0.02em",
            }}
          >
            {rowText}
          </div>
        ))}
      </div>
    </div>
  );
}
