ALTER TABLE public.corporate_prices ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(id);
