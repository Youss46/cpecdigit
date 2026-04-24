export function CpecLogo({ size = 280 }: { size?: number }) {
  const imgSize = size * 0.72;
  const totalHeight = imgSize + size * 0.45;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.05 }}>
      <img
        src="/logo.png"
        alt="Logo"
        width={imgSize}
        height={imgSize}
        style={{ borderRadius: imgSize * 0.22, objectFit: "contain" }}
        draggable={false}
      />
      <svg
        width={size}
        height={size * 0.38}
        viewBox="0 0 300 115"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text
          x="150" y="60"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="800"
          fontSize="42"
        >
          <tspan fill="#0e2d6b">M15</tspan>
          <tspan fill="#16a34a"> Edu</tspan>
          <tspan fill="#1778c2">Tech</tspan>
        </text>
        <text
          x="150" y="90"
          textAnchor="middle"
          fontFamily="'Segoe UI', Arial, sans-serif"
          fontWeight="400"
          fontSize="13"
          letterSpacing="3"
          fill="#64748b"
        >
          GESTION ACADÉMIQUE
        </text>
      </svg>
    </div>
  );
}
