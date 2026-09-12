import {
  required,
  choice,
  ValidationError,
  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** CalendarEvent belongs to its project and exposes stable references across contexts. */
export interface CalendarEvent extends Resource {
  title: string;
  start_at: string;
  end_at: string;
  owner: string;
  category: string;
  location: string;
  notes: string;
}
export const CalendarEventRules: ResourceRules = {
  fields: [
    "title",
    "start_at",
    "end_at",
    "owner",
    "category",
    "location",
    "notes",
  ],
  validate(v) {
    required(v.title, "title");
    choice(v.category, ["meeting", "deadline", "site_visit"], "category");
    if (
      !Number.isFinite(Date.parse(String(v.start_at))) ||
      !Number.isFinite(Date.parse(String(v.end_at))) ||
      String(v.end_at) < String(v.start_at)
    )
      throw new ValidationError("Invalid event date range.");
  },
};
