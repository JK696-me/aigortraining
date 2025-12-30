import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { calculateProgressionForSession } from '@/lib/progression';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface PendingCompletion {
  sessionId: string;
  finalElapsed: number;
  completedAt: string;
  undoUntil: string;
}

const PENDING_COMPLETION_PREFIX = 'pending_completion_';

function getPendingCompletions(): PendingCompletion[] {
  const completions: PendingCompletion[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PENDING_COMPLETION_PREFIX)) {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          completions.push(JSON.parse(data));
        }
      } catch (e) {
        console.error('Failed to parse pending completion:', e);
      }
    }
  }
  
  return completions;
}

function removePendingCompletion(sessionId: string) {
  localStorage.removeItem(`${PENDING_COMPLETION_PREFIX}${sessionId}`);
}

export function usePendingCompletionSync() {
  const { user } = useAuth();
  const { locale } = useLanguage();
  const queryClient = useQueryClient();
  const isSyncingRef = useRef(false);

  const syncPendingCompletions = useCallback(async () => {
    if (!user || isSyncingRef.current) return;
    
    const pendingCompletions = getPendingCompletions();
    if (pendingCompletions.length === 0) return;
    
    isSyncingRef.current = true;
    console.log('[PendingCompletionSync] Syncing', pendingCompletions.length, 'pending completions');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const completion of pendingCompletions) {
      try {
        // Calculate progression
        await calculateProgressionForSession(completion.sessionId, user.id);
        
        // Update session status
        const { error } = await supabase
          .from('sessions')
          .update({
            status: 'completed',
            completed_at: completion.completedAt,
            elapsed_seconds: completion.finalElapsed,
            timer_running: false,
            undo_available_until: completion.undoUntil,
          })
          .eq('id', completion.sessionId);
        
        if (error) throw error;
        
        // Remove from pending
        removePendingCompletion(completion.sessionId);
        
        // Update history cache - remove _pending flag
        queryClient.setQueryData(
          queryKeys.sessions.completedList(user.id),
          (oldData: { pages: { data: ({ _pending?: boolean } & Record<string, unknown>)[]; nextCursor: string | null }[]; pageParams: (string | null)[] } | undefined) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              pages: oldData.pages.map(page => ({
                ...page,
                data: page.data.map(s => 
                  s.id === completion.sessionId ? { ...s, _pending: undefined } : s
                ),
              })),
            };
          }
        );
        
        successCount++;
      } catch (error) {
        console.error('[PendingCompletionSync] Failed to sync completion:', completion.sessionId, error);
        failCount++;
      }
    }
    
    isSyncingRef.current = false;
    
    if (successCount > 0) {
      toast.success(
        locale === 'ru' 
          ? `Синхронизировано: ${successCount} тренировок` 
          : `Synced: ${successCount} workouts`
      );
      // Refresh history
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.completedList(user.id) });
    }
    
    if (failCount > 0) {
      console.log('[PendingCompletionSync]', failCount, 'completions still pending');
    }
  }, [user, locale, queryClient]);

  // Sync on mount if online
  useEffect(() => {
    if (navigator.onLine && user) {
      // Small delay to let app settle
      const timeout = setTimeout(syncPendingCompletions, 1000);
      return () => clearTimeout(timeout);
    }
  }, [user, syncPendingCompletions]);

  // Sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      console.log('[PendingCompletionSync] Network restored, checking pending completions');
      syncPendingCompletions();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncPendingCompletions]);

  // Sync when tab becomes visible (in case user switched tabs while offline)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        syncPendingCompletions();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncPendingCompletions]);

  return { syncPendingCompletions };
}
