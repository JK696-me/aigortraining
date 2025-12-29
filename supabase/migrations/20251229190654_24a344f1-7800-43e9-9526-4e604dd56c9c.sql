-- Add is_completed column to sets table
ALTER TABLE public.sets ADD COLUMN is_completed boolean NOT NULL DEFAULT false;