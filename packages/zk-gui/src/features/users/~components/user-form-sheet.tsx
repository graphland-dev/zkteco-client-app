import { FormErrorAlert, FormFieldInput } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  USER_ROLE_OPTIONS,
  roleLabel,
  toUserFormValues,
  userFormSchema,
  type DeviceUser,
  type UserFormValues,
} from "../~util";

interface UserFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: DeviceUser | null;
  onSubmit: (values: UserFormValues) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

export function UserFormSheet({
  open,
  onOpenChange,
  user,
  onSubmit,
  isLoading = false,
  error,
}: UserFormSheetProps) {
  const isEditMode = !!user;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: toUserFormValues(null),
  });

  useEffect(() => {
    if (open) {
      form.reset(toUserFormValues(user));
    } else {
      form.reset();
    }
  }, [open, user, form]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-4 overflow-y-auto p-4 sm:max-w-lg">
        <SheetHeader className="p-0">
          <SheetTitle>{isEditMode ? `Edit user ${user?.userId}` : "Create user"}</SheetTitle>
          <SheetDescription>
            {isEditMode
              ? "Update user details on the connected device."
              : "Add a new user to the connected device."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormErrorAlert message={error} />

            <FormFieldInput
              control={form.control}
              name="userId"
              label="User ID"
              placeholder="5011"
              required
              disabled={isEditMode}
            />

            <FormFieldInput
              control={form.control}
              name="name"
              label="Name"
              placeholder="Rayhan"
              required
            />

            <FormFieldInput
              control={form.control}
              name="password"
              label="Password"
              placeholder="Optional"
            />

            <FormFieldInput
              control={form.control}
              name="cardno"
              label="Card number"
              placeholder="Optional"
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Role <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <span
                          className={cn(
                            "truncate",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          {field.value ? roleLabel(Number(field.value)) : "Select role"}
                        </span>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {USER_ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter className="mt-0 flex flex-col gap-2 p-0">
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? isEditMode
                    ? "Updating..."
                    : "Creating..."
                  : isEditMode
                    ? "Update user"
                    : "Create user"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
