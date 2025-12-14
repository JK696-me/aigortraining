import { Play, RotateCcw, Plus, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/Layout";
import { useNavigate } from "react-router-dom";

const mockTemplates = [
  { id: 1, name: "Push Day", exercises: 5, lastUsed: "2 days ago" },
  { id: 2, name: "Pull Day", exercises: 6, lastUsed: "4 days ago" },
  { id: 3, name: "Leg Day", exercises: 5, lastUsed: "1 week ago" },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">AIgor</h1>
          </div>
          <p className="text-muted-foreground">Ready to train?</p>
        </div>

        {/* Main Actions */}
        <div className="space-y-3 mb-8">
          <Button
            onClick={() => navigate("/workout")}
            className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground animate-pulse-glow"
            size="lg"
          >
            <Play className="h-6 w-6 mr-3" />
            Start Workout
          </Button>

          <Button
            onClick={() => navigate("/workout")}
            variant="secondary"
            className="w-full h-14 text-base font-medium"
            size="lg"
          >
            <RotateCcw className="h-5 w-5 mr-3" />
            Repeat Last Workout
          </Button>
        </div>

        {/* Templates Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-foreground">Templates</h2>
            <Button variant="ghost" size="sm" className="text-primary">
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          </div>

          <div className="space-y-3">
            {mockTemplates.map((template) => (
              <Card
                key={template.id}
                className="p-4 bg-card border-border hover:bg-secondary/50 transition-colors cursor-pointer active:scale-[0.98]"
                onClick={() => navigate("/workout")}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{template.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {template.exercises} exercises • {template.lastUsed}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
