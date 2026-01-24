import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Calendar, Clock, Dumbbell, ChevronRight, MoreVertical, Trash2, Undo2, Loader2, RefreshCw, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Layout } from "@/components/Layout"
import { useLanguage } from "@/contexts/LanguageContext"
import { useAuth } from "@/contexts/AuthContext"
import { useWorkout } from "@/contexts/WorkoutContext"
import { useCompletedSessionsList, useSessionDetails, type SessionListItem } from "@/hooks/useHistorySessions"
import { SessionListSkeleton, SessionDetailSkeleton } from "@/components/HistorySkeletons"
import { supabase } from "@/integrations/supabase/client"
import { format } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import { toast } from 'sonner'

export default function ExerciseHistory() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const sessionId = searchParams.get('session')
  const { t, locale } = useLanguage()
  const { user } = useAuth()
  const { setActiveSession } = useWorkout()
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [, setForceUpdate] = useState(0)

  // Use new optimized hooks
  const {
    sessions,
    isLoading: isLoadingList,
    isFetching: isFetchingList,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    deleteSession,
    refetch,
  } = useCompletedSessionsList()

  const {
    data: selectedSessionDetails,
    isLoading: isLoadingDetails,
    isFetching: isFetchingDetails,
  } = useSessionDetails(sessionId)

  // Force re-render every second to update undo availability
  useEffect(() => {
    const interval = setInterval(() => setForceUpdate(n => n + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return format(date, 'd MMMM yyyy, HH:mm', { locale: locale === 'ru' ? ru : enUS })
  }

  const calculateDuration = useCallback((date: string, completedAt: string) => {
    const start = new Date(date).getTime()
    const end = new Date(completedAt).getTime()
    return Math.round((end - start) / 60000)
  }, [])

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setSessionToDelete(sessionId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return
    
    setIsDeleting(true)
    try {
      await deleteSession(sessionToDelete)
      
      if (sessionId === sessionToDelete) {
        setSearchParams({})
      }
      
      toast.success(locale === 'ru' ? 'Тренировка удалена' : 'Workout deleted')
    } catch (error) {
      console.error('Failed to delete session:', error)
      toast.error(locale === 'ru' ? 'Ошибка удаления' : 'Failed to delete')
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    }
  }

  const canUndo = (session: SessionListItem | { undo_available_until: string | null }) => {
    if (!session.undo_available_until) return false
    return new Date() <= new Date(session.undo_available_until)
  }

  const getUndoTimeRemaining = (session: SessionListItem | { undo_available_until: string | null }) => {
    if (!session.undo_available_until) return 0
    const remaining = new Date(session.undo_available_until).getTime() - Date.now()
    return Math.max(0, Math.ceil(remaining / 1000))
  }

  const formatUndoTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleUndoWorkout = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    
    setIsUndoing(true)
    try {
      const { error } = await supabase.rpc('undo_complete_session', {
        session_id: sessionId,
      })

      if (error) {
        console.error('RPC error:', error)
        if (error.message.includes('undo_not_available')) {
          toast.error(locale === 'ru' ? 'Время отмены истекло' : 'Undo time expired')
        } else if (error.message.includes('session_not_found')) {
          toast.error(locale === 'ru' ? 'Сессия не найдена' : 'Session not found')
        } else {
          toast.error(locale === 'ru' ? 'Ошибка отмены' : 'Failed to undo')
        }
        return
      }

      await setActiveSession(sessionId)

      toast.success(locale === 'ru' ? 'Тренировка восстановлена' : 'Workout restored')
      navigate('/workout')
    } catch (error) {
      console.error('Failed to undo workout:', error)
      toast.error(locale === 'ru' ? 'Ошибка отмены' : 'Failed to undo')
    } finally {
      setIsUndoing(false)
    }
  }

  const handleSessionClick = (session: SessionListItem) => {
    setSearchParams({ session: session.id })
  }

  const handleBackToList = () => {
    setSearchParams({})
  }

  const getTotalSets = () => {
    if (!selectedSessionDetails) return 0
    return selectedSessionDetails.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  }

  // Session Details View
  if (sessionId) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top pb-24">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={handleBackToList}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm">{t('back')}</span>
              </button>
              {selectedSessionDetails && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-5 w-5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => handleDeleteClick(e, sessionId)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {locale === 'ru' ? 'Удалить тренировку' : 'Delete workout'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{t('workoutDetails')}</h1>
              {isFetchingDetails && !isLoadingDetails && (
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {selectedSessionDetails && (
              <p className="text-muted-foreground">
                {formatSessionDate(selectedSessionDetails.completed_at)}
              </p>
            )}
            
            {/* Undo Banner in Detail View */}
            {selectedSessionDetails && canUndo(selectedSessionDetails) && (
              <Card className="mt-4 p-4 bg-primary/10 border-primary/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {locale === 'ru' ? 'Отменить завершение?' : 'Undo completion?'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {locale === 'ru' ? 'Осталось' : 'Remaining'}: {formatUndoTime(getUndoTimeRemaining(selectedSessionDetails))}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => handleUndoWorkout(e, sessionId)}
                    disabled={isUndoing}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isUndoing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Undo2 className="h-4 w-4 mr-2" />
                    )}
                    {locale === 'ru' ? 'Отменить' : 'Undo'}
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {isLoadingDetails ? (
            <SessionDetailSkeleton />
          ) : selectedSessionDetails ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <Card className="p-4 bg-card border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">{t('duration')}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {calculateDuration(selectedSessionDetails.date, selectedSessionDetails.completed_at)} {t('minutes')}
                  </p>
                </Card>
                <Card className="p-4 bg-card border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <Dumbbell className="h-4 w-4 text-accent" />
                    <span className="text-xs text-muted-foreground">{t('totalSets')}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {getTotalSets()}
                  </p>
                </Card>
              </div>

              {/* Exercises */}
              <div className="space-y-4">
                {selectedSessionDetails.exercises.length === 0 ? (
                  <Card className="p-8 bg-card border-border text-center">
                    <p className="text-muted-foreground">
                      {locale === 'ru' ? 'Нет упражнений' : 'No exercises'}
                    </p>
                  </Card>
                ) : (
                  selectedSessionDetails.exercises.map((exercise) => (
                    <Card key={exercise.id} className="p-4 bg-card border-border">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-foreground">{exercise.name}</h3>
                        <div className="flex items-center gap-2">
                          {exercise.rpe !== null && (
                            <span className="text-sm text-accent">RPE {exercise.rpe}</span>
                          )}
                          <button
                            onClick={() => navigate(`/exercise-progress?exercise=${exercise.exercise_id}&from=history`)}
                            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
                            title={locale === 'ru' ? 'Прогресс' : 'Progress'}
                          >
                            <TrendingUp className="h-4 w-4 text-primary" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {exercise.sets.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">
                            {locale === 'ru' ? 'Нет подходов' : 'No sets'}
                          </p>
                        ) : (
                          exercise.sets.map((set) => (
                            <div
                              key={set.set_index}
                              className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-secondary/50"
                            >
                              <span className="text-sm text-muted-foreground">
                                {t('set')} {set.set_index}
                              </span>
                              <span className="font-mono font-medium text-foreground">
                                {set.weight}{t('kg')} × {set.reps}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </>
          ) : (
            <Card className="p-8 bg-card border-border text-center">
              <p className="text-muted-foreground">
                {locale === 'ru' ? 'Тренировка не найдена' : 'Workout not found'}
              </p>
            </Card>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {locale === 'ru' ? 'Удалить тренировку?' : 'Delete workout?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {locale === 'ru' 
                  ? 'Будут удалены все упражнения и подходы этой тренировки. Действие нельзя отменить.'
                  : 'All exercises and sets will be deleted. This cannot be undone.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                {locale === 'ru' ? 'Отмена' : 'Cancel'}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting 
                  ? (locale === 'ru' ? 'Удаление...' : 'Deleting...') 
                  : (locale === 'ru' ? 'Удалить' : 'Delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Layout>
    )
  }

  // Sessions List View
  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{t('workoutHistory')}</h1>
            {isFetchingList && !isLoadingList && (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-muted-foreground">{t('history')}</p>
        </div>

        {isLoadingList ? (
          <SessionListSkeleton />
        ) : sessions.length === 0 ? (
          <Card className="p-8 bg-card border-border text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">{t('noCompletedWorkouts')}</h3>
            <p className="text-sm text-muted-foreground">{t('completeFirstWorkout')}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session, index) => (
              <Card
                key={session.id}
                className={`p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer ${
                  index === 0 && canUndo(session) ? 'border-primary/50' : ''
                }`}
                onClick={() => handleSessionClick(session)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">
                        {formatSessionDate(session.completed_at)}
                      </p>
                      {/* Show syncing badge for pending sessions */}
                      {(session as SessionListItem & { _pending?: boolean })._pending && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {locale === 'ru' ? 'Синхронизация…' : 'Syncing…'}
                        </span>
                      )}

                      {/* Auto-completed badge */}
                      {((session as SessionListItem & { _auto_completed?: boolean })._auto_completed || session.auto_completed) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium">
                          {locale === 'ru' ? 'Автозавершено' : 'Auto'}
                        </span>
                      )}
                    </div>
                    {session.template_name && (
                      <p className="text-sm text-primary truncate">{session.template_name}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{session.exercise_count} {t('exercisesCount')}</span>
                      <span>•</span>
                      <span>{session.set_count} {t('sets')}</span>
                      <span>•</span>
                      <span>{calculateDuration(session.date, session.completed_at)} {t('minutes')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Show Undo button only for the first (most recent) session if undo is available */}
                    {index === 0 && canUndo(session) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-primary/50 text-primary hover:bg-primary/10"
                        onClick={(e) => handleUndoWorkout(e, session.id)}
                        disabled={isUndoing}
                      >
                        {isUndoing ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Undo2 className="h-3 w-3 mr-1" />
                        )}
                        {locale === 'ru' ? 'Отменить' : 'Undo'}
                        <span className="ml-1 text-muted-foreground">
                          ({formatUndoTime(getUndoTimeRemaining(session))})
                        </span>
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => handleDeleteClick(e, session.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {locale === 'ru' ? 'Удалить тренировку' : 'Delete workout'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            ))}

            {/* Load More Button */}
            {hasNextPage && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {locale === 'ru' ? 'Загрузка...' : 'Loading...'}
                  </>
                ) : (
                  locale === 'ru' ? 'Показать ещё' : 'Show more'
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === 'ru' ? 'Удалить тренировку?' : 'Delete workout?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {locale === 'ru' 
                ? 'Будут удалены все упражнения и подходы этой тренировки. Действие нельзя отменить.'
                : 'All exercises and sets will be deleted. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {locale === 'ru' ? 'Отмена' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting 
                ? (locale === 'ru' ? 'Удаление...' : 'Deleting...') 
                : (locale === 'ru' ? 'Удалить' : 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  )
}
