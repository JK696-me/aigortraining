import { Cloud, CloudOff, RefreshCw, AlertCircle } from "lucide-react";
import { SyncState } from "@/lib/draftStorage";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface SyncIndicatorProps {
  syncState: SyncState | null;
  isOnline: boolean;
  isSyncing: boolean;
  isFetching?: boolean; // New prop for background refresh indicator
  onSync?: () => void;
  className?: string;
}

export function SyncIndicator({ syncState, isOnline, isSyncing, isFetching, onSync, className }: SyncIndicatorProps) {
  const { locale } = useLanguage();

  // Show fetching indicator even without syncState
  if (!syncState && !isFetching) return null;

  const getContent = () => {
    // Background refresh takes priority for visual feedback
    if (isFetching && !isSyncing) {
      return {
        icon: <RefreshCw className="h-3.5 w-3.5 animate-spin opacity-50" />,
        text: locale === 'ru' ? 'Обновляем...' : 'Updating...',
        className: 'text-muted-foreground',
      };
    }

    if (isSyncing) {
      return {
        icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
        text: locale === 'ru' ? 'Синхронизация...' : 'Syncing...',
        className: 'text-muted-foreground',
      };
    }

    if (!isOnline) {
      return {
        icon: <CloudOff className="h-3.5 w-3.5" />,
        text: locale === 'ru' ? 'Офлайн' : 'Offline',
        className: 'text-yellow-500',
      };
    }

    if (syncState === 'error') {
      return {
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        text: locale === 'ru' ? 'Ошибка синхр.' : 'Sync error',
        className: 'text-destructive cursor-pointer',
        onClick: onSync,
      };
    }

    if (syncState === 'dirty') {
      return {
        icon: <Cloud className="h-3.5 w-3.5" />,
        text: locale === 'ru' ? 'Сохранено локально' : 'Saved locally',
        className: 'text-muted-foreground',
      };
    }

    // synced
    return {
      icon: <Cloud className="h-3.5 w-3.5" />,
      text: locale === 'ru' ? 'Синхронизировано' : 'Synced',
      className: 'text-green-500',
    };
  };

  const content = getContent();

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs',
        content.className,
        className
      )}
      onClick={content.onClick}
    >
      {content.icon}
      <span>{content.text}</span>
    </div>
  );
}
