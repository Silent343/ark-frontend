import type { Resource } from "@/kernel/domain/resource";
import type { ProjectRole } from "@/bounded-contexts/identity-access";
/** Membership links an account to a project; removal never deletes the account. */
export interface Member extends Resource {
  user_id: string;
  name: string;
  email: string;
  role: ProjectRole;
}
