-- chatbot-core writes these six fields on every quote, but they were never added to
-- bot_sessions. Every update containing them failed, so the function silently fell back
-- to a reduced set of columns and lost `type`, `items` and the quoted-condition history.
alter table public.bot_sessions
    add column if not exists quoted_conditions jsonb,
    add column if not exists new_stock_cache   jsonb,
    add column if not exists hc_stock_pending  boolean,
    add column if not exists hc_stock_interest text,
    add column if not exists hc_used_force_quote boolean,
    add column if not exists hc_used_warn_shown  boolean;
