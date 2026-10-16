/** Preserve HTTP status so editors can distinguish a revision conflict from a network failure. */
export class RestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RestError";
  }
}

/** JSON REST client with one error contract for forms and resource hooks. */
export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  let result: { data?: T; error?: { message?: string } } | undefined;
  if (raw) {
    try {
      result = JSON.parse(raw) as { data?: T; error?: { message?: string } };
    } catch {
      // A proxy, deployment platform, or gateway can return HTML/text for an HTTP error.
      // Do not turn that transport error into an unrelated JSON parsing failure in the UI.
      if (!response.ok) {
        throw new RestError(
          "The server returned an invalid response (" + response.status + "). Try again or reload the project.",
          response.status,
        );
      }
      throw new RestError("The server returned invalid JSON.", response.status);
    }
  }
  if (response.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new Event("ark:session-expired"));
  if (!response.ok)
    throw new RestError(
      result?.error?.message ?? "Request failed (" + response.status + ").",
      response.status,
    );
  return result?.data as T;
}
