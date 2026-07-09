import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Single canonical QueryClient for the whole app (replaces the duplicate
// providers that previously lived in both main.tsx and App.tsx).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
