import { supabase } from "@/integrations/supabase/client"

// Two-stage rep ranges by exercise type
// Stage 1 = base range, Stage 2 = extended range (before weight increase)
const REP_RANGES: Record<number, { 
  stage1: { min: number; max: number; displayText: string };
  stage2: { min: number; max: number; displayText: string };
}> = {
  1: { 
    stage1: { min: 6, max: 8, displayText: '6–8' },
    stage2: { min: 8, max: 12, displayText: '8–12 (цель 10–12)' }
  },
  2: { 
    stage1: { min: 6, max: 8, displayText: '6–8' },
    stage2: { min: 8, max: 12, displayText: '8–12' }
  },
  3: { 
    stage1: { min: 10, max: 12, displayText: '10–12' },
    stage2: { min: 12, max: 15, displayText: '12–15' }
  },
  4: { 
    stage1: { min: 10, max: 12, displayText: '10–12' },
    stage2: { min: 12, max: 20, displayText: '12–20 (цель 15–20)' }
  },
}

const DEFAULT_REP_RANGE = { 
  stage1: { min: 6, max: 8, displayText: '6–8' },
  stage2: { min: 8, max: 12, displayText: '8–12 (цель 10–12)' }
}

export interface ProgressionResult {
  nextWeight: number
  targetRangeText: string
  explanation: string
  updatedState: {
    current_working_weight: number
    current_sets: number
    volume_reduce_on: boolean
    success_streak: number
    fail_streak: number
    last_target_range: string
    last_recommendation_text: string
    rep_stage: number
  }
}

interface ExerciseData {
  id: string
  type: number
  increment_value: number
}

interface ExerciseStateData {
  id: string
  current_working_weight: number
  current_sets: number
  base_sets: number
  volume_reduce_on: boolean
  success_streak: number
  fail_streak: number
  rep_stage: number
}

interface SetData {
  weight: number
  reps: number
  set_index: number
}

