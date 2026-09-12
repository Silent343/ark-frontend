import type { Resource } from "@/kernel/domain/resource";
import type { ResourceRepository } from "@/kernel/application/resource-repository";
import { requestJson } from "./rest-client";
/** Routes use plural kebab-case resources; JSON field names remain snake_case. */
export class HttpResourceRepository<
  T extends Resource,
> implements ResourceRepository<T> {
  constructor(private readonly resource: string) {}
  private url(projectId: string, id?: string) {
    return (
      "/api/v1/projects/" +
      encodeURIComponent(projectId) +
      "/" +
      this.resource +
      (id ? "/" + encodeURIComponent(id) : "")
    );
  }
  list(projectId: string) {
    return requestJson<T[]>(this.url(projectId));
  }
  create(projectId: string, input: Omit<T, keyof Resource>) {
    return requestJson<T>(this.url(projectId), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  update(
    projectId: string,
    id: string,
    input: Partial<Omit<T, keyof Resource>>,
    version: string,
  ) {
    return requestJson<T>(this.url(projectId, id), {
      method: "PATCH",
      headers: { "If-Match": JSON.stringify(version) },
      body: JSON.stringify(input),
    });
  }
  delete(projectId: string, id: string, version: string) {
    return requestJson<void>(this.url(projectId, id), {
      method: "DELETE",
      headers: { "If-Match": JSON.stringify(version) },
    });
  }
}
