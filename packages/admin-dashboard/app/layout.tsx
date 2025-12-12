import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AuthHandler } from "@/components/auth-handler";
import { BottomNav } from "@/components/nav";
import { ErudaInit } from "@/components/eruda-init";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Telegram Bot Admin Dashboard",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#17212b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ErudaInit />
        <AuthProvider>
          <AuthHandler>
            <main className="min-h-screen pb-20">{children}</main>
            <BottomNav />
          </AuthHandler>
        </AuthProvider>
      </body>
    </html>
  );
}

