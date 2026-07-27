import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { sendMessage, sendQuickReplies, sendButtonMessage } from "./meta-api.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "tulipan-webhook-token-v3";

async function updateSession(senderId: string, updates: any) {
    await supabase.from("bot_sessions").update(updates).eq("sender_id", senderId);
}

async function handleMessage(senderId: string, messageText: string) {
    try {
        const { data, error } = await supabase.functions.invoke("chatbot-core", {
            body: { sender_id: senderId, message: messageText }
        });
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
                for (const entry of body.entry) {
                    const events = entry.messaging || entry.standby || [];
                    for (const event of events) {
                        if (!event.sender?.id) continue;
                        const senderId = event.sender.id;

                        if (event.postback) {
                            let text = event.postback.title || event.postback.payload || "";
                            if (event.postback.payload === "GET_STARTED") text = "hola";
                            if (text) await handleMessage(senderId, text);
                            continue;
                        }

                        if (event.message) {
                            if (event.message.is_echo) {
                                if (event.message.text) {
                                    const txt = event.message.text.trim().toLowerCase();
                                    const customerId = event.recipient.id;
                                    if (txt.includes("//activar") || txt.includes("//activate") || txt.includes("// reiniciar") || txt.includes("//restart")) {
                                        await updateSession(customerId, { step: 0 });
                                    } else if (txt.startsWith("//")) {
                                        await updateSession(customerId, { step: -1 });
                                    } else {
                                        // Forward the human message to chatbot-core to keep the AI's context updated
                                        await supabase.functions.invoke("chatbot-core", {
                                            body: { sender_id: customerId, message: event.message.text, is_human: true }
                                        });
                                    }
                                }
                                continue;
                            }

                            let text = "";
                            if (event.message.quick_reply?.payload) text = event.message.quick_reply.payload;
                            else if (event.message.text) text = event.message.text;
                            else if (event.message.sticker_id) {
                                text = "ok"; // Treat stickers (like thumbs up) as a cancel intent
                            }
                            else if (event.message.attachments) {
                                const isSticker = event.message.attachments.some((att: any) => att.payload?.sticker_id);
                                if (isSticker) {
                                    text = "ok";
                                } else {
                                    await updateSession(senderId, { step: -1 });
                                    const { data: session } = await supabase.from("bot_sessions").select("lang").eq("sender_id", senderId).single();
                                    const lang = session?.lang || "EN";
                                    const errMsg = lang === "ES" 
                                        ? "He recibido una imagen, pero soy un asistente virtual y no puedo verla. Por favor, descríbeme en texto lo que buscas si quieres continuar, si no espere a que un humano le atienda."
                                        : "I have received an image, but I am a virtual assistant and cannot see it. Please describe what you are looking for in text if you wish to continue, or wait for a human agent.";
                                    await sendMessage(senderId, errMsg);
                                    continue;
                                }
                            }
                            if (text) await handleMessage(senderId, text);
                        }
                    }
                }
                return new Response("EVENT_RECEIVED", { status: 200 });
            }
            return new Response("Not Found", { status: 404 });
        } catch (e) {
            console.error("Webhook error:", e);
            return new Response("Internal Error", { status: 500 });
        }
    }

    return new Response("Method Not Allowed", { status: 405 });
});
