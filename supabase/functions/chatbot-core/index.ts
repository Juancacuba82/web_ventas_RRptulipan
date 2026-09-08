import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Action { type: string; text?: string; options?: string[]; }

function mapCallLanguage(lang?: string | null): "ENGLISH" | "SPANISH" {
    const raw = (lang || "").toString().trim().toLowerCase();
    return raw.startsWith("es") ? "SPANISH" : "ENGLISH";
}

function scoreLanguage(text: string): { es: number; en: number } {
    const lo = (text || "").toLowerCase();
    let es = 0;
    let en = 0;

    const esRe = /\b(busco|busca|buscar|necesito|necesitamos|quiero|queremos|quisiera|hola|gracias|contenedor|contenedores|cotizaci[oó]n|precio|cu[aá]nto|comprar|alquilar|rentar|renta|mover|transporte|transportar|usado|nuevo|vac[ií]o|cargado|lleno|s[ií]|por favor|entrega|entregar|proceder|exportaci[oó]n|flexible|inmediato|pies|español|espanol|tengo|tienen|hacen|pueden|uno|una|dos|tres|cuatro|para|desde|hasta|terreno|patio|env[ií]o|tambi[eé]n|me|mi|tu|su|del|al|el|la|los|las|estoy|est[aá]|ser[ií]a|podr[ií]an|d[ií]game|dime|ayuda|ayudar)\b/gi;
    const enRe = /\b(hello|hi|thanks|thank you|need|looking|want|container|containers|quote|price|how much|buy|rent|transport|move|moving|used|new|empty|loaded|delivery|deliver|proceed|export|flexible|immediate|feet|english|yes|please|one|two|three|four|can you|do you|yard|lot|ship|help|would|could|also|your|my|the|this|that|looking for|i need|i want)\b/gi;

    const esMatches = lo.match(esRe);
    const enMatches = lo.match(enRe);
    if (esMatches) es += esMatches.length;
    if (enMatches) en += enMatches.length;
    if (/[áéíóúñ¿¡]/.test(lo)) es += 2;

    return { es, en };
}

/** Detect language from the latest message; inherit from session/history when ambiguous (zip, 20', buttons). */
function isLanguageNeutralInput(input: string): boolean {
    const lo = (input || "").trim().toLowerCase();
    if (!lo) return true;
    if (/^\d{5}$/.test(lo)) return true;
    const neutral = new Set([
        "used", "new", "nuevo", "usado", "one trip", "one-trip", "brand new",
        "20'", "40'", "45'", "20' hc", "20 hc", "20ft hc",
        "comprar", "buy", "alquilar", "rent", "transporte", "transport",
        "flexible", "inmediato", "immediate", "dry", "dry (estándar)", "dry (standard)",
        "refrigerado", "refrigerated", "funcionando", "working", "no funcionando", "not working",
        "vacío", "vacio", "empty", "cargado", "loaded", "lleno", "full",
        "cargado <14k", "loaded <14k", "cargado >14k", "loaded >14k",
        "exportación", "export", "almacenamiento", "storage",
        "sí, proceder", "si, proceder", "yes, proceed", "proceed", "proceder",
        "cotizar hc usado", "quote used hc", "cotizar hc", "quote hc",
        "cotizar 20' std", "cotizar 20 std", "quote 20' std", "quote 20 std",
        "yes", "sí", "si", "ok", "okay", "ok.", "vale", "perfecto",
    ]);
    return neutral.has(lo);
}

function detectMessageLanguage(input: string, sessionLang?: string | null, history?: any): "EN" | "ES" {
    const trimmed = (input || "").trim().toLowerCase();
    if (["español", "espanol", "es"].includes(trimmed)) return "ES";
    if (["english", "en"].includes(trimmed)) return "EN";

    if (!isLanguageNeutralInput(input)) {
        const current = scoreLanguage(input);
        if (current.es > current.en) return "ES";
        if (current.en > current.es) return "EN";
    }

    if (Array.isArray(history)) {
        for (let i = history.length - 1; i >= 0; i--) {
            const h = history[i];
            if (h?.role !== "user" || !h.content) continue;
            const s = scoreLanguage(h.content);
            if (s.es > s.en) return "ES";
            if (s.en > s.es) return "EN";
        }
    }

    return sessionLang === "ES" ? "ES" : "EN";
}

// ─── DICCIONARIO DE TEXTOS ESTÁTICOS ─────────────────────────────────────────
const chatDict: Record<string, any> = {
    "ES": {
        step1_msg: "¡Hola! Bienvenido a **RP Tulipan**. Soy tu asesor logístico — con gusto te ayudo.\n\nPara ofrecerte un precio exacto, primero necesito saber qué servicio buscas: **¿comprar**, **alquilar** o **transporte** de un contenedor?",
        step1_btns: ["Comprar", "Alquilar", "Transporte"],
        step3_size_msg: "Perfecto. Ahora indícame qué medida necesitas.",
        step3_size_msg_rent: "Para renta, ¿qué medida necesitas? El **20'** es el más popular para patio o terreno; el **40'** si necesitas más espacio.",
        step3_size_msg_transport: "¿Qué medida tiene el contenedor que vamos a mover?",
        step3_size_btns: ["20'", "40'", "45'"],
        calculating: "Calculando precio exacto... ⏳",
        ask_zip: "¿Cuál es tu código postal (Zip Code) de 5 dígitos para la entrega?",
        no_stock: "Lo siento, pero parece que en este momento no tenemos disponibilidad de esa medida o tipo de contenedor en tu área. ¿Te gustaría que cotice un tamaño diferente?",
        no_20hc: "Por ahora no cotizamos contenedores de 20' High Cube (ni usados ni nuevos). Los de 20' que sí tenemos son Standard (8'6\" de alto). ¿Te cotizo un 20' STD?",
        hc_stock_disclaimer: "\n\n*Precio de referencia — debemos confirmar stock; el 20' HC no lo tenemos siempre disponible como el STD.*",
        price_20hc_used_miami_only: "El 20' HC usado (**{price}**) solo está disponible con entrega desde nuestro hub de **Miami**. Para el ZIP {zip}, podemos seguir con tu cotización STD o coordinar desde Miami.",
        hc_stock_handoff_intro: "Perfecto. Para confirmar si hay **20' HC {cond}** disponible en tu zona (ZIP {zip}), un especialista del equipo te contactará — yo no veo inventario en tiempo real.\n\n¿Cuál es tu **nombre completo**?",
        hc_stock_done: "¡Listo! Registré tu solicitud de stock para **20' HC {cond}**. Un especialista te contactará pronto por teléfono o WhatsApp para confirmar disponibilidad. Tu cotización del STD sigue vigente si quieres proceder.",
        hc_stock_repeat_short: "Ya te compartí los precios de referencia del 20' HC. Para confirmar **stock real**, necesito pasarte con un especialista. ¿Me das tu **nombre completo** para que te contacten?",
        hc_used_far_miami_warn: "El **20' HC usado** solo lo tenemos en nuestro hub de **Miami**. Entregarlo al ZIP **{zip}** implica un flete largo desde Miami y el total suele ser **más elevado** que un 20' STD.\n\n¿Prefieres que te cotice un **20' STD**, o igual quieres el precio del HC usado **con flete incluido**?",
        hc_used_far_miami_btns: ["Cotizar HC usado", "Cotizar 20' STD"],
        no_45_new: "Por ahora no tenemos contenedores de 45' HC nuevos (one-trip) en stock en tu área. Sí manejamos 45' usados WWT. ¿Te gustaría proceder con el usado o cotizamos otro tamaño?",
        no_45_new_with_used: "Por ahora no tenemos 45' HC nuevos (one-trip) en stock. El precio del usado entregado en {zip} sigue siendo **{price}** (contenedor + flete). ¿Te gustaría proceder con el usado?",
        no_new_for_size: "Por ahora no tenemos contenedores {size} nuevos (one-trip) en stock en tu área. ¿Te gustaría cotizar otro tamaño o la versión usada?",
        calc_error: "Error calculando. Escribe 'reiniciar'.",
        ask_export_type: "¿Para qué usarás el contenedor? (Almacenamiento o Exportación)",
        ask_export_btns: ["Almacenamiento", "Exportación"],
        ask_export_buy_rent: "Para exportación solo vendemos el contenedor certificado (no lo alquilamos). Continuemos con la compra.",
        ask_export_buy_rent_btns: ["Comprar"],
        ask_export_zip: "¿Cuál es tu código postal de 5 dígitos en EE.UU.? Lo usamos para ubicar el depósito más cercano. La entrega a ese ZIP no está incluida en el precio; es por si más adelante quieres que te lo entreguemos.",
        ask_export_port: "¿A qué puerto y país de destino enviaremos el contenedor? (Ej. Mariel, Cuba)",
        export_buy_price: "El precio de venta del contenedor es **{price}** (incluye certificado de exportación válido por 1 año recogido en nuestro patio). Nosotros no hacemos envíos marítimos, pero ofrecemos el transporte terrestre nacional: te lo llevamos vacío para cargar y luego lo llevamos cargado al puerto en EE.UU. Si haces ambos traslados con nosotros, te descontamos ${discount}. ¿Te cotizamos este transporte (indícanos el Zip Code del puerto) o prefieres proceder solo con la compra?",
        export_rent_msg: "",
        export_final_msg: "¡Excelente! Ya tenemos toda la información. Por favor, escribe tu nombre completo para que un especialista te llame con la cotización final exacta.",
        ask_condition: "Perfecto. ¿Lo quieres **usado (WWT)** o **nuevo one-trip**?",
        ask_condition_btns: ["Nuevo", "Usado"],
        ask_type: "¿Qué tipo de contenedor buscas?",
        ask_type_btns: ["Dry (Estándar)", "Refrigerado"],
        ask_reefer_status: "¿Lo necesitas con el motor de refrigeración Funcionando o No Funcionando?",
        ask_reefer_status_btns: ["Funcionando", "No Funcionando"],
        proceed_btns: ["Sí, proceder"],
        ask_proceed_short: "Cuando quieras, toca Proceder o escribe tu nombre. Si tienes otra duda, escríbela.",
        ask_service_short: "¿Buscas comprar, alquilar o transporte?",
        step5_zip_msg: "¿Cuál es tu código postal (Zip Code) de 5 dígitos para la entrega?",
        ask_name: "¡Excelente! Por favor, escribe tu nombre completo para iniciar la orden.",
        ask_phone: "Gracias, {name}. Ahora, por favor escribe tu número de teléfono de contacto.",
        order_done: "¡Perfecto! Hemos recibido tu solicitud. Un agente te contactará en breve por teléfono o WhatsApp para finalizar los detalles. ¡Que tengas un gran día!",
        ask_transport_details: "Para darle una cotización exacta de transporte, por favor indíquenos los siguientes detalles:\n\n1. Código postal de recogida y de entrega (si ambos comparten el mismo código postal, por favor ingréselo dos veces con un espacio de separación).\n2. ¿El contenedor está vacío, cargado con menos de 14,000 lbs, o cargado con más de 14,000 lbs?\n\nUna vez tengamos esta información, ¡le daremos el precio de inmediato!",
        ask_transport_zips: "Perfecto. Ahora necesito el código postal de 5 dígitos de recogida y el de entrega. Si es el mismo lugar, escríbelo dos veces separado por un espacio (ej. 33139 33139).",
        ask_transport_load: "¿Cómo está el contenedor?\n\n• Vacío\n• Cargado con menos de 14,000 lbs\n• Cargado con más de 14,000 lbs",
        ask_load_btns: ["Vacío", "Cargado <14k", "Cargado >14k"],
        price_transport: "El precio por mover tu{qty_plural_s} {qty}contenedor{qty_plural_es} de {size} ({load}) desde el Zip {origin} hasta el Zip {dest} es:\n\n🔹 Flexible (En Ruta): **{price}**\nCuando uno de nuestros camiones esté cerca del lugar de recogida.\n\n🔹 Inmediato (Desde {yard}): **{immed}**\nMandamos un camión desde nuestro patio para moverlo lo antes posible.{crane_note}\n\n¿Cuál opción prefieres?",
        price_transport_single: "El precio por mover tu{qty_plural_s} {qty}contenedor{qty_plural_es} de {size} ({load}) desde el Zip Code {origin} hasta el Zip Code {dest} es de **{price}**.\n\n¿Te gustaría proceder?",
        transport_option_btns: ["Flexible", "Inmediato"],
        human_handoff: "Veo que su solicitud requiere logística especial. Nuestro especialista en ventas revisará los detalles y le responderá por este mismo chat en breve. Por favor, espere en línea.",
        price_rent: "¡Excelente noticia! Tenemos disponibilidad para renta en {zip}.\n\n🔹 Renta Mensual: {monthly}\n🔹 Logística (Entrega y Recogida futura): {logistics} (pago único)\n\nEl pago inicial sería de {price}. ¿Proceder?",
        price_export: "Perfecto. El precio total por el contenedor es de **{price}**. ¿Te gustaría proceder con la compra?",
        price_sale: "El precio total por {qty}contenedor{qty_plural_es} {cond} {type} {size} entregado{qty_plural_s} en {zip} es **{price}** (contenedor + flete, sin cargos ocultos).\n\n¿Te gustaría proceder?",
        price_sale_upsell_new: "\n\nSi prefieres one-trip nuevo, con gusto te lo cotizo también.",
        faq_prompt: "\n\n*(Por favor responde la pregunta anterior o toca un botón para continuar con tu cotización)*",
        fallback: "Para darte un precio exacto, dime qué medida de contenedor necesitas (ej. 20 o 40 pies) y tu Zip Code de entrega.",
    },
    "EN": {
        step1_msg: "Hi! Welcome to **RP Tulipan** — I'm your logistics advisor and I'm here to help.\n\nTo give you an exact price, I first need to know what you need: **buy**, **rent**, or **transport** a container?",
        step1_btns: ["Buy", "Rent", "Transport"],
        step3_size_msg: "Perfect. Now, please let me know what size you need.",
        step3_size_msg_rent: "For rent, what size do you need? **20'** is most popular for yard storage; **40'** if you need more space.",
        step3_size_msg_transport: "What size is the container we would be moving?",
        step3_size_btns: ["20'", "40'", "45'"],
        calculating: "Calculating exact price... ⏳",
        ask_zip: "What is your 5-digit delivery Zip Code?",
        no_stock: "I'm sorry, but it looks like we currently don't have stock for that specific container size or type in your area. Would you like me to quote a different size?",
        no_20hc: "We don't currently quote 20' High Cube containers (used or new). The 20' units we do have are Standard height (8'6\" tall). Would you like a quote for a 20' STD?",
        hc_stock_disclaimer: "\n\n*Reference price — we must confirm stock; 20' HC is not always available like STD.*",
        price_20hc_used_miami_only: "Used 20' HC (**{price}**) is only available for delivery from our **Miami** hub. For ZIP {zip}, we can continue with your STD quote or coordinate from Miami.",
        hc_stock_handoff_intro: "Got it. To confirm **{cond} 20' HC** availability for ZIP {zip}, a specialist will reach out — I don't have live inventory.\n\nWhat's your **full name**?",
        hc_stock_done: "Done! I've logged your **{cond} 20' HC** stock request. A specialist will contact you soon by phone or WhatsApp to confirm availability. Your STD quote is still valid if you'd like to proceed.",
        hc_stock_repeat_short: "I already shared the 20' HC reference prices. To confirm **actual stock**, I'll connect you with a specialist. What's your **full name** so they can reach you?",
        hc_used_far_miami_warn: "**Used 20' HC** is only available from our **Miami** hub. Delivering to ZIP **{zip}** means a long haul from Miami and a **higher total** than a 20' STD.\n\nWould you prefer a **20' STD** quote, or still want the used HC price **with delivery included**?",
        hc_used_far_miami_btns: ["Quote used HC", "Quote 20' STD"],
        no_45_new: "We don't currently have brand-new 45' HC (one-trip) containers in stock for your area. We do have used WWT 45' units. Would you like to proceed with used, or quote a different size?",
        no_45_new_with_used: "We don't currently have brand-new 45' HC (one-trip) in stock. The used unit delivered to {zip} is still **{price}** (container + delivery). Would you like to proceed with used?",
        no_new_for_size: "We don't currently have brand-new {size} (one-trip) containers in stock for your area. Would you like a different size or the used version?",
        calc_error: "Calculation error. Type 'restart'.",
        ask_export_type: "What will you use the container for? (Storage or Export)",
        ask_export_btns: ["Storage", "Export"],
        ask_export_buy_rent: "For export we only sell the certified container (we do not rent it). Let's continue with the purchase.",
        ask_export_buy_rent_btns: ["Buy"],
        ask_export_zip: "What is your 5-digit U.S. Zip Code? We use it to find the nearest depot. Delivery to that ZIP is not included in the price; it is in case you later want us to deliver the container.",
        ask_export_port: "What is the destination port and country for the container? (e.g., Kingston, Jamaica)",
        export_buy_price: "The sale price of the container is **{price}** (includes export certificate valid for 1 year, picked up at our yard). We do not offer maritime shipping, but we provide inland transport: we deliver it empty for loading and then take it loaded to the US port. If you do both transports with us, we give you a ${discount} discount. Shall we quote this transport (provide the Port Zip Code) or do you prefer to proceed with just the purchase?",
        export_rent_msg: "",
        export_final_msg: "Excellent! We have all the information. Please enter your full name so a specialist can call you with the exact final quote.",
        ask_condition: "Great. Do you want **used (WWT)** or **brand-new one-trip**?",
        ask_condition_btns: ["New", "Used"],
        ask_type: "What type of container are you looking for?",
        ask_type_btns: ["Dry (Standard)", "Refrigerated"],
        ask_reefer_status: "Do you need the refrigeration motor Working or Not Working?",
        ask_reefer_status_btns: ["Working", "Not Working"],
        proceed_btns: ["Yes, proceed"],
        ask_proceed_short: "Whenever you're ready, tap Proceed or send your name. If you have another question, just type it.",
        ask_service_short: "Are you looking to buy, rent, or transport?",
        step5_zip_msg: "What is your 5-digit delivery Zip Code?",
        ask_name: "Excellent! Please enter your full name to start the order.",
        ask_phone: "Thank you, {name}. Now, please enter your contact phone number.",
        order_done: "Perfect! We have received your request. An agent will contact you shortly by phone or WhatsApp to finalize the details. Have a great day!",
        ask_transport_details: "To give you an accurate transportation quote, please provide us with the following details:\n\n1. Pickup and delivery zip codes (if both locations share the same zip code, please enter it twice with a space in between).\n2. Is the container empty, loaded under 14,000 lbs, or loaded over 14,000 lbs?\n\nOnce we have this info, we’ll get back to you with pricing right away!",
        ask_transport_zips: "Perfect. Now I need the 5-digit pickup zip code and the delivery zip code. If both places share the same zip, enter it twice with a space (e.g. 33139 33139).",
        ask_transport_load: "How is the container loaded?\n\n• Empty\n• Loaded under 14,000 lbs\n• Loaded over 14,000 lbs",
        ask_load_btns: ["Empty", "Loaded <14k", "Loaded >14k"],
        price_transport: "The price to move your {qty} {size} ({load}) container{qty_plural_s} from Zip {origin} to Zip {dest} is:\n\n🔹 Flexible (En Route): **{price}**\nWhen one of our trucks is already near the pickup location.\n\n🔹 Immediate (From {yard}): **{immed}**\nWe dispatch a truck from our yard to move it as soon as possible.{crane_note}\n\nWhich option do you prefer?",
        price_transport_single: "The price to move your {qty} {size} ({load}) container{qty_plural_s} from Zip Code {origin} to Zip Code {dest} is **{price}**.\n\nWould you like to proceed?",
        transport_option_btns: ["Flexible", "Immediate"],
        human_handoff: "I see your request requires special logistics. Our sales specialist will review the details and reply to you in this chat shortly. Please wait online.",
        price_rent: "Great news! We have availability to rent to {zip}.\n\n🔹 Monthly Rent: {monthly}\n🔹 Logistics (Delivery & future pickup): {logistics} (one-time fee)\n\nInitial payment would be {price}. Proceed?",
        price_export: "Perfect. The total price for the container is **{price}**. Would you like to proceed?",
        price_sale: "The total price for {qty}{cond} {type} {size} container{qty_plural_s} delivered to {zip} is **{price}** (container + delivery, no hidden fees).\n\nWould you like to proceed?",
        price_sale_upsell_new: "\n\nIf you'd prefer a brand-new one-trip unit, I'm happy to quote that too.",
        faq_prompt: "\n\n*(Please answer the previous question or tap a button to continue with your quote)*",
        fallback: "To give you an exact price right away, please tell me what container size you need (e.g. 20 or 40 ft) and your delivery Zip Code.",
    }
};

