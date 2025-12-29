import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, ChevronLeft, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/Layout";
import { useTemplates } from "@/hooks/useTemplates";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";

export default function Templates() {
  const navigate = useNavigate();
  const { templates, isLoading, createTemplate, isCreating } = useTemplates();
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Введите название шаблона');
      return;
    }

    try {
      const template = await createTemplate.mutateAsync(newTemplateName.trim());
      setNewTemplateName('');
      setIsCreatingNew(false);
      toast.success('Шаблон создан');
      navigate(`/template-editor?id=${template.id}`);
    } catch (error) {
      console.error('Failed to create template:', error);
      toast.error('Ошибка создания шаблона');
    }
  };

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-muted-foreground mb-3"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">Назад</span>
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Шаблоны</h1>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCreatingNew(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Создать
            </Button>
          </div>
        </div>

        {/* Create New Template Form */}
        {isCreatingNew && (
          <Card className="p-4 bg-card border-border mb-6">
            <h3 className="font-semibold text-foreground mb-3">Новый шаблон</h3>
            <div className="flex gap-2">
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Название шаблона"
                className="flex-1"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTemplate()}
              />
              <Button
                onClick={handleCreateTemplate}
                disabled={isCreating || !newTemplateName.trim()}
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setIsCreatingNew(false);
                  setNewTemplateName('');
                }}
              >
                Отмена
              </Button>
            </div>
          </Card>
        )}

        {/* Templates List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Нет шаблонов"
            description="Шаблоны ускоряют старт тренировки"
            actions={[
              {
                label: 'Создать первый шаблон',
                onClick: () => setIsCreatingNew(true),
                icon: Plus,
              },
            ]}
          />
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <Card
                key={template.id}
                className="p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer active:scale-[0.98]"
                onClick={() => navigate(`/template-editor?id=${template.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{template.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(template.created_at).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
