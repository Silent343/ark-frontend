import type { Resource } from "@/kernel/domain/resource";
/** Immutable audit entry records the authenticated actor and changed business fields. */
export interface ChangeEntry extends Resource {
  title: string;
  action: string;
  actor_id: string;
  actor_name: string;
  resource: string;
  resource_id: string;
  changes: Record<string, { before: unknown; after: unknown }>;
}
