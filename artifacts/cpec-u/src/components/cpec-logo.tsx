export function CpecLogo({ size = 280 }: { size?: number }) {
  const aspect = 370 / 300;
  return (
    <svg
      width={size}
      height={size * aspect}
      viewBox="0 0 300 370"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="badgeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0e2d6b" />
          <stop offset="55%" stopColor="#1654a2" />
          <stop offset="100%" stopColor="#1778c2" />
        </linearGradient>
        <linearGradient id="pageLeft" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d6e8ff" />
        </linearGradient>
        <linearGradient id="pageRight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8f5e9" />
          <stop offset="100%" stopColor="#b8e0c4" />
        </linearGradient>
        <linearGradient id="pixelGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <filter id="badgeShadow" x="-18%" y="-14%" width="136%" height="136%">
          <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#0e2d6b" floodOpacity="0.38" />
        </filter>
        <filter id="glowPix" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Badge circle ── */}
      <circle cx="150" cy="138" r="128" fill="url(#badgeGrad)" filter="url(#badgeShadow)" />
      <circle cx="150" cy="138" r="122" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2.5" />

      {/* ── Book: left page ── */}
      <path
        d="M150 78 C128 80 86 93 74 150 L150 150 Z"
        fill="url(#pageLeft)"
        opacity="0.97"
      />
      {/* Left page lines */}
      <line x1="98"  y1="110" x2="144" y2="104" stroke="rgba(22,84,162,0.28)" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="96"  y1="122" x2="143" y2="116" stroke="rgba(22,84,162,0.22)" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="94"  y1="134" x2="142" y2="128" stroke="rgba(22,84,162,0.16)" strokeWidth="2.4" strokeLinecap="round" />

      {/* ── Book: right page ── */}
      <path
        d="M150 78 C172 80 214 93 226 150 L150 150 Z"
        fill="url(#pageRight)"
        opacity="0.92"
      />
      {/* Right page lines */}
      <line x1="202" y1="110" x2="156" y2="104" stroke="rgba(45,138,80,0.28)" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="204" y1="122" x2="157" y2="116" stroke="rgba(45,138,80,0.22)" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="206" y1="134" x2="158" y2="128" stroke="rgba(45,138,80,0.16)" strokeWidth="2.4" strokeLinecap="round" />

      {/* ── Book spine ── */}
      <line x1="150" y1="78" x2="150" y2="150" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />

      {/* ── Book base shadow/curl ── */}
      <ellipse cx="150" cy="153" rx="76" ry="7" fill="rgba(255,255,255,0.18)" />

      {/* ── Checkmark (gold) ── */}
      <path
        d="M128 132 L144 150 L176 110"
        stroke="#fbbf24"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ── Pixel squares (top-right) ── */}
      <rect x="178" y="56" width="13" height="13" rx="2.5" fill="url(#pixelGrad)" filter="url(#glowPix)" />
      <rect x="196" y="44" width="10" height="10" rx="2"   fill="#60a5fa" opacity="0.85" />
      <rect x="193" y="66" width="8"  height="8"  rx="1.5" fill="#4ade80" opacity="0.9" />
      <rect x="210" y="58" width="14" height="14" rx="3"   fill="#34d399" />
      <rect x="169" y="47" width="7"  height="7"  rx="1.5" fill="#fbbf24" opacity="0.65" />
      <rect x="220" y="42" width="8"  height="8"  rx="1.5" fill="#60a5fa" opacity="0.6" />

      {/* ── CPEC label inside badge ── */}
      <text
        x="150" y="210"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="20"
        letterSpacing="7"
        fill="rgba(255,255,255,0.82)"
      >
        CPEC
      </text>

      {/* ── Divider ── */}
      <line x1="95" y1="220" x2="205" y2="220" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

      {/* ── CPEC-Digital text below ── */}
      <text
        x="150" y="304"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="800"
        fontSize="42"
      >
        <tspan fill="#0e2d6b">CPEC</tspan>
        <tspan fill="#16a34a">-Digital</tspan>
      </text>

      {/* ── Tagline ── */}
      <text
        x="150" y="334"
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
  );
}
