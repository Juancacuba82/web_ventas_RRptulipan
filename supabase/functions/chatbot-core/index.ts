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
        ask_export_type: "¿Para qué usarás el contenedor? (Almacenamiento o Exportación)",
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
        ask_transport_details: "Para darle una cotización exacta de transporte, por favor indíquenos los siguientes detalles:\n\n1. Código postal de recogida y de entrega (si ambos comparten el mismo código postal, por favor ingréselo dos veces con un espacio de separación).\n2. ¿El contenedor está actualmente vacío o cargado?\n\nUna vez tengamos esta información, ¡le daremos el precio de inmediato!",
        price_transport: "El precio por mover tu{qty_plural_s} {qty}contenedor{qty_plural_es} de {size} ({load}) desde el Zip {origin} hasta el Zip {dest} es:\n\n🔹 Precio Flexible (En Ruta): **{price}**\n🔹 Envío Inmediato (Desde {yard}): **{immed}**\n\n¿Cuál opción prefieres o te gustaría proceder con alguna?",
        price_transport_single: "El precio por mover tu{qty_plural_s} {qty}contenedor{qty_plural_es} de {size} ({load}) desde el Zip Code {origin} hasta el Zip Code {dest} es de **{price}**.\n\n¿Te gustaría proceder?",
        human_handoff: "Veo que su solicitud requiere logística especial. Nuestro especialista en ventas revisará los detalles y le responderá por este mismo chat en breve. Por favor, espere en línea.",
        price_rent: "¡Excelente noticia! Tenemos disponibilidad para renta en {zip}.\n\n🔹 Renta Mensual: {monthly}\n🔹 Logística (Entrega y Recogida futura): {logistics} (pago único)\n\nEl pago inicial sería de {price}. ¿Proceder?",
        price_export: "Perfecto. El precio total por el contenedor es de **{price}**. ¿Te gustaría proceder con la compra?",
        price_pickup: "¡Perfecto! Los retiros en persona se realizan exclusivamente en nuestro depósito de Miami (8500 NW 87 Ave, Miami, FL 33166). El precio total por tu{qty_plural_s} {qty}contenedor{qty_plural_es} {type} {cond} de {size} retirado por ti mismo es **{price}**.\n\n¿Te gustaría proceder?",
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
        ask_export_type: "What will you use the container for? (Storage or Export)",
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
        ask_transport_details: "To give you an accurate transportation quote, please provide us with the following details:\n\n1. Pickup and delivery zip codes (if both locations share the same zip code, please enter it twice with a space in between).\n2. Is the container currently empty or loaded?\n\nOnce we have this info, we’ll get back to you with pricing right away!",
        price_transport: "The price to move your {qty} {size} ({load}) container{qty_plural_s} from Zip {origin} to Zip {dest} is:\n\n🔹 Flexible Price (En Route): **{price}**\n🔹 Immediate Dispatch (From {yard}): **{immed}**\n\nWhich option do you prefer, or would you like to proceed?",
        price_transport_single: "The price to move your {qty} {size} ({load}) container{qty_plural_s} from Zip Code {origin} to Zip Code {dest} is **{price}**.\n\nWould you like to proceed?",
        human_handoff: "I see your request requires special logistics. Our sales specialist will review the details and reply to you in this chat shortly. Please wait online.",
        price_rent: "Great news! We have availability to rent to {zip}.\n\n🔹 Monthly Rent: {monthly}\n🔹 Logistics (Delivery & future pickup): {logistics} (one-time fee)\n\nInitial payment would be {price}. Proceed?",
        price_export: "Perfect. The total price for the container is **{price}**. Would you like to proceed?",
        price_pickup: "Perfect! Self-pickups are strictly handled at our Miami depot (8500 NW 87 Ave, Miami, FL 33166). The total price for your {qty}{cond} {type} {size} container{qty_plural_s} picked up by you is **{price}**.\n\nWould you like to proceed?",
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
- PAYMENT: For payment on delivery (COD), we ONLY accept Cash or Zelle. If the customer wishes to pay with a Credit Card or Check, it MUST be paid in full BEFORE delivery. NO financing.
- DELIVERY TIME: 1-3 business days after order confirmation.
- PHOTOS: If the user asks for photos, pictures, or images, do NOT write a response. Instead, set intent to "photos".
- CONDITION (Used): All used containers are Wind & Water Tight (WWT). Structurally sound, no leaks, doors seal properly. DO NOT proactively mention the guarantee here.
- FLOORS: Used containers have hardwood or bamboo floors in good structural condition.
- PRICE IN ADS: Ads show the container price at the port only. Delivery cost varies by zip code distance, so we cannot advertise one price. Our quote is FINAL: container + flatbed delivery, no hidden fees. CRITICAL: NEVER invent, calculate, or provide a price yourself in ai_reply. The system will calculate the exact price using a database if you set intent to "quote". If the user asks for a price or asks "how much is X", ALWAYS set intent to "quote". However, if the user asks a conversational question (e.g., "is this to own?", "does it include delivery?", "how long does it take?"), set intent to "general_chat" and answer it naturally in ai_reply.
- DISCOUNTS: Prices are already the lowest wholesale port prices with zero hidden margins. No additional discounts available.
- MILITARY/SENIOR/FIRST RESPONDER: We do not offer special discounts. Our prices are already the best in the market.
- LOCATIONS/HUBS: Distribution centers in Miami, Tampa, Titusville, Jacksonville, Savannah, and Atlanta. Our main office is at 8500 NW 87 Ave, Miami, FL 33166. CRITICAL: WHENEVER you give the office address, you MUST also tell the customer that if they wish to visit, they MUST call us first to schedule an appointment so they don't find the office closed.
- SIZES: 20ft, 40ft standard, 45ft high cube. We do NOT carry 10ft (must be custom-cut from a 20ft, costs MORE). CRITICAL: If the customer asks for a 40' container without specifying High Cube (HC) or Standard (STD), extract "40'". ONLY extract "40' HC" if they explicitly type "HC" or "High Cube".
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
- "photos", "pictures", "can I see it first", "pics" → set intent to "photos".
- "where are you located", "where do you ship from", "do you deliver to" → location question.
- "good floors", "floor condition", "floor quality" → floor question.
- "pick up", "retirar", "lo retiro yo", "buscar", "recoger" → Customer wants to pick up the container themselves. SET action to "PickUp" AND ALWAYS SET intent to "quote" so the system can calculate the new price without delivery. NEVER invent the price yourself.
- "phone number", "contact", "telefono", "numero", "speak to a human" → If the customer asks for OUR phone number or wants to call us, provide the company phone numbers enthusiastically. CRITICAL: If the customer instead says "call me", "llámame", or gives instructions on when to call them, DO NOT give our phone numbers; just acknowledge their request politely and tell them an agent will contact them.

