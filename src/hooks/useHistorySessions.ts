import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { queryKeys, CACHE_TTL } from '@/lib/queryKeys'

const PAGE_SIZE = 20

// Lightweight session for list view
export interface SessionListItem {
  id: string
  date: string
  completed_at: string
  undo_available_until: string | null
  source: string
  template_id: string | null
  template_name: string | null
  auto_completed?: boolean
  exercise_count: number
  set_count: number
  _pending?: boolean  // True if optimistically added, waiting for server sync
}

// Full session details for detail view
export interface SessionDetail {
  id: string
  date: string
  completed_at: string
  undo_available_until: string | null
  exercises: {
    id: string
    exercise_id: string
    name: string
    rpe: number | null
    sets: { weight: number; reps: number; set_index: number }[]
  }[]
}

// Lightweight list hook with infinite scroll
export function useCompletedSessionsList() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey: queryKeys.sessions.completedList(user?.id || ''),
    queryFn: async ({ pageParam }) => {
      if (!user) return { data: [], nextCursor: null }

      let queryBuilder = supabase
        .from('sessions')
        .select(`
          id,
          date,
          completed_at,
          undo_available_until,
          source,
          template_id,
          auto_completed,
          workout_templates(name)
        `)
        .eq('user_id', user.id)
        .in('status', ['completed', 'completed_pending']) // Include both statuses
        .order('completed_at', { ascending: false })
        .limit(PAGE_SIZE)

      // Cursor-based pagination
      if (pageParam) {
        queryBuilder = queryBuilder.lt('completed_at', pageParam)
      }

      const { data: sessionsData, error: sessionsError } = await queryBuilder

      if (sessionsError) throw sessionsError
      if (!sessionsData || sessionsData.length === 0) {
        return { data: [], nextCursor: null }
      }

      // Get exercise and set counts in batch - single query for all sessions
      const sessionIds = sessionsData.map(s => s.id)
      
      const { data: exerciseCounts } = await supabase
        .from('session_exercises')
        .select('session_id, id')
        .in('session_id', sessionIds)

      // Count exercises per session
      const exerciseCountMap = new Map<string, number>()
      const sessionExerciseIds: string[] = []
      
      for (const ex of exerciseCounts || []) {
        exerciseCountMap.set(ex.session_id, (exerciseCountMap.get(ex.session_id) || 0) + 1)
        sessionExerciseIds.push(ex.id)
      }

      // Get set counts for all session exercises in one query
      let setCountMap = new Map<string, number>()
      if (sessionExerciseIds.length > 0) {
        const { data: setCounts } = await supabase
          .from('sets')
          .select('session_exercise_id')
          .in('session_exercise_id', sessionExerciseIds)

        // Count sets per session exercise, then aggregate to session
        const seSetCounts = new Map<string, number>()
        for (const s of setCounts || []) {
          seSetCounts.set(s.session_exercise_id, (seSetCounts.get(s.session_exercise_id) || 0) + 1)
        }

        // Map back to sessions
        for (const ex of exerciseCounts || []) {
          const currentCount = setCountMap.get(ex.session_id) || 0
          setCountMap.set(ex.session_id, currentCount + (seSetCounts.get(ex.id) || 0))
        }
      }

      const sessions: SessionListItem[] = sessionsData.map(session => ({
        id: session.id,
        date: session.date,
        completed_at: session.completed_at,
        undo_available_until: session.undo_available_until,
        source: session.source,
        template_id: session.template_id,
        template_name: (session.workout_templates as any)?.name || null,
        auto_completed: (session as any).auto_completed ?? false,
        exercise_count: exerciseCountMap.get(session.id) || 0,
        set_count: setCountMap.get(session.id) || 0,
      }))

      const nextCursor = sessionsData.length === PAGE_SIZE 
        ? sessionsData[sessionsData.length - 1].completed_at 
        : null

      return { data: sessions, nextCursor }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled: !!user,
    staleTime: CACHE_TTL.MEDIUM, // Use MEDIUM to reduce aggressive refetching
    gcTime: CACHE_TTL.MEDIUM * 2,
    // Merge strategy: preserve _pending items that aren't in server response yet
    structuralSharing: (oldData, newData) => {
      if (!oldData || !newData) return newData as typeof oldData;
      
      const typedOld = oldData as { pages: { data: SessionListItem[]; nextCursor: string | null }[]; pageParams: (string | null)[] };
      const typedNew = newData as { pages: { data: SessionListItem[]; nextCursor: string | null }[]; pageParams: (string | null)[] };
      
      // Get all pending items from old data
      const pendingItems = typedOld.pages
        .flatMap(p => p.data)
        .filter(s => s._pending);
      
      if (pendingItems.length === 0) return newData as typeof oldData;
      
      // Get all IDs from new data
      const newIds = new Set(typedNew.pages.flatMap(p => p.data.map(s => s.id)));
      
      // Keep pending items that aren't in server response yet
      const pendingToKeep = pendingItems.filter(p => !newIds.has(p.id));
      
      if (pendingToKeep.length === 0) return newData as typeof oldData;
      
      // Prepend pending items to first page
      return {
        ...typedNew,
        pages: typedNew.pages.map((page, idx) => 
          idx === 0 
            ? { ...page, data: [...pendingToKeep, ...page.data] }
            : page
        ),
      } as typeof oldData;
    },
  })

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.completedList(user?.id || '') })
    },
  })

  return {
    sessions: query.data?.pages.flatMap(p => p.data) || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    deleteSession: deleteSession.mutateAsync,
    isDeleting: deleteSession.isPending,
    refetch: query.refetch,
  }
}

