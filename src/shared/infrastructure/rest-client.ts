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
  const result = await response.json();
  if(response.status===401&&typeof window!=="undefined")window.dispatchEvent(new Event("ark:session-expired"));
  if (!response.ok)
    throw new RestError(
      result.error?.message ?? "Request failed (" + response.status + ").",
      response.status,
    );
  return result.data as T;
}
