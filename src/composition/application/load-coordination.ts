import { requestJson } from "@/shared/infrastructure/rest-client";
import type { Member } from "@/bounded-contexts/team-management";
import type {
  CalendarEvent,
  Dependency,
} from "@/bounded-contexts/project-scheduling";
import type { Comment } from "@/bounded-contexts/collaboration";
import type { DeliverablePackage } from "@/bounded-contexts/delivery-management";
import type { ChangeEntry } from "@/bounded-contexts/change-control";
import type { Notification } from "@/bounded-contexts/notification-management";
import type { Resource } from "@/kernel/domain/resource";
export interface CoordinationData {
  members: Member[];
  events: CalendarEvent[];
  dependencies: (Dependency & Resource)[];
  comments: (Comment & { author_id: string; author_name: string })[];
  packages: DeliverablePackage[];
  notifications: Notification[];
  changes: ChangeEntry[];
  invitations: (Resource & {
    email: string;
    role: string;
    status: string;
    expires_at: string;
  })[];
}
/** Builds a role-aware read model without fetching forbidden collections for clients. */
export async function loadCoordination(
  id: string,
  role: string,
): Promise<CoordinationData> {
  const root = "/api/v1/projects/" + encodeURIComponent(id) + "/";
  const get = <T>(resource: string, allowed = true) =>
    allowed ? requestJson<T[]>(root + resource) : Promise.resolve([] as T[]);
  const [
    members,
    events,
    dependencies,
    comments,
    packages,
    notifications,
    changes,
    invitations,
  ] = await Promise.all([
    get<Member>("members", role !== "client"),
    get<CalendarEvent>("calendar-events", role !== "client"),
    get<Dependency & Resource>("task-dependencies", role !== "client"),
    get<CoordinationData["comments"][number]>("comments"),
    get<DeliverablePackage>("deliverable-packages"),
    get<Notification>("notifications"),
    get<ChangeEntry>("audit-entries", role !== "client"),
    get<CoordinationData["invitations"][number]>(
      "invitations",
      ["owner", "architect"].includes(role),
    ),
  ]);
  return {
    members,
    events,
    dependencies,
    comments,
    packages,
    notifications,
    changes,
    invitations,
  };
}
