import "./globals.css";

export const metadata = {
  title: "Collie + Next.js Example",
  description: "Example Next.js application using Collie templates"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
