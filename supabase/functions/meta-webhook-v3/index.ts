import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { sendMessage, sendQuickReplies, sendButtonMessage } from "./meta-api.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "tulipan-webhook-token-v3";
const MESSENGER_DEBOUNCE_MS = 5000;

/** Messenger/Instagram replies only when this secret is exactly "true". Web chat is unaffected. */
function messengerRepliesEnabled(): boolean {
    return (Deno.env.get("MESSENGER_BOT_ENABLED") || "").trim().toLowerCase() === "true";
}

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

async function updateSession(senderId: string, updates: any) {
    await supabase.from("bot_sessions").update(updates).eq("sender_id", senderId);
}

function keepAlive(work: Promise<unknown>) {
    try {
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
            EdgeRuntime.waitUntil(work);
            return true;
        }
    } catch (e) {
        console.warn("EdgeRuntime.waitUntil unavailable:", e);
    }
    return false;
}

function isBotPaused(session: any): boolean {
    return Number(session?.step) === -1;
}

type DebouncePayload = { texts: string[]; mids: string[] };

function parseDebouncePayload(raw: string | null | undefined): DebouncePayload {
    if (!raw) return { texts: [], mids: [] };
    try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.texts)) {
            return { texts: parsed.texts, mids: Array.isArray(parsed.mids) ? parsed.mids : [] };
        }
    } catch { /* ignore */ }
    return { texts: [], mids: [] };
}

