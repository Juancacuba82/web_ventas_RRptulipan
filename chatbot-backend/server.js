require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// 1. ENDPOINT GET: Verificación de Webhook para Meta
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// 2. ENDPOINT POST: Recibir mensajes entrantes
app.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        // Facebook/Messenger agrupa los mensajes en 'entries'
        for (let entry of body.entry) {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id; // ID del cliente
            
            if (webhook_event.message && webhook_event.message.text) {
                let text = webhook_event.message.text;
                console.log(`Mensaje recibido de ${sender_psid}: ${text}`);
                
                // Enviar el mensaje a Supabase (mismo cerebro que la web)
                await handleMessage(sender_psid, text);
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// 3. Función para procesar con Supabase y responder
async function handleMessage(sender_psid, text) {
    try {
        // A. Consultar la Edge Function de Supabase
        const supabaseResponse = await axios.post(`${SUPABASE_URL}/functions/v1/chat`, {
            message: text,
            chatHistory: [] // Simplificado para la primera versión (luego podemos añadir memoria por PSID)
        }, {
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            }
        });

        const botReply = supabaseResponse.data.reply;

        // B. Enviar la respuesta de vuelta usando la Graph API de Meta
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${META_PAGE_ACCESS_TOKEN}`, {
            recipient: { id: sender_psid },
            message: { text: botReply }
        });

        console.log(`Respuesta enviada a ${sender_psid} con éxito.`);
    } catch (error) {
        console.error('Error al procesar el mensaje o enviar la respuesta:', error.response ? error.response.data : error.message);
    }
}

app.listen(PORT, () => {
    console.log(`Servidor de Chatbot corriendo en http://localhost:${PORT}`);
    console.log(`Configura tu Webhook en Meta apuntando a tu URL pública terminada en /webhook`);
});
