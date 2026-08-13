import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/shared/presentation/components/app-shell";
import { ErrorBoundary } from "@/shared/presentation/components/error-boundary";

export const metadata: Metadata = {
  title: { default: "Teluria", template: "%s · Teluria" },
  description: "Architectural plan intelligence and structural presentation workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <ErrorBoundary>
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
      </body>
    </html>
  );
}
