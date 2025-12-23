import { createContext, useContext, useEffect, useCallback, useRef, ReactNode } from 'react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys, CACHE_TTL } from '@/lib/queryKeys';
import { clearUserCache, cacheDebug } from '@/lib/queryClient';

interface CacheContextType {
  prefetchEssentialData: () => Promise<void>;
  invalidateExercises: () => void;
  invalidateTemplates: (templateId?: string) => void;
  invalidateSessions: (exerciseIds?: string[]) => void;
  invalidateExerciseHistory: (exerciseId: string) => void;
  clearAllCache: () => Promise<void>;
  getCacheStats: () => { totalRequests: number; recentCacheOps: { key: string; status: string; timestamp: number }[] };
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

interface CacheProviderProps {
  children: ReactNode;
  queryClient: QueryClient;
}

export function CacheProvider({ children, queryClient }: CacheProviderProps) {
  const { user } = useAuth();
  const previousUserIdRef = useRef<string | null>(null);

  // Clear cache when user logs out
  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    
    if (previousUserId && !user) {
      // User logged out - clear their cache
      clearUserCache(previousUserId);
      queryClient.clear();
      cacheDebug.reset();
    }
    
    previousUserIdRef.current = user?.id || null;
  }, [user, queryClient]);

  // Prefetch essential data after login
  const prefetchEssentialData = useCallback(async () => {
    if (!user) return;

    const userId = user.id;

    // Prefetch exercises list
    queryClient.prefetchQuery({
      queryKey: queryKeys.exercises.list(userId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('exercises')
          .select('*')
          .eq('user_id', userId)
          .order('name');
        if (error) throw error;
        return data;
      },
      staleTime: CACHE_TTL.LONG,
    });

    // Prefetch templates list
    queryClient.prefetchQuery({
      queryKey: queryKeys.templates.list(userId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('workout_templates')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      },
      staleTime: CACHE_TTL.LONG,
    });

    // Prefetch user settings
    queryClient.prefetchQuery({
      queryKey: queryKeys.userSettings(userId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
      },
      staleTime: CACHE_TTL.LONG,
    });
  }, [user, queryClient]);

  // Trigger prefetch on login
  useEffect(() => {
    if (user) {
      prefetchEssentialData();
    }
  }, [user, prefetchEssentialData]);

  // Invalidation helpers
  const invalidateExercises = useCallback(() => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(user.id) });
  }, [user, queryClient]);

  const invalidateTemplates = useCallback((templateId?: string) => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.templates.all(user.id) });
    if (templateId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.items(templateId) });
    }
  }, [user, queryClient]);

  const invalidateSessions = useCallback((exerciseIds?: string[]) => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(user.id) });
    
    // Also invalidate exercise history for affected exercises
    if (exerciseIds) {
      exerciseIds.forEach(exerciseId => {
        queryClient.invalidateQueries({ queryKey: queryKeys.exercises.history(exerciseId) });
      });
    }
  }, [user, queryClient]);

  const invalidateExerciseHistory = useCallback((exerciseId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.exercises.history(exerciseId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.exercises.state(exerciseId) });
  }, [queryClient]);

  const clearAllCache = useCallback(async () => {
    if (user) {
      await clearUserCache(user.id);
    }
    queryClient.clear();
    cacheDebug.reset();
  }, [user, queryClient]);

  const getCacheStats = useCallback(() => {
    return cacheDebug.getStats();
  }, []);

  return (
    <CacheContext.Provider
      value={{
        prefetchEssentialData,
        invalidateExercises,
        invalidateTemplates,
        invalidateSessions,
        invalidateExerciseHistory,
        clearAllCache,
        getCacheStats,
      }}
    >
      {children}
    </CacheContext.Provider>
  );
}

export function useCache() {
  const context = useContext(CacheContext);
  if (context === undefined) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
}
