import { Plus, Check, ChevronRight, Timer, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useNavigate } from "react-router-dom";

const mockExercises = [
  { id: 1, name: "Bench Press", sets: 3, completed: 2 },
  { id: 2, name: "Incline Dumbbell Press", sets: 3, completed: 0 },
  { id: 3, name: "Cable Flyes", sets: 3, completed: 0 },
  { id: 4, name: "Tricep Pushdown", sets: 3, completed: 0 },
];

export default function Workout() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-foreground">Current Workout</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Timer className="h-4 w-4" />
              <span className="text-sm font-mono">32:15</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-accent">
              <Flame className="h-4 w-4" />
              <span className="text-sm font-medium">Push Day</span>
            </div>
            <span className="text-sm text-muted-foreground">2/4 exercises</span>
          </div>
        </div>

        {/* Exercise List */}
        <div className="space-y-3 mb-6">
          {mockExercises.map((exercise) => (
            <Card
              key={exercise.id}
              className="p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer active:scale-[0.98]"
              onClick={() => navigate("/exercise")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      exercise.completed === exercise.sets
                        ? "bg-primary/20 text-primary"
                        : exercise.completed > 0
                        ? "bg-accent/20 text-accent"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {exercise.completed === exercise.sets ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <span className="text-sm font-mono font-bold">
                        {exercise.completed}/{exercise.sets}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{exercise.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {exercise.sets} sets
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            variant="secondary"
            className="w-full h-14 text-base font-medium"
            size="lg"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Exercise
          </Button>

          <Button
            className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            size="lg"
          >
            <Check className="h-6 w-6 mr-2" />
            Finish Workout
          </Button>
        </div>
      </div>
    </Layout>
  );
}
