import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./admin.css";
import { BrandIntro, ThemeToggle } from "./components";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Velora Vista Visuals | Vancouver Film & Content Studio",
  description: "Film, social content and photography for ambitious brands in Vancouver and beyond.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:`document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'`}} /></head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <BrandIntro />
        {children}
        <ThemeToggle />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-9N3GEHQJLY"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-9N3GEHQJLY');
          `}
        </Script>
      </body>
    </html>
  );
}
