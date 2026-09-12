import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { CalendarEvent } from "../domain/calendar-event";
export class CalendarEventRepository extends HttpResourceRepository<CalendarEvent> {
  constructor() {
    super("calendar-events");
  }
}
