import { useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle, Database, RefreshCw, Copy, Check } from "lucide-react"
import { Layout } from "@/components/Layout"
import { useAuth } from "@/contexts/AuthContext"

interface DiagnosticResult {
  name: string
  description: string
  query: string
  status: "ok" | "warning" | "error"
  count: number
  data: Record<string, unknown>[]
}

export default function DbDiagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [lastRun, setLastRun] = useState<Date | null>(null)
  const [copied, setCopied] = useState(false)
  const { user } = useAuth()

  async function runChecks() {
    if (!user) return
    setIsRunning(true)
    const out: DiagnosticResult[] = []

    try {
      // Q1: Bad sets in completed workouts
      const { data: q1 } = await supabase
        .from("sets")
        .select(`
          id, set_index, weight, reps, rpe, updated_at,
          session_exercise_id,
          session_exercises!inner(
            id, exercise_id, session_id,
            sessions!inner(id, status, completed_at)
          )
        `)
        .in("session_exercises.sessions.status", ["completed", "completed_pending"])
        .or("weight.eq.0,reps.eq.6,rpe.is.null")
        .limit(50)

      const q1Rows = (q1 || []).map((s: Record<string, unknown>) => {
        const se = s.session_exercises as Record<string, unknown>
        const sess = se?.sessions as Record<string, unknown>
        return {
          session_id: se?.session_id,
          session_status: sess?.status,
          completed_at: sess?.completed_at,
          session_exercise_id: s.session_exercise_id,
          exercise_id: se?.exercise_id,
          set_id: s.id,
          set_index: s.set_index,
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe,
          sets_updated_at: s.updated_at,
        }
      })

      out.push({
        name: "Q1. Плохие сеты (0×6 / rpe null)",
        description: "Sets с weight=0 OR reps=6 OR rpe IS NULL в completed/completed_pending сессиях",
        query: "sets WHERE status IN (completed, completed_pending) AND (weight=0 OR reps=6 OR rpe IS NULL)",
        status: q1Rows.length > 0 ? "error" : "ok",
        count: q1Rows.length,
        data: q1Rows,
      })

      // Q2: Sessions with activity but mostly default sets
      const { data: q2Sessions } = await supabase
        .from("sessions")
        .select(`
          id, completed_at, last_activity_at,
          session_exercises(
            sets(weight, reps)
          )
        `)
        .in("status", ["completed", "completed_pending"])
        .not("last_activity_at", "is", null)
        .limit(100)

      const q2Rows = (q2Sessions || [])
        .map((s: Record<string, unknown>) => {
          const exercises = (s.session_exercises as Record<string, unknown>[]) || []
          let totalSets = 0
          let defaultSets = 0
          for (const se of exercises) {
            const sets = (se.sets as Record<string, unknown>[]) || []
            for (const st of sets) {
              totalSets++
              if (st.weight === 0 || st.reps === 6) defaultSets++
            }
          }
          return {
            session_id: s.id,
            completed_at: s.completed_at,
            last_activity_at: s.last_activity_at,
            count_sets: totalSets,
            count_default_sets: defaultSets,
          }
        })
        .filter((r) => r.count_sets > 0 && r.count_default_sets / r.count_sets > 0.5)

      out.push({
        name: "Q2. Активность есть, но дефолты остались",
        description: "Completed сессии с last_activity_at, где >50% сетов — дефолтные (weight=0 или reps=6)",
        query: "sessions WHERE status=completed AND last_activity_at NOT NULL, >50% sets are defaults",
        status: q2Rows.length > 0 ? "warning" : "ok",
        count: q2Rows.length,
        data: q2Rows.slice(0, 50),
      })

      // Q3: Sets updated after session completion
      const { data: q3Raw } = await supabase
        .from("sets")
        .select(`
          id, weight, reps, rpe, updated_at,
          session_exercise_id,
          session_exercises!inner(
            session_id,
            sessions!inner(id, status, completed_at)
          )
        `)
        .eq("session_exercises.sessions.status", "completed")
        .not("session_exercises.sessions.completed_at", "is", null)
        .limit(200)

      const q3Rows = (q3Raw || [])
        .filter((s: Record<string, unknown>) => {
          const sess = (s.session_exercises as Record<string, unknown>)?.sessions as Record<string, unknown>
          const completedAt = sess?.completed_at as string
          const updatedAt = s.updated_at as string
          return completedAt && updatedAt && new Date(updatedAt) > new Date(completedAt)
        })
        .slice(0, 50)
        .map((s: Record<string, unknown>) => {
          const se = s.session_exercises as Record<string, unknown>
          const sess = se?.sessions as Record<string, unknown>
          return {
            session_id: se?.session_id,
            completed_at: sess?.completed_at,
            set_id: s.id,
            updated_at: s.updated_at,
            weight: s.weight,
            reps: s.reps,
            rpe: s.rpe,
          }
        })

      out.push({
        name: "Q3. Изменения после завершения",
        description: "Sets, где updated_at > sessions.completed_at",
        query: "sets.updated_at > sessions.completed_at WHERE status=completed",
        status: q3Rows.length > 0 ? "warning" : "ok",
        count: q3Rows.length,
        data: q3Rows,
      })

      // Q4: Session exercises for "bad" sessions from Q1/Q2
      const badSessionIds = new Set<string>()
      for (const r of q1Rows) if (r.session_id) badSessionIds.add(r.session_id as string)
      for (const r of q2Rows) if (r.session_id) badSessionIds.add(r.session_id as string)

      let q4Rows: Record<string, unknown>[] = []
      if (badSessionIds.size > 0) {
        const targetIds = Array.from(badSessionIds).slice(0, 5)
        const { data: q4Raw } = await supabase
          .from("session_exercises")
          .select("id, session_id, exercise_id, sort_order, created_at")
          .in("session_id", targetIds)
          .order("session_id")
          .order("sort_order")
          .limit(50)

        q4Rows = (q4Raw || []).map((se) => ({
          session_id: se.session_id,
          session_exercise_id: se.id,
          exercise_id: se.exercise_id,
          sort_order: se.sort_order,
          created_at: se.created_at,
        }))
      }

      out.push({
        name: "Q4. Session exercises для плохих сессий",
        description: `Все session_exercises для ${badSessionIds.size} проблемных сессий из Q1/Q2`,
        query: "session_exercises WHERE session_id IN (bad sessions from Q1/Q2)",
        status: q4Rows.length > 0 ? "warning" : "ok",
        count: q4Rows.length,
        data: q4Rows,
      })

      // Q5: Duplicate exercises by normalized name
      const { data: allEx } = await supabase
        .from("exercises")
        .select("id, name, canonical_key")
        .order("name")

      const nameMap = new Map<string, { ids: string[]; names: string[] }>()
      for (const ex of allEx || []) {
        const norm = (ex.name as string).toLowerCase().trim().replace(/\s+/g, " ")
        if (!nameMap.has(norm)) nameMap.set(norm, { ids: [], names: [] })
        const entry = nameMap.get(norm)!
        entry.ids.push(ex.id as string)
        entry.names.push(ex.name as string)
      }

      const q5Rows: Record<string, unknown>[] = []
      for (const [norm, { ids, names }] of nameMap) {
        if (ids.length > 1) {
          q5Rows.push({
            normalized_name: norm,
            count: ids.length,
            ids: ids.join(", "),
            names: names.join(" | "),
          })
        }
      }

      out.push({
        name: "Q5. Дубли exercises (ломают прошлые значения)",
        description: "Упражнения с одинаковым normalized(name) у текущего пользователя",
        query: "exercises GROUP BY lower(trim(name)) HAVING count > 1",
        status: q5Rows.length > 0 ? "warning" : "ok",
        count: q5Rows.length,
        data: q5Rows.slice(0, 50),
      })

      setResults(out)
      setLastRun(new Date())
    } catch (err) {
      console.error("Diagnostics error:", err)
    } finally {
      setIsRunning(false)
    }
  }

  function copyResults() {
    const text = results
      .map((r) => {
        const header = `=== ${r.name} [${r.status.toUpperCase()}] (${r.count} rows) ===\n${r.description}\nQuery: ${r.query}`
        if (r.data.length === 0) return header + "\n(no data)"
        const keys = Object.keys(r.data[0])
        const rows = r.data.map((row) => keys.map((k) => String(row[k] ?? "null")).join("\t"))
        return header + "\n" + keys.join("\t") + "\n" + rows.join("\n")
      })
      .join("\n\n")
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const totalIssues = results.reduce((sum, r) => sum + (r.status !== "ok" ? r.count : 0), 0)
  const errorCount = results.filter((r) => r.status === "error").length
  const warningCount = results.filter((r) => r.status === "warning").length

  return (
    <Layout hideNav>
      <div className="container max-w-4xl py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6" />
              DB Diagnostics
            </h1>
            <p className="text-muted-foreground text-sm">
              Проверка целостности данных тренировок (dev only)
            </p>
          </div>
          <div className="flex gap-2">
            {results.length > 0 && (
              <Button variant="outline" size="sm" onClick={copyResults}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "Скопировано" : "Copy Results"}
              </Button>
            )}
            <Button onClick={runChecks} disabled={isRunning}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "Проверка..." : "Run checks (workouts)"}
            </Button>
          </div>
        </div>

        {lastRun && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              Последний запуск: {lastRun.toLocaleString()}
            </span>
            <div className="flex gap-2">
              {errorCount > 0 && (
                <Badge variant="destructive">{errorCount} ошибок</Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="secondary">{warningCount} предупреждений</Badge>
              )}
              {totalIssues === 0 && results.length > 0 && (
                <Badge className="bg-emerald-600 text-primary-foreground">Всё чисто ✓</Badge>
              )}
            </div>
          </div>
        )}

        {results.map((result, idx) => (
          <Card
            key={idx}
            className={
              result.status === "error"
                ? "border-destructive"
                : result.status === "warning"
                ? "border-amber-500"
                : ""
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                {result.status === "ok" ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle
                    className={`h-5 w-5 ${result.status === "error" ? "text-destructive" : "text-amber-500"}`}
                  />
                )}
                {result.name}
                <Badge
                  variant={
                    result.status === "ok"
                      ? "outline"
                      : result.status === "error"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {result.count}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{result.description}</p>
              <p className="text-xs font-mono text-muted-foreground/60">{result.query}</p>
            </CardHeader>
            {result.data.length > 0 && (
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(result.data[0]).map((key) => (
                          <TableHead key={key} className="text-xs whitespace-nowrap">
                            {key}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.data.slice(0, 50).map((row, rowIdx) => (
                        <TableRow key={rowIdx}>
                          {Object.values(row).map((val, colIdx) => (
                            <TableCell key={colIdx} className="text-xs font-mono whitespace-nowrap">
                              {val === null ? (
                                <span className="text-muted-foreground italic">null</span>
                              ) : (
                                String(val).slice(0, 60)
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {result.data.length > 50 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Показано 50 из {result.data.length}
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        ))}

        {results.length === 0 && !isRunning && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Нажмите «Run checks (workouts)» для запуска 5 проверок
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  )
}
