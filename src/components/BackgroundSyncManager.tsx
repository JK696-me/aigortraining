import { usePendingCompletionSync } from "@/hooks/usePendingCompletionSync";

// This component runs background sync tasks for authenticated users
export function BackgroundSyncManager() {
  // Auto-sync pending workout completions when network is restored
  usePendingCompletionSync();
  
  return null;
}
