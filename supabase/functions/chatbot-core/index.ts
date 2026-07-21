import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Action { type: string; text?: string; options?: string[]; }

// ─── DICCIONARIO DE TEXTOS ESTÁTICOS ─────────────────────────────────────────
const chatDict: Record<string, any> = {
    "ES": {
        step1_msg: "Soy tu asesor logístico de RP Tulipan. ¿En qué te puedo ayudar hoy?",
        step1_btns: ["Comprar", "Alquilar", "Transporte"],
        step3_size_msg: "Perfecto. Ahora indícame qué medida necesitas.",
        step3_size_btns: ["20'", "40'", "45'"],
        calculating: "Calculando precio exacto... ⏳",
        ask_zip: "¿Cuál es tu código postal (Zip Code) de 5 dígitos para la entrega?",
        no_stock: "Lo siento, pero parece que en este momento no tenemos disponibilidad de esa medida o tipo de contenedor en tu área. ¿Te gustaría que cotice un tamaño diferente?",
        calc_error: "Error calculando. Escribe 'reiniciar'.",
        ask_export_type: "¿Para qué usarás el contenedor?",
        ask_export_btns: ["Almacenamiento", "Exportación"],
        ask_export_buy_rent: "¿Deseas comprar el contenedor o prefieres que te lo alquilemos para el envío marítimo?",
        ask_export_buy_rent_btns: ["Comprar", "Alquilar"],
        ask_export_zip: "¿En qué Zip Code (código postal) de EE. UU. necesitas que te dejemos el contenedor para que lo cargues?",
        ask_export_port: "¿A qué puerto y país de destino enviaremos el contenedor? (Ej. Mariel, Cuba)",
        export_buy_price: "El precio de venta del contenedor es **{price}** (incluye certificado de exportación). Para darte el costo total exacto que incluye el envío marítimo y terrestre, necesitamos contactarte.",
        export_rent_msg: "Como prefieres alquilar, nuestro equipo de logística marítima cotizará el precio exacto del alquiler más el flete para tu destino.",
        export_final_msg: "¡Excelente! Ya tenemos toda la información. Por favor, escribe tu nombre completo para que un especialista te llame con la cotización final exacta.",
        ask_condition: "¿Lo prefieres Nuevo o Usado?",
        ask_condition_btns: ["Nuevo", "Usado"],
        ask_type: "¿Qué tipo de contenedor buscas?",
        ask_type_btns: ["Dry (Estándar)", "Refrigerado"],
        ask_reefer_status: "¿Lo necesitas con el motor de refrigeración Funcionando o No Funcionando?",
        ask_reefer_status_btns: ["Funcionando", "No Funcionando"],
        proceed_btns: ["Sí, proceder", "No, gracias"],
        ask_name: "¡Excelente! Por favor, escribe tu nombre completo para iniciar la orden.",
        ask_phone: "Gracias, {name}. Ahora, por favor escribe tu número de teléfono de contacto.",
        order_done: "¡Perfecto! Hemos recibido tu solicitud. Un agente te contactará en breve por teléfono o WhatsApp para finalizar los detalles. ¡Que tengas un gran día!",
        ask_origin: "Por favor, indícame el Zip Code del lugar donde recogeremos el contenedor (Origen).",
        ask_dest: "Ahora, indícame el Zip Code del lugar adonde llevaremos el contenedor (Destino).",
        ask_load: "Por favor, indícame si el contenedor que vamos a mover está Vacío o Cargado.",
        ask_load_btns: ["Vacío", "Cargado"],
        price_transport: "El precio por mover tu contenedor de {size} ({load}) desde el Zip {origin} hasta el Zip {dest} es:\n\n🔹 Precio Flexible (En Ruta): **{price}**\n🔹 Envío Inmediato (Desde {yard}): **{immed}**\n\n¿Cuál opción prefieres o te gustaría proceder con alguna?",
        price_transport_single: "El precio por mover tu contenedor de {size} ({load}) desde el Zip Code {origin} hasta el Zip Code {dest} es de **{price}**.\n\n¿Te gustaría proceder?",
        price_rent: "¡Excelente noticia! Tenemos disponibilidad para renta en {zip}.\n\n🔹 Renta Mensual: {monthly}\n🔹 Logística (Entrega y Recogida futura): {logistics} (pago único)\n\nEl pago inicial sería de {price}. ¿Proceder?",
        price_export: "Perfecto. El precio total por el contenedor es de **{price}**. ¿Te gustaría proceder con la compra?",
        price_sale: "El precio total por {qty}contenedor{qty_plural_es} {type} {cond} de {size} entregado{qty_plural_s} en {zip} es **{price}**.\n\n¿Te gustaría proceder?",
        faq_prompt: "\n\n*(Por favor responde la pregunta anterior o toca un botón para continuar con tu cotización)*",
        fallback: "Para darte un precio exacto, dime qué medida de contenedor necesitas (ej. 20 o 40 pies) y tu Zip Code de entrega.",
    },
    "EN": {
        step1_msg: "I am your logistics advisor from RP Tulipan. How can I help you today?",
        step1_btns: ["Buy", "Rent", "Transport"],
        step3_size_msg: "Perfect. Now, please let me know what size you need.",
        step3_size_btns: ["20'", "40'", "45'"],
        calculating: "Calculating exact price... ⏳",
        ask_zip: "What is your 5-digit delivery Zip Code?",
        no_stock: "I'm sorry, but it looks like we currently don't have stock for that specific container size or type in your area. Would you like me to quote a different size?",
        calc_error: "Calculation error. Type 'restart'.",
        ask_export_type: "What will you use the container for?",
        ask_export_btns: ["Storage", "Export"],
        ask_export_buy_rent: "Do you want to buy the container or prefer to rent it from us for the ocean freight?",
        ask_export_buy_rent_btns: ["Buy", "Rent"],
        ask_export_zip: "What is the US Zip Code where you need us to drop off the container for loading?",
        ask_export_port: "What is the destination port and country for the container? (e.g., Kingston, Jamaica)",
        export_buy_price: "The sale price of the container is **{price}** (includes export certificate). To give you the exact total cost including ocean and inland freight, we need to contact you.",
        export_rent_msg: "Since you prefer to rent, our maritime logistics team will quote the exact rental price plus freight for your destination.",
        export_final_msg: "Excellent! We have all the information. Please enter your full name so a specialist can call you with the exact final quote.",
        ask_condition: "Do you prefer New or Used?",
        ask_condition_btns: ["New", "Used"],
        ask_type: "What type of container are you looking for?",
        ask_type_btns: ["Dry (Standard)", "Refrigerated"],
        ask_reefer_status: "Do you need the refrigeration motor Working or Not Working?",
        ask_reefer_status_btns: ["Working", "Not Working"],
        proceed_btns: ["Yes, proceed", "No, thanks"],
        ask_name: "Excellent! Please enter your full name to start the order.",
        ask_phone: "Thank you, {name}. Now, please enter your contact phone number.",
        order_done: "Perfect! We have received your request. An agent will contact you shortly by phone or WhatsApp to finalize the details. Have a great day!",
        ask_origin: "Please tell me the Zip Code of the pickup location (Origin).",
        ask_dest: "Now, please tell me the Zip Code of the drop-off location (Destination).",
        ask_load: "Please tell me if the container we are moving is Empty or Loaded.",
        ask_load_btns: ["Empty", "Loaded"],
        price_transport: "The price to move your {size} ({load}) container from Zip {origin} to Zip {dest} is:\n\n🔹 Flexible Price (En Route): **{price}**\n🔹 Immediate Dispatch (From {yard}): **{immed}**\n\nWhich option do you prefer, or would you like to proceed?",
        price_transport_single: "The price to move your {size} ({load}) container from Zip Code {origin} to Zip Code {dest} is **{price}**.\n\nWould you like to proceed?",
        price_rent: "Great news! We have availability to rent to {zip}.\n\n🔹 Monthly Rent: {monthly}\n🔹 Logistics (Delivery & future pickup): {logistics} (one-time fee)\n\nInitial payment would be {price}. Proceed?",
        price_export: "Perfect. The total price for the container is **{price}**. Would you like to proceed?",
        price_sale: "The total price for {qty}{cond} {type} {size} container{qty_plural_s} delivered to {zip} is **{price}**.\n\nWould you like to proceed?",
        faq_prompt: "\n\n*(Please answer the previous question or tap a button to continue with your quote)*",
        fallback: "To give you an exact price right away, please tell me what container size you need (e.g. 20 or 40 ft) and your delivery Zip Code.",
    }
};

