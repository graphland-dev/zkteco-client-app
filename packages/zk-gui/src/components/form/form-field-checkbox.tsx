import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { Control, FieldPath, FieldValues } from "react-hook-form";

interface FormFieldCheckboxProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  description?: string;
  className?: string;
  disabled?: boolean;
  checkboxClassName?: string;
  showDescription?: boolean;
}

export function FormFieldCheckbox<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  description,
  className,
  disabled,
  checkboxClassName,
  showDescription = true,
}: FormFieldCheckboxProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn(
            "flex flex-row items-center justify-between rounded-lg border p-4",
            className,
          )}
        >
          <div className="space-y-0.5">
            <FormLabel className="text-base">{label}</FormLabel>
            {showDescription && description && (
              <div className="text-sm text-muted-foreground">{description}</div>
            )}
          </div>
          <FormControl>
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(checked) =>
                field.onChange(checked === true)
              }
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
              disabled={disabled}
              className={checkboxClassName}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
