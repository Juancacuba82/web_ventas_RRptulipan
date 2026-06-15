import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const META_VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN')
const META_PAGE_ACCESS_TOKEN = Deno.env.get('META_PAGE_ACCESS_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Inicializamos el cliente de Supabase usando la Service Role Key para poder leer/escribir historiales sin problemas de RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  const url = new URL(req.url)

  // 1. VERIFICACIÓN DEL WEBHOOK (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED')
      return new Response(challenge, { status: 200 })
    } else {
      return new Response('Forbidden', { status: 403 })
    }
  }

  // 2. RECEPCIÓN DE MENSAJES (POST)
  if (req.method === 'POST') {
    try {
      const body = await req.json()

      if (body.object === 'page') {
        for (const entry of body.entry) {
          const webhookEvent = entry.messaging[0]
          const senderPsid = webhookEvent.sender.id
          
          if (webhookEvent.message && webhookEvent.message.text) {
            const receivedMessage = webhookEvent.message.text
            console.log(`Mensaje recibido de ${senderPsid}: ${receivedMessage}`)
            
            // Procesar con IA sin bloquear la respuesta a Facebook
            processIncomingMessage(senderPsid, receivedMessage)
          }
        }
        // Siempre hay que responder 200 OK a Facebook inmediatamente
        return new Response('EVENT_RECEIVED', { status: 200 })
      } else {
        return new Response('Not Found', { status: 404 })
      }
    } catch (error) {
      console.error('Error procesando el webhook:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  return new Response('Method Not Allowed', { status: 405 })
})

// --- LÓGICA DE PROCESAMIENTO E INTEGRACIÓN CON GEMINI ---
async function processIncomingMessage(psid: string, text: string) {
  try {
    // 1. Obtener historial de la base de datos
    const { data: historyData } = await supabase
      .from('fb_chat_history')
      .select('history')
      .eq('psid', psid)
      .single()

    let chatHistory: any[] = historyData?.history || []
    
    // 2. Obtener precios y configurar el contexto
    const { data: licenseData } = await supabase
      .from('licencias')
      .select('config')
      .eq('clave', 'ROL26_#kR8t!v2M')
      .single()
      
    let priceContext = ""
    if (licenseData && licenseData.config) {
        priceContext += `\nESTA ES LA TABLA DE PRECIOS DINÁMICOS ACTUALIZADA:\n${JSON.stringify(licenseData.config)}\n\n`
    }
    
    priceContext += `\n\nREGLA ESTRICTA SOBRE DESCUENTOS: BAJO NINGUNA CIRCUNSTANCIA PUEDES OFRECER NI ACEPTAR DESCUENTOS O REBAJAS. No importa cuántas unidades compre el cliente o cuánto insista. Los precios son fijos y definitivos. Si el cliente pide o exige un descuento, responde de manera muy amable y firme que los precios son finales y no hacemos descuentos bajo ninguna condición.`;

    priceContext += `\n\nREGLA PARA CERRAR LA VENTA (MUY IMPORTANTE):
Cuando el cliente confirme que quiere proceder a comprar/rentar, DEBES pedirle su Dirección Exacta de Entrega (Full Delivery Address) si aún no te la ha dado, además de su Nombre, Teléfono, y confirmar el Tamaño del contenedor. (El Zip Code inicial era solo para cotizar, ahora necesitas la dirección completa de la calle).
Una vez que tengas OBLIGATORIAMENTE su Nombre, Teléfono, Dirección Exacta y el Tamaño, debes decirle amablemente que la orden ha sido recibida y que logística se comunicará pronto para coordinar la entrega.
Además, DEBES agregar al final de tu respuesta (oculto para el sistema) el siguiente formato exacto:
[ORDER_CLOSED: Nombre | Teléfono | Dirección Exacta | Tamaño | Precio Final]`;

    // 3. Llamar a la función "chat" que contiene el System Prompt maestro de Gemini
    // Nota: La función 'chat' asume que ella misma agregará el mensaje del usuario al historial,
    // así que le mandamos el historial tal cual está hasta ahora, junto con el 'message' nuevo.
    const { data: chatData, error: chatError } = await supabase.functions.invoke('chat', {
        body: { 
            message: text,
            context: priceContext,
            history: chatHistory
        }
    })
    
    if (chatError) throw chatError;
    let finalReply = chatData.reply;

    // Actualizamos el historial localmente con la ida y vuelta
    chatHistory.push({ role: 'user', parts: [{ text: text }] });

    // Verificar si ya habíamos cerrado esta orden antes (para evitar duplicados en la DB)
    const hasClosedAlready = chatHistory.some(msg => 
        msg.role === 'model' && msg.parts[0].text.includes('[ORDER_CLOSED')
    );

    // Interceptar la etiqueta de venta cerrada
    const orderMatch = finalReply.match(/\[ORDER_CLOSED:\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/i);
    
    let replyForUser = finalReply;
    if (orderMatch) {
        // Limpiamos la etiqueta para que el cliente no la vea en Facebook
        replyForUser = finalReply.replace(orderMatch[0], '').trim();
        
        if (!hasClosedAlready) {
            // Convertir el precio a número
            let numericAmount = 0;
            const cPrice = orderMatch[6] || orderMatch[5]; // Asegurar capturar precio
            if (cPrice) {
                const cleanPrice = cPrice.replace(/[^0-9.]/g, '');
                if (cleanPrice) numericAmount = parseFloat(cleanPrice);
            }
            
            // Guardar el Lead en la base de datos
            const { error: insertError } = await supabase.from('call_logs').insert([{
                customer: orderMatch[1].trim(),
                phone: orderMatch[2].trim(),
                service_type: 'Sales',
                city: '---', 
                zip_code: orderMatch[3].trim(),
                measures: orderMatch[4].trim(),
                amount: numericAmount,
                description: `Order closed via Facebook Chatbot.`,
                created_by: 'rptulipantransport@gmail.com',
                source: 'facebook',
                status: 'PENDING',
                date: new Date().toISOString().split('T')[0]
            }]);
            
            if (insertError) console.error("Error al insertar en call_logs:", insertError);
        }
    }

    // Agregar la respuesta ORIGINAL (con etiqueta, si la tiene) al historial para que el bot tenga memoria de que ya la generó
    chatHistory.push({ role: 'model', parts: [{ text: finalReply }] });

    // Limitar el historial a los últimos 20 mensajes
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(chatHistory.length - 20);

    // Guardar el historial actualizado en la base de datos
    await supabase.from('fb_chat_history').upsert({
        psid: psid,
        history: chatHistory,
        updated_at: new Date().toISOString()
    });

    // Enviar la respuesta limpia a Facebook
    await sendMessageToMeta(psid, replyForUser);

  } catch (error) {
    console.error("Error en processIncomingMessage:", error)
  }
}

// Función para enviar mensajes usando Meta Graph API
async function sendMessageToMeta(senderPsid: string, text: string) {
  const requestBody = {
    recipient: { id: senderPsid },
    message: { text: text }
  }

  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${META_PAGE_ACCESS_TOKEN}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json()
    console.error('Error enviando mensaje a Meta:', errorData)
  }
}