// Session details hook - only fetches when opening a specific session
export function useSessionDetails(sessionId: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: queryKeys.sessions.details(sessionId || ''),
    queryFn: async (): Promise<SessionDetail | null> => {
      if (!sessionId || !user) return null

      // Get session basic info
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, date, completed_at, undo_available_until')
        .eq('id', sessionId)
        .single()

      if (sessionError || !session) return null

      // Get all session exercises with exercise names in ONE query
      const { data: sessionExercises, error: seError } = await supabase
        .from('session_exercises')
        .select(`
          id,
          exercise_id,
          rpe,
          exercise:exercises(name)
        `)
        .eq('session_id', sessionId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (seError) return null

      const exerciseIds = sessionExercises?.map(se => se.id) || []

      // Get ALL sets for all exercises in ONE query
      let allSets: { session_exercise_id: string; weight: number; reps: number; set_index: number }[] = []
      if (exerciseIds.length > 0) {
        const { data: setsData } = await supabase
          .from('sets')
          .select('session_exercise_id, weight, reps, set_index')
          .in('session_exercise_id', exerciseIds)
          .order('set_index')

        allSets = setsData || []
      }

      // Group sets by session_exercise_id
      const setsByExercise = new Map<string, typeof allSets>()
      for (const set of allSets) {
        const existing = setsByExercise.get(set.session_exercise_id) || []
        existing.push(set)
        setsByExercise.set(set.session_exercise_id, existing)
      }

      // Build exercises array
      const exercises = (sessionExercises || []).map(se => ({
        id: se.id,
        exercise_id: se.exercise_id,
        name: (se.exercise as any)?.name || 'Unknown',
        rpe: se.rpe,
        sets: (setsByExercise.get(se.id) || []).map(s => ({
          weight: s.weight,
          reps: s.reps,
          set_index: s.set_index,
        })),
      }))

      return {
        id: session.id,
        date: session.date,
        completed_at: session.completed_at,
        undo_available_until: session.undo_available_until,
        exercises,
      }
    },
    enabled: !!sessionId && !!user,
    staleTime: CACHE_TTL.LONG, // Details don't change often
    gcTime: CACHE_TTL.LONG * 2,
  })
}
