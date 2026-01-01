import { useEffect } from "react";
import { usePendingCompletionSync } from "@/hooks/usePendingCompletionSync";
import { useAppInitialization } from "@/hooks/useAppInitialization";
import { IntroModal } from "@/components/IntroModal";
import { useIntro } from "@/contexts/IntroContext";

// This component runs background sync tasks for authenticated users
export function BackgroundSyncManager() {
  // Auto-sync pending workout completions when network is restored
  usePendingCompletionSync();
  
  // Unified app initialization: seeding + intro
  const { showIntro, completeIntro } = useAppInitialization();
  const { setIntroOpen } = useIntro();
  
  // Sync intro state with context
  useEffect(() => {
    setIntroOpen(showIntro);
  }, [showIntro, setIntroOpen]);

  const handleComplete = (dismiss: boolean) => {
    setIntroOpen(false);
    completeIntro(dismiss);
  };
  
  return (
    <IntroModal 
      open={showIntro} 
      onComplete={handleComplete}
    />
  );
}
