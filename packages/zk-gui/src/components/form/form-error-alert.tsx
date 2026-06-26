import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormErrorAlertProps {
  message: string | null | undefined;
  className?: string;
}

/**
 * Reusable error alert component for forms
 * Displays error messages with an icon and styled container
 */
export function FormErrorAlert({ message, className }: FormErrorAlertProps) {
  if (!message) return null;

  return (
    <div
      className={cn(
        "mb-6 rounded-md bg-destructive/10 border border-destructive/20 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">{message}</p>
        </div>
      </div>
    </div>
  );
}
