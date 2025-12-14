import { ChevronLeft, TrendingUp, Dumbbell, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const mockHistory = [
  {
    date: "12 дек 2024",
    sets: [
      { weight: 85, reps: 8, rpe: 8 },
      { weight: 82.5, reps: 9, rpe: 8 },
      { weight: 80, reps: 10, rpe: 7 },
    ],
  },
  {
    date: "8 дек 2024",
    sets: [
      { weight: 82.5, reps: 8, rpe: 8 },
      { weight: 80, reps: 9, rpe: 8 },
      { weight: 77.5, reps: 10, rpe: 7 },
    ],
  },
  {
    date: "4 дек 2024",
    sets: [
      { weight: 80, reps: 8, rpe: 8 },
      { weight: 77.5, reps: 9, rpe: 8 },
      { weight: 75, reps: 10, rpe: 7 },
    ],
  },
  {
    date: "30 ноя 2024",
    sets: [
      { weight: 77.5, reps: 8, rpe: 9 },
      { weight: 75, reps: 8, rpe: 8 },
      { weight: 72.5, reps: 10, rpe: 7 },
    ],
  },
];

export default function ExerciseHistory() {
  const navigate = useNavigate();
  const { t, formatNum } = useLanguage();

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-muted-foreground mb-3"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">{t('back')}</span>
          </button>
          <h1 className="text-2xl font-bold text-foreground">Bench Press</h1>
          <p className="text-muted-foreground">{t('exerciseHistory')}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Dumbbell className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">{t('currentWorkingWeight')}</span>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">85 {t('kg')}</p>
            <p className="text-xs text-primary">+7.5 {t('kg')} {t('thisMonth')}</p>
          </Card>

          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted-foreground">{t('totalVolume')}</span>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">{formatNum(2040)} {t('kg')}</p>
            <p className="text-xs text-accent">{t('lastSession')}</p>
          </Card>
        </div>

        {/* Progress Indicator */}
        <Card className="p-4 bg-primary/10 border-primary/20 mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-primary" />
            <div>
              <h4 className="font-semibold text-foreground">{t('progressiveOverload')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('progressMessage')}
              </p>
            </div>
          </div>
        </Card>

        {/* History List */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('recentSessions')}</h3>
          <div className="space-y-4">
            {mockHistory.map((session, idx) => (
              <Card key={idx} className="p-4 bg-card border-border">
                <p className="text-sm font-medium text-foreground mb-3">{session.date}</p>
                <div className="space-y-2">
                  {session.sets.map((set, setIdx) => (
                    <div
                      key={setIdx}
                      className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-secondary/50"
                    >
                      <span className="text-sm text-muted-foreground">{t('set')} {setIdx + 1}</span>
                      <span className="font-mono font-medium text-foreground">
                        {set.weight}{t('kg')} × {set.reps}
                      </span>
                      <span className="text-sm text-accent">RPE {set.rpe}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
