import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Template {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

export interface TemplateItem {
  id: string;
  template_id: string;
  exercise_id: string;
  target_sets: number;
  sort_order: number;
  exercise?: {
    id: string;
    name: string;
    type: number;
  };
}

export function useTemplates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Template[];
    },
    enabled: !!user,
  });

  const createTemplate = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('workout_templates')
        .insert({ user_id: user.id, name })
        .select()
        .single();
      
      if (error) throw error;
      return data as Template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('workout_templates')
        .update({ name })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      // Delete template items first
      await supabase
        .from('template_items')
        .delete()
        .eq('template_id', id);
      
      // Delete template
      const { error } = await supabase
        .from('workout_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    isCreating: createTemplate.isPending,
    isDeleting: deleteTemplate.isPending,
  };
}

export function useTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['template', templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      
      if (error) throw error;
      return data as Template;
    },
    enabled: !!templateId,
  });
}

export function useTemplateItems(templateId: string | null) {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['template-items', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('template_items')
        .select(`
          *,
          exercise:exercises(id, name, type)
        `)
        .eq('template_id', templateId)
        .order('sort_order');
      
      if (error) throw error;
      return data as TemplateItem[];
    },
    enabled: !!templateId,
  });

  const addItem = useMutation({
    mutationFn: async ({ exerciseId, targetSets = 3 }: { exerciseId: string; targetSets?: number }) => {
      if (!templateId) throw new Error('No template ID');
      
      // Get max sort_order
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) : 0;
      
      const { data, error } = await supabase
        .from('template_items')
        .insert({
          template_id: templateId,
          exercise_id: exerciseId,
          target_sets: targetSets,
          sort_order: maxOrder + 1,
        })
        .select(`
          *,
          exercise:exercises(id, name, type)
        `)
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-items', templateId] });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, targetSets }: { id: string; targetSets: number }) => {
      const { error } = await supabase
        .from('template_items')
        .update({ target_sets: targetSets })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-items', templateId] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('template_items')
        .delete()
        .eq('id', itemId);
      
      if (error) throw error;
      
      // Reorder remaining items
      const remainingItems = items.filter(i => i.id !== itemId).sort((a, b) => a.sort_order - b.sort_order);
      for (let i = 0; i < remainingItems.length; i++) {
        if (remainingItems[i].sort_order !== i + 1) {
          await supabase
            .from('template_items')
            .update({ sort_order: i + 1 })
            .eq('id', remainingItems[i].id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-items', templateId] });
    },
  });

  const reorderItems = useMutation({
    mutationFn: async (newOrder: { id: string; sort_order: number }[]) => {
      for (const item of newOrder) {
        await supabase
          .from('template_items')
          .update({ sort_order: item.sort_order })
          .eq('id', item.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-items', templateId] });
    },
  });

  return {
    items,
    isLoading,
    addItem,
    updateItem,
    deleteItem,
    reorderItems,
    isAdding: addItem.isPending,
  };
}
