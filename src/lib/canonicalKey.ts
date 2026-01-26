// Canonical key generation for exercise name matching
// Used to find "previous workout" even with name variations like:
// "Махи с гантелями" vs "Махи гантелями"

// Stop words to remove (Russian prepositions and common modifiers)
const STOP_WORDS = new Set([
  'с', 'на', 'в', 'для', 'из', 'к', 'по', 'от', 'у', 'за', 'до', 'под', 'над', 'при',
  'верх', 'верхняя', 'верхний', 'верхнее',
  'средняя', 'средний', 'среднее', 'средние',
  'нижняя', 'нижний', 'нижнее', 'нижние',
  'положение', 'положении',
  'скамья', 'скамье', 'скамьи', 'скамью',
  'стоя', 'сидя', 'лежа',
])

// Common suffix patterns to strip (simplified stemming for Russian)
const SUFFIX_PATTERNS = [
  /ами$/i,   // инструментальный множественный (гантелями → гантел)
  /ями$/i,   // инструментальный множественный (руками → рук)
  /ой$/i,    // творительный единственный женский (рукой → рук)
  /ей$/i,    // творительный единственный (гантелей → гантел)
  /ом$/i,    // творительный единственный мужской (весом → вес)
  /ем$/i,    // творительный единственный мужской (ключем → ключ)
  /ов$/i,    // родительный множественный (блоков → блок)
  /ев$/i,    // родительный множественный (ключей → ключ)
  /ах$/i,    // предложный множественный (руках → рук)
  /ях$/i,    // предложный множественный (гантелях → гантел)
  /ки$/i,    // именительный множественный (гантельки → гантельк)
  /ый$/i,    // прилагательные мужской
  /ий$/i,    // прилагательные мужской
  /ая$/i,    // прилагательные женский
  /яя$/i,    // прилагательные женский
  /ое$/i,    // прилагательные средний
  /ее$/i,    // прилагательные средний
  /ые$/i,    // прилагательные множественный
  /ие$/i,    // прилагательные множественный
]

/**
 * Generate a canonical key from exercise name.
 * Used for fuzzy matching across name variations.
 * 
 * Examples:
 * - "Махи с гантелями" → "махи_гантел"
 * - "Махи гантелями" → "махи_гантел"
 * - "Подъём гантелей на бицепс" → "подъём_гантел_бицепс"
 */
export function generateCanonicalKey(name: string): string {
  if (!name) return ''
  
  // 1. Lowercase and normalize whitespace
  let normalized = name.toLowerCase().trim().replace(/\s+/g, ' ')
  
  // 2. Remove punctuation and special chars (keep letters, numbers, spaces)
  normalized = normalized.replace(/[^\\p{L}\\p{N}\\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  
  // 3. Split into words
  const words = normalized.split(' ')
  
  // 4. Filter out stop words
  const filtered = words.filter(word => !STOP_WORDS.has(word) && word.length > 1)
  
  // 5. Apply simplified stemming (remove common suffixes)
  const stemmed = filtered.map(word => {
    let stem = word
    for (const pattern of SUFFIX_PATTERNS) {
      const newStem = stem.replace(pattern, '')
      // Only apply if stem would be at least 2 chars
      if (newStem.length >= 2) {
        stem = newStem
        break // Apply only first matching pattern
      }
    }
    return stem
  })
  
  // 6. Join with underscores
  return stemmed.join('_')
}

/**
 * Check if two exercise names match via canonical key.
 */
export function matchesByCanonicalKey(name1: string, name2: string): boolean {
  const key1 = generateCanonicalKey(name1)
  const key2 = generateCanonicalKey(name2)
  return key1 === key2 && key1.length > 0
}

// Pre-defined aliases for common variations (seeded to exercise_aliases table)
export const COMMON_ALIASES: { canonical_key: string; aliases: string[] }[] = [
  {
    canonical_key: 'махи_гантел',
    aliases: ['Махи с гантелями', 'Махи гантелями', 'Махи гантели', 'Разводка гантелей'],
  },
  {
    canonical_key: 'подъём_гантел_бицепс',
    aliases: ['Подъём гантелей на бицепс', 'Сгибания гантелей на бицепс', 'Сгибания с гантелями'],
  },
  {
    canonical_key: 'жим_штанг_леж',
    aliases: ['Жим штанги лёжа', 'Жим штанги лежа', 'Жим лёжа', 'Жим лежа'],
  },
  {
    canonical_key: 'присед_штанг',
    aliases: ['Приседания со штангой', 'Приседы со штангой', 'Приседания штанга', 'Приседы штанга'],
  },
  {
    canonical_key: 'станов_тяг',
    aliases: ['Становая тяга', 'Становая', 'Тяга становая'],
  },
]
