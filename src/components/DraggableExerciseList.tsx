import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'

interface DraggableItem {
  id: string
  sort_order: number | null
}

interface SortableItemProps<T extends DraggableItem> {
  item: T
  renderContent: (item: T, dragHandle: React.ReactNode) => React.ReactNode
  isSaving: boolean
}

function SortableItem<T extends DraggableItem>({ item, renderContent, isSaving }: SortableItemProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isSaving })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  }

  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      className="p-2 cursor-grab active:cursor-grabbing touch-none disabled:opacity-30"
      disabled={isSaving}
      aria-label="Drag to reorder"
    >
      <GripVertical className="h-5 w-5 text-muted-foreground" />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style}>
      {renderContent(item, dragHandle)}
    </div>
  )
}

interface DraggableExerciseListProps<T extends DraggableItem> {
  items: T[]
  onReorder: (newOrder: { id: string; sort_order: number }[]) => Promise<void>
  renderItem: (item: T, index: number, dragHandle: React.ReactNode) => React.ReactNode
  emptyState?: React.ReactNode
  isLoading?: boolean
}

export function DraggableExerciseList<T extends DraggableItem>({
  items,
  onReorder,
  renderItem,
  emptyState,
  isLoading,
}: DraggableExerciseListProps<T>) {
  const [isSaving, setIsSaving] = useState(false)
  const [localItems, setLocalItems] = useState<T[]>([])
  
  // Use localItems if we're in the middle of a drag, otherwise use props
  const displayItems = localItems.length > 0 ? localItems : items

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Normalize sort_order on first render if needed
  const normalizedItems = [...displayItems].sort((a, b) => {
    const aOrder = a.sort_order ?? Infinity
    const bOrder = b.sort_order ?? Infinity
    return aOrder - bOrder
  })

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over || active.id === over.id) {
      setLocalItems([])
      return
    }

    const oldIndex = normalizedItems.findIndex((item) => item.id === active.id)
    const newIndex = normalizedItems.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      setLocalItems([])
      return
    }

    // Optimistic update - reorder locally immediately
    const reorderedItems = arrayMove(normalizedItems, oldIndex, newIndex)
    setLocalItems(reorderedItems as T[])

    // Calculate new sort_order values (1-indexed)
    const newOrder = reorderedItems.map((item, index) => ({
      id: item.id,
      sort_order: index + 1,
    }))

    setIsSaving(true)
    try {
      await onReorder(newOrder)
      // Clear local items to use fresh data from props
      setLocalItems([])
    } catch (error) {
      console.error('Failed to save order:', error)
      toast.error('Не удалось сохранить порядок')
      // Rollback - clear local items to revert to original order
      setLocalItems([])
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (normalizedItems.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className="relative">
      {isSaving && (
        <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Сохраняем...
          </div>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={normalizedItems.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {normalizedItems.map((item, index) => (
              <SortableItem
                key={item.id}
                item={item}
                isSaving={isSaving}
                renderContent={(item, dragHandle) => renderItem(item as T, index, dragHandle)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
