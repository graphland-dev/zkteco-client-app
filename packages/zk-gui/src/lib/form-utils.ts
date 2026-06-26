import type { FieldErrors, FieldValues } from "react-hook-form";
import type { z } from "zod";

/** Joins react-hook-form field error messages for display in a submit error alert. */
export function getFormFieldErrorMessages<T extends FieldValues>(
  errors: FieldErrors<T>,
  fieldNames?: (keyof T & string)[],
): string | null {
  const keys =
    fieldNames ?? (Object.keys(errors) as (keyof T & string)[]);
  const messages = keys
    .map((key) => errors[key]?.message)
    .filter((msg): msg is string => typeof msg === "string" && msg.length > 0);
  return messages.length > 0 ? messages.join(" ") : null;
}

/**
 * Reads Zod issue messages from form values (reliable right after `form.trigger()`
 * when `formState.errors` may not be subscribed yet).
 */
export function getZodFormErrorMessages(
  schema: z.ZodTypeAny,
  values: unknown,
  fieldNames?: string[],
): string | null {
  const result = schema.safeParse(values);
  if (result.success) return null;

  const messages = result.error.issues
    .filter((issue) => {
      if (!fieldNames?.length) return true;
      const path = issue.path[0];
      return typeof path === "string" && fieldNames.includes(path);
    })
    .map((issue) => issue.message)
    .filter((msg) => msg.length > 0);

  return messages.length > 0 ? messages.join(" ") : null;
}
