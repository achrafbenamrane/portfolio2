/**
 * Achraf's legal status, "auto-entrepreneur agréé" on the card, as a green
 * pill. Green on purpose, against the red: it reads as a verified mark. The
 * background comes from the caller, since the pill sits on red and on white.
 */
export function CertifiedBadge({ className = "" }: { className?: string }) {
  return (
    <p className={`inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-4 text-[12px] font-semibold uppercase tracking-wider text-[#15803d] ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Certified auto-entrepreneur
    </p>
  );
}
