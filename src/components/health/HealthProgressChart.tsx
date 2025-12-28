import { useMemo, useState } from "react"
import { useLanguage } from "@/contexts/LanguageContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { format, subDays, parseISO } from "date-fns"
import { ru, enUS } from "date-fns/locale"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"

interface HealthEntry {
  id: string
  date: string
  weight_kg: number | null
  shoulders_cm: number | null
  chest_cm: number | null
  biceps_cm: number | null
  waist_cm: number | null
  sides_cm: number | null
  glutes_cm: number | null
  thighs_cm: number | null
}

interface HealthProgressChartProps {
  entries: HealthEntry[]
}

type PeriodType = "30" | "90" | "all"
type MeasurementKey = "shoulders_cm" | "chest_cm" | "biceps_cm" | "waist_cm" | "sides_cm" | "glutes_cm" | "thighs_cm"

const measurementLabels: Record<MeasurementKey, { ru: string; en: string }> = {
  shoulders_cm: { ru: "Плечи", en: "Shoulders" },
  chest_cm: { ru: "Грудь", en: "Chest" },
  biceps_cm: { ru: "Бицепс", en: "Biceps" },
  waist_cm: { ru: "Талия", en: "Waist" },
  sides_cm: { ru: "Бока", en: "Sides" },
  glutes_cm: { ru: "Ягодицы", en: "Glutes" },
  thighs_cm: { ru: "Бёдра", en: "Thighs" },
}

