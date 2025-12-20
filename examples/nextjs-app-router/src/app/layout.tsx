import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collie + Next.js Example",
  description: "Example Next.js application using Collie templates"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
