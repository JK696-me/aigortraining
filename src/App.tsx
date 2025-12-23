import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkoutProvider } from "@/contexts/WorkoutContext";
import { CacheProvider } from "@/contexts/CacheContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { createQueryClient, createIDBPersister } from "@/lib/queryClient";
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

// Create stable query client
const queryClient = createQueryClient();

// Default persister (will be replaced per-user in CacheProvider)
const defaultPersister = createIDBPersister('anonymous');

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister: defaultPersister,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      buster: 'v1', // Cache buster version
    }}
  >
    <LanguageProvider>
      <AuthProvider>
        <CacheProvider queryClient={queryClient}>
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
        </CacheProvider>
      </AuthProvider>
    </LanguageProvider>
  </PersistQueryClientProvider>
);

export default App;