export function HealthProgressChart({ entries }: HealthProgressChartProps) {
  const { locale } = useLanguage()
  const t = translations[locale]
  const dateLocale = locale === "ru" ? ru : enUS

  const [period, setPeriod] = useState<PeriodType>("30")
  const [secondaryMetric, setSecondaryMetric] = useState<MeasurementKey | "none">("waist_cm")

  const filteredEntries = useMemo(() => {
    if (!entries.length) return []
    
    const now = new Date()
    let cutoffDate: Date | null = null
    
    if (period === "30") {
      cutoffDate = subDays(now, 30)
    } else if (period === "90") {
      cutoffDate = subDays(now, 90)
    }

    return entries
      .filter(e => {
        if (!cutoffDate) return true
        return parseISO(e.date) >= cutoffDate
      })
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
  }, [entries, period])

  const chartData = useMemo(() => {
    return filteredEntries.map(e => ({
      date: format(parseISO(e.date), "dd.MM", { locale: dateLocale }),
      fullDate: e.date,
      weight: e.weight_kg,
      measurement: secondaryMetric !== "none" ? e[secondaryMetric] : null,
    }))
  }, [filteredEntries, secondaryMetric, dateLocale])

  const trendAnalysis = useMemo(() => {
    if (filteredEntries.length < 2) return null

    const first = filteredEntries[0]
    const last = filteredEntries[filteredEntries.length - 1]

    const weightDiff = first.weight_kg && last.weight_kg 
      ? last.weight_kg - first.weight_kg 
      : null

    const measurementDiff = secondaryMetric !== "none" && first[secondaryMetric] && last[secondaryMetric]
      ? (last[secondaryMetric] as number) - (first[secondaryMetric] as number)
      : null

    return { weightDiff, measurementDiff }
  }, [filteredEntries, secondaryMetric])

  const getInterpretation = () => {
    if (!trendAnalysis) return null
    const { weightDiff, measurementDiff } = trendAnalysis

    if (weightDiff === null) return null

    if (weightDiff < -0.5 && measurementDiff !== null && measurementDiff < -0.5) {
      if (measurementDiff < -2) {
        return t.checkNutrition
      }
      return t.overallDecrease
    }

    if (weightDiff < -0.5 && measurementDiff !== null && measurementDiff > 0.5) {
      return t.recomposition
    }

    return null
  }

  const getTrendIcon = (diff: number | null) => {
    if (diff === null) return <Minus className="h-4 w-4 text-muted-foreground" />
    if (diff > 0.5) return <TrendingUp className="h-4 w-4 text-green-500" />
    if (diff < -0.5) return <TrendingDown className="h-4 w-4 text-blue-500" />
    return <Minus className="h-4 w-4 text-muted-foreground" />
  }

  const formatDiff = (diff: number | null, unit: string) => {
    if (diff === null) return "—"
    const sign = diff > 0 ? "+" : ""
    return `${sign}${diff.toFixed(1)} ${unit}`
  }

  if (entries.length < 2) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">{t.needMoreData}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{t.progressChart}</CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">{t.days30}</SelectItem>
              <SelectItem value="90">{t.days90}</SelectItem>
              <SelectItem value="all">{t.allTime}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={secondaryMetric} onValueChange={(v) => setSecondaryMetric(v as MeasurementKey | "none")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t.weightOnly}</SelectItem>
              {Object.entries(measurementLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label[locale]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length < 2 ? (
          <p className="text-center text-muted-foreground py-8">{t.notEnoughData}</p>
        ) : (
          <>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }} 
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    yAxisId="weight"
                    tick={{ fontSize: 12 }} 
                    className="text-muted-foreground"
                    domain={['auto', 'auto']}
                  />
                  {secondaryMetric !== "none" && (
                    <YAxis 
                      yAxisId="measurement"
                      orientation="right"
                      tick={{ fontSize: 12 }} 
                      className="text-muted-foreground"
                      domain={['auto', 'auto']}
                    />
                  )}
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="weight"
                    type="monotone" 
                    dataKey="weight" 
                    name={t.weight}
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                    connectNulls
                  />
                  {secondaryMetric !== "none" && (
                    <Line 
                      yAxisId="measurement"
                      type="monotone" 
                      dataKey="measurement" 
                      name={measurementLabels[secondaryMetric][locale]}
                      stroke="hsl(var(--chart-2))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--chart-2))' }}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {trendAnalysis && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {getTrendIcon(trendAnalysis.weightDiff)}
                  <span>{t.weight}: {formatDiff(trendAnalysis.weightDiff, t.kg)}</span>
                </div>
                {secondaryMetric !== "none" && trendAnalysis.measurementDiff !== null && (
                  <div className="flex items-center gap-2">
                    {getTrendIcon(trendAnalysis.measurementDiff)}
                    <span>{measurementLabels[secondaryMetric][locale]}: {formatDiff(trendAnalysis.measurementDiff, t.cm)}</span>
                  </div>
                )}
                {getInterpretation() && (
                  <p className="text-muted-foreground italic mt-2">{getInterpretation()}</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

const translations = {
  ru: {
    progressChart: "График прогресса",
    days30: "30 дней",
    days90: "90 дней",
    allTime: "Всё время",
    weightOnly: "Только вес",
    weight: "Вес",
    kg: "кг",
    cm: "см",
    needMoreData: "Добавьте ещё 1–2 замера, чтобы увидеть тренд",
    notEnoughData: "Недостаточно данных для тренда",
    overallDecrease: "Снижение веса и объёма: вероятно, уходит общий объём",
    recomposition: "Рекомпозиция: вес снижается, объём растёт",
    checkNutrition: "Проверь питание/нагрузку, чтобы не терять мышечную массу",
  },
  en: {
    progressChart: "Progress Chart",
    days30: "30 days",
    days90: "90 days",
    allTime: "All time",
    weightOnly: "Weight only",
    weight: "Weight",
    kg: "kg",
    cm: "cm",
    needMoreData: "Add 1-2 more measurements to see the trend",
    notEnoughData: "Not enough data for trend",
    overallDecrease: "Weight and volume decreasing: likely overall volume loss",
    recomposition: "Recomposition: weight down, volume up",
    checkNutrition: "Check nutrition/training to preserve muscle mass",
  },
}
