import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DraftWorkout } from "@/lib/draftStorage";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface DraftRecoveryModalProps {
  draft: DraftWorkout | null;
  isOpen: boolean;
  onContinue: () => void;
  onDiscard: () => void;
}

export function DraftRecoveryModal({ draft, isOpen, onContinue, onDiscard }: DraftRecoveryModalProps) {
  const { locale } = useLanguage();

  if (!draft) return null;

  const timeAgo = formatDistanceToNow(new Date(draft.started_at), {
    addSuffix: true,
    locale: locale === 'ru' ? ru : undefined,
  });

  const exerciseCount = draft.exercises.length;

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {locale === 'ru' ? 'Найдена незавершённая тренировка' : 'Unfinished workout found'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {locale === 'ru' 
              ? `Тренировка начата ${timeAgo}, ${exerciseCount} упр.`
              : `Workout started ${timeAgo}, ${exerciseCount} exercises`
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard}>
            {locale === 'ru' ? 'Удалить черновик' : 'Delete draft'}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>
            {locale === 'ru' ? 'Продолжить' : 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