// ─── PROMPT MAESTRO: AGENTE DE VENTAS EXPERTO ────────────────────────────────
const MASTER_PROMPT = `You are "Tulip", an expert sales assistant for RP Tulipan — a shipping container company based in Florida, USA. You sell, rent, and transport used and new ISO shipping containers (20ft, 40ft, 45ft), including Dry, Reefer (refrigerated), Open Side, and Double Door types.

Your personality: Professional, friendly, and direct. You speak in the same language the customer uses (English or Spanish).

COMPANY KNOWLEDGE (use this to answer questions naturally — never make things up):
- NEW CONTAINERS: We DO have brand new (One-Trip) containers available in all sizes (20ft, 40ft, 45ft) and types (including standard Dry). NEVER say we don't have new containers.
- PAYMENT: Cash on Delivery (COD). We accept cash, Zelle, check, or credit card at delivery. NO financing.
- DELIVERY TIME: 1-3 business days after order confirmation.
- PHOTOS: If the user asks for photos, DO NOT invent excuses. You MUST reply EXACTLY with this message based on the language. EN: "We cannot send you photos of the exact unit right now because the port depots are automated and the stacks move constantly for security. However, on the day of your delivery, our driver will send you detailed photos of the exact container selected for you, and we will wait for your approval before proceeding with the trip to your property. This guarantees your total satisfaction! In the meantime, you can view real photos of recent deliveries in your area. Please note: Our gallery showcases both BRAND NEW and USED containers. If you purchase a used unit, it will be structurally sound and wind/water tight, but it will have minor dents and surface rust normal for its age. View our gallery here: https://rpcontainer.com/#gallery". ES: "No podemos enviarle fotos de la unidad exacta en este momento porque los depósitos portuarios están automatizados y los contenedores se mueven constantemente por seguridad. Sin embargo, el día programado para su entrega, nuestro chofer le enviará fotos detalladas del contenedor exacto seleccionado para usted, y esperaremos su aprobación antes de proceder con el viaje a su propiedad. ¡Así garantizamos su total satisfacción! Mientras tanto, puede ver fotos reales de entregas recientes en su zona. Nota importante: Nuestra galería muestra contenedores tanto NUEVOS como USADOS. Si compra una unidad usada, esta será estructuralmente sólida y estará 100% sellada (sin goteras), pero presentará golpes menores y óxido superficial normal para su edad. Vea nuestra galería aquí: https://rpcontainer.com/#gallery".
- CONDITION (Used): All used containers are Wind & Water Tight (WWT). Structurally sound, no leaks, doors seal properly. DO NOT proactively mention the guarantee here.
- FLOORS: Used containers have hardwood or bamboo floors in good structural condition.
- PRICE IN ADS: Ads show the container price at the port only. Delivery cost varies by zip code distance, so we cannot advertise one price. Our quote is FINAL: container + flatbed delivery, no hidden fees. CRITICAL: NEVER invent, calculate, or provide a price yourself in ai_reply. The system will calculate the exact price using a database if you set intent to "quote". If the user asks for a price or asks "how much is X", ALWAYS set intent to "quote".
- DISCOUNTS: Prices are already the lowest wholesale port prices with zero hidden margins. No additional discounts available.
- MILITARY/SENIOR/FIRST RESPONDER: We do not offer special discounts. Our prices are already the best in the market.
- LOCATIONS/HUBS: Distribution centers in Miami, Tampa, Titusville, Jacksonville, Savannah, and Atlanta.
- SIZES: 20ft, 40ft standard, 45ft high cube. We do NOT carry 10ft (must be custom-cut from a 20ft, costs MORE).
- 10FT: We don't stock them. Recommend the 20ft instead — it's cheaper and ready to go.
- REEFERS: Available Working (Functional) or Not Working (No AC), and also brand New.
- GUARANTEES: NEVER mention or offer a guarantee/warranty unless the customer explicitly asks about it. If they ask, explain that we ONLY offer a 6-month Wind and Water Tight structural guarantee on all used containers, and NO OTHER guarantees are provided.
- CONTACT INFO: Phone numbers: 786-768-4409 | 786-736-6288. Email: rptulipantransport@gmail.com. IMPORTANT: You ARE authorized to give these phone numbers and email to the customer when they ask to speak to a human, ask for a phone number, or want to call us. Do not refuse to give the phone number.
- INTERNATIONAL/EXPORT SHIPPING: We can provide containers for international export! When a customer wants to ship a container to another country (e.g. Puerto Rico, Cuba, Bahamas, etc.), you MUST set the action to "Exportacion" and the intent to "quote". Do NOT tell the customer to call us directly for export quotes yet. Instead, let the system ask the follow-up questions to collect their Zip Code and Destination Port first. Do NOT generate a long explanation about why we can't give a final price; just set action="Exportacion" and intent="quote" so the system can proceed.

SLANG/JARGON (interpret these correctly):
- "need closer", "can you do better", "bottom line", "best price", "lowest", "closer deal", "military discount", "senior discount", "any discounts" → customer wants a price reduction → explain our pricing policy warmly.
- "water tight", "wwt", "wind water tight", "no leaks", "good condition", "guarantee", "guaranteed" → quality/guarantee question → answer with our WWT and 6-month guarantee info.
- "cash on delivery", "payment", "how do I pay", "accept credit", "do you finance", "payment options" → payment question.
- "how long", "when will it arrive", "delivery time", "when", "how fast" → timing question.
- "photos", "pictures", "can I see it first", "pics" → photo question.
- "where are you located", "where do you ship from", "do you deliver to" → location question.
- "good floors", "floor condition", "floor quality" → floor question.
- "phone number", "call you", "contact", "telefono", "llamar", "numero", "speak to a human" → contact question → provide the company phone numbers enthusiastically.

OUTPUT: You MUST output a valid JSON object with NO markdown, NO code blocks, NO extra text:
{
  "intent": "quote" | "general_chat" | "cancel" | "proceed",
  "lang": "EN" | "ES", // CRITICAL: This MUST match the exact language the customer used in their VERY LAST message. If they spoke Spanish, output "ES".
  "extracted_data": {
    "action": "Comprar" | "Alquilar" | "Transporte" | "Exportacion" | null,
    "export_action": "Comprar" | "Alquilar" | null,
    "condition": "Nuevo" | "Usado" | null,
    "type": "Dry" | "Reefer" | "Open Side" | "Double Door" | null,
    "size": "20' STD" | "20' HC" | "40' STD" | "40' HC" | "45' HC" | null,
    "quantity": number | null,
    "zip": string | null,
    "zip_origin": string | null,
    "zip_dest": string | null,
    "port_dest": string | null,
    "reefer_status": "Funcionando" | "No Funcionando" | null,
    "load_status": "Vacio" | "Cargado" | null
  },
  "ai_reply": string | null
}

INTENT RULES:
- "quote": Customer is giving NEW data (size, zip, condition) to advance a quote, explicitly requesting a new price calculation, or asking for a delivery fee/cost/price. CRITICAL: If the customer provides a Zip Code and a size asking for a price/fee, the intent MUST ALWAYS be "quote" so the system can calculate it. NEVER use "general_chat" to give a price.
- "general_chat": Customer is asking a general question (quality, payment, guarantees) WITHOUT requesting a new price. If they ask for a price (e.g. "how much is the 20"), use "quote". NEVER give or invent a price in general_chat.
- "cancel": Customer says bye, thanks, stop, not interested, too expensive, ok (alone with no other info). CRITICAL: For ai_reply, if they thank you (e.g. gracias, thanks), reply with "¡De nada!" (or "You're welcome!"). If they just cancel, say bye, or say ok, reply with "¡Gracias!" (or "Thank you!").
- "proceed": Customer explicitly CONFIRMS they want to place the order AFTER receiving a final price quote (e.g., yes, si, proceed, let's do it, I'll take it). Do NOT use this if they are just starting a request. CRITICAL: If the customer agrees but AT THE SAME TIME changes the quantity (e.g. "I'll just take one for now"), you MUST use "quote" instead of "proceed" to recalculate the new price.

CONVERSATION RULES:
- ALWAYS answer the customer's questions in the "ai_reply" field, EVEN if the intent is "quote" or "proceed". Do not stay silent if they asked a question (even if they forgot the question mark).
- If they ask if a 20' used container is HC or STD, explain that our used 20' containers are STD (8'6" tall), and we only carry 20' HC (9'6" tall) as brand new.
- If they ask if a 40' used container is HC or STD, or say something like "este de 40 es HC", explain that for 40' USED containers we have BOTH STD and HC available for the EXACT SAME PRECIO, and extract the size as "40' HC".
- CRITICAL: 45' containers are ONLY Dry and ONLY HC. Do not ask the customer if they want Reefer, Open Side, etc. for a 45' container.
- CRITICAL: Open Side and Double Door containers are ONLY available in BRAND NEW condition, and ONLY in sizes 20ft and 40ft. Do not offer 45ft for them.
- CRITICAL: If the customer asks technical questions about refrigerated (reefer) containers (e.g. year, voltage, data sheet), you MUST reply exactly with this message in ai_reply depending on the language:
  English: "Great question! Since technical details for refrigerated containers (year, voltage, data sheet, etc.) vary depending on the exact unit we have in the yard, I suggest speaking with our sales team to get precise information. You can call us right now at +1 (786) 768-4409 or +1 (786) 736-6288 and a specialist will help you immediately."
  Spanish: "¡Excelente pregunta! Como los detalles técnicos de los contenedores refrigerados (año, voltaje, ficha técnica, etc.) varían dependiendo de la unidad exacta que tenemos en el patio, te sugiero hablar con nuestro equipo de ventas para darte la información precisa. Puedes llamarnos ahora mismo al +1 (786) 768-4409 o al +1 (786) 736-6288 y un especialista te ayudará de inmediato."

EXTRACTION RULES:
- "20", "20'", "20ft", "twenty", "20 pies" (without HC/High Cube) → size "20' STD".
- "20 HC", "20 High Cube", "20' HC", "20ft HC" → size "20' HC". CRITICAL RULE: ONLY if the customer specifically asks for a "20 HC", you MUST set condition to "Nuevo". Do NOT do this for a regular 20'. If they asked for a used 20 HC, explain politely in ai_reply that we only carry 20 HC in New condition.
- "40", "40'", "40ft", "forty", "40 pies" (without HC/High Cube) → size "40' STD".
- "40 HC", "40 High Cube", "40' HC", "40ft HC", "es HC" (when discussing 40) → size "40' HC".
- "45", "45'", "45ft", "forty five", "45 pies" → size "45' HC".
- "two"/"2"/"dos"/"couple"/"a pair" + container/footer → quantity 2. "three"/"3"/"tres" → quantity 3. "one"/"1"/"un"/"uno" → quantity 1.
- "reefer"/"refrigerado"/"refrigerated"/"cold"/"freezer" → type "Reefer".
- "standard"/"dry"/"estandar"/"regular"/"normal" → type "Dry".
- "open side"/"puertas laterales"/"abre por el lado" → type "Open Side".
- "double door"/"puertas dobles"/"doble puerta"/"tunel"/"tunnel" → type "Double Door".
- CRITICAL: DO NOT change or extract a new "type" unless the customer explicitly mentions one. If they just ask for another size (e.g. "y el de 40'"), leave "type" as null so it retains the current type.
- "new"/"nuevo"/"brand new" → condition "Nuevo". "used"/"usado"/"second hand"/"pre-owned" → condition "Usado". CRITICAL: Do NOT guess or default the condition if it is not explicitly mentioned; leave it null.
- "storage"/"almacenamiento"/"to store"/"para guardar" → action "Comprar". CRITICAL: If the customer asks for a price/quote and does not specify buying or renting, ALWAYS assume action "Comprar".
- "export"/"exportacion" → action "Exportacion".
- "rent"/"alquiler"/"renta"/"lease" → action "Alquilar".
- "move"/"transport"/"mover"/"transporte"/"haul"/"relocate" → action "Transporte".
- "working"/"funcionando"/"with ac"/"with motor" → reefer_status "Funcionando". "not working"/"no funciona"/"no ac"/"sin motor"/"broken" → reefer_status "No Funcionando".
- "empty"/"vacio"/"vacio" → load_status "Vacio". "loaded"/"cargado"/"lleno"/"full" → load_status "Cargado".
- Extract 5-digit zip codes exactly. CRITICAL: NEVER extract a 3 or 4-digit number (e.g., 1400) as a zip code. If a customer sends a number like "1400" next to a size, DO NOT assume what it means. Treat this as general_chat and ASK the customer what they mean by that number (e.g. "What do you mean by 1400?"). Once they explain it's a price, then explain our pricing policy. If two zips: first is zip_origin, second is zip_dest. Otherwise use zip.
- Only populate fields you can confidently extract. Use null for everything else.`;

