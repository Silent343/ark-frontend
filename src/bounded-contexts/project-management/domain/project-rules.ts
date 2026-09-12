import {
  required,
  amount,
  choice,
  date,
  ValidationError,
  type ResourceRules,
} from "@/kernel/domain/resource";

/** Project metadata invariants shared by REST delivery and future persistence adapters. */
export const ProjectRules: ResourceRules = {
  fields: [
    "name",
    "location",
    "floors",
    "floor_height",
    "structure_type",
    "soil_type",
    "status",
    "thumbnail_variant",
    "progress",
    "phase",
    "client_name",
    "owner_name",
    "target_date",
    "budget_total",
    "currency",
  ],
  validate(value) {
    required(value.name, "name");
    required(value.location, "location");
    amount(value.floors, "floors", 1);
    if (!Number.isInteger(value.floors) || Number(value.floors) > 100)
      throw new ValidationError("floors: 1–100.");
    amount(value.floor_height, "floor_height", 1);
    required(value.structure_type, "structure_type");
    required(value.soil_type, "soil_type");
    choice(
      value.phase,
      ["proposal", "design", "review", "construction", "delivered"],
      "phase",
    );
    amount(value.budget_total, "budget_total");
    choice(value.currency, ["PEN", "USD", "EUR"], "currency");
    if (value.target_date) date(value.target_date, "target_date");
    // Preserve legacy design status while management lifecycle uses a separate phase.
    choice(value.status, ["Ready", "Processing", "Draft"], "status");
    choice(
      value.thumbnail_variant,
      ["blueprint", "tower", "house"],
      "thumbnail_variant",
    );
    amount(value.progress, "progress");
    if (Number(value.progress) > 100)
      throw new ValidationError("progress: maximum 100.");
  },
};
