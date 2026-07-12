require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// 1. ENDPOINT GET: Verificacion de Webhook para Meta
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode && token) {
        if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
            console.log("WEBHOOK_VERIFIED");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// 2. ENDPOINT POST: Recibir mensajes entrantes
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.object === "page") {
        for (const entry of body.entry) {
            const event = entry.messaging[0];
            const sender_psid = event.sender.id;
            if (event.message && event.message.text) {
                console.log(`Mensaje de ${sender_psid}: ${event.message.text}`);
                await handleMessage(sender_psid, event.message.text);
            }
        }
        res.status(200).send("EVENT_RECEIVED");
    } else {
        res.sendStatus(404);
    }
});

// 3. Delegar al cerebro maestro chatbot-core y ejecutar acciones
async function handleMessage(sender_psid, text) {
    try {
        const coreResponse = await axios.post(
            `${SUPABASE_URL}/functions/v1/chatbot-core`,
            { sender_id: sender_psid, message: text },
            {
                headers: {
                    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                    "apikey": SUPABASE_ANON_KEY,
                    "Content-Type": "application/json"
                }
            }
        );

        const actions = coreResponse.data.actions || [];

        for (const action of actions) {
            const msgPayload = (action.type === "quick_replies" && action.options && action.options.length)
                ? {
                    text: action.text,
                    quick_replies: action.options.map(opt => ({
                        content_type: "text",
                        title: opt,
                        payload: opt
                    }))
                  }
                : { text: action.text };

            await axios.post(
                `https://graph.facebook.com/v19.0/me/messages?access_token=${META_PAGE_ACCESS_TOKEN}`,
                { recipient: { id: sender_psid }, message: msgPayload }
            );
        }

        console.log(`Respuestas enviadas a ${sender_psid} con exito.`);
    } catch (error) {
        console.error("Error:", error.response ? error.response.data : error.message);
    }
}

app.listen(PORT, () => {
    console.log(`Servidor Chatbot corriendo en http://localhost:${PORT}`);
    console.log("Cerebro maestro: chatbot-core en Supabase.");
});
