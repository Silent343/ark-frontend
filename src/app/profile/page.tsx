import type { Metadata } from "next";
import { ProfileScreen } from "@/bounded-contexts/workspace-administration";

export const metadata: Metadata = { title: "Mi perfil" };
export default function ProfilePage() { return <ProfileScreen/>; }
