"use client";

import { usePathname } from "next/navigation";
import { TransitSubnav } from "@/components/transit/TransitSubnav";

export function TransitChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/transit";

  return (
    <>
      {isHub ? (
        <p className="mb-4 text-sm text-muted">
          巴士、小巴、電車、渡輪、的士、輕鐵、港鐵
        </p>
      ) : null}
      <TransitSubnav compact={!isHub} />
      {children}
    </>
  );
}
