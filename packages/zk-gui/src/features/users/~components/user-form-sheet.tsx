import { FormErrorAlert, FormFieldInput, RequiredAsterisk } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
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
  const [allowUserIdEdit, setAllowUserIdEdit] = useState(false);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: toUserFormValues(null),
  });

  useEffect(() => {
    if (open) {
      form.reset(toUserFormValues(user));
      setAllowUserIdEdit(false);
    } else {
      form.reset();
      setAllowUserIdEdit(false);
    }
  }, [open, user, form]);

  const userIdLocked = isEditMode && !allowUserIdEdit;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-4 overflow-y-auto p-4 sm:max-w-lg data-[side=right]:sm:max-w-lg">
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
              disabled={userIdLocked}
            />

            {isEditMode ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="allow-user-id-edit"
                  checked={allowUserIdEdit}
                  onCheckedChange={(checked) => setAllowUserIdEdit(checked === true)}
                />
                <Label htmlFor="allow-user-id-edit" className="font-normal">
                  Allow editing User ID
                </Label>
              </div>
            ) : null}

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
                  <FormLabel className="inline-flex flex-row flex-nowrap items-center gap-1">
                    Role
                    <RequiredAsterisk />
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(String(value));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select role">
                        {(value) => (value != null && value !== "" ? roleLabel(Number(value)) : null)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} align="start">
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
