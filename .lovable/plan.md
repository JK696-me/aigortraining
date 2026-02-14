

# P0 Fix: RPE Persistence in Sets

## Problem
`updateSet` sends partial updates to Supabase (e.g., only `{weight: 50}` or `{is_completed: true}`), which means RPE is never included in the DB write unless the user explicitly changes it in the same action. The "Set Completed" button sends `{weight, reps, is_completed}` without RPE. History displays use `session_exercises.rpe` instead of `sets.rpe`.

## Changes

### 1. Exercise.tsx -- `updateSet`: Send full set row instead of partial patch
- Before calling `supabase.from('sets').update(updates)`, merge `updates` with the current set from local state to build a complete payload: `{ weight, reps, rpe, is_completed, set_index }`
- Send the full merged payload to both the outbox (`enqueueSetUpdate`) and the direct Supabase `.update()`
- This ensures RPE is always present in every DB write

### 2. Exercise.tsx -- `handleSetCompleted`: Include RPE from current set or rpe_display fallback
- When building the updates for "Set Completed", check:
  - If `currentSet.rpe` is not null, include it
  - Else if the exercise's `rpe_display` (from `cachedExercise.rpe_display`) has a value, use that as `rpe`
  - Else leave `rpe: null`
- Pass RPE as part of the `updateSet` call: `{ weight, reps, is_completed: true, rpe: resolvedRpe }`

### 3. Exercise.tsx -- `handleRpeChange`: Propagate RPE to ALL sets of the exercise
- When the user changes RPE via the slider, in addition to updating the current set:
  - Loop through all sets for this exercise and update each one's `rpe` to the new value
  - This uses optimistic updates + outbox for each set
  - Ensures all sets have consistent RPE

### 4. Workout.tsx -- `completeWorkout` flush trace: Real payload check
- Replace the `includes_rpe_field` check from `allSets.some(s => s.rpe !== null)` to actually verify each set payload in the upsert contains the `rpe` key
- Log per-set: `includes_rpe_field: upsertPayload.every(p => 'rpe' in p)`

### 5. Settings.tsx / DbDiagnostics.tsx -- Backfill button
- Add a dev-only button "Backfill set RPE from session_exercises"
- SQL logic: `UPDATE sets SET rpe = se.rpe_display FROM session_exercises se JOIN sessions s ON ... WHERE sets.rpe IS NULL AND se.rpe_display IS NOT NULL AND s.status IN ('completed','completed_pending')`
- Report count of updated rows

### 6. History displays -- Use sets.rpe instead of session_exercises.rpe

**ExerciseHistory.tsx:**
- For each exercise in session details, compute RPE as the rounded average of `sets.rpe` values (where not null)
- Fallback to `exercise.rpe` (from `session_exercises`) only if no set has RPE

**SingleExerciseHistory.tsx:**
- Fetch `rpe` from `sets` table alongside weight/reps
- Display per-session RPE as rounded average of set RPE values
- Fallback to `session_exercises.rpe` for legacy data

### 7. getLastLoggedSets -- Already correct
- Already fetches `rpe` from `sets` table (line 119). No changes needed. After backfill, this will return correct RPE.

## Technical Details

### File changes:
1. **`src/pages/Exercise.tsx`** -- `updateSet`, `handleSetCompleted`, `handleRpeChange`
2. **`src/pages/Workout.tsx`** -- flush trace `includes_rpe_field` check
3. **`src/pages/ExerciseHistory.tsx`** -- RPE display from sets
4. **`src/pages/SingleExerciseHistory.tsx`** -- fetch and display set-level RPE
5. **`src/pages/DbDiagnostics.tsx`** -- add backfill button
6. **`src/lib/flushWorkout.ts`** -- no changes needed (already sends full payload including rpe)

### Key invariant after fix:
Every `sets` row write (update/upsert) includes all fields: `weight, reps, rpe, is_completed`. RPE may be `null` but must always be present as a key in the payload.

