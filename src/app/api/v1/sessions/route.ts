import { identityRequest } from "@/composition/infrastructure/identity-rest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => identityRequest(request, "sessions");
export const POST = GET;
export const DELETE = GET;
