import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── Geo / routing helpers ────────────────────────────────────────────────────
const coordCache: Record<string, { lat: number; lon: number }> = {};

async function getCoordinates(z: string) {
    if (coordCache[z]) return coordCache[z];
    const cleanZ = z.replace(/\D/g, '').substring(0, 5);
    const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZ}&countrycodes=us`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'RPTulipan-Bot/1.0' } });
    const data = await resp.json();
    if (data && data.length > 0) {
        const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        coordCache[z] = coords;
        return coords;
    }
    throw new Error('Coords not found');
}

async function getDrivingDistanceMiles(originZip: string, destZip: string): Promise<number> {
    const o = await getCoordinates(originZip);
    const d = await getCoordinates(destZip);
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=false`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.code === 'Ok' && data.routes?.length > 0) {
        return data.routes[0].distance / 1609.344;
    }
    throw new Error('OSRM Error');
}

// ─── Price helpers ────────────────────────────────────────────────────────────
function buildPricesFromHubs(hubs: any[]) {
    const sizeMap: Record<string, string> = {
        '20std': "20'", '40std': "40' STD", '40hc': "40' HC", '45hc': "45'"
    };
    const usedPrices: Record<string, any> = {};
    const newPrices: Record<string, any> = {};
    const depots: { label: string; zip: string }[] = [];

    hubs.forEach(hub => {
        if (!hub.active) return;
        const hubName = `${hub.name} (${hub.zip})`;
        depots.push({ label: hubName, zip: hub.zip });

        const usedEntry: Record<string, number> = {};
        Object.entries(hub.used || {}).forEach(([k, v]) => {
            const label = sizeMap[k]; if (label && (v as number) > 0) usedEntry[label] = v as number;
        });
        if (Object.keys(usedEntry).length) usedPrices[hubName] = usedEntry;

        const newEntry: Record<string, number> = {};
        Object.entries(hub.new || {}).forEach(([k, v]) => {
            const label = sizeMap[k]; if (label && (v as number) > 0) newEntry[label] = v as number;
        });
        if (Object.keys(newEntry).length) newPrices[hubName] = newEntry;
    });
    return { usedPrices, newPrices, depots };
}

function roundPricesObj(obj: any): any {
    if (!obj) return obj;
    const out: any = {};
    for (const k in obj) {
        if (typeof obj[k] === 'number') out[k] = Math.ceil(obj[k] / 10) * 10;
        else if (typeof obj[k] === 'object') out[k] = roundPricesObj(obj[k]);
        else out[k] = obj[k];
    }
    return out;
}

function addShippingToPrices(pricesObj: any, costsMap: Record<string, number>) {
    if (!pricesObj || !costsMap) return {};
    const out = JSON.parse(JSON.stringify(pricesObj));
    for (const depot in out) {
        const fee = costsMap[depot];
        if (fee === undefined) { delete out[depot]; continue; }
        for (const size in out[depot]) {
            out[depot][size] = Math.ceil((out[depot][size] + fee) / 10) * 10;
        }
    }
    return out;
}

function flattenBestPrices(pricesObj: any): Record<string, number> {
    if (!pricesObj) return {};
    const best: Record<string, number> = {};
    for (const depot in pricesObj) {
        for (const size in pricesObj[depot]) {
            if (!best[size] || pricesObj[depot][size] < best[size]) best[size] = pricesObj[depot][size];
        }
    }
    return best;
}

