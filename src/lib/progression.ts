import { supabase } from "@/integrations/supabase/client";

// Rep ranges by exercise type
const REP_RANGES: Record<number, { lower: number; upper: number; extendedUpper: string }> = {
  1: { lower: 6, upper: 8, extendedUpper: '10-12' },
  2: { lower: 6, upper: 8, extendedUpper: '12' },
  3: { lower: 10, upper: 12, extendedUpper: '15' },
  4: { lower: 10, upper: 12, extendedUpper: '15-20' },
};

const DEFAULT_REP_RANGE = { lower: 6, upper: 8, extendedUpper: '10-12' };

export interface ProgressionResult {
  nextWeight: number;
  targetRangeText: string;
  explanation: string;
  updatedState: {
    current_working_weight: number;
    current_sets: number;
    volume_reduce_on: boolean;
    success_streak: number;
    fail_streak: number;
    last_target_range: string;
    last_recommendation_text: string;
  };
}

interface ExerciseData {
  id: string;
  type: number;
  increment_value: number;
}

interface ExerciseStateData {
  id: string;
  current_working_weight: number;
  current_sets: number;
  base_sets: number;
  volume_reduce_on: boolean;
  success_streak: number;
  fail_streak: number;
}

interface SetData {
  weight: number;
  reps: number;
  set_index: number;
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
    .single();

  if (!exercise) return null;

  // 2. Load exercise state
  const { data: exerciseState } = await supabase
    .from('exercise_state')
    .select('*')
    .eq('exercise_id', exerciseId)
    .eq('user_id', userId)
    .single();

  if (!exerciseState) return null;

  // 3. Load sets for this session exercise
  const { data: sets } = await supabase
    .from('sets')
    .select('weight, reps, set_index')
    .eq('session_exercise_id', sessionExerciseId)
    .order('set_index');

  if (!sets || sets.length === 0) return null;

  // 4. Load RPE
  const { data: sessionExercise } = await supabase
    .from('session_exercises')
    .select('rpe')
    .eq('id', sessionExerciseId)
    .single();

  const rpe = sessionExercise?.rpe ?? null;

  // 5. Calculate progression
  const result = calculateProgression(
    exercise as ExerciseData,
    exerciseState as ExerciseStateData,
    sets as SetData[],
    rpe
  );

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
      updated_at: new Date().toISOString(),
    })
    .eq('id', exerciseState.id);

  return result;
}

function calculateProgression(
  exercise: ExerciseData,
  state: ExerciseStateData,
  sets: SetData[],
  rpe: number | null
): ProgressionResult {
  const repRange = REP_RANGES[exercise.type] || DEFAULT_REP_RANGE;
  const targetRangeText = `${repRange.lower}-${repRange.upper}`;
  const incrementValue = exercise.increment_value;

  // Working sets = first state.current_sets sets
  const workingSets = sets
    .sort((a, b) => a.set_index - b.set_index)
    .slice(0, state.current_sets);

  if (workingSets.length === 0) {
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
      },
    };
  }

  // Current weight = weight of first working set
  const currentWeight = workingSets[0].weight;

  // Check conditions
  const allAtOrAboveUpper = workingSets.every(s => s.reps >= repRange.upper);
  const anyBelowLower = workingSets.some(s => s.reps < repRange.lower);
  const rpeHigh = rpe !== null && rpe >= 8.5;
  const rpeLowOrModerate = rpe === null || rpe <= 8;

  // Success = upper achieved in all sets
  // Failure = any set below lower OR RPE >= 8.5
  const isSuccess = allAtOrAboveUpper;
  const isFailure = anyBelowLower || rpeHigh;

  // Initialize updated state
  let newFailStreak = state.fail_streak;
  let newSuccessStreak = state.success_streak;
  let newVolumeReduceOn = state.volume_reduce_on;
  let newCurrentSets = state.current_sets;
  let nextWeight = currentWeight;
  let explanation = '';

  // Update streaks
  if (isFailure) {
    newFailStreak += 1;
    newSuccessStreak = 0;
  } else if (isSuccess && rpeLowOrModerate) {
    newSuccessStreak += 1;
    newFailStreak = 0;
  }

  // Weight increase logic
  if (isSuccess && rpeLowOrModerate) {
    nextWeight = currentWeight + incrementValue;
    explanation = 'Верх диапазона выполнен во всех подходах и RPE ≤ 8 — увеличиваем вес.';
  } else if (isSuccess && rpeHigh) {
    nextWeight = currentWeight;
    explanation = 'Верх выполнен, но RPE высокий — закрепляем вес.';
  } else {
    nextWeight = currentWeight;
    explanation = 'Добираем повторы в диапазоне, вес сохраняем.';
  }

  // Volume reduction logic
  // Enable volume reduction if 2 failures in a row
  if (newFailStreak >= 2 && !newVolumeReduceOn) {
    newVolumeReduceOn = true;
    newCurrentSets = Math.max(state.base_sets - 1, 1);
    newFailStreak = 0;
    newSuccessStreak = 0;
    explanation += ' 2 сбоя подряд — уменьшаем объём на 1 подход.';
  }

  // Exit volume reduction if 2 successes in a row
  if (newVolumeReduceOn && newSuccessStreak >= 2) {
    newVolumeReduceOn = false;
    newCurrentSets = state.base_sets;
    newSuccessStreak = 0;
    newFailStreak = 0;
    explanation += ' 2 успешные тренировки подряд — возвращаем исходный объём.';
  }

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
    },
  };
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
    .eq('session_id', sessionId);

  if (!sessionExercises) return;

  // Calculate for each exercise
  for (const se of sessionExercises) {
    await calculateRecommendationAndUpdateState(se.exercise_id, se.id, userId);
  }
}
