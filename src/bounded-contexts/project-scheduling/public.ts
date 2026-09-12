import { ManageCalendarEvents } from "./application/manage-calendar-events";
import { CalendarEventRepository } from "./infrastructure/http-repository";
export const calendarEvents = new ManageCalendarEvents(
  new CalendarEventRepository(),
);