async function calculateShippingForZip(zip: string, dynPrices: any): Promise<Record<string, number> | null> {
    const depots = (dynPrices?.depots?.length > 0) ? dynPrices.depots : [
        { label: "Savannah (31408)", zip: "31408" },
        { label: "Atlanta (30288)", zip: "30288" },
        { label: "Jacksonville (32218)", zip: "32218" },
        { label: "Titusville (32780)", zip: "32780" },
        { label: "Tampa (33619)", zip: "33619" },
        { label: "Miami (33178)", zip: "33178" }
    ];

    let SHIPPING_RATES = [
        { max: 30, price: 350 }, { max: 60, price: 450 },
        { max: 80, price: 500 }, { max: 100, price: 550 }
    ];
    let flatRate = 5.5;

    if (dynPrices?.deliveryRates) {
        const dr = dynPrices.deliveryRates;
        SHIPPING_RATES = [
            { max: 30,  price: dr["0-30"]   ?? 350 },
            { max: 60,  price: dr["31-60"]  ?? 450 },
            { max: 80,  price: dr["61-80"]  ?? 500 },
            { max: 100, price: dr["81-100"] ?? 550 }
        ];
        if (dr["over-100"] !== undefined) flatRate = dr["over-100"];
    }

    try {
        const distances = await Promise.all(
            depots.map((d: any) => getDrivingDistanceMiles(d.zip, zip).catch(() => 9999))
        );
        const costs: Record<string, number> = {};
        depots.forEach((d: any, i: number) => {
            const dist = distances[i];
            if (dist === 9999) return;
            const rate = dist <= 100 ? (SHIPPING_RATES.find(r => dist <= r.max) ?? SHIPPING_RATES[3]) : null;
            costs[d.label] = rate ? rate.price : Math.ceil(dist * flatRate / 10) * 10;
        });
        return Object.keys(costs).length > 0 ? costs : null;
    } catch { return null; }
}

