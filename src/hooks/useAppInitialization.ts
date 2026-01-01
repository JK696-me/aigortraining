import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'

interface OnboardingState {
  user_id: string
  first_seen_at: string | null
  intro_completed_at: string | null
  intro_dismissed: boolean
  seed_done: boolean
  updated_at: string
}

interface SeedExercise {
  name: string
  type: number
  increment_kind: 'barbell' | 'dumbbells' | 'machine'
  increment_value: number
  is_dumbbell_pair: boolean
}

const SEED_EXERCISES: SeedExercise[] = [
  // Грудь (Chest)
  { name: 'Жим штанги лёжа', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Жим гантелей лёжа', type: 1, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Жим штанги на наклонной скамье', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Жим гантелей на наклонной скамье', type: 1, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Сведение на грудь в бабочке', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Сведение в кроссовере (среднее положение)', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  // Спина (Back)
  { name: 'Тяга верхнего блока', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Тяга среднего блока', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Тяга штанги в наклоне', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Тяга гантелей в наклоне', type: 1, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Пуловер', type: 3, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: false },
  { name: 'Становая тяга', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  // Ноги/ягодицы (Legs/Glutes)
  { name: 'Приседание', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Гак-приседания', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Болгарские выпады', type: 3, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Ягодичный мост со штангой', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Ягодичный мост в тренажёре', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  // Плечи (Shoulders)
  { name: 'Махи гантелями', type: 3, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Протяжка гантелей', type: 3, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Протяжка штанги', type: 3, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Разведение на заднюю дельту в бабочке', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  // Руки (Arms)
  { name: 'Подъём гантелей на бицепс', type: 3, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Подъём штанги на бицепс', type: 3, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Разгибание на трицепс в кроссовере', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
]

export function useAppInitialization() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const initRef = useRef(false)
  const [showIntro, setShowIntro] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  const ensureSeededExercises = useCallback(async (userId: string) => {
    try {
      const { count, error: countError } = await supabase
        .from('exercises')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      if (countError) {
        console.error('Seed exercises: count error', countError)
        return
      }

      if (count && count > 0) return

      const exercisesToInsert = SEED_EXERCISES.map(ex => ({
        ...ex,
        user_id: userId,
      }))

      const { data: insertedExercises, error: insertError } = await supabase
        .from('exercises')
        .upsert(exercisesToInsert, { 
          onConflict: 'user_id,name',
          ignoreDuplicates: true 
        })
        .select()

      if (insertError) {
        console.error('Seed exercises ERROR:', insertError)
        return
      }

      const insertedCount = insertedExercises?.length ?? 0
      console.log(`Seed exercises: inserted ${insertedCount}`)
      
      if (insertedCount > 0) {
        toast.success(`Добавлено ${insertedCount} базовых упражнений`)
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(userId) })
    } catch (error) {
      console.error('Seed exercises ERROR:', error)
    }
  }, [queryClient])

  const ensureSeededTemplates = useCallback(async (userId: string) => {
    try {
      const { count, error: countError } = await supabase
        .from('workout_templates')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      if (countError) {
        console.error('Seed templates: count error', countError)
        return
      }

      if (count && count > 0) return

      const { data: seedTemplates, error: seedError } = await supabase
        .from('seed_templates')
        .select('id, key, title_ru')

      if (seedError || !seedTemplates?.length) {
        console.error('Seed templates: fetch error', seedError)
        return
      }

      const { data: seedItems, error: itemsError } = await supabase
        .from('seed_template_items')
        .select('seed_template_id, exercise_name_ru, sort_order, target_sets')
        .order('sort_order')

      if (itemsError) {
        console.error('Seed templates: items fetch error', itemsError)
        return
      }

      const { data: userExercises, error: exError } = await supabase
        .from('exercises')
        .select('id, name')
        .eq('user_id', userId)

      if (exError) {
        console.error('Seed templates: exercises fetch error', exError)
        return
      }

      const exerciseNameToId = new Map(
        userExercises?.map(ex => [ex.name, ex.id]) || []
      )

      let templatesCreated = 0

      for (const seedTemplate of seedTemplates) {
        const { data: newTemplate, error: createError } = await supabase
          .from('workout_templates')
          .insert({
            user_id: userId,
            name: seedTemplate.title_ru,
            seed_key: seedTemplate.key
          })
          .select('id')
          .single()

        if (createError) {
          console.log(`Seed templates: ${seedTemplate.key} already exists or error`, createError)
          continue
        }

        const templateItems = seedItems?.filter(
          item => item.seed_template_id === seedTemplate.id
        ) || []

        const itemsToInsert = []
        for (const item of templateItems) {
          let exerciseId = exerciseNameToId.get(item.exercise_name_ru)

          if (!exerciseId) {
            console.log(`Seed templates: creating missing exercise "${item.exercise_name_ru}"`)
            const { data: newEx, error: newExError } = await supabase
              .from('exercises')
              .insert({
                user_id: userId,
                name: item.exercise_name_ru,
                type: 3,
                increment_kind: 'machine',
                increment_value: 1,
                is_dumbbell_pair: false
              })
              .select('id')
              .single()

            if (newExError) {
              console.error(`Seed templates: failed to create exercise "${item.exercise_name_ru}"`, newExError)
              continue
            }
            exerciseId = newEx.id
            exerciseNameToId.set(item.exercise_name_ru, exerciseId)
          }

          itemsToInsert.push({
            template_id: newTemplate.id,
            exercise_id: exerciseId,
            sort_order: item.sort_order,
            target_sets: item.target_sets
          })
        }

        if (itemsToInsert.length > 0) {
          const { error: insertItemsError } = await supabase
            .from('template_items')
            .insert(itemsToInsert)

          if (insertItemsError) {
            console.error(`Seed templates: items insert error for ${seedTemplate.key}`, insertItemsError)
          }
        }

        templatesCreated++
      }

      if (templatesCreated > 0) {
        console.log(`Seed templates: inserted ${templatesCreated}`)
        toast.success(`Добавили ${templatesCreated} стартовых шаблона`)
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all(userId) })
    } catch (error) {
      console.error('Seed templates ERROR:', error)
    }
  }, [queryClient])

  const completeIntro = useCallback(async (dismiss: boolean = false) => {
    if (!user?.id) return

    const updates: Partial<OnboardingState> = {
      intro_completed_at: new Date().toISOString(),
    }
    if (dismiss) {
      updates.intro_dismissed = true
    }

    await supabase
      .from('onboarding_state')
      .update(updates)
      .eq('user_id', user.id)

    setShowIntro(false)
    queryClient.invalidateQueries({ queryKey: ['onboarding-state', user.id] })
  }, [user?.id, queryClient])

  const repeatIntro = useCallback(() => {
    setShowIntro(true)
  }, [])

  useEffect(() => {
    if (!user?.id || initRef.current) return
    initRef.current = true

    const initialize = async () => {
      try {
        // Step 1: Initialize onboarding state
        const { data: existing, error: fetchError } = await supabase
          .from('onboarding_state')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()

        if (fetchError) {
          console.error('Init: fetch onboarding state error', fetchError)
          setIsInitialized(true)
          return
        }

        let state: OnboardingState
        let isFirstSeen = false

        if (existing) {
          state = existing as OnboardingState
          // Check if first_seen_at is null (first app visit after registration)
          if (!state.first_seen_at) {
            const { data: updated, error: updateError } = await supabase
              .from('onboarding_state')
              .update({ first_seen_at: new Date().toISOString() })
              .eq('user_id', user.id)
              .select()
              .single()

            if (updateError) {
              console.error('Init: update first_seen_at error', updateError)
            } else {
              state = updated as OnboardingState
              isFirstSeen = true
            }
          }
        } else {
          // Create new state with first_seen_at set
          const { data: created, error: createError } = await supabase
            .from('onboarding_state')
            .insert({
              user_id: user.id,
              first_seen_at: new Date().toISOString()
            })
            .select()
            .single()

          if (createError) {
            console.error('Init: create onboarding state error', createError)
            setIsInitialized(true)
            return
          }
          state = created as OnboardingState
          isFirstSeen = true
        }

        // Step 2: Run seeding if not done
        if (!state.seed_done) {
          await ensureSeededExercises(user.id)
          await ensureSeededTemplates(user.id)

          await supabase
            .from('onboarding_state')
            .update({ seed_done: true })
            .eq('user_id', user.id)

          state.seed_done = true
        }

        // Step 3: Show intro if first seen and not dismissed/completed
        if (isFirstSeen && !state.intro_dismissed && !state.intro_completed_at) {
          setShowIntro(true)
        }

        setIsInitialized(true)
      } catch (error) {
        console.error('App initialization ERROR:', error)
        setIsInitialized(true)
      }
    }

    initialize()
  }, [user?.id, ensureSeededExercises, ensureSeededTemplates])

  return {
    showIntro,
    isInitialized,
    completeIntro,
    repeatIntro,
  }
}
