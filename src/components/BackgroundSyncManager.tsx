import { usePendingCompletionSync } from "@/hooks/usePendingCompletionSync";
import { useExerciseSeeding } from "@/hooks/useExerciseSeeding";

// This component runs background sync tasks for authenticated users
export function BackgroundSyncManager() {
  // Auto-sync pending workout completions when network is restored
  usePendingCompletionSync();
  
  // Seed base exercises for new users
  useExerciseSeeding();
  
  return null;
}
