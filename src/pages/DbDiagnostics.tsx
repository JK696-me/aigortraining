import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Database, RefreshCw } from "lucide-react";
import { Layout } from "@/components/Layout";

interface DiagnosticResult {
  name: string;
  description: string;
  status: "ok" | "warning" | "error";
  count: number;
  data: Record<string, unknown>[];
}

export default function DbDiagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  async function runDiagnostics() {
    setIsRunning(true);
    const diagnosticResults: DiagnosticResult[] = [];

    try {
      // 1. Sets with weight=0 AND reps=6 in completed sessions (suspicious defaults)
      const { data: suspiciousSets, error: e1 } = await supabase
        .from("sets")
        .select(`
          id,
          weight,
          reps,
          rpe,
          created_at,
          session_exercise_id,
          session_exercises!inner(
            id,
            exercise_id,
            session_id,
            sessions!inner(id, status, completed_at)
          )
        `)
        .eq("weight", 0)
        .eq("reps", 6)
        .eq("session_exercises.sessions.status", "completed")
        .limit(50);

      diagnosticResults.push({
        name: "Подозрительные сеты (0kg × 6)",
        description: "Sets с weight=0 и reps=6 в завершённых сессиях — возможно потерянные данные",
        status: (suspiciousSets?.length || 0) > 0 ? "error" : "ok",
        count: suspiciousSets?.length || 0,
        data: (suspiciousSets || []).map((s: Record<string, unknown>) => ({
          set_id: s.id,
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe,
          session_exercise_id: s.session_exercise_id,
          session_id: (s.session_exercises as Record<string, unknown>)?.session_id,
          completed_at: ((s.session_exercises as Record<string, unknown>)?.sessions as Record<string, unknown>)?.completed_at,
        })),
      });

      // 2. Orphaned sets (no valid session_exercise)
      const { data: orphanedSets, error: e2 } = await supabase
        .from("sets")
        .select("id, session_exercise_id, weight, reps, created_at")
        .is("session_exercise_id", null)
        .limit(50);

      diagnosticResults.push({
        name: "Осиротевшие sets",
        description: "Sets без session_exercise_id",
        status: (orphanedSets?.length || 0) > 0 ? "warning" : "ok",
        count: orphanedSets?.length || 0,
        data: orphanedSets || [],
      });

      // 3. Session exercises without session_id or exercise_id
      const { data: brokenSessionExercises, error: e3 } = await supabase
        .from("session_exercises")
        .select("id, session_id, exercise_id, created_at")
        .or("session_id.is.null,exercise_id.is.null")
        .limit(50);

      diagnosticResults.push({
        name: "Битые session_exercises",
        description: "Session_exercises без session_id или exercise_id",
        status: (brokenSessionExercises?.length || 0) > 0 ? "error" : "ok",
        count: brokenSessionExercises?.length || 0,
        data: brokenSessionExercises || [],
      });

      // 4. Duplicate exercises with similar names (same user)
      const { data: allExercises, error: e4 } = await supabase
        .from("exercises")
        .select("id, name, canonical_key, user_id, created_at")
        .order("user_id")
        .order("name");

      const duplicates: Record<string, unknown>[] = [];
      if (allExercises) {
        const byUserAndKey = new Map<string, typeof allExercises>();
        for (const ex of allExercises) {
          const key = `${ex.user_id}:${ex.canonical_key || ex.name.toLowerCase().trim()}`;
          if (!byUserAndKey.has(key)) {
            byUserAndKey.set(key, []);
          }
          byUserAndKey.get(key)!.push(ex);
        }
        for (const [key, exercises] of byUserAndKey) {
          if (exercises.length > 1) {
            duplicates.push({
              canonical_key: key.split(":")[1],
              user_id: exercises[0].user_id,
              count: exercises.length,
              names: exercises.map((e) => e.name).join(", "),
              ids: exercises.map((e) => e.id).join(", "),
            });
          }
        }
      }

      diagnosticResults.push({
        name: "Дубликаты упражнений",
        description: "Упражнения с одинаковым canonical_key у одного пользователя",
        status: duplicates.length > 0 ? "warning" : "ok",
        count: duplicates.length,
        data: duplicates,
      });

      // 5. Sets updated after session completion
      const { data: lateUpdatedSets, error: e5 } = await supabase
        .from("sets")
        .select(`
          id,
          weight,
          reps,
          rpe,
          created_at,
          session_exercise_id,
          session_exercises!inner(
            id,
            session_id,
            sessions!inner(id, status, completed_at)
          )
        `)
        .eq("session_exercises.sessions.status", "completed")
        .not("session_exercises.sessions.completed_at", "is", null)
        .limit(100);

      // Filter in JS since we can't compare dates in the query easily
      const setsAfterCompletion = (lateUpdatedSets || []).filter((s: Record<string, unknown>) => {
        const completedAt = ((s.session_exercises as Record<string, unknown>)?.sessions as Record<string, unknown>)?.completed_at as string;
        const setCreatedAt = s.created_at as string;
        // Sets created after completion are suspicious
        return completedAt && setCreatedAt && new Date(setCreatedAt) > new Date(completedAt);
      });

      diagnosticResults.push({
        name: "Sets после завершения",
        description: "Sets созданные после completed_at сессии",
        status: setsAfterCompletion.length > 0 ? "warning" : "ok",
        count: setsAfterCompletion.length,
        data: setsAfterCompletion.slice(0, 20).map((s: Record<string, unknown>) => ({
          set_id: s.id,
          weight: s.weight,
          reps: s.reps,
          set_created_at: s.created_at,
          session_id: (s.session_exercises as Record<string, unknown>)?.session_id,
          completed_at: ((s.session_exercises as Record<string, unknown>)?.sessions as Record<string, unknown>)?.completed_at,
        })),
      });

      // 6. Sessions without any exercises
      const { data: emptySessions, error: e6 } = await supabase
        .from("sessions")
        .select(`
          id,
          status,
          date,
          completed_at,
          session_exercises(id)
        `)
        .eq("status", "completed")
        .limit(100);

      const sessionsWithoutExercises = (emptySessions || []).filter(
        (s: Record<string, unknown>) => !s.session_exercises || (s.session_exercises as unknown[]).length === 0
      );

      diagnosticResults.push({
        name: "Пустые завершённые сессии",
        description: "Completed сессии без упражнений",
        status: sessionsWithoutExercises.length > 0 ? "warning" : "ok",
        count: sessionsWithoutExercises.length,
        data: sessionsWithoutExercises.slice(0, 20).map((s: Record<string, unknown>) => ({
          session_id: s.id,
          status: s.status,
          date: s.date,
          completed_at: s.completed_at,
        })),
      });

      // 7. Session exercises without any sets
      const { data: exercisesWithoutSets, error: e7 } = await supabase
        .from("session_exercises")
        .select(`
          id,
          exercise_id,
          session_id,
          created_at,
          sessions!inner(status, completed_at),
          sets(id)
        `)
        .eq("sessions.status", "completed")
        .limit(200);

      const noSetsExercises = (exercisesWithoutSets || []).filter(
        (se: Record<string, unknown>) => !se.sets || (se.sets as unknown[]).length === 0
      );

      diagnosticResults.push({
        name: "Упражнения без сетов",
        description: "Session_exercises в completed сессиях без sets",
        status: noSetsExercises.length > 0 ? "warning" : "ok",
        count: noSetsExercises.length,
        data: noSetsExercises.slice(0, 20).map((se: Record<string, unknown>) => ({
          session_exercise_id: se.id,
          session_id: se.session_id,
          exercise_id: se.exercise_id,
          created_at: se.created_at,
          completed_at: (se.sessions as Record<string, unknown>)?.completed_at,
        })),
      });

      setResults(diagnosticResults);
      setLastRun(new Date());
    } catch (err) {
      console.error("Diagnostics error:", err);
    } finally {
      setIsRunning(false);
    }
  }

  const totalIssues = results.reduce((sum, r) => sum + (r.status !== "ok" ? r.count : 0), 0);
  const errorCount = results.filter((r) => r.status === "error").length;
  const warningCount = results.filter((r) => r.status === "warning").length;

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
              Проверка целостности данных (dev only)
            </p>
          </div>
          <Button onClick={runDiagnostics} disabled={isRunning}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? "animate-spin" : ""}`} />
            {isRunning ? "Проверка..." : "Запустить"}
          </Button>
        </div>

        {lastRun && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              Последний запуск: {lastRun.toLocaleString()}
            </span>
            {results.length > 0 && (
              <div className="flex gap-2">
                {errorCount > 0 && (
                  <Badge variant="destructive">{errorCount} ошибок</Badge>
                )}
                {warningCount > 0 && (
                  <Badge variant="secondary">{warningCount} предупреждений</Badge>
                )}
                {totalIssues === 0 && (
                  <Badge className="bg-emerald-600 text-primary-foreground">Всё в порядке</Badge>
                )}
              </div>
            )}
          </div>
        )}

        {results.map((result, idx) => (
          <Card key={idx} className={result.status === "error" ? "border-destructive" : result.status === "warning" ? "border-amber-500" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                {result.status === "ok" ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className={`h-5 w-5 ${result.status === "error" ? "text-destructive" : "text-amber-500"}`} />
                )}
                {result.name}
                <Badge variant={result.status === "ok" ? "outline" : result.status === "error" ? "destructive" : "secondary"}>
                  {result.count}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{result.description}</p>
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
                      {result.data.slice(0, 10).map((row, rowIdx) => (
                        <TableRow key={rowIdx}>
                          {Object.values(row).map((val, colIdx) => (
                            <TableCell key={colIdx} className="text-xs font-mono whitespace-nowrap">
                              {val === null ? <span className="text-muted-foreground">null</span> : String(val).slice(0, 50)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {result.data.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ...и ещё {result.data.length - 10} записей
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
              Нажмите "Запустить" для проверки базы данных
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
