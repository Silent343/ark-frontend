/** Stable identifiers and audit fields shared by independently owned resources. */
export interface Resource {
  id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}
export interface ResourceRules {
  fields: readonly string[];
  validate(value: Record<string, unknown>): void;
}
/** Validation failures are safe to expose at the REST boundary. */
export class ValidationError extends Error {}
export function required(
  value: unknown,
  field: string,
  max = 200,
): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new ValidationError(
      field + ": required, maximum " + max + " characters.",
    );
}
export function choice(
  value: unknown,
  choices: readonly string[],
  field: string,
) {
  if (typeof value !== "string" || !choices.includes(value))
    throw new ValidationError(field + ": invalid value.");
}
export function date(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new ValidationError(field + ": use a valid YYYY-MM-DD date.");
}
export function amount(value: unknown, field: string, min = 0) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > 1e12
  )
    throw new ValidationError(field + ": invalid amount.");
}
