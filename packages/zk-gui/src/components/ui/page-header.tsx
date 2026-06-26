import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  Action?: ReactNode;
  Actions?: ReactNode[];
  className?: string;
  /** Tighter typography and spacing for dense settings-style pages */
  compact?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  Action,
  Actions,
  className,
  compact,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className={cn(compact ? "text-lg font-semibold tracking-tight" : "text-2xl font-bold")}>
          {title}
        </h1>
        {subtitle && (
          <p
            className={cn(
              "text-muted-foreground",
              compact ? "mt-0.5 text-xs leading-relaxed" : undefined,
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
      {(Action || Actions) && (
        <div className="flex items-center gap-2">
          {Actions?.map((action, index) => (
            <div key={index}>{action}</div>
          ))}
          {Action && <div>{Action}</div>}
        </div>
      )}
    </div>
  );
}
