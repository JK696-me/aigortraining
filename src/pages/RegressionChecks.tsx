import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Layout } from '@/components/Layout'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { getLastLoggedSets } from '@/lib/getLastLoggedSets'
import { flushWorkout } from '@/lib/flushWorkout'
import { CheckCircle, XCircle, Loader2, Play, FlaskConical } from 'lucide-react'

interface StepResult {
  step: string
  status: 'pass' | 'fail' | 'running' | 'skipped'
  detail?: string
}

interface ScenarioResult {
  name: string
  status: 'pass' | 'fail' | 'running' | 'idle'
  steps: StepResult[]
}

// Helper: wait ms
function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export default function RegressionChecks() {
  const { user } = useAuth()
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([])
  const runningRef = useRef(false)

  const updateScenario = useCallback((idx: number, update: Partial<ScenarioResult>) => {
    setScenarios(prev => prev.map((s, i) => i === idx ? { ...s, ...update } : s))
  }, [])

  const addStep = useCallback((scenarioIdx: number, step: StepResult) => {
    setScenarios(prev => prev.map((s, i) =>
      i === scenarioIdx ? { ...s, steps: [...s.steps, step] } : s
    ))
  }, [])

  const updateLastStep = useCallback((scenarioIdx: number, update: Partial<StepResult>) => {
    setScenarios(prev => prev.map((s, i) => {
      if (i !== scenarioIdx || s.steps.length === 0) return s
      const steps = [...s.steps]
      steps[steps.length - 1] = { ...steps[steps.length - 1], ...update }
      return { ...s, steps }
    }))
  }, [])

  // ─── Helpers ───

  async function getUserExercise(userId: string): Promise<{ id: string; name: string; type: number } | null> {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, type')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    return data
  }

  async function getSecondExercise(userId: string, excludeId: string): Promise<{ id: string; name: string; type: number } | null> {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, type')
      .eq('user_id', userId)
      .neq('id', excludeId)
      .limit(1)
      .maybeSingle()
    return data
  }

  async function getUserTemplate(userId: string): Promise<{ id: string; name: string; items: { exercise_id: string; target_sets: number; sort_order: number }[] } | null> {
    const { data: t } = await supabase
      .from('workout_templates')
      .select('id, name')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (!t) return null

    const { data: items } = await supabase
      .from('template_items')
      .select('exercise_id, target_sets, sort_order')
      .eq('template_id', t.id)
      .order('sort_order')

    return { ...t, items: items || [] }
  }

  async function createDraftSession(userId: string, source: string, templateId?: string | null) {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: userId,
        date: now,
        source,
        template_id: templateId || null,
        status: 'draft',
        started_at: now,
        elapsed_seconds: 0,
        timer_running: false,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  async function addExerciseToSession(sessionId: string, exerciseId: string, sets: { weight: number; reps: number; rpe?: number | null }[]) {
    const { data: se, error: seErr } = await supabase
      .from('session_exercises')
      .insert({ session_id: sessionId, exercise_id: exerciseId, sort_order: 1 })
      .select('id')
      .single()
    if (seErr) throw seErr

    const setRows = sets.map((s, i) => ({
      session_exercise_id: se.id,
      set_index: i + 1,
      weight: s.weight,
      reps: s.reps,
      rpe: s.rpe ?? null,
      is_completed: true,
    }))
    const { error: sErr } = await supabase.from('sets').insert(setRows)
    if (sErr) throw sErr
    return se.id
  }

  async function completeSession(sessionId: string) {
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString(), timer_running: false })
      .eq('id', sessionId)
    if (error) throw error
  }

  async function cleanupSession(sessionId: string) {
    // Delete sets → session_exercises → session
    const { data: ses } = await supabase
      .from('session_exercises')
      .select('id')
      .eq('session_id', sessionId)
    for (const se of ses || []) {
      await supabase.from('sets').delete().eq('session_exercise_id', se.id)
    }
    await supabase.from('session_exercises').delete().eq('session_id', sessionId)
    await supabase.from('sessions').delete().eq('id', sessionId)
  }

  async function getServerSets(sessionId: string): Promise<{ exercise_id: string; weight: number; reps: number; rpe: number | null; set_index: number }[]> {
    const { data } = await supabase
      .from('session_exercises')
      .select('exercise_id, sets(weight, reps, rpe, set_index)')
      .eq('session_id', sessionId)
    if (!data) return []
    return data.flatMap((se: { exercise_id: string; sets: { weight: number; reps: number; rpe: number | null; set_index: number }[] }) =>
      (se.sets || []).map(s => ({ ...s, exercise_id: se.exercise_id }))
    )
  }

  // ─── Scenario 1: Empty start → add exercise → autofill → complete → history ───

  async function runScenario1(idx: number) {
    if (!user) return
    updateScenario(idx, { status: 'running', steps: [] })
    const cleanupIds: string[] = []

    try {
      // Step 1: Find exercise with history
      addStep(idx, { step: 'Поиск упражнения с историей', status: 'running' })
      const exercise = await getUserExercise(user.id)
      if (!exercise) {
        updateLastStep(idx, { status: 'fail', detail: 'Нет упражнений у пользователя' })
        updateScenario(idx, { status: 'fail' })
        return
      }

      const lastLogged = await getLastLoggedSets({ userId: user.id, exerciseId: exercise.id, exerciseName: exercise.name })
      if (!lastLogged || lastLogged.sets.length === 0) {
        updateLastStep(idx, { status: 'fail', detail: `Нет истории для "${exercise.name}" (id=${exercise.id})` })
        updateScenario(idx, { status: 'fail' })
        return
      }
      updateLastStep(idx, {
        status: 'pass',
        detail: `"${exercise.name}", ${lastLogged.sets.length} sets, метод: ${lastLogged.matchMethod}`,
      })

      // Step 2: Create draft session
      addStep(idx, { step: 'Старт пустой тренировки', status: 'running' })
      const sessionId = await createDraftSession(user.id, 'empty')
      cleanupIds.push(sessionId)
      updateLastStep(idx, { status: 'pass', detail: `session=${sessionId.slice(0, 8)}` })

      // Step 3: Add exercise with autofilled sets
      addStep(idx, { step: 'Добавление упражнения с автоподстановкой', status: 'running' })
      const setsToInsert = lastLogged.sets.map(s => ({ weight: s.weight, reps: s.reps, rpe: s.rpe }))
      const seId = await addExerciseToSession(sessionId, exercise.id, setsToInsert)
      updateLastStep(idx, {
        status: 'pass',
        detail: `${setsToInsert.length} sets: ${setsToInsert.map(s => `${s.weight}кг×${s.reps}`).join(', ')}`,
      })

      // Step 4: Flush + complete
      addStep(idx, { step: 'Flush → Complete', status: 'running' })
      const allSetsQ = await supabase
        .from('sets')
        .select('id, session_exercise_id, set_index, weight, reps, is_completed, rpe')
        .eq('session_exercise_id', seId)
      const flushResult = await flushWorkout(allSetsQ.data || [], true)
      await completeSession(sessionId)
      updateLastStep(idx, { status: 'pass', detail: `flushed=${flushResult.flushed}, failed=${flushResult.failed}` })

      // Step 5: Verify history
      addStep(idx, { step: 'Проверка данных в истории (сервер)', status: 'running' })
      await wait(500) // Allow propagation
      const serverSets = await getServerSets(sessionId)
      const mismatches: string[] = []

      for (const expected of lastLogged.sets) {
        const found = serverSets.find(s => s.set_index === expected.set_index && s.exercise_id === exercise.id)
        if (!found) {
          mismatches.push(`set_index=${expected.set_index}: не найден`)
        } else if (found.weight !== expected.weight || found.reps !== expected.reps) {
          mismatches.push(
            `set_index=${expected.set_index}: ожидал ${expected.weight}кг×${expected.reps}, получил ${found.weight}кг×${found.reps}`
          )
        }
      }

      if (mismatches.length > 0) {
        updateLastStep(idx, { status: 'fail', detail: mismatches.join('; ') })
        updateScenario(idx, { status: 'fail' })
      } else {
        updateLastStep(idx, { status: 'pass', detail: `${serverSets.length} sets совпадают с ожиданием` })
        updateScenario(idx, { status: 'pass' })
      }
    } catch (err) {
      addStep(idx, { step: 'Ошибка', status: 'fail', detail: String(err) })
      updateScenario(idx, { status: 'fail' })
    } finally {
      // Cleanup test data
      for (const id of cleanupIds) {
        try { await cleanupSession(id) } catch {}
      }
    }
  }

  // ─── Scenario 2: Template start → replace exercise → autofill → complete → verify ───

  async function runScenario2(idx: number) {
    if (!user) return
    updateScenario(idx, { status: 'running', steps: [] })
    const cleanupIds: string[] = []

    try {
      // Step 1: Find template + replacement exercise
      addStep(idx, { step: 'Поиск шаблона и упражнения для замены', status: 'running' })
      const template = await getUserTemplate(user.id)
      if (!template || template.items.length === 0) {
        updateLastStep(idx, { status: 'fail', detail: 'Нет шаблонов с упражнениями' })
        updateScenario(idx, { status: 'fail' })
        return
      }

      const firstExerciseId = template.items[0].exercise_id
      const replacement = await getSecondExercise(user.id, firstExerciseId)
      if (!replacement) {
        updateLastStep(idx, { status: 'fail', detail: 'Нужно минимум 2 упражнения для замены' })
        updateScenario(idx, { status: 'fail' })
        return
      }
      updateLastStep(idx, {
        status: 'pass',
        detail: `Шаблон "${template.name}", замена на "${replacement.name}"`,
      })

      // Step 2: Create session from template
      addStep(idx, { step: 'Старт из шаблона', status: 'running' })
      const sessionId = await createDraftSession(user.id, 'template', template.id)
      cleanupIds.push(sessionId)

      // Add template exercises
      for (const item of template.items) {
        const defaultSets = Array.from({ length: item.target_sets }, () => ({ weight: 0, reps: 6 }))
        await addExerciseToSession(sessionId, item.exercise_id, defaultSets)
      }
      updateLastStep(idx, { status: 'pass', detail: `session=${sessionId.slice(0, 8)}, ${template.items.length} упражнений` })

      // Step 3: Replace first exercise
      addStep(idx, { step: 'Замена упражнения + автоподстановка', status: 'running' })

      // Get session_exercise to replace
      const { data: ses } = await supabase
        .from('session_exercises')
        .select('id')
        .eq('session_id', sessionId)
        .eq('exercise_id', firstExerciseId)
        .limit(1)
        .maybeSingle()

      if (!ses) {
        updateLastStep(idx, { status: 'fail', detail: 'Не найден session_exercise для замены' })
        updateScenario(idx, { status: 'fail' })
        return
      }

      // Delete old sets
      await supabase.from('sets').delete().eq('session_exercise_id', ses.id)

      // Update exercise_id
      await supabase
        .from('session_exercises')
        .update({ exercise_id: replacement.id })
        .eq('id', ses.id)

      // Get last logged for replacement
      const lastLogged = await getLastLoggedSets({
        userId: user.id,
        exerciseId: replacement.id,
        exerciseName: replacement.name,
        excludeSessionId: sessionId,
      })

      const newSets = lastLogged
        ? lastLogged.sets.map(s => ({ weight: s.weight, reps: s.reps, rpe: s.rpe }))
        : [{ weight: 50, reps: 8 }, { weight: 50, reps: 8 }, { weight: 50, reps: 8 }]

      // Insert new sets
      const setRows = newSets.map((s, i) => ({
        session_exercise_id: ses.id,
        set_index: i + 1,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe ?? null,
        is_completed: true,
      }))
      await supabase.from('sets').insert(setRows)

      updateLastStep(idx, {
        status: 'pass',
        detail: lastLogged
          ? `Автоподстановка: ${newSets.map(s => `${s.weight}кг×${s.reps}`).join(', ')}`
          : 'Нет истории → ручные значения 50кг×8',
      })

      // Step 4: Flush + Complete
      addStep(idx, { step: 'Flush → Complete', status: 'running' })
      const { data: allSessionSets } = await supabase
        .from('sets')
        .select('id, session_exercise_id, set_index, weight, reps, is_completed, rpe')
        .in('session_exercise_id', (await supabase.from('session_exercises').select('id').eq('session_id', sessionId)).data?.map(e => e.id) || [])
      
      await flushWorkout(allSessionSets || [], true)
      await completeSession(sessionId)
      updateLastStep(idx, { status: 'pass' })

      // Step 5: Verify
      addStep(idx, { step: 'Проверка данных в истории', status: 'running' })
      await wait(500)
      const serverSets = await getServerSets(sessionId)
      const replacedSets = serverSets.filter(s => s.exercise_id === replacement.id)

      const mismatches: string[] = []
      for (let i = 0; i < newSets.length; i++) {
        const found = replacedSets.find(s => s.set_index === i + 1)
        if (!found) {
          mismatches.push(`set_index=${i + 1}: не найден`)
        } else if (found.weight !== newSets[i].weight || found.reps !== newSets[i].reps) {
          mismatches.push(`set_index=${i + 1}: ожидал ${newSets[i].weight}×${newSets[i].reps}, получил ${found.weight}×${found.reps}`)
        }
      }

      if (mismatches.length > 0) {
        updateLastStep(idx, { status: 'fail', detail: mismatches.join('; ') })
        updateScenario(idx, { status: 'fail' })
      } else {
        updateLastStep(idx, { status: 'pass', detail: `${replacedSets.length} sets замененного упражнения корректны` })
        updateScenario(idx, { status: 'pass' })
      }
    } catch (err) {
      addStep(idx, { step: 'Ошибка', status: 'fail', detail: String(err) })
      updateScenario(idx, { status: 'fail' })
    } finally {
      for (const id of cleanupIds) {
        try { await cleanupSession(id) } catch {}
      }
    }
  }

  // ─── Scenario 3: Offline simulation → complete → local check → online verify ───

  async function runScenario3(idx: number) {
    if (!user) return
    updateScenario(idx, { status: 'running', steps: [] })
    const cleanupIds: string[] = []

    try {
      // Step 1: Find exercise
      addStep(idx, { step: 'Поиск упражнения', status: 'running' })
      const exercise = await getUserExercise(user.id)
      if (!exercise) {
        updateLastStep(idx, { status: 'fail', detail: 'Нет упражнений' })
        updateScenario(idx, { status: 'fail' })
        return
      }
      updateLastStep(idx, { status: 'pass', detail: `"${exercise.name}"` })

      // Step 2: Create session (online, to get server ID)
      addStep(idx, { step: 'Создание сессии (онлайн)', status: 'running' })
      const sessionId = await createDraftSession(user.id, 'empty')
      cleanupIds.push(sessionId)
      updateLastStep(idx, { status: 'pass', detail: `session=${sessionId.slice(0, 8)}` })

      // Step 3: Add exercise with specific test values
      addStep(idx, { step: 'Добавление упражнения с тестовыми значениями', status: 'running' })
      const testSets = [
        { weight: 77.5, reps: 9, rpe: 7 },
        { weight: 77.5, reps: 8, rpe: 8 },
        { weight: 77.5, reps: 7, rpe: 9 },
      ]
      const seId = await addExerciseToSession(sessionId, exercise.id, testSets)
      updateLastStep(idx, {
        status: 'pass',
        detail: testSets.map(s => `${s.weight}кг×${s.reps}@RPE${s.rpe}`).join(', '),
      })

      // Step 4: Simulate offline flush
      addStep(idx, { step: 'Офлайн flush (симуляция)', status: 'running' })
      const { data: setsData } = await supabase
        .from('sets')
        .select('id, session_exercise_id, set_index, weight, reps, is_completed, rpe')
        .eq('session_exercise_id', seId)
      
      const offlineResult = await flushWorkout(setsData || [], false) // simulate offline
      updateLastStep(idx, {
        status: offlineResult.offline ? 'pass' : 'fail',
        detail: offlineResult.offline
          ? `Offline=true, ${setsData?.length || 0} sets в outbox`
          : 'Ожидали offline=true',
      })
      if (!offlineResult.offline) {
        updateScenario(idx, { status: 'fail' })
        return
      }

      // Step 5: "Go online" — flush again with online=true
      addStep(idx, { step: 'Онлайн flush (повтор)', status: 'running' })
      const onlineResult = await flushWorkout(setsData || [], true)
      updateLastStep(idx, {
        status: onlineResult.flushed > 0 ? 'pass' : 'fail',
        detail: `flushed=${onlineResult.flushed}, failed=${onlineResult.failed}`,
      })

      // Step 6: Complete session
      addStep(idx, { step: 'Завершение сессии', status: 'running' })
      await completeSession(sessionId)
      updateLastStep(idx, { status: 'pass' })

      // Step 7: Verify server data matches test values
      addStep(idx, { step: 'Проверка серверных данных', status: 'running' })
      await wait(500)
      const serverSets = await getServerSets(sessionId)
      const exSets = serverSets.filter(s => s.exercise_id === exercise.id)

      const mismatches: string[] = []
      for (const expected of testSets) {
        const idx2 = testSets.indexOf(expected) + 1
        const found = exSets.find(s => s.set_index === idx2)
        if (!found) {
          mismatches.push(`set_index=${idx2}: не найден`)
        } else {
          if (found.weight !== expected.weight) mismatches.push(`set ${idx2}: weight ${found.weight}≠${expected.weight}`)
          if (found.reps !== expected.reps) mismatches.push(`set ${idx2}: reps ${found.reps}≠${expected.reps}`)
          if (found.rpe !== expected.rpe) mismatches.push(`set ${idx2}: rpe ${found.rpe}≠${expected.rpe}`)
        }
      }

      if (mismatches.length > 0) {
        updateLastStep(idx, { status: 'fail', detail: mismatches.join('; ') })
        updateScenario(idx, { status: 'fail' })
      } else {
        updateLastStep(idx, { status: 'pass', detail: `${exSets.length} sets на сервере совпадают с введёнными` })
        updateScenario(idx, { status: 'pass' })
      }
    } catch (err) {
      addStep(idx, { step: 'Ошибка', status: 'fail', detail: String(err) })
      updateScenario(idx, { status: 'fail' })
    } finally {
      for (const id of cleanupIds) {
        try { await cleanupSession(id) } catch {}
      }
    }
  }

  // ─── Run All ───

  const runAll = useCallback(async () => {
    if (runningRef.current || !user) return
    runningRef.current = true

    setScenarios([
      { name: '1. Пустая тренировка → автоподстановка → история', status: 'idle', steps: [] },
      { name: '2. Шаблон → замена упражнения → автоподстановка → история', status: 'idle', steps: [] },
      { name: '3. Офлайн → ввод → завершение → онлайн → синхронизация', status: 'idle', steps: [] },
    ])

    await runScenario1(0)
    await runScenario2(1)
    await runScenario3(2)

    runningRef.current = false
  }, [user])

  const isRunning = scenarios.some(s => s.status === 'running')
  const passCount = scenarios.filter(s => s.status === 'pass').length
  const failCount = scenarios.filter(s => s.status === 'fail').length

  return (
    <Layout hideNav>
      <div className="container max-w-4xl py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6" />
              Regression Checks
            </h1>
            <p className="text-muted-foreground text-sm">
              Автоматические сценарии проверки целостности данных (dev only)
            </p>
          </div>
          <Button onClick={runAll} disabled={isRunning || !user}>
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isRunning ? 'Выполняется…' : 'Запустить все'}
          </Button>
        </div>

        {scenarios.length > 0 && (
          <div className="flex gap-2 text-sm">
            {passCount > 0 && <Badge className="bg-emerald-600 text-primary-foreground">{passCount} PASS</Badge>}
            {failCount > 0 && <Badge variant="destructive">{failCount} FAIL</Badge>}
          </div>
        )}

        {scenarios.map((scenario, idx) => (
          <Card key={idx} className={
            scenario.status === 'fail' ? 'border-destructive' :
            scenario.status === 'pass' ? 'border-emerald-600' : ''
          }>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {scenario.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {scenario.status === 'pass' && <CheckCircle className="h-4 w-4 text-emerald-600" />}
                {scenario.status === 'fail' && <XCircle className="h-4 w-4 text-destructive" />}
                {scenario.name}
              </CardTitle>
            </CardHeader>
            {scenario.steps.length > 0 && (
              <CardContent className="space-y-1">
                {scenario.steps.map((step, sIdx) => (
                  <div key={sIdx} className="flex items-start gap-2 text-sm">
                    {step.status === 'running' && <Loader2 className="h-3.5 w-3.5 mt-0.5 animate-spin text-muted-foreground shrink-0" />}
                    {step.status === 'pass' && <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />}
                    {step.status === 'fail' && <XCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />}
                    <div className="min-w-0">
                      <span className="font-medium">{step.step}</span>
                      {step.detail && (
                        <span className="text-muted-foreground ml-1.5 text-xs">— {step.detail}</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        ))}

        {scenarios.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Нажмите "Запустить все" для запуска регрессионных проверок
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  )
}