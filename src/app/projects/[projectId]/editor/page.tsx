import { EditorScreen } from "@/bounded-contexts/plan-digitization/presentation/screens/editor-screen";
export const metadata = { title: "Plano 2D" };

export default async function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EditorScreen projectId={projectId} />;
}
