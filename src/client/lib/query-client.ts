import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,       // 5 minutes
      gcTime: 10 * 60_000,         // 10 minutes (garbage collect)
      retry: 1,
      refetchOnWindowFocus: false,  // Tauri app, not a browser tab
    },
  },
})
