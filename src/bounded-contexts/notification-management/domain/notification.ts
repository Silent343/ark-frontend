import type { Resource } from "@/kernel/domain/resource";
/** Notifications are private to a recipient, even within the same project. */
export interface Notification extends Resource {
  user_id: string;
  title: string;
  resource: string;
  resource_id: string;
  read_at: string;
}
