import type { Metadata } from "next";
import { SupportScreen } from "@/bounded-contexts/workspace-administration";

export const metadata: Metadata = { title: "Centro de ayuda" };
export default function SupportPage() { return <SupportScreen/>; }
