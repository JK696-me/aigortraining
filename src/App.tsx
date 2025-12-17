import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkoutProvider } from "@/contexts/WorkoutContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Home from "./pages/Home";
import Workout from "./pages/Workout";
import Exercise from "./pages/Exercise";
import ExerciseHistory from "./pages/ExerciseHistory";
import SingleExerciseHistory from "./pages/SingleExerciseHistory";
import ExercisesList from "./pages/ExercisesList";
import Templates from "./pages/Templates";
import TemplateEditor from "./pages/TemplateEditor";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <WorkoutProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/workout" element={<ProtectedRoute><Workout /></ProtectedRoute>} />
                <Route path="/exercise" element={<ProtectedRoute><Exercise /></ProtectedRoute>} />
                <Route path="/exercise-history" element={<ProtectedRoute><ExerciseHistory /></ProtectedRoute>} />
                <Route path="/single-exercise-history" element={<ProtectedRoute><SingleExerciseHistory /></ProtectedRoute>} />
                <Route path="/exercises" element={<ProtectedRoute><ExercisesList /></ProtectedRoute>} />
                <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
                <Route path="/template-editor" element={<ProtectedRoute><TemplateEditor /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </WorkoutProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
