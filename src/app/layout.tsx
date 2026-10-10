import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./collaboration.css";
import "./plan-import.css";
import {AuthProvider} from "@/bounded-contexts/identity-access/presentation/auth-provider";
import { AppShell } from "@/shared/presentation/components/app-shell";
import { ErrorBoundary } from "@/shared/presentation/components/error-boundary";
import { PreferencesBootstrap } from "@/bounded-contexts/workspace-administration/presentation/components/preferences-bootstrap";
import { I18nProvider } from "@/shared/i18n/presentation/i18n-provider";

export const metadata: Metadata = {
  title: { default: "Ark", template: "%s · Ark" },
  description: "Architectural plan intelligence and structural presentation workspace.",
  icons: {
    icon: "/ark-logo.svg",
    shortcut: "/ark-logo.svg",
    apple: "/ark-logo.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <I18nProvider>
          <PreferencesBootstrap />
          <ErrorBoundary>
            <AuthProvider><AppShell previewMode={process.env.ARK_LOCAL_PREVIEW === "1"}>{children}</AppShell></AuthProvider>
          </ErrorBoundary>
        </I18nProvider>
      </body>
    </html>
  );
}