// ─── PROMPT MAESTRO: AGENTE DE VENTAS EXPERTO ────────────────────────────────
const MASTER_PROMPT = `You are "Tulip", an expert sales assistant for RP Tulipan — a shipping container company based in Florida, USA. You sell, rent, and transport used and new ISO shipping containers (20ft, 40ft, 45ft), including Dry, Reefer (refrigerated), Open Side, and Double Door types.

Your personality: Professional, friendly, and direct. You speak in the same language the customer uses (English or Spanish).

HOW TO THINK BEFORE YOU ANSWER (read this first, every single turn):
1. RE-READ THE WHOLE CONVERSATION before replying. Check what was already asked, already answered, and already quoted in CURRENT SESSION STATE. Never answer a question the customer did not ask.
2. IDENTIFY WHAT THE CUSTOMER ACTUALLY MEANT in their LAST message. Spanish "no" at the start is often a correction of your previous message, NOT a complaint about prices. Examples:
   - "no está bien, quiero el de 40' usado pero sin filtraciones" = they ACCEPT and CHOOSE the used 40'; they are asking for reassurance about leaks (WWT). Do NOT talk about wrong prices. Confirm WWT and offer to move forward.
   - "está bien" / "ok" / "perfecto" = acknowledgment, not a question.
   - "¿los nuevos son más caros?" = they want the NEW price → intent "quote" with condition "Nuevo" so the system calculates it. NEVER state a new price yourself.
3. WE ONLY OFFER 3 SERVICES: SALE (Comprar), RENT (Alquilar), and TRANSPORT (Transporte) of containers. Everything you say must fit one of those three. We are not a shipping line and we do not do ocean freight.
4. BE THE EXPERT. You know this market: container types (Dry, Reefer, Open Side, Double Door), conditions (One-Trip / WWT used), sizes, delivery logistics with crane/flatbed, and hub availability across Florida and Georgia. Answer with real substance and confidence, never vague filler.
5. NEVER STATE, ESTIMATE, GUESS, OR REPEAT A DOLLAR AMOUNT that is not listed in CURRENT SESSION STATE. This is the most important rule. If the customer asks any price you do not already have there, set intent "quote" and leave ai_reply null so the system calculates it from the database. Do NOT use the 20' HC reference prices for any other size or type.

WHAT WE SELL (facts — never make anything up):
- SIZES: 20ft Standard (8'6" / STD), 40ft (Standard and High Cube), 45ft High Cube. A regular 20' is NOT a High Cube. We do NOT stock 10ft (it must be custom-cut from a 20ft and costs MORE) — recommend the 20ft instead, it's cheaper and ready to go.
- 20' HIGH CUBE: rarely in stock. Reference prices are Used $2,900 (Miami hub only) and New $4,450 (any hub), and stock must always be confirmed. Never claim we have brand-new 20' HC.
- 40' USED: we have BOTH STD and HC at the EXACT SAME PRICE.
- 45': ONLY Dry and ONLY High Cube. Never ask a 45' customer about Reefer or Open Side.
- CONDITIONS: brand new (One-Trip) is available in 20ft STD, 40ft and 45ft — NEVER say we don't have new 20' STD / 40' / 45'. Used containers are all Wind & Water Tight (WWT): structurally sound, no leaks, doors seal properly, hardwood or bamboo floors in good structural condition.
- TYPES: Dry, Reefer, Open Side, Double Door. Reefers come Working (functional), Not Working (no AC), or brand new. Open Side and Double Door are ONLY brand new and ONLY in 20ft and 40ft — never offer 45ft for them.
- REEFER POWER: they run on 440V 3-phase (440V trifásica). We also sell transformers that convert 220V to 440V: Used $2,500, New $3,000.

COMPANY FACTS:
- PAYMENT: on delivery or pickup (COD) we ONLY accept Cash or Zelle. Credit Card or Check MUST be paid in full BEFORE the driver leaves our yard. NO financing.
- DELIVERY TIME: 1-3 business days after order confirmation.
- PRICING POLICY: ads show the container price at the port only; delivery varies by zip distance, so we cannot advertise one price. Our quote is FINAL: container + flatbed delivery, no hidden fees. Prices are already the lowest wholesale port prices with zero hidden margins — there are NO additional discounts of any kind, including military, senior, veteran, and first responder.
- GUARANTEES: NEVER mention or offer a guarantee unless the customer explicitly asks. If they ask: we offer ONLY a 6-month Wind and Water Tight structural guarantee on used containers, and NO other guarantee.
- LOCATIONS/HUBS: distribution centers in Miami, Tampa, Titusville, Jacksonville, Savannah, and Atlanta. Main office: 8500 NW 87 Ave, Miami, FL 33166. WHENEVER you give the office address, you MUST also say they need to call first to schedule an appointment so they don't find the office closed.
- CONTACT: 786-768-4409 | 786-736-6288 — rptulipantransport@gmail.com. You ARE authorized to give these out when they ask for a phone number, want to call us, or want a human. Never refuse. BUT if they say "call me" / "llámame" or tell you when to call them, do NOT give our numbers — just acknowledge warmly and say an agent will contact them.
- PHOTOS POLICY: we cannot send the exact unit now (port stacks move constantly). On delivery day the driver sends photos of the exact container and waits for the customer's approval before driving to their property. Never invent that you can email or WhatsApp photos of the exact unit now.
- EXPORT: we DO provide containers for international export (Puerto Rico, Cuba, Bahamas, etc.). We ONLY SELL the certified container (export certificate valid 1 year). We do NOT rent for export, the sale price does NOT include delivery to their ZIP, and we do NOT offer maritime shipping. The US ZIP is only to locate the nearest depot in case they later want delivery (quoted separately). If they ask to rent for export, explain warmly that for export we only sell the certified container and rentals are for storage inside the US only.
- TRANSPORT (moving a container the customer ALREADY OWNS): this is NOT a purchase or rental. Never ask New vs Used, Dry vs Reefer, or what size they "need" — they already have it. We need what size it IS (20/40/45), the 5-digit origin zip, the destination zip, and the load status (Empty / Loaded under 14,000 lbs / Loaded over 14,000 lbs). A city name is NOT a zip code.
- UNLOADING TO THE GROUND: YES, we lower the container directly onto the ground with our specialized crane equipment on our trailers.

SLANG THAT IS EASY TO MISREAD:
- "one trip" / "one-trip" / "on trip" / "1 trip" → industry term for a BRAND NEW container (one voyage from the factory). ALWAYS condition "Nuevo", never "Usado".
- "wwt" / "wind water tight" / "cargo worthy" / "cw" / "water tight" / "no leaks" → used-condition quality wording → answer with our WWT info.
- "need closer" / "can you do better" / "bottom line" / "best price" / "lowest" / "closer deal" / any discount request → they want a price reduction → explain our pricing policy warmly.
- "pick up" / "retirar" / "lo retiro yo" / "buscar" / "recoger" → they want to collect it themselves. Use intent "general_chat" and output EXACTLY this in ai_reply: (EN) "If you prefer to pick up the container yourself at our yard, please call us at 786-768-4409." (ES) "Si prefiere retirarlo usted mismo en nuestro patio, por favor llámenos al 786-768-4409." Do NOT change the action.

OUTPUT: You MUST output a valid JSON object with NO markdown, NO code blocks, NO extra text:
{
  "intent": "quote" | "general_chat" | "cancel" | "proceed" | "photos" | "dimensions" | "provide_info",
  "lang": "EN" | "ES", // CRITICAL: This MUST match the exact language the customer used in their VERY LAST message. If they spoke Spanish, output "ES".
  "extracted_data": {
    "items": [
      {
        "action": "Comprar" | "Alquilar" | "Transporte" | "Exportacion" | null,
        "export_action": "Comprar" | null,
        "condition": "Nuevo" | "Usado" | null,
        "type": "Dry" | "Reefer" | "Open Side" | "Double Door" | null,
        "size": "20' STD" | "20' HC" | "40'" | "40' STD" | "40' HC" | "45' HC" | null,
        "quantity": number | null,
        "reefer_status": "Funcionando" | "No Funcionando" | null,
        "load_status": "Vacio" | "Cargado_Under14000" | "Cargado_Over14000" | null,
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

INTENT RULES (pick exactly one):
- "quote" → they are giving new data (size, zip, condition, quantity) or asking for ANY price that is not already in CURRENT SESSION STATE. Leave ai_reply null so the system sends the exact number; never write filler like "I'll get you a quote shortly". A short "Yes" is fine if they also asked a yes/no question. Specific cases: if they need to MOVE/haul a container they already own, action MUST be "Transporte" (never ask if they want to buy or rent); if the container is going to another country, action MUST be "Exportacion"; if they explicitly ORDER a 20' HC, size "20' HC".
- "general_chat" → any question that is not a request for a new price: quality, payment, guarantees, discounts, delivery time, logistics, technical questions, size or condition comparisons, and doubts about prices you already quoted. Write a natural 2-5 sentence ai_reply like an experienced salesperson. You MAY reference prices listed in CURRENT SESSION STATE, and no other number. Never repeat the quote template, and don't tack "¿Proceder?" onto every answer — only mention it when it fits naturally.
- "proceed" → they clearly confirm the order AFTER receiving a final price (sí proceder, yes proceed, let's do it, I'll take it, listo, adelante, lo quiero, confirmo). Never for questions, and never for a lone "yes"/"si" that answers a different question. If they agree but change the quantity at the same time, use "quote" so the price is recalculated.
- "cancel" → they clearly want to stop (bye, no thanks, not interested, too expensive, I'll think about it, shopping around). NEVER for "ok" / "okay" / "vale" / "perfecto" / a thumbs-up — those are acknowledgments, use general_chat and invite them to proceed or ask something else. If they thanked you, reply "¡De nada!" / "You're welcome!"; if they just said goodbye, "¡Gracias!" / "Thank you!".
- "photos" → their FIRST request for photos, pictures, images, gallery, or to see the unit before buying. Leave ai_reply null; the system sends the full policy and gallery. If that policy is ALREADY in this conversation, use "general_chat" with a short warm reply (2-4 sentences): acknowledge you already explained it, reassure them the driver sends photos of the exact unit on delivery day and waits for their approval, and ask if they want to proceed. Sound like a person, not a script, and don't repeat the long message or the gallery link unless they ask for the link.
- "dimensions" → their FIRST request for exact dimensions, measurements, length, width, or height. NOT for delivery time ("how long"). If already sent in this conversation, use "general_chat".
- "provide_info" → they are giving their name or phone number.

FIRST CONTACT: if they have NOT chosen buy/rent/transport yet and ask for prices ("precios?", "how much", "quiero saber los precios"), use "general_chat" with a warm, welcoming ai_reply: greet them even if they didn't say hello, explain briefly that you need to know the service first, and ask whether they want to buy, rent, or transport a container. Sound like a real salesperson, never a cold generic greeting. Leave button labels to the system.

CONVERSATION RULES:
- Leave ai_reply null ONLY when the system must show a structured prompt (ZIP field, condition buttons, size chips) or the intent is photos/dimensions. Otherwise, if they asked something, answer it in ai_reply — even when the intent is "quote" or "proceed".
- NEVER accuse the customer of saying something they did not say. Do not defend your prices unless they actually questioned them. If they picked a size or condition, confirm that choice and answer whatever they asked alongside it.
- PRICE DOUBTS / SIZE COMPARISONS (e.g. "el 40' es más barato, ¿está mal?") → "general_chat". Explain honestly and do NOT re-quote. For used reefers a 20' CAN cost more than a 40' because 20' units are scarcer in inventory and delivery economics differ; that is normal.
- CONDITION COMPARISONS ("is used cheaper?", "el usado es más barato no?") → "general_chat", and do NOT extract a condition from that question. But "¿los nuevos son más caros?" is a request for the NEW price → "quote" with condition "Nuevo" and ai_reply null.
- NEVER assume Used or New for a purchase or rent. If they didn't say it, leave condition null and let the system ask.
- RENT FLOW: the system asks SIZE first (20'/40'/45'), then Used vs New, then ZIP. Never skip size. If they ask something else mid-flow, use "general_chat" and answer it while the system keeps collecting the missing fields.
- EXPORT FLOW: when they first ask for export, do NOT ask for the port zip code. The system asks for the US zip to locate the nearest depot and quotes the container first. ONLY after they received that quote AND explicitly ask to add inland transport (empty drop for loading and/or loaded to a US port) should you ask for the zip and store it in port_dest.
- TRANSPORT FLOW: when you are only collecting missing fields, leave ai_reply null so the system asks with the correct wording. Only write ai_reply if they also asked a side question (payment, timing, crane).
- 20' HC QUESTIONS: if they ask whether a 20' is HC or whether we have HC ("es HC?", "is it high cube?", "tienen HC?"), do NOT extract size "20' HC" — use "general_chat" with ai_reply null and the system explains STD vs HC. NEVER answer "yes" to 20' HC availability.
- 40' HC QUESTIONS: if they ask whether a 40' used is HC or STD, or say "este de 40 es HC", explain we have BOTH at the exact same price and extract size "40' HC".
- REEFER TECHNICAL DETAILS: if they ask technical questions about reefers such as the year or the data sheet, the FIRST time you MUST reply exactly with this message in ai_reply depending on the language:
  English: "Great question! Since technical details (year, data sheet, etc.) vary depending on the exact unit we have in the yard, I suggest speaking with our sales team to get precise information. You can call us right now at +1 (786) 768-4409 or +1 (786) 736-6288 and a specialist will help you immediately."
  Spanish: "¡Excelente pregunta! Como los detalles técnicos (año, ficha técnica, etc.) varían dependiendo de la unidad exacta que tenemos en el patio, te sugiero hablar con nuestro equipo de ventas para darte la información precisa. Puedes llamarnos ahora mismo al +1 (786) 768-4409 o al +1 (786) 736-6288 y un especialista te ayudará de inmediato."
  If you already sent that full message in this conversation, do NOT paste it again. Reply briefly in your own words, keep the same phone numbers, and ask if they want you to have a specialist call them.
- REEFER POWER / TRANSFORMERS: voltage or current questions → 440V 3-phase (440V trifásica). If they don't have 440V or ask about transformers, we sell 220V-to-440V transformers (Used $2,500, New $3,000). Use "general_chat" for these unless they are also asking for container prices.
- UNLOADING TO THE GROUND / CRANE DELIVERY: if they ask whether we can put the container on the ground/floor, or "can you unload this yourself?", ALWAYS answer YES. The FIRST time you MUST reply exactly with this message in ai_reply depending on the language:
  English: "Yes, we can leave the container directly on the ground. We deliver and lower the container using our specialized crane equipment on our trailers. I invite you to see how our crane works here:\n\nWith our side crane: https://www.youtube.com/shorts/wdqOKA2CFwE\nWith our trailers: https://www.youtube.com/shorts/1Q8G_lf3QXs"
  Spanish: "¡Sí! Entregamos y bajamos el contenedor directamente al piso utilizando nuestro equipo de grúa especializado. Te invito a ver cómo funciona en estos videos:\n\nCon nuestra grúa lateral: https://www.youtube.com/shorts/wdqOKA2CFwE\nCon nuestros trailers: https://www.youtube.com/shorts/1Q8G_lf3QXs"
  If you already sent those video links in this conversation, do NOT paste the full message or the links again unless they ask for the videos. Reply briefly: yes, we unload it to the ground with our crane, and ask if they want to proceed.

EXTRACTION RULES (only populate what you can confidently extract; use null for everything else):
- SIZE. "20" / "20'" / "20ft" / "twenty" / "20 pies" → "20' STD". "20 HC" / "20 High Cube" → "20' HC" (a plain 20' is NEVER "20' HC"). "40" / "40'" / "40ft" / "forty" / "40 pies" → "40'" exactly — do NOT output "40' STD" for a plain 40'. "40 HC" / "40 High Cube" / "es HC" while discussing a 40 → "40' HC". "45" / "45'" / "45ft" / "forty five" → "45' HC".
- CONDITION. "new" / "nuevo" / "brand new" / "one trip" / "one-trip" / "on trip" / "1 trip" → "Nuevo". "used" / "usado" / "second hand" / "pre-owned" / "wwt" / "cargo worthy" / "cw" → "Usado". If they did not explicitly say it, leave it null — never guess or default.
- TYPE. "reefer" / "refrigerado" / "refrigerated" / "cold" / "freezer" → "Reefer". "standard" / "dry" / "estandar" / "regular" / "normal" → "Dry". "open side" / "puertas laterales" / "abre por el lado" → "Open Side". "double door" / "puertas dobles" / "doble puerta" / "tunel" / "tunnel" → "Double Door". NEVER change the type unless they explicitly name one — if they just ask for another size ("y el de 40'"), leave type null so the current one is kept.
- ACTION. "storage" / "almacenamiento" / "para guardar" → "Comprar"; if they ask for a price without saying buy or rent, assume "Comprar". "rent" / "alquiler" / "renta" / "lease" → "Alquilar" (US storage only). "move" / "transport" / "mover" / "haul" / "relocate" / "de mi casa" / "to my lot" / "hasta un terreno" → "Transporte", and do NOT also extract type or condition unless they named them. "export" / "exportacion" → "Exportacion"; if they mention renting in an export conversation, keep "Exportacion" and set export_action "Comprar".
- QUANTITY. "two"/"2"/"dos"/"couple"/"a pair" → 2. "three"/"3"/"tres" → 3. "one"/"1"/"un"/"uno" → 1.
- REEFER STATUS. "working" / "funcionando" / "with ac" / "with motor" → "Funcionando". "not working" / "no funciona" / "no ac" / "sin motor" / "broken" → "No Funcionando".
- LOAD STATUS. "empty" / "vacio" → "Vacio". "under 14000" / "menos de 14000" / "<14k" → "Cargado_Under14000". "over 14000" / "más de 14000" / ">14k" → "Cargado_Over14000". "loaded" / "cargado" / "lleno" / "full" with NO weight → "Cargado_Over14000".
- ZIPS. Extract 5-digit zips exactly and NEVER treat a 3 or 4-digit number (e.g. 1400) as a zip. For transport, "del 33139 al 32470" / "from 33139 to 32470" / "33139 32470" means zip_origin=33139 AND zip_dest=32470 — extract both. If they CORRECT a zip ("me confundí, el zip de entrega es 32148"), use intent "quote" and update zip_dest or zip.
- ITEMS is the full shopping cart. If they previously asked for several sizes (e.g. 20 and 40), output ALL of them with their sizes in EVERY response, even when they are only answering a follow-up question. Never wipe the cart.
- customer_name: a personal or business name (e.g. "Crossties of Ocala"). If they say "already did" or "see above", find it earlier in the conversation. customer_phone: any 10-digit number.
- is_complex_order: true ONLY when they request multiple DIFFERENT services in one message (e.g. "buy a 20ft AND move two 40ft"). Asking prices for several sizes or conditions is NOT complex — that is false.`;

// ─── HELPERS DE SUPABASE ──────────────────────────────────────────────────────
async function getSession(senderId: string): Promise<any> {
    const { data } = await supabase.from("bot_sessions").select("*").eq("sender_id", senderId).single();
    if (data) return data;
    const s = { sender_id: senderId, step: 0 };
    await supabase.from("bot_sessions").insert([s]);
    return s;
}

async function updateSession(senderId: string, updates: any) {
    const { error } = await supabase.from("bot_sessions").update(updates).eq("sender_id", senderId);
    if (!error) return;

    console.error("updateSession error:", error.message);
    const safeKeys = new Set([
        "step", "lang", "action", "condition", "size", "type", "reefer_status", "load_status",
        "zip", "zip_origin", "zip_dest", "lead_name", "lead_phone", "final_amount", "final_form_amount",
        "history", "quantity", "export_action", "port_dest", "items", "is_processing", "queued_messages",
        "quoted_conditions", "new_stock_cache", "hc_stock_pending", "hc_stock_interest",
        "hc_used_force_quote", "hc_used_warn_shown",
    ]);
    const minimal: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
        if (safeKeys.has(key)) minimal[key] = value;
    }
    if (Object.keys(minimal).length === 0) return;

    const { error: retryErr } = await supabase.from("bot_sessions").update(minimal).eq("sender_id", senderId);
    if (retryErr) {
        const core: Record<string, unknown> = {};
        for (const key of ["step", "final_amount", "final_form_amount", "history", "size", "condition", "zip", "lang", "action"]) {
            if (updates[key] !== undefined) core[key] = updates[key];
        }
        if (Object.keys(core).length > 0) {
            const { error: coreErr } = await supabase.from("bot_sessions").update(core).eq("sender_id", senderId);
            if (coreErr) console.error("updateSession core retry error:", coreErr.message);
        }
    }
}

// ─── LLAMADA A OPENAI ─────────────────────────────────────────────────────────
function buildSessionContextBlock(session: any): string {
    if (!session?.action && !session?.size && !session?.zip) return "";
    const lines = ["CURRENT SESSION STATE (already collected — do NOT ask for these again):"];
    if (session.action) lines.push(`- Service: ${session.action}`);
    if (session.size) lines.push(`- Size: ${session.size}`);
    if (session.condition) lines.push(`- Condition: ${session.condition}`);
    if (session.type && session.type !== "Dry") lines.push(`- Type: ${session.type}`);
    if (session.reefer_status) lines.push(`- Reefer motor: ${session.reefer_status}`);
    if (session.zip) lines.push(`- Delivery ZIP: ${session.zip}`);
    if (session.zip_origin) lines.push(`- Origin ZIP: ${session.zip_origin}`);
    if (session.zip_dest) lines.push(`- Destination ZIP: ${session.zip_dest}`);
    if (session.load_status) lines.push(`- Load status: ${session.load_status}`);
    if (session.final_amount != null) lines.push(`- Quoted total: $${session.final_amount}`);
    const priceMeta = parseQuotePriceMeta(session);
    if (priceMeta.quoted_prices && Object.keys(priceMeta.quoted_prices).length > 0) {
        lines.push("- Quoted prices already given (reference these exactly in general_chat — never invent others):");
        for (const [key, val] of Object.entries(priceMeta.quoted_prices)) {
            lines.push(`  ${key}: $${val}`);
        }
    }
    const step = Number(session.step) || 0;
    if (step === 6 && session.final_amount != null) {
        lines.push("- Status: FINAL PRICE ALREADY GIVEN. Use general_chat for follow-up questions. Answer naturally — do NOT re-quote or repeat the price template unless they explicitly change size/zip/condition or ask for a new calculation. Use proceed only when they clearly confirm the order.");
    }
    if (step === 7) lines.push("- Status: Waiting for customer FULL NAME only.");
    if (step === 8) lines.push("- Status: Waiting for customer PHONE NUMBER only.");
    return lines.join("\n");
}

async function callAI(history: Array<{role: string, content: string}>, session?: any): Promise<any> {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return null;
    const context = buildSessionContextBlock(session);
    const systemContent = context ? `${MASTER_PROMPT}\n\n${context}` : MASTER_PROMPT;
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: systemContent }, ...history],
                response_format: { type: "json_object" },
                temperature: 0.45
            })
        });
        const json = await res.json();
        return JSON.parse(json.choices[0].message.content);
    } catch (e) {
        console.error("OpenAI error:", e);
        return null;
    }
}

function mentionsNewCondition(text: string): boolean {
    const lo = text.toLowerCase();
    return /\bone[\s-]?trip\b/.test(lo)
        || lo.includes("brand new")
        || /\b(nuevos?|nuevas?|new)\b/.test(lo);
}

function mentionsUsedCondition(text: string): boolean {
    const lo = text.toLowerCase();
    return /\b(usados?|usadas?|used|second hand|pre-owned|wwt|cargo worthy|cw)\b/.test(lo)
        || lo.includes("wind water tight");
}

function inferConditionFromConversation(input: string, history: any): "Nuevo" | "Usado" | null {
    const texts: string[] = [input];
    if (Array.isArray(history)) {
        for (const msg of history) {
            if (msg?.role === "user" && msg.content) texts.push(msg.content);
        }
    }
    let sawNew = false;
    let sawUsed = false;
    for (const text of texts) {
        if (isConditionComparisonQuestion(text)) continue;
        if (mentionsNewCondition(text)) sawNew = true;
        if (mentionsUsedCondition(text)) sawUsed = true;
    }
    if (sawNew && !sawUsed) return "Nuevo";
    if (sawUsed && !sawNew) return "Usado";
    return null;
}

function conversationUserTexts(input: string, history: any): string[] {
    const texts: string[] = [input];
    if (Array.isArray(history)) {
        for (const msg of history) {
            if (msg?.role === "user" && msg.content) texts.push(msg.content);
        }
    }
    return texts;
}

function mentionsStdSize(text: string): boolean {
    const lo = (text || "").toLowerCase();
    return /\b(std|est[aá]ndar|standard|8'6|8[\s'"]6)\b/.test(lo) && !/\b(hc|high\s*cube|highcube|9'6)\b/.test(lo);
}

function mentionsHcSize(text: string): boolean {
    const lo = (text || "").toLowerCase();
    return /\b(hc|high\s*cube|highcube|9'6|9[\s'"]6)\b/.test(lo);
}

function normalizeSizeKey(size: string): string {
    const s = (size || "").toLowerCase().replace(/\s+/g, "");
    if (s.includes("20") && s.includes("hc")) return "20hc";
    if (s.includes("20")) return "20std";
    if (s.includes("40") && s.includes("hc")) return "40hc";
    if (s.includes("40")) return "40std";
    if (s.includes("45")) return "45hc";
    return s;
}

/** When client asks for STD vs HC variant on a 20' quote (e.g. "y el std cuánto sale"). */
function inferAlternateSize(session: any, input: string): string | null {
    const explicit = extractSizeFromText(input);
    if (explicit) return explicit;
    const cur = session?.size || "";
    if (!cur.includes("20") && !cur.includes("40")) return null;
    if (mentionsStdSize(input)) {
        if (cur.includes("20")) return "20' STD";
        if (cur.includes("40")) return cur.includes("HC") ? "40' STD" : "40'";
    }
    if (mentionsHcSize(input)) {
        if (cur.includes("20") && !cur.includes("HC")) return "20' HC";
        if (cur.includes("40") && !cur.includes("HC")) return "40' HC";
    }
    return null;
}

function applyAlternateSizeRequest(session: any, data: any, input: string): boolean {
    const altSize = inferAlternateSize(session, input);
    if (!altSize) return false;
    if (normalizeSizeKey(altSize) === normalizeSizeKey(session.size || "")) return false;

    const condition = session.condition || data.condition
        || resolveExplicitCondition(input, session.history, data, session)
        || "Nuevo";
    session.size = altSize;
    session.items = [{
        size: altSize,
        action: session.action || data.action || "Comprar",
        condition,
        type: session.type || data.type || "Dry",
    }];
    data.size = altSize;
    data.items = session.items;
    data.condition = condition;
    if (altSize.includes("STD") || !altSize.includes("HC")) {
        session.hc_used_force_quote = false;
    }
    return true;
}

function extractSizeFromText(text: string): string | null {
    const trimmed = (text || "").trim();
    if (/^20['"]?\s*$/i.test(trimmed)) return "20' STD";
    if (/^40['"]?\s*$/i.test(trimmed)) return "40'";
    if (/^45['"]?\s*$/i.test(trimmed)) return "45' HC";
    const lo = text.toLowerCase();
    if (/\b20[\s'/-]*(?:ft|foot|feet|pie|pies)?[\s'/-]*(?:hc|high\s*cube)\b/.test(lo) || /\b20\s*hc\b/.test(lo)) return "20' HC";
    if (/\b45[\s'/-]*(?:ft|foot|feet|pie|pies)?\b/.test(lo) || /\bforty[\s-]?five\b/.test(lo)) return "45' HC";
    if (/\b40[\s'/-]*(?:ft|foot|feet|pie|pies)?[\s'/-]*(?:hc|high\s*cube)\b/.test(lo) || /\b40\s*hc\b/.test(lo)) return "40' HC";
    if (/\b40[\s'/-]*(?:ft|foot|feet|pie|pies)?\b/.test(lo) || /\bforty\b/.test(lo)) return "40'";
    if (/\b20[\s'/-]*(?:ft|foot|feet|pie|pies)?\b/.test(lo) || /\btwenty\b/.test(lo) || /\b20\s+one[\s-]?trip\b/.test(lo)) return "20' STD";
    return null;
}

function hasExplicitSingleSize(session: any, history: any, input: string): string | null {
    if (session.size && session.size !== "20' & 40'") return session.size;
    if (session.items?.length === 1 && session.items[0].size) return session.items[0].size;
    const combined = conversationUserTexts(input, history).join("\n");
    const lo = combined.toLowerCase();
    const mentions20 = /\b20[\s'/-]/.test(lo) || /\btwenty\b/.test(lo) || /\bone[\s-]?trip\b/.test(lo);
    const mentions40 = /\b40[\s'/-]/.test(lo) || /\bforty\b/.test(lo);
    const mentions45 = /\b45[\s'/-]/.test(lo) || /\bforty[\s-]?five\b/.test(lo);
    const sizeCount = [mentions20, mentions40, mentions45].filter(Boolean).length;
    if (sizeCount === 1) return extractSizeFromText(combined);
    return null;
}

function ensureQuoteItems(session: any, updates: any, history: any, input: string, action: string): void {
    if (action === "Alquilar") return;
    const hasSizeInItems = session.items && session.items.length > 0 && session.items.some((i: any) => i.size);
    if (hasSizeInItems) return;

    const combined = conversationUserTexts(input, history).join("\n");
    const itemType = session.type || extractTypeFromText(combined) || undefined;

    const singleSize = hasExplicitSingleSize(session, history, input);
    if (singleSize) {
        const condition = session.condition || resolveConditionFromContext(input, history, { condition: session.condition }) || undefined;
        session.items = [{ size: singleSize, action, ...(itemType ? { type: itemType } : {}), ...(condition ? { condition } : {}) }];
        session.size = singleSize;
        updates.items = session.items;
        updates.size = singleSize;
        return;
    }

    session.items = [
        { size: "20'", action, ...(itemType ? { type: itemType } : {}) },
        { size: "40'", action, ...(itemType ? { type: itemType } : {}) },
    ];
    session.size = "20' & 40'";
    updates.items = session.items;
    updates.size = session.size;
}

function extractZipFromText(text: string): string | null {
    const match = text.match(/\b(\d{5})\b/);
    return match ? match[1] : null;
}

/** Extract origin + destination ZIP pair for transport (del 33139 al 32470, 33139 32470, etc.) */
function extractTransportZipsFromText(text: string): { zip_origin: string; zip_dest: string } | null {
    const t = text || "";
    const routeMatch = t.match(/(?:del|de|desde|from)\s*(\d{5})\s*(?:al|a|hasta|to)\s*(\d{5})/i);
    if (routeMatch) return { zip_origin: routeMatch[1], zip_dest: routeMatch[2] };
    const twoZips = t.match(/\b(\d{5})\s+(\d{5})\b/);
    if (twoZips) return { zip_origin: twoZips[1], zip_dest: twoZips[2] };
    const allZips = [...t.matchAll(/\b(\d{5})\b/g)].map((m) => m[1]);
    if (allZips.length >= 2) return { zip_origin: allZips[0], zip_dest: allZips[1] };
    return null;
}

function inferTransportZipsFromConversation(input: string, history: any): { zip_origin: string; zip_dest: string } | null {
    for (const text of conversationUserTexts(input, history)) {
        const z = extractTransportZipsFromText(text);
        if (z) return z;
    }
    return null;
}

function inferZipFromConversation(input: string, history: any): string | null {
    for (const text of conversationUserTexts(input, history)) {
        const z = extractZipFromText(text);
        if (z) return z;
    }
    return null;
}

/** Customer corrects a ZIP already quoted (e.g. "me confundí, el zip de entrega es 32148"). */
function isZipCorrectionMessage(input: string, session?: any): boolean {
    const lo = (input || "").toLowerCase();
    const z = extractZipFromText(input);
    if (!z) return false;
    if (/\b(confund[ií]|corrijo|corregir|error|equivoqu[eé]|actually|meant|wrong|en realidad|me confund)\b/i.test(lo)) return true;
    if (/\b(entrega|destino|delivery|destination|recogida|origen|origin|pickup)\b/i.test(lo)
        && /\b(zip|c[oó]digo postal|postal|code)\b/i.test(lo)) return true;
    if (/\b(el|la|the)\s+(zip|c[oó]digo postal)\s+(de\s+)?(entrega|destino|delivery|recogida|origen|origin)\b/i.test(lo)) return true;
    if (session?.action === "Transporte") {
        if (/\b(entrega|destino|delivery|destination|hasta| to )\b/i.test(lo) && z !== session?.zip_dest) return true;
        if (/\b(recogida|origen|origin|pickup|desde|from)\b/i.test(lo) && z !== session?.zip_origin) return true;
    } else if (session?.zip && z !== session.zip && /\b(entrega|delivery|zip|c[oó]digo postal|confund|corrijo)\b/i.test(lo)) {
        return true;
    }
    return false;
}

function applyZipCorrectionFromInput(input: string, session: any, data: any): boolean {
    if (!extractZipFromText(input)) return false;
    const lo = (input || "").toLowerCase();
    const z = extractZipFromText(input)!;
    let changed = false;

    if (session?.action === "Transporte" || data.action === "Transporte") {
        if (/\b(recogida|origen|origin|pickup|desde|from)\b/i.test(lo) && !/\b(entrega|destino|delivery|destination)\b/i.test(lo)) {
            if (z !== (data.zip_origin || session?.zip_origin)) {
                data.zip_origin = z;
                changed = true;
            }
        } else if (/\b(entrega|destino|delivery|destination|hasta|\ba\b|\bto\b)\b/i.test(lo) || isZipCorrectionMessage(input, session)) {
            if (z !== (data.zip_dest || session?.zip_dest)) {
                data.zip_dest = z;
                changed = true;
            }
        }
        const pair = extractTransportZipsFromText(input);
        if (pair) {
            if (pair.zip_origin !== (data.zip_origin || session?.zip_origin)) {
                data.zip_origin = pair.zip_origin;
                changed = true;
            }
            if (pair.zip_dest !== (data.zip_dest || session?.zip_dest)) {
                data.zip_dest = pair.zip_dest;
                changed = true;
            }
        }
    } else if (isZipCorrectionMessage(input, session) && z !== (data.zip || session?.zip)) {
        data.zip = z;
        changed = true;
    }
    return changed;
}

/** User is asking about used vs new — not selecting a condition. */
function isConditionComparisonQuestion(text: string): boolean {
    const lo = (text || "").toLowerCase().trim();
    if (!mentionsUsedCondition(text) && !mentionsNewCondition(text)) return false;
    if (/\?/.test(text) || /\b(no\?|verdad|right|cierto)\s*$/i.test(lo)) {
        if (/\b(m[aá]s\s*barat[oa]s?|m[aá]s\s*car[oa]s?|cheaper|more expensive|cu[aá]l|which|better|mejor|diferencia|difference|recomiendas?|recommend|conviene|worth|vale la pena)\b/.test(lo)) return true;
    }
    return /\b(es|son|is|are|ser[aá]|would be|cu[aá]nto m[aá]s|how much more)\b/.test(lo)
        && /\b(m[aá]s\s*barat[oa]s?|m[aá]s\s*car[oa]s?|cheaper|more expensive|mejor|better)\b/.test(lo);
}

/** Message states an explicit product choice / order intent, not a doubt about pricing. */
function statesProductChoice(input: string): boolean {
    const lo = (input || "").toLowerCase();
    return /\b(quiero|me quedo con|me llevo|dame|d[eé]me|prefiero|elijo|voy con|escojo|i want|i'll take|ill take|give me|i choose|let's go with|lets go with)\b/.test(lo);
}

/**
 * Post-quote: the customer asks what a given condition costs (e.g. "¿los nuevos son
 * mucho más caros?"). Returns that condition regardless of what is currently stored,
 * so every downstream resolution agrees while the quote is recalculated.
 */
function conditionPriceRequestFromInput(input: string, session: any): "Nuevo" | "Usado" | null {
    if (!hasQuotedPrice(session)) return null;
    const lo = (input || "").toLowerCase();
    const priceish = /\b(precios?|price|prices|costo|cost|cuesta|cu[aá]nto|how much|m[aá]s\s*car[oa]s?|m[aá]s\s*barat[oa]s?|cheaper|more\s*expensive|vale|valen|sale)\b/.test(lo);
    if (!priceish) return null;
    const asksNew = mentionsNewCondition(input);
    const asksUsed = mentionsUsedCondition(input);
    if (asksNew && !asksUsed) return "Nuevo";
    if (asksUsed && !asksNew) return "Usado";
    return null;
}

/** Same as above, but only when it differs from the condition we already quoted. */
function asksOtherConditionPrice(input: string, session: any): "Nuevo" | "Usado" | null {
    const requested = conditionPriceRequestFromInput(input, session);
    if (!requested) return null;
    return requested !== session?.condition ? requested : null;
}

function hasExplicitSize(session: any): boolean {
    return !!(session?.size && session.size !== "20' & 40'");
}

function extractConditionFromText(text: string): "Nuevo" | "Usado" | null {
    if (isConditionComparisonQuestion(text)) return null;
    if (/\bone[\s-]?trip\b/i.test(text) || /\bbrand\s+new\b/i.test(text) || /\b(nuevo|new)\b/i.test(text)) return "Nuevo";
    if (mentionsUsedCondition(text)) return "Usado";
    return null;
}

function extractTypeFromText(text: string): "Reefer" | "Open Side" | "Double Door" | null {
    const lo = (text || "").toLowerCase();
    if (/\b(reefer|refrigerad\w*|refrigerated|freezer|cold storage|congelad\w*)\b/.test(lo)) return "Reefer";
    if (/\b(open[\s-]?side|puertas?\s+laterales?|side[\s-]?opening|abre\s+por\s+el\s+lado)\b/.test(lo)) return "Open Side";
    if (/\b(double[\s-]?door|doble[\s-]?puerta|tunnel|tunel|túnel)\b/.test(lo)) return "Double Door";
    return null;
}

function resolveExplicitCondition(input: string, history: any, data: any, session?: any): "Nuevo" | "Usado" | null {
    // The customer's latest explicit statement wins over anything said earlier
    const fromInput = extractConditionFromText(input);
    if (fromInput) return fromInput;
    const requestedCondition = conditionPriceRequestFromInput(input, session);
    if (requestedCondition) return requestedCondition;
    const userTexts = conversationUserTexts(input, history);
    for (let i = userTexts.length - 1; i >= 0; i--) {
        const c = extractConditionFromText(userTexts[i]);
        if (c) return c;
    }
    if (session?.condition === "Nuevo" || session?.condition === "Usado") return session.condition;
    return null;
}

function hasKnownCondition(session: any, input: string, history: any, data: any = {}): boolean {
    return resolveExplicitCondition(input, history, data, session) !== null;
}

function is20HcSize(size?: string | null): boolean {
    const s = (size || "").toUpperCase().replace(/\s+/g, "");
    return s.includes("20") && s.includes("HC");
}

/** Strip AI-inferred condition when the user did not explicitly say new/used (especially for 20' HC). */
function sanitizeInferredCondition(input: string, session: any, data: any): void {
    const explicit = resolveExplicitCondition(input, session?.history, data, session);
    if (explicit) {
        data.condition = explicit;
        if (data.items?.length) {
            for (const item of data.items) item.condition = explicit;
        }
        return;
    }

    const mentionedNew = mentionsNewCondition(input);
    const mentionedUsed = mentionsUsedCondition(input);
    const targetSize = data.size || data.items?.[0]?.size || session?.size;
    const hcQuote = is20HcSize(targetSize);

    if (hcQuote || (!mentionedNew && !mentionedUsed && data.condition)) {
        data.condition = session?.condition || null;
        if (data.items?.length) {
            for (const item of data.items) {
                if (hcQuote || !mentionedNew && !mentionedUsed) delete item.condition;
            }
        }
    }
}

function applyExplicitConditionToUpdates(input: string, session: any, data: any, updates: any): void {
    const explicitCond = resolveExplicitCondition(input, session.history, data, session);
    if (explicitCond) {
        updates.condition = explicitCond;
        session.condition = explicitCond;
    }
}

function ensureDryDefaultType(session: any, updates: any, input: string, history: any): void {
    const combined = conversationUserTexts(input, history).join("\n");
    const inferredType = extractTypeFromText(combined);
    if (inferredType) {
        session.type = inferredType;
        updates.type = inferredType;
        if (inferredType === "Open Side" || inferredType === "Double Door") {
            session.condition = "Nuevo";
            updates.condition = "Nuevo";
        }
    } else if (!session.type || session.type === "Dry") {
        session.type = "Dry";
        updates.type = "Dry";
    }
}

function needsConditionBeforeQuote(session: any): boolean {
    const action = session.action;
    if (!["Comprar", "Alquilar", "Exportacion", "Exportación"].includes(action)) return false;
    if (["Open Side", "Double Door"].includes(session.type)) return false;
    return !session.condition;
}

function resolveConditionFromContext(input: string, history: any, data: any, session?: any): "Nuevo" | "Usado" | null {
    const explicit = resolveExplicitCondition(input, history, data, session);
    if (explicit) return explicit;
    return inferConditionFromConversation(input, history);
}

function applyConversationInferences(input: string, history: any, data: any): void {
    const userTexts = conversationUserTexts(input, history);
    const combined = userTexts.join("\n");
    const oneTrip = userTexts.some((t) => /\bone[\s-]?trip\b/i.test(t));
    const resolvedCondition = resolveExplicitCondition(input, history, data);
    const inferredSize = extractSizeFromText(combined);
    const inferredAction = inferServiceAction(combined)
        || ((!data.action && (inferredSize || oneTrip || /\b(deliver|delivery|entrega|entregar)\b/i.test(combined))) ? "Comprar" : null);

    const inferredType = extractTypeFromText(combined);
    if (inferredType) {
        data.type = inferredType;
    }

    if (resolvedCondition) {
        data.condition = resolvedCondition;
    }

    if (inferredSize && !data.size) data.size = inferredSize;
    if (!data.action && inferredAction) data.action = inferredAction;
    if (!data.type && (data.action === "Comprar" || data.action === "Alquilar" || inferredAction === "Comprar")) {
        data.type = "Dry";
    }

    const isTransport = (data.action || data.items?.[0]?.action) === "Transporte"
        || inferServiceAction(combined) === "Transporte";
    if (isTransport) {
        if (!data.action) data.action = "Transporte";
        const transportZips = inferTransportZipsFromConversation(input, history);
        if (transportZips) {
            if (!data.zip_origin) data.zip_origin = transportZips.zip_origin;
            if (!data.zip_dest) data.zip_dest = transportZips.zip_dest;
        }
    } else {
        const inferredZip = inferZipFromConversation(input, history);
        if (inferredZip && !data.zip) data.zip = inferredZip;
    }

    const currentLoad = normalizeLoadStatus(data.load_status)
        || normalizeLoadStatus(data.items?.[0]?.load_status);
    if (currentLoad) data.load_status = currentLoad;

    const mentions20 = /\b20[\s'/-]/.test(combined.toLowerCase()) || /\btwenty\b/.test(combined.toLowerCase());
    const mentions40 = /\b40[\s'/-]/.test(combined.toLowerCase()) || /\bforty\b/.test(combined.toLowerCase());

    const mergeItem = (base: any = {}) => {
        const item = { ...base };
        if (!item.size && inferredSize) item.size = inferredSize;
        if (!item.action && data.action) item.action = data.action;
        if (currentLoad) item.load_status = currentLoad;
        else if (data.load_status) item.load_status = data.load_status;
        if (!isTransport) {
            if (resolvedCondition) item.condition = resolvedCondition;
            else if (!item.condition && data.condition) item.condition = data.condition;
        }
        if (inferredType) item.type = inferredType;
        else if (!item.type && data.type) item.type = data.type;
        return item;
    };

    if (data.items?.length) {
        data.items = data.items.map((item: any) => mergeItem(item));
        if (inferredSize && !data.size) data.size = inferredSize;
    } else if (inferredSize && mentions20 && !mentions40) {
        data.items = [mergeItem({
            size: inferredSize,
            action: data.action || (isTransport ? "Transporte" : "Comprar"),
        })];
        data.size = inferredSize;
    } else if (inferredSize) {
        data.items = [mergeItem({
            size: inferredSize,
            action: data.action || (isTransport ? "Transporte" : "Comprar"),
        })];
    }
}

function buildQuoteFromText(input: string): any | null {
    const lo = input.toLowerCase();
    const size = extractSizeFromText(input);
    const condition = extractConditionFromText(input);
    const oneTrip = /\bone[\s-]?trip\b/.test(lo);
    const action = inferServiceAction(input) || (size || oneTrip || condition ? "Comprar" : null);
    const transportZips = extractTransportZipsFromText(input);
    const zipMatch = input.match(/\b(\d{5})\b/);
    if (!size && !oneTrip && !condition && !action && !transportZips) return null;

    const item: any = { action: action || "Comprar" };
    if (size) item.size = size;
    if (condition) item.condition = condition;

    const extracted_data: any = { items: [item], action: action || item.action };
    if (condition) extracted_data.condition = condition;
    if (size) extracted_data.size = size;
    if (action === "Transporte" && transportZips) {
        extracted_data.zip_origin = transportZips.zip_origin;
        extracted_data.zip_dest = transportZips.zip_dest;
    } else if (zipMatch) {
        extracted_data.zip = zipMatch[1];
    }
    return { intent: "quote", extracted_data };
}

/** Customer asks for prices before choosing buy / rent / transport. */
function isInitialPriceInquiry(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    if (/^(precios?|price|prices|pricing|cotizaci[oó]n|cotizar|quote|cu[aá]nto|how much)\??$/i.test(lo)) return true;
    return /\b(precios?|cotizaci[oó]n|cotizar|cu[aá]nto\s*cuesta|how\s*much|price|pricing|quiero\s+saber\s+(los\s+)?precios?|necesito\s+(los\s+)?precios?|need\s+a\s+price|want\s+(to\s+)?know\s+(the\s+)?prices?|dame\s+(los\s+)?precios?|give\s+me\s+(a\s+)?price)\b/i.test(lo)
        // Naming a service or a size means we already have something concrete to quote
        && !/\b(comprar|buy|alquilar|rent|transporte|transport|mover|move|20|40|45|ft|pies)\b/i.test(lo);
}

function buildWarmWelcomeReply(lang: string, input?: string): string {
    const priceAsk = !!(input && isInitialPriceInquiry(input));
    if (lang === "ES") {
        if (priceAsk) {
            return "¡Hola! Con gusto te ayudo con los precios. Para darte una cotización exacta primero necesito saber **qué servicio** buscas:\n\n• **Comprar** un contenedor\n• **Alquilar** para almacenamiento\n• **Transporte** — mover un contenedor que ya tienes\n\n¿Cuál de estos necesitas?";
        }
        return "¡Hola! Bienvenido a **RP Tulipan**. Soy tu asesor logístico — con gusto te ayudo.\n\nPara ofrecerte un precio exacto, primero necesito saber qué servicio buscas: **¿comprar**, **alquilar** o **transporte** de un contenedor?\n\nElige una opción y te guío paso a paso.";
    }
    if (priceAsk) {
        return "Hi! Happy to help with pricing. To give you an exact quote, I first need to know **which service** you're looking for:\n\n• **Buy** a container\n• **Rent** for storage\n• **Transport** — move a container you already own\n\nWhich one do you need?";
    }
    return "Hi! Welcome to **RP Tulipan** — I'm your logistics advisor and I'm here to help.\n\nTo give you an exact price, I first need to know what you need: **buy**, **rent**, or **transport** a container?\n\nPick an option and I'll walk you through it step by step.";
}

// ─── DETECCIÓN RÁPIDA SIN IA ──────────────────────────────────────────────────
function quickDetect(input: string, senderId: string, session: any): any | null {
    const lo = input.toLowerCase().trim();
    const quoted = hasQuotedPrice(session);
    const currentAction = session?.action;

    if (!session?.action && !quoted && isInitialPriceInquiry(input)) {
        const lang = detectMessageLanguage(input, session?.lang, session?.history);
        return { intent: "general_chat", lang, ai_reply: buildWarmWelcomeReply(lang, input), extracted_data: {} };
    }

    if (["hola", "hello", "hi", "buenas", "buenos días", "buenos dias", "good morning", "hey"].includes(lo) && !session?.action && !quoted) {
        const lang = ["hola", "buenas", "buenos días", "buenos dias"].some((w) => lo.includes(w)) ? "ES" : "EN";
        return { intent: "general_chat", lang, ai_reply: buildWarmWelcomeReply(lang), extracted_data: {} };
    }

    if (["ok", "okay", "ok.", "vale", "perfecto"].includes(lo)) {
        const ack = (session?.lang === "ES")
            ? (quoted ? "Perfecto. Cuando quieras seguimos: toca Proceder o dime tu nombre." : "Perfecto, dime cómo te ayudo.")
            : (quoted ? "Sounds good. Whenever you're ready, tap Proceed or send your name." : "Sounds good — how can I help?");
        return { intent: "general_chat", lang: session?.lang, ai_reply: ack, extracted_data: {} };
    }

    if (isPhotosRequest(input)) {
        return { intent: "photos", lang: session?.lang, extracted_data: {} };
    }
    if (isDimensionsRequest(input)) {
        return { intent: "dimensions", lang: session?.lang, extracted_data: {} };
    }

    const transportZips = extractTransportZipsFromText(input);
    if (inferServiceAction(input) === "Transporte" && transportZips) {
        const sz = extractSizeFromText(input);
        const item: any = { action: "Transporte" };
        if (sz) item.size = sz;
        return {
            intent: "quote",
            lang: session?.lang,
            extracted_data: {
                action: "Transporte",
                zip_origin: transportZips.zip_origin,
                zip_dest: transportZips.zip_dest,
                ...(sz ? { size: sz } : {}),
                items: [item],
            },
        };
    }

    if (["comprar", "buy"].includes(lo)) {
        if (quoted && currentAction === "Comprar") return { intent: "proceed", extracted_data: {} };
        return { intent: "quote", extracted_data: { items: [{ action: "Comprar" }] } };
    }
    if (["alquilar", "rent"].includes(lo)) {
        if (quoted && currentAction === "Alquilar") return { intent: "proceed", extracted_data: {} };
        return { intent: "quote", extracted_data: { items: [{ action: "Alquilar" }] } };
    }
    if (["transporte", "transport"].includes(lo)) {
        if (quoted && currentAction === "Transporte") return { intent: "proceed", extracted_data: {} };
        return { intent: "quote", extracted_data: { items: [{ action: "Transporte" }] } };
    }

    // Exact chip labels first — never infer a new service from a size/load tap
    if (lo === "20'") return { intent: "quote", extracted_data: { items: [{ size: "20'" }] } };
    if (["20 hc", "20' hc", "20ft hc", "20 high cube", "20' high cube"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ size: "20' HC" }] } };
    if (["cotizar hc usado", "quote used hc", "cotizar hc", "quote hc"].includes(lo)) {
        return { intent: "quote", extracted_data: { condition: "Usado", items: [{ size: "20' HC", condition: "Usado" }] } };
    }
    if (["cotizar 20' std", "cotizar 20 std", "quote 20' std", "quote 20 std"].includes(lo)) {
        return { intent: "quote", extracted_data: { items: [{ size: "20' STD" }] } };
    }
    if (lo === "40'") return { intent: "quote", extracted_data: { items: [{ size: "40'" }] } };
    if (lo === "45'") return { intent: "quote", extracted_data: { items: [{ size: "45'" }] } };

    // Composite messages first (e.g. "20' one trip to 33470") before partial keyword matches
    const composite = buildQuoteFromText(input);
    if (composite) return composite;
    if (["nuevo", "new", "one trip", "one-trip", "brand new"].includes(lo)) {
        return { intent: "quote", extracted_data: { condition: "Nuevo", items: [{ condition: "Nuevo" }] } };
    }
    if (["usado", "used"].includes(lo)) {
        return { intent: "quote", extracted_data: { condition: "Usado", items: [{ condition: "Usado" }] } };
    }
    if (["dry (estándar)", "dry (standard)", "dry"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ type: "Dry" }] } };
    if (["refrigerado", "refrigerated"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ type: "Reefer" }] } };
    if (["funcionando", "working"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ reefer_status: "Funcionando" }] } };
    if (["no funcionando", "not working"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ reefer_status: "No Funcionando" }] } };
    if (["almacenamiento", "storage"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ action: "Comprar" }] } };
    if (["exportación", "export"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ action: "Exportacion" }] } };
    if (["vacío", "empty", "vacio"].includes(lo)) return { intent: "quote", extracted_data: { load_status: "Vacio", items: [{ load_status: "Vacio" }] } };
    if (["cargado <14k", "loaded <14k"].includes(lo) || /<\s*14/.test(lo) || lo.includes("under 14") || lo.includes("menos de 14")) return { intent: "quote", extracted_data: { load_status: "Cargado_Under14000", items: [{ load_status: "Cargado_Under14000" }] } };
    if (["cargado >14k", "loaded >14k"].includes(lo) || />\s*14/.test(lo) || lo.includes("over 14") || lo.includes("más de 14") || lo.includes("mas de 14")) return { intent: "quote", extracted_data: { load_status: "Cargado_Over14000", items: [{ load_status: "Cargado_Over14000" }] } };
    if (["cargado", "loaded", "lleno", "full"].includes(lo)) return { intent: "quote", extracted_data: { load_status: "Cargado_Over14000", items: [{ load_status: "Cargado_Over14000" }] } };

    const transportOpt = parseTransportOption(lo);
    if (transportOpt) {
        if (quoted && currentAction === "Transporte") {
            return { intent: "proceed", extracted_data: { transport_option: transportOpt } };
        }
        return null;
    }
    if (["sí, proceder", "si, proceder", "yes, proceed", "proceed", "proceder"].includes(lo)) {
        return quoted ? { intent: "proceed", extracted_data: {} } : null;
    }
    if (quoted && isReadyToProceed(input, session)) {
        return { intent: "proceed", extracted_data: {} };
    }

    const twoZips = lo.match(/\b(\d{5})\s+(\d{5})\b/);
    if (twoZips) return { intent: "quote", extracted_data: { zip_origin: twoZips[1], zip_dest: twoZips[2], action: "Transporte", items: [{ action: "Transporte" }] } };
    if (/^\d{5}$/.test(lo)) return { intent: "quote", extracted_data: { zip: lo } };

    return null;
}

// ─── LÓGICA PRINCIPAL ─────────────────────────────────────────────────────────
function parseQueueItem(q: string): { text?: string; mid?: string; type?: string } {
    try {
        const parsed = JSON.parse(q);
        if (parsed && typeof parsed === "object") return parsed;
    } catch { /* plain string leftover */ }
    return { text: q, type: "queue" };
}

function historyHasMid(session: any, messageId?: string): boolean {
    if (!messageId) return false;
    const history = session.history;
    if (!Array.isArray(history)) return false;
    return history.some((h: any) => h.mid === messageId || (Array.isArray(h.mids) && h.mids.includes(messageId)));
}

function queueHasMid(queue: any[] | null | undefined, messageId?: string): boolean {
    if (!messageId || !Array.isArray(queue)) return false;
    return queue.some((q: string) => parseQueueItem(q).mid === messageId);
}

function isStaleProcessingLock(session: any): boolean {
    if (!session.is_processing) return false;
    const updated = session.updated_at ? new Date(session.updated_at).getTime() : 0;
    if (!updated || Number.isNaN(updated)) return true;
    return Date.now() - updated > 45000;
}

function debounceMsFor(senderId: string, isHuman: boolean): number {
    if (isHuman) return 0;
    if (senderId.startsWith("web_")) return 0;
    return 2000;
}

/**
 * Services the customer explicitly names in THIS message. Used to guard the stored service:
 * the AI defaults to "Comprar" on neutral replies ("usado", a bare zip), which would
 * otherwise turn a rent or transport conversation into a sale.
 */
function servicesNamedInMessage(text: string): Set<string> {
    const t = (text || "").toLowerCase();
    const found = new Set<string>();
    if (/\b(export\w*|exportaci[oó]n|overseas|internacional)\b/.test(t)) found.add("Exportacion");
    if (/\b(alquil\w*|rent\w*|lease\w*|arrend\w*)\b/.test(t)) found.add("Alquilar");
    if (/\b(comprar\w*|compra|compras|compro|compramos|buy|buying|purchas\w*|adquir\w*)\b/.test(t)) found.add("Comprar");
    if (/\b(mover\w*|move|moving|mudar\w*|traslad\w*|transport\w*|haul\w*|relocat\w*)\b/.test(t)) found.add("Transporte");
    return found;
}

function inferServiceAction(text: string): string | null {
    const t = (text || "").toLowerCase();
    if (!t.trim()) return null;
    const wantsExport = /\b(export|exportaci[oó]n|exportar|overseas|internacional)\b/i.test(t);
    if (wantsExport) return "Exportacion";
    const mentionsBuy = /\b(comprar|buy|purchase|alquilar|rentar?|lease|renta)\b/i.test(t);
    const wantsMove = /\b(mover|transporte|transportar|transport|haul|relocate|mudar|traslad)/i.test(t);
    if (wantsMove && !mentionsBuy) return "Transporte";
    if (/\b(alquilar|rentar?|lease|renta)\b/i.test(t) && !/\b(comprar|buy|purchase)\b/i.test(t) && !wantsMove) return "Alquilar";
    if (/\b(comprar|buy|purchase)\b/i.test(t) && !wantsMove) return "Comprar";
    if (/\b(need|want|looking for|busco|necesito|quiero)\b/i.test(t) && /\b(20|40|45|container|contenedor|footer|ft|one[\s-]?trip)\b/i.test(t)) return "Comprar";
    return null;
}

function normalizeLoadStatus(raw: any): string | null {
    if (!raw) return null;
    const s = raw.toString();
    if (s === "Vacio" || s === "Cargado_Under14000" || s === "Cargado_Over14000") return s;
    const lo = s.toLowerCase().trim();
    if (["vacio", "vacío", "empty"].includes(lo)) return "Vacio";
    if (lo.includes("under") || lo.includes("menos") || /<\s*14/.test(lo) || s.includes("Under14000")) return "Cargado_Under14000";
    if (lo.includes("over") || lo.includes("más de") || lo.includes("mas de") || />\s*14/.test(lo) || s.includes("Over14000")) return "Cargado_Over14000";
    if (["cargado", "loaded", "lleno", "full"].includes(lo) || s === "Cargado") return "Cargado_Over14000";
    return null;
}

function cargoCaseFromLoad(load: string | null | undefined): string | undefined {
    const n = normalizeLoadStatus(load);
    if (n === "Vacio") return "empty";
    if (n === "Cargado_Under14000") return "loaded_under_14000";
    if (n === "Cargado_Over14000") return "loaded_over_14000";
    return undefined;
}

function isCompleteLoadStatus(load: any): boolean {
    return !!normalizeLoadStatus(load);
}

function hasQuotedPrice(session: any): boolean {
    return Number(session?.step) === 6 && session?.final_amount != null;
}

function isReadyToProceed(input: string, session?: any): boolean {
    const lo = (input || "").toLowerCase().trim();
    if (["sí, proceder", "si, proceder", "yes, proceed", "proceed", "proceder"].includes(lo)) return true;
    if (/\b(lo quiero|me interesa|confirmo|adelante|listo|v[aá]monos|let's do it|lets do it|i'll take it|ill take it|quiero proceder|hag[aá]moslo|deal|cerramos|ordenar|place the order|place my order|reservar|reserve it)\b/.test(lo)) return true;
    if (hasQuotedPrice(session)) {
        if (/\b(qu[eé]\s+necesitas|what do you need|qu[eé] se necesita|qu[eé] m[aá]s necesitas|what else do you need|siguiente paso|next step)\b/.test(lo)) return true;
        if (/\bs[ií]\s*,?\s*qu[eé]\s+necesitas\b/.test(lo)) return true;
        if (/\bconfirmar\s+(el\s+)?(pedido|orden|order)\b/.test(lo)) return true;
    }
    return false;
}

function mergeDataFromSession(session: any, data: any, input?: string, history?: any): void {
    if (!session) return;
    if (!data.action && session.action) data.action = session.action;
    if (!data.size && session.size) data.size = session.size;
    if (!data.condition && session.condition) data.condition = session.condition;
    if (!data.zip && session.zip) data.zip = session.zip;
    if (!data.type && session.type) data.type = session.type;
    if (!data.zip_origin && session.zip_origin) data.zip_origin = session.zip_origin;
    if (!data.zip_dest && session.zip_dest) data.zip_dest = session.zip_dest;
    if (!data.load_status && session.load_status) data.load_status = session.load_status;
    const isTransport = data.action === "Transporte" || session.action === "Transporte";
    if (isTransport && (!data.zip_origin || !data.zip_dest)) {
        const tz = inferTransportZipsFromConversation(input || "", history || session.history);
        if (tz) {
            if (!data.zip_origin) data.zip_origin = tz.zip_origin;
            if (!data.zip_dest) data.zip_dest = tz.zip_dest;
        }
    }
    if (!isTransport && !data.zip) {
        const z = inferZipFromConversation(input || "", history || session.history);
        if (z) data.zip = z;
    }
}

function aiReplyAsksForKnownField(aiMsg: string, session: any, input?: string): boolean {
    if (!aiMsg || !session) return false;
    if (input && isQuotedPriceClarificationQuestion(input, session)) return false;
    const lo = aiMsg.toLowerCase();
    if (session.zip && /\b(c[oó]digo postal|zip code|\bzip\b|postal)\b/.test(lo) && /\b(cu[aá]l|proporciona|provide|indica|dime|necesito|need|d[aá]melo|give me)\b/.test(lo)) return true;
    if (session.size && /\b(medida|tamaño|tamano|size)\b/.test(lo) && /\b(cu[aá]l|qu[eé]|what|indica|necesito)\b/.test(lo)) return true;
    if (session.condition && /\b(usado|nuevo|used|new|one-trip)\b/.test(lo) && /\b(prefieres|quieres|want|elige)\b/.test(lo)) return true;
    return false;
}

function fixAiReplyForKnownSession(aiMsg: string, session: any, lang: string, dict: any): string {
    if (!hasQuotedPrice(session) || !aiReplyAsksForKnownField(aiMsg, session)) return aiMsg;
    if (session.zip) {
        return lang === "ES"
            ? `¡Perfecto! Ya tengo tu ZIP **${session.zip}** registrado. Para continuar, escríbeme tu **nombre completo**.`
            : `Perfect! I already have ZIP **${session.zip}** on file. To continue, please send your **full name**.`;
    }
    return dict.ask_name;
}

/** Unambiguous photo wording — can never be confused with a pricing question. */
function mentionsPhotoWord(input: string): boolean {
    return /\b(foto|fotos|photo|photos|pics|picture|pictures|imagen|im[aá]genes|gallery|galer[ií]a)\b/i.test(input || "");
}

function isPhotosRequest(input: string): boolean {
    const lo = (input || "").toLowerCase();
    if (mentionsPhotoWord(input)) return true;
    // "quiero ver el precio / la cotización" asks for numbers, not pictures
    if (/\b(precios?|price|prices|costo|cost|cuesta|cotizaci[oó]n|quote|cu[aá]nto|how much)\b/.test(lo)) return false;
    return /\b(verlo|ver el contenedor|ver algunas|ver antes|quiero ver|ver unas|see it|see the container|can i see|want to see|look at)\b/.test(lo);
}

function isDimensionsRequest(input: string): boolean {
    const lo = (input || "").toLowerCase();
    if (/\b(how long|cu[aá]nto tarda|delivery time|demora|when will|cu[aá]ndo llega)\b/.test(lo)) return false;
    // "qué medida me recomiendas / necesito" is picking a size, not asking for the spec sheet
    if (/\b(medida|medidas|tama[nñ]o|tamano|size)\b/.test(lo)
        && /\b(recomiend\w*|sugier\w*|aconsej\w*|recommend\w*|suggest\w*|quiero|necesito|busco|me sirve|conviene|mejor|deber[ií]a|should i)\b/.test(lo)) return false;
    return /\b(medida|medidas|dimension|dimensions|measurements|largo|ancho|alto|length|width|height|capacidad|payload|tamaño|tamano)\b/.test(lo);
}

function wantsQuoteRecalculation(
    input: string,
    session: any,
    data: any,
    opts: { alternateSizeRequested: boolean; asksAlternatePrice: boolean; stdHcComparison: boolean; conditionComparison: boolean },
): boolean {
    // Asking what the other condition costs: quote it from the database (once per condition)
    const requestedCondition = conditionPriceRequestFromInput(input, session);
    if (requestedCondition && !sessionQuotedConditions(session).includes(requestedCondition)) return true;
    if (opts.stdHcComparison || opts.conditionComparison) return false;
    if (isQuotedPriceClarificationQuestion(input, session)) return false;
    if (isZipCorrectionMessage(input, session)) return true;
    if (opts.alternateSizeRequested || opts.asksAlternatePrice) return true;
    const lo = (input || "").toLowerCase();
    const normSize = (s: any) => (s ? s.toString().replace(" STD", "").replace(" & 40'", "").replace("20' & ", "") : "");
    if (data.size && normSize(data.size) !== normSize(session.size)) {
        if (hasQuotedPrice(session) && sizeAlreadyInQuotedSet(session, data.size, data.condition || session.condition)) return false;
        return true;
    }
    if (data.zip && data.zip !== session.zip) return true;
    if (data.zip_origin && data.zip_origin !== session.zip_origin) return true;
    if (data.zip_dest && data.zip_dest !== session.zip_dest) return true;
    if (data.condition && data.condition !== session.condition && !isConditionComparisonQuestion(input)) return true;
    if (data.type && data.type !== session.type) return true;
    if (data.quantity && Number(data.quantity) !== Number(session.quantity || 1)) return true;
    if (data.port_dest && data.port_dest !== session.port_dest) return true;
    if (/\b(cotiza|quote|precio del|price for|cu[aá]nto sale|how much.*(40|20|45|nuevo|usado|new|used))\b/i.test(lo)) {
        if (extractSizeFromText(input) || mentionsNewCondition(input) || mentionsUsedCondition(input)) return true;
    }
    if (session.condition === "Usado" && /\b(one[\s-]?trip|nuevo|new)\b/i.test(lo) && /\b(cotiza|quote|precio|cu[aá]nto)\b/i.test(lo)) return true;
    return false;
}

/** Customer is questioning or comparing prices already quoted — not requesting a new calculation. */
function isQuotedPriceClarificationQuestion(input: string, session?: any): boolean {
    if (!hasQuotedPrice(session)) return false;
    const lo = (input || "").toLowerCase();
    const cheaperWord = /\b(m[aá]s\s*barat[oa]s?|m[aá]s\s*car[oa]s?|cheaper|more\s*expensive)\b/.test(lo);
    const priceWord = /\b(precios?|price|prices|cotizaci[oó]n|quote|costo|cost|cuesta)\b/.test(lo);

    // Explicit complaint that the quote we already sent looks wrong
    if (/\b(precios?\s*(mal|incorrect\w*|equivoc\w*|erron\w*)|wrong\s*price|prices?\s*(are\s*)?wrong|te\s*(equivoc\w*|confund\w*)|pasaste\s*(los\s*)?(precios?\s*)?(mal|incorrect\w*)|error\s*en\s*(los\s*)?precios?)\b/.test(lo)) return true;
    if (/\b(por\s*qu[eé]|why)\b/.test(lo) && cheaperWord) return true;

    // A clear choice or confirmation is never a price complaint ("no está bien, quiero el de 40'")
    if (isReadyToProceed(input, session)) return false;
    if (statesProductChoice(input)) return false;
    // Asking the price of a condition is handled by a real re-quote, not an explanation
    if (conditionPriceRequestFromInput(input, session)) return false;

    const isQuestion = /\?/.test(input) || /\b(no\?|verdad|cierto|right)\s*$/i.test(lo.trim());
    if (isQuestion && priceWord && /\b(est[aá]n?\s*(bien|correctos?|correctas?)|is\s*that\s*right|are\s*you\s*sure|seguro)\b/.test(lo)) return true;
    if (cheaperWord && /\b(20|40|45|veinte|cuarenta|cuarenta\s*y\s*cinco)\b/.test(lo)) return true;
    if (/\b(diferencia|difference)\b/.test(lo) && priceWord) return true;
    return false;
}

/**
 * Whether we already sent a price for this size. Quoted prices are keyed "size|condition",
 * so when a condition is given it must match too — switching from new to used is a real
 * re-quote even though the size was already priced.
 */
function sizeAlreadyInQuotedSet(session: any, size: string, condition?: string | null): boolean {
    if (!size || !hasQuotedPrice(session)) return false;
    const norm = normalizeSizeKey(size);
    const meta = parseQuotePriceMeta(session);
    const keys = Object.keys(meta.quoted_prices || {});
    if (condition === "Nuevo" || condition === "Usado") {
        return keys.includes(`${norm}|${condition}`);
    }
    if (keys.some((k) => k.startsWith(norm))) return true;
    if (session?.size === "20' & 40'" && (norm.startsWith("20") || norm.startsWith("40"))) return true;
    return false;
}

function buildQuotedPriceClarificationReply(input: string, lang: string, session: any): string | null {
    if (!isQuotedPriceClarificationQuestion(input, session)) return null;
    const lo = (input || "").toLowerCase();
    const meta = parseQuotePriceMeta(session);
    const qp = meta.quoted_prices || {};
    const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
    const type = session?.type || "Dry";
    const p20 = qp["20std|Usado"] ?? qp["20std|Nuevo"] ?? qp["20hc|Usado"] ?? qp["20hc|Nuevo"]
        ?? lastQuotedAmountForSize(session, /20'/);
    const p40 = qp["40hc|Usado"] ?? qp["40std|Usado"] ?? qp["40hc|Nuevo"] ?? qp["40std|Nuevo"]
        ?? lastQuotedAmountForSize(session, /40'/);
    const asksIf40Cheaper = /\b(40|cuarenta)\b/.test(lo) && /\b(m[aá]s\s*barato|cheaper)\b/.test(lo);
    const asksIf20Cheaper = /\b(20|veinte)\b/.test(lo) && /\b(m[aá]s\s*barato|cheaper)\b/.test(lo);
    const priceDoubt = /\b(mal|wrong|error|equivoc\w*|correct\w*|pasaste|confund\w*)\b/.test(lo);

    if (!priceDoubt && (asksIf40Cheaper || asksIf20Cheaper || /\b(m[aá]s\s*barato|m[aá]s\s*caro|cheaper|more\s*expensive)\b/.test(lo))) {
        if (lang === "ES") {
            let msg = asksIf40Cheaper
                ? "Sí, **en esta cotización el 40' es más económico que el 20'** — y es completamente normal.\n\n"
                : "Sí, **en esta cotización el 20' sale más económico que el 40'**.\n\n";
            if (type === "Reefer") {
                msg += "En **contenedores refrigerados usados** el precio no siempre sube con el tamaño: el 20' suele ser más escaso en inventario, y eso puede hacerlo más caro que un 40' aunque sea más chico.\n\n";
            } else {
                msg += "El precio final depende de la unidad disponible en el hub más cercano y la logística de entrega — no siempre el contenedor más grande cuesta más.\n\n";
            }
            if (p20 != null && p40 != null) {
                msg += `Los precios que te cotizamos son **20': ${fmt(p20)}** y **40': ${fmt(p40)}** — ambos correctos con entrega incluida.\n\n`;
            }
            msg += "Si quieres seguir con alguno o tienes otra duda, con gusto te ayudo.";
            return msg;
        }
        let msg = asksIf40Cheaper
            ? "Yes — **in this quote the 40' is more affordable than the 20'**, and that's completely normal.\n\n"
            : "Yes — **in this quote the 20' is more affordable than the 40'**.\n\n";
        if (type === "Reefer") {
            msg += "For **used reefers**, price doesn't always scale with size: 20-foot units are often scarcer in inventory, which can make them cost more than a 40'.\n\n";
        } else {
            msg += "Final pricing depends on what's available at the nearest hub and delivery logistics — bigger doesn't always mean more expensive.\n\n";
        }
        if (p20 != null && p40 != null) {
            msg += `The prices I quoted were **20': ${fmt(p20)}** and **40': ${fmt(p40)}** — both accurate with delivery included.\n\n`;
        }
        msg += "Happy to help if you want to move forward with either size or have more questions.";
        return msg;
    }

    if (lang === "ES") {
        let msg = "No, **no te pasé mal los precios** — son los reales con contenedor + flete incluido para tu ZIP.\n\n";
        if (type === "Reefer") {
            msg += "En **contenedores refrigerados usados** es totalmente normal que un **20' cueste más que un 40'**: los de 20' suelen ser más escasos en inventario y el costo final depende de la unidad disponible y la logística de entrega, no solo del tamaño.\n\n";
        } else {
            msg += "El precio final depende de la unidad disponible en el hub más cercano, la distancia de entrega y la demanda de cada medida — no siempre el más grande es más caro.\n\n";
        }
        if (p20 != null && p40 != null) {
            msg += `Los precios que te cotizamos son **20': ${fmt(p20)}** y **40': ${fmt(p40)}** — ambos son correctos.\n\n`;
        }
        msg += "Si quieres seguir con alguno o tienes otra duda, con gusto te ayudo.";
        return msg;
    }

    let msg = "No — **the prices are correct**. They include the container plus delivery to your ZIP with no hidden fees.\n\n";
    if (type === "Reefer") {
        msg += "For **used reefers**, it's normal for a **20' to cost more than a 40'**: 20-foot units are often scarcer in inventory, and the final price depends on what's available and delivery logistics — not just size.\n\n";
    } else {
        msg += "Final pricing depends on which unit is available at the nearest hub, delivery distance, and demand for each size — bigger doesn't always mean more expensive.\n\n";
    }
    if (p20 != null && p40 != null) {
        msg += `The prices I quoted were **20': ${fmt(p20)}** and **40': ${fmt(p40)}** — both are accurate.\n\n`;
    }
    msg += "Happy to help if you want to move forward with either size or have more questions.";
    return msg;
}

function buildPostQuoteFallbackReply(input: string, lang: string, session: any): string | null {
    const clarification = buildQuotedPriceClarificationReply(input, lang, session);
    if (clarification) return clarification;
    return buildSideQuestionReply(input, lang, session);
}

/**
 * Answers a side question the customer asked alongside something else (leaks/WWT, payment,
 * discounts, "are we talking about buying?"). When `beforeQuote` is set the answer is going
 * to be prepended to a price message, so it must not close with its own call to action.
 */
function buildSideQuestionReply(input: string, lang: string, session: any, beforeQuote = false): string | null {
    const lo = (input || "").toLowerCase();
    if (/\b(hablamos|talking about|trata de|se trata)\b/.test(lo) && /\b(compra|comprar|buy|renta|alquilar|rent)\b/.test(lo)) {
        const size = session?.size ? ` ${session.size}` : "";
        const cond = session?.condition === "Usado"
            ? (lang === "ES" ? " usado" : " used")
            : session?.condition === "Nuevo"
                ? (lang === "ES" ? " nuevo" : " new")
                : "";
        if (session?.action === "Alquilar") {
            return lang === "ES"
                ? `Sí, estamos hablando de **renta** de un contenedor${cond}${size}. Si te queda otra duda, pregúntame con confianza.`
                : `Yes — we're discussing **rent** of a${cond}${size} container. If you have any other questions, feel free to ask.`;
        }
        return lang === "ES"
            ? `Sí, estamos hablando de la **compra** de un contenedor${cond}${size}. Si te queda otra duda, pregúntame con confianza.`
            : `Yes — we're discussing the **purchase** of a${cond}${size} container. If you have any other questions, feel free to ask.`;
    }
    if (/\b(descuentos?|discounts?|jubilad\w*|senior|militar\w*|military|veteran\w*|first responder|retirad\w*)\b/.test(lo)) {
        return lang === "ES"
            ? "Nuestros precios ya son los más bajos del mercado mayorista, sin márgenes ocultos. No manejamos descuentos adicionales por jubilación, militares ni similares — el precio que te cotizamos es el final."
            : "Our prices are already the lowest wholesale rates with no hidden margins. We don't offer additional senior, military, or similar discounts — the price we quoted is final.";
    }
    if (/\b(filtraci\w*|gotera\w*|leaks?|leaking|water tight|wwt|est[aá]nch\w*|sellad\w*)\b/.test(lo)) {
        const chose = statesProductChoice(input) && !beforeQuote;
        if (lang === "ES") {
            let msg = "Todos nuestros contenedores usados son **Wind & Water Tight (WWT)**: sin filtraciones, puertas que sellan bien y estructura sólida. Además incluyen **garantía estructural WWT de 6 meses**.";
            if (chose) msg += "\n\n¡Perfecto entonces! Cuando quieras avanzar con el 40' usado, dime tu **nombre completo** y armo la orden.";
            return msg;
        }
        let msg = "All our used containers are **Wind & Water Tight (WWT)**: no leaks, doors seal properly, and the structure is sound. They also include a **6-month WWT structural guarantee**.";
        if (chose) msg += "\n\nSounds good! Whenever you're ready to move forward with the used 40', send me your **full name** and I'll set up the order.";
        return msg;
    }
    if (/\b(pagos?|pagar|pago inicial|pay|paying|payment|zelle|efectivo|cash|cu[aá]ndo pago|when do i pay|tengo que pagar|do i pay|forma de pago|payment method)\b/.test(lo)) {
        if (session?.action === "Alquilar") {
            return lang === "ES"
                ? "Para renta, el **pago inicial** (primer mes + logística) se realiza **al momento de la entrega**. Aceptamos **efectivo** o **Zelle**."
                : "For rent, the **initial payment** (first month + logistics) is due **at delivery**. We accept **cash** or **Zelle**.";
        }
        return lang === "ES"
            ? "El pago se realiza **al momento de la entrega**. Aceptamos **efectivo** o **Zelle**. Si prefieres tarjeta o cheque, debe pagarse por completo **antes** de que el camión salga de nuestro patio."
            : "Payment is due **at delivery**. We accept **cash** or **Zelle**. If you prefer card or check, it must be paid in full **before** the truck leaves our yard.";
    }
    return null;
}

function historyAlreadyQuotedCondition(history: any, condition: "Nuevo" | "Usado"): boolean {
    if (!Array.isArray(history)) return false;
    const patterns = condition === "Nuevo"
        ? [/\b(nuevo|new)\b/i, /one-trip/i]
        : [/\b(usado|used)\b/i, /\bwwt\b/i];
    // The used-price message ends with an offer to quote new units. That offer is not a
    // quote, so strip it before deciding which conditions we have actually priced.
    const upsell = /(si prefieres one-trip nuevo[^\n]*|if you'd prefer a brand-new one-trip unit[^\n]*)/gi;
    for (const h of history) {
        if (h?.role !== "assistant" || !h.content) continue;
        const text = h.content.replace(upsell, "");
        if (!/\$\d|precio total|total price|delivered to|entregado en/i.test(text)) continue;
        if (patterns.some((p) => p.test(text))) return true;
    }
    return false;
}

function sessionQuotedConditions(session: any): ("Nuevo" | "Usado")[] {
    if (Array.isArray(session?.quoted_conditions) && session.quoted_conditions.length > 0) {
        return session.quoted_conditions.filter((c: string) => c === "Nuevo" || c === "Usado");
    }
    const found: ("Nuevo" | "Usado")[] = [];
    if (historyAlreadyQuotedCondition(session?.history, "Nuevo")) found.push("Nuevo");
    if (historyAlreadyQuotedCondition(session?.history, "Usado")) found.push("Usado");
    return found;
}

function resolveContainerSizeKey(itemSize: string, itemType: string, isNew: boolean, reeferStatus?: string): string {
    if (itemSize === "20' STD" || itemSize === "20'") {
        if (itemType === "Reefer") return isNew ? "20new" : (reeferStatus === "No Funcionando" ? "20nofunc" : "20func");
        if (itemType === "Open Side") return "20side";
        if (itemType === "Double Door") return "20dd";
        return "20std";
    }
    if (itemSize === "20' HC") {
        if (itemType === "Reefer") return isNew ? "20new" : (reeferStatus === "No Funcionando" ? "20nofunc" : "20func");
        if (itemType === "Open Side") return "20side";
        if (itemType === "Double Door") return "20dd";
        return "20hc";
    }
    if (itemSize === "40' STD") {
        if (itemType === "Reefer") return isNew ? "40new" : (reeferStatus === "No Funcionando" ? "40nofunc" : "40func");
        if (itemType === "Open Side") return "40side";
        if (itemType === "Double Door") return "40dd";
        return "40std";
    }
    if (itemSize === "40' HC" || itemSize === "40'") {
        if (itemType === "Reefer") return isNew ? "40new" : (reeferStatus === "No Funcionando" ? "40nofunc" : "40func");
        if (itemType === "Open Side") return "40side";
        if (itemType === "Double Door") return "40dd";
        return "40hc";
    }
    if (itemSize === "45' HC" || itemSize === "45'" || itemSize === "45" || (itemSize && itemSize.includes("45"))) {
        return "45hc";
    }
    return "";
}

async function probeNewStockAvailable(session: any, itemSize: string, itemType: string = "Dry"): Promise<boolean> {
    const cacheKey = `${itemSize}|${itemType}|${session.zip}`;
    if (session?.new_stock_cache && typeof session.new_stock_cache[cacheKey] === "boolean") {
        return session.new_stock_cache[cacheKey];
    }
    const sizeKey = resolveContainerSizeKey(itemSize, itemType, true, session.reefer_status);
    if (!sizeKey || !session.zip) return false;
    const { data, error } = await supabase.functions.invoke("calculate-quote", {
        body: {
            operation_mode: "sale",
            condition: "new",
            zip_destino: session.zip,
            container_size: sizeKey,
            quantity: 1,
        },
    });
    const available = !error && !data?.error && !data?.requires_manual_quote && (data?.total_price || 0) > 0;
    return available;
}

function lastQuotedAmountForCondition(session: any, condition: "Nuevo" | "Usado"): number | null {
    if (session?.condition === condition && session.final_amount != null) return Number(session.final_amount);
    if (!Array.isArray(session?.history)) return null;
    const pattern = condition === "Usado" ? /\b(usado|used)\b/i : /\b(nuevo|new)\b/i;
    for (let i = session.history.length - 1; i >= 0; i--) {
        const h = session.history[i];
        if (h?.role !== "assistant" || !h.content || !pattern.test(h.content)) continue;
        const m = h.content.match(/\*\*\$?([\d,]+)\*\*|\$\s?([\d,]+)/);
        if (m) return Number((m[1] || m[2]).replace(/,/g, ""));
    }
    return null;
}

/** 20' HC container prices (bot-only) — delivery/freight comes from calculate-quote */
const HC20_BOT = { used: 2900, new: 4450 } as const;
const MIAMI_HUB_ZIP = "33178";

function isMiamiAreaZip(zip?: string | null): boolean {
    if (!zip || zip.length !== 5) return false;
    const p3 = zip.substring(0, 3);
    const p4 = zip.substring(0, 4);
    return p3 === "331" || p3 === "332" || p4 === "3301" || p4 === "3303" || p4 === "3305";
}

function is20StdHcQuestion(input: string, session: any): boolean {
    if (historyHasHcInfo(session)) return false;
    if (isStdHcComparisonQuestion(input, session)) return false;
    if (isHcStockCheckRequest(input, session)) return false;
    const lo = (input || "").toLowerCase().trim();
    if (!/\b(hc|high\s*cube|highcube)\b/.test(lo)) return false;
    if (extractSizeFromText(input) === "20' HC") return false;
    if (/\b(quiero|need|want|busco|cotiza|quote|precio de un|price for a)\b/.test(lo) && /\b20/.test(lo)) return false;
    const size = (session?.size || "").replace(" STD", "");
    return size.includes("20") && !size.includes("HC");
}

/** Customer asks what is different between STD and HC — educational, not a new quote. */
function isStdHcComparisonQuestion(input: string, session?: any): boolean {
    const lo = (input || "").toLowerCase().trim();
    if (/\b(precio|price|cu[aá]nto|cuesta|how much|cost|cotiza|quote)\b/.test(lo)
        && !/\b(diferencia|difference|qu[eé] es|what is|what's|para qu[eé]|what for)\b/.test(lo)) {
        return false;
    }
    const comparisonWords = /\b(diferencia|difference|diferencias|differences|cu[aá]l es (la )?diferencia|what('s| is) the difference|qu[eé] diferencia|cu[aá]l es mejor|which (one|is) better|para qu[eé] sirve|what is (a |an )?hc|qu[eé] es (un )?hc|m[aá]s alto|m[aá]s espacio|more (space|height|headroom|vertical)|extra (foot|height)|un pie m[aá]s|taller|higher)\b/.test(lo);
    const mentionsStd = mentionsStdSize(input) || /\b(std|est[aá]ndar|standard|8'6|8[\s'"]6)\b/.test(lo);
    const mentionsHc = mentionsHcSize(input) || /\b(hc|high\s*cube|highcube|9'6|9[\s'"]6)\b/.test(lo);
    const mentionsBothSizes = (mentionsStd && mentionsHc)
        || /\b(ambos|both|los dos|entre (ellos|esos|estos|uno y otro)|between (them|these|those|the two))\b/.test(lo);
    const in20Context = /\b20/.test(lo)
        || (session?.size || "").includes("20")
        || historyLooksLike(session?.history, ["20' STD", "20' HC", "20' HC", "20'"]);
    if (!comparisonWords) return false;
    if (mentionsBothSizes && in20Context) return true;
    if (/\b(ambos|both|los dos)\b/.test(lo) && /\b(contenedor|container)\b/.test(lo) && in20Context) return true;
    if (comparisonWords && mentionsStd && mentionsHc) return true;
    return false;
}

/** Open question mid-flow — answer with AI, do not skip to the next structured step. */
function isOpenEducationalQuestion(input: string, session?: any): boolean {
    if (isQuotedPriceClarificationQuestion(input, session)) return true;
    if (isStdHcComparisonQuestion(input, session)) return true;
    if (isConditionComparisonQuestion(input)) return true;
    if (isZipCorrectionMessage(input, session)) return false;
    const lo = (input || "").toLowerCase().trim();
    if (isReadyToProceed(input, session)) return false;
    if (/\b(descuentos?|discounts?|jubilad\w*|senior|militar\w*|military|filtraci\w*|gotera\w*|leaks?|garant\w*|warranty|pagos?|payment|zelle|efectivo|cash)\b/.test(lo)) return true;
    if (/\b(por favor|please)\b/.test(lo) && /\b(sin|no |without|que no)\b/.test(lo)) return true;
    if (/\b(diferencia|difference|explica|explain|funciona|works|incluye|include|entrega|delivery|demora|tarda|cu[aá]ndo|when|recomiendas?|recommend|transformador|transformer|voltaje|voltage|440|open side|double door|doble puerta|puertas laterales)\b/.test(lo)) return true;
    if (hasQuotedPrice(session) && !wantsQuoteRecalculation(input, session || {}, {}, { alternateSizeRequested: false, asksAlternatePrice: false, stdHcComparison: false, conditionComparison: false })) {
        if (/\?/.test(input) || lo.length > 15) return true;
    }
    const hasQuestion = /\?/.test(input) || /\b(no\?|verdad|right|cierto)\s*$/i.test(lo);
    if (!hasQuestion) return false;
    if (extractZipFromText(input)) return false;
    if (/\b(proceder|proceed|s[ií], proceder|yes, proceed)\b/.test(lo)) return false;
    if (extractSizeFromText(input) && /\b(cu[aá]nto|precio|price|how much|cuesta|cost)\b/.test(lo)) return false;
    return /\b(por qu[eé]|why|how|qu[eé]|what|cu[aá]l|which|incluye|include|tarda|long|demora|foto|pago|payment|garant|warranty|funciona|works|entrega|delivery|retir|pick|barato|caro|cheaper|expensive|usado|used|nuevo|new|one[\s-]?trip|log[ií]stica|logistics|mensual|monthly|minimo|minimum|contrato|contract|deposito|deposit|recomiendas?|recommend|tienen|do you|hacen)\b/.test(lo);
}

function buildConditionComparisonReply(lang: string, session: any): string {
    const isRent = session?.action === "Alquilar";
    if (lang === "ES") {
        if (isRent) {
            return "Sí, en **renta** el contenedor **usado (WWT)** suele tener una **mensualidad más baja** que uno **nuevo (one-trip)**. El usado es ideal para almacenamiento en patio; el nuevo es más reciente y suele verse mejor.\n\nLa logística (entrega + recogida futura) se cotiza aparte según tu ZIP.";
        }
        return "Sí, en **compra** el contenedor **usado (WWT)** suele ser **más económico** que uno **nuevo (one-trip)**. El usado está certificado para almacenamiento; el nuevo es prácticamente sin uso previo.";
    }
    if (isRent) {
        return "Yes — for **rent**, a **used (WWT)** container usually has a **lower monthly rate** than a **new (one-trip)** unit. Used is great for yard storage; new is newer and typically looks better.\n\nLogistics (delivery + future pickup) is quoted separately based on your ZIP.";
    }
    return "Yes — for **purchase**, a **used (WWT)** container is usually **more affordable** than a **new (one-trip)** unit. Used is certified for storage; new is essentially one prior trip from the factory.";
}

function historyHasStdHcComparison(session: any): boolean {
    return historyLooksLike(session?.history, ["std_hc_compare", "8'6\" de altura", "8'6\" height", "one foot taller", "un pie m"]);
}

function lastQuotedAmountForSize(session: any, sizeNeedle: RegExp): number | null {
    if (!Array.isArray(session?.history)) return null;
    for (let i = session.history.length - 1; i >= 0; i--) {
        const h = session.history[i];
        if (h?.role !== "assistant" || !h.content) continue;
        if (!sizeNeedle.test(h.content)) continue;
        if (!/\$\d|precio total|total price/i.test(h.content)) continue;
        const m = h.content.match(/\*\*\$?([\d,]+)\*\*|\$\s?([\d,]+)/);
        if (m) return Number((m[1] || m[2]).replace(/,/g, ""));
    }
    return null;
}

function buildStdHcComparisonReply(lang: string, session: any, dict: any): string {
    const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
    const zip = session?.zip || "";
    let stdPrice = quotedPriceFromSession(session, "20std")
        ?? lastQuotedAmountForSize(session, /20'\s*STD/i);
    let hcPrice = quotedPriceFromSession(session, "20hc")
        ?? lastQuotedAmountForSize(session, /20'\s*HC/i);
    const curKey = normalizeSizeKey(session?.size || "");
    if (session?.final_amount != null) {
        if (curKey === "20std" && stdPrice == null) stdPrice = Number(session.final_amount);
        if (curKey === "20hc" && hcPrice == null) hcPrice = Number(session.final_amount);
    }
    const cond = session?.condition === "Nuevo"
        ? (lang === "ES" ? "Nuevo" : "New")
        : session?.condition === "Usado"
            ? (lang === "ES" ? "Usado" : "Used")
            : "";

    if (lang === "ES") {
        let msg = "**20' STD (estándar)** mide **8'6\"** de alto interior. **20' HC (High Cube)** mide **9'6\"** — **un pie más** de altura.\n\n";
        msg += "Para almacenamiento en patio o terreno, el **STD suele ser más que suficiente** y normalmente más económico. El **HC** tiene sentido si necesitas **más volumen vertical** (estanterías altas, equipos más grandes, etc.).\n\n";
        if (stdPrice != null || hcPrice != null) {
            msg += "Con los precios que ya te compartí";
            if (zip) msg += ` para el ZIP **${zip}**`;
            msg += ":\n\n";
            if (stdPrice != null) msg += `🔹 20' STD${cond ? ` ${cond}` : ""}: **${fmt(stdPrice)}**\n`;
            if (hcPrice != null) msg += `🔹 20' HC${cond ? ` ${cond}` : ""}: **${fmt(hcPrice)}**\n`;
            msg += "\n";
        }
        msg += "¿Con cuál te gustaría seguir?";
        if (hcPrice != null) msg += dict.hc_stock_disclaimer;
        return msg;
    }

    let msg = "**20' STD (standard)** is **8'6\"** tall inside. **20' HC (High Cube)** is **9'6\"** — **one foot taller**.\n\n";
    msg += "For yard or property storage, **STD is usually more than enough** and typically more affordable. **HC** makes sense when you need **extra vertical space** (tall shelving, larger equipment, etc.).\n\n";
    if (stdPrice != null || hcPrice != null) {
        msg += "Based on the prices I already shared";
        if (zip) msg += ` for ZIP **${zip}**`;
        msg += ":\n\n";
        if (stdPrice != null) msg += `🔹 20' STD${cond ? ` ${cond}` : ""}: **${fmt(stdPrice)}**\n`;
        if (hcPrice != null) msg += `🔹 20' HC${cond ? ` ${cond}` : ""}: **${fmt(hcPrice)}**\n`;
        msg += "\n";
    }
    msg += "Which one would you like to proceed with?";
    if (hcPrice != null) msg += dict.hc_stock_disclaimer;
    return msg;
}

function historyHasHcInfo(session: any): boolean {
    return historyLooksLike(session?.history, ["hc_info", "precios de referencia", "reference prices", "consultemos stock de hc", "check hc stock"]);
}

function isHcStockCheckRequest(input: string, session?: any): boolean {
    const lo = (input || "").toLowerCase().trim();
    const mentionsHc = /\b(hc|high\s*cube|highcube)\b/.test(lo);
    const stockIntent = /\b(stock|disponib|available|inventario|avisame|avísame|avisar|notify|let me know|confirmar|consultar|consultemos|chequear|verificar|check|conseguir|conseguirme|me avis|me avises)\b/.test(lo);
    const hasQuestion = /\b(tienen|tienes|have|hay|if you have|si tienen|si hay)\b/.test(lo);

    if (mentionsHc && (stockIntent || (hasQuestion && /\b(nuevo|new|usado|used)\b/.test(lo)))) return true;
    if (mentionsHc && /\b(avisame|avísame|notify me)\b/.test(lo)) return true;

    if (session && historyHasHcInfo(session)) {
        if (/\b(consultemos stock|check stock|confirmar stock|consultar stock)\b/.test(lo)) return true;
        if (stockIntent && mentionsHc) return true;
        if (/\b(avisame|avísame|notify|let me know)\b/.test(lo)) return true;
        if (hasQuestion && mentionsHc) return true;
    }
    return false;
}

function resolveHcStockInterest(input: string, session?: any): "Nuevo" | "Usado" {
    if (mentionsUsedCondition(input) && !mentionsNewCondition(input)) return "Usado";
    if (mentionsNewCondition(input)) return "Nuevo";
    if (session?.hc_stock_interest === "Usado" || session?.hc_stock_interest === "Nuevo") return session.hc_stock_interest;
    return "Nuevo";
}

function hcCondLabel(lang: string, cond: "Nuevo" | "Usado"): string {
    if (lang === "ES") return cond === "Nuevo" ? "nuevo (one-trip)" : "usado";
    return cond === "Nuevo" ? "new (one-trip)" : "used";
}

async function tryHcStockHandoff(
    senderId: string,
    session: any,
    lang: string,
    dict: any,
    input: string,
    data: any,
    actions: Action[],
): Promise<boolean> {
    if (!isHcStockCheckRequest(input, session)) return false;
    if (!historyHasHcInfo(session) && !/\b(hc|high\s*cube)\b/i.test(input)) return false;

    if (session.hc_stock_pending && !session.lead_name && Number(session.step) === 7) {
        actions.push({ type: "text", text: dict.ask_name });
        return true;
    }

    const interest = resolveHcStockInterest(input, session);
    const condLabel = hcCondLabel(lang, interest);
    const zip = session.zip || "—";

    if (session.lead_name && session.lead_phone) {
        const desc = `HC STOCK CHECK via AI Bot. Customer requests 20' HC ${interest} availability at ZIP ${zip}. STD quoted: ${session.condition || ""} ${session.size || ""} $${session.final_amount || "?"}. Message: "${input}"`;
        await supabase.from("call_logs").insert([{
            customer: session.lead_name,
            phone: session.lead_phone,
            service_type: "HC Stock Check",
            city: "---",
            description: desc,
            created_by: "AI BOT",
            source: "chatbot",
            status: "PENDING",
            date: new Date().toISOString().split("T")[0],
            next_call_date: new Date().toISOString().split("T")[0],
            amount: null,
            zip_code: session.zip,
            measures: "20' HC",
            language: mapCallLanguage(lang),
        }]);
        const done = dict.hc_stock_done.replace("{cond}", condLabel);
        await updateSession(senderId, { step: -1, hc_stock_pending: false, hc_stock_interest: interest });
        await appendHistory(senderId, session, done, "hc_stock_done");
        actions.push({ type: "text", text: done });
        return true;
    }

    if (session.lead_name && !session.lead_phone) {
        await updateSession(senderId, { step: 8, hc_stock_pending: true, hc_stock_interest: interest });
        actions.push({ type: "text", text: dict.ask_phone.replace("{name}", session.lead_name) });
        return true;
    }

    const intro = historyHasHcInfo(session)
        ? dict.hc_stock_repeat_short
        : dict.hc_stock_handoff_intro.replace("{cond}", condLabel).replace("{zip}", zip);
    await updateSession(senderId, { step: 7, hc_stock_pending: true, hc_stock_interest: interest });
    await appendHistory(senderId, session, intro, "hc_stock_handoff");
    actions.push({ type: "text", text: intro });
    return true;
}

function build20HcInfoReply(lang: string, session: any, dict: any): string {
    const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
    const zip = session?.zip || "";
    const miami = isMiamiAreaZip(zip);
    if (lang === "ES") {
        let msg = "Los contenedores de 20' que cotizamos son **estándar (8'6\" de altura)**, no High Cube (9'6\").\n\n";
        msg += "Si te interesa **20' HC**, precios de referencia *(debemos confirmar stock — no los tenemos siempre como el STD)*:\n\n";
        msg += miami
            ? `🔹 Usado 20' HC: **${fmt(HC20_BOT.used)}** (entrega desde hub de **Miami**)\n`
            : `🔹 Usado 20' HC: **${fmt(HC20_BOT.used)}** *(solo entrega desde hub de **Miami**; tu ZIP ${zip || "—"} queda fuera de esa zona)*\n`;
        msg += `🔹 Nuevo 20' HC (one-trip): **${fmt(HC20_BOT.new)}** + flete según ZIP *(desde cualquier hub)*\n\n`;
        msg += "¿Te gustaría proceder con el STD que ya cotizamos o que consultemos stock de HC?";
        return msg;
    }
    let msg = "The 20' containers we quoted are **standard height (8'6\")**, not High Cube (9'6\").\n\n";
    msg += "If you're interested in **20' HC**, here are **reference prices** *(stock must be confirmed — HC is not always available like STD)*:\n\n";
    msg += miami
        ? `🔹 Used 20' HC: **${fmt(HC20_BOT.used)}** (delivery from **Miami** hub only)\n`
        : `🔹 Used 20' HC: **${fmt(HC20_BOT.used)}** *(Miami hub delivery only; your ZIP ${zip || "—"} is outside that zone)*\n`;
    msg += `🔹 New 20' HC (one-trip): **${fmt(HC20_BOT.new)}** + delivery by ZIP *(from any hub)*\n\n`;
    msg += "Would you like to proceed with the STD we already quoted, or should we check HC stock?";
    return msg;
}

function dedupeQuoteItems(items: any[]): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of items) {
        const key = `${item.size || ""}|${item.condition || ""}|${item.type || ""}|${item.action || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function dedupeMessages(msgs: string[]): string[] {
    const seen = new Set<string>();
    return msgs.filter((m) => {
        const key = m.replace(/\s+/g, " ").trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function wantsBothConditionsQuote(input: string): boolean {
    return /\b(ambos|both|los dos|usados?\s+y\s+nuevos?|used\s+and\s+new|y uno nuevo|y uno usado|y un usado|and a used|and a new)\b/i.test(input);
}

function syncQuoteItemsForSession(session: any, data: any, input: string): void {
    if (!session?.size || session.size === "20' & 40'") return;
    if (is20StdHcQuestion(input, session)) return;

    if (wantsBothConditionsQuote(input)) {
        const conds = new Set<"Nuevo" | "Usado">();
        for (const c of sessionQuotedConditions(session)) conds.add(c);
        if (session.condition === "Nuevo" || session.condition === "Usado") conds.add(session.condition);
        if (mentionsNewCondition(input)) conds.add("Nuevo");
        if (mentionsUsedCondition(input) && !isConditionComparisonQuestion(input)) conds.add("Usado");
        if (data.condition === "Nuevo" || data.condition === "Usado") conds.add(data.condition);
        if (conds.size >= 2) {
            session.items = [...conds].map((condition) => ({
                size: session.size,
                action: session.action,
                condition,
                type: session.type || "Dry",
            }));
            data.items = session.items;
            return;
        }
    }

    if (data.condition && !extractSizeFromText(input)) {
        session.items = [{
            size: session.size,
            action: session.action,
            condition: data.condition,
            type: session.type || "Dry",
        }];
        data.items = session.items;
    }
}

type HcBotQuoteResult =
    | { ok: true; price: number; containerPrice: number; deliveryPrice: number; disclaimer: boolean }
    | { ok: false; message: string; needsInsist?: boolean; needsCondition?: boolean };

function isHcUsedInsistRequest(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    if (["cotizar hc usado", "quote used hc", "cotizar hc", "quote hc"].includes(lo)) return true;
    return /\b(cotiza(r)?\s+(el\s+)?hc(\s+usado)?|precio\s+igual|igual\s+quiero|insisto|dame\s+el\s+precio|with delivery|con\s+flete|quote it anyway|cotizar\s+igual)\b/.test(lo);
}

function roundPrice25(n: number): number {
    return Math.ceil(n / 25) * 25;
}

async function fetch20HcDelivery(session: any, fromMiamiHub: boolean): Promise<{ delivery: number; error?: boolean }> {
    const zip = session?.zip;
    if (!zip || zip.length !== 5) return { delivery: 0, error: true };

    if (fromMiamiHub) {
        const { data, error } = await supabase.functions.invoke("calculate-quote", {
            body: {
                operation_mode: "transport_only",
                zip_origen: MIAMI_HUB_ZIP,
                zip_destino: zip,
                container_size: "20hc",
                quantity: 1,
            },
        });
        if (error || data?.error) return { delivery: 0, error: true };
        return { delivery: Number(data.total_price) || 0 };
    }

    const { data, error } = await supabase.functions.invoke("calculate-quote", {
        body: {
            operation_mode: "sale",
            condition: "new",
            zip_destino: zip,
            container_size: "20std",
            quantity: 1,
        },
    });
    if (error || data?.error) return { delivery: 0, error: true };
    if (data.delivery_cost != null) return { delivery: Number(data.delivery_cost) || 0 };
    if (data.total_price != null && data.container_price != null) {
        return { delivery: Math.max(0, Number(data.total_price) - Number(data.container_price)) };
    }
    return { delivery: 0, error: true };
}

async function build20HcBotQuoteAsync(
    item: any,
    session: any,
    lang: string,
    fmt: (n: number) => string,
    dict: any,
    input: string,
): Promise<HcBotQuoteResult> {
    if (item.condition !== "Nuevo" && item.condition !== "Usado") {
        return { ok: false, needsCondition: true, message: dict.ask_condition };
    }
    const isNew = item.condition === "Nuevo";
    const zip = session.zip || "";
    const containerPrice = isNew ? HC20_BOT.new : HC20_BOT.used;

    if (!isNew && !isMiamiAreaZip(zip) && !session.hc_used_force_quote && !isHcUsedInsistRequest(input)) {
        return {
            ok: false,
            needsInsist: true,
            message: dict.hc_used_far_miami_warn.replace("{zip}", zip),
        };
    }

    const { delivery, error } = await fetch20HcDelivery(session, !isNew);
    if (error || delivery <= 0) {
        return {
            ok: false,
            message: lang === "ES"
                ? "No pude calcular el flete para ese ZIP. ¿Verificas el código postal o prefieres otro tamaño?"
                : "I couldn't calculate delivery for that ZIP. Please double-check it or try another size.",
        };
    }

    const total = roundPrice25(containerPrice + delivery);
    return {
        ok: true,
        price: total,
        containerPrice,
        deliveryPrice: delivery,
        disclaimer: true,
    };
}

function parseTransportOption(text: string): "Flexible" | "Inmediato" | null {
    const lo = (text || "").toLowerCase().trim();
    if (["inmediato", "immediate"].includes(lo)) return "Inmediato";
    if (["flexible", "en ruta"].includes(lo)) return "Flexible";
    return null;
}

function parseQuotePriceMeta(session: any): { flexible?: number; immediate?: number; option?: string; quoted_prices?: Record<string, number> } {
    try {
        const parsed = JSON.parse(session?.final_form_amount || "");
        if (parsed && typeof parsed === "object") return parsed;
    } catch { /* ignore */ }
    return {};
}

function quotedPriceFromSession(session: any, sizeKey: string): number | null {
    const meta = parseQuotePriceMeta(session);
    const qp = meta.quoted_prices || {};
    const cond = session?.condition === "Usado" ? "Usado" : "Nuevo";
    if (qp[`${sizeKey}|${cond}`] != null) return Number(qp[`${sizeKey}|${cond}`]);
    if (qp[`${sizeKey}|Nuevo`] != null) return Number(qp[`${sizeKey}|Nuevo`]);
    if (qp[`${sizeKey}|Usado`] != null) return Number(qp[`${sizeKey}|Usado`]);
    return null;
}

// True when both texts ask about the same thing, so we don't ask it twice in one message.
// Synonyms count as one topic: the AI saying "tamaño" and the prompt saying "medida"
// are the same question.
function asksSameTopic(a: string, b: string): boolean {
    const x = (a || "").toLowerCase();
    const y = (b || "").toLowerCase();
    const topics = [
        ["medida", "size", "tamaño", "tamano", "pies", "20'", "40'", "45'"],
        ["zip", "código postal", "codigo postal", "postal code"],
        ["vacío", "vacio", "cargado", "empty", "loaded", "carga"],
        ["usado", "used", "nuevo", "new", "one-trip", "wwt"],
    ];
    return topics.some((words) =>
        words.some((w) => x.includes(w)) && words.some((w) => y.includes(w))
    );
}

// Joins a free-form answer with a structured prompt, dropping the prompt when it would
// just repeat the question the answer already asked.
function joinWithoutRepeating(reply: string | null | undefined, prompt: string): string {
    if (!reply) return prompt;
    if (asksSameTopic(reply, prompt)) return prompt;
    return `${reply}\n\n${prompt}`;
}

function closedQuestionFollowUp(session: any, dict: any): { text: string; options: string[] } | null {
    const step = Number(session?.step) || 0;
    if (step === 6 && !session.lead_phone) {
        return { text: dict.ask_proceed_short, options: dict.proceed_btns };
    }
    if (!session.action) {
        return { text: dict.ask_service_short, options: dict.step1_btns };
    }
    if (!hasExplicitSize(session)) {
        const sizeBtns = (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dict.step3_size_btns;
        const text = session.action === "Alquilar" ? dict.step3_size_msg_rent
            : session.action === "Transporte" ? dict.step3_size_msg_transport
            : dict.step3_size_msg;
        return { text, options: sizeBtns };
    }
    if (session.action === "Transporte" && session.zip_origin && session.zip_dest && !isCompleteLoadStatus(session.load_status)) {
        return { text: dict.ask_transport_load, options: dict.ask_load_btns };
    }
    if (["Comprar", "Alquilar", "Exportacion", "Exportación"].includes(session.action) && hasExplicitSize(session) && needsConditionBeforeQuote(session)) {
        return { text: dict.ask_condition, options: dict.ask_condition_btns };
    }
    if (session.action === "Comprar" && session.type === "Reefer" && session.condition === "Usado" && !session.reefer_status) {
        return { text: dict.ask_reefer_status, options: dict.ask_reefer_status_btns };
    }
    return null;
}

function historyLooksLike(history: any, needles: string[]): boolean {
    if (!Array.isArray(history)) return false;
    const blob = history.map((h: any) => `${h.tag || ""} ${h.content || ""}`).join("\n").toLowerCase();
    return needles.some((n) => blob.includes(n.toLowerCase()));
}

function stripHtml(text: string): string {
    return text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/ +/g, " ").trim();
}

async function appendHistory(senderId: string, session: any, content: string, tag?: string) {
    const hist = Array.isArray(session.history) ? [...session.history] : [];
    hist.push({ role: "assistant", content: stripHtml(content), tag });
    const sliced = hist.slice(-10);
    session.history = sliced;
    await updateSession(senderId, { history: sliced });
}

async function processMessageInner(senderId: string, messageText: string, isHuman: boolean = false, messageId?: string, extraMids: string[] = []): Promise<Action[]> {
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
                created_by: "AI BOT",
                source: "chatbot_manual",
                status: "PENDING", 
                date: new Date().toISOString().split("T")[0],
                next_call_date: new Date().toISOString().split("T")[0],
                amount: data.amount, 
                zip_code: data.zip_code, 
                measures: data.measures,
                language: mapCallLanguage(session.lang)
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

    // Reiniciar (backup — processMessage handles this first for web/Meta)
    if (["reiniciar", "restart", "menu"].includes(input.toLowerCase().trim())) {
        const restartLang: "EN" | "ES" = session.lang === "ES" ? "ES" : "EN";
        return await resetChatSession(senderId, restartLang);
    }

    // Detectar idioma del mensaje actual (prioridad sobre sesión e IA)
    const rawHistory = session.history || [];
    let lang = detectMessageLanguage(input, session.lang, rawHistory);
    let dictCurrent = chatDict[lang];
    const isLangPick = ["español", "espanol", "es", "english", "en"].includes(input.toLowerCase());

    // Bienvenida cálida (hola/hello también cubiertos por quickDetect)
    if ((input.toLowerCase() === "hola" || input.toLowerCase() === "hello" || input.toLowerCase() === "hi") && !session.action) {
        lang = input.toLowerCase() === "hola" ? "ES" : "EN";
        dictCurrent = chatDict[lang];
        await updateSession(senderId, { step: 0, lang, action: null, condition: null, size: null, type: null, zip: null, quantity: null, history: null, quoted_conditions: null, new_stock_cache: null, hc_stock_pending: null, hc_stock_interest: null, hc_used_force_quote: null, hc_used_warn_shown: null });
        actions.push({ type: "quick_replies", text: buildWarmWelcomeReply(lang), options: dictCurrent.step1_btns });
        return actions;
    }

    if (isLangPick && !session.action && !session.size && !session.zip) {
        await updateSession(senderId, { lang });
        actions.push({ type: "quick_replies", text: dictCurrent.step1_msg, options: dictCurrent.step1_btns });
        return actions;
    }

    // ── Construir historial (últimos 16 mensajes para contexto) ──
    const recentHistory: Array<{role: string, content: string, mid?: string, mids?: string[]}> = Array.isArray(rawHistory) ? rawHistory.slice(-16) : [];
    const allMids = [messageId, ...extraMids].filter((m): m is string => !!m);
    recentHistory.push({ role: "user", content: input, mid: messageId, mids: allMids.length ? allMids : undefined });

    // ── Detección rápida (sin tokens de IA) o llamada a IA ──
    let extracted = quickDetect(input, senderId, session);
    if (!extracted || step === 7 || step === 8) {
        extracted = await callAI(recentHistory, session);
        if (!extracted) extracted = { intent: "quote", lang, extracted_data: {} };
    }

    if (extracted.lang) {
        const scores = scoreLanguage(input);
        // Solo dejar que la IA elija idioma si el mensaje actual no tiene señales claras
        if (scores.es === 0 && scores.en === 0) {
            lang = extracted.lang;
        }
        dictCurrent = chatDict[lang];
    }
    const data = extracted.extracted_data || {};
    mergeDataFromSession(session, data, input, session.history);
    applyZipCorrectionFromInput(input, session, data);
    if (!data.load_status && data.items?.[0]?.load_status) data.load_status = data.items[0].load_status;
    if (!data.action && data.items?.[0]?.action) data.action = data.items[0].action;
    applyConversationInferences(input, session.history, data);
    sanitizeInferredCondition(input, session, data);

    if (extracted.intent === "general_chat" && !isOpenEducationalQuestion(input, session) && !isQuotedPriceClarificationQuestion(input, session) && (data.size || data.action === "Comprar") && extractSizeFromText(conversationUserTexts(input, session.history).join("\n"))) {
        extracted.intent = "quote";
        extracted.ai_reply = null;
    }
    
    if (data.items && data.items.length > 0) {
        const hasSize = data.items.some((i: any) => i.size);
        if (!hasSize && session.items && session.items.length > 0) {
            const delta = data.items[0];
            const isExportSession = session.action === "Exportación" || session.action === "Exportacion";
            session.items.forEach((existingItem: any) => {
                if (delta.action) {
                    if (isExportSession && delta.action === "Transporte") {
                        // Ignore overriding action to Transporte if we are in export flow
                    } else {
                        existingItem.action = delta.action;
                    }
                }
                if (delta.export_action) existingItem.export_action = delta.export_action;
                if (delta.condition) existingItem.condition = delta.condition;
                if (delta.type) existingItem.type = delta.type;
                if (delta.reefer_status) existingItem.reefer_status = delta.reefer_status;
                if (delta.load_status) existingItem.load_status = delta.load_status;
            });
            data.items = session.items;
        } else {
            session.items = data.items;
            const isExportSession = session.action === "Exportación" || session.action === "Exportacion";
            if (isExportSession) {
                session.items.forEach((item: any) => {
                    if (item.action === "Transporte") item.action = "Exportacion";
                });
            }
        }
        
        const first = data.items[0];
        if (first.action) {
            const isExportSession = session.action === "Exportación" || session.action === "Exportacion";
            if (isExportSession && first.action === "Transporte") first.action = "Exportacion";
            data.action = first.action;
        }
        if (first.export_action) data.export_action = first.export_action;
        if (first.type) data.type = first.type;
        if (first.size) data.size = first.size;
        if (first.quantity) data.quantity = first.quantity;
        if (first.reefer_status) data.reefer_status = first.reefer_status;
        if (first.load_status) data.load_status = first.load_status;
        if (first.port_dest) data.port_dest = first.port_dest;
        
        // Sometimes AI hallucinates zip codes inside the item instead of root
        if (first.zip && !data.zip) data.zip = first.zip;
        if (first.zip_dest && !data.zip_dest) data.zip_dest = first.zip_dest;
        if (first.zip_origin && !data.zip_origin) data.zip_origin = first.zip_origin;
    }

    syncQuoteItemsForSession(session, data, input);
    sanitizeInferredCondition(input, session, data);

    const stdHcComparison = isStdHcComparisonQuestion(input, session);
    // When we can price the other condition from the database, do that instead of a generic comparison
    const otherConditionPrice = asksOtherConditionPrice(input, session);
    const conditionComparison = isConditionComparisonQuestion(input) && !otherConditionPrice;
    const openEducational = isOpenEducationalQuestion(input, session);
    const alternateSizeRequested = stdHcComparison ? false : applyAlternateSizeRequest(session, data, input);
    const asksAlternatePrice = !stdHcComparison
        && /\b(cu[aá]nto|precio|price|how much|cuesta|cost|sale)\b/i.test(input)
        && (mentionsStdSize(input) || mentionsHcSize(input) || alternateSizeRequested);

    if (isHcUsedInsistRequest(input) || ["cotizar hc usado", "quote used hc", "cotizar hc", "quote hc"].includes(input.toLowerCase().trim())) {
        session.hc_used_force_quote = true;
    }
    if (["cotizar 20' std", "cotizar 20 std", "quote 20' std", "quote 20 std"].includes(input.toLowerCase().trim())) {
        session.size = "20' STD";
        session.items = [{ size: "20' STD", action: session.action, condition: session.condition, type: session.type || "Dry" }];
        data.size = "20' STD";
        data.items = session.items;
        session.hc_used_force_quote = false;
    }

    if (step === 7 || step === 8) {
        if (!session.hc_stock_pending && (extracted.intent === "general_chat" || extracted.intent === "quote" || extracted.intent === "photos" || extracted.intent === "dimensions" || extracted.intent === "cancel")) {
            step = 6;
            await updateSession(senderId, { step: 6 });
        } else {
            if (step === 7) {
                const nameCandidate = data.customer_name || (session.hc_stock_pending && input.length > 1 ? input.trim() : null);
                if (nameCandidate) {
                    await updateSession(senderId, { lead_name: nameCandidate, step: 8 });
                    actions.push({ type: "text", text: dictCurrent.ask_phone.replace("{name}", nameCandidate) });
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
                const phoneRaw = data.customer_phone || input;
                if (phoneRaw) {
                    const cleanPhone = phoneRaw.replace(/[\s\-\(\)\+]/g, '');
                    const digitsOnly = cleanPhone.match(/\d/g);
                    if (digitsOnly && digitsOnly.length >= 10) {
                        const finalPhone = digitsOnly.join('').slice(-10);
                        
                        if (session.hc_stock_pending) {
                            const interest = (session.hc_stock_interest || "Nuevo") as "Nuevo" | "Usado";
                            const condLabel = hcCondLabel(lang, interest);
                            const desc = `HC STOCK CHECK via AI Bot. Customer requests 20' HC ${interest} availability at ZIP ${session.zip || "?"}. STD quoted: ${session.condition || ""} ${session.size || ""} $${session.final_amount || "?"}.`;
                            await updateSession(senderId, { lead_phone: finalPhone, step: -1, hc_stock_pending: false });
                            await supabase.from("call_logs").insert([{
                                customer: session.lead_name || "Unknown",
                                phone: finalPhone,
                                service_type: "HC Stock Check",
                                city: "---",
                                description: desc,
                                created_by: "AI BOT",
                                source: "chatbot",
                                status: "PENDING",
                                date: new Date().toISOString().split("T")[0],
                                next_call_date: new Date().toISOString().split("T")[0],
                                amount: null,
                                zip_code: session.zip,
                                measures: "20' HC",
                                language: mapCallLanguage(lang || session.lang),
                            }]);
                            const done = dictCurrent.hc_stock_done.replace("{cond}", condLabel);
                            actions.push({ type: "text", text: done });
                            return actions;
                        }

                        await updateSession(senderId, { lead_phone: finalPhone, step: 6 });
                        
                        const priceMeta = parseQuotePriceMeta(session);
                        const optionNote = priceMeta.option ? ` Transport option: ${priceMeta.option}.` : "";
                        await supabase.from("call_logs").insert([{
                            customer: session.lead_name || "Unknown", phone: finalPhone,
                            service_type: session.action || "Sales", city: "---",
                            description: session.action === "Exportacion" || session.action === "Exportación" ? `Order via AI Bot (EXPORT SALE). Zip: ${session.zip}. Port: ${session.port_dest}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.${optionNote}` : `Order via AI Bot. Zip: ${session.zip}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.${optionNote}`,
                            created_by: "AI BOT", source: "chatbot",
                            status: "PENDING", date: new Date().toISOString().split("T")[0],
                            next_call_date: new Date().toISOString().split("T")[0],
                            amount: session.final_amount, zip_code: session.zip, measures: session.size,
                            language: mapCallLanguage(lang || session.lang)
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

    // ── Post-quote (step 6): chat freely — re-quote only when params change ──
    // Single decision point for this phase: everything downstream reads these flags
    // instead of re-detecting the intent and risking a contradictory answer.
    const inQuotedChat = step === 6 && hasQuotedPrice(session);
    let postQuotePriceDoubt = false;
    if (inQuotedChat) {
        const lowerInput = input.toLowerCase();
        if (isReadyToProceed(input, session)) {
            extracted.intent = "proceed";
            extracted.ai_reply = null;
        } else if (wantsQuoteRecalculation(input, session, data, { alternateSizeRequested, asksAlternatePrice, stdHcComparison, conditionComparison })) {
            extracted.intent = "quote";
            extracted.ai_reply = null;
            if (otherConditionPrice) {
                // Price the other condition straight from the database instead of guessing
                data.condition = otherConditionPrice;
                if (data.items?.length) {
                    for (const item of data.items) item.condition = otherConditionPrice;
                } else {
                    data.items = [{ size: session.size, action: session.action, condition: otherConditionPrice, ...(session.type ? { type: session.type } : {}) }];
                }
            } else if (mentionsNewCondition(lowerInput) && !mentionsUsedCondition(lowerInput)) {
                data.condition = "Nuevo";
                if (data.items?.[0]) data.items[0].condition = "Nuevo";
            } else if (mentionsUsedCondition(lowerInput) && !mentionsNewCondition(lowerInput) && !conditionComparison) {
                data.condition = "Usado";
                if (data.items?.[0]) data.items[0].condition = "Usado";
            }
            if (data.condition && data.condition !== session.condition) {
                const mentionedNew = mentionsNewCondition(lowerInput);
                const mentionedUsed = mentionsUsedCondition(lowerInput);
                if (!mentionedNew && !mentionedUsed) {
                    data.condition = session.condition;
                    if (data.items?.length) data.items[0].condition = session.condition;
                }
            }
            if (data.type && data.type !== session.type) {
                const mentionedType = ["dry", "reefer", "open side", "double door", "refrigerado", "estandar"].some((kw) => lowerInput.includes(kw));
                if (!mentionedType) {
                    data.type = session.type;
                    if (data.items?.length) data.items[0].type = session.type;
                }
            }
        } else if (isPhotosRequest(input)) {
            extracted.intent = "photos";
            extracted.ai_reply = null;
        } else if (isDimensionsRequest(input)) {
            extracted.intent = "dimensions";
            extracted.ai_reply = null;
        } else if (isQuotedPriceClarificationQuestion(input, session)) {
            postQuotePriceDoubt = true;
            extracted.intent = "general_chat";
            data.size = null;
            if (data.items?.length) {
                for (const item of data.items) delete item.size;
            }
            if (!extracted.ai_reply) {
                extracted.ai_reply = buildQuotedPriceClarificationReply(input, lang, session);
            }
        } else {
            extracted.intent = "general_chat";
            if (stdHcComparison || conditionComparison || is20StdHcQuestion(input, session) || isHcStockCheckRequest(input, session)) {
                extracted.ai_reply = null;
            } else if (!extracted.ai_reply) {
                extracted.ai_reply = buildPostQuoteFallbackReply(input, lang, session);
            }
            const isExportSession = session.action === "Exportación" || session.action === "Exportacion";
            if (isExportSession && !session.port_dest && !extracted.ai_reply) {
                extracted.ai_reply = lang === "ES"
                    ? "¡Perfecto! Para poder cotizarte el transporte terrestre, por favor indícame cuál es el Zip Code (código postal) del puerto."
                    : "Perfect! To quote the inland transportation, please tell me the Zip Code of the port.";
            }
        }
    }

    // ── OVERRIDE (Removed size override to let AI handle HC vs STD) ──
    const lo = input.toLowerCase();
    
    const isExportFlow = session.action === "Exportación" || session.action === "Exportacion";
    if (isExportFlow) {
        data.export_action = "Comprar";
        if (/\b(alquilar|alquilo|rentar?|rental|lease|renta)\b/.test(lo)) {
            if (!extracted.ai_reply) {
                extracted.ai_reply = lang === "EN"
                    ? "For export we only sell the certified container (valid 1 year). We do not rent containers for ocean freight. Rentals are only for storage in the United States. We can continue with the export sale."
                    : "Para exportación solo vendemos el contenedor certificado (válido 1 año). No alquilamos contenedores para envío marítimo. El alquiler es solo para almacenamiento en Estados Unidos. Podemos continuar con la venta para exportación.";
            }
        }

        // Heuristic: If we are in step 6 of Export Flow, and they provide a new zip code while port_dest is missing, they are answering the port_dest prompt.
        if (step === 6 && !session.port_dest && !data.port_dest) {
            if (data.zip && data.zip !== session.zip) {
                data.port_dest = data.zip;
                data.zip = session.zip; // Revert the main zip
            } else if (data.zip_dest) {
                data.port_dest = data.zip_dest;
                data.zip_dest = null;
            } else if (data.zip_origin) {
                data.port_dest = data.zip_origin;
                data.zip_origin = null;
            }
        }
    }

    // ── Actualizar sesión con datos extraídos ──
    sanitizeInferredCondition(input, session, data);
    const updates: any = { lang };
    if (session.hc_used_force_quote) updates.hc_used_force_quote = true;
    if (session.hc_used_warn_shown) updates.hc_used_warn_shown = true;
    if (alternateSizeRequested) {
        updates.size = session.size;
        updates.items = session.items;
        applyExplicitConditionToUpdates(input, session, data, updates);
    }
    if (session.items) updates.items = session.items;
    if (data.size) updates.size = data.size;
    
    if (data.action) {
        const actionStr = data.action.toString().toLowerCase();
        if (isExportFlow) {
            if (actionStr.includes("comprar") || actionStr.includes("buy") || actionStr.includes("alquilar") || actionStr.includes("rent")) {
                updates.export_action = "Comprar";
            }
        } else if (!session.action || data.action === session.action) {
            updates.action = data.action;
        } else if (servicesNamedInMessage(input).has(data.action)) {
            // Switching service only when they actually said so keeps rent/transport intact
            updates.action = data.action;
        } else {
            data.action = session.action;
        }
    }
    
    applyExplicitConditionToUpdates(input, session, data, updates);
    if (data.type) updates.type = data.type;
    if (data.reefer_status) updates.reefer_status = data.reefer_status;
    if (data.load_status) {
        const normalized = normalizeLoadStatus(data.load_status);
        if (normalized) updates.load_status = normalized;
    }
    if (data.quantity && data.quantity > 0) updates.quantity = data.quantity;
    
    if (data.export_action) {
        updates.export_action = "Comprar";
    }
    if (isExportFlow) {
        updates.export_action = "Comprar";
    }
    
    if (data.port_dest) updates.port_dest = data.port_dest;
    
    // Strict safeguard against invalid zip codes extracted by AI (strip non-digits first)
    const cleanZip = (z: any) => z ? z.toString().replace(/\D/g, '').substring(0, 5) : null;
    
    if (data.zip_origin) {
        data.zip_origin = cleanZip(data.zip_origin);
        if (data.zip_origin.length !== 5) data.zip_origin = null;
    }
    if (data.zip_dest) {
        data.zip_dest = cleanZip(data.zip_dest);
        if (data.zip_dest.length !== 5) data.zip_dest = null;
    }
    if (data.zip) {
        data.zip = cleanZip(data.zip);
        if (data.zip.length !== 5) data.zip = null;
    }

    const twoZipsInInput = input.match(/\b(\d{5})\s+(\d{5})\b/);
    const transportNow = (data.action || session.action || updates.action) === "Transporte";
    if (transportNow && twoZipsInInput) {
        data.zip_origin = twoZipsInInput[1];
        data.zip_dest = twoZipsInInput[2];
    } else if (transportNow && data.zip && !data.zip_origin && !data.zip_dest) {
        if (!session.zip_origin) data.zip_origin = data.zip;
        else if (!session.zip_dest) data.zip_dest = data.zip;
        data.zip = null;
    }

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
    
    const mainAction = data.action || session.action;
    if (mainAction !== "Transporte") {
        if (!data.zip && data.zip_dest) {
            data.zip = data.zip_dest;
            data.zip_dest = null;
        }
        if (!data.zip && data.zip_origin) {
            data.zip = data.zip_origin;
            data.zip_origin = null;
        }
    }

    if (data.zip) {
        updates.zip = data.zip;
    }

    // Inferir acción si tenemos datos pero no acción
    if (!session.action && !data.action) {
        const inferred = inferServiceAction(input);
        if (data.zip_origin || data.zip_dest) updates.action = "Transporte";
        else if (inferred) updates.action = inferred;
        else if (data.size || data.zip) updates.action = "Comprar";
    }

    // Guardar historial actualizado (máx 10 entradas)
    const updatedHistory = [...recentHistory];
    if (extracted.ai_reply) updatedHistory.push({ role: "assistant", content: extracted.ai_reply });
    updates.history = updatedHistory.slice(-10);

    await updateSession(senderId, updates);
    Object.assign(session, updates);

    // ── INTENT: PHOTOS / DIMENSIONS ──
    // Only promote when nothing more specific was decided, so a price question that merely
    // contains "ver" or "medida" is never answered with the gallery/dimensions link.
    if (extracted.intent === "general_chat" || !extracted.intent) {
        if (isPhotosRequest(input)) extracted.intent = "photos";
        else if (isDimensionsRequest(input)) extracted.intent = "dimensions";
    } else if (extracted.intent === "quote" && mentionsPhotoWord(input)) {
        extracted.intent = "photos";
    }
    if (extracted.intent === "photos" || extracted.intent === "dimensions") {
        const isWeb = senderId.startsWith("web_");
        const isPhotos = extracted.intent === "photos";
        const alreadySent = isPhotos
            ? historyLooksLike(session.history, ["#gallery", "[policy_sent:photos]", "on the day of your delivery", "el día programado para su entrega", "fotos del contenedor exacto", "photos of the exact container"])
            : historyLooksLike(session.history, ["#container-dimensions", "[policy_sent:dimensions]"]);
        const wantsLinkAgain = /\b(link|enlace|gallery|galer[ií]a|url|p[aá]gina|website|sitio)\b/i.test(input);

        if (alreadySent && !wantsLinkAgain) {
            const aiLooksCanned = !!(extracted.ai_reply && /#gallery|#container-dimensions|depósitos portuarios|port depots are automated/i.test(extracted.ai_reply));
            const followUp = (!aiLooksCanned && extracted.ai_reply) || (isPhotos
                ? (lang === "ES"
                    ? "Entiendo que quieras verlo antes, es normal. Como te comenté, no podemos mandarte ahora la unidad exacta porque en el puerto se mueven todo el tiempo. El día de la entrega el chofer te manda las fotos y no sale hacia tu propiedad hasta que las apruebes. ¿Seguimos con la orden o te quedó otra duda?"
                    : "I get that you want to see it first — totally fair. Like I mentioned, we can't send the exact unit right now because the port stacks move constantly. On delivery day the driver sends you photos and waits for your OK before heading to your property. Want to proceed with the order, or is there anything else I can help with?")
                : (lang === "ES"
                    ? "Las medidas están en el enlace que te pasé hace un momento (largo, ancho, alto y capacidad). Si me dices qué tamaño te interesa, te confirmo lo que aplica a tu cotización."
                    : "The measurements are in the link I sent a moment ago (length, width, height, and capacity). If you tell me which size you want, I can confirm what applies to your quote."));
            await appendHistory(senderId, session, followUp, isPhotos ? "photos" : "dimensions");
            actions.push({ type: "text", text: followUp });
            if (Number(session.step) === 6 && hasQuotedPrice(session)) {
                return actions;
            }
            const followCards = closedQuestionFollowUp(session, dictCurrent);
            if (followCards) {
                actions.push({ type: "quick_replies", text: followCards.text, options: followCards.options });
            }
            return actions;
        }

        let replyMsg = "";
        
        if (isPhotos) {
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

        await appendHistory(senderId, session, (isPhotos ? "[policy_sent:photos] " : "[policy_sent:dimensions] ") + replyMsg, isPhotos ? "photos" : "dimensions");
        actions.push({ type: "text", text: replyMsg });
        if (Number(session.step) === 6 && hasQuotedPrice(session)) {
            return actions;
        }
        const followCards = closedQuestionFollowUp(session, dictCurrent);
        if (followCards) {
            actions.push({ type: "quick_replies", text: followCards.text, options: followCards.options });
        }
        return actions;
    }

    // ── INTENT: CANCEL ──
    if (extracted.intent === "cancel") {
        const ackOnly = ["ok", "okay", "ok.", "vale", "perfecto"].includes(input.toLowerCase().trim());
        if (ackOnly) {
            extracted.intent = "general_chat";
            if (!extracted.ai_reply) {
                extracted.ai_reply = lang === "ES"
                    ? (step === 6 ? dictCurrent.ask_proceed_short : "Perfecto, dime cómo te ayudo.")
                    : (step === 6 ? dictCurrent.ask_proceed_short : "Sounds good — how can I help?");
            }
        }
    }
    if (extracted.intent === "cancel") {
        // Option A: If we are already in an idle state (previously cancelled), don't reply again
        if (!session.action && !session.size && !session.zip) {
            return [];
        }

        if (!session.lead_phone) {
            await updateSession(senderId, { step: 0, action: null, size: null, zip: null, condition: null, type: null, reefer_status: null, quantity: null, history: null, export_action: null, port_dest: null, items: null, quoted_conditions: null, new_stock_cache: null, hc_stock_pending: null, hc_stock_interest: null, hc_used_force_quote: null, hc_used_warn_shown: null });
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

    // ── Post-quote price clarification (answer naturally — never jump to name/phone) ──
    if (postQuotePriceDoubt) {
        const reply = extracted.ai_reply || buildQuotedPriceClarificationReply(input, lang, session)
            || (lang === "ES" ? "Claro, ¿qué más te gustaría saber?" : "Sure — what else would you like to know?");
        await appendHistory(senderId, session, reply, "post_quote_chat");
        actions.push({ type: "text", text: reply });
        return actions;
    }

    // ── INTENT: PROCEED ──
    if (extracted.intent === "proceed" || (step === 6 && isReadyToProceed(input, session))) {
        if (step !== 6 && !hasQuotedPrice(session)) {
            extracted.intent = "quote";
        } else {
            const transportOpt = parseTransportOption(input) || data.transport_option || null;
            const priceMeta = parseQuotePriceMeta(session);
            let amount = session.final_amount;
            if (transportOpt === "Inmediato" && priceMeta.immediate != null) amount = priceMeta.immediate;
            if (transportOpt === "Flexible" && priceMeta.flexible != null) amount = priceMeta.flexible;
            const optionNote = transportOpt ? ` Transport option: ${transportOpt}.` : "";
            const exportNote = session.action === "Exportacion" || session.action === "Exportación"
                ? `Order via AI Bot (EXPORT SALE). Zip: ${session.zip}. Port: ${session.port_dest}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.${optionNote}`
                : `Order via AI Bot. Zip: ${session.zip}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.${optionNote}`;

            await updateSession(senderId, {
                final_amount: amount,
                final_form_amount: JSON.stringify({ ...priceMeta, option: transportOpt || priceMeta.option || null })
            });
            session.final_amount = amount;

            if (session.lead_name && session.lead_phone) {
                await supabase.from("call_logs").insert([{
                    customer: session.lead_name, phone: session.lead_phone,
                    service_type: session.action || "Sales", city: "---",
                    description: exportNote,
                    created_by: "AI BOT", source: "chatbot",
                    status: "PENDING", date: new Date().toISOString().split("T")[0],
                    next_call_date: new Date().toISOString().split("T")[0],
                    amount: amount, zip_code: session.zip, measures: session.size,
                    language: mapCallLanguage(lang || session.lang)
                }]);
                actions.push({ type: "text", text: lang === "ES" ? "¡Perfecto! Hemos añadido esta nueva orden a tu solicitud anterior." : "Perfect! We have added this new order to your previous request." });
                return actions;
            } else {
                await updateSession(senderId, { step: 7, final_amount: amount });
                actions.push({ type: "text", text: dictCurrent.ask_name });
                return actions;
            }
        }
    }

    // ── INTENT: STD vs HC comparison (educational — never recalculate price) ──
    if (stdHcComparison) {
        const reply = historyHasStdHcComparison(session)
            ? (lang === "ES"
                ? "Como te comenté: el **STD mide 8'6\"** de alto y el **HC 9'6\"** (un pie más). Para storage normal el STD suele bastar; el HC si necesitas más altura interna. ¿Con cuál seguimos?"
                : "As I mentioned: **STD is 8'6\"** tall and **HC is 9'6\"** (one foot taller). For typical storage STD is usually enough; HC if you need more interior height. Which would you like to proceed with?")
            : buildStdHcComparisonReply(lang, session, dictCurrent);
        await appendHistory(senderId, session, reply, "std_hc_compare");
        actions.push({ type: "quick_replies", text: reply, options: dictCurrent.proceed_btns });
        return actions;
    }

    // ── INTENT: Used vs New comparison (educational — answer then continue flow) ──
    if (conditionComparison) {
        let reply = extracted.ai_reply || buildConditionComparisonReply(lang, session);
        const followCards = closedQuestionFollowUp(session, dictCurrent);
        if (followCards) {
            reply = `${reply}\n\n${followCards.text}`;
            actions.push({ type: "quick_replies", text: reply, options: followCards.options });
        } else {
            actions.push({ type: "quick_replies", text: reply, options: dictCurrent.ask_condition_btns });
        }
        return actions;
    }

    // ── INTENT: GENERAL_CHAT (la IA responde libremente) ──
    if (extracted.intent === "general_chat") {
        if (!session.action) {
            const inferred = inferServiceAction(input);
            if (inferred) {
                session.action = inferred;
                await updateSession(senderId, { action: inferred });
            }
        }
        const alreadyPhotos = historyLooksLike(session.history, ["#gallery", "[policy_sent:photos]", "fotos del contenedor exacto", "photos of the exact container"]);
        const alreadyDims = historyLooksLike(session.history, ["#container-dimensions", "[policy_sent:dimensions]"]);
        const askingPhotosAgain = /\b(foto|photo|pics|imagen|verlo|see it|see the|gallery|galer)/i.test(input);
        const askingDimsAgain = /\b(medida|dimension|largo|ancho|alto|length|width|height)\b/i.test(input);
        const keepChat = (alreadyPhotos && askingPhotosAgain) || (alreadyDims && askingDimsAgain);

        if (step < 6 && session.action && !keepChat && !openEducational) {
            extracted.intent = "quote";
        } else {
            // Only greet someone who hasn't started yet — never welcome a customer mid-quote
            const noReplyFallback = session.action
                ? (buildPostQuoteFallbackReply(input, lang, session)
                    || (lang === "ES" ? "Claro, ¿qué más te gustaría saber?" : "Sure — what else would you like to know?"))
                : buildWarmWelcomeReply(lang, input);
            let aiMsg = extracted.ai_reply || noReplyFallback;
            const repeatingPhotos = alreadyPhotos && /#gallery|depósitos portuarios|port depots are automated/i.test(aiMsg);
            const repeatingDims = alreadyDims && /#container-dimensions/i.test(aiMsg);
            if (repeatingPhotos) {
                aiMsg = lang === "ES"
                    ? "Entiendo que quieras verlo antes, es normal. Como te comenté, el día de la entrega el chofer te manda las fotos de la unidad exacta y no sale hacia tu propiedad hasta que las apruebes. ¿Seguimos con la orden o te quedó otra duda?"
                    : "I get that you want to see it first — totally fair. Like I mentioned, on delivery day the driver sends photos of the exact unit and waits for your OK before heading to your property. Want to proceed, or is there anything else I can help with?";
            } else if (repeatingDims) {
                aiMsg = lang === "ES"
                    ? "Las medidas están en el enlace que te pasé hace un momento. Si me dices el tamaño, te confirmo lo que aplica a tu cotización."
                    : "The measurements are in the link I sent a moment ago. Tell me the size and I’ll confirm what applies to your quote.";
            }
            const followCards = closedQuestionFollowUp(session, dictCurrent);
            if (followCards && step < 6 && session.action) {
                // Keep the conversational answer; drop the canned prompt if it repeats the question
                const text = asksSameTopic(aiMsg, followCards.text) ? aiMsg : `${aiMsg}\n\n${followCards.text}`;
                actions.push({ type: "quick_replies", text, options: followCards.options });
            } else if (!session.action) {
                actions.push({ type: "quick_replies", text: aiMsg, options: dictCurrent.step1_btns });
            } else if (step === 6 && hasQuotedPrice(session) && !session.lead_phone) {
                if (isQuotedPriceClarificationQuestion(input, session)) {
                    aiMsg = extracted.ai_reply || buildQuotedPriceClarificationReply(input, lang, session) || aiMsg;
                } else {
                    aiMsg = fixAiReplyForKnownSession(aiMsg, session, lang, dictCurrent);
                    if (isReadyToProceed(input, session) || aiReplyAsksForKnownField(extracted.ai_reply || "", session, input)) {
                        await updateSession(senderId, { step: 7 });
                        actions.push({ type: "text", text: aiMsg.includes("nombre") || aiMsg.includes("name") ? aiMsg : dictCurrent.ask_name });
                        return actions;
                    }
                }
                await appendHistory(senderId, session, aiMsg, "post_quote_chat");
                actions.push({ type: "text", text: aiMsg });
            } else if (step === 6 && !session.lead_phone && isReadyToProceed(input, session)) {
                actions.push({ type: "quick_replies", text: aiMsg, options: dictCurrent.proceed_btns });
            } else {
                actions.push({ type: "text", text: aiMsg });
            }
            return actions;
        }
    }

    // Prepend the AI's side answer only if it is not asking the same thing as the structured prompt
    const appendAiReply = (msg: string) => joinWithoutRepeating(extracted.ai_reply, msg);

    if ((data.is_complex_order && !isExportFlow) || (session.action === "Transporte" && (session.quantity || 1) > 1)) {
        await updateSession(senderId, { step: -1 });
        actions.push({ type: "text", text: dictCurrent.human_handoff });
        return actions;
    }

    // ── FLUJO DE COTIZACIÓN ESTRUCTURADO ──
    if (!session.action) {
        const inferred = inferServiceAction(input);
        if (inferred) {
            session.action = inferred;
            await updateSession(senderId, { action: inferred });
        }
    }
    if (!session.action) {
        const welcomeText = extracted.ai_reply
            || buildWarmWelcomeReply(lang, input)
            || dictCurrent.step1_msg;
        actions.push({ type: "quick_replies", text: welcomeText, options: dictCurrent.step1_btns });
        return actions;
    }

    if (session.action === "Comprar_Intent") {
        actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_export_type), options: dictCurrent.ask_export_btns });
        return actions;
    }

    if (["Comprar", "Alquilar", "Exportacion", "Exportación"].includes(session.action)) {
        ensureDryDefaultType(session, updates, input, session.history);
        sanitizeInferredCondition(input, session, data);
        const explicitCond = resolveExplicitCondition(input, session.history, data, session);
        if (explicitCond) {
            session.condition = explicitCond;
            updates.condition = explicitCond;
        } else if (is20HcSize(session.size) && session.condition) {
            session.condition = null;
            updates.condition = null;
        }
    }

    if (session.action === "Transporte") {
        const normalizedLoad = normalizeLoadStatus(session.load_status);
        if (normalizedLoad && normalizedLoad !== session.load_status) {
            session.load_status = normalizedLoad;
            await updateSession(senderId, { load_status: normalizedLoad });
        }
        if (!session.size) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg_transport), options: dictCurrent.step3_size_btns }); return actions; }
        if (!session.zip_origin || !session.zip_dest) {
            actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_transport_zips) });
            return actions;
        }
        if (!isCompleteLoadStatus(session.load_status)) {
            const loLoad = input.toLowerCase();
            const saidLoaded = /\b(cargado|loaded|lleno|full)\b/.test(loLoad);
            const saidUnder = /menos de\s*14|under\s*14|<\s*14/.test(loLoad);
            const saidOver = /m[aá]s de\s*14|over\s*14|>\s*14/.test(loLoad);
            const saidEmpty = /\b(vac[ií]o|empty)\b/.test(loLoad);
            let inferredLoad: string | null = null;
            if (saidEmpty && !saidLoaded) inferredLoad = "Vacio";
            else if (saidUnder) inferredLoad = "Cargado_Under14000";
            else if (saidOver || (saidLoaded && !saidUnder && !saidEmpty)) inferredLoad = "Cargado_Over14000";
            if (inferredLoad) {
                session.load_status = inferredLoad;
                await updateSession(senderId, { load_status: inferredLoad });
            }
        }
        if (!isCompleteLoadStatus(session.load_status)) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_transport_load), options: dictCurrent.ask_load_btns });
            return actions;
        }
    } else if (session.action === "Exportación" || session.action === "Exportacion") {
        ensureDryDefaultType(session, updates, input, session.history);
        if (!session.size) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg), options: (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dictCurrent.step3_size_btns }); return actions; }
        if (needsConditionBeforeQuote(session) && !hasKnownCondition(session, input, session.history, data)) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_condition), options: dictCurrent.ask_condition_btns });
            return actions;
        }
        if (!session.zip) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_export_zip) }); return actions; }
    } else if (session.action === "Alquilar") {
        ensureDryDefaultType(session, updates, input, session.history);
        if (session.size === "20' & 40'") {
            session.size = null;
            session.items = null;
            updates.size = null;
            updates.items = null;
        }
        if (!hasExplicitSize(session)) {
            const inferredSize = extractSizeFromText(input) || data.size;
            if (inferredSize) {
                session.size = inferredSize;
                session.items = [{ size: inferredSize, action: "Alquilar", ...(session.condition ? { condition: session.condition } : {}) }];
                updates.size = inferredSize;
                updates.items = session.items;
            } else {
                actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg_rent), options: dictCurrent.step3_size_btns });
                return actions;
            }
        }
        if (needsConditionBeforeQuote(session) && !hasKnownCondition(session, input, session.history, data)) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_condition), options: dictCurrent.ask_condition_btns });
            return actions;
        }
        if (session.type === "Reefer" && session.condition === "Usado" && !session.reefer_status) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_reefer_status), options: dictCurrent.ask_reefer_status_btns }); return actions;
        }
        if (!session.zip) {
            actions.push({ type: "text", text: appendAiReply(dictCurrent.step5_zip_msg) });
            return actions;
        }
    } else {
        ensureDryDefaultType(session, updates, input, session.history);
        if (session.action === "Comprar") {
            if (session.type === "Reefer" && session.condition === "Usado" && !session.reefer_status) {
                actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_reefer_status), options: dictCurrent.ask_reefer_status_btns }); return actions;
            }
        }
        if (!session.size) {
            ensureQuoteItems(session, updates, session.history, input, "Comprar");
        }
        if (needsConditionBeforeQuote(session) && !hasKnownCondition(session, input, session.history, data)) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_condition), options: dictCurrent.ask_condition_btns });
            return actions;
        }
        if (is20HcSize(session.size) && !hasKnownCondition(session, input, session.history, data)) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_condition), options: dictCurrent.ask_condition_btns });
            return actions;
        }
        if (!session.zip) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_zip) }); return actions; }
    }

    if (await tryHcStockHandoff(senderId, session, lang, dictCurrent, input, data, actions)) {
        return actions;
    }

    if (is20StdHcQuestion(input, session)) {
        const reply = build20HcInfoReply(lang, session, dictCurrent);
        await appendHistory(senderId, session, reply, "hc_info");
        actions.push({ type: "quick_replies", text: reply, options: dictCurrent.proceed_btns });
        return actions;
    }

    // Safety net: never re-quote at step 6 without an explicit change request
    if (step === 6 && hasQuotedPrice(session) && extracted.intent === "quote" && !wantsQuoteRecalculation(input, session, data, { alternateSizeRequested, asksAlternatePrice, stdHcComparison, conditionComparison })) {
        let aiMsg = extracted.ai_reply || buildQuotedPriceClarificationReply(input, lang, session) || buildPostQuoteFallbackReply(input, lang, session)
            || (lang === "ES" ? "Claro, ¿qué más te gustaría saber?" : "Sure — what else would you like to know?");
        await appendHistory(senderId, session, aiMsg, "post_quote_chat");
        actions.push({ type: "text", text: aiMsg });
        return actions;
    }

    // ── CALCULAR PRECIO ──
    try {
        let finalMessages: string[] = [];
        let finalTotalPrice = 0;
        let requiresManualQuote = false;
        
        const itemsToQuote = dedupeQuoteItems((session.items && session.items.length > 0) ? session.items : [session]);
        let allQuotesValid = true;
        let missing20hc = false;
        let hcStockDisclaimer = false;
        let lastTransportFlexible: number | null = null;
        let lastTransportImmediate: number | null = null;
        let requestedNewCondition = false;
        let quotedItemSize = session.size || "";
        let quotedItemType = session.type || "Dry";
        const priceMetaStart = parseQuotePriceMeta(session);
        const quotedPricesAccum: Record<string, number> = { ...(priceMetaStart.quoted_prices || {}) };
        
        for (let i = 0; i < itemsToQuote.length; i++) {
            let item = itemsToQuote[i];
            
            const itemAction = item.action || session.action;
            const itemCondition = item.condition || session.condition;
            const itemType = item.type || session.type || "Dry";
            const itemSize = item.size || session.size;
            const itemQty = Number(item.quantity) || Number(session.quantity) || 1;
            const itemExportAction = item.export_action || session.export_action;
            
            const convCondition = resolveConditionFromContext(input, session.history, {
                condition: itemCondition || session.condition,
                items: itemsToQuote,
            }, session);
            if (convCondition === "Nuevo") {
                item.condition = "Nuevo";
            } else if (convCondition === "Usado") {
                item.condition = "Usado";
            } else if (itemType === "Open Side" || itemType === "Double Door") {
                item.condition = "Nuevo";
            } else if (itemCondition || convCondition) {
                item.condition = itemCondition || convCondition;
            }
            if (!item.type) item.type = itemType;
            if (i === 0) {
                session.condition = item.condition;
                session.type = item.type;
            }

            const explicitNew = item.condition === "Nuevo"
                || convCondition === "Nuevo"
                || mentionsNewCondition(input);
            if (explicitNew) requestedNewCondition = true;
            // 45' HC: default to used only when the customer did not explicitly ask for new
            if (itemSize && itemSize.includes("45") && !explicitNew) {
                item.condition = "Usado";
            }
            if (i === 0) session.condition = item.condition;
            
            const isExport = itemAction === "Exportación" || itemAction === "Exportacion";
            let isNew = item.condition === "Nuevo";
            const quantity = itemQty;

            const sizeKey = resolveContainerSizeKey(itemSize || "", itemType, isNew, item.reefer_status || session.reefer_status);
            if (i === 0) {
                quotedItemSize = itemSize || session.size || "";
                quotedItemType = itemType;
            }

            const loadStatus = normalizeLoadStatus(session.load_status);
            const quoteBody = (conditionNew: boolean) => ({
                operation_mode: itemAction === "Transporte" ? "transport_only" : (itemAction === "Alquilar" ? "rent" : "sale"),
                condition: conditionNew ? "new" : "used",
                zip_destino: itemAction === "Transporte" ? session.zip_dest : session.zip,
                zip_origen: itemAction === "Transporte" ? session.zip_origin : undefined,
                container_size: sizeKey,
                quantity: quantity,
                cargo_case: itemAction === "Transporte" ? cargoCaseFromLoad(loadStatus) : undefined,
                options: {
                    export_certificate: isExport,
                    cargo_case: itemAction === "Transporte" ? cargoCaseFromLoad(loadStatus) : undefined,
                    extra_service: itemAction === "Transporte" && loadStatus === "Vacio",
                    crane_service: itemAction === "Transporte" && loadStatus === "Cargado_Over14000"
                }
            });

            const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
            const is20HcDrySale = sizeKey === "20hc" && itemType === "Dry" && itemAction !== "Transporte" && !isExport;
            let qData: any = null;
            let error: any = null;
            let itemPrice = 0;

            if (is20HcDrySale) {
                const hcQuote = await build20HcBotQuoteAsync(item, session, lang, fmt, dictCurrent, input);
                if (!hcQuote.ok) {
                    if (hcQuote.needsCondition) {
                        actions.push({
                            type: "quick_replies",
                            text: hcQuote.message,
                            options: dictCurrent.ask_condition_btns,
                        });
                        return actions;
                    }
                    if (hcQuote.needsInsist) {
                        await updateSession(senderId, { hc_used_warn_shown: true });
                        actions.push({
                            type: "quick_replies",
                            text: hcQuote.message,
                            options: dictCurrent.hc_used_far_miami_btns,
                        });
                        return actions;
                    }
                    if (itemsToQuote.length === 1) {
                        actions.push({ type: "text", text: hcQuote.message });
                        return actions;
                    }
                    allQuotesValid = false;
                    continue;
                }
                if (!isNew && (session.hc_used_force_quote || isHcUsedInsistRequest(input))) {
                    await updateSession(senderId, { hc_used_force_quote: true });
                    session.hc_used_force_quote = true;
                }
                itemPrice = hcQuote.price;
                hcStockDisclaimer = hcStockDisclaimer || hcQuote.disclaimer;
                qData = {
                    total_price: hcQuote.price,
                    container_price: hcQuote.containerPrice,
                    delivery_cost: hcQuote.deliveryPrice,
                };
            } else {
                const result = await supabase.functions.invoke("calculate-quote", { body: quoteBody(isNew) });
                qData = result.data;
                error = result.error;

                // 20' HC dry: if they didn't specify new/used, try the other condition when this SKU has no price yet.
                if ((error || (qData && qData.error)) && sizeKey === "20hc" && itemAction !== "Transporte" && !itemCondition) {
                    const retry = await supabase.functions.invoke("calculate-quote", { body: quoteBody(!isNew) });
                    if (!retry.error && retry.data && !retry.data.error) {
                        qData = retry.data;
                        error = null;
                        isNew = !isNew;
                        item.condition = isNew ? "Nuevo" : "Usado";
                        if (i === 0) session.condition = item.condition;
                    }
                }

                if (error || (qData && qData.error)) {
                    if (itemSize === "20' HC" && itemAction !== "Transporte") missing20hc = true;
                    allQuotesValid = false;
                    continue;
                }

                if (qData && qData.requires_manual_quote) {
                    requiresManualQuote = true;
                    break;
                }

                itemPrice = qData.total_price || 0;
            }

            if (isExport) {
                const sp = ["Reefer", "Open Side", "Double Door"].includes(itemType);
                const bp = (qData.container_price || 0) + (sp ? 0 : (qData.cert_fee || 0));
                
                if (session.port_dest) {
                    const is20ftSize = itemSize && itemSize.startsWith("20");
                    const trucksNeeded = is20ftSize ? Math.ceil(quantity / 2) : quantity;
                    const trip1 = (qData.delivery_cost || 0);
                    const { data: trip2Data } = await supabase.functions.invoke("calculate-quote", {
                        body: {
                            operation_mode: "transport_only",
                            zip_origen: session.zip,
                            zip_destino: session.port_dest,
                            quantity: quantity, 
                            container_size: sizeKey,
                            options: { crane_service: true }
                        }
                    });
                    const trip2 = trip2Data?.total_price || 0;
                    const discount = (is20ftSize ? 100 : 150) * quantity;
                    itemPrice = bp + trip1 + trip2 - discount;
                    (item as any).exportDiscount = discount;
                } else {
                    itemPrice = bp;
                }
            }
            if (!itemPrice) {
                if (itemSize === "20' HC" && itemAction !== "Transporte") missing20hc = true;
                allQuotesValid = false;
                continue;
            }
            
            finalTotalPrice += itemPrice;

            const itemCondKey = item.condition === "Nuevo" ? "Nuevo" : "Usado";
            const itemSizeKey = normalizeSizeKey(itemSize || "");
            if (itemSizeKey && itemPrice > 0) {
                quotedPricesAccum[`${itemSizeKey}|${itemCondKey}`] = itemPrice;
            }

            let msg = "";
            {
            const displaySize = itemSize || "";
            const condLabel = lang === "EN" ? (item.condition === "Nuevo" ? "New" : "Used") : item.condition;
            let typeLabel = itemType === "Dry" ? "" : itemType;
            if (itemType === "Reefer" && item.reefer_status === "No Funcionando") typeLabel = lang === "EN" ? "Reefer (Not Working)" : "Refrigerado (No Funciona)";
            else if (itemType === "Reefer") typeLabel = lang === "EN" ? "Reefer" : "Refrigerado";

            if (itemAction === "Transporte") {
                const qtyStr = quantity > 1 ? `${quantity} ` : "";
                const qtyPluralS = quantity > 1 ? "s" : "";
                const qtyPluralES = quantity > 1 ? "es" : "";
                const loadLabel = loadStatus === "Vacio"
                    ? (lang === "EN" ? "Empty" : "Vacío")
                    : loadStatus === "Cargado_Under14000"
                        ? (lang === "EN" ? "Loaded <14k lbs" : "Cargado <14k lbs")
                        : loadStatus === "Cargado_Over14000"
                            ? (lang === "EN" ? "Loaded >14k lbs" : "Cargado >14k lbs")
                            : (lang === "EN" ? "Loaded" : "Cargado");
                const immedPrice = qData.immediate_price != null ? qData.immediate_price : itemPrice;
                lastTransportFlexible = itemPrice;
                lastTransportImmediate = immedPrice;
                const yardName = qData.closest_yard || (lang === "EN" ? "our yard" : "nuestro patio");
                const craneNote = loadStatus === "Cargado_Over14000"
                    ? (lang === "EN" ? "\nThe crane is dispatched only from our Miami hub." : "\nLa grúa sale únicamente desde nuestro hub de Miami.")
                    : "";
                const sameDispatchPrice = immedPrice == null || immedPrice === itemPrice;
                const tpl = sameDispatchPrice ? dictCurrent.price_transport_single : dictCurrent.price_transport;
                msg = tpl
                    .replace("{qty}", qtyStr)
                    .replace(/{qty_plural_s}/g, qtyPluralS)
                    .replace(/{qty_plural_es}/g, qtyPluralES)
                    .replace("{size}", displaySize).replace("{load}", loadLabel)
                    .replace("{origin}", session.zip_origin).replace("{dest}", session.zip_dest)
                    .replace("{price}", fmt(itemPrice))
                    .replace("{immed}", fmt(immedPrice))
                    .replace("{yard}", yardName)
                    .replace("{crane_note}", craneNote);
            } else if (isExport) {
                if (session.port_dest) {
                    const discount = (item as any).exportDiscount || 0;
                    msg = lang === "EN" ? `🔹 ${condLabel} ${typeLabel} ${displaySize} + Transport to Port: **${fmt(itemPrice)}** (Includes $${discount} discount)` : `🔹 ${condLabel} ${typeLabel} ${displaySize} + Transporte al Puerto: **${fmt(itemPrice)}** (Incluye descuento de $${discount})`;
                } else {
                    const sp = ["Reefer", "Open Side", "Double Door"].includes(itemType);
                    const bp = (qData.container_price || 0) + (sp ? 0 : (qData.cert_fee || 0));
                    msg = `🔹 ${condLabel} ${typeLabel} ${displaySize}: **${fmt(bp)}**`;
                }
            } else if (itemAction === "Alquilar") {
                msg = dictCurrent.price_rent
                    .replace("{zip}", session.zip)
                    .replace("{monthly}", fmt(qData.container_price || 0))
                    .replace("{logistics}", fmt(qData.delivery_cost || 0))
                    .replace("{price}", fmt(itemPrice));
            } else {
                const qtyStr = quantity > 1 ? `${quantity} ` : "";
                msg = `🔹 ${qtyStr}${condLabel} ${typeLabel} ${displaySize}: **${fmt(itemPrice)}**`;
            }
            }

            msg = msg.replace(/ +/g, " ");
            finalMessages.push(msg);
        }

        finalMessages = dedupeMessages(finalMessages);

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
            const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
            const is45 = (quotedItemSize || session.size || "").includes("45");
            const hadUsedQuote = sessionQuotedConditions(session).includes("Usado");
            const usedAmount = lastQuotedAmountForCondition(session, "Usado");

            if (requestedNewCondition && is45) {
                let text = hadUsedQuote && usedAmount
                    ? dictCurrent.no_45_new_with_used
                        .replace("{zip}", session.zip || "")
                        .replace("{price}", fmt(usedAmount))
                    : dictCurrent.no_45_new;
                const historyAfterNoStock = [...(session.history || [])];
                historyAfterNoStock.push({ role: "assistant", content: text });
                const newStockCache = { ...(session.new_stock_cache || {}), [`${quotedItemSize}|${quotedItemType}|${session.zip}`]: false };
                await updateSession(senderId, {
                    step: 6,
                    condition: hadUsedQuote ? "Usado" : session.condition,
                    history: historyAfterNoStock.slice(-10),
                    new_stock_cache: newStockCache,
                });
                actions.push({ type: "quick_replies", text, options: dictCurrent.proceed_btns });
                return actions;
            }

            if (requestedNewCondition && !is45) {
                const displaySize = quotedItemSize || session.size || "";
                const text = dictCurrent.no_new_for_size.replace("{size}", displaySize);
                actions.push({ type: "quick_replies", text, options: dictCurrent.step3_size_btns });
                return actions;
            }

            if (missing20hc && finalMessages.length === 0) {
                actions.push({ type: "quick_replies", text: dictCurrent.no_20hc, options: dictCurrent.step3_size_btns });
            } else {
                actions.push({ type: "text", text: dictCurrent.no_stock });
            }
            return actions;
        }

        const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
        let msg = "";
        
        if (itemsToQuote.length === 1) {
            const singleItem = itemsToQuote[0];
            const isExport = (singleItem.action || session.action) === "Exportación" || (singleItem.action || session.action) === "Exportacion";
            
            if (isExport) {
                if (session.port_dest) {
                    msg = lang === "EN" 
                        ? `The total cost including the certified container and the full inland transportation to the port is **${fmt(finalTotalPrice)}**. Your special discount has been applied! Would you like to proceed with this order?`
                        : `El costo total incluyendo el contenedor certificado y el transporte terrestre completo hasta el puerto es **${fmt(finalTotalPrice)}**. ¡Tu descuento especial ha sido aplicado! ¿Te gustaría proceder con esta orden?`;
                } else {
                    const itemSize = singleItem.size || session.size;
                    const is20ftSize = itemSize && itemSize.startsWith("20");
                    const qty = Number(singleItem.quantity) || Number(session.quantity) || 1;
                    const discount = (is20ftSize ? 100 : 150) * qty;
                    msg = dictCurrent.export_buy_price.replace("{price}", fmt(finalTotalPrice)).replace("{discount}", discount.toString());
                }
            } else if ((singleItem.action || session.action) === "Transporte") {
                msg = finalMessages[0]; 
            } else if ((singleItem.action || session.action) === "Alquilar") {
                msg = finalMessages[0];
            } else {
                const qtyStr = (Number(singleItem.quantity) || Number(session.quantity) || 1) > 1 ? `${(Number(singleItem.quantity) || Number(session.quantity) || 1)} ` : "";
                const qtyPluralS = (Number(singleItem.quantity) || Number(session.quantity) || 1) > 1 ? "s" : "";
                const qtyPluralES = (Number(singleItem.quantity) || Number(session.quantity) || 1) > 1 ? "es" : "";
                const condLabel = lang === "EN"
                    ? ((singleItem.condition || session.condition) === "Nuevo" ? "New" : "Used")
                    : (singleItem.condition || session.condition || "");
                let typeLabel = (singleItem.type || session.type || "Dry") === "Dry" ? "" : (singleItem.type || session.type || "");
                const displaySize = (singleItem.size || session.size) || "";
                
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

        if (hcStockDisclaimer) {
            msg += dictCurrent.hc_stock_disclaimer;
        }
        
        msg = msg.replace(/ +/g, " ");

        const singleForUpsell = itemsToQuote.length === 1 ? itemsToQuote[0] : null;
        const isUsedDryBuy = session.action === "Comprar"
            && (singleForUpsell?.condition || session.condition) === "Usado"
            && (!(singleForUpsell?.type || session.type) || (singleForUpsell?.type || session.type) === "Dry");
        const alreadyQuotedNew = sessionQuotedConditions(session).includes("Nuevo");
        let newStockAvailable = false;
        if (isUsedDryBuy && !alreadyQuotedNew) {
            newStockAvailable = await probeNewStockAvailable(session, quotedItemSize || session.size || "", quotedItemType);
        }
        if (isUsedDryBuy && !alreadyQuotedNew && newStockAvailable) {
            msg = msg + dictCurrent.price_sale_upsell_new;
        }

        // A side question asked alongside the quote (leaks/WWT, payment, discounts) is
        // answered above the price, so the quote never silently ignores it.
        const sideNote = extracted.ai_reply || buildSideQuestionReply(input, lang, session, true);
        if (sideNote) {
            msg = sideNote + "\n\n" + msg;
        }

        const historyAfterQuote = [...(session.history || [])];
        historyAfterQuote.push({ role: "assistant", content: msg });
        const condQuoted = (singleForUpsell?.condition || session.condition) as string;
        const quoted_conditions = [...new Set([
            ...sessionQuotedConditions(session),
            ...(condQuoted === "Nuevo" || condQuoted === "Usado" ? [condQuoted] : []),
        ])] as ("Nuevo" | "Usado")[];
        const newStockCache = { ...(session.new_stock_cache || {}) };
        if (isUsedDryBuy) {
            newStockCache[`${quotedItemSize || session.size}|${quotedItemType}|${session.zip}`] = newStockAvailable;
        }
        const quoteSizeKey = normalizeSizeKey(quotedItemSize || session.size || "");
        const quoteCondKey = condQuoted === "Nuevo" || condQuoted === "Usado" ? condQuoted : "Nuevo";
        const quoted_prices = {
            ...quotedPricesAccum,
            ...(Object.keys(quotedPricesAccum).length === 0 ? {
                [`${quoteSizeKey}|${quoteCondKey}`]: finalTotalPrice,
            } : {}),
        };
        await updateSession(senderId, { 
            step: 6, 
            final_amount: finalTotalPrice,
            zip: session.zip,
            zip_origin: session.zip_origin,
            zip_dest: session.zip_dest,
            size: session.size,
            action: session.action,
            load_status: session.load_status,
            final_form_amount: JSON.stringify({
                flexible: lastTransportFlexible ?? finalTotalPrice,
                immediate: lastTransportImmediate ?? finalTotalPrice,
                quoted_prices,
            }),
            history: historyAfterQuote.slice(-10),
            items: session.items,
            condition: session.condition,
            type: session.type,
            quoted_conditions,
            new_stock_cache: newStockCache,
        });

        const splitTransport = session.action === "Transporte"
            && lastTransportImmediate != null
            && lastTransportFlexible != null
            && lastTransportImmediate !== lastTransportFlexible;
        if (splitTransport) {
            actions.push({ type: "quick_replies", text: msg, options: dictCurrent.transport_option_btns });
        } else {
            actions.push({ type: "quick_replies", text: msg, options: dictCurrent.proceed_btns });
        }
        return actions;
    } catch (e) {
        console.error("Quote error:", e);
        actions.push({ type: "text", text: dictCurrent.calc_error });
        return actions;
    }
}

