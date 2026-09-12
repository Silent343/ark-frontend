import { ManageResources } from "@/kernel/application/manage-resources";
import type { CalendarEvent } from "../domain/calendar-event";
/** Coordinates calendar events through a replaceable repository port. */
export class ManageCalendarEvents extends ManageResources<CalendarEvent> {}
