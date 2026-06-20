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
    
    try {
        const zipResp = await fetch(`https://api.zippopotam.us/us/${cleanZ}`);
        if (zipResp.ok) {
            const zipData = await zipResp.json();
            if (zipData && zipData.places && zipData.places.length > 0) {
                const coords = { 
                    lat: parseFloat(zipData.places[0].latitude), 
                    lon: parseFloat(zipData.places[0].longitude) 
                };
                coordCache[z] = coords;
                return coords;
            }
        }
    } catch (e) { console.warn("Zippopotamus error:", e); }

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
    baseNew: any,
    isInvalidZip: boolean
): string {
    let ctx = '';

    if (isInvalidZip) {
        ctx = `CRITICAL INSTRUCTION: The customer provided a Zip Code (${zip}), but our system COULD NOT VERIFY IT or calculate shipping. It is likely an INVALID or non-existent zip code. 
YOUR ONLY GOAL RIGHT NOW is to politely tell the customer that you couldn't find or calculate delivery for that zip code, and ask them to verify it and provide a valid 5-digit zip code. DO NOT GIVE ANY PRICES YET.`;
    } else if (globalShippingCosts) {
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

        ctx = `ATTENTION! THE CUSTOMER HAS ALREADY PROVIDED THEIR ZIP CODE.
IF THE CUSTOMER WANTS TO BUY WITH DELIVERY, GIVE THEM THESE PRICES (Delivery is already included):
- Buy Delivery Used: ${JSON.stringify(bestUsed)}
- Buy Delivery New: ${JSON.stringify(bestNew)}

IF THE CUSTOMER ASKS TO BUY AND PICK IT UP THEMSELVES (LOCAL PICKUP), GIVE THE PRICE FOR THE DEPOT THEY MENTION:
- Buy Pickup Used by Depot: ${JSON.stringify(baseUsed)}
- Buy Pickup New by Depot: ${JSON.stringify(baseNew)}
- If they do not specify a depot, give the best available price: Used ${JSON.stringify(bestBaseUsed)}, New ${JSON.stringify(bestBaseNew)}.

IF THE CUSTOMER WANTS TO RENT / LEASE, THESE ARE THE PRICES:
- Monthly Rent Used: ${JSON.stringify(rentPricesUsed)}
- Monthly Rent New: ${JSON.stringify(rentPricesNew)}
- Logistics Cost (Delivery & Pickup - Round trip): $${rentShippingTotal !== null ? rentShippingTotal : "Not available"} (This is paid once upfront with the first month).

GOLDEN RULE: Simply read the price from the corresponding table based on what the customer wants. Do not do any math or explain which city it comes from.
EXPORT RULE (CARGO WORTHY / CW): If the customer asks for export or international use, you must add $300 to the BUY price internally. When giving the price, give the total sum of the certified container (WITHOUT adding delivery) and explain clearly that this is the total for a certified export container (Cargo Worthy). Also, politely ask for their Name, Phone Number, and Delivery Address so our team can contact them, coordinate shipping details, and provide the final logistics price.`;
    } else {
        const rentPricesUsed = { "20'": 150, "40' STD": 225, "40' HC": 250, "45'": 300 };
        const rentPricesNew  = { "20'": 250, "40' STD": 325, "40' HC": 350, "45'": 400 };

        ctx = `CRITICAL INSTRUCTION: THE CUSTOMER HAS NOT PROVIDED THEIR ZIP CODE YET. 
YOUR ONLY GOAL RIGHT NOW IS TO ASK FOR THE ZIP CODE. 
DO NOT GIVE ANY PRICES YET! Simply reply politely confirming we have that container and ask for their zip code. Example: "To give you the exact total price with delivery to your location, please provide your zip code."
STRICT RULES:
- NEVER ask if they want to buy or rent.
- NEVER ask if they want pickup or delivery.
- ONLY ask for the zip code.
- IMPORTANT ABOUT ZIP CODE ERRORS: If the customer typed an incomplete zip code (e.g. 4 numbers instead of 5) or says they already gave it, NEVER blame the system. Instead, say naturally: "Please check your zip code, it seems to be incomplete or missing a number so I can calculate the exact delivery cost."

PICKUP EXCEPTION: If the customer EXPLICITLY tells you they want to pick up the container at a specific distribution center (e.g., Jacksonville, Tampa), THEN you CAN give the exact price for that center:
- Buy Pickup Used by Depot: ${JSON.stringify(baseUsed)}
- Buy Pickup New by Depot: ${JSON.stringify(baseNew)}

RENTAL PRICES (Hidden: do not use or offer unless the customer explicitly writes "rent", "alquilar" or "lease"):
- Monthly Rent Used: ${JSON.stringify(rentPricesUsed)}
- Monthly Rent New: ${JSON.stringify(rentPricesNew)}`;
    }

    ctx += `\n\nSTRICT LANGUAGE RULE: ALWAYS maintain the conversation in the language the customer initiated (analyze the history). IF THE INITIAL MESSAGE IS AMBIGUOUS OR HAS NO CLEAR LANGUAGE (for example, if the customer just writes "40ft" or "40ft 33139"), YOU MUST REPLY IN ENGLISH BY DEFAULT. If the customer started in Spanish and then uses common English terms like "zip code", "delivery", "pickup", "High Cube", etc., DO NOT switch to English. Continue replying in Spanish. You should only reply in English if the conversation started in English, if the initial message has no clear language, or if the customer explicitly asks you to speak English. NEVER switch languages mid-conversation just because you detected an isolated word in another language. NEVER ask what language they prefer.`;

    ctx += `\n\nPAYMENT METHODS: We accept Zelle, Cash, Check, and Credit Card.
IMPORTANT PAYMENT RULES YOU MUST COMMUNICATE CLEARLY:
- Payment does NOT have to be upfront, the customer can pay "Cash on Delivery" (when receiving the container) using Zelle, Cash, or Check.
- If the customer chooses to pay with Credit Card, THEN they must pay upfront. Credit Card is NOT accepted for cash on delivery.
VERY IMPORTANT: When mentioning payment methods, ALWAYS clarify that upfront payment ONLY applies if using a Credit Card. Do not imply all payments are upfront.`;

    ctx += `\n\nDEFAULT PURCHASE RULE: If a customer asks for a container, size, or price, ASSUME DIRECTLY THAT IT IS FOR PURCHASE (Sale) and give the sale prices immediately. NEVER ask if they want to buy or rent. ONLY provide rental info or prices if the customer explicitly uses related words like "rent", "alquilar", or "lease".`;

    ctx += `\n\nDEFAULT SIZE AND DELIVERY RULE: 
1. NEVER ask the customer if they prefer the Standard (STD) or High Cube (HC) model. ALWAYS directly offer the price of the High Cube (HC) model.
2. If the customer provides their zip code, ASSUME DIRECTLY they want the container with home delivery. NEVER ask if they want pickup or delivery. Simply give the final price with delivery included.`;

    ctx += `\n\nSTRICT COLOR RULE: NEVER mention anything about container colors unless the customer asks or mentions a color first. If the customer DOES NOT talk about colors, skip this topic entirely. ONLY if the customer asks for a specific color, reply: "On the day of delivery we will send you photos of the containers we have in the yard. We wait for your OK before proceeding, and then you can select from the available colors that day. We cannot guarantee a specific color as our inventory is constantly moving."`;

    ctx += `\n\nYARD VISITS AND PICKUPS RULE: 
1. If a customer asks if they can "go see", "check", or "choose" the container in person before paying, EXPLAIN that for strict safety reasons, customers are not allowed to enter and inspect the yards. Instead, on the day of delivery, detailed photos are sent for their approval (OK) before proceeding. DO NOT offer the "pickup" option unless the customer explicitly asks how to pick it up themselves.
2. VERY IMPORTANT: If the customer EXPLICITLY asks to do a Pickup and take the container themselves, THEY CAN go to the yard to get it. They just cannot enter to "look around" the inventory. NEVER tell a customer who wants to do a "pickup" that they cannot go to the yard; for pickups it IS allowed.`;

    ctx += `\n\nSTRICT DISCOUNT RULE: UNDER NO CIRCUMSTANCES CAN YOU OFFER OR ACCEPT DISCOUNTS. It does not matter how many units the customer buys or how much they insist. Prices are fixed and final. If the customer asks for or demands a discount, reply very politely and firmly that prices are final and we do not do discounts under any condition.`;

    ctx += `\n\nRULE FOR CLOSING THE SALE (VERY IMPORTANT):
When the customer confirms they want to proceed to buy/rent, YOU MUST ask for their Full Delivery Address if they haven't given it yet, plus their Name, Phone, and confirm the Container Size. (The initial Zip Code was just to quote, now you need the full street address).
Once you MANDATORILY have their Name, Phone, Full Exact Address, and Size, you must kindly tell them that the order has been received and logistics will communicate soon to coordinate the delivery. (Example: "Thank you! Your order has been received. Our logistics team will contact you shortly to coordinate the delivery.")
Also, YOU MUST add at the end of your response (hidden to the system) the exact following format:
[ORDER_CLOSED: Name | Phone | Full Address | Size | Final Price]`;

    return ctx;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
        const { message, zip, history = [] } = await req.json();

        if (!message) {
            return new Response(JSON.stringify({ error: 'message is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        let isInvalidZip = false;
        if (zip) {
            shippingCosts = await calculateShippingForZip(zip, dynPrices);
            if (!shippingCosts) isInvalidZip = true;
        }

        // 3. Build the full context (single source of truth for all rules)
        const priceContext = buildPriceContext(zip, shippingCosts, baseUsed, baseNew, isInvalidZip);

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
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            if (!foundZip) {
                return new Response(JSON.stringify({
                    reply: cleanReply,
                    order_closed: null,
                    address_error: `Para procesar la orden correctamente y verificar el costo de envío, por favor envíeme nuevamente su dirección exacta de entrega incluyendo explícitamente el código postal al final.`
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('chat-v2 error:', err);
        return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
