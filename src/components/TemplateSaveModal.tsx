import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';

interface TemplateSaveModalProps {
  open: boolean;
  onClose: () => void;
  onCreateNew: (name: string) => Promise<void>;
  onUpdateExisting: () => Promise<void>;
  onSkip: () => void;
  templateName: string;
  isLoading: boolean;
}

export function TemplateSaveModal({
  open,
  onClose,
  onCreateNew,
  onUpdateExisting,
  onSkip,
  templateName,
  isLoading,
}: TemplateSaveModalProps) {
  const { locale } = useLanguage();
  const [showNameInput, setShowNameInput] = useState(false);
  const [newName, setNewName] = useState(`${templateName} (версия 2)`);

  const handleCreateNew = async () => {
    if (!showNameInput) {
      setShowNameInput(true);
      return;
    }
    await onCreateNew(newName.trim() || `${templateName} (версия 2)`);
  };

  const handleClose = () => {
    setShowNameInput(false);
    setNewName(`${templateName} (версия 2)`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {locale === 'ru' ? 'Вы изменили тренировку' : 'You modified the workout'}
          </DialogTitle>
          <DialogDescription>
            {locale === 'ru'
              ? 'Сохранить эту версию как шаблон?'
              : 'Save this version as a template?'}
          </DialogDescription>
        </DialogHeader>

        {showNameInput && (
          <div className="py-4">
            <label className="text-sm text-muted-foreground mb-2 block">
              {locale === 'ru' ? 'Название нового шаблона' : 'New template name'}
            </label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={locale === 'ru' ? 'Название шаблона' : 'Template name'}
              autoFocus
            />
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {!showNameInput ? (
            <>
              <Button
                onClick={handleCreateNew}
                disabled={isLoading}
                className="w-full"
                variant="secondary"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {locale === 'ru' ? 'Создать новый шаблон' : 'Create new template'}
              </Button>
              <Button
                onClick={onUpdateExisting}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {locale === 'ru' ? 'Обновить текущий шаблон' : 'Update current template'}
              </Button>
              <Button
                onClick={onSkip}
                disabled={isLoading}
                variant="ghost"
                className="w-full"
              >
                {locale === 'ru' ? 'Не сохранять' : "Don't save"}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleCreateNew}
                disabled={isLoading || !newName.trim()}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {locale === 'ru' ? 'Создать' : 'Create'}
              </Button>
              <Button
                onClick={() => setShowNameInput(false)}
                disabled={isLoading}
                variant="ghost"
                className="w-full"
              >
                {locale === 'ru' ? 'Назад' : 'Back'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
