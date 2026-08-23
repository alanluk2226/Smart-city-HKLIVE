import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_TC } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_TC({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "香港城市實況",
  description: "整合交通到達、天氣、急症室、路況 CCTV、停車場與康文署場地的公開資料主控台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${noto.variable} ${mono.variable} h-full antialiased`}>
      <body className={`${noto.className} min-h-full flex flex-col`}>{children}</body>
    </html>
  );
}
