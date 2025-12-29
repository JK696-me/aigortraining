import { supabase } from '@/integrations/supabase/client'

interface ExerciseSeed {
  name: string
  type: number
  increment_kind: 'barbell' | 'dumbbells' | 'machine'
  increment_value: number
  is_dumbbell_pair: boolean
}

const SEED_EXERCISES: ExerciseSeed[] = [
  // Грудь / жим
  { name: 'Жим штанги лёжа', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Жим гантелей лёжа', type: 1, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Жим штанги на наклонной скамье', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Жим гантелей на наклонной скамье', type: 1, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Сведение на грудь в бабочке', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Сведение в кроссовере (верхнее положение)', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Сведение в кроссовере (среднее положение)', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  
  // Ноги / ягодицы
  { name: 'Приседание', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Гак-приседания', type: 1, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Болгарские выпады', type: 1, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Ягодичный мост со штангой', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Ягодичный мост в тренажёре', type: 1, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  
  // Спина / тяги
  { name: 'Становая тяга', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Тяга верхнего блока', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Тяга среднего блока', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  { name: 'Тяга штанги в наклоне', type: 1, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Тяга гантелей в наклоне', type: 1, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Пуловер', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
  
  // Руки
  { name: 'Подъём гантелей на бицепс', type: 3, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Подъём штанги на бицепс', type: 3, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  
  // Плечи
  { name: 'Махи гантелями', type: 3, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Протяжка гантелей', type: 3, increment_kind: 'dumbbells', increment_value: 2, is_dumbbell_pair: true },
  { name: 'Протяжка штанги', type: 3, increment_kind: 'barbell', increment_value: 5, is_dumbbell_pair: false },
  { name: 'Разведение на заднюю дельту в бабочке', type: 3, increment_kind: 'machine', increment_value: 1, is_dumbbell_pair: false },
]

const SEED_FLAG_KEY = 'exercises_seeded'

export async function seedExercisesForUser(userId: string): Promise<{ seeded: boolean; error?: string }> {
  // Check if already seeded in this session (localStorage flag)
  const seedFlag = localStorage.getItem(`${SEED_FLAG_KEY}_${userId}`)
  if (seedFlag === 'true') {
    return { seeded: false }
  }

  try {
    // Check if user already has any exercises
    const { data: existingExercises, error: checkError } = await supabase
      .from('exercises')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (checkError) {
      console.error('Error checking existing exercises:', checkError)
      return { seeded: false, error: checkError.message }
    }

    // If user already has exercises, mark as seeded and skip
    if (existingExercises && existingExercises.length > 0) {
      localStorage.setItem(`${SEED_FLAG_KEY}_${userId}`, 'true')
      return { seeded: false }
    }

    // Create all exercises
    const exercisesToInsert = SEED_EXERCISES.map(ex => ({
      user_id: userId,
      name: ex.name,
      type: ex.type,
      increment_kind: ex.increment_kind,
      increment_value: ex.increment_value,
      is_dumbbell_pair: ex.is_dumbbell_pair,
    }))

    const { data: insertedExercises, error: insertError } = await supabase
      .from('exercises')
      .insert(exercisesToInsert)
      .select('id')

    if (insertError) {
      console.error('Error inserting seed exercises:', insertError)
      return { seeded: false, error: insertError.message }
    }

    // Note: exercise_state is created automatically via the handle_new_exercise trigger
    // No need to manually create exercise_state records

    // Mark as seeded
    localStorage.setItem(`${SEED_FLAG_KEY}_${userId}`, 'true')

    console.log(`Seeded ${insertedExercises?.length || 0} exercises for user ${userId}`)
    return { seeded: true }
  } catch (error) {
    console.error('Error seeding exercises:', error)
    return { seeded: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
