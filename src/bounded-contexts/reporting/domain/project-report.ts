/** Report rows are detached from persistence so PDF and UI adapters can share the same snapshot. */
export interface ProjectReport {
  name: string;
  location: string;
  currency: string;
  generated_at: string;
  sections: Array<{ title: string; rows: string[] }>;
}