OUTPUT: You MUST output a valid JSON object with NO markdown, NO code blocks, NO extra text:
{
  "intent": "quote" | "general_chat" | "cancel" | "proceed" | "photos" | "dimensions" | "provide_info",
  "lang": "EN" | "ES", // CRITICAL: This MUST match the exact language the customer used in their VERY LAST message. If they spoke Spanish, output "ES".
  "extracted_data": {
    "items": [
      {
        "action": "Comprar" | "Alquilar" | "Transporte" | "Exportacion" | "PickUp" | null,
        "export_action": "Comprar" | "Alquilar" | null,
        "condition": "Nuevo" | "Usado" | null,
        "type": "Dry" | "Reefer" | "Open Side" | "Double Door" | null,
        "size": "20' STD" | "20' HC" | "40'" | "40' STD" | "40' HC" | "45' HC" | null,
        "quantity": number | null,
        "reefer_status": "Funcionando" | "No Funcionando" | null,
        "load_status": "Vacio" | "Cargado" | null,
        "port_dest": string | null
      }
    ],
    "zip": string | null,
    "zip_origin": string | null,
    "zip_dest": string | null,
    "is_complex_order": boolean,
    "customer_name": string | null,
    "customer_phone": string | null
  },
  "ai_reply": string | null
}

INTENT RULES:
- "quote": Customer is giving NEW data (size, zip, condition) to advance a quote, explicitly requesting a new price calculation, or asking for a delivery fee/cost/price. CRITICAL: If the customer provides a Zip Code and a size asking for a price/fee, the intent MUST ALWAYS be "quote" so the system can calculate it. NEVER use "general_chat" to give a price. CRITICAL: When setting intent to "quote", DO NOT write filler text in ai_reply like "I will get you a quote shortly" or "Here is your price". Leave ai_reply as null, UNLESS you need to answer a specific question they asked at the same time.
- "general_chat": Customer is asking a general question (quality, payment, guarantees) WITHOUT requesting a new price. If they ask for a price (e.g. "how much is the 20"), use "quote". NEVER give or invent a price in general_chat.
- "cancel": Customer says bye, thanks, no thanks, stop, not interested, too expensive, ok (alone with no other info), OR indicates they are waiting/shopping around (e.g. "waiting for quotes", "I'll think about it", "shopping around"). CRITICAL: For ai_reply, ALWAYS MATCH THE CUSTOMER'S EXACT LANGUAGE. If they spoke English, you MUST reply in English. If Spanish, in Spanish. If they thank you or say "no thanks" (e.g., gracias, thanks, no gracias), reply with "¡De nada!" or "You're welcome!". If they just cancel, say bye, or say ok, reply with "¡Gracias!" or "Thank you!".
- "proceed": Customer explicitly CONFIRMS they want to place the order AFTER receiving a final price quote (e.g., yes, si, proceed, let's do it, I'll take it). Do NOT use this if they are just starting a request. CRITICAL: If the customer agrees but AT THE SAME TIME changes the quantity (e.g. "I'll just take one for now"), you MUST use "quote" instead of "proceed" to recalculate the new price.
- "provide_info": Customer is providing their name or phone number as requested by the bot.
- "photos": Customer is explicitly asking to see photos, pictures, images, or a gallery of the containers.
- "dimensions": Customer is asking for the exact dimensions, measurements, length, width, or physical size of the containers. CRITICAL: Do NOT use this if they ask for delivery time (e.g. "how long").

