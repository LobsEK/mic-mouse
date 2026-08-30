import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mic Mouse — Agent Studio",
  description: "Instaview's real, working AI agent workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sk">
      <body className="rail-off">{children}</body>
    </html>
  );
}
