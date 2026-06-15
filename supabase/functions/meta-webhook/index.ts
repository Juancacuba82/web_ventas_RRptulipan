import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const META_VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN')
const META_PAGE_ACCESS_TOKEN = Deno.env.get('META_PAGE_ACCESS_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// --- OSRM Y GEOLOCALIZACION ---
const coordCache: Record<string, any> = {};

async function getCoordinates(z: string) {
    if (coordCache[z]) return coordCache[z];
    const cleanZ = z.replace(/\D/g, '').substring(0, 5);
    const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZ}&countrycodes=us`;
    const response = await fetch(url, { headers: { 'User-Agent': 'RPTulipan-Web/1.0' } });
    const data = await response.json();
    if (data && data.length > 0) {
        const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        coordCache[z] = coords;
        return coords;
    }
    throw new Error('Coords not found');
}

async function getDist(origin: string, destination: string) {
    try {
        const originCoords = await getCoordinates(origin);
        const destCoords = await getCoordinates(destination);
        const url = `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            return data.routes[0].distance / 1609.344;
        }
        throw new Error('OSRM Error');
    } catch (e) {
        throw new Error('Error');
    }
}

async function calculateShippingForZip(zip: string, DYNAMIC_PRICES: any) {
    const depots = (DYNAMIC_PRICES && DYNAMIC_PRICES.depots && DYNAMIC_PRICES.depots.length > 0)
        ? DYNAMIC_PRICES.depots
        : [
            { label: "Savannah (31408)", zip: "31408" },
            { label: "Atlanta (30288)", zip: "30288" },
            { label: "Jacksonville (32218)", zip: "32218" },
            { label: "Titusville (32780)", zip: "32780" },
            { label: "Tampa (33619)", zip: "33619" },
            { label: "Miami (33178)", zip: "33178" }
        ];

    try {
        const distances = await Promise.all(depots.map((d: any) => getDist(d.zip, zip).catch(() => 9999)));
        const depotCosts: Record<string, number> = {};
        let SHIPPING_RATES = [
            { max: 30, price: 350 },
            { max: 60, price: 450 },
            { max: 80, price: 500 },
            { max: 100, price: 550 }
        ];
        let flatRate = 5.5;

        if (DYNAMIC_PRICES && DYNAMIC_PRICES.deliveryRates) {
            const dr = DYNAMIC_PRICES.deliveryRates;
            SHIPPING_RATES = [
                { max: 30, price: dr["0-30"] !== undefined ? dr["0-30"] : 350 },
                { max: 60, price: dr["31-60"] !== undefined ? dr["31-60"] : 450 },
                { max: 80, price: dr["61-80"] !== undefined ? dr["61-80"] : 500 },
                { max: 100, price: dr["81-100"] !== undefined ? dr["81-100"] : 550 }
            ];
            if (dr["over 100"] !== undefined) flatRate = dr["over 100"];
        }
        
        depots.forEach((d: any, idx: number) => {
            const dist = distances[idx];
            if (dist === 9999) return;
            let cost = 0;
            if (dist <= 100) {
                const rate = SHIPPING_RATES.find(r => dist <= r.max);
                cost = rate ? rate.price : SHIPPING_RATES[3].price;
            } else {
                cost = dist * flatRate;
            }
            depotCosts[d.label] = cost;
        });
        return depotCosts;
    } catch(e) {
        return null;
    }
}

const addShippingToPrices = (pricesObj: any, depotCostsMap: any) => {
    if (!pricesObj || !depotCostsMap) return {};
    const newObj = JSON.parse(JSON.stringify(pricesObj));
    for (const depot in newObj) {
        const shippingFee = depotCostsMap[depot];
        if (shippingFee === undefined) {
            delete newObj[depot];
            continue;
        }
        for (const size in newObj[depot]) {
            newObj[depot][size] = Math.ceil((newObj[depot][size] + shippingFee) / 10) * 10;
        }
    }
    return newObj;
};

const flattenBestPrices = (pricesObj: any) => {
    if (!pricesObj) return {};
    const best: Record<string, number> = {};
    for (const depot in pricesObj) {
        for (const size in pricesObj[depot]) {
            if (!best[size] || pricesObj[depot][size] < best[size]) {
                best[size] = pricesObj[depot][size];
            }
        }
    }
    return best;
};

const roundPricesObj = (obj: any): any => {
    if (!obj) return obj;
    const newObj: any = {};
    for (const key in obj) {
        if (typeof obj[key] === 'number') {
            newObj[key] = Math.ceil(obj[key] / 10) * 10;
        } else if (typeof obj[key] === 'object') {
            newObj[key] = roundPricesObj(obj[key]);
        } else {
            newObj[key] = obj[key];
        }
    }
    return newObj;
};

serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 })
    } else {
      return new Response('Forbidden', { status: 403 })
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json()

      if (body.object === 'page') {
        for (const entry of body.entry) {
          const webhookEvent = entry.messaging[0]
          const senderPsid = webhookEvent.sender.id
          
          if (webhookEvent.message && webhookEvent.message.text) {
            const receivedMessage = webhookEvent.message.text
            processIncomingMessage(senderPsid, receivedMessage)
          }
        }
        return new Response('EVENT_RECEIVED', { status: 200 })
      } else {
        return new Response('Not Found', { status: 404 })
      }
    } catch (error) {
      console.error('Error:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  return new Response('Method Not Allowed', { status: 405 })
})

async function processIncomingMessage(psid: string, text: string) {
  try {
    // 1. Obtener historial
    const { data: historyData } = await supabase
      .from('fb_chat_history')
      .select('history')
      .eq('psid', psid)
      .single()

    let chatHistory: any[] = historyData?.history || []
    
    // 2. Obtener precios de BD
    const { data: licenseData } = await supabase
      .from('licencias')
      .select('config')
      .eq('clave', 'ROL26_#kR8t!v2M')
      .single()
      
    let priceContext = ""
    let globalShippingCosts = null;
    let DYNAMIC_PRICES = licenseData?.config || {};

    const rawBaseUsed = DYNAMIC_PRICES.usedPrices || {};
    const rawBaseNew = DYNAMIC_PRICES.newPrices || {};
    const baseUsed = roundPricesObj(rawBaseUsed);
    const baseNew = roundPricesObj(rawBaseNew);

    // Buscar código postal en TODO el historial (y en el mensaje actual)
    const allUserText = chatHistory.filter((m: any) => m.role === 'user').map((m: any) => m.parts[0].text).join(' ') + " " + text;
    const zipMatch = allUserText.match(/(?<!\d)\d{5}(?!\d)/g);
    
    if (zipMatch) {
        const zip = zipMatch[zipMatch.length - 1]; // Tomar el último ZIP detectado
        const shippingCosts = await calculateShippingForZip(zip, DYNAMIC_PRICES);
        if (shippingCosts) {
            globalShippingCosts = shippingCosts;
        }
    }

    if (globalShippingCosts) {
        const finalUsed = addShippingToPrices(baseUsed, globalShippingCosts);
        const finalNew = addShippingToPrices(baseNew, globalShippingCosts);
        const bestUsed = flattenBestPrices(finalUsed);
        const bestNew = flattenBestPrices(finalNew);
        const bestBaseUsed = flattenBestPrices(baseUsed);
        const bestBaseNew = flattenBestPrices(baseNew);
        
        const allowedRentDepots = ["Jacksonville (32218)", "Titusville (32780)", "Tampa (33619)", "Miami (33178)"];
        let bestRentShipping = null;
        for (const depot of allowedRentDepots) {
            if (globalShippingCosts[depot] !== undefined) {
                if (bestRentShipping === null || globalShippingCosts[depot] < bestRentShipping) {
                    bestRentShipping = globalShippingCosts[depot];
                }
            }
        }
        
        const rentShippingTotal = bestRentShipping !== null ? bestRentShipping * 2 : null;
        const rentPricesUsed = { "20'": 150, "40' STD": 225, "40' HC": 250, "45'": 300 };
        const rentPricesNew  = { "20'": 250, "40' STD": 325, "40' HC": 350, "45'": 400 };

        priceContext = `¡ATENCIÓN! EL CLIENTE YA PROPORCIONÓ SU CÓDIGO POSTAL.
SI EL CLIENTE QUIERE COMPRAR CON ENVÍO A DOMICILIO (DELIVERY), DALE ESTOS PRECIOS (Ya tienen el envío sumado):
- Compra Delivery Usados: ${JSON.stringify(bestUsed)}
- Compra Delivery Nuevos: ${JSON.stringify(bestNew)}

SI EL CLIENTE PREGUNTA PARA COMPRAR Y RETIRARLO ÉL MISMO (LOCAL PICKUP), DALE EL PRECIO DEL CENTRO QUE EL CLIENTE MENCIONE:
- Precios de Compra Usados por Centro: ${JSON.stringify(baseUsed)}
- Precios de Compra Nuevos por Centro: ${JSON.stringify(baseNew)}
- Si el cliente no especifica un centro, dale el mejor precio disponible: Usados ${JSON.stringify(bestBaseUsed)}, Nuevos ${JSON.stringify(bestBaseNew)}.

SI EL CLIENTE QUIERE ALQUILAR / RENTAR, ESTOS SON LOS PRECIOS:
- Mensualidad Usados: ${JSON.stringify(rentPricesUsed)}
- Mensualidad Nuevos: ${JSON.stringify(rentPricesNew)}
- Costo de Logística (Delivery & Pickup - Ida y vuelta): $${rentShippingTotal !== null ? rentShippingTotal : "No disponible"} (Esto se paga una sola vez al inicio junto con el primer mes).

REGLA DE ORO: Simplemente lee el precio de la tabla correspondiente según lo que quiera el cliente. No hagas ninguna suma matemática ni le expliques de qué ciudad sale.
REGLA DE EXPORTACIÓN (CARGO WORTHY / CW): Si el cliente pide exportación o internacional, debes sumar $300 al precio de COMPRA del contenedor internamente. Al darle el precio, dale la suma total del contenedor ya certificado (SIN sumar el envío) y explícale claramente que ese es el total del contenedor certificado para exportación (Cargo Worthy). Además, PÍDELE de forma amable que te proporcione su Nombre, Número de Teléfono y Dirección de Entrega para que nuestro equipo lo contacte, coordine los detalles del envío y le dé el precio final de toda la logística.`;

    } else {
        const rentPricesUsed = { "20'": 150, "40' STD": 225, "40' HC": 250, "45'": 300 };
        const rentPricesNew  = { "20'": 250, "40' STD": 325, "40' HC": 350, "45'": 400 };

        priceContext = `INSTRUCCIÓN CRÍTICA: EL CLIENTE AÚN NO HA DADO SU CÓDIGO POSTAL. 
TU ÚNICO OBJETIVO AHORA ES PEDIRLE EL CÓDIGO POSTAL (ZIP CODE). 
¡NO DES NINGÚN PRECIO TODAVÍA! Simplemente respóndele amablemente confirmando que tenemos ese contenedor y dile: "Para darle el precio total exacto con envío a su ubicación, por favor indíqueme su código postal (zip code)".
REGLAS ESTRICTAS:
- NUNCA le preguntes si quiere comprar o rentar.
- NUNCA le preguntes si quiere retirar o si quiere envío.
- SOLO pídele el zip code.
- IMPORTANTE SOBRE ERRORES DE ZIP CODE: Si el cliente escribió un código postal incompleto (ej. 4 números en vez de 5) o dice que ya te lo pasó, NUNCA digas "el sistema no lo registró", "el bot no lo vio" o "hubo un error en el sistema" porque te hará sonar como un robot. En su lugar, dile de manera natural: "Por favor revise su código postal, parece que está incompleto o falta algún número para poder calcularle el envío exacto."

EXCEPCIÓN DE RETIRO (PICKUP): Si el cliente te dice EXPLÍCITAMENTE que quiere ir a recoger (pickup) el contenedor en un centro de distribución específico (por ejemplo, Jacksonville, Tampa), ENTONCES SÍ puedes darle el precio exacto de ese centro:
- Precios de Compra Usados por Centro: ${JSON.stringify(baseUsed)}
- Precios de Compra Nuevos por Centro: ${JSON.stringify(baseNew)}

PRECIOS DE RENTA (Ocultos: no los uses ni ofrezcas a menos que el cliente escriba explícitamente "rentar", "alquilar" o "lease"):
- Renta Mensual Usados: ${JSON.stringify(rentPricesUsed)}
- Renta Mensual Nuevos: ${JSON.stringify(rentPricesNew)}`;
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

    const { data: chatData, error: chatError } = await supabase.functions.invoke('chat', {
        body: { 
            message: text,
            context: priceContext,
            history: chatHistory
        }
    })
    
    if (chatError) throw chatError;
    let finalReply = chatData.reply;

    chatHistory.push({ role: 'user', parts: [{ text: text }] });

    const hasClosedAlready = chatHistory.some((msg: any) => 
        msg.role === 'model' && msg.parts[0].text.includes('[ORDER_CLOSED')
    );

    const orderMatch = finalReply.match(/\[ORDER_CLOSED:\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/i);
    
    let replyForUser = finalReply;
    if (orderMatch) {
        replyForUser = finalReply.replace(orderMatch[0], '').trim();
        
        if (!hasClosedAlready) {
            let numericAmount = 0;
            const cPrice = orderMatch[6] || orderMatch[5];
            if (cPrice) {
                const cleanPrice = cPrice.replace(/[^0-9.]/g, '');
                if (cleanPrice) numericAmount = parseFloat(cleanPrice);
            }
            
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

    chatHistory.push({ role: 'model', parts: [{ text: finalReply }] });

    if (chatHistory.length > 20) chatHistory = chatHistory.slice(chatHistory.length - 20);

    await supabase.from('fb_chat_history').upsert({
        psid: psid,
        history: chatHistory,
        updated_at: new Date().toISOString()
    });

    await sendMessageToMeta(psid, replyForUser);

  } catch (error) {
    console.error("Error en processIncomingMessage:", error)
  }
}

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
