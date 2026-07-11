-- Create the bot_sessions table to store state for the Meta Webhook
CREATE TABLE IF NOT EXISTS public.bot_sessions (
    sender_id TEXT PRIMARY KEY,
    step NUMERIC DEFAULT 0,
    lang TEXT,
    action TEXT,
    condition TEXT,
    size TEXT,
    type TEXT,
    reefer_status TEXT,
    load_status TEXT,
    zip TEXT,
    zip_origin TEXT,
    zip_dest TEXT,
    lead_name TEXT,
    lead_phone TEXT,
    final_amount NUMERIC,
    final_form_amount TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run the function on updates
DROP TRIGGER IF EXISTS set_timestamp ON public.bot_sessions;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.bot_sessions
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- Set permissions (allow edge functions to access it via service role)
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

-- If you are calling from edge functions using anon key, you would need policies, 
-- but since we'll use SUPABASE_SERVICE_ROLE_KEY, it will bypass RLS. 
-- Adding a simple true policy just in case.
CREATE POLICY "Enable read/write for all" ON public.bot_sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);
