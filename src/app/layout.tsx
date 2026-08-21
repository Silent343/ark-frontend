import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/shared/presentation/components/app-shell";
import { ErrorBoundary } from "@/shared/presentation/components/error-boundary";
import { PreferencesBootstrap } from "@/bounded-contexts/workspace-administration/presentation/components/preferences-bootstrap";
import { I18nProvider } from "@/shared/i18n/presentation/i18n-provider";

export const metadata: Metadata = {
  title: { default: "Teluria", template: "%s · Teluria" },
  description: "Architectural plan intelligence and structural presentation workspace.",
  icons: {
    icon: "/teluria-logo.png",
    shortcut: "/teluria-logo.png",
    apple: "/teluria-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <I18nProvider>
          <PreferencesBootstrap />
          <ErrorBoundary>
            <AppShell>{children}</AppShell>
          </ErrorBoundary>
        </I18nProvider>
      </body>
    </html>
  );
}
