import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "FlowMedic · Automation reliability",
  description: "Your automations break. FlowMedic finds out why.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
