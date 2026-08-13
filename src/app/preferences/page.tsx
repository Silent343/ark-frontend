import type { Metadata } from "next";
import { PreferencesScreen } from "@/bounded-contexts/workspace-administration";

export const metadata: Metadata = { title: "Preferencias" };
export default function PreferencesPage() { return <PreferencesScreen/>; }
