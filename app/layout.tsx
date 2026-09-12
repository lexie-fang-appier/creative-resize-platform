import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AuthGate from "./AuthGate";
import AuthSessionProvider from "./components/SessionProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Creative Resize Platform",
  description: "Designer-in-the-loop workbench for structured creative resize and review",
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
