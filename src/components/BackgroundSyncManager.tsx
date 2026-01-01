import { usePendingCompletionSync } from "@/hooks/usePendingCompletionSync";
import { useAppInitialization } from "@/hooks/useAppInitialization";
import { IntroModal } from "@/components/IntroModal";

// This component runs background sync tasks for authenticated users
export function BackgroundSyncManager() {
  // Auto-sync pending workout completions when network is restored
  usePendingCompletionSync();
  
  // Unified app initialization: seeding + intro
  const { showIntro, completeIntro } = useAppInitialization();
  
  return (
    <IntroModal 
      open={showIntro} 
      onComplete={completeIntro}
    />
  );
}
