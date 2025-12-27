import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Plus, X, Image, Upload, Loader2 } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';
import { toast } from 'sonner';

interface HealthEntryData {
  id?: string;
  date: string;
  weight_kg: string;
  shoulders_cm: string;
  chest_cm: string;
  biceps_cm: string;
  waist_cm: string;
  sides_cm: string;
  glutes_cm: string;
  thighs_cm: string;
  notes: string;
}

interface Attachment {
  id: string;
  file_path: string;
  file_url: string;
  isNew?: boolean;
  file?: File;
}

const initialFormData: HealthEntryData = {
  date: format(new Date(), 'yyyy-MM-dd'),
  weight_kg: '',
  shoulders_cm: '',
  chest_cm: '',
  biceps_cm: '',
  waist_cm: '',
  sides_cm: '',
  glutes_cm: '',
  thighs_cm: '',
  notes: '',
};

export default function HealthEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entryId = searchParams.get('id');
  const { locale } = useLanguage();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<HealthEntryData>(initialFormData);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(!!entryId);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (entryId && user) {
      loadEntry();
    }
  }, [entryId, user]);

  const loadEntry = async () => {
    if (!entryId || !user) return;

    setIsLoading(true);
    try {
      // Load entry
      const { data: entry, error } = await supabase
        .from('health_entries')
        .select('*')
        .eq('id', entryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!entry) {
        toast.error(locale === 'ru' ? 'Запись не найдена' : 'Entry not found');
        navigate('/health');
        return;
      }

      setFormData({
        id: entry.id,
        date: entry.date,
        weight_kg: entry.weight_kg?.toString() || '',
        shoulders_cm: entry.shoulders_cm?.toString() || '',
        chest_cm: entry.chest_cm?.toString() || '',
        biceps_cm: entry.biceps_cm?.toString() || '',
        waist_cm: entry.waist_cm?.toString() || '',
        sides_cm: entry.sides_cm?.toString() || '',
        glutes_cm: entry.glutes_cm?.toString() || '',
        thighs_cm: entry.thighs_cm?.toString() || '',
        notes: entry.notes || '',
      });

      // Load attachments
      const { data: attachmentsData } = await supabase
        .from('health_attachments')
        .select('*')
        .eq('health_entry_id', entryId);

      if (attachmentsData) {
        setAttachments(attachmentsData.map(a => ({
          id: a.id,
          file_path: a.file_path,
          file_url: a.file_url || '',
        })));
      }
    } catch (error) {
      console.error('Failed to load entry:', error);
      toast.error(locale === 'ru' ? 'Ошибка загрузки' : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof HealthEntryData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.error(locale === 'ru' ? 'Только изображения' : 'Images only');
        continue;
      }

      const newAttachment: Attachment = {
        id: crypto.randomUUID(),
        file_path: '',
        file_url: URL.createObjectURL(file),
        isNew: true,
        file,
      };
      setAttachments(prev => [...prev, newAttachment]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async (attachment: Attachment) => {
    if (attachment.isNew) {
      // Just remove from state
      setAttachments(prev => prev.filter(a => a.id !== attachment.id));
      URL.revokeObjectURL(attachment.file_url);
    } else {
      // Delete from storage and database
      try {
        await supabase.storage.from('inbody').remove([attachment.file_path]);
        await supabase.from('health_attachments').delete().eq('id', attachment.id);
        setAttachments(prev => prev.filter(a => a.id !== attachment.id));
        toast.success(locale === 'ru' ? 'Фото удалено' : 'Photo deleted');
      } catch (error) {
        console.error('Failed to delete attachment:', error);
        toast.error(locale === 'ru' ? 'Ошибка удаления' : 'Delete failed');
      }
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const numericFields = ['weight_kg', 'shoulders_cm', 'chest_cm', 'biceps_cm', 'waist_cm', 'sides_cm', 'glutes_cm', 'thighs_cm'] as const;
      
      const entryData = {
        user_id: user.id,
        date: formData.date,
        notes: formData.notes || null,
        weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
        shoulders_cm: formData.shoulders_cm ? parseFloat(formData.shoulders_cm) : null,
        chest_cm: formData.chest_cm ? parseFloat(formData.chest_cm) : null,
        biceps_cm: formData.biceps_cm ? parseFloat(formData.biceps_cm) : null,
        waist_cm: formData.waist_cm ? parseFloat(formData.waist_cm) : null,
        sides_cm: formData.sides_cm ? parseFloat(formData.sides_cm) : null,
        glutes_cm: formData.glutes_cm ? parseFloat(formData.glutes_cm) : null,
        thighs_cm: formData.thighs_cm ? parseFloat(formData.thighs_cm) : null,
      };

      let savedEntryId = formData.id;

      // Upsert entry
      if (formData.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('health_entries')
          .update(entryData)
          .eq('id', formData.id);

        if (updateError) throw updateError;
        savedEntryId = formData.id;
      } else {
        // Insert new (or update if same date exists)
        const { data: existingEntry } = await supabase
          .from('health_entries')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', formData.date)
          .maybeSingle();

        if (existingEntry) {
          const { error: updateError } = await supabase
            .from('health_entries')
            .update(entryData)
            .eq('id', existingEntry.id);

          if (updateError) throw updateError;
          savedEntryId = existingEntry.id;
        } else {
          const { data: newEntry, error: insertError } = await supabase
            .from('health_entries')
            .insert(entryData)
            .select('id')
            .single();

          if (insertError) throw insertError;
          savedEntryId = newEntry.id;
        }
      }

      // Upload new attachments
      const newAttachments = attachments.filter(a => a.isNew && a.file);
      
      for (const attachment of newAttachments) {
        if (!attachment.file) continue;

        const fileExt = attachment.file.name.split('.').pop();
        const filePath = `${user.id}/${savedEntryId}/${attachment.id}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('inbody')
          .upload(filePath, attachment.file);

        if (uploadError) {
          console.error('Failed to upload file:', uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('inbody')
          .getPublicUrl(filePath);

        await supabase.from('health_attachments').insert({
          user_id: user.id,
          health_entry_id: savedEntryId,
          file_path: filePath,
          file_url: publicUrl,
        });
      }

      toast.success(locale === 'ru' ? 'Сохранено' : 'Saved');
      navigate('/health');
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error(locale === 'ru' ? 'Ошибка сохранения' : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const measurementFields = [
    { key: 'weight_kg', label: locale === 'ru' ? 'Вес (кг)' : 'Weight (kg)' },
    { key: 'shoulders_cm', label: locale === 'ru' ? 'Плечи (см)' : 'Shoulders (cm)' },
    { key: 'chest_cm', label: locale === 'ru' ? 'Грудь (см)' : 'Chest (cm)' },
    { key: 'biceps_cm', label: locale === 'ru' ? 'Бицепс (см)' : 'Biceps (cm)' },
    { key: 'waist_cm', label: locale === 'ru' ? 'Талия (см)' : 'Waist (cm)' },
    { key: 'sides_cm', label: locale === 'ru' ? 'Бока (см)' : 'Sides (cm)' },
    { key: 'glutes_cm', label: locale === 'ru' ? 'Ягодицы (см)' : 'Glutes (cm)' },
    { key: 'thighs_cm', label: locale === 'ru' ? 'Бёдра (см)' : 'Thighs (cm)' },
  ] as const;

  if (isLoading) {
    return (
      <Layout>
        <div className="px-4 pt-12 safe-top pb-24 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/health')}
            className="flex items-center gap-1 text-muted-foreground mb-3"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">{locale === 'ru' ? 'Назад' : 'Back'}</span>
          </button>
          <h1 className="text-2xl font-bold text-foreground">
            {entryId 
              ? (locale === 'ru' ? 'Редактировать замер' : 'Edit Measurement')
              : (locale === 'ru' ? 'Новый замер' : 'New Measurement')
            }
          </h1>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Date */}
          <div className="space-y-2">
            <Label>{locale === 'ru' ? 'Дата' : 'Date'}</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => handleInputChange('date', e.target.value)}
              className="bg-background"
            />
          </div>

          {/* Measurements */}
          <Card className="p-4 bg-card border-border">
            <h3 className="font-semibold text-foreground mb-4">
              {locale === 'ru' ? 'Измерения' : 'Measurements'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {measurementFields.map(field => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-sm text-muted-foreground">{field.label}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="0"
                    value={formData[field.key]}
                    onChange={(e) => handleInputChange(field.key, e.target.value)}
                    className="bg-background font-mono"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{locale === 'ru' ? 'Заметки' : 'Notes'}</Label>
            <Textarea
              placeholder={locale === 'ru' ? 'Опционально...' : 'Optional...'}
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              className="bg-background min-h-[80px]"
            />
          </div>

          {/* InBody Photos */}
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Image className="h-4 w-4" />
                InBody
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                {locale === 'ru' ? 'Загрузить' : 'Upload'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {attachments.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-border rounded-lg">
                <Image className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {locale === 'ru' ? 'Нет фото InBody' : 'No InBody photos'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {attachments.map(attachment => (
                  <div key={attachment.id} className="relative aspect-square">
                    <img
                      src={attachment.file_url}
                      alt="InBody"
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      onClick={() => handleRemoveAttachment(attachment)}
                      className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {locale === 'ru' ? 'Сохранить' : 'Save'}
          </Button>
        </div>
      </div>
    </Layout>
  );
}