// ─── Address validation ───────────────────────────────────────────────────────
async function getZipFromAddress(address: string): Promise<string | null> {
    // First try: extract 5-digit ZIP directly from the address string
    const direct = address.match(/(?<!\d)\d{5}(?!\d)/);
    if (direct) return direct[0];

    // Second try: geocode with Nominatim
    try {
        const resp = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&addressdetails=1`,
            { headers: { 'User-Agent': 'RPTulipan-Bot/1.0' } }
        );
        const data = await resp.json();
        if (data?.[0]?.address?.postcode) return data[0].address.postcode.split('-')[0];
    } catch { /* ignore */ }
    return null;
}

// ─── Build priceContext string (THE single source of truth for all rules) ─────
function buildPriceContext(
    zip: string | null,
    globalShippingCosts: Record<string, number> | null,
    baseUsed: any,
    baseNew: any
): string {
    let ctx = '';

    if (globalShippingCosts) {
        const finalUsed = addShippingToPrices(baseUsed, globalShippingCosts);
        const finalNew  = addShippingToPrices(baseNew,  globalShippingCosts);
        const bestUsed     = flattenBestPrices(finalUsed);
        const bestNew      = flattenBestPrices(finalNew);
        const bestBaseUsed = flattenBestPrices(baseUsed);
        const bestBaseNew  = flattenBestPrices(baseNew);

        const allowedRentDepots = ["Jacksonville (32218)", "Titusville (32780)", "Tampa (33619)", "Miami (33178)"];
        let bestRentShipping: number | null = null;
        for (const depot of allowedRentDepots) {
            if (globalShippingCosts[depot] !== undefined) {
                if (bestRentShipping === null || globalShippingCosts[depot] < bestRentShipping)
                    bestRentShipping = globalShippingCosts[depot];
            }
        }
        const rentShippingTotal = bestRentShipping !== null ? bestRentShipping * 2 : null;
        const rentPricesUsed = { "20'": 150, "40' STD": 225, "40' HC": 250, "45'": 300 };
        const rentPricesNew  = { "20'": 250, "40' STD": 325, "40' HC": 350, "45'": 400 };

        ctx = `¡ATENCIÓN! EL CLIENTE YA PROPORCIONÓ SU CÓDIGO POSTAL.
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

        ctx = `INSTRUCCIÓN CRÍTICA: EL CLIENTE AÚN NO HA DADO SU CÓDIGO POSTAL. 
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

    ctx += `\n\nREGLA DE IDIOMA ESTRICTA: Mantén siempre la conversación en el idioma en el que el cliente la inició (analiza el historial). Si el cliente inició en español y luego usa términos comunes en inglés como "zip code", "delivery", "pickup", "High Cube", etc., NO cambies a inglés. Continúa respondiendo en español. Solo debes responder en inglés si la conversación inició en inglés o si el cliente te pide explícitamente hablar en inglés. NUNCA cambies de idioma a mitad de la conversación solo por detectar una palabra aislada en otro idioma. NUNCA le preguntes qué idioma prefiere.`;

    ctx += `\n\nMÉTODOS DE PAGO: Aceptamos Zelle, Cash, Check y Tarjeta de Crédito (Credit Card).
REGLAS IMPORTANTES DE PAGO QUE DEBES COMUNICAR CLARAMENTE:
- El pago NO tiene que ser por adelantado, el cliente puede pagar "contra entrega" (al recibir el contenedor) usando Zelle, Cash o Check.
- Si el cliente elige pagar con Tarjeta de Crédito (Credit Card), ENTONCES SÍ debe pagar por adelantado. La Tarjeta de Crédito NO se acepta para pagos "contra entrega".
MUY IMPORTANTE: Cuando menciones los métodos de pago, aclara SIEMPRE que el pago por adelantado SOLO aplica si usan Tarjeta de Crédito. No des a entender que todos los pagos son por adelantado.`;

    ctx += `\n\nREGLA DE COMPRA POR DEFECTO: Si un cliente pregunta por un contenedor, tamaño o precio, ASUME DIRECTAMENTE QUE ES PARA COMPRA (Venta) y dale los precios de venta inmediatamente. NUNCA le preguntes si lo quiere comprar o rentar. SOLO proporciona información o precios de alquiler/renta si el cliente usa explícitamente palabras relacionadas como "rentar", "alquilar", "rent" o "lease".`;

    ctx += `\n\nREGLA DE TAMAÑO Y ENVÍO POR DEFECTO: 
1. NUNCA le preguntes al cliente si prefiere el modelo Standard (STD) o High Cube (HC). Ofrécele SIEMPRE directamente el precio del modelo High Cube (HC).
2. Si el cliente te proporciona su código postal (zip code), ASUME DIRECTAMENTE que quiere el contenedor con envío a domicilio (Delivery). NUNCA le preguntes si lo quiere recoger o si quiere envío. Simplemente dale el precio final con envío incluido.`;

    ctx += `\n\nREGLA ESTRICTA SOBRE COLORES: NUNCA menciones nada acerca de los colores de los contenedores a menos que el cliente te pregunte o mencione un color primero. Si el cliente NO habla de colores, omite este tema por completo. SOLO si el cliente pregunta por un color específico, respóndele: "El día de la entrega le mandamos fotos de los contenedores que tenemos en el patio. Esperamos a que usted nos dé el OK para proceder con la entrega, ahí podrá seleccionar entre los colores disponibles que tenemos ese día. No podemos garantizar un color específico ya que nuestro inventario siempre está en constante movimiento."`;

    ctx += `\n\nREGLA SOBRE VISITAS AL PATIO/YARDA Y RETIROS: 
1. Si un cliente pregunta si puede "ir a ver", "revisar" o "escoger" el contenedor en persona antes de pagarlo, EXPLÍCALE que por estrictos motivos de seguridad no se permite el ingreso de clientes a inspeccionar los patios. En su lugar, el día de la entrega se le mandan fotos detalladas para su aprobación (OK) antes de proceder. NO ofrezcas la opción de "retiro" o "pickup" a menos que el cliente pregunte explícitamente sobre cómo retirarlo él mismo.
2. MUY IMPORTANTE: Si el cliente SÍ pide explícitamente hacer un RETIRO (Pickup) y llevarse el contenedor él mismo, SÍ PUEDE ir a la yarda a buscarlo. Simplemente no puede entrar a "mirar" o "pasear" por el inventario. NUNCA le digas a un cliente que quiere hacer un "retiro/pickup" que no puede ir al patio; para retiros SÍ está permitido ir al patio.`;

    ctx += `\n\nREGLA ESTRICTA SOBRE DESCUENTOS: BAJO NINGUNA CIRCUNSTANCIA PUEDES OFRECER NI ACEPTAR DESCUENTOS O REBAJAS. No importa cuántas unidades compre el cliente o cuánto insista. Los precios son fijos y definitivos. Si el cliente pide o exige un descuento, responde de manera muy amable y firme que los precios son finales y no hacemos descuentos bajo ninguna condición.`;

    ctx += `\n\nREGLA PARA CERRAR LA VENTA (MUY IMPORTANTE):
Cuando el cliente confirme que quiere proceder a comprar/rentar, DEBES pedirle su Dirección Exacta de Entrega (Full Delivery Address) si aún no te la ha dado, además de su Nombre, Teléfono, y confirmar el Tamaño del contenedor. (El Zip Code inicial era solo para cotizar, ahora necesitas la dirección completa de la calle).
Una vez que tengas OBLIGATORIAMENTE su Nombre, Teléfono, Dirección Exacta y el Tamaño, debes decirle amablemente que la orden ha sido recibida y que logística se comunicará pronto para coordinar la entrega.
Además, DEBES agregar al final de tu respuesta (oculto para el sistema) el siguiente formato exacto:
[ORDER_CLOSED: Nombre | Teléfono | Dirección Exacta | Tamaño | Precio Final]`;

    return ctx;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { message, zip, history = [] } = await req.json();

        if (!message) {
            return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 });
        }

        // 1. Fetch prices from licencias table
        const { data: licenseData } = await supabase
            .from('licencias')
            .select('config')
            .eq('clave', 'ROL26_#kR8t!v2M')
            .single();

        let dynPrices = licenseData?.config || {};
        if (dynPrices.hubs && Array.isArray(dynPrices.hubs)) {
            const parsed = buildPricesFromHubs(dynPrices.hubs);
            dynPrices.usedPrices = parsed.usedPrices;
            dynPrices.newPrices  = parsed.newPrices;
            dynPrices.depots     = parsed.depots;
        }

        const baseUsed = roundPricesObj(dynPrices.usedPrices || {});
        const baseNew  = roundPricesObj(dynPrices.newPrices  || {});

        // 2. Calculate shipping if we have a ZIP
        let shippingCosts: Record<string, number> | null = null;
        if (zip) {
            shippingCosts = await calculateShippingForZip(zip, dynPrices);
        }

        // 3. Build the full context (single source of truth for all rules)
        const priceContext = buildPriceContext(zip, shippingCosts, baseUsed, baseNew);

        // 4. Call the existing 'chat' AI function
        const { data: chatData, error: chatError } = await supabase.functions.invoke('chat', {
            body: { message, context: priceContext, history }
        });

        if (chatError) throw chatError;
        const rawReply: string = chatData.reply;

        // 5. Parse ORDER_CLOSED tag
        const orderMatch = rawReply.match(/\[ORDER_CLOSED:\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/i);

        if (!orderMatch) {
            // No order to close — return the reply as-is
            return new Response(JSON.stringify({ reply: rawReply, order_closed: null, address_error: null }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const [fullMatch, cName, cPhone, cAddress, cSize, cPrice] = orderMatch;
        const cleanReply = rawReply.replace(fullMatch, '').trim();

        // 6. Validate address against the original ZIP
        if (zip) {
            const foundZip = await getZipFromAddress(cAddress.trim());

            if (foundZip && foundZip !== zip) {
                return new Response(JSON.stringify({
                    reply: cleanReply,
                    order_closed: null,
                    address_error: `La dirección de entrega proporcionada no parece coincidir con el código postal (${zip}) que ingresó inicialmente. Para evitar errores en el cálculo del envío, por favor escriba nuevamente su dirección asegurándose de incluir el código postal correcto.`
                }), { headers: { 'Content-Type': 'application/json' } });
            }

            if (!foundZip) {
                return new Response(JSON.stringify({
                    reply: cleanReply,
                    order_closed: null,
                    address_error: `Para procesar la orden correctamente y verificar el costo de envío, por favor envíeme nuevamente su dirección exacta de entrega incluyendo explícitamente el código postal al final.`
                }), { headers: { 'Content-Type': 'application/json' } });
            }
        }

        // 7. Address is valid — return order_closed data for the caller to handle
        const numericPrice = parseFloat(cPrice.replace(/[^0-9.]/g, '')) || 0;

        return new Response(JSON.stringify({
            reply: cleanReply,
            order_closed: {
                name:    cName.trim(),
                phone:   cPhone.trim(),
                address: cAddress.trim(),
                size:    cSize.trim(),
                price:   numericPrice
            },
            address_error: null
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('chat-v2 error:', err);
        return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
    }
});
