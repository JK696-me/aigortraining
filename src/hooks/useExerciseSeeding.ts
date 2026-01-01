import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'

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

export function useExerciseSeeding() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hasSeededRef = useRef(false)

  useEffect(() => {
    if (!user?.id || hasSeededRef.current) return

    const ensureSeededExercises = async () => {
      try {
        // Check if user already has exercises
        const { count, error: countError } = await supabase
          .from('exercises')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        if (countError) {
          console.error('Seed exercises: count error', countError)
          return
        }

        console.log(`Seed exercises: count=${count}`)

        if (count && count > 0) {
          hasSeededRef.current = true
          return
        }

        // Insert seed exercises using upsert to handle conflicts
        const exercisesToInsert = SEED_EXERCISES.map(ex => ({
          ...ex,
          user_id: user.id,
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
          toast.error('Ошибка создания базовых упражнений')
          return
        }

        const insertedCount = insertedExercises?.length ?? 0
        console.log(`Seed exercises: inserted ${insertedCount}`)
        
        if (insertedCount > 0) {
          toast.success(`Добавлено ${insertedCount} базовых упражнений`)
        }

        // Invalidate caches
        queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(user.id) })
        
        hasSeededRef.current = true
      } catch (error) {
        console.error('Seed exercises ERROR:', error)
      }
    }

    ensureSeededExercises()
  }, [user?.id, queryClient])
}
