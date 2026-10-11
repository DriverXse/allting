import type { Metadata, Viewport } from "next";
import "./allting.css";
import { APPEARANCE_BOOTSTRAP } from "@/lib/appearance";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#275544",
};

export const metadata: Metadata = {
  title: "AllTing — byt det du har mot det du vill ha",
  description:
    "Hitta saker nära dig, föreslå ett byte och kom överens direkt med den andra personen.",
  manifest: "/manifest.webmanifest",
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
    <html lang="sv" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
