-- Transport flow: webhook debounce batching + geocoded ZIP confirmation
alter table public.bot_sessions
    add column if not exists pending_debounce_version numeric default 0,
    add column if not exists pending_debounce_payload text,
    add column if not exists transport_pending_origin text,
    add column if not exists transport_pending_dest text;
