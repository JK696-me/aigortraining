import { Loader2, Check, WifiOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface WorkoutCompletionOverlayProps {
  isVisible: boolean;
  step: 1 | 2 | 3;
  status: 'saving' | 'syncing' | 'offline_queued' | 'success';
}

export function WorkoutCompletionOverlay({ isVisible, step, status }: WorkoutCompletionOverlayProps) {
  const { locale } = useLanguage();

  if (!isVisible) return null;

  const getStepContent = () => {
    if (status === 'offline_queued') {
      return {
        icon: <WifiOff className="w-6 h-6 text-muted-foreground" />,
        text: locale === 'ru' ? 'Сохранено локально' : 'Saved locally',
        subtext: locale === 'ru' ? 'Синхронизируем позже' : 'Will sync later',
        progress: '3/3',
      };
    }

    if (status === 'success') {
      return {
        icon: <Check className="w-6 h-6 text-green-500" />,
        text: locale === 'ru' ? 'Готово' : 'Done',
        subtext: null,
        progress: '3/3',
      };
    }

    switch (step) {
      case 1:
        return {
          icon: <Loader2 className="w-6 h-6 animate-spin text-primary" />,
          text: locale === 'ru' ? 'Сохраняем завершение…' : 'Saving completion…',
          subtext: null,
          progress: '1/3',
        };
      case 2:
        return {
          icon: <Loader2 className="w-6 h-6 animate-spin text-primary" />,
          text: locale === 'ru' ? 'Обновляем историю…' : 'Updating history…',
          subtext: null,
          progress: '2/3',
        };
      case 3:
        return {
          icon: <Loader2 className="w-6 h-6 animate-spin text-primary" />,
          text: locale === 'ru' ? 'Готово' : 'Done',
          subtext: null,
          progress: '3/3',
        };
      default:
        return {
          icon: <Loader2 className="w-6 h-6 animate-spin text-primary" />,
          text: locale === 'ru' ? 'Завершаем…' : 'Finishing…',
          subtext: null,
          progress: '1/3',
        };
    }
  };

  const content = getStepContent();

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-lg p-6 shadow-lg flex flex-col items-center gap-3 min-w-[220px]">
        {content.icon}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{content.progress}</span>
          <p className="text-foreground font-medium text-center">{content.text}</p>
        </div>
        {content.subtext && (
          <p className="text-muted-foreground text-sm text-center">{content.subtext}</p>
        )}
      </div>
    </div>
  );
}
