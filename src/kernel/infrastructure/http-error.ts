export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
/** Reject browser mutations from unrelated origins while allowing same-origin REST clients. */
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    origin &&
    (origin === "null" ||
      !/^https?:$/.test(new URL(origin).protocol) ||
      new URL(origin).host !==
        (request.headers.get("host") ?? new URL(request.url).host) ||
      request.headers.get("sec-fetch-site") === "cross-site")
  )
    fail(403, "Cross-origin writes are not allowed.");
}
