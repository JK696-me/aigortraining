// IndexedDB-based draft storage for offline workout support

const DB_NAME = 'aigor_training';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

export type SyncState = 'dirty' | 'synced' | 'error';

export interface DraftSet {
  set_index: number;
  weight: number;
  reps: number;
}

export interface DraftExercise {
  temp_session_exercise_id: string;
  exercise_id: string;
  rpe: number | null;
  sets: DraftSet[];
}

export interface DraftWorkout {
  user_id: string;
  session_id: string | null;
  started_at: string;
  session: {
    source: string;
    template_id?: string | null;
  };
  exercises: DraftExercise[];
  last_saved_at: string;
  sync_state: SyncState;
  pending_complete?: boolean;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'user_id' });
      }
    };
  });
}

export async function getDraft(userId: string): Promise<DraftWorkout | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(userId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (error) {
    console.error('Failed to get draft:', error);
    // Fallback to localStorage
    try {
      const data = localStorage.getItem(`draft_workout_${userId}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}

export async function saveDraft(draft: DraftWorkout): Promise<void> {
  draft.last_saved_at = new Date().toISOString();
  
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(draft);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to save draft to IndexedDB:', error);
    // Fallback to localStorage
    try {
      localStorage.setItem(`draft_workout_${draft.user_id}`, JSON.stringify(draft));
    } catch (e) {
      console.error('Failed to save draft to localStorage:', e);
    }
  }
}

export async function deleteDraft(userId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(userId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to delete draft from IndexedDB:', error);
  }
  
  // Also clean localStorage fallback
  try {
    localStorage.removeItem(`draft_workout_${userId}`);
  } catch (e) {
    console.error('Failed to delete draft from localStorage:', e);
  }
}

export function createNewDraft(userId: string, source: string = 'empty', templateId?: string | null): DraftWorkout {
  return {
    user_id: userId,
    session_id: null,
    started_at: new Date().toISOString(),
    session: {
      source,
      template_id: templateId,
    },
    exercises: [],
    last_saved_at: new Date().toISOString(),
    sync_state: 'dirty',
  };
}

export function addExerciseToDraft(
  draft: DraftWorkout,
  exerciseId: string,
  initialSets: { weight: number; reps: number }[]
): DraftWorkout {
  const newExercise: DraftExercise = {
    temp_session_exercise_id: generateUUID(),
    exercise_id: exerciseId,
    rpe: null,
    sets: initialSets.map((s, i) => ({
      set_index: i + 1,
      weight: s.weight,
      reps: s.reps,
    })),
  };
  
  return {
    ...draft,
    exercises: [...draft.exercises, newExercise],
    sync_state: 'dirty',
  };
}

export function updateExerciseInDraft(
  draft: DraftWorkout,
  tempId: string,
  updates: Partial<Pick<DraftExercise, 'rpe' | 'sets'>>
): DraftWorkout {
  return {
    ...draft,
    exercises: draft.exercises.map(ex =>
      ex.temp_session_exercise_id === tempId
        ? { ...ex, ...updates }
        : ex
    ),
    sync_state: 'dirty',
  };
}

export function updateSetInDraft(
  draft: DraftWorkout,
  tempExerciseId: string,
  setIndex: number,
  updates: Partial<Pick<DraftSet, 'weight' | 'reps'>>
): DraftWorkout {
  return {
    ...draft,
    exercises: draft.exercises.map(ex =>
      ex.temp_session_exercise_id === tempExerciseId
        ? {
            ...ex,
            sets: ex.sets.map(s =>
              s.set_index === setIndex ? { ...s, ...updates } : s
            ),
          }
        : ex
    ),
    sync_state: 'dirty',
  };
}

export function addSetToDraft(
  draft: DraftWorkout,
  tempExerciseId: string,
  weight: number,
  reps: number
): DraftWorkout {
  return {
    ...draft,
    exercises: draft.exercises.map(ex => {
      if (ex.temp_session_exercise_id !== tempExerciseId) return ex;
      const newSetIndex = ex.sets.length > 0 ? Math.max(...ex.sets.map(s => s.set_index)) + 1 : 1;
      return {
        ...ex,
        sets: [...ex.sets, { set_index: newSetIndex, weight, reps }],
      };
    }),
    sync_state: 'dirty',
  };
}

export function deleteSetFromDraft(
  draft: DraftWorkout,
  tempExerciseId: string,
  setIndex: number
): DraftWorkout {
  return {
    ...draft,
    exercises: draft.exercises.map(ex =>
      ex.temp_session_exercise_id === tempExerciseId
        ? { ...ex, sets: ex.sets.filter(s => s.set_index !== setIndex) }
        : ex
    ),
    sync_state: 'dirty',
  };
}
