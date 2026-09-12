import { handleWorkspaceRequest } from "@/composition/infrastructure/workspace-rest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Thin Next.js delivery adapter for versioned REST resources. */
async function handle(
  request: Request,
  context: { params: Promise<{ projectId: string; resource: string }> },
) {
  return handleWorkspaceRequest(request, await context.params);
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
