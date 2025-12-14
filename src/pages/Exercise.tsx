import { Plus, Minus, ChevronLeft, History, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useNavigate } from "react-router-dom";

const mockSets = [
  { id: 1, weight: 80, reps: 10, completed: true, rpe: 7 },
  { id: 2, weight: 85, reps: 8, completed: true, rpe: 8 },
  { id: 3, weight: 85, reps: 0, completed: false, rpe: null },
];

const rpeScale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function Exercise() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate("/workout")}
            className="flex items-center gap-1 text-muted-foreground mb-3"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">Back to workout</span>
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Bench Press</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/exercise-history")}
            >
              <History className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
          <p className="text-muted-foreground">Set 3 of 3</p>
        </div>

        {/* Current Set Input */}
        <Card className="p-6 bg-card border-border mb-6">
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Weight */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Weight (kg)</p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <span className="text-4xl font-bold font-mono text-foreground w-20">
                  85
                </span>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Reps */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Reps</p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <span className="text-4xl font-bold font-mono text-foreground w-20">
                  8
                </span>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* RPE Selector */}
          <div>
            <p className="text-sm text-muted-foreground mb-3 text-center">RPE (Rate of Perceived Exertion)</p>
            <div className="flex justify-between gap-1">
              {rpeScale.map((rpe) => (
                <button
                  key={rpe}
                  className={`flex-1 h-10 rounded-lg font-mono font-bold text-sm transition-colors ${
                    rpe === 8
                      ? "bg-primary text-primary-foreground"
                      : rpe >= 9
                      ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                      : rpe >= 7
                      ? "bg-accent/20 text-accent hover:bg-accent/30"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {rpe}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button variant="secondary" className="h-14 text-base font-medium">
            <Plus className="h-4 w-4 mr-2" />
            +1 Rep
          </Button>
          <Button variant="secondary" className="h-14 text-base font-medium">
            <Plus className="h-4 w-4 mr-2" />
            +2.5 kg
          </Button>
        </div>

        {/* Log Set Button */}
        <Button
          className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground mb-6"
          size="lg"
        >
          Log Set
        </Button>

        {/* Previous Sets */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Previous Sets</h3>
          <div className="space-y-2">
            {mockSets.filter(s => s.completed).map((set) => (
              <div
                key={set.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50"
              >
                <span className="text-sm text-muted-foreground">Set {set.id}</span>
                <span className="font-mono font-medium text-foreground">
                  {set.weight}kg × {set.reps}
                </span>
                <span className="text-sm text-accent">RPE {set.rpe}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendation Card */}
        <Card className="p-4 bg-primary/10 border-primary/20">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-semibold text-foreground mb-1">Next Time Recommendation</h4>
              <p className="text-sm text-muted-foreground">
                Try 87.5kg × 8 reps based on your progression
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
