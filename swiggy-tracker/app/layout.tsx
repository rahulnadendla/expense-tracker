import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swiggy Expense Tracker",
  description: "Track and analyze your Swiggy food and grocery expenses",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
