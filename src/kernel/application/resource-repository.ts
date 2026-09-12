import type { Resource } from "@/kernel/domain/resource";
/** CRUD port: owners can replace HTTP without changing their use cases. */
export interface ResourceRepository<T extends Resource> {
  list(projectId: string): Promise<T[]>;
  create(projectId: string, input: Omit<T, keyof Resource>): Promise<T>;
  update(
    projectId: string,
    id: string,
    input: Partial<Omit<T, keyof Resource>>,
    version: string,
  ): Promise<T>;
  delete(projectId: string, id: string, version: string): Promise<void>;
}