CONVERSATION RULES:
- ALWAYS answer the customer's questions in the "ai_reply" field, EVEN if the intent is "quote" or "proceed". Do not stay silent if they asked a question (even if they forgot the question mark).
- If they ask if a 20' used container is HC or STD, explain that our used 20' containers are STD (8'6" tall), and we only carry 20' HC (9'6" tall) as brand new.
- If they ask if a 40' used container is HC or STD, or say something like "este de 40 es HC", explain that for 40' USED containers we have BOTH STD and HC available for the EXACT SAME PRECIO, and extract the size as "40' HC".
- CRITICAL: 45' containers are ONLY Dry and ONLY HC. Do not ask the customer if they want Reefer, Open Side, etc. for a 45' container.
- CRITICAL: Open Side and Double Door containers are ONLY available in BRAND NEW condition, and ONLY in sizes 20ft and 40ft. Do not offer 45ft for them.
- CRITICAL: If the customer asks technical questions about refrigerated (reefer) containers like the year or data sheet, you MUST reply exactly with this message in ai_reply depending on the language:
  English: "Great question! Since technical details (year, data sheet, etc.) vary depending on the exact unit we have in the yard, I suggest speaking with our sales team to get precise information. You can call us right now at +1 (786) 768-4409 or +1 (786) 736-6288 and a specialist will help you immediately."
  Spanish: "¡Excelente pregunta! Como los detalles técnicos (año, ficha técnica, etc.) varían dependiendo de la unidad exacta que tenemos en el patio, te sugiero hablar con nuestro equipo de ventas para darte la información precisa. Puedes llamarnos ahora mismo al +1 (786) 768-4409 o al +1 (786) 736-6288 y un especialista te ayudará de inmediato."
- VOLTAGE/CURRENT FOR REEFERS: If the customer asks about the voltage or current for refrigerated containers (e.g., "qué corriente usa", "what voltage"), ALWAYS answer that they use 440V 3-phase (440V trifásica).
- TRANSFORMERS: If the customer mentions they do not have 440V, or asks about transformers, explain that we sell transformers that convert 220V to 440V. If they ask for prices of the transformers, quote them: Used $2500, New $3000. Set intent to "general_chat" for these answers unless they are also asking for container prices.
- UNLOADING TO THE GROUND / CRANE DELIVERY: If the customer asks if we can put the container on the ground/floor, or if they ask "can you unload this yourself?", ALWAYS answer YES. You MUST reply exactly with this message in ai_reply depending on the language (use \n for line breaks):
  English: "Yes, we can leave the container directly on the ground. We deliver and lower the container using our specialized crane equipment on our trailers. I invite you to see how our crane works here:\n\nWith our side crane: https://www.youtube.com/shorts/wdqOKA2CFwE\nWith our trailers: https://www.youtube.com/shorts/1Q8G_lf3QXs"
  Spanish: "¡Sí! Entregamos y bajamos el contenedor directamente al piso utilizando nuestro equipo de grúa especializado. Te invito a ver cómo funciona en estos videos:\n\nCon nuestra grúa lateral: https://www.youtube.com/shorts/wdqOKA2CFwE\nCon nuestros trailers: https://www.youtube.com/shorts/1Q8G_lf3QXs"

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
- Extract 5-digit zip codes exactly. CRITICAL: NEVER extract a 3 or 4-digit number (e.g., 1400) as a zip code. If a customer sends a number like "1400" next to a size, DO NOT assume what it means. Treat this as general_chat and ASK the customer what they mean by that number (e.g. "What do you mean by 1400?"). Once they explain it's a price, then explain our pricing policy. If two zips: first is zip_origin, second is zip_dest. If one zip is provided without explicit origin/destination context, assign it to 'zip', DO NOT guess zip_origin or zip_dest.
- is_complex_order: set to true ONLY IF the customer is requesting multiple DIFFERENT distinct services in the same message (e.g. "I want to buy a 20ft AND move two 40ft containers"). CRITICAL: Asking for prices/quotes on multiple different container sizes or conditions (e.g. "precios de 20 y 40") is NOT a complex order. Set this to false in those cases.
- customer_name: If the user provides a name or business name (e.g. "Crossties of Ocala"), extract it. If they say "already did" or "see above", review the conversation history to find the previously mentioned name and extract it here!
- customer_phone: extract any 10-digit phone number if provided.
- CRITICAL: The 'items' array represents the full shopping cart. If the customer previously asked for multiple items (e.g. 20 and 40), you MUST output ALL of those items with their sizes in EVERY response, even if the customer is just answering a follow-up question. Do not wipe out the cart.
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

    if (["comprar", "buy"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ action: "Comprar" }] } };
    if (["alquilar", "rent"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ action: "Alquilar" }] } };
    if (["transporte", "transport"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ action: "Transporte" }] } };
    if (lo === "20'") return { intent: "quote", extracted_data: { items: [{ size: "20'" }] } };
    if (lo === "40'") return { intent: "quote", extracted_data: { items: [{ size: "40'" }] } };
    if (lo === "45'") return { intent: "quote", extracted_data: { items: [{ size: "45'" }] } };
    if (["nuevo", "new"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ condition: "Nuevo" }] } };
    if (["usado", "used"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ condition: "Usado" }] } };
    if (["dry (estándar)", "dry (standard)", "dry"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ type: "Dry" }] } };
    if (["refrigerado", "refrigerated"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ type: "Reefer" }] } };
    if (["funcionando", "working"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ reefer_status: "Funcionando" }] } };
    if (["no funcionando", "not working"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ reefer_status: "No Funcionando" }] } };
    if (["almacenamiento", "storage"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ action: "Comprar" }] } };
    if (["exportación", "export"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ action: "Exportacion" }] } };
    if (["vacío", "empty", "vacio"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ load_status: "Vacio" }] } };
    if (["cargado", "loaded"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ load_status: "Cargado" }] } };
    if (["sí, proceder", "yes, proceed", "yes", "sí", "si"].includes(lo)) return { intent: "proceed", extracted_data: {} };

    if (/^\d{5}$/.test(lo)) return { intent: "quote", extracted_data: { zip: lo } };

    return null;
}

