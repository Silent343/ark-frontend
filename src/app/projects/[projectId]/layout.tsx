import { WorkspaceProvider } from "@/composition/presentation/workspace-context";
import { WorkspaceFrame } from "@/composition/presentation/workspace-frame";
/** Keeps navigation and composed project data mounted while switching workspace tabs. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <WorkspaceProvider key={projectId} projectId={projectId}>
      <WorkspaceFrame>{children}</WorkspaceFrame>
    </WorkspaceProvider>
  );
}
