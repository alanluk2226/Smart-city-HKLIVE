import { AppShell } from "@/components/AppShell";
import { TransitSubnav } from "@/components/transit/TransitSubnav";

export default function TransitLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="交通到達" subtitle="先選種類：巴士、小巴、輕鐵或港鐵">
      <TransitSubnav />
      {children}
    </AppShell>
  );
}
