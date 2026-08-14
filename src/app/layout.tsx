import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "JobFinder — opportunity radar",
  description: "Watch target companies for early-career jobs and events.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
