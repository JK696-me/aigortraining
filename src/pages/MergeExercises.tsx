import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Layout } from '@/components/Layout'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CheckCircle, Loader2, Merge, Search, Trash2 } from 'lucide-react'

interface ExerciseRow {
  id: string
  name: string
  canonical_key: string | null
  created_at: string
}

interface DuplicateGroup {
  canonical_key: string
  exercises: ExerciseRow[]
  sessionExerciseCounts: Record<string, number> // exercise_id → count of session_exercises
  templateItemCounts: Record<string, number>    // exercise_id → count of template_items
}

interface MergePreview {
  group: DuplicateGroup
  canonicalId: string
  duplicateIds: string[]
  sessionExercisesToReassign: number
  templateItemsToReassign: number
  exercisesToDelete: number
}

export default function MergeExercises() {
  const { user } = useAuth()
  const [isScanning, setIsScanning] = useState(false)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null)
  const [isMerging, setIsMerging] = useState(false)
  const [mergeLog, setMergeLog] = useState<string[]>([])

  // ─── Scan for duplicates ───
  const scanDuplicates = useCallback(async () => {
    if (!user) return
    setIsScanning(true)
    setGroups([])

    try {
      const { data: exercises, error } = await supabase
        .from('exercises')
        .select('id, name, canonical_key, created_at')
        .eq('user_id', user.id)
        .order('name')

      if (error) throw error
      if (!exercises || exercises.length === 0) {
        toast.info('Упражнений не найдено')
        setIsScanning(false)
        return
      }

      // Group by canonical_key (or normalized name if no key)
      const byKey = new Map<string, ExerciseRow[]>()
      for (const ex of exercises) {
        const key = ex.canonical_key || ex.name.toLowerCase().trim().replace(/\s+/g, ' ')
        if (!byKey.has(key)) byKey.set(key, [])
        byKey.get(key)!.push(ex)
      }

      // Filter to groups with 2+ exercises
      const duplicateGroups: DuplicateGroup[] = []

      for (const [key, exList] of byKey) {
        if (exList.length < 2) continue

        // Count references for each exercise
        const sessionExerciseCounts: Record<string, number> = {}
        const templateItemCounts: Record<string, number> = {}

        for (const ex of exList) {
          const { count: seCount } = await supabase
            .from('session_exercises')
            .select('id', { count: 'exact', head: true })
            .eq('exercise_id', ex.id)

          const { count: tiCount } = await supabase
            .from('template_items')
            .select('id', { count: 'exact', head: true })
            .eq('exercise_id', ex.id)

          sessionExerciseCounts[ex.id] = seCount || 0
          templateItemCounts[ex.id] = tiCount || 0
        }

        duplicateGroups.push({
          canonical_key: key,
          exercises: exList,
          sessionExerciseCounts,
          templateItemCounts,
        })
      }

      setGroups(duplicateGroups)

      if (duplicateGroups.length === 0) {
        toast.success('Дубликатов не найдено')
      } else {
        toast.info(`Найдено ${duplicateGroups.length} групп дубликатов`)
      }
    } catch (err) {
      console.error('Scan error:', err)
      toast.error('Ошибка сканирования')
    } finally {
      setIsScanning(false)
    }
  }, [user])

  // ─── Prepare merge preview ───
  function prepareMerge(group: DuplicateGroup, canonicalId: string) {
    const duplicateIds = group.exercises
      .filter(e => e.id !== canonicalId)
      .map(e => e.id)

    const sessionExercisesToReassign = duplicateIds.reduce(
      (sum, id) => sum + (group.sessionExerciseCounts[id] || 0), 0
    )
    const templateItemsToReassign = duplicateIds.reduce(
      (sum, id) => sum + (group.templateItemCounts[id] || 0), 0
    )

    setMergePreview({
      group,
      canonicalId,
      duplicateIds,
      sessionExercisesToReassign,
      templateItemsToReassign,
      exercisesToDelete: duplicateIds.length,
    })
  }

  // ─── Execute merge ───
  async function executeMerge() {
    if (!mergePreview || !user) return
    setIsMerging(true)
    const log: string[] = []

    const { canonicalId, duplicateIds } = mergePreview
    const canonicalName = mergePreview.group.exercises.find(e => e.id === canonicalId)?.name || '?'

    try {
      // 1. Reassign session_exercises
      for (const dupId of duplicateIds) {
        const dupName = mergePreview.group.exercises.find(e => e.id === dupId)?.name || '?'

        // Handle potential unique constraint (session_id, exercise_id) conflicts
        // First find any session_exercises for this duplicate
        const { data: dupSes } = await supabase
          .from('session_exercises')
          .select('id, session_id')
          .eq('exercise_id', dupId)

        if (dupSes && dupSes.length > 0) {
          // Check for conflicts: sessions that already have the canonical exercise
          const { data: canonicalSes } = await supabase
            .from('session_exercises')
            .select('id, session_id')
            .eq('exercise_id', canonicalId)

          const canonicalSessionIds = new Set((canonicalSes || []).map(s => s.session_id))

          for (const se of dupSes) {
            if (canonicalSessionIds.has(se.session_id)) {
              // Conflict: this session already has canonical exercise
              // Move sets from duplicate to canonical session_exercise
              const canonicalSe = canonicalSes!.find(s => s.session_id === se.session_id)!

              // Get max set_index from canonical
              const { data: existingSets } = await supabase
                .from('sets')
                .select('set_index')
                .eq('session_exercise_id', canonicalSe.id)
                .order('set_index', { ascending: false })
                .limit(1)

              const maxIndex = existingSets?.[0]?.set_index || 0

              // Get sets from duplicate
              const { data: dupSets } = await supabase
                .from('sets')
                .select('id, set_index')
                .eq('session_exercise_id', se.id)

              // Reindex and reassign
              for (let i = 0; i < (dupSets || []).length; i++) {
                await supabase
                  .from('sets')
                  .update({
                    session_exercise_id: canonicalSe.id,
                    set_index: maxIndex + i + 1,
                  })
                  .eq('id', dupSets![i].id)
              }

              // Delete the now-empty duplicate session_exercise
              await supabase
                .from('session_exercises')
                .delete()
                .eq('id', se.id)

              log.push(`⚠️ Конфликт в сессии ${se.session_id.slice(0, 8)}: переместил ${dupSets?.length || 0} sets, удалил дубль session_exercise`)
            } else {
              // No conflict: simple reassign
              await supabase
                .from('session_exercises')
                .update({ exercise_id: canonicalId })
                .eq('id', se.id)
            }
          }

          log.push(`✅ session_exercises "${dupName}" → "${canonicalName}": ${dupSes.length} записей`)
        }

        // 2. Reassign template_items
        const { data: dupTi } = await supabase
          .from('template_items')
          .select('id, template_id')
          .eq('exercise_id', dupId)

        if (dupTi && dupTi.length > 0) {
          // Check for conflicts in templates
          const { data: canonicalTi } = await supabase
            .from('template_items')
            .select('id, template_id')
            .eq('exercise_id', canonicalId)

          const canonicalTemplateIds = new Set((canonicalTi || []).map(t => t.template_id))

          for (const ti of dupTi) {
            if (canonicalTemplateIds.has(ti.template_id)) {
              // Conflict: template already has canonical exercise → delete duplicate item
              await supabase.from('template_items').delete().eq('id', ti.id)
              log.push(`⚠️ Шаблон ${ti.template_id.slice(0, 8)}: удалён дубль template_item`)
            } else {
              await supabase
                .from('template_items')
                .update({ exercise_id: canonicalId })
                .eq('id', ti.id)
            }
          }

          log.push(`✅ template_items "${dupName}" → "${canonicalName}": ${dupTi.length} записей`)
        }

        // 3. Reassign exercise_state
        const { data: dupState } = await supabase
          .from('exercise_state')
          .select('id')
          .eq('exercise_id', dupId)
          .eq('user_id', user.id)

        if (dupState && dupState.length > 0) {
          // Delete duplicate exercise_state (canonical already has its own)
          for (const es of dupState) {
            await supabase.from('exercise_state').delete().eq('id', es.id)
          }
          log.push(`🗑️ exercise_state для "${dupName}": удалено ${dupState.length}`)
        }

        // 4. Reassign exercise_aliases
        await supabase
          .from('exercise_aliases')
          .update({ canonical_key: mergePreview.group.canonical_key })
          .eq('canonical_key', dupId)
          .eq('user_id', user.id)

        // 5. Delete the duplicate exercise
        const { error: delErr } = await supabase
          .from('exercises')
          .delete()
          .eq('id', dupId)

        if (delErr) {
          log.push(`❌ Не удалось удалить "${dupName}" (${dupId.slice(0, 8)}): ${delErr.message}`)
        } else {
          log.push(`🗑️ Удалено упражнение "${dupName}" (${dupId.slice(0, 8)})`)
        }
      }

      log.push(`\n✅ Мерж завершён. Каноническое: "${canonicalName}" (${canonicalId.slice(0, 8)})`)
      setMergeLog(log)
      toast.success('Мерж выполнен успешно')

      // Refresh duplicate list
      setGroups(prev => prev.filter(g => g.canonical_key !== mergePreview.group.canonical_key))
    } catch (err) {
      console.error('Merge error:', err)
      log.push(`❌ Ошибка: ${String(err)}`)
      setMergeLog(log)
      toast.error('Ошибка при мерже')
    } finally {
      setIsMerging(false)
      setMergePreview(null)
    }
  }

  return (
    <Layout hideNav>
      <div className="container max-w-4xl py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Merge className="h-6 w-6" />
              Merge Exercises
            </h1>
            <p className="text-muted-foreground text-sm">
              Объединение дубликатов упражнений (dev only)
            </p>
          </div>
          <Button onClick={scanDuplicates} disabled={isScanning}>
            {isScanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            {isScanning ? 'Сканирование…' : 'Найти дубли'}
          </Button>
        </div>

        {/* Merge log */}
        {mergeLog.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Лог последнего мержа</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0.5 text-xs font-mono">
                {mergeLog.map((line, i) => (
                  <div key={i} className={
                    line.startsWith('❌') ? 'text-destructive' :
                    line.startsWith('⚠️') ? 'text-amber-500' :
                    'text-muted-foreground'
                  }>{line}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Duplicate groups */}
        {groups.map((group, idx) => (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                Ключ: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{group.canonical_key}</code>
                <Badge variant="secondary">{group.exercises.length} упражнений</Badge>
              </CardTitle>
              <CardDescription>Выберите каноническое упражнение (остальные будут объединены в него)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.exercises.map(ex => {
                const seCount = group.sessionExerciseCounts[ex.id] || 0
                const tiCount = group.templateItemCounts[ex.id] || 0
                const totalRefs = seCount + tiCount

                return (
                  <div key={ex.id} className="flex items-center justify-between gap-2 p-2 rounded border">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{ex.name}</div>
                      <div className="text-xs text-muted-foreground">
                        id: {ex.id.slice(0, 8)}… | тренировок: {seCount} | шаблонов: {tiCount}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={totalRefs > 0 ? 'default' : 'outline'}
                      onClick={() => prepareMerge(group, ex.id)}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Каноническое
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}

        {groups.length === 0 && !isScanning && mergeLog.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Нажмите "Найти дубли" для сканирования упражнений
            </CardContent>
          </Card>
        )}

        {/* Merge confirmation dialog */}
        <AlertDialog open={!!mergePreview} onOpenChange={() => setMergePreview(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Merge className="h-5 w-5" />
                Подтверждение мержа
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Каноническое упражнение:{' '}
                    <strong>
                      {mergePreview?.group.exercises.find(e => e.id === mergePreview?.canonicalId)?.name}
                    </strong>
                  </p>
                  <div className="text-sm space-y-1">
                    <div>📋 session_exercises для переназначения: <strong>{mergePreview?.sessionExercisesToReassign}</strong></div>
                    <div>📝 template_items для переназначения: <strong>{mergePreview?.templateItemsToReassign}</strong></div>
                    <div className="flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                      Упражнений на удаление: <strong>{mergePreview?.exercisesToDelete}</strong>
                    </div>
                  </div>
                  <p className="text-xs text-destructive">
                    Это действие необратимо. Дубликаты будут удалены, все ссылки переназначены.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isMerging}>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={executeMerge} disabled={isMerging}>
                {isMerging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Merge className="h-4 w-4 mr-2" />}
                {isMerging ? 'Выполняется…' : 'Объединить'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  )
}