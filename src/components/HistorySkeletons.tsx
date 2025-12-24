import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function SessionListSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="p-4 bg-card border-border">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-5 w-5" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function SessionDetailSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-4 bg-card border-border">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-7 w-24" />
        </Card>
        <Card className="p-4 bg-card border-border">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-7 w-16" />
        </Card>
      </div>

      {/* Exercises skeleton */}
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-2">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-secondary/50">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
