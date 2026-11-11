/** Marca: um horizonte com três linhas de observação — o "mirante" sobre a reunião. */
export function Logo({ className = "", light = false }: { className?: string; light?: boolean }) {
  const ink = light ? "#ffffff" : "#14213d";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <rect x="1" y="1" width="24" height="24" rx="7" fill={light ? "rgba(255,255,255,.08)" : "#e3f1f0"} />
        <path d="M5 17h16" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7 13.5h4.5M14 13.5h5" stroke="#3fb6a8" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M9 9.5h8" stroke={ink} strokeOpacity=".5" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="text-[17px] font-bold tracking-[-0.02em]" style={{ color: ink }}>Mirante</span>
    </span>
  );
}
