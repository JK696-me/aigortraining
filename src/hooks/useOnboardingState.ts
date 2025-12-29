import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { queryKeys, CACHE_TTL } from '@/lib/queryKeys'

export interface OnboardingState {
  user_id: string
  step_exercises_done: boolean
  step_template_done: boolean
  step_workout_done: boolean
  step_progress_done: boolean
  dismissed: boolean
  coach_marks_shown: string[]
  created_at: string
  updated_at: string
}

// Type for database operations since the table isn't in types.ts yet
interface OnboardingDbRow {
  user_id: string
  step_exercises_done: boolean
  step_template_done: boolean
  step_workout_done: boolean
  step_progress_done: boolean
  dismissed: boolean
  coach_marks_shown: string[]
  created_at: string
  updated_at: string
}

export function useOnboardingState() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: onboarding, isLoading } = useQuery({
    queryKey: queryKeys.onboardingState(user?.id || ''),
    queryFn: async (): Promise<OnboardingState | null> => {
      if (!user) return null

      // Direct query using type assertion since table isn't in generated types yet
      const { data: directData, error: directError } = await supabase
        .from('onboarding_state' as never)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle() as { data: OnboardingDbRow | null, error: unknown }

      if (directError) {
        console.error('Error fetching onboarding state:', directError)
        return null
      }

      // If no onboarding state exists, create it
      if (!directData) {
        const { data: newState, error: insertError } = await supabase
          .from('onboarding_state' as never)
          .insert({ user_id: user.id } as never)
          .select()
          .single() as { data: OnboardingDbRow | null, error: unknown }

        if (insertError) {
          console.error('Error creating onboarding state:', insertError)
          return null
        }
        return newState as OnboardingState
      }

      return directData as OnboardingState
    },
    enabled: !!user,
    staleTime: CACHE_TTL.SHORT,
    gcTime: CACHE_TTL.MEDIUM,
  })

  // Check actual progress from database
  const { data: actualProgress } = useQuery({
    queryKey: ['onboarding-progress', user?.id],
    queryFn: async () => {
      if (!user) return null

      // Check exercises count
      const { count: exerciseCount } = await supabase
        .from('exercises')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      // Check templates count
      const { count: templateCount } = await supabase
        .from('workout_templates')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      // Check completed sessions count
      const { count: completedCount } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed')

      return {
        hasExercises: (exerciseCount || 0) >= 1,
        hasTemplates: (templateCount || 0) >= 1,
        hasCompletedWorkout: (completedCount || 0) >= 1,
      }
    },
    enabled: !!user,
    staleTime: CACHE_TTL.SHORT,
  })

  const updateOnboarding = useMutation({
    mutationFn: async (updates: Partial<Pick<OnboardingState, 'step_progress_done' | 'dismissed' | 'coach_marks_shown'>>) => {
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('onboarding_state' as never)
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq('user_id', user.id)
        .select()
        .single() as { data: OnboardingDbRow | null, error: unknown }

      if (error) throw error
      return data as OnboardingState
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.onboardingState(user?.id || '') })
    },
  })

  const dismissOnboarding = () => {
    updateOnboarding.mutate({ dismissed: true })
  }

  const markProgressViewed = () => {
    if (onboarding && !onboarding.step_progress_done) {
      updateOnboarding.mutate({ step_progress_done: true })
    }
  }

  const markCoachMarkShown = (markId: string) => {
    if (!onboarding) return
    const shown = onboarding.coach_marks_shown || []
    if (!shown.includes(markId)) {
      updateOnboarding.mutate({ coach_marks_shown: [...shown, markId] })
    }
  }

  const isCoachMarkShown = (markId: string) => {
    if (!onboarding) return true // Don't show if loading
    return (onboarding.coach_marks_shown || []).includes(markId)
  }

  // Computed steps based on actual progress
  const steps = {
    exercises: actualProgress?.hasExercises || onboarding?.step_exercises_done || false,
    template: actualProgress?.hasTemplates || onboarding?.step_template_done || false,
    workout: actualProgress?.hasCompletedWorkout || onboarding?.step_workout_done || false,
    progress: onboarding?.step_progress_done || false,
  }

  const completedCount = Object.values(steps).filter(Boolean).length
  const allCompleted = completedCount === 4
  const shouldShowWidget = onboarding && !onboarding.dismissed && !allCompleted

  return {
    onboarding,
    isLoading,
    steps,
    completedCount,
    allCompleted,
    shouldShowWidget,
    dismissOnboarding,
    markProgressViewed,
    markCoachMarkShown,
    isCoachMarkShown,
    isUpdating: updateOnboarding.isPending,
  }
}
