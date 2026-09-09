import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AuthGate from "./AuthGate";
import AuthSessionProvider from "./components/SessionProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Creative Resize Platform",
  description: "Internal Designer workbench for creative asset resize/redesign (Phase 0 scaffold)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthSessionProvider>
          <AuthGate>{children}</AuthGate>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