async function handleMessage(senderId: string, messageText: string, messageId?: string, extraIds: string[] = []) {
    try {
        if (!messengerRepliesEnabled()) return;
        const { data: session } = await supabase.from("bot_sessions").select("step").eq("sender_id", senderId).single();
        if (isBotPaused(session)) return;
        const body: { sender_id: string; message: string; message_id?: string; message_ids?: string[] } = {
            sender_id: senderId,
            message: messageText,
            message_id: messageId
        };
        if (extraIds.length) body.message_ids = extraIds;
        const { data, error } = await supabase.functions.invoke("chatbot-core", { body });
        if (error || !data?.actions) { console.error("chatbot-core error:", error); return; }
        for (const action of data.actions) {
            if (action.type === "quick_replies" && action.options?.length) {
                await sendQuickReplies(senderId, action.text, action.options);
            } else {
                // Detect HTML link to convert to FB button template
                const htmlLinkRegex = /<a[\s\S]*?href=['"]([^'"]*)['"][\s\S]*?>([\s\S]*?)<\/a>/i;
                const match = action.text.match(htmlLinkRegex);
                if (match) {
                    const buttonUrl = match[1];
                    const buttonTitle = match[2].replace(/<[^>]+>/g, ''); // strip any inner HTML
                    let cleanText = action.text.replace(htmlLinkRegex, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
                    if (!cleanText) cleanText = "Haga clic abajo:";
                    await sendButtonMessage(senderId, cleanText, buttonTitle, buttonUrl);
                } else {
                    const cleanText = action.text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
                    await sendMessage(senderId, cleanText);
                }
            }
        }
    } catch (e) {
        console.error("handleMessage error:", e);
    }
}

/** Wait for the customer to finish typing before invoking chatbot-core (human-like pause). */
async function enqueueDebouncedMessage(senderId: string, messageText: string, messageId?: string, extraIds: string[] = []) {
    if (!messengerRepliesEnabled()) return;
    const { data: session } = await supabase
        .from("bot_sessions")
        .select("step,pending_debounce_version,pending_debounce_payload")
        .eq("sender_id", senderId)
        .single();
    if (isBotPaused(session)) return;

    const payload = parseDebouncePayload(session?.pending_debounce_payload);
    payload.texts.push(messageText);
    if (messageId) payload.mids.push(messageId);
    for (const id of extraIds) {
        if (id && id !== messageId) payload.mids.push(id);
    }

    const version = (Number(session?.pending_debounce_version) || 0) + 1;
    await updateSession(senderId, {
        pending_debounce_version: version,
        pending_debounce_payload: JSON.stringify(payload),
    });

    const capturedVersion = version;
    const work = (async () => {
        await new Promise((r) => setTimeout(r, MESSENGER_DEBOUNCE_MS));
        const { data: fresh } = await supabase
            .from("bot_sessions")
            .select("step,pending_debounce_version,pending_debounce_payload")
            .eq("sender_id", senderId)
            .single();
        if (!fresh || Number(fresh.pending_debounce_version) !== capturedVersion) return;
        if (isBotPaused(fresh)) return;

        const batch = parseDebouncePayload(fresh.pending_debounce_payload);
        const merged = batch.texts.join(" ").trim();
        const mids = batch.mids.filter(Boolean);
        await updateSession(senderId, { pending_debounce_payload: null });
        if (merged) await handleMessage(senderId, merged, mids[0], mids.slice(1));
    })();

    keepAlive(work);
}

async function handleEvent(event: any) {
    if (!event.sender?.id) return;
    if (!messengerRepliesEnabled()) return;
    const senderId = event.sender.id;

    if (event.postback) {
        let text = event.postback.title || event.postback.payload || "";
        if (event.postback.payload === "GET_STARTED") text = "hola";
        if (text) await handleMessage(senderId, text, event.message?.mid || event.postback?.mid);
        return;
    }

    if (!event.message) return;

    if (event.message.is_echo) {
        if (event.message.text) {
            const txt = event.message.text.trim().toLowerCase();
            const customerId = event.recipient.id;
            if (txt.includes("//activar") || txt.includes("//activate") || txt.includes("// reiniciar") || txt.includes("//restart")) {
                const { data: session } = await supabase.from("bot_sessions").select("final_amount, action").eq("sender_id", customerId).single();
                const restoreStep = session?.final_amount != null ? 6 : (session?.action ? 3 : 0);
                await updateSession(customerId, { step: restoreStep, is_processing: false, queued_messages: null, pending_debounce_payload: null });
            } else if (txt.startsWith("//")) {
                await updateSession(customerId, { step: -1, is_processing: false, queued_messages: null, pending_debounce_payload: null });
            } else {
                await supabase.functions.invoke("chatbot-core", {
                    body: { sender_id: customerId, message: event.message.text, is_human: true }
                });
            }
        }
        return;
    }

    let text = "";
    if (event.message.quick_reply?.payload) text = event.message.quick_reply.payload;
    else if (event.message.text) text = event.message.text;
    else if (event.message.sticker_id) {
        return;
    }
    else if (event.message.attachments) {
        const isSticker = event.message.attachments.some((att: any) => att.payload?.sticker_id);
        if (isSticker) {
            return;
        } else {
            await updateSession(senderId, { step: -1 });
            const { data: session } = await supabase.from("bot_sessions").select("lang").eq("sender_id", senderId).single();
            const lang = session?.lang || "EN";
            const errMsg = lang === "ES"
                ? "He recibido una imagen, pero soy un asistente virtual y no puedo verla. Por favor, descríbeme en texto lo que buscas si quieres continuar, si no espere a que un humano le atienda."
                : "I have received an image, but I am a virtual assistant and cannot see it. Please describe what you are looking for in text if you wish to continue, or wait for a human agent.";
            await sendMessage(senderId, errMsg);
            return;
        }
    }
    if (text) await enqueueDebouncedMessage(senderId, text, event.message.mid);
}

function eventText(event: any): string {
    if (event.postback) return "";
    if (!event.message || event.message.is_echo) return "";
    if (event.message.quick_reply?.payload) return event.message.quick_reply.payload;
    if (event.message.text) return event.message.text;
    return "";
}

function isBatchableTextEvent(event: any): boolean {
    return !!(event?.sender?.id && eventText(event));
}

async function processPayload(body: any) {
    const events: any[] = [];
    for (const entry of body.entry || []) {
        events.push(...(entry.messaging || entry.standby || []));
    }

    // Concatenate consecutive text bubbles from the same person in one payload
    // so they become a single chatbot-core turn instead of two replies.
    let i = 0;
    while (i < events.length) {
        const event = events[i];
        if (isBatchableTextEvent(event)) {
            const senderId = event.sender.id;
            const texts = [eventText(event)];
            const mids = event.message?.mid ? [event.message.mid] : [];
            let j = i + 1;
            while (j < events.length && isBatchableTextEvent(events[j]) && events[j].sender.id === senderId) {
                texts.push(eventText(events[j]));
                if (events[j].message?.mid) mids.push(events[j].message.mid);
                j++;
            }
            await enqueueDebouncedMessage(senderId, texts.join(" "), mids[0], mids.slice(1));
            i = j;
        } else {
            await handleEvent(event);
            i++;
        }
    }
}

serve(async (req) => {
    if (req.method === "GET") {
        const url = new URL(req.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge, { status: 200 });
        return new Response("Forbidden", { status: 403 });
    }

    if (req.method === "POST") {
        try {
            const body = await req.json();
            if (body.object === "page" || body.object === "instagram") {
                if (!messengerRepliesEnabled()) {
                    console.log("Messenger bot paused (MESSENGER_BOT_ENABLED!=true); webhook ACK only");
                }
                const work = processPayload(body).catch((e) => console.error("Background event error:", e));
                const ack = new Response("EVENT_RECEIVED", { status: 200 });

                // ACK Meta immediately so it does not retry (retries caused duplicate bot replies).
                if (keepAlive(work)) return ack;
                await work;
                return ack;
            }
            return new Response("Not Found", { status: 404 });
        } catch (e) {
            console.error("Webhook error:", e);
            return new Response("Internal Error", { status: 500 });
        }
    }

    return new Response("Method Not Allowed", { status: 405 });
});
