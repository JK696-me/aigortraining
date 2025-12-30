import { useEffect, useState } from 'react';
import { Loader2, Check, WifiOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface WorkoutCompletionOverlayProps {
  isVisible: boolean;
  status: 'saving' | 'syncing' | 'offline_queued' | 'success';
  showProgress: boolean;
}

export function WorkoutCompletionOverlay({ isVisible, status, showProgress }: WorkoutCompletionOverlayProps) {
  const { locale } = useLanguage();
  const [showProgressText, setShowProgressText] = useState(false);

  // Show progress text only after 600ms
  useEffect(() => {
    if (!isVisible || !showProgress) {
      setShowProgressText(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowProgressText(true);
    }, 600);

    return () => clearTimeout(timer);
  }, [isVisible, showProgress]);

  if (!isVisible) return null;

  const getStatusContent = () => {
    switch (status) {
      case 'saving':
        return {
          icon: <Loader2 className="w-6 h-6 animate-spin text-primary" />,
          text: locale === 'ru' ? 'Завершаем тренировку…' : 'Finishing workout…',
          subtext: showProgressText 
            ? (locale === 'ru' ? 'Сохраняем данные…' : 'Saving data…') 
            : null,
        };
      case 'syncing':
        return {
          icon: <Loader2 className="w-6 h-6 animate-spin text-primary" />,
          text: locale === 'ru' ? 'Синхронизация…' : 'Syncing…',
          subtext: locale === 'ru' ? 'Обновляем историю…' : 'Updating history…',
        };
      case 'offline_queued':
        return {
          icon: <WifiOff className="w-6 h-6 text-muted-foreground" />,
          text: locale === 'ru' ? 'Сохранено локально' : 'Saved locally',
          subtext: locale === 'ru' ? 'Синхронизируем позже' : 'Will sync later',
        };
      case 'success':
        return {
          icon: <Check className="w-6 h-6 text-green-500" />,
          text: locale === 'ru' ? 'Тренировка завершена!' : 'Workout finished!',
          subtext: null,
        };
      default:
        return {
          icon: <Loader2 className="w-6 h-6 animate-spin text-primary" />,
          text: locale === 'ru' ? 'Завершаем…' : 'Finishing…',
          subtext: null,
        };
    }
  };

  const content = getStatusContent();

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-lg p-6 shadow-lg flex flex-col items-center gap-3 min-w-[200px]">
        {content.icon}
        <p className="text-foreground font-medium text-center">{content.text}</p>
        {content.subtext && (
          <p className="text-muted-foreground text-sm text-center">{content.subtext}</p>
        )}
      </div>
    </div>
  );
}
