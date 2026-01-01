import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { CACHE_TTL } from '@/lib/queryKeys'

export interface OnboardingState {
  user_id: string
  first_seen_at: string | null
  intro_completed_at: string | null
  intro_dismissed: boolean
  seed_done: boolean
  updated_at: string
}

export function useOnboardingState() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const queryKey = ['onboarding-state', user?.id] as const

  const { data: state, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<OnboardingState | null> => {
      if (!user?.id) return null

      const { data, error } = await supabase
        .from('onboarding_state')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Failed to fetch onboarding state:', error)
        throw error
      }

      return data as OnboardingState | null
    },
    enabled: !!user?.id,
    staleTime: CACHE_TTL.LONG,
    gcTime: CACHE_TTL.LONG * 2,
  })

  const updateState = useMutation({
    mutationFn: async (updates: Partial<Omit<OnboardingState, 'user_id' | 'updated_at'>>) => {
      if (!user?.id) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('onboarding_state')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error
      return data as OnboardingState
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data)
    },
  })

  // Initialize onboarding state for new user
  const initializeState = useMutation({
    mutationFn: async (): Promise<{ state: OnboardingState; isFirstSeen: boolean }> => {
      if (!user?.id) throw new Error('Not authenticated')

      // Check if state exists
      const { data: existing, error: fetchError } = await supabase
        .from('onboarding_state')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (fetchError) throw fetchError

      // State exists
      if (existing) {
        const state = existing as OnboardingState
        // Check if first_seen_at is null (first app visit after registration)
        if (!state.first_seen_at) {
          const { data: updated, error: updateError } = await supabase
            .from('onboarding_state')
            .update({ first_seen_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .select()
            .single()

          if (updateError) throw updateError
          return { state: updated as OnboardingState, isFirstSeen: true }
        }
        return { state, isFirstSeen: false }
      }

      // Create new state with first_seen_at set
      const { data: created, error: createError } = await supabase
        .from('onboarding_state')
        .insert({
          user_id: user.id,
          first_seen_at: new Date().toISOString()
        })
        .select()
        .single()

      if (createError) throw createError
      return { state: created as OnboardingState, isFirstSeen: true }
    },
    onSuccess: ({ state }) => {
      queryClient.setQueryData(queryKey, state)
    },
  })

  const completeIntro = useMutation({
    mutationFn: async (dismiss: boolean = false) => {
      if (!user?.id) throw new Error('Not authenticated')

      const updates: Partial<OnboardingState> = {
        intro_completed_at: new Date().toISOString(),
      }
      if (dismiss) {
        updates.intro_dismissed = true
      }

      const { data, error } = await supabase
        .from('onboarding_state')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error
      return data as OnboardingState
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data)
    },
  })

  const markSeedDone = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('onboarding_state')
        .update({ seed_done: true })
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error
      return data as OnboardingState
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data)
    },
  })

  return {
    state,
    isLoading,
    refetch,
    initializeState: initializeState.mutateAsync,
    isInitializing: initializeState.isPending,
    updateState: updateState.mutateAsync,
    completeIntro: completeIntro.mutateAsync,
    markSeedDone: markSeedDone.mutateAsync,
    // Derived states
    shouldShowIntro: state && !state.intro_completed_at && !state.intro_dismissed,
    canRepeatIntro: state && state.intro_completed_at && !state.intro_dismissed,
  }
}
