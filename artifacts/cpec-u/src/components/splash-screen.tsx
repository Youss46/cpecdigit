import { useEffect, useState } from "react";
import { CpecLogo } from "./cpec-logo";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 400);
    const t2 = setTimeout(() => setPhase("out"), 4200);
    const t3 = setTimeout(() => onDone(), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        background: "radial-gradient(ellipse at 60% 40%, #e8f4fd 0%, #f0f9f0 50%, #f8f8ff 100%)",
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "out" ? "opacity 0.9s ease-in-out" : "none",
        pointerEvents: "none",
      }}
    >
      <div
        className="flex flex-col items-center gap-6"
        style={{
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "translateY(28px) scale(0.93)" : "translateY(0) scale(1)",
          transition: "opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div
          style={{
            animation: phase === "hold" ? "splash-float 3.5s ease-in-out infinite" : "none",
          }}
        >
          <CpecLogo size={260} />
        </div>

        <div className="w-56 h-1 rounded-full overflow-hidden bg-slate-200">
          <div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, #1654a2 0%, #16a34a 100%)",
              width: phase === "hold" ? "100%" : "0%",
              transition: phase === "hold" ? "width 3.7s cubic-bezier(0.4,0,0.2,1)" : "none",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes splash-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}
