import { ChevronLeft, TrendingUp, Dumbbell, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useNavigate } from "react-router-dom";

const mockHistory = [
  {
    date: "Dec 12, 2024",
    sets: [
      { weight: 85, reps: 8, rpe: 8 },
      { weight: 82.5, reps: 9, rpe: 8 },
      { weight: 80, reps: 10, rpe: 7 },
    ],
  },
  {
    date: "Dec 8, 2024",
    sets: [
      { weight: 82.5, reps: 8, rpe: 8 },
      { weight: 80, reps: 9, rpe: 8 },
      { weight: 77.5, reps: 10, rpe: 7 },
    ],
  },
  {
    date: "Dec 4, 2024",
    sets: [
      { weight: 80, reps: 8, rpe: 8 },
      { weight: 77.5, reps: 9, rpe: 8 },
      { weight: 75, reps: 10, rpe: 7 },
    ],
  },
  {
    date: "Nov 30, 2024",
    sets: [
      { weight: 77.5, reps: 8, rpe: 9 },
      { weight: 75, reps: 8, rpe: 8 },
      { weight: 72.5, reps: 10, rpe: 7 },
    ],
  },
];

export default function ExerciseHistory() {
  const navigate = useNavigate();

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
            <span className="text-sm">Back</span>
          </button>
          <h1 className="text-2xl font-bold text-foreground">Bench Press</h1>
          <p className="text-muted-foreground">Exercise History</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Dumbbell className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Working Weight</span>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">85 kg</p>
            <p className="text-xs text-primary">+7.5 kg this month</p>
          </Card>

          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted-foreground">Total Volume</span>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">2,040 kg</p>
            <p className="text-xs text-accent">Last session</p>
          </Card>
        </div>

        {/* Progress Indicator */}
        <Card className="p-4 bg-primary/10 border-primary/20 mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-primary" />
            <div>
              <h4 className="font-semibold text-foreground">Progressive Overload</h4>
              <p className="text-sm text-muted-foreground">
                You've increased weight 4 sessions in a row!
              </p>
            </div>
          </div>
        </Card>

        {/* History List */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Sessions</h3>
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
                      <span className="text-sm text-muted-foreground">Set {setIdx + 1}</span>
                      <span className="font-mono font-medium text-foreground">
                        {set.weight}kg × {set.reps}
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
