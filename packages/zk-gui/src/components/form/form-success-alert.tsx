import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormSuccessAlertProps {
  message: string | null | undefined;
  className?: string;
}

export function FormSuccessAlert({ message, className }: FormSuccessAlertProps) {
  if (!message) return null;

  return (
    <div
      className={cn(
        "mb-6 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

