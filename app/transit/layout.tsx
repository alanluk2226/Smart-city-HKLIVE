import { AppShell } from "@/components/AppShell";
import { TransitChrome } from "@/components/transit/TransitChrome";

export default function TransitLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="交通工具" subtitle="">
      <TransitChrome>{children}</TransitChrome>
    </AppShell>
  );
}
