import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Scale, Image, MoreVertical, Trash2, Edit } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Layout } from "@/components/Layout";
import { HealthProgressChart } from "@/components/health/HealthProgressChart";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { toast } from 'sonner';

interface HealthEntry {
  id: string;
  date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  thighs_cm: number | null;
  hasAttachments: boolean;
}

export default function Health() {
  const navigate = useNavigate();
  const { locale } = useLanguage();
  const { user } = useAuth();
  
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadEntries();
  }, [user]);

  const loadEntries = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Load health entries
      const { data: entriesData, error } = await supabase
        .from('health_entries')
        .select('id, date, weight_kg, waist_cm, chest_cm, thighs_cm')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Check for attachments
      const entriesWithAttachments: HealthEntry[] = [];
      
      if (entriesData && entriesData.length > 0) {
        const { data: attachments } = await supabase
          .from('health_attachments')
          .select('health_entry_id')
          .in('health_entry_id', entriesData.map(e => e.id));

        const attachmentSet = new Set(attachments?.map(a => a.health_entry_id) || []);

        for (const entry of entriesData) {
          entriesWithAttachments.push({
            ...entry,
            hasAttachments: attachmentSet.has(entry.id),
          });
        }
      }

      setEntries(entriesWithAttachments);
    } catch (error) {
      console.error('Failed to load health entries:', error);
      toast.error(locale === 'ru' ? 'Ошибка загрузки' : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntryId || !user) return;

    try {
      // Delete attachments from storage first
      const { data: attachments } = await supabase
        .from('health_attachments')
        .select('file_path')
        .eq('health_entry_id', deleteEntryId);

      if (attachments && attachments.length > 0) {
        await supabase.storage
          .from('inbody')
          .remove(attachments.map(a => a.file_path));
      }

      // Delete the entry (attachments will cascade delete)
      const { error } = await supabase
        .from('health_entries')
        .delete()
        .eq('id', deleteEntryId);

      if (error) throw error;

      setEntries(prev => prev.filter(e => e.id !== deleteEntryId));
      toast.success(locale === 'ru' ? 'Запись удалена' : 'Entry deleted');
    } catch (error) {
      console.error('Failed to delete entry:', error);
      toast.error(locale === 'ru' ? 'Ошибка удаления' : 'Delete failed');
    } finally {
      setDeleteEntryId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'd MMMM yyyy', { locale: locale === 'ru' ? ru : enUS });
  };

  const displayedEntries = showMore ? entries : entries.slice(0, 10);

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            {locale === 'ru' ? 'Здоровье' : 'Health'}
          </h1>
          <p className="text-muted-foreground">
            {locale === 'ru' ? 'Вес, объёмы, InBody' : 'Weight, measurements, InBody'}
          </p>
        </div>

        {/* Progress Chart */}
        <HealthProgressChart />

        {/* Add button */}
        <Button
          onClick={() => navigate('/health-entry')}
          className="w-full mb-6"
        >
          <Plus className="h-5 w-5 mr-2" />
          {locale === 'ru' ? 'Добавить замер' : 'Add Measurement'}
        </Button>

        {/* Entries list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-secondary rounded-lg animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border">
            <Scale className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">
              {locale === 'ru' ? 'Пока нет замеров' : 'No measurements yet'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {locale === 'ru' 
                ? 'Отслеживайте свой прогресс' 
                : 'Track your progress'}
            </p>
            <Button onClick={() => navigate('/health-entry')}>
              <Plus className="h-4 w-4 mr-2" />
              {locale === 'ru' ? 'Добавить первый замер' : 'Add first measurement'}
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayedEntries.map(entry => (
              <Card
                key={entry.id}
                className="p-4 bg-card border-border"
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => navigate(`/health-entry?id=${entry.id}`)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-medium text-foreground">
                        {formatDate(entry.date)}
                      </p>
                      {entry.hasAttachments && (
                        <Badge variant="secondary" className="text-xs">
                          <Image className="h-3 w-3 mr-1" />
                          InBody
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {entry.weight_kg !== null && (
                        <span className="text-foreground">
                          <span className="text-muted-foreground">{locale === 'ru' ? 'Вес:' : 'Weight:'}</span>{' '}
                          <span className="font-mono font-medium">{entry.weight_kg}</span> {locale === 'ru' ? 'кг' : 'kg'}
                        </span>
                      )}
                      {entry.waist_cm !== null && (
                        <span className="text-foreground">
                          <span className="text-muted-foreground">{locale === 'ru' ? 'Талия:' : 'Waist:'}</span>{' '}
                          <span className="font-mono font-medium">{entry.waist_cm}</span> {locale === 'ru' ? 'см' : 'cm'}
                        </span>
                      )}
                      {entry.chest_cm !== null && (
                        <span className="text-foreground">
                          <span className="text-muted-foreground">{locale === 'ru' ? 'Грудь:' : 'Chest:'}</span>{' '}
                          <span className="font-mono font-medium">{entry.chest_cm}</span> {locale === 'ru' ? 'см' : 'cm'}
                        </span>
                      )}
                    </div>
                  </button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/health-entry?id=${entry.id}`)}>
                        <Edit className="h-4 w-4 mr-2" />
                        {locale === 'ru' ? 'Редактировать' : 'Edit'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteEntryId(entry.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {locale === 'ru' ? 'Удалить' : 'Delete'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}

            {entries.length > 10 && !showMore && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowMore(true)}
              >
                {locale === 'ru' 
                  ? `Показать ещё (${entries.length - 10})` 
                  : `Show more (${entries.length - 10})`}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteEntryId} onOpenChange={() => setDeleteEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === 'ru' ? 'Удалить запись?' : 'Delete entry?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {locale === 'ru' 
                ? 'Это действие нельзя отменить. Все фото InBody также будут удалены.' 
                : 'This action cannot be undone. All InBody photos will also be deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{locale === 'ru' ? 'Отмена' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {locale === 'ru' ? 'Удалить' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}