async function resetChatSession(senderId: string, lang: "EN" | "ES" = "EN"): Promise<Action[]> {
    await updateSession(senderId, {
        step: 0,
        lang,
        action: null,
        condition: null,
        size: null,
        type: null,
        zip: null,
        reefer_status: null,
        load_status: null,
        quantity: null,
        zip_origin: null,
        zip_dest: null,
        history: null,
        items: null,
        is_processing: false,
        queued_messages: null,
        final_amount: null,
        final_form_amount: null,
        quoted_conditions: null,
        new_stock_cache: null,
        hc_stock_pending: null,
        hc_stock_interest: null,
        hc_used_force_quote: null,
        hc_used_warn_shown: null,
        export_action: null,
        port_dest: null,
        lead_name: null,
        lead_phone: null,
    });
    const dict = chatDict[lang];
    return [{ type: "quick_replies", text: buildWarmWelcomeReply(lang), options: dict.step1_btns }];
}

async function processMessage(senderId: string, messageText: string, isHuman: boolean = false, messageId?: string, extraMidsFromClient: string[] = []): Promise<Action[]> {
    const restartCmd = messageText.toLowerCase().trim();
    if (["reiniciar", "restart", "menu"].includes(restartCmd)) {
        const existing = await getSession(senderId);
        const restartLang: "EN" | "ES" = existing?.lang === "ES" ? "ES" : "EN";
        return await resetChatSession(senderId, restartLang);
    }

    let session = await getSession(senderId);

    if (historyHasMid(session, messageId) && extraMidsFromClient.every((id) => historyHasMid(session, id))) {
        console.log(`Skipping already processed message (webhook retry): ${messageId}`);
        return [];
    }

    if (session.is_processing && isStaleProcessingLock(session)) {
        console.log(`Clearing stale is_processing lock for ${senderId}`);
        await updateSession(senderId, { is_processing: false, queued_messages: [] });
        session.is_processing = false;
        session.queued_messages = [];
    }

    if (session.is_processing) {
        if (messageText.toLowerCase().trim() === "reiniciar" || messageText.toLowerCase().trim() === "restart" || messageText.toLowerCase().trim() === "menu") {
            await updateSession(senderId, { is_processing: false, queued_messages: [] });
        } else {
            const queue = session.queued_messages || [];
            if (queueHasMid(queue, messageId) || extraMidsFromClient.some((id) => queueHasMid(queue, id))) {
                console.log(`Skipping duplicate message (webhook retry) in queue: ${messageId}`);
                return [];
            }
            queue.push(JSON.stringify({ text: messageText, mid: messageId, type: "queue" }));
            for (const id of extraMidsFromClient) {
                if (id && id !== messageId) queue.push(JSON.stringify({ type: "seen", mid: id }));
            }
            await updateSession(senderId, { queued_messages: queue });
            const queueLang = session.lang === "ES" ? "ES" : "EN";
            return [{
                type: "text",
                text: queueLang === "ES"
                    ? "Un momento, estoy procesando tu mensaje anterior..."
                    : "One moment, still processing your previous message...",
            }];
        }
    }

    const seenMids: string[] = [messageId, ...extraMidsFromClient].filter((m): m is string => !!m);
    await updateSession(senderId, {
        is_processing: true,
        queued_messages: seenMids.map((mid) => JSON.stringify({ type: "seen", mid }))
    });

    const waitMs = debounceMsFor(senderId, isHuman);
    if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    session = await getSession(senderId);
    let finalMessage = messageText;
    const extraMids: string[] = [];
    const leftoverSeen: string[] = seenMids.map((mid) => JSON.stringify({ type: "seen", mid }));

    if (session.queued_messages && session.queued_messages.length > 0) {
        const queueTexts: string[] = [];
        for (const q of session.queued_messages) {
            const item = parseQueueItem(q);
            if (item.mid && !seenMids.includes(item.mid)) {
                seenMids.push(item.mid);
                leftoverSeen.push(JSON.stringify({ type: "seen", mid: item.mid }));
            }
            if (item.type === "queue" && item.text) {
                queueTexts.push(item.text);
                if (item.mid) extraMids.push(item.mid);
            }
        }
        if (queueTexts.length > 0) {
            finalMessage += " " + queueTexts.join(" ");
        }
    }
    // Keep seen mids in the queue so a Meta retry during AI/quote is dropped, not processed twice
    await updateSession(senderId, { queued_messages: leftoverSeen });

    let actions: Action[] = [];
    try {
        actions = await processMessageInner(senderId, finalMessage, isHuman, messageId, [...extraMidsFromClient, ...extraMids]);
    } catch (e) {
        console.error("Inner Error:", e);
        const errSession = await getSession(senderId);
        const errDict = chatDict[errSession?.lang === "ES" ? "ES" : "EN"];
        actions = [{ type: "text", text: errDict.calc_error }];
    } finally {
        const currentSession = await getSession(senderId);
        const queue = currentSession.queued_messages || [];
        const followUpItems = queue
            .map(parseQueueItem)
            .filter((item) => item.type === "queue" && item.text);

        const freshFollowUps = followUpItems.filter((item) => {
            if (item.mid && (seenMids.includes(item.mid) || historyHasMid(currentSession, item.mid))) return false;
            if (item.text && item.text.trim() === messageText.trim()) return false;
            return true;
        });

        if (freshFollowUps.length > 0) {
            const combinedQueueMessage = freshFollowUps.map((item) => item.text).join(" ");
            const followUpMids = freshFollowUps.map((item) => item.mid).filter((m): m is string => !!m);
            const stillSeen = seenMids.concat(followUpMids).map((mid) => JSON.stringify({ type: "seen", mid }));
            await updateSession(senderId, { queued_messages: stillSeen });
            try {
                const extraActions = await processMessageInner(senderId, combinedQueueMessage, false, followUpMids[0], followUpMids.slice(1));
                actions.push(...extraActions);
            } catch (e) {
                console.error("Error processing queue:", e);
            }
        }
        await updateSession(senderId, { is_processing: false, queued_messages: [] });
    }
    if (actions.length === 0) {
        const idleSession = await getSession(senderId);
        const idleDict = chatDict[idleSession?.lang === "ES" ? "ES" : "EN"];
        actions.push({
            type: "text",
            text: idleSession?.lang === "ES"
                ? "No pude responder eso. ¿Puedes repetirlo o escribe **reiniciar** para empezar de nuevo?"
                : "I couldn't respond to that. Please try again or type **restart** to begin again.",
        });
        if (needsConditionBeforeQuote(idleSession) && is20HcSize(idleSession?.size)) {
            actions.push({ type: "quick_replies", text: idleDict.ask_condition, options: idleDict.ask_condition_btns });
        }
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
        const { sender_id, message, is_human, message_id, message_ids } = await req.json();
        if (!sender_id || !message) {
            return new Response(JSON.stringify({ error: "sender_id and message are required" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        const extraIds = Array.isArray(message_ids)
            ? message_ids.filter((id: string) => id && id !== message_id)
            : [];
        const actions = await processMessage(sender_id, message, is_human, message_id, extraIds);
        return new Response(JSON.stringify({ actions }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    } catch (e) {
        console.error("chatbot-core error:", e);
        return new Response(JSON.stringify({ error: "Internal Error" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
});
