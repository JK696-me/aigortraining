import { useEffect, useRef } from "react";
import { usePendingCompletionSync } from "@/hooks/usePendingCompletionSync";
import { useAppInitialization } from "@/hooks/useAppInitialization";
import { useIntro } from "@/contexts/IntroContext";
import { useTour } from "@/contexts/TourContext";

// This component runs background sync tasks for authenticated users
export function BackgroundSyncManager() {
  // Auto-sync pending workout completions when network is restored
  usePendingCompletionSync();
  
  // Unified app initialization: seeding + intro
  const { showIntro, completeIntro } = useAppInitialization();
  const { setIntroOpen } = useIntro();
  const { startTour, isActive: isTourActive, dismissOnEnd } = useTour();
  const wasActiveRef = useRef(false);
  
  // Start tour when intro should show
  useEffect(() => {
    if (showIntro && !isTourActive && !wasActiveRef.current) {
      startTour();
      setIntroOpen(true);
    }
  }, [showIntro, isTourActive, startTour, setIntroOpen]);

  // Handle tour ending
  useEffect(() => {
    if (wasActiveRef.current && !isTourActive) {
      // Tour just ended
      setIntroOpen(false);
      completeIntro(dismissOnEnd);
    }
    wasActiveRef.current = isTourActive;
  }, [isTourActive, setIntroOpen, completeIntro, dismissOnEnd]);
  
  return null;
}