// ─── HELPERS DE SUPABASE ──────────────────────────────────────────────────────
async function getSession(senderId: string): Promise<any> {
    const { data } = await supabase.from("bot_sessions").select("*").eq("sender_id", senderId).single();
    if (data) return data;
    const s = { sender_id: senderId, step: 0 };
    await supabase.from("bot_sessions").insert([s]);
    return s;
}

async function updateSession(senderId: string, updates: any) {
    await supabase.from("bot_sessions").update(updates).eq("sender_id", senderId);
}

// ─── LLAMADA A OPENAI ─────────────────────────────────────────────────────────
async function callAI(history: Array<{role: string, content: string}>): Promise<any> {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return null;
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: MASTER_PROMPT }, ...history],
                response_format: { type: "json_object" },
                temperature: 0.3
            })
        });
        const json = await res.json();
        return JSON.parse(json.choices[0].message.content);
    } catch (e) {
        console.error("OpenAI error:", e);
        return null;
    }
}

// ─── DETECCIÓN RÁPIDA SIN IA ──────────────────────────────────────────────────
function quickDetect(input: string, senderId: string, session: any): any | null {
    const lo = input.toLowerCase().trim();
    const cleaned = lo.replace(/[^\w\sñáéíóú]/gi, '').trim();

    if (["comprar", "buy"].includes(lo)) return { intent: "quote", extracted_data: { action: "Comprar" } };
    if (["alquilar", "rent"].includes(lo)) return { intent: "quote", extracted_data: { action: "Alquilar" } };
    if (["transporte", "transport"].includes(lo)) return { intent: "quote", extracted_data: { action: "Transporte" } };
    if (lo === "20'") return { intent: "quote", extracted_data: { size: "20'" } };
    if (lo === "40'") return { intent: "quote", extracted_data: { size: "40'" } };
    if (lo === "45'") return { intent: "quote", extracted_data: { size: "45'" } };
    if (["nuevo", "new"].includes(lo)) return { intent: "quote", extracted_data: { condition: "Nuevo" } };
    if (["usado", "used"].includes(lo)) return { intent: "quote", extracted_data: { condition: "Usado" } };
    if (["dry (estándar)", "dry (standard)", "dry"].includes(lo)) return { intent: "quote", extracted_data: { type: "Dry" } };
    if (["refrigerado", "refrigerated"].includes(lo)) return { intent: "quote", extracted_data: { type: "Reefer" } };
    if (["funcionando", "working"].includes(lo)) return { intent: "quote", extracted_data: { reefer_status: "Funcionando" } };
    if (["no funcionando", "not working"].includes(lo)) return { intent: "quote", extracted_data: { reefer_status: "No Funcionando" } };
    if (["almacenamiento", "storage"].includes(lo)) return { intent: "quote", extracted_data: { action: "Comprar" } };
    if (["exportación", "export"].includes(lo)) return { intent: "quote", extracted_data: { action: "Exportacion" } };
    if (["vacío", "empty", "vacio"].includes(lo)) return { intent: "quote", extracted_data: { load_status: "Vacio" } };
    if (["cargado", "loaded"].includes(lo)) return { intent: "quote", extracted_data: { load_status: "Cargado" } };
    if (["sí, proceder", "yes, proceed", "yes", "sí", "si"].includes(lo)) return { intent: "proceed", extracted_data: {} };

    if (/^\d{5}$/.test(lo)) return { intent: "quote", extracted_data: { zip: lo } };

    // ── Detección de petición de fotos (Solo si NO es Transporte) ─────────────
    const photoKeywords = ["foto", "fotos", "photo", "photos", "picture", "pictures", "imagen", "imagenes", "imágenes", "ver el contenedor", "see the container", "show me", "muéstrame", "muestrame", "gallery", "galería", "galeria"];
    if (session?.action !== "Transporte" && photoKeywords.some(kw => lo.includes(kw))) {
        const isES = lo.match(/\b(foto|fotos|imagen|imagenes|imágenes|ver el contenedor|muestrame|muéstrame|galería|galeria)\b/);
        const isWeb = senderId.startsWith("web_");
        
        let photoMsgEN = "We cannot send you photos of the exact unit right now because the port depots are automated and the stacks move constantly for security. However, **on the day of your delivery**, our driver will send you detailed photos of the exact container selected for you, and **we will wait for your approval** before proceeding with the trip to your property. This guarantees your total satisfaction!\n\nIn the meantime, you can view real photos of recent deliveries in your area.\n**Please note:** Our gallery showcases both BRAND NEW and USED containers. If you purchase a used unit, it will be structurally sound and wind/water tight, but it will have minor dents and surface rust normal for its age. View our gallery here:\n\nhttps://rpcontainer.com/#gallery";
        let photoMsgES = "No podemos enviarle fotos de la unidad exacta en este momento porque los depósitos portuarios están automatizados y los contenedores se mueven constantemente por seguridad. Sin embargo, **el día programado para su entrega**, nuestro chofer le enviará fotos detalladas del contenedor exacto seleccionado para usted, y **esperaremos su aprobación** antes de proceder con el viaje a su propiedad. ¡Así garantizamos su total satisfacción!\n\nMientras tanto, puede ver fotos reales de entregas recientes en su zona.\n**Nota importante:** Nuestra galería muestra contenedores tanto NUEVOS como USADOS. Si compra una unidad usada, esta será estructuralmente sólida y estará 100% sellada (sin goteras), pero presentará golpes menores y óxido superficial normal para su edad. Vea nuestra galería aquí:\n\nhttps://rpcontainer.com/#gallery";
        
        if (isWeb) {
            photoMsgEN = "We cannot send you photos of the exact unit right now because the port depots are automated and the stacks move constantly for security. However, **on the day of your delivery**, our driver will send you detailed photos of the exact container selected for you, and **we will wait for your approval** before proceeding with the trip to your property. This guarantees your total satisfaction!\n\nIn the meantime, you can view real photos of recent deliveries in your area.\n**Please note:** Our gallery showcases both BRAND NEW and USED containers. If you purchase a used unit, it will be structurally sound and wind/water tight, but it will have minor dents and surface rust normal for its age.<br><br><a href='https://rpcontainer.com/#gallery' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>Gallery</a>";
            photoMsgES = "No podemos enviarle fotos de la unidad exacta en este momento porque los depósitos portuarios están automatizados y los contenedores se mueven constantemente por seguridad. Sin embargo, **el día programado para su entrega**, nuestro chofer le enviará fotos detalladas del contenedor exacto seleccionado para usted, y **esperaremos su aprobación** antes de proceder con el viaje a su propiedad. ¡Así garantizamos su total satisfacción!\n\nMientras tanto, puede ver fotos reales de entregas recientes en su zona.\n**Nota importante:** Nuestra galería muestra contenedores tanto NUEVOS como USADOS. Si compra una unidad usada, esta será estructuralmente sólida y estará 100% sellada (sin goteras), pero presentará golpes menores y óxido superficial normal para su edad.<br><br><a href='https://rpcontainer.com/#gallery' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>Galería</a>";
        }

        return { intent: "general_chat", lang: isES ? "ES" : "EN", extracted_data: {}, ai_reply: isES ? photoMsgES : photoMsgEN };
    }

    // ── Detección de petición de medidas (Solo si NO es Transporte) ─────────────
    const dimensionKeywords = ["medida", "medidas", "mide", "alto", "ancho", "largo", "tamaño", "dimensiones", "dimension", "dimensions", "height", "width", "length", "size", "tall", "long", "wide", "measurements"];
    const isJustSizeChoice = /^((20|40|45)('|(ft)|( pies))?)$/.test(lo);
    if (!isJustSizeChoice && session?.action !== "Transporte" && dimensionKeywords.some(kw => lo.includes(kw))) {
        const isES = lo.match(/\b(medida|medidas|mide|alto|ancho|largo|tamaño|dimensiones)\b/);
        const isWeb = senderId.startsWith("web_");
        
        let dimMsgEN = "Our containers come in standard shipping sizes. To make it easy for you, we have prepared visual guides with the exact internal and external dimensions (Length, Width, Height, and Payload Capacity) for all our sizes.\n\nYou can view all the measurements directly on our website here:\n\nhttps://rpcontainer.com/#container-dimensions";
        let dimMsgES = "Nuestros contenedores vienen en medidas estándar de envío. Para hacérselo más fácil, hemos preparado guías visuales con las medidas exactas internas y externas (Largo, Ancho, Alto y Capacidad de Carga) de todos nuestros tamaños.\n\nPuede ver todas las medidas directamente en nuestra página web aquí:\n\nhttps://rpcontainer.com/#container-dimensions";
        
        if (isWeb) {
            dimMsgEN = "Our containers come in standard shipping sizes. To make it easy for you, we have prepared visual guides with the exact internal and external dimensions (Length, Width, Height, and Payload Capacity) for all our sizes.\n\nYou can view all the measurements directly on our website here:<br><br><a href='https://rpcontainer.com/#container-dimensions' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>View Dimensions</a>";
            dimMsgES = "Nuestros contenedores vienen en medidas estándar de envío. Para hacérselo más fácil, hemos preparado guías visuales con las medidas exactas internas y externas (Largo, Ancho, Alto y Capacidad de Carga) de todos nuestros tamaños.\n\nPuede ver todas las medidas directamente en nuestra página web aquí:<br><br><a href='https://rpcontainer.com/#container-dimensions' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>Ver Medidas</a>";
        }

        return { intent: "general_chat", lang: isES ? "ES" : "EN", extracted_data: {}, ai_reply: isES ? dimMsgES : dimMsgEN };
    }

    return null;
}

// ─── LÓGICA PRINCIPAL ─────────────────────────────────────────────────────────
async function processMessage(senderId: string, messageText: string, isHuman: boolean = false): Promise<Action[]> {
    const input = messageText.replace(/^@meta ai\s*/i, "").trim();
    const actions: Action[] = [];
    const session = await getSession(senderId);

    if (input.toLowerCase().startsWith("!orden ") || input.toLowerCase().startsWith("!log ")) {
        const payloadText = input.substring(input.indexOf(" ") + 1).trim();
        
        const extractPrompt = `You are an AI assistant helping to extract structured data for a shipping container order from raw, messy text pasted by a salesperson.
Extract the following information:
- customer (name of the person)
- phone (phone number)
- service_type (e.g. Sales, Rent, Transport, Export, Comprar, Alquilar)
- city (if mentioned, otherwise "---")
- description (a brief summary of what they want, e.g. "Wants to rent a 40' HC to Miami 33178. Price $2500")
- zip_code (the zip code mentioned)
- measures (container size mentioned, e.g. "40' HC", "20' STD")
- amount (the price mentioned, e.g. 2500, or null if none)

Respond ONLY with a valid JSON object matching these exact keys:
{
  "customer": string,
  "phone": string,
  "service_type": string,
  "city": string,
  "description": string,
  "zip_code": string,
  "measures": string,
  "amount": number | null
}
If any information is missing, use null or "---".`;

        const key = Deno.env.get("OPENAI_API_KEY");
        if (!key) {
            return [{ type: "text", text: "❌ Error: API Key no configurada." }];
        }
        
        try {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: extractPrompt },
                        { role: "user", content: payloadText }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                })
            });
            const json = await res.json();
            const data = JSON.parse(json.choices[0].message.content);
            
            await supabase.from("call_logs").insert([{
                customer: data.customer || "Unknown", 
                phone: data.phone || "---",
                service_type: data.service_type || "Sales", 
                city: data.city || "---",
                description: data.description || payloadText,
                created_by: "rptulipantransport@gmail.com", 
                source: "chatbot_manual",
                status: "PENDING", 
                date: new Date().toISOString().split("T")[0],
                next_call_date: new Date().toISOString().split("T")[0],
                amount: data.amount, 
                zip_code: data.zip_code, 
                measures: data.measures
            }]);
            
            return [{ type: "text", text: `✅ Orden creada exitosamente para ${data.customer || "Unknown"}. (Teléfono: ${data.phone || "---"})` }];
            
        } catch (e) {
            console.error("OpenAI/Supabase error during !orden:", e);
            return [{ type: "text", text: "❌ Hubo un error al procesar la orden manualmente." }];
        }
    }
    if (isHuman) {
        const rawHistory = session.history || [];
        const updatedHistory = Array.isArray(rawHistory) ? rawHistory.slice(-9) : [];
        updatedHistory.push({ role: "assistant", content: messageText });
        await updateSession(senderId, { history: updatedHistory });
        return [];
    }

    let step = Number(session.step) || 0;

    // Modo silencio (agente humano activo con //)
    if (step === -1) {
        const cmd = input.toLowerCase();
        if (cmd !== "reiniciar" && cmd !== "restart" && cmd !== "menu") return [];
    }

    // Reiniciar
    if (["reiniciar", "restart", "menu"].includes(input.toLowerCase())) {
        await updateSession(senderId, { step: 0, lang: null, action: null, condition: null, size: null, type: null, zip: null, reefer_status: null, load_status: null, quantity: null, zip_origin: null, zip_dest: null, history: null });
        step = 0;
    }

    // Detectar idioma básico
    let lang = session.lang || "EN";
    if (input.length > 3) {
        const lo = input.toLowerCase();
        if (lo.match(/\b(english|feet|ft|used|new|buy|rent|transport|empty|loaded|yes|no|thanks|hello|hi|price|tunnel|container|quote|cost|how much|lowest|working|closer|delivery|footer|footers|need)\b/)) lang = "EN";
        if (lo.match(/\b(español|es|pies|usado|nuevo|comprar|alquilar|rentar|mover|vacio|vacío|cargado|lleno|sí|si|gracias|hola|quiero|precio|cotizacion|cotización|cuanto|contenedor)\b/)) lang = "ES";
    }

    let dictCurrent = chatDict[lang];
    const isLangPick = ["español", "espanol", "es", "english", "en"].includes(input.toLowerCase());

    // Bienvenida
    if ((input.toLowerCase() === "hola" || input.toLowerCase() === "hello" || input.toLowerCase() === "hi") && !session.action) {
        await updateSession(senderId, { step: 0, lang, action: null, condition: null, size: null, type: null, zip: null, quantity: null, history: null });
        actions.push({ type: "quick_replies", text: dictCurrent.step1_msg, options: dictCurrent.step1_btns });
        return actions;
    }

    if (isLangPick && !session.action && !session.size && !session.zip) {
        await updateSession(senderId, { lang });
        actions.push({ type: "quick_replies", text: dictCurrent.step1_msg, options: dictCurrent.step1_btns });
        return actions;
    }

    // Captura de nombre/teléfono con Escape Hatch
    if (step === 7 || step === 8) {
        const isQuestionOrLong = input.split(" ").length > 4 || /\b(cuanto|qué|que|por qué|como|cómo|precio|pero|no|espera|wait|how|what|why|price|cost|solo|just|one|uno)\b/i.test(input) || input.includes("?");
        if (!isQuestionOrLong) {
            if (step === 7) {
                await updateSession(senderId, { lead_name: input, step: 8 });
                actions.push({ type: "text", text: dictCurrent.ask_phone.replace("{name}", input) });
                return actions;
            }
            if (step === 8) {
                await updateSession(senderId, { lead_phone: input, step: 0 });
                await supabase.from("call_logs").insert([{
                    customer: session.lead_name || "Unknown", phone: input || "---",
                    service_type: session.action || "Sales", city: "---",
                    description: session.action === "Exportacion" || session.action === "Exportación" ? `Order via AI Bot (EXPORT). Zip: ${session.zip}. Port: ${session.port_dest}. Buy/Rent: ${session.export_action}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.` : `Order via AI Bot. Zip: ${session.zip}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.`,
                    created_by: "rptulipantransport@gmail.com", source: "chatbot",
                    status: "PENDING", date: new Date().toISOString().split("T")[0],
                    next_call_date: new Date().toISOString().split("T")[0],
                    amount: session.final_amount, zip_code: session.zip, measures: session.size
                }]);
                actions.push({ type: "text", text: dictCurrent.order_done });
                return actions;
            }
        } else {
            // Escape hatch activated: reset to step 6 to let AI handle the doubt/change
            await updateSession(senderId, { step: 6 });
        }
    }

    // ── Construir historial (últimos 8 mensajes para contexto) ──
    const rawHistory = session.history || [];
    const recentHistory: Array<{role: string, content: string}> = Array.isArray(rawHistory) ? rawHistory.slice(-8) : [];
    recentHistory.push({ role: "user", content: input });

    // ── Detección rápida (sin tokens de IA) o llamada a IA ──
    let extracted = quickDetect(input, senderId, session);
    if (!extracted) {
        extracted = await callAI(recentHistory);
        if (!extracted) extracted = { intent: "quote", lang, extracted_data: {} };
    }

    if (extracted.lang) {
        lang = extracted.lang;
        dictCurrent = chatDict[lang];
    }
    const data = extracted.extracted_data || {};

    // ── Prevenir recálculo redundante en el paso 6 ──
    if (step === 6 && extracted.intent === "quote") {
        const changedPricingVar = 
            (data.size && data.size !== session.size) ||
            (data.zip && data.zip !== session.zip) ||
            (data.zip_origin && data.zip_origin !== session.zip_origin) ||
            (data.zip_dest && data.zip_dest !== session.zip_dest) ||
            (data.condition && data.condition !== session.condition) ||
            (data.type && data.type !== session.type) ||
            (data.quantity && data.quantity !== session.quantity);
        
        if (!changedPricingVar) {
            extracted.intent = "general_chat";
        }
    }

    // ── OVERRIDE: Forzar detección de medida si la IA falla ──
    const lo = input.toLowerCase();
    if (/\b(40|40'|40ft|forty|40 pies)\b/.test(lo)) data.size = "40'";
    else if (/\b(20|20'|20ft|twenty|20 pies)\b/.test(lo)) data.size = "20'";
    else if (/\b(45|45'|45ft|forty five|45 pies)\b/.test(lo)) data.size = "45'";
    
    const isExportFlow = session.action === "Exportación" || session.action === "Exportacion";
    if (isExportFlow) {
        if (lo.includes("comprar") || lo.includes("buy")) data.export_action = "Comprar";
        else if (lo.includes("alquilar") || lo.includes("rent") || lo.includes("alquilo")) data.export_action = "Alquilar";
    }

    // ── Actualizar sesión con datos extraídos ──
    const updates: any = { lang };
    if (data.size) updates.size = data.size;
    
    if (data.action) {
        const actionStr = data.action.toString().toLowerCase();
        if (isExportFlow && (actionStr.includes("comprar") || actionStr.includes("buy") || actionStr.includes("alquilar") || actionStr.includes("rent"))) {
            updates.export_action = (actionStr.includes("comprar") || actionStr.includes("buy")) ? "Comprar" : "Alquilar";
        } else {
            if (data.action === "Comprar" && !session.action) {
                updates.action = "Comprar_Intent";
            } else {
                updates.action = data.action;
            }
        }
    }
    
    if (data.condition) updates.condition = data.condition;
    if (data.type) updates.type = data.type;
    if (data.reefer_status) updates.reefer_status = data.reefer_status;
    if (data.load_status) updates.load_status = data.load_status;
    if (data.quantity && data.quantity > 0) updates.quantity = data.quantity;
    
    if (data.export_action) {
        const eaStr = data.export_action.toString().toLowerCase();
        updates.export_action = (eaStr.includes("comprar") || eaStr.includes("buy")) ? "Comprar" : "Alquilar";
    }
    
    if (data.port_dest) updates.port_dest = data.port_dest;
    
    // Strict safeguard against invalid zip codes extracted by AI
    if (data.zip_origin && !/^\d{5}$/.test(data.zip_origin.toString())) data.zip_origin = null;
    if (data.zip_dest && !/^\d{5}$/.test(data.zip_dest.toString())) data.zip_dest = null;
    if (data.zip && !/^\d{5}$/.test(data.zip.toString())) data.zip = null;

    const isNonContinental = (z: string) => {
        if (!z) return false;
        const prefix = z.toString().substring(0, 3);
        return ['006', '007', '009', '995', '996', '997', '998', '999', '967', '968'].includes(prefix);
    };

    let blockedNonContinental = false;
    if (data.zip_origin && isNonContinental(data.zip_origin)) { data.zip_origin = null; blockedNonContinental = true; }
    if (data.zip_dest && isNonContinental(data.zip_dest)) { data.zip_dest = null; blockedNonContinental = true; }
    if (data.zip && isNonContinental(data.zip)) { data.zip = null; blockedNonContinental = true; }

    if (blockedNonContinental) {
        extracted.ai_reply = lang === "EN" 
            ? "The zip code you entered is outside the continental US. We need the continental US zip code where you want us to deliver the container so you can load it."
            : "El código postal que ingresaste está fuera de EE. UU. continental. Necesitamos el código postal dentro de EE. UU. continental donde deseas que te entreguemos el contenedor para que lo cargues.";
    }
    if (data.zip_origin) updates.zip_origin = data.zip_origin;
    if (data.zip_dest) updates.zip_dest = data.zip_dest;
    if (data.zip) {
        if (data.action === "Transporte" || session.action === "Transporte") {
            if (!session.zip_origin && !data.zip_origin) updates.zip_origin = data.zip;
            else if (!session.zip_dest && !data.zip_dest) updates.zip_dest = data.zip;
        } else {
            updates.zip = data.zip;
        }
    }

    // Inferir acción si tenemos datos pero no acción
    if (!session.action && !data.action) {
        if (data.zip_origin || data.zip_dest) updates.action = "Transporte";
        else if (data.size || data.zip) updates.action = "Comprar";
    }

    // Guardar historial actualizado (máx 10 entradas)
    const updatedHistory = [...recentHistory];
    if (extracted.ai_reply) updatedHistory.push({ role: "assistant", content: extracted.ai_reply });
    updates.history = updatedHistory.slice(-10);

    await updateSession(senderId, updates);
    Object.assign(session, updates);

    // ── INTENT: CANCEL ──
    if (extracted.intent === "cancel") {
        // Option A: If we are already in an idle state (previously cancelled), don't reply again
        if (!session.action && !session.size && !session.zip) {
            return [];
        }

        await updateSession(senderId, { step: 0, action: null, size: null, zip: null, condition: null, type: null, reefer_status: null, quantity: null, history: null, export_action: null, port_dest: null });
        
        const msg = extracted.ai_reply || (lang === "EN" ? "Thank you!" : "¡Gracias!");

        actions.push({ type: "text", text: msg });
        return actions;
    }

    // ── INTENT: PROCEED ──
    if (extracted.intent === "proceed" || (step === 6 && (input.toLowerCase() === "sí, proceder" || input.toLowerCase() === "yes, proceed"))) {
        await updateSession(senderId, { step: 7 });
        actions.push({ type: "text", text: dictCurrent.ask_name });
        return actions;
    }

    // ── INTENT: GENERAL_CHAT (la IA responde libremente) ──
    if (extracted.intent === "general_chat" && extracted.ai_reply) {
        let pendingOptions: string[] | null = null;
        if (step === 6) pendingOptions = dictCurrent.proceed_btns;
        else if (!session.action) pendingOptions = dictCurrent.step1_btns;
        else if (!session.size) pendingOptions = (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dictCurrent.step3_size_btns;
        else if (session.action === "Transporte" && !session.load_status) pendingOptions = dictCurrent.ask_load_btns;

        if (pendingOptions) {
            actions.push({ type: "quick_replies", text: extracted.ai_reply, options: pendingOptions });
        } else {
            actions.push({ type: "text", text: extracted.ai_reply });
        }
        return actions;
    }

    // Helper para incluir la respuesta conversacional de la IA (si existe) antes del mensaje estructurado
    const appendAiReply = (msg: string) => extracted.ai_reply ? `${extracted.ai_reply}\n\n${msg}` : msg;

    // ── FLUJO DE COTIZACIÓN ESTRUCTURADO ──
    if (!session.action) {
        // Si ya hay una respuesta de la IA (estamos en medio de una charla), usar un texto más natural en lugar del saludo genérico
        const fallbackMsg = extracted.ai_reply ? (lang === "EN" ? "Please select an option to continue:" : "¿Buscas comprar, alquilar o transporte?") : dictCurrent.step1_msg;
        actions.push({ type: "quick_replies", text: appendAiReply(fallbackMsg), options: dictCurrent.step1_btns });
        return actions;
    }

    if (session.action === "Comprar_Intent") {
        actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_export_type), options: dictCurrent.ask_export_btns });
        return actions;
    }

    if (session.action === "Transporte") {
        if (!session.size) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg), options: dictCurrent.step3_size_btns }); return actions; }
        if (!session.zip_origin) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_origin) }); return actions; }
        if (!session.zip_dest) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_dest) }); return actions; }
        if (!session.load_status) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_load), options: dictCurrent.ask_load_btns }); return actions; }
    } else if (session.action === "Exportación" || session.action === "Exportacion") {
        if (!session.export_action) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_export_buy_rent), options: dictCurrent.ask_export_buy_rent_btns }); return actions; }
        if (!session.size) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg), options: (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dictCurrent.step3_size_btns }); return actions; }
        if (!session.zip) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_export_zip) }); return actions; }
        if (!session.port_dest) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_export_port) }); return actions; }
        
        // If renting for export, we don't calculate price. We just proceed.
        if (session.export_action === "Alquilar" || session.export_action === "Rent") {
            const msg = dictCurrent.export_rent_msg + "\n\n" + dictCurrent.export_final_msg;
            const historyAfterQuote = [...(session.history || [])];
            historyAfterQuote.push({ role: "assistant", content: msg });
            await updateSession(senderId, { step: 7, history: historyAfterQuote.slice(-10) });
            actions.push({ type: "text", text: msg });
            return actions;
        }
    } else {
        if (session.action === "Comprar") {
            if (session.type === "Reefer" && session.condition === "Usado" && !session.reefer_status) {
                actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_reefer_status), options: dictCurrent.ask_reefer_status_btns }); return actions;
            }
        }
        if (!session.size) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg), options: (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dictCurrent.step3_size_btns }); return actions; }
        if (!session.zip) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_zip) }); return actions; }
    }

    // ── CALCULAR PRECIO ──
    if (!session.condition || session.type === "Open Side" || session.type === "Double Door") {
        const autoNew = session.type === "Open Side" || session.type === "Double Door";
        session.condition = autoNew ? "Nuevo" : (session.condition || "Usado");
        updates.condition = session.condition;
    }
    if (!session.type) { session.type = "Dry"; updates.type = "Dry"; }
    
    // ENFORCE 20' HC RULE: If they ask for 20' HC, it MUST be New
    if (session.size === "20' HC" && session.condition !== "Nuevo") {
        session.condition = "Nuevo";
        updates.condition = "Nuevo";
    }

    // ENFORCE 45' RULE: If they ask for 45', enforce condition to Usado to avoid AI hallucinating New
    if (session.size && session.size.includes("45") && session.condition !== "Usado") {
        session.condition = "Usado";
        updates.condition = "Usado";
    }

    await updateSession(senderId, updates);

    actions.push({ type: "text", text: dictCurrent.calculating });

    try {
        const isExport = session.action === "Exportación" || session.action === "Exportacion";
        const isNew = session.condition === "Nuevo";
        const quantity = Number(session.quantity) || 1;

        let sizeKey = "";
        if (session.size === "20' STD" || session.size === "20'") {
            if (session.type === "Reefer") sizeKey = isNew ? "20reefer" : (session.reefer_status === "No Funcionando" ? "20nofunc" : "20func");
            else if (session.type === "Open Side") sizeKey = "20side";
            else if (session.type === "Double Door") sizeKey = "20dd";
            else sizeKey = "20std";
        } else if (session.size === "20' HC") {
            if (session.type === "Reefer") sizeKey = isNew ? "20reefer" : (session.reefer_status === "No Funcionando" ? "20nofunc" : "20func");
            else if (session.type === "Open Side") sizeKey = "20side";
            else if (session.type === "Double Door") sizeKey = "20dd";
            else sizeKey = "20std"; // The DB stores the new 20' HC price under the standard 20' key
        } else if (session.size === "40' STD" || session.size === "40'") {
            if (session.type === "Reefer") sizeKey = isNew ? "40reefer" : (session.reefer_status === "No Funcionando" ? "40nofunc" : "40func");
            else if (session.type === "Open Side") sizeKey = "40side";
            else if (session.type === "Double Door") sizeKey = "40dd";
            else sizeKey = "40std";
        } else if (session.size === "40' HC") {
            if (session.type === "Reefer") sizeKey = isNew ? "40reefer" : (session.reefer_status === "No Funcionando" ? "40nofunc" : "40func");
            else if (session.type === "Open Side") sizeKey = "40side";
            else if (session.type === "Double Door") sizeKey = "40dd";
            else sizeKey = "40hc";
        } else if (session.size === "45' HC" || session.size === "45'" || session.size === "45" || (session.size && session.size.includes("45"))) {
            sizeKey = "45hc";
        }

        const { data: qData, error } = await supabase.functions.invoke("calculate-quote", {
            body: {
                operation_mode: session.action === "Transporte" ? "transport_only" : (session.action === "Alquilar" ? "rent" : "sale"),
                condition: isNew ? "new" : "used",
                zip_destino: session.action === "Transporte" ? session.zip_dest : session.zip,
                zip_origen: session.action === "Transporte" ? session.zip_origin : undefined,
                container_size: sizeKey,
                quantity: quantity,
                options: {
                    export_certificate: isExport,
                    extra_service: session.action === "Transporte" && session.load_status === "Vacio",
                    crane_service: session.action === "Transporte" && session.load_status === "Cargado"
                }
            }
        });

        if (error || (qData && qData.error)) { actions.push({ type: "text", text: dictCurrent.no_stock }); return actions; }

        if (qData && qData.requires_manual_quote) {
            const msg = lang === "EN" 
                ? "For shipments outside the continental US, ocean freight rates vary daily. Please enter your full name so our logistics team can calculate the exact total price and contact you with the best rate of the day."
                : "Para envíos fuera de EE. UU. continental, las tarifas de flete marítimo varían diariamente. Por favor, escribe tu nombre completo para que nuestro equipo de logística calcule el precio total exacto y te contacte con la mejor tarifa del día.";
            
            const historyAfterQuote = [...(session.history || [])];
            historyAfterQuote.push({ role: "assistant", content: msg });
            await updateSession(senderId, { step: 7, history: historyAfterQuote.slice(-10) });
            actions.push({ type: "text", text: msg });
            return actions;
        }
        const finalPrice = qData.total_price || qData.totalPrice;
        if (!finalPrice) { actions.push({ type: "text", text: dictCurrent.no_stock }); return actions; }

        const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
        let msg = "";
        const displaySize = session.size ? session.size.replace(" STD", "") : "";

        if (session.action === "Transporte") {
            if (qData.immediate_price && qData.immediate_price !== finalPrice) {
                msg = dictCurrent.price_transport
                    .replace("{size}", displaySize).replace("{load}", session.load_status)
                    .replace("{origin}", session.zip_origin).replace("{dest}", session.zip_dest)
                    .replace("{price}", fmt(finalPrice)).replace("{immed}", fmt(qData.immediate_price))
                    .replace("{yard}", qData.closest_yard || "Miami Hub");
            } else {
                msg = dictCurrent.price_transport_single
                    .replace("{size}", displaySize).replace("{load}", session.load_status)
                    .replace("{origin}", session.zip_origin).replace("{dest}", session.zip_dest)
                    .replace("{price}", fmt(finalPrice));
            }
        } else if (isExport) {
            const sp = ["Reefer", "Open Side", "Double Door"].includes(session.type);
            const bp = (qData.container_price || 0) + (sp ? 0 : (qData.cert_fee || 0));
            msg = dictCurrent.export_buy_price.replace("{price}", fmt(bp)) + "\n\n" + dictCurrent.export_final_msg;
            
            const historyAfterQuote = [...(session.history || [])];
            historyAfterQuote.push({ role: "assistant", content: msg });
            await updateSession(senderId, { step: 7, final_amount: bp, history: historyAfterQuote.slice(-10) });
            actions.push({ type: "text", text: msg });
            return actions;
        } else if (session.action === "Alquilar") {
            msg = dictCurrent.price_rent
                .replace("{zip}", session.zip)
                .replace("{monthly}", fmt(qData.container_price || 0))
                .replace("{logistics}", fmt(qData.delivery_cost || 0))
                .replace("{price}", fmt(finalPrice));
        } else {
            let condLabel = lang === "EN" ? (session.condition === "Nuevo" ? "New" : "Used") : session.condition;
            let typeLabel = session.type === "Dry" ? "" : session.type;
            if (session.type === "Reefer" && session.reefer_status === "No Funcionando") typeLabel = lang === "EN" ? "Reefer (Not Working)" : "Refrigerado (No Funciona)";
            else if (session.type === "Reefer") typeLabel = lang === "EN" ? "Reefer" : "Refrigerado";
            const qtyStr = quantity > 1 ? `${quantity} ` : "";
            const qtyPluralS = quantity > 1 ? "s" : "";
            const qtyPluralES = quantity > 1 ? "es" : "";
            if (lang === "ES" && quantity > 1 && (condLabel === "Nuevo" || condLabel === "Usado")) condLabel += "s";

            // Check if we need to do the quantity >= 2 negotiation flow
            if (qData.non_discounted_price && quantity >= 2) {
                if (lang === "EN") {
                    msg = `Normally, the total cost for ${qtyStr}${condLabel} ${typeLabel} ${displaySize} containers delivered to ${session.zip} would be **${fmt(qData.non_discounted_price)}**. However, if you have enough space on your property to receive them on the same day and at the same time in a single shared trip, I can give you a special discount and leave them at a total of **${fmt(finalPrice)}**.\n\nDo you have the space and can we send them together?`;
                } else {
                    msg = `Normalmente, el costo total por ${qtyStr}contenedores ${typeLabel} ${condLabel} de ${displaySize} entregados en ${session.zip} sería de **${fmt(qData.non_discounted_price)}**. Sin embargo, si tienes espacio suficiente en tu propiedad para recibirlos el mismo día y a la misma hora en un solo viaje compartido, te puedo hacer un descuento especial y dejártelos en un total de **${fmt(finalPrice)}**.\n\n¿Tienes el espacio y podemos enviarlos juntos?`;
                }
            } else {
                msg = dictCurrent.price_sale
                    .replace("{qty}", qtyStr)
                    .replace(/{qty_plural_s}/g, qtyPluralS)
                    .replace(/{qty_plural_es}/g, qtyPluralES)
                    .replace("{cond}", condLabel)
                    .replace("{type}", typeLabel)
                    .replace("{size}", displaySize)
                    .replace("{zip}", session.zip)
                    .replace("{price}", fmt(finalPrice));
            }

            // Upsell/Downsell: Compare with Standard Used if they asked for a specialty container
            if (session.type !== "Dry") {
                const stdSizeKey = session.size === "20'" ? "20std" : (session.size === "40'" ? "40hc" : "45hc");
                try {
                    const { data: stdData } = await supabase.functions.invoke("calculate-quote", {
                        body: {
                            operation_mode: "sale",
                            condition: "used",
                            zip_destino: session.zip,
                            container_size: stdSizeKey,
                            quantity: quantity
                        }
                    });
                    
                    if (stdData && stdData.total_price) {
                        const stdPrice = stdData.non_discounted_price && quantity >= 2 ? stdData.non_discounted_price : stdData.total_price;
                        if (lang === "EN") {
                            msg = `The regular used ${displaySize} is **${fmt(stdPrice)}**.\n\n` + msg;
                        } else {
                            msg = `El de ${displaySize} regular usado cuesta **${fmt(stdPrice)}**.\n\n` + msg;
                        }
                    }
                } catch(err) {
                    console.error("Error fetching comparison quote:", err);
                }
            }
            
            // Clean up double spaces caused by empty typeLabel, but preserve newlines
            msg = msg.replace(/ +/g, " ");
        }

        const historyAfterQuote = [...(session.history || [])];
        historyAfterQuote.push({ role: "assistant", content: msg });
        await updateSession(senderId, { step: 6, final_amount: finalPrice, history: historyAfterQuote.slice(-10) });

        actions.push({ type: "quick_replies", text: msg, options: dictCurrent.proceed_btns });
        return actions;
    } catch (e) {
        console.error("Quote error:", e);
        actions.push({ type: "text", text: dictCurrent.calc_error });
        return actions;
    }
}

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────
serve(async (req) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

    try {
        const { sender_id, message, is_human } = await req.json();
        if (!sender_id || !message) {
            return new Response(JSON.stringify({ error: "sender_id and message are required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        const actions = await processMessage(sender_id, message, is_human);
        return new Response(JSON.stringify({ actions }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    } catch (e) {
        console.error("chatbot-core error:", e);
        return new Response(JSON.stringify({ error: "Internal Error" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
});
