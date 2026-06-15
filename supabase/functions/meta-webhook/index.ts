import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const META_VERIFY_TOKEN      = Deno.env.get('META_VERIFY_TOKEN')
const META_PAGE_ACCESS_TOKEN = Deno.env.get('META_PAGE_ACCESS_TOKEN')
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── Webhook verification + routing ──────────────────────────────────────────
serve(async (req) => {
    const url = new URL(req.url)

    // GET: Facebook webhook verification
    if (req.method === 'GET') {
        const mode      = url.searchParams.get('hub.mode')
        const token     = url.searchParams.get('hub.verify_token')
        const challenge = url.searchParams.get('hub.challenge')
        if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
            return new Response(challenge, { status: 200 })
        }
        return new Response('Forbidden', { status: 403 })
    }

    // POST: Incoming message from Facebook
    if (req.method === 'POST') {
        try {
            const body = await req.json()
            if (body.object === 'page') {
                for (const entry of body.entry) {
                    const event      = entry.messaging[0]
                    const senderPsid = event.sender.id
                    if (event.message?.text) {
                        processIncomingMessage(senderPsid, event.message.text)
                    }
                }
                return new Response('EVENT_RECEIVED', { status: 200 })
            }
            return new Response('Not Found', { status: 404 })
        } catch (err) {
            console.error('Webhook error:', err)
            return new Response('Internal Server Error', { status: 500 })
        }
    }

    return new Response('Method Not Allowed', { status: 405 })
})

// ─── Core message handler ─────────────────────────────────────────────────────
async function processIncomingMessage(psid: string, text: string) {
    try {
        // 1. Load chat history and last known ZIP from DB
        const { data: historyData } = await supabase
            .from('fb_chat_history')
            .select('history, last_zip')
            .eq('psid', psid)
            .single()

        let chatHistory: any[] = historyData?.history || []
        let lastZip: string | null = historyData?.last_zip || null

        // 2. Detect ZIP in the current message — update saved ZIP if found
        const zipMatch = text.match(/(?<!\d)\d{5}(?!\d)/)
        if (zipMatch) lastZip = zipMatch[0]

        // 3. Add user message to history BEFORE calling chat-v2
        chatHistory.push({ role: 'user', parts: [{ text }] })

        // 4. Call chat-v2 (the shared brain with all rules and price logic)
        const { data: v2Data, error: v2Error } = await supabase.functions.invoke('chat-v2', {
            body: { message: text, zip: lastZip, history: chatHistory }
        })

        if (v2Error) throw v2Error

        const { reply, order_closed, address_error } = v2Data

        // 5. Add bot reply to history
        chatHistory.push({ role: 'model', parts: [{ text: reply }] })
        if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20)

        // 5. Handle order closure (Facebook-specific: insert into call_logs)
        if (order_closed) {
            const { error: insertErr } = await supabase.from('call_logs').insert([{
                customer:     order_closed.name,
                phone:        order_closed.phone,
                service_type: 'Sales',
                city:         '---',
                zip_code:     order_closed.address,
                measures:     order_closed.size,
                amount:       order_closed.price,
                description:  `Address: ${order_closed.address} | Order closed via Facebook Chatbot.`,
                created_by:   'rptulipantransport@gmail.com',
                source:       'facebook',
                status:       'PENDING',
                date:         new Date().toISOString().split('T')[0]
            }])
            if (insertErr) console.error('call_logs insert error:', insertErr)
        }

        // 6. Save updated history and last ZIP to DB
        await supabase.from('fb_chat_history').upsert({
            psid,
            history:    chatHistory,
            last_zip:   lastZip,
            updated_at: new Date().toISOString()
        })

        // 7. Send the final reply to the user via Facebook Messenger
        const messageToSend = address_error || reply
        await sendMessageToMeta(psid, messageToSend)

    } catch (err) {
        console.error('processIncomingMessage error:', err)
    }
}

// ─── Facebook Messenger API ───────────────────────────────────────────────────
async function sendMessageToMeta(senderPsid: string, text: string) {
    const resp = await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${META_PAGE_ACCESS_TOKEN}`,
        {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ recipient: { id: senderPsid }, message: { text } })
        }
    )
    if (!resp.ok) console.error('Meta API error:', await resp.json())
}
