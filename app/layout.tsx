import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
