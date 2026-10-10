import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Local-only preview bypass: the browser never receives the temporary credentials. */
export async function GET(request: NextRequest) {
  const apiUrl = process.env.TELURIA_API_URL;
  const email = process.env.ARK_PREVIEW_EMAIL;
  const password = process.env.ARK_PREVIEW_PASSWORD;
  const localHost = ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname);
  const localApi = apiUrl && ["localhost", "127.0.0.1"].includes(new URL(apiUrl).hostname);
  if (process.env.ARK_LOCAL_PREVIEW !== "1" || !localHost || !localApi || !email || !password)
    return new NextResponse("Vista previa local deshabilitada.", { status: 404 });

  try {
    const session = await fetch(new URL("/api/v1/sessions", apiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    const cookie = session.headers.get("set-cookie");
    if (!session.ok || !cookie) throw new Error("Preview session unavailable");
    const response = NextResponse.redirect(new URL("/projects", request.url));
    response.headers.set("Set-Cookie", cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return new NextResponse("La vista previa no pudo conectarse al API local.", { status: 503 });
  }
}
