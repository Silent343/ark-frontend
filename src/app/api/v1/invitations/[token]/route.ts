import { identityRequest } from "@/composition/infrastructure/identity-rest";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return identityRequest(request, "invitations", (await params).token);
}
export const POST = GET;
