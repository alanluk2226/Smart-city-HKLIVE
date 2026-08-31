import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_TC } from "next/font/google";
import { LocationPrefProvider } from "@/components/LocationPrefProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
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
  title: "HK LIVE",
  description: "整合交通工具、天氣、急症室、路況 CCTV、停車場與康文署場地的公開資料主控台",
  icons: {
    icon: "/logo.jpeg",
    apple: "/logo.jpeg",
  },
};

const themeBootScript = `(function(){try{var t=localStorage.getItem("hk-live-theme");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"dark";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-Hant"
      data-theme="dark"
      className={`${noto.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={`${noto.className} min-h-full flex flex-col`}>
        <ThemeProvider>
          <LocationPrefProvider>{children}</LocationPrefProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
