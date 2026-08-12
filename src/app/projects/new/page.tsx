import type { Metadata } from "next";
import { CreateProjectScreen } from "@/bounded-contexts/project-management/presentation/screens/create-project-screen";

export const metadata: Metadata = { title: "Nuevo proyecto" };
export default function NewProjectPage() { return <CreateProjectScreen />; }