// ─── LÓGICA PRINCIPAL ─────────────────────────────────────────────────────────
async function processMessageInner(senderId: string, messageText: string, isHuman: boolean = false): Promise<Action[]> {
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
        await updateSession(senderId, { step: 0, lang: null, action: null, condition: null, size: null, type: null, zip: null, reefer_status: null, load_status: null, quantity: null, zip_origin: null, zip_dest: null, history: null, items: null });
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

    // ── Construir historial (últimos 8 mensajes para contexto) ──
    const rawHistory = session.history || [];
    const recentHistory: Array<{role: string, content: string}> = Array.isArray(rawHistory) ? rawHistory.slice(-8) : [];
    recentHistory.push({ role: "user", content: input });

    // ── Detección rápida (sin tokens de IA) o llamada a IA ──
    let extracted = quickDetect(input, senderId, session);
    if (!extracted || step === 7 || step === 8) {
        extracted = await callAI(recentHistory);
        if (!extracted) extracted = { intent: "quote", lang, extracted_data: {} };
    }

    if (extracted.lang) {
        lang = extracted.lang;
        dictCurrent = chatDict[lang];
    }
    const data = extracted.extracted_data || {};
    
    if (data.items && data.items.length > 0) {
        const hasSize = data.items.some((i: any) => i.size);
        if (!hasSize && session.items && session.items.length > 0) {
            const delta = data.items[0];
            session.items.forEach((existingItem: any) => {
                if (delta.action) existingItem.action = delta.action;
                if (delta.export_action) existingItem.export_action = delta.export_action;
                if (delta.condition) existingItem.condition = delta.condition;
                if (delta.type) existingItem.type = delta.type;
                if (delta.reefer_status) existingItem.reefer_status = delta.reefer_status;
                if (delta.load_status) existingItem.load_status = delta.load_status;
            });
            data.items = session.items;
        } else {
            session.items = data.items;
        }
        
        const first = data.items[0];
        if (first.action) data.action = first.action;
        if (first.export_action) data.export_action = first.export_action;
        if (first.condition) data.condition = first.condition;
        if (first.type) data.type = first.type;
        if (first.size) data.size = first.size;
        if (first.quantity) data.quantity = first.quantity;
        if (first.reefer_status) data.reefer_status = first.reefer_status;
        if (first.load_status) data.load_status = first.load_status;
        if (first.port_dest) data.port_dest = first.port_dest;
    }

    if (step === 7 || step === 8) {
        if (extracted.intent === "general_chat" || extracted.intent === "quote" || extracted.intent === "photos" || extracted.intent === "dimensions" || extracted.intent === "cancel") {
            step = 6;
            await updateSession(senderId, { step: 6 });
        } else {
            if (step === 7) {
                if (data.customer_name) {
                    await updateSession(senderId, { lead_name: data.customer_name, step: 8 });
                    actions.push({ type: "text", text: dictCurrent.ask_phone.replace("{name}", data.customer_name) });
                    return actions;
                } else if (extracted.ai_reply) {
                    actions.push({ type: "text", text: extracted.ai_reply });
                    return actions;
                } else {
                    actions.push({ type: "text", text: dictCurrent.ask_name });
                    return actions;
                }
            }
            if (step === 8) {
                if (data.customer_phone) {
                    const cleanPhone = data.customer_phone.replace(/[\s\-\(\)\+]/g, '');
                    const digitsOnly = cleanPhone.match(/\d/g);
                    if (digitsOnly && digitsOnly.length >= 10) {
                        const finalPhone = digitsOnly.join('').slice(-10);
                        
                        await updateSession(senderId, { lead_phone: finalPhone, step: 6 });
                        
                        await supabase.from("call_logs").insert([{
                            customer: session.lead_name || "Unknown", phone: finalPhone,
                            service_type: session.action || "Sales", city: "---",
                            description: session.action === "Exportacion" || session.action === "Exportación" ? `Order via AI Bot (EXPORT). Zip: ${session.zip}. Port: ${session.port_dest}. Buy/Rent: ${session.export_action}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.` : (session.action === "PickUp" ? `Order via AI Bot (PICKUP - NO DELIVERY). Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.` : `Order via AI Bot. Zip: ${session.zip}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.`),
                            created_by: "rptulipantransport@gmail.com", source: "chatbot",
                            status: "PENDING", date: new Date().toISOString().split("T")[0],
                            next_call_date: new Date().toISOString().split("T")[0],
                            amount: session.final_amount, zip_code: session.zip, measures: session.size
                        }]);
                        actions.push({ type: "text", text: dictCurrent.order_done });
                        return actions;
                    }
                }
                const invalidMsg = lang === "ES" ? "Por favor, proporciona un número de teléfono válido de 10 dígitos (ej. 786-123-4567)." : "Please provide a valid 10-digit phone number (e.g. 786-123-4567).";
                
                if (extracted.ai_reply && !data.customer_phone) {
                    actions.push({ type: "text", text: `${extracted.ai_reply}\n\n${invalidMsg}` });
                } else {
                    actions.push({ type: "text", text: invalidMsg });
                }
                return actions;
            }
        }
    }

    // ── Prevenir recálculo redundante en el paso 6 ──
    if (step === 6 && extracted.intent === "quote") {
        const qData = data.quantity || 1;
        const qSess = session.quantity || 1;
        const normSize = (s: any) => s ? s.toString().replace(" STD", "") : "";
        const changedPricingVar = 
            (data.size && normSize(data.size) !== normSize(session.size) && session.size !== "20' & 40'") ||
            (data.zip && data.zip !== session.zip) ||
            (data.zip_origin && data.zip_origin !== session.zip_origin) ||
            (data.zip_dest && data.zip_dest !== session.zip_dest) ||
            (data.condition && data.condition !== session.condition) ||
            (data.type && data.type !== session.type) ||
            (data.quantity && qData !== qSess);
        
        if (!changedPricingVar) {
            extracted.intent = "general_chat";
        }
    }

    // ── OVERRIDE (Removed size override to let AI handle HC vs STD) ──
    const lo = input.toLowerCase();
    
    const isExportFlow = session.action === "Exportación" || session.action === "Exportacion";
    if (isExportFlow) {
        if (lo.includes("comprar") || lo.includes("buy")) data.export_action = "Comprar";
        else if (lo.includes("alquilar") || lo.includes("rent") || lo.includes("alquilo")) data.export_action = "Alquilar";
    }

    // ── Actualizar sesión con datos extraídos ──
    const updates: any = { lang };
    if (session.items) updates.items = session.items;
    if (data.size) updates.size = data.size;
    
    if (data.action) {
        const actionStr = data.action.toString().toLowerCase();
        if (isExportFlow && (actionStr.includes("comprar") || actionStr.includes("buy") || actionStr.includes("alquilar") || actionStr.includes("rent"))) {
            updates.export_action = (actionStr.includes("comprar") || actionStr.includes("buy")) ? "Comprar" : "Alquilar";
        } else {
            if (data.action === "Comprar" && !session.action) {
                updates.action = "Comprar";
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
            updates.zip = data.zip;
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

    // ── INTENT: PHOTOS / DIMENSIONS ──
    if (extracted.intent === "photos" || extracted.intent === "dimensions") {
        const isWeb = senderId.startsWith("web_");
        let replyMsg = "";
        
        if (extracted.intent === "photos") {
            let photoMsgEN = "We cannot send you photos of the exact unit right now because the port depots are automated and the stacks move constantly for security. However, **on the day of your delivery**, our driver will send you detailed photos of the exact container selected for you, and **we will wait for your approval** before proceeding with the trip to your property. This guarantees your total satisfaction!\n\nIn the meantime, you can view real photos of recent deliveries in your area.\n**Please note:** Our gallery showcases both BRAND NEW and USED containers. If you purchase a used unit, it will be structurally sound and wind/water tight, but it will have minor dents and surface rust normal for its age. View our gallery here:\n\nhttps://rpcontainer.com/#gallery";
            let photoMsgES = "No podemos enviarle fotos de la unidad exacta en este momento porque los depósitos portuarios están automatizados y los contenedores se mueven constantemente por seguridad. Sin embargo, **el día programado para su entrega**, nuestro chofer le enviará fotos detalladas del contenedor exacto seleccionado para usted, y **esperaremos su aprobación** antes de proceder con el viaje a su propiedad. ¡Así garantizamos su total satisfacción!\n\nMientras tanto, puede ver fotos reales de entregas recientes en su zona.\n**Nota importante:** Nuestra galería muestra contenedores tanto NUEVOS como USADOS. Si compra una unidad usada, esta será estructuralmente sólida y estará 100% sellada (sin goteras), pero presentará golpes menores y óxido superficial normal para su edad. Vea nuestra galería aquí:\n\nhttps://rpcontainer.com/#gallery";
            
            if (isWeb) {
                photoMsgEN = "We cannot send you photos of the exact unit right now because the port depots are automated and the stacks move constantly for security. However, **on the day of your delivery**, our driver will send you detailed photos of the exact container selected for you, and **we will wait for your approval** before proceeding with the trip to your property. This guarantees your total satisfaction!\n\nIn the meantime, you can view real photos of recent deliveries in your area.\n**Please note:** Our gallery showcases both BRAND NEW and USED containers. If you purchase a used unit, it will be structurally sound and wind/water tight, but it will have minor dents and surface rust normal for its age.<br><br><a href='https://rpcontainer.com/#gallery' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>Gallery</a>";
                photoMsgES = "No podemos enviarle fotos de la unidad exacta en este momento porque los depósitos portuarios están automatizados y los contenedores se mueven constantemente por seguridad. Sin embargo, **el día programado para su entrega**, nuestro chofer le enviará fotos detalladas del contenedor exacto seleccionado para usted, y **esperaremos su aprobación** antes de proceder con el viaje a su propiedad. ¡Así garantizamos su total satisfacción!\n\nMientras tanto, puede ver fotos reales de entregas recientes en su zona.\n**Nota importante:** Nuestra galería muestra contenedores tanto NUEVOS como USADOS. Si compra una unidad usada, esta será estructuralmente sólida y estará 100% sellada (sin goteras), pero presentará golpes menores y óxido superficial normal para su edad.<br><br><a href='https://rpcontainer.com/#gallery' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>Galería</a>";
            }
            replyMsg = lang === "ES" ? photoMsgES : photoMsgEN;
        } else {
            let dimMsgEN = "Our containers come in standard shipping sizes. To make it easy for you, we have prepared visual guides with the exact internal and external dimensions (Length, Width, Height, and Payload Capacity) for all our sizes.\n\nYou can view all the measurements directly on our website here:\n\nhttps://rpcontainer.com/#container-dimensions";
            let dimMsgES = "Nuestros contenedores vienen en medidas estándar de envío. Para hacérselo más fácil, hemos preparado guías visuales con las medidas exactas internas y externas (Largo, Ancho, Alto y Capacidad de Carga) de todos nuestros tamaños.\n\nPuede ver todas las medidas directamente en nuestra página web aquí:\n\nhttps://rpcontainer.com/#container-dimensions";
            
            if (isWeb) {
                dimMsgEN = "Our containers come in standard shipping sizes. To make it easy for you, we have prepared visual guides with the exact internal and external dimensions (Length, Width, Height, and Payload Capacity) for all our sizes.\n\nYou can view all the measurements directly on our website here:<br><br><a href='https://rpcontainer.com/#container-dimensions' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>View Dimensions</a>";
                dimMsgES = "Nuestros contenedores vienen en medidas estándar de envío. Para hacérselo más fácil, hemos preparado guías visuales con las medidas exactas internas y externas (Largo, Ancho, Alto y Capacidad de Carga) de todos nuestros tamaños.\n\nPuede ver todas las medidas directamente en nuestra página web aquí:<br><br><a href='https://rpcontainer.com/#container-dimensions' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>Ver Medidas</a>";
            }
            replyMsg = lang === "ES" ? dimMsgES : dimMsgEN;
        }
        
        let pendingOptions: string[] | null = null;
        if (step === 6) pendingOptions = dictCurrent.proceed_btns;
        else if (!session.action) pendingOptions = dictCurrent.step1_btns;
        else if (!session.size) pendingOptions = (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dictCurrent.step3_size_btns;
        else if (session.action === "Transporte" && !session.load_status) pendingOptions = dictCurrent.ask_load_btns;

        if (pendingOptions) {
            actions.push({ type: "quick_replies", text: replyMsg, options: pendingOptions });
        } else {
            actions.push({ type: "text", text: replyMsg });
        }
        return actions;
    }

    // ── INTENT: CANCEL ──
    if (extracted.intent === "cancel") {
        // Option A: If we are already in an idle state (previously cancelled), don't reply again
        if (!session.action && !session.size && !session.zip) {
            return [];
        }

        if (!session.lead_phone) {
            await updateSession(senderId, { step: 0, action: null, size: null, zip: null, condition: null, type: null, reefer_status: null, quantity: null, history: null, export_action: null, port_dest: null, items: null });
        }
        
        let defaultMsg = lang === "EN" ? "Thank you!" : "¡Gracias!";
        if (input.toLowerCase().includes("gracias") || input.toLowerCase().includes("thanks")) {
            defaultMsg = lang === "EN" ? "You're welcome!" : "¡De nada!";
            extracted.ai_reply = null; // Force override the AI if it mistakenly generated "Gracias"
        }
        const msg = extracted.ai_reply || defaultMsg;

        actions.push({ type: "text", text: msg });
        return actions;
    }

    // ── INTENT: PROCEED ──
    if (extracted.intent === "proceed" || (step === 6 && (input.toLowerCase() === "sí, proceder" || input.toLowerCase() === "yes, proceed"))) {
        if (session.lead_name && session.lead_phone) {
            // Re-use data for second order!
            await supabase.from("call_logs").insert([{
                customer: session.lead_name, phone: session.lead_phone,
                service_type: session.action || "Sales", city: "---",
                description: session.action === "Exportacion" || session.action === "Exportación" ? `Order via AI Bot (EXPORT). Zip: ${session.zip}. Port: ${session.port_dest}. Buy/Rent: ${session.export_action}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.` : `Order via AI Bot. Zip: ${session.zip}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.`,
                created_by: "rptulipantransport@gmail.com", source: "chatbot",
                status: "PENDING", date: new Date().toISOString().split("T")[0],
                next_call_date: new Date().toISOString().split("T")[0],
                amount: session.final_amount, zip_code: session.zip, measures: session.size
            }]);
            actions.push({ type: "text", text: lang === "ES" ? "¡Perfecto! Hemos añadido esta nueva orden a tu solicitud anterior." : "Perfect! We have added this new order to your previous request." });
            return actions;
        } else {
            await updateSession(senderId, { step: 7 });
            actions.push({ type: "text", text: dictCurrent.ask_name });
            return actions;
        }
    }

    // ── INTENT: GENERAL_CHAT (la IA responde libremente) ──
    if (extracted.intent === "general_chat") {
        if (step < 6 && session.action) {
            extracted.intent = "quote";
        } else {
            const aiMsg = extracted.ai_reply || (lang === "EN" ? "I'm sorry, could you clarify?" : "Lo siento, ¿podrías aclarar?");
            let pendingOptions: string[] | null = null;
            if (step === 6 && !session.lead_phone) pendingOptions = dictCurrent.proceed_btns;
            else if (!session.action) pendingOptions = dictCurrent.step1_btns;

            if (pendingOptions) {
                actions.push({ type: "quick_replies", text: aiMsg, options: pendingOptions });
            } else {
                actions.push({ type: "text", text: aiMsg });
            }
            return actions;
        }
    }

    // Helper para incluir la respuesta conversacional de la IA (si existe) antes del mensaje estructurado
    const appendAiReply = (msg: string) => extracted.ai_reply ? `${extracted.ai_reply}\n\n${msg}` : msg;

    if (data.is_complex_order || (session.action === "Transporte" && (session.quantity || 1) > 1)) {
        await updateSession(senderId, { step: -1 });
        actions.push({ type: "text", text: dictCurrent.human_handoff });
        return actions;
    }

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
        if (!session.zip_origin || !session.zip_dest || !session.load_status) {
            actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_transport_details) });
            return actions;
        }
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
    } else if (session.action === "Alquilar") {
        if (!session.size) {
            const hasSizeInItems = session.items && session.items.length > 0 && session.items.some((i: any) => i.size);
            if (!hasSizeInItems) {
                session.items = [ { size: "20'", action: "Alquilar" }, { size: "40'", action: "Alquilar" } ];
                updates.items = session.items;
                session.size = "20' & 40'";
                updates.size = session.size;
            }
        }
        if (!session.zip) {
            actions.push({ type: "text", text: appendAiReply(dictCurrent.step5_zip_msg) });
            return actions;
        }
    } else if (session.action === "PickUp") {
        if (session.type === "Reefer" && session.condition === "Usado" && !session.reefer_status) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_reefer_status), options: dictCurrent.ask_reefer_status_btns }); return actions;
        }
        if (!session.size) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg), options: (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dictCurrent.step3_size_btns }); return actions; }
        if (!session.condition) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step4_cond_msg), options: dictCurrent.step4_cond_btns }); return actions; }
    } else {
        if (session.action === "Comprar") {
            if (session.type === "Reefer" && session.condition === "Usado" && !session.reefer_status) {
                actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_reefer_status), options: dictCurrent.ask_reefer_status_btns }); return actions;
            }
        }
        if (!session.size) {
            const hasSizeInItems = session.items && session.items.length > 0 && session.items.some((i: any) => i.size);
            if (!hasSizeInItems) {
                session.items = [ { size: "20'", action: "Comprar" }, { size: "40'", action: "Comprar" } ];
                updates.items = session.items;
                session.size = "20' & 40'";
                updates.size = session.size;
            }
        }
        if (!session.zip) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_zip) }); return actions; }
    }

    // ── CALCULAR PRECIO ──
    try {
        let finalMessages: string[] = [];
        let finalTotalPrice = 0;
        let requiresManualQuote = false;
        
        const itemsToQuote = (session.items && session.items.length > 0) ? session.items : [session];
        let allQuotesValid = true;
        
        for (let i = 0; i < itemsToQuote.length; i++) {
            let item = itemsToQuote[i];
            
            const itemAction = item.action || session.action;
            const itemCondition = item.condition || session.condition;
            const itemType = item.type || session.type || "Dry";
            const itemSize = item.size || session.size;
            const itemQty = Number(item.quantity) || Number(session.quantity) || 1;
            const itemExportAction = item.export_action || session.export_action;
            
            if (!itemCondition || itemType === "Open Side" || itemType === "Double Door") {
                const autoNew = itemType === "Open Side" || itemType === "Double Door";
                item.condition = autoNew ? "Nuevo" : (itemCondition || "Usado");
            }
            
            if (itemSize === "20' HC" && item.condition !== "Nuevo") item.condition = "Nuevo";
            if (itemSize && itemSize.includes("45") && item.condition !== "Usado") item.condition = "Usado";
            
            const isExport = itemAction === "Exportación" || itemAction === "Exportacion";
            const isNew = item.condition === "Nuevo";
            const quantity = itemQty;

            let sizeKey = "";
            if (itemSize === "20' STD" || itemSize === "20'") {
                if (itemType === "Reefer") sizeKey = isNew ? "20reefer" : (item.reefer_status === "No Funcionando" ? "20nofunc" : "20func");
                else if (itemType === "Open Side") sizeKey = "20side";
                else if (itemType === "Double Door") sizeKey = "20dd";
                else sizeKey = "20std";
            } else if (itemSize === "20' HC") {
                if (itemType === "Reefer") sizeKey = isNew ? "20reefer" : (item.reefer_status === "No Funcionando" ? "20nofunc" : "20func");
                else if (itemType === "Open Side") sizeKey = "20side";
                else if (itemType === "Double Door") sizeKey = "20dd";
                else sizeKey = "20std";
            } else if (itemSize === "40' STD") {
                if (itemType === "Reefer") sizeKey = isNew ? "40reefer" : (item.reefer_status === "No Funcionando" ? "40nofunc" : "40func");
                else if (itemType === "Open Side") sizeKey = "40side";
                else if (itemType === "Double Door") sizeKey = "40dd";
                else sizeKey = "40std";
            } else if (itemSize === "40' HC" || itemSize === "40'") {
                if (itemType === "Reefer") sizeKey = isNew ? "40reefer" : (item.reefer_status === "No Funcionando" ? "40nofunc" : "40func");
                else if (itemType === "Open Side") sizeKey = "40side";
                else if (itemType === "Double Door") sizeKey = "40dd";
                else sizeKey = "40hc";
            } else if (itemSize === "45' HC" || itemSize === "45'" || itemSize === "45" || (itemSize && itemSize.includes("45"))) {
                sizeKey = "45hc";
            }

            const isPickUp = itemAction === "PickUp";
            
            const { data: qData, error } = await supabase.functions.invoke("calculate-quote", {
                body: {
                    operation_mode: itemAction === "Transporte" ? "transport_only" : (itemAction === "Alquilar" ? "rent" : (isPickUp ? "pickup" : "sale")),
                    condition: isNew ? "new" : "used",
                    zip_destino: isPickUp ? "33178" : (itemAction === "Transporte" ? session.zip_dest : session.zip),
                    zip_origen: itemAction === "Transporte" ? session.zip_origin : undefined,
                    container_size: sizeKey,
                    quantity: quantity,
                    options: {
                        export_certificate: isExport,
                        extra_service: itemAction === "Transporte" && session.load_status === "Vacio",
                        crane_service: itemAction === "Transporte" && session.load_status === "Cargado"
                    }
                }
            });

            if (error || (qData && qData.error)) {
                allQuotesValid = false;
                continue;
            }

            if (qData && qData.requires_manual_quote) {
                requiresManualQuote = true;
                break;
            }

            let itemPrice = qData.total_price || 0;
            if (isPickUp) {
                const sp = ["Reefer", "Open Side", "Double Door"].includes(itemType);
                itemPrice = (qData.container_price || 0) + (sp ? 0 : (qData.cert_fee || 0));
            }
            if (!itemPrice) {
                allQuotesValid = false;
                continue;
            }
            
            finalTotalPrice += itemPrice;

            const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
            let msg = "";
            const displaySize = itemSize ? itemSize.replace(" STD", "") : "";
            const condLabel = lang === "EN" ? (item.condition === "Nuevo" ? "New" : "Used") : item.condition;
            let typeLabel = itemType === "Dry" ? "" : itemType;
            if (itemType === "Reefer" && item.reefer_status === "No Funcionando") typeLabel = lang === "EN" ? "Reefer (Not Working)" : "Refrigerado (No Funciona)";
            else if (itemType === "Reefer") typeLabel = lang === "EN" ? "Reefer" : "Refrigerado";

            if (itemAction === "Transporte") {
                const qtyStr = quantity > 1 ? `${quantity} ` : "";
                msg = dictCurrent.price_transport_single
                    .replace("{qty}", qtyStr)
                    .replace("{size}", displaySize).replace("{load}", session.load_status)
                    .replace("{origin}", session.zip_origin).replace("{dest}", session.zip_dest)
                    .replace("{price}", fmt(itemPrice));
            } else if (isExport) {
                const sp = ["Reefer", "Open Side", "Double Door"].includes(itemType);
                const bp = (qData.container_price || 0) + (sp ? 0 : (qData.cert_fee || 0));
                msg = `🔹 ${condLabel} ${typeLabel} ${displaySize}: **${fmt(bp)}**`;
            } else if (itemAction === "Alquilar") {
                msg = `🔹 Renta ${condLabel} ${typeLabel} ${displaySize}: **${fmt(itemPrice)}** (${fmt(qData.container_price || 0)}/mes + ${fmt(qData.delivery_cost || 0)} logistica)`;
            } else {
                const qtyStr = quantity > 1 ? `${quantity} ` : "";
                msg = `🔹 ${qtyStr}${condLabel} ${typeLabel} ${displaySize}: **${fmt(itemPrice)}**`;
            }
            
            msg = msg.replace(/ +/g, " ");
            finalMessages.push(msg);
        }

        if (requiresManualQuote) {
            const msg = lang === "EN" 
                ? "For shipments outside the continental US, ocean freight rates vary daily. Please enter your full name so our logistics team can calculate the exact total price and contact you with the best rate of the day."
                : "Para envíos fuera de EE. UU. continental, las tarifas de flete marítimo varían diariamente. Por favor, escribe tu nombre completo para que nuestro equipo de logística calcule el precio total exacto y te contacte con la mejor tarifa del día.";
            
            const historyAfterQuote = [...(session.history || [])];
            historyAfterQuote.push({ role: "assistant", content: msg });
            await updateSession(senderId, { step: 7, history: historyAfterQuote.slice(-10) });
            actions.push({ type: "text", text: msg });
            return actions;
        }

        if (!allQuotesValid || finalMessages.length === 0) {
            actions.push({ type: "text", text: dictCurrent.no_stock });
            return actions;
        }

        const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
        let msg = "";
        
        if (itemsToQuote.length === 1) {
            const singleItem = itemsToQuote[0];
            const isExport = (singleItem.action || session.action) === "Exportación" || (singleItem.action || session.action) === "Exportacion";
            
            if (isExport) {
                msg = dictCurrent.export_buy_price.replace("{price}", fmt(finalTotalPrice)) + "\n\n" + dictCurrent.export_final_msg;
            } else if ((singleItem.action || session.action) === "Transporte") {
                msg = finalMessages[0]; 
            } else if ((singleItem.action || session.action) === "Alquilar") {
                msg = finalMessages[0];
            } else {
                const qtyStr = (Number(singleItem.quantity) || Number(session.quantity) || 1) > 1 ? `${(Number(singleItem.quantity) || Number(session.quantity) || 1)} ` : "";
                const qtyPluralS = (Number(singleItem.quantity) || Number(session.quantity) || 1) > 1 ? "s" : "";
                const qtyPluralES = (Number(singleItem.quantity) || Number(session.quantity) || 1) > 1 ? "es" : "";
                const condLabel = lang === "EN" ? ((singleItem.condition || session.condition || "Usado") === "Nuevo" ? "New" : "Used") : (singleItem.condition || session.condition || "Usado");
                let typeLabel = (singleItem.type || session.type || "Dry") === "Dry" ? "" : (singleItem.type || session.type || "");
                const displaySize = (singleItem.size || session.size) ? (singleItem.size || session.size).replace(" STD", "") : "";
                
                msg = dictCurrent.price_sale
                    .replace("{qty}", qtyStr)
                    .replace(/{qty_plural_s}/g, qtyPluralS)
                    .replace(/{qty_plural_es}/g, qtyPluralES)
                    .replace("{cond}", condLabel)
                    .replace("{type}", typeLabel)
                    .replace("{size}", displaySize)
                    .replace("{zip}", session.zip)
                    .replace("{price}", fmt(finalTotalPrice));
            }
        } else {
            msg = (lang === "EN" ? `Here are the prices delivered to ${session.zip}:\n\n` : `Aquí tienes los precios con entrega al código postal ${session.zip}:\n\n`);
            msg += finalMessages.join("\n");
            
            const isExportGlobal = session.action === "Exportación" || session.action === "Exportacion";
            if (isExportGlobal) {
                msg += "\n\n" + dictCurrent.export_final_msg;
            }
        }
        
        msg = msg.replace(/ +/g, " ");
        
        const allUsedDry = itemsToQuote.every((item: any) => 
            (!(item.condition || session.condition) || (item.condition || session.condition) === "Usado") && 
            (!(item.type || session.type) || (item.type || session.type) === "Dry")
        );

        if ((session.action === "Comprar" || (!session.action && itemsToQuote[0]?.action === "Comprar")) && allUsedDry) {
            const disclaimer = lang === "EN" 
                ? "\n\n*(Note: Quotation based on Used Standard Dry containers for local storage. If you need Refrigerated, New, or Export containers, please let me know and I will adjust the price!)*"
                : "\n\n*(Nota: Cotización basada en contenedores Secos Usados para almacenamiento local. Si buscas contenedores Refrigerados, Nuevos o para Exportación, por favor indícamelo y ajustaré el precio)*";
            msg = msg + disclaimer;
        }

        if (extracted.ai_reply) {
            msg = extracted.ai_reply + "\n\n" + msg;
        }

        const historyAfterQuote = [...(session.history || [])];
        historyAfterQuote.push({ role: "assistant", content: msg });
        await updateSession(senderId, { step: 6, final_amount: finalTotalPrice, history: historyAfterQuote.slice(-10) });

        actions.push({ type: "quick_replies", text: msg, options: dictCurrent.proceed_btns });
        return actions;
    } catch (e) {
        console.error("Quote error:", e);
        actions.push({ type: "text", text: dictCurrent.calc_error });
        return actions;
    }
}

async function processMessage(senderId: string, messageText: string, isHuman: boolean = false): Promise<Action[]> {
    const session = await getSession(senderId);

    if (session.is_processing) {
        if (messageText.toLowerCase().trim() === "reiniciar") {
            await updateSession(senderId, { is_processing: false, queued_messages: [] });
        } else {
            const queue = session.queued_messages || [];
            queue.push(messageText);
            await updateSession(senderId, { queued_messages: queue });
            return [];
        }
    }

    await updateSession(senderId, { is_processing: true, queued_messages: [] });
    
    let actions: Action[] = [];
    try {
        actions = await processMessageInner(senderId, messageText, isHuman);
    } catch (e) {
        console.error("Inner Error:", e);
    } finally {
        // Check queue
        const currentSession = await getSession(senderId);
        const queue = currentSession.queued_messages || [];
        if (queue.length > 0) {
            const combinedQueueMessage = queue.join(" | ");
            await updateSession(senderId, { queued_messages: [] });
            try {
                const extraActions = await processMessageInner(senderId, combinedQueueMessage, false);
                actions.push(...extraActions);
            } catch(e) {
                console.error("Error processing queue:", e);
            }
        }
        await updateSession(senderId, { is_processing: false });
    }
    return actions;
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