export async function calculateRecommendationAndUpdateState(
  exerciseId: string,
  sessionExerciseId: string,
  userId: string
): Promise<ProgressionResult | null> {
  // 1. Load exercise data
  const { data: exercise } = await supabase
    .from('exercises')
    .select('id, type, increment_value')
    .eq('id', exerciseId)
    .single()

  if (!exercise) return null

  // 2. Load exercise state
  const { data: exerciseState } = await supabase
    .from('exercise_state')
    .select('*')
    .eq('exercise_id', exerciseId)
    .eq('user_id', userId)
    .single()

  if (!exerciseState) return null

  // 3. Load sets for this session exercise
  const { data: sets } = await supabase
    .from('sets')
    .select('weight, reps, set_index')
    .eq('session_exercise_id', sessionExerciseId)
    .order('set_index')

  if (!sets || sets.length === 0) return null

  // 4. Load RPE
  const { data: sessionExercise } = await supabase
    .from('session_exercises')
    .select('rpe')
    .eq('id', sessionExerciseId)
    .single()

  const rpe = sessionExercise?.rpe ?? null

  // 5. Calculate progression
  const result = calculateProgression(
    exercise as ExerciseData,
    exerciseState as ExerciseStateData,
    sets as SetData[],
    rpe
  )

  // 6. Save updated state
  await supabase
    .from('exercise_state')
    .update({
      current_working_weight: result.updatedState.current_working_weight,
      current_sets: result.updatedState.current_sets,
      volume_reduce_on: result.updatedState.volume_reduce_on,
      success_streak: result.updatedState.success_streak,
      fail_streak: result.updatedState.fail_streak,
      last_target_range: result.updatedState.last_target_range,
      last_recommendation_text: result.updatedState.last_recommendation_text,
      rep_stage: result.updatedState.rep_stage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', exerciseState.id)

  return result
}

function calculateProgression(
  exercise: ExerciseData,
  state: ExerciseStateData,
  sets: SetData[],
  rpe: number | null
): ProgressionResult {
  const repRanges = REP_RANGES[exercise.type] || DEFAULT_REP_RANGE
  const currentStage = state.rep_stage || 1
  const currentRange = currentStage === 1 ? repRanges.stage1 : repRanges.stage2
  const incrementValue = exercise.increment_value

  // Working sets = first state.current_sets sets by set_index
  const workingSets = sets
    .sort((a, b) => a.set_index - b.set_index)
    .slice(0, state.current_sets)

  if (workingSets.length === 0) {
    const targetRangeText = currentRange.displayText
    return {
      nextWeight: state.current_working_weight,
      targetRangeText,
      explanation: 'Нет данных о подходах.',
      updatedState: {
        current_working_weight: state.current_working_weight,
        current_sets: state.current_sets,
        volume_reduce_on: state.volume_reduce_on,
        success_streak: state.success_streak,
        fail_streak: state.fail_streak,
        last_target_range: targetRangeText,
        last_recommendation_text: 'Нет данных о подходах.',
        rep_stage: currentStage,
      },
    }
  }

  // Current weight = weight of first working set
  const currentWeight = workingSets[0].weight

  // Check conditions based on current stage
  const allAtOrAboveMax = workingSets.every(s => s.reps >= currentRange.max)
  const anyBelowMin = workingSets.some(s => s.reps < currentRange.min)
  const rpeHigh = rpe !== null && rpe >= 8.5
  const rpeLowOrModerate = rpe === null || rpe <= 8

  // Failure = any set below min OR RPE >= 8.5
  const isFailure = anyBelowMin || rpeHigh

  // Initialize updated state
  let newFailStreak = state.fail_streak
  let newSuccessStreak = state.success_streak
  let newVolumeReduceOn = state.volume_reduce_on
  let newCurrentSets = state.current_sets
  let newRepStage = currentStage
  let nextWeight = currentWeight
  let explanation = ''

  // Update streaks based on success/failure
  if (isFailure) {
    newFailStreak += 1
    newSuccessStreak = 0
  } else if (allAtOrAboveMax && rpeLowOrModerate) {
    newSuccessStreak += 1
    newFailStreak = 0
  }

  // Two-stage progression logic
  if (currentStage === 1) {
    // Stage 1: Base range
    if (allAtOrAboveMax && rpeLowOrModerate) {
      // Move to stage 2, don't increase weight
      newRepStage = 2
      nextWeight = currentWeight
      explanation = 'Верх базового диапазона выполнен — переходим на добор повторов без повышения веса.'
    } else if (allAtOrAboveMax && rpeHigh) {
      // Stay in stage 1, RPE too high
      newRepStage = 1
      nextWeight = currentWeight
      explanation = 'Верх выполнен, но RPE высокий — закрепляем в базовом диапазоне.'
    } else {
      // Reps not reached
      newRepStage = 1
      nextWeight = currentWeight
      explanation = 'Добираем повторы в базовом диапазоне, вес сохраняем.'
    }
  } else {
    // Stage 2: Extended range
    if (allAtOrAboveMax && rpeLowOrModerate) {
      // Increase weight and reset to stage 1
      nextWeight = currentWeight + incrementValue
      newRepStage = 1
      explanation = 'Верх расширенного диапазона выполнен и RPE ≤ 8 — увеличиваем вес и возвращаемся в базовый диапазон.'
    } else if (allAtOrAboveMax && rpeHigh) {
      // Stay in stage 2, RPE too high
      nextWeight = currentWeight
      newRepStage = 2
      explanation = 'Верх расширенного диапазона выполнен, но RPE высокий — закрепляем.'
    } else {
      // Reps not reached
      nextWeight = currentWeight
      newRepStage = 2
      explanation = 'Добираем повторы в расширенном диапазоне, вес сохраняем.'
    }
  }

  // Volume reduction logic (same as before)
  // Enable volume reduction if 2 failures in a row
  if (newFailStreak >= 2 && !newVolumeReduceOn) {
    newVolumeReduceOn = true
    newCurrentSets = Math.max(state.base_sets - 1, 1)
    newFailStreak = 0
    newSuccessStreak = 0
    explanation += ' 2 сбоя подряд — уменьшаем объём на 1 подход.'
  }

  // Exit volume reduction if 2 successes in a row
  if (newVolumeReduceOn && newSuccessStreak >= 2) {
    newVolumeReduceOn = false
    newCurrentSets = state.base_sets
    newSuccessStreak = 0
    newFailStreak = 0
    explanation += ' 2 успешные тренировки подряд — возвращаем исходный объём.'
  }

  // Get target range text for the NEW stage (what user should aim for next time)
  const newRange = newRepStage === 1 ? repRanges.stage1 : repRanges.stage2
  const targetRangeText = newRange.displayText

  return {
    nextWeight,
    targetRangeText,
    explanation: explanation.trim(),
    updatedState: {
      current_working_weight: nextWeight,
      current_sets: newCurrentSets,
      volume_reduce_on: newVolumeReduceOn,
      success_streak: newSuccessStreak,
      fail_streak: newFailStreak,
      last_target_range: targetRangeText,
      last_recommendation_text: explanation.trim(),
      rep_stage: newRepStage,
    },
  }
}

// Calculate for all exercises in a session
export async function calculateProgressionForSession(
  sessionId: string,
  userId: string
): Promise<void> {
  // Get all session exercises
  const { data: sessionExercises } = await supabase
    .from('session_exercises')
    .select('id, exercise_id')
    .eq('session_id', sessionId)

  if (!sessionExercises) return

  // Calculate for each exercise
  for (const se of sessionExercises) {
    await calculateRecommendationAndUpdateState(se.exercise_id, se.id, userId)
  }
}
