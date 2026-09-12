import type { Resource } from "@/kernel/domain/resource";
import type { ResourceRepository } from "./resource-repository";
/** Context-neutral persistence orchestration; domain rules run at the server boundary. */
export class ManageResources<T extends Resource> {
  constructor(private readonly repository: ResourceRepository<T>) {}
  list(projectId: string) {
    return this.repository.list(projectId);
  }
  create(projectId: string, input: Omit<T, keyof Resource>) {
    return this.repository.create(projectId, input);
  }
  update(projectId: string, item: T, input: Partial<Omit<T, keyof Resource>>) {
    return this.repository.update(projectId, item.id, input, item.updated_at);
  }
  delete(projectId: string, item: T) {
    return this.repository.delete(projectId, item.id, item.updated_at);
  }
}
