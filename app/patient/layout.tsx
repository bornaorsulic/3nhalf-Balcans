import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/patient/app-shell";
import { APP_NAME } from "@/lib/app-config";

export const metadata: Metadata = {
  title: `Patient app · ${APP_NAME}`,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f5f1",
};

export default function PatientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
