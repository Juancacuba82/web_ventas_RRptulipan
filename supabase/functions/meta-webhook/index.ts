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
        const rawUsed = licenseData.config.usedPrices || {};
        const rawNew = licenseData.config.newPrices || {};
        const rentPricesUsed = { "20'": 150, "40' STD": 225, "40' HC": 250, "45'": 300 };
        const rentPricesNew  = { "20'": 250, "40' STD": 325, "40' HC": 350, "45'": 400 };

        priceContext = `INSTRUCCIÓN CRÍTICA: EL CLIENTE ESTÁ EN FACEBOOK Y NO TENEMOS SU CÓDIGO POSTAL AÚN. 
TU OBJETIVO PRINCIPAL AL COTIZAR ES PEDIRLE EL CÓDIGO POSTAL (ZIP CODE) PARA DARLE EL PRECIO CON ENVÍO. 
Si pregunta por precios, puedes decirle los precios base sin envío pero SIEMPRE pídele el código postal para darle el total.

Precios Base (Sin Envío) Usados: ${JSON.stringify(rawUsed)}
Precios Base (Sin Envío) Nuevos: ${JSON.stringify(rawNew)}
Precios de Renta Mensual Usados: ${JSON.stringify(rentPricesUsed)}
Precios de Renta Mensual Nuevos: ${JSON.stringify(rentPricesNew)}

REGLA DE EXPORTACIÓN (CARGO WORTHY / CW): Si el cliente pide exportación o internacional, debes sumar $300 al precio de COMPRA del contenedor internamente. Al darle el precio, dale la suma total del contenedor ya certificado (SIN sumar el envío) y explícale claramente que ese es el total del contenedor certificado para exportación (Cargo Worthy). Además, PÍDELE de forma amable que te proporcione su Nombre, Número de Teléfono y Dirección de Entrega para que nuestro equipo lo contacte, coordine los detalles del envío y le dé el precio final de toda la logística.
`;
    }

    priceContext += `\n\nREGLA DE IDIOMA ESTRICTA: Mantén siempre la conversación en el idioma en el que el cliente la inició (analiza el historial). Si el cliente inició en español y luego usa términos comunes en inglés como "zip code", "delivery", "pickup", "High Cube", etc., NO cambies a inglés. Continúa respondiendo en español. Solo debes responder en inglés si la conversación inició en inglés o si el cliente te pide explícitamente hablar en inglés. NUNCA cambies de idioma a mitad de la conversación solo por detectar una palabra aislada en otro idioma. NUNCA le preguntes qué idioma prefiere.`;

    priceContext += `\n\nMÉTODOS DE PAGO: Aceptamos Zelle, Cash, Check y Tarjeta de Crédito (Credit Card).
REGLAS IMPORTANTES DE PAGO QUE DEBES COMUNICAR CLARAMENTE:
- El pago NO tiene que ser por adelantado, el cliente puede pagar "contra entrega" (al recibir el contenedor) usando Zelle, Cash o Check.
- Si el cliente elige pagar con Tarjeta de Crédito (Credit Card), ENTONCES SÍ debe pagar por adelantado. La Tarjeta de Crédito NO se acepta para pagos "contra entrega".
MUY IMPORTANTE: Cuando menciones los métodos de pago, aclara SIEMPRE que el pago por adelantado SOLO aplica si usan Tarjeta de Crédito. No des a entender que todos los pagos son por adelantado.`;

    priceContext += `\n\nREGLA DE COMPRA POR DEFECTO: Si un cliente pregunta por un contenedor, tamaño o precio, ASUME DIRECTAMENTE QUE ES PARA COMPRA (Venta) y dale los precios de venta inmediatamente. NUNCA le preguntes si lo quiere comprar o rentar. SOLO proporciona información o precios de alquiler/renta si el cliente usa explícitamente palabras relacionadas como "rentar", "alquilar", "rent" o "lease".`;

    priceContext += `\n\nREGLA DE TAMAÑO Y ENVÍO POR DEFECTO: 
1. NUNCA le preguntes al cliente si prefiere el modelo Standard (STD) o High Cube (HC). Ofrécele SIEMPRE directamente el precio del modelo High Cube (HC).
2. Si el cliente te proporciona su código postal (zip code), ASUME DIRECTAMENTE que quiere el contenedor con envío a domicilio (Delivery). NUNCA le preguntes si lo quiere recoger o si quiere envío. Simplemente dale el precio final con envío incluido.`;

    priceContext += `\n\nREGLA ESTRICTA SOBRE COLORES: NUNCA menciones nada acerca de los colores de los contenedores a menos que el cliente te pregunte o mencione un color primero. Si el cliente NO habla de colores, omite este tema por completo. SOLO si el cliente pregunta por un color específico, respóndele: "El día de la entrega le mandamos fotos de los contenedores que tenemos en el patio. Esperamos a que usted nos dé el OK para proceder con la entrega, ahí podrá seleccionar entre los colores disponibles que tenemos ese día. No podemos garantizar un color específico ya que nuestro inventario siempre está en constante movimiento."`;

    priceContext += `\n\nREGLA SOBRE VISITAS AL PATIO/YARDA Y RETIROS: 
1. Si un cliente pregunta si puede "ir a ver", "revisar" o "escoger" el contenedor en persona antes de pagarlo, EXPLÍCALE que por estrictos motivos de seguridad no se permite el ingreso de clientes a inspeccionar los patios. En su lugar, el día de la entrega se le mandan fotos detalladas para su aprobación (OK) antes de proceder. NO ofrezcas la opción de "retiro" o "pickup" a menos que el cliente pregunte explícitamente sobre cómo retirarlo él mismo.
2. MUY IMPORTANTE: Si el cliente SÍ pide explícitamente hacer un RETIRO (Pickup) y llevarse el contenedor él mismo, SÍ PUEDE ir a la yarda a buscarlo. Simplemente no puede entrar a "mirar" o "pasear" por el inventario. NUNCA le digas a un cliente que quiere hacer un "retiro/pickup" que no puede ir al patio; para retiros SÍ está permitido ir al patio.`;

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
