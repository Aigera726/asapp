ALTER TABLE public.construction_objects 
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.contractors(id),
    ADD COLUMN IF NOT EXISTS gen_contractor_id UUID REFERENCES public.contractors(id),
    ADD COLUMN IF NOT EXISTS tech_supervision_id UUID REFERENCES public.contractors(id);
