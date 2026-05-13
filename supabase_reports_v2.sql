-- הרץ ב-Supabase SQL Editor כדי להוסיף עמודות לטבלת reports
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS item_description text,
  ADD COLUMN IF NOT EXISTS item_condition    text,
  ADD COLUMN IF NOT EXISTS notes             text,
  ADD COLUMN IF NOT EXISTS is_taken          boolean DEFAULT false;
