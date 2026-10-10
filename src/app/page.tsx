import { DashboardScreen } from "@/bounded-contexts/project-management/presentation/screens/dashboard-screen";
import { redirect } from "next/navigation";

export default function DashboardPage() {
  // The opt-in local preview exchanges a temporary account for a normal session server-side.
  if (process.env.ARK_LOCAL_PREVIEW === "1") redirect("/preview");
  return <DashboardScreen />;
}
