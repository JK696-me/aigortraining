import { usePendingCompletionSync } from "@/hooks/usePendingCompletionSync";
import { useExerciseSeeding } from "@/hooks/useExerciseSeeding";
import { useTemplateSeeding } from "@/hooks/useTemplateSeeding";

// This component runs background sync tasks for authenticated users
export function BackgroundSyncManager() {
  // Auto-sync pending workout completions when network is restored
  usePendingCompletionSync();
  
  // Seed base exercises for new users
  useExerciseSeeding();
  
  // Seed starter templates for new users (after exercises)
  useTemplateSeeding();
  
  return null;
}
