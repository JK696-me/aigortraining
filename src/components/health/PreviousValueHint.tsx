import { useLanguage } from "@/contexts/LanguageContext"

interface PreviousValueHintProps {
  previousValue: number | null | undefined
  currentValue: string
  unit: string
}

export function PreviousValueHint({ previousValue, currentValue, unit }: PreviousValueHintProps) {
  const { locale } = useLanguage()
  const t = translations[locale]

  const currentNum = currentValue ? parseFloat(currentValue) : null

  const delta =
    previousValue !== null && previousValue !== undefined && currentNum !== null
      ? currentNum - previousValue
      : null

  const formatDelta = (d: number) => {
    const sign = d > 0 ? "+" : ""
    return `Δ: ${sign}${d.toFixed(1)}`
  }

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
      <span>
        {t.previous}: {previousValue !== null && previousValue !== undefined ? `${previousValue} ${unit}` : "—"}
      </span>
      {delta !== null && (
        <span className={delta > 0 ? "text-green-600" : delta < 0 ? "text-blue-600" : ""}>
          {formatDelta(delta)}
        </span>
      )}
    </div>
  )
}

const translations = {
  ru: {
    previous: "Предыдущее",
  },
  en: {
    previous: "Previous",
  },
}
