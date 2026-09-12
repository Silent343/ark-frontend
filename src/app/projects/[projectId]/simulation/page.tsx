import { SimulationScreen } from "@/bounded-contexts/seismic-simulation/presentation/screens/simulation-screen";

export default async function SimulationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <SimulationScreen projectId={projectId} />;
}
