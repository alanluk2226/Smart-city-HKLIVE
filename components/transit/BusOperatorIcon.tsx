import type { Operator } from "@/lib/types";

const STYLES: Partial<Record<Operator, { body: string; stripe: string }>> = {
  kmb: { body: "#E4002B", stripe: "#FFFFFF" },
  ctb: { body: "#FEDD00", stripe: "#0072CE" },
  nlb: { body: "#007A33", stripe: "#FFFFFF" },
  mtrb: { body: "#B91C5C", stripe: "#FFFFFF" },
};

export function BusOperatorIcon({ operator }: { operator: Operator }) {
  const colors = STYLES[operator] ?? { body: "#64748b", stripe: "#FFFFFF" };
  return (
    <svg viewBox="0 0 32 20" className="h-5 w-8 shrink-0" aria-hidden>
      <rect x="1" y="3" width="30" height="14" rx="3" fill={colors.body} />
      <rect x="4" y="6" width="8" height="5" rx="1" fill={colors.stripe} opacity="0.9" />
      <rect x="14" y="6" width="14" height="5" rx="1" fill={colors.stripe} opacity="0.35" />
      <circle cx="8" cy="17" r="2.5" fill="#1e293b" />
      <circle cx="24" cy="17" r="2.5" fill="#1e293b" />
    </svg>
  );
}
