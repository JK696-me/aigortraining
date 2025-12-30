// Centralized cache keys and TTL configuration for React Query

// TTL values in milliseconds
export const CACHE_TTL = {
  // Long-lived data (24 hours)
  LONG: 24 * 60 * 60 * 1000,
  // Medium-lived data (5 minutes)  
  MEDIUM: 5 * 60 * 1000,
  // Short-lived data (2 minutes)
  SHORT: 2 * 60 * 1000,
  // Very short (10 seconds for active draft sessions)
  IMMEDIATE: 10 * 1000,
} as const

// Query key factory functions for type-safe cache keys
export const queryKeys = {
  // User
  me: (userId: string) => ['me', userId] as const,
  
  // Exercises
  exercises: {
    all: (userId: string) => ['exercises', userId] as const,
    list: (userId: string, search?: string) => 
      search ? ['exercises', userId, search] as const : ['exercises', userId] as const,
    state: (exerciseId: string) => ['exercise-state', exerciseId] as const,
    history: (exerciseId: string) => ['exercise-history', exerciseId] as const,
  },
  
  // Templates
  templates: {
    all: (userId: string) => ['templates', userId] as const,
    list: (userId: string) => ['templates', userId] as const,
    detail: (templateId: string) => ['template', templateId] as const,
    items: (templateId: string) => ['template-items', templateId] as const,
  },
  
  // Sessions
  sessions: {
    all: (userId: string) => ['sessions', userId] as const,
    completedList: (userId: string) => ['sessions', userId, 'completed'] as const,
    detail: (sessionId: string) => ['session', sessionId] as const,
    details: (sessionId: string) => ['session-details', sessionId] as const,
    full: (sessionId: string) => ['session-full', sessionId] as const,
    fullCache: (sessionId: string) => ['session-full-cache', sessionId] as const,
    exercises: (sessionId: string) => ['session-exercises', sessionId] as const,
  },
  
  // Sets
  sets: {
    bySessionExercise: (sessionExerciseId: string) => ['sets', sessionExerciseId] as const,
    lastExercise: (userId: string, exerciseId: string) => ['last-exercise-sets', userId, exerciseId] as const,
  },
  
  // User settings
  userSettings: (userId: string) => ['user-settings', userId] as const,
} as const

// Get staleTime for a specific query key
export function getStaleTime(queryKey: readonly unknown[]): number {
  const keyType = queryKey[0] as string
  
  switch (keyType) {
    case 'exercises':
      return CACHE_TTL.LONG
    case 'templates':
    case 'template':
    case 'template-items':
      return CACHE_TTL.LONG
    case 'exercise-state':
    case 'exercise-history':
      return CACHE_TTL.MEDIUM
    case 'sessions':
      // Completed list is short, draft is immediate
      return queryKey[2] === 'completed' ? CACHE_TTL.SHORT : CACHE_TTL.IMMEDIATE
    case 'session':
    case 'session-full':
    case 'session-exercises':
      return CACHE_TTL.IMMEDIATE
    case 'session-details':
      // Session details (completed) are cached longer
      return CACHE_TTL.LONG
    case 'sets':
    case 'last-exercise-sets':
      return CACHE_TTL.MEDIUM
    case 'user-settings':
    case 'me':
      return CACHE_TTL.LONG
    default:
      return CACHE_TTL.MEDIUM
  }
}

// GC time is typically 2x staleTime for most data
export function getGcTime(queryKey: readonly unknown[]): number {
  return getStaleTime(queryKey) * 2
}
