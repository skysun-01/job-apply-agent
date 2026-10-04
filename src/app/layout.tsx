import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Apply Agent",
  description: "Find the skills a job needs that your CV is missing, update your CV and draft the application email.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
