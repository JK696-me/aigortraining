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

export type PreviewAction = 'increase' | 'hold' | 'stage_up' | 'lock_in' | 'volume_reduce_on' | 'volume_reduce_off'

export interface ProgressionPreview {
  nextWeight: number
  targetRangeText: string
  repStage: number
  action: PreviewAction
  explanation: string
  // Full state for apply
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

export interface ExerciseStateSnapshot {
  id: string
  current_working_weight: number
  current_sets: number
  base_sets: number
  volume_reduce_on: boolean
  success_streak: number
  fail_streak: number
  rep_stage: number
  last_target_range: string | null
  last_recommendation_text: string | null
}

interface ExerciseData {
  id: string
  type: number
  increment_value: number
}

interface SetData {
  weight: number
  reps: number
  set_index: number
}

// PREVIEW: Calculate recommendation without saving to DB
export async function calculateRecommendationPreview(
  exerciseId: string,
  sessionExerciseId: string,
  userId: string
): Promise<{ preview: ProgressionPreview; currentState: ExerciseStateSnapshot } | null> {
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

  // 5. Calculate progression (preview only, no DB writes)
  const preview = calculateProgressionInternal(
    exercise as ExerciseData,
    exerciseState as ExerciseStateSnapshot,
    sets as SetData[],
    rpe
  )

  return { 
    preview, 
    currentState: exerciseState as ExerciseStateSnapshot 
  }
}

// APPLY: Save preview to DB
export async function applyRecommendation(
  exerciseStateId: string,
  preview: ProgressionPreview
): Promise<boolean> {
  const { error } = await supabase
    .from('exercise_state')
    .update({
      current_working_weight: preview.updatedState.current_working_weight,
      current_sets: preview.updatedState.current_sets,
      volume_reduce_on: preview.updatedState.volume_reduce_on,
      success_streak: preview.updatedState.success_streak,
      fail_streak: preview.updatedState.fail_streak,
      last_target_range: preview.updatedState.last_target_range,
      last_recommendation_text: preview.updatedState.last_recommendation_text,
      rep_stage: preview.updatedState.rep_stage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', exerciseStateId)

  return !error
}

// Check if preview differs from saved state
export function isPreviewDifferent(
  preview: ProgressionPreview,
  currentState: ExerciseStateSnapshot
): boolean {
  return (
    preview.updatedState.current_working_weight !== currentState.current_working_weight ||
    preview.updatedState.rep_stage !== currentState.rep_stage ||
    preview.updatedState.current_sets !== currentState.current_sets ||
    preview.updatedState.volume_reduce_on !== currentState.volume_reduce_on ||
    preview.updatedState.success_streak !== currentState.success_streak ||
    preview.updatedState.fail_streak !== currentState.fail_streak
  )
}

function calculateProgressionInternal(
  exercise: ExerciseData,
  state: ExerciseStateSnapshot,
  sets: SetData[],
  rpe: number | null
): ProgressionPreview {
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
      repStage: currentStage,
      action: 'hold',
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

  // Initialize updated state from current
  let newFailStreak = state.fail_streak
  let newSuccessStreak = state.success_streak
  let newVolumeReduceOn = state.volume_reduce_on
  let newCurrentSets = state.current_sets
  let newRepStage = currentStage
  let nextWeight = currentWeight
  let explanation = ''
  let action: PreviewAction = 'hold'

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
      action = 'stage_up'
      explanation = 'Верх базового диапазона выполнен — переходим на добор повторов без повышения веса.'
    } else if (allAtOrAboveMax && rpeHigh) {
      // Stay in stage 1, RPE too high
      newRepStage = 1
      nextWeight = currentWeight
      action = 'lock_in'
      explanation = 'Верх выполнен, но RPE высокий — закрепляем в базовом диапазоне.'
    } else {
      // Reps not reached
      newRepStage = 1
      nextWeight = currentWeight
      action = 'hold'
      explanation = 'Добираем повторы в базовом диапазоне, вес сохраняем.'
    }
  } else {
    // Stage 2: Extended range
    if (allAtOrAboveMax && rpeLowOrModerate) {
      // Increase weight and reset to stage 1
      nextWeight = currentWeight + incrementValue
      newRepStage = 1
      action = 'increase'
      explanation = 'Верх расширенного диапазона выполнен и RPE ≤ 8 — увеличиваем вес и возвращаемся в базовый диапазон.'
    } else if (allAtOrAboveMax && rpeHigh) {
      // Stay in stage 2, RPE too high
      nextWeight = currentWeight
      newRepStage = 2
      action = 'lock_in'
      explanation = 'Верх расширенного диапазона выполнен, но RPE высокий — закрепляем.'
    } else {
      // Reps not reached
      nextWeight = currentWeight
      newRepStage = 2
      action = 'hold'
      explanation = 'Добираем повторы в расширенном диапазоне, вес сохраняем.'
    }
  }

  // Volume reduction logic
  // Enable volume reduction if 2 failures in a row
  if (newFailStreak >= 2 && !newVolumeReduceOn) {
    newVolumeReduceOn = true
    newCurrentSets = Math.max(state.base_sets - 1, 1)
    newFailStreak = 0
    newSuccessStreak = 0
    action = 'volume_reduce_on'
    explanation += ' 2 сбоя подряд — уменьшаем объём на 1 подход.'
  }

  // Exit volume reduction if 2 successes in a row
  if (newVolumeReduceOn && newSuccessStreak >= 2) {
    newVolumeReduceOn = false
    newCurrentSets = state.base_sets
    newSuccessStreak = 0
    newFailStreak = 0
    action = 'volume_reduce_off'
    explanation += ' 2 успешные тренировки подряд — возвращаем исходный объём.'
  }

  // Get target range text for the NEW stage (what user should aim for next time)
  const newRange = newRepStage === 1 ? repRanges.stage1 : repRanges.stage2
  const targetRangeText = newRange.displayText

  return {
    nextWeight,
    targetRangeText,
    repStage: newRepStage,
    action,
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

// Legacy function for backward compatibility (used by Workout page for auto-finish)
export async function calculateRecommendationAndUpdateState(
  exerciseId: string,
  sessionExerciseId: string,
  userId: string
): Promise<ProgressionPreview | null> {
  const result = await calculateRecommendationPreview(exerciseId, sessionExerciseId, userId)
  if (!result) return null
  
  await applyRecommendation(result.currentState.id, result.preview)
  return result.preview
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
