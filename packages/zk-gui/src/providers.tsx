import { ConfirmationProvider } from "@/hooks/use-confirm";
import { I18NProvider } from "@/hooks/use-i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18NProvider>
        <ConfirmationProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ConfirmationProvider>
      </I18NProvider>
    </QueryClientProvider>
  );
}
