import { ModelScreen } from "@/bounded-contexts/spatial-visualization/presentation/screens/model-screen";
export const metadata = { title: "Estudio 3D" };

export default async function ModelPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ModelScreen projectId={projectId} />;
}
