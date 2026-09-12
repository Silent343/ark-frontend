/** A user's role belongs to a project, never to the global account. */
export type ProjectRole = "owner" | "architect" | "collaborator" | "client";
export interface SessionUser {
  id: string;
  name: string;
  email: string;
}
export const canManage = (role: ProjectRole) =>
  role === "owner" || role === "architect";
export const canDesign = (role: ProjectRole) => role !== "client";
