import { AppShell } from "@/components/AppShell";
import { TransitSubnav } from "@/components/transit/TransitSubnav";

export default function TransitLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="交通到達" subtitle="巴士、小巴、電車、渡輪、的士、輕鐵、港鐵">
      <TransitSubnav />
      {children}
    </AppShell>
  );
}
