import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'

interface SeedTemplate {
  id: string
  key: string
  title_ru: string
}

interface SeedTemplateItem {
  exercise_name_ru: string
  sort_order: number
  target_sets: number
}

export function useTemplateSeeding() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hasSeededRef = useRef(false)

  useEffect(() => {
    if (!user?.id || hasSeededRef.current) return

    const ensureSeededTemplates = async () => {
      try {
        // Check if user already has templates
        const { count, error: countError } = await supabase
          .from('workout_templates')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        if (countError) {
          console.error('Seed templates: count error', countError)
          return
        }

        console.log(`Seed templates: count=${count}`)

        if (count && count > 0) {
          hasSeededRef.current = true
          return
        }

        // Fetch seed templates catalog
        const { data: seedTemplates, error: seedError } = await supabase
          .from('seed_templates')
          .select('id, key, title_ru')

        if (seedError || !seedTemplates?.length) {
          console.error('Seed templates: fetch error', seedError)
          return
        }

        // Fetch all seed template items
        const { data: seedItems, error: itemsError } = await supabase
          .from('seed_template_items')
          .select('seed_template_id, exercise_name_ru, sort_order, target_sets')
          .order('sort_order')

        if (itemsError) {
          console.error('Seed templates: items fetch error', itemsError)
          return
        }

        // Get user's exercises to map names to IDs
        const { data: userExercises, error: exError } = await supabase
          .from('exercises')
          .select('id, name')
          .eq('user_id', user.id)

        if (exError) {
          console.error('Seed templates: exercises fetch error', exError)
          return
        }

        const exerciseNameToId = new Map(
          userExercises?.map(ex => [ex.name, ex.id]) || []
        )

        let templatesCreated = 0

        // Create each template for the user
        for (const seedTemplate of seedTemplates) {
          // Create the template with seed_key
          const { data: newTemplate, error: createError } = await supabase
            .from('workout_templates')
            .insert({
              user_id: user.id,
              name: seedTemplate.title_ru,
              seed_key: seedTemplate.key
            })
            .select('id')
            .single()

          if (createError) {
            // Might be duplicate (seed_key unique constraint)
            console.log(`Seed templates: ${seedTemplate.key} already exists or error`, createError)
            continue
          }

          // Get items for this template
          const templateItems = seedItems?.filter(
            item => item.seed_template_id === seedTemplate.id
          ) || []

          // Create template items
          const itemsToInsert = []
          for (const item of templateItems) {
            let exerciseId = exerciseNameToId.get(item.exercise_name_ru)

            // Fallback: create exercise if not found
            if (!exerciseId) {
              console.log(`Seed templates: creating missing exercise "${item.exercise_name_ru}"`)
              const { data: newEx, error: newExError } = await supabase
                .from('exercises')
                .insert({
                  user_id: user.id,
                  name: item.exercise_name_ru,
                  type: 3,
                  increment_kind: 'machine',
                  increment_value: 1,
                  is_dumbbell_pair: false
                })
                .select('id')
                .single()

              if (newExError) {
                console.error(`Seed templates: failed to create exercise "${item.exercise_name_ru}"`, newExError)
                continue
              }
              exerciseId = newEx.id
              exerciseNameToId.set(item.exercise_name_ru, exerciseId)
            }

            itemsToInsert.push({
              template_id: newTemplate.id,
              exercise_id: exerciseId,
              sort_order: item.sort_order,
              target_sets: item.target_sets
            })
          }

          if (itemsToInsert.length > 0) {
            const { error: insertItemsError } = await supabase
              .from('template_items')
              .insert(itemsToInsert)

            if (insertItemsError) {
              console.error(`Seed templates: items insert error for ${seedTemplate.key}`, insertItemsError)
            }
          }

          templatesCreated++
        }

        if (templatesCreated > 0) {
          console.log(`Seed templates: inserted ${templatesCreated}`)
          toast.success(`Добавили ${templatesCreated} стартовых шаблона`)
        }

        // Invalidate caches
        queryClient.invalidateQueries({ queryKey: queryKeys.templates.all(user.id) })
        
        hasSeededRef.current = true
      } catch (error) {
        console.error('Seed templates ERROR:', error)
      }
    }

    ensureSeededTemplates()
  }, [user?.id, queryClient])
}
