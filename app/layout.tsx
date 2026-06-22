import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GreenHOOD",
  description: "מציאות ברחוב — פלטפורמה חברתית לכלכלת רחוב מעגלית",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "GreenHOOD",
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#1E3A22",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full`}>
      <head>
        <link rel="apple-touch-icon" href="/api/icon-png" />
      </head>
      <body className="min-h-full" style={{ background: "var(--paper)", color: "var(--ink)" }}>
        {children}
      </body>
    </html>
  );
}
