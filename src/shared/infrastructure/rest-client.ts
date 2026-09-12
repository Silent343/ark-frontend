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
  if(response.status===401&&typeof window!=="undefined")window.dispatchEvent(new Event("teluria:session-expired"));
  if (!response.ok)
    throw new Error(
      result.error?.message ?? "Request failed (" + response.status + ").",
    );
  return result.data as T;
}
