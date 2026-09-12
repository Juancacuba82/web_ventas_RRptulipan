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

    const esRe = /\b(busco|busca|buscar|necesito|necesitamos|quiero|queremos|quisiera|hola|gracias|contenedor|contenedores|cotizaci[oó]n|precio|cu[aá]nto|comprar|alquilar|rentar|renta|mover|transporte|transportar|usado|nuevo|vac[ií]o|cargado|lleno|s[ií]|por favor|entrega|entregar|proceder|exportaci[oó]n|flexible|inmediato|pies|español|espanol|tengo|tienen|hacen|pueden|uno|una|dos|tres|cuatro|para|desde|hasta|terreno|patio|env[ií]o|env[ií]os|tambi[eé]n|me|mi|tu|su|del|al|el|la|los|las|estoy|est[aá]n|est[aá]|ser[ií]a|podr[ií]an|d[ií]game|dime|ayuda|ayudar|pago|pagar|recibo|reciba|cuando|permiso|permisos|filtraci[oó]n|hueco|foto|fotos|d[ií]as|h[aá]bil|d[oó]nde|ubicad\w*|oficina|direcci[oó]n|cuba|visitar)\b/gi;
    const enRe = /\b(hello|hi|thanks|thank you|need|looking|want|container|containers|quote|price|how much|buy|rent|transport|move|moving|used|new|empty|loaded|delivery|deliver|proceed|export|flexible|immediate|feet|english|yes|please|one|two|three|four|can you|do you|yard|lot|ship|help|would|could|also|your|my|the|this|that|looking for|i need|i want|where|are|you|located|based|we|our|office|address|visit|call|schedule|appointment)\b/gi;

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

function detectLanguageSwitchRequest(input: string): "EN" | "ES" | null {
    const lo = (input || "").trim().toLowerCase();
    if (/^(espa[nñ]ol|espanol|es)(\s+por favor)?\.?$/.test(lo)) return "ES";
    if (/\b(habla|hablen|escribe|escrib[ae]|en)\s+espa[nñ]ol\b/.test(lo)) return "ES";
    if (/^(english|en)(\s+please)?\.?$/.test(lo)) return "EN";
    if (/\b(speak|write|in)\s+english\b/.test(lo)) return "EN";
    return null;
}

function detectMessageLanguage(input: string, sessionLang?: string | null, history?: any): "EN" | "ES" {
    const trimmed = (input || "").trim().toLowerCase();
    const langSwitch = detectLanguageSwitchRequest(input);
    if (langSwitch) return langSwitch;
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
        step3_size_msg_transport: "Sí, hacemos ese tipo de traslado. ¿De qué medida es el contenedor que ya tienes (20, 40 o 45 pies)?",
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
        ask_transport_details: "Para cotizar el traslado necesitamos: ZIP de recogida, ZIP de entrega, y si va vacío o cargado (menos o más de 14,000 lbs).",
        ask_transport_zips: "Para cotizar el traslado necesito el código postal de 5 dígitos de recogida y el de entrega.",
        ask_transport_load: "¿Cómo está el contenedor?\n\n• Vacío\n• Cargado con menos de 14,000 lbs\n• Cargado con más de 14,000 lbs",
        ask_load_btns: ["Vacío", "Cargado <14k", "Cargado >14k"],
        price_transport: "El precio por mover tu{qty_plural_s} {qty}contenedor{qty_plural_es} de {size} ({load}) desde el Zip {origin} hasta el Zip {dest} es:\n\n🔹 Flexible (En Ruta): **{price}**\nCuando uno de nuestros camiones esté cerca del lugar de recogida.\n\n🔹 Inmediato (Desde {yard}): **{immed}**\nMandamos un camión desde nuestro patio para moverlo lo antes posible.{crane_note}\n\n¿Cuál opción prefieres?",
        price_transport_single: "El precio por mover tu{qty_plural_s} {qty}contenedor{qty_plural_es} de {size} ({load}) desde el Zip Code {origin} hasta el Zip Code {dest} es de **{price}**.\n\n¿Te gustaría proceder?",
        transport_option_btns: ["Flexible", "Inmediato"],
        transport_zips_confirm: "Tengo recogida en el ZIP **{origin}** y entrega en el ZIP **{dest}**. ¿Es correcto?",
        transport_zips_confirm_btns: ["Sí, correcto", "No, escribo los ZIP"],
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
        step3_size_msg_transport: "Yes, we do that kind of move. What size is the container you already have (20, 40, or 45 ft)?",
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
        ask_transport_details: "To quote the move we need: pickup ZIP, delivery ZIP, and whether it is empty or loaded (under or over 14,000 lbs).",
        ask_transport_zips: "To quote the move I need the 5-digit pickup zip code and the delivery zip code.",
        ask_transport_load: "How is the container loaded?\n\n• Empty\n• Loaded under 14,000 lbs\n• Loaded over 14,000 lbs",
        ask_load_btns: ["Empty", "Loaded <14k", "Loaded >14k"],
        price_transport: "The price to move your {qty} {size} ({load}) container{qty_plural_s} from Zip {origin} to Zip {dest} is:\n\n🔹 Flexible (En Route): **{price}**\nWhen one of our trucks is already near the pickup location.\n\n🔹 Immediate (From {yard}): **{immed}**\nWe dispatch a truck from our yard to move it as soon as possible.{crane_note}\n\nWhich option do you prefer?",
        price_transport_single: "The price to move your {qty} {size} ({load}) container{qty_plural_s} from Zip Code {origin} to Zip Code {dest} is **{price}**.\n\nWould you like to proceed?",
        transport_option_btns: ["Flexible", "Immediate"],
        transport_zips_confirm: "I have pickup at ZIP **{origin}** and delivery at ZIP **{dest}**. Is that correct?",
        transport_zips_confirm_btns: ["Yes, that's correct", "No, I'll type the zips"],
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
- TYPES: Dry, Reefer, Open Side, Double Door. SALE (Comprar) offers Dry and Reefer (the system asks with buttons). We do NOT rent reefers — rentals are DRY storage only. Reefers come Working (functional), Not Working (no AC), or brand new. Open Side and Double Door are ONLY brand new, ONLY for sale, and ONLY in 20ft and 40ft — never offer 45ft for them.
- REEFER POWER: they run on 440V 3-phase (440V trifásica). We also sell transformers that convert 220V to 440V: Used $2,500, New $3,000.

COMPANY FACTS:
- PAYMENT: on delivery or pickup (COD) we ONLY accept Cash or Zelle. Credit Card or Check MUST be paid in full BEFORE the driver leaves our yard. NO financing.
- DELIVERY TIME (SALE/RENT of a container we provide): 1-3 business days after order confirmation. TRANSPORT (moving a container they already own): NEVER say 1-3 business days. Say that once their name and phone are in our system, dispatch will call to agree on pickup and delivery dates based on route availability.
- PRICING POLICY: ads show the container price at the port only; delivery varies by zip distance, so we cannot advertise one price. Our quote is FINAL: container + flatbed delivery, no hidden fees. Prices are already the lowest wholesale port prices with zero hidden margins — there are NO additional discounts of any kind, including military, senior, veteran, and first responder.
- GUARANTEES: NEVER mention or offer a guarantee unless the customer explicitly asks. If they ask: we offer ONLY a 6-month Wind and Water Tight structural guarantee on used containers, and NO other guarantee.
- LOCATIONS/HUBS: distribution centers in Miami, Tampa, Titusville, Jacksonville, Savannah, and Atlanta. Central office: 9804 NW 80th Ave, Hialeah Gardens FL 33016. When they ask where WE are, how to visit, or our address, list the hubs AND give this office address. Always say they must call first to schedule an appointment. If they say they want the container on their patio/yard/lot, they want delivery there — greet that and continue buy/rent, never our office address.
- CONTACT: 786-768-4409 | 786-736-6288 — rptulipantransport@gmail.com. You ARE authorized to give these out when they ask for a phone number, want to call us, or want a human. Never refuse. BUT if they say "call me" / "llámame" or tell you when to call them, do NOT give our numbers — just acknowledge warmly and say an agent will contact them.
- PHOTOS POLICY: we cannot send the exact unit now (port stacks move constantly). On delivery day the driver sends photos of the exact container and waits for the customer's approval before driving to their property. Never invent that you can email or WhatsApp photos of the exact unit now.
- EXPORT: we DO provide containers for international export (Puerto Rico, Cuba, Bahamas, etc.). We ONLY SELL the certified container (export certificate valid 1 year). We do NOT rent for export, the sale price does NOT include delivery to their ZIP, and we do NOT offer maritime shipping. The US ZIP is only to locate the nearest depot in case they later want delivery (quoted separately). If they ask to rent for export, explain warmly that for export we only sell the certified container and rentals are for storage inside the US only.
- TRANSPORT (moving a container the customer ALREADY OWNS): this is NOT a purchase or rental. Never ask New vs Used, Dry vs Reefer, or what size they "need" — they already have it. We need what size it IS (20/40/45), the 5-digit origin zip, the destination zip, and the load status (Empty / Loaded under 14,000 lbs / Loaded over 14,000 lbs). A city name is NOT a zip code.
- UNLOADING TO THE GROUND: YES, we lower the container directly onto the ground with our specialized crane equipment on our trailers.

SLANG THAT IS EASY TO MISREAD:
- "one trip" / "one-trip" / "on trip" / "1 trip" → industry term for a BRAND NEW container (one voyage from the factory). ALWAYS condition "Nuevo", never "Usado".
- "wwt" / "wind water tight" / "cargo worthy" / "cw" / "water tight" / "no leaks" / "doors close" / looks don't matter → they want a USED WWT unit. Extract condition "Usado". If they also ask about leaks/quality, answer with our WWT info.
- "need closer" / "can you do better" / "bottom line" / "best price" / "lowest" / "closer deal" / any discount request → they want a price reduction → explain our pricing policy warmly.
- "pick up" / "retirar" / "lo retiro yo" / "recoger en su patio" → they want to collect it themselves at OUR yard. Use intent "general_chat" and output EXACTLY this in ai_reply: (EN) "If you prefer to pick up the container yourself at our yard, please call us at 786-768-4409." (ES) "Si prefiere retirarlo usted mismo en nuestro patio, por favor llámenos al 786-768-4409." Do NOT change the action. NEVER treat "estoy buscando" / "I'm looking for" as pickup.
- "en mi patio" / "my yard" / "my lot" / "almacenar" / "para guardar" → they want a container delivered to THEIR property for storage (buy or rent). That is NOT a visit to our office. Do not give our address.

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
- "quote" → they are giving new data (size, zip, condition, type, reefer motor, quantity) or asking for ANY price that is not already in CURRENT SESSION STATE. Leave ai_reply null so the system sends the exact number ONLY when they did not also ask a side question. Never write filler like "I'll get you a quote shortly". If they need to MOVE/haul a container they already own, action MUST be "Transporte"; if going to another country, action MUST be "Exportacion".
- "general_chat" → greetings, small talk, payment/how-it-works, and any question that is not a request for a NEW price from the database. If they confirm a size ("20 std is good") AND ask something else in the SAME message (payment, delivery, photos), answer THAT question in ai_reply — do NOT leave ai_reply null. Greetings ("hola", "cómo estás"): reply like a real person in 1–2 short sentences, vary the wording, do NOT paste a company intro or list buy/rent/transport unless they asked for prices. Customers will ask things you have never seen. Answer like an experienced salesperson in 2-5 sentences using COMPANY FACTS. You MAY reference prices listed in CURRENT SESSION STATE, and no other number. NEVER invent a policy, a price, or a capability. There are NO buttons — never say "elige una opción" or "tap".
- "proceed" → they clearly confirm the order AFTER receiving a final price (sí proceder, yes proceed, let's do it, I'll take it, listo, adelante, lo quiero, confirmo). Never for questions, and never for a lone "yes"/"si" that answers a different question. If they agree but change the quantity at the same time, use "quote" so the price is recalculated.
- "cancel" → they clearly want to stop (bye, no thanks, not interested, too expensive, I'll think about it, shopping around). NEVER for "ok" / "okay" / "vale" / "perfecto" / a thumbs-up — those are acknowledgments, use general_chat and invite them to proceed or ask something else. If they thanked you, reply "¡De nada!" / "You're welcome!"; if they just said goodbye, "¡Gracias!" / "Thank you!".
- "photos" → their FIRST request for photos, pictures, images, gallery, or to see the unit before buying. Leave ai_reply null; the system sends the full policy and gallery. If that policy is ALREADY in this conversation, use "general_chat" with a short warm reply (2-4 sentences): acknowledge you already explained it, reassure them the driver sends photos of the exact unit on delivery day and waits for their approval, and ask if they want to proceed. Sound like a person, not a script, and don't repeat the long message or the gallery link unless they ask for the link.
- PHOTO HESITATION ("no me gusta comprar sin ver", "I won't buy blind"): use "general_chat" with a warm, empathetic ai_reply (3-5 sentences). Validate their concern, explain delivery-day photos + approval before the truck leaves, mention WWT/guarantee if used, and gently invite them to proceed — never reply with a generic "what else would you like to know?".
- "dimensions" → their FIRST request for exact dimensions, measurements, length, width, or height. NOT for delivery time ("how long"). If already sent in this conversation, use "general_chat".
- "provide_info" → they are giving their name or phone number.

FIRST CONTACT: greetings go in ai_reply, naturally. If they ask for prices without a service, briefly ask whether they want to buy, rent, or move a container they already own — in your own words, no script dump. Customers type everything; do not mention buttons.

CONVERSATION RULES:
- Always answer the LAST customer message first, politely, like a salesperson. If they asked whether you sell used containers, say yes (WWT used, one-trip new also available) and invite them to tell you size or ZIP when they want a quote. Do NOT jump to ZIP, size chips, or "what service" until they ask for a price or start giving quote data. When they ARE ready to quote (how much, a size they want, a ZIP, "cotízame"), then collect the missing fields and close.
- NEVER accuse the customer of saying something they did not say.
- PRICE DOUBTS / SIZE COMPARISONS (e.g. "el 40' es más barato, ¿está mal?") → "general_chat". Explain honestly and do NOT re-quote. For used reefers a 20' CAN cost more than a 40' because 20' units are scarcer in inventory and delivery economics differ; that is normal.
- CONDITION COMPARISONS ("is used cheaper?", "el usado es más barato no?") → "general_chat", and do NOT extract a condition from that question. But "¿los nuevos son más caros?" is a request for the NEW price → "quote" with condition "Nuevo" and ai_reply null.
- NEVER assume New. Do assume Used when they describe a WWT / budget storage unit without asking for new: "no leaks", "doors close/seal", "how it looks no concern" / appearance doesn't matter, "price is right", short-term storage. Then set condition "Usado" and do NOT ask used vs brand-new. If they didn't describe that and didn't say used/new, leave condition null and let the system ask.
- RENT FLOW: we only rent DRY containers for US storage. If they ask to rent a reefer, say we don't rent reefers and continue with dry rental. The system asks SIZE first (20'/40'/45'), then Used vs New, then ZIP. Never skip size. If they ask something else mid-flow, use "general_chat" and answer it while the system keeps collecting the missing fields.
- BUY FLOW: ask Dry vs Reefer ONLY when the customer is buying a normal **20' or 40'** container. Never ask for 45' (dry only), Open Side, or Double Door — reefers exist ONLY as normal 20' and 40'. Order: condition → size → Dry/Reefer (if 20/40) → reefer motor (if used reefer) → ZIP.
- EXPORT FLOW: when they first ask for export, do NOT ask for the port zip code. The system asks for the US zip to locate the nearest depot and quotes the container first. ONLY after they received that quote AND explicitly ask to add inland transport (empty drop for loading and/or loaded to a US port) should you ask for the zip and store it in port_dest.
- TRANSPORT FLOW: YES we move a container they already own (e.g. Miami house → Tampa lot). Answer that first like an expert. In ai_reply, ask whatever is still missing in YOUR OWN WORDS: the size it IS (20/40/45), the 5-digit pickup ZIP and delivery ZIP, and empty vs loaded (under/over 14,000 lbs). If they named two cities, ask for each city's ZIP and NEVER tell them to type the same ZIP twice — that is only if BOTH ends share one zip. NEVER invent a ZIP or a dollar amount; the system quotes from the database. Do not leave ai_reply null while collecting these fields.
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
- CONDITION. "new" / "nuevo" / "brand new" / "one trip" / "one-trip" / "on trip" / "1 trip" → "Nuevo". "used" / "usado" / "second hand" / "pre-owned" / "wwt" / "cargo worthy" / "cw" → "Usado". Also "Usado" when they specify WWT needs or a cheap storage unit: no leaks, doors close/seal, appearance doesn't matter, "price is right" deal. Only leave it null if they said neither used/new NOR those used-quality cues.
- TYPE. "reefer" / "refrigerado" / "refrigerated" / "cold" / "freezer" → "Reefer". "standard" / "dry" / "estandar" / "regular" / "normal" → "Dry". "open side" / "puertas laterales" / "abre por el lado" → "Open Side". "double door" / "puertas dobles" / "doble puerta" / "tunel" / "tunnel" → "Double Door". NEVER change the type unless they explicitly name one — if they just ask for another size ("y el de 40'"), leave type null so the current one is kept.
- ACTION. Infer from meaning, not from a keyword list. If they want to move/haul/relocate a container they already own ("need one moved", "I have a container", "pick it up from my lot") → "Transporte"; do NOT extract condition or type. If they want to rent for US storage → "Alquilar". If they want to buy or get a container they do not already own → "Comprar". Do NOT default to Comprar just because they asked "price" or named a size. If CURRENT SESSION already has a Service, keep it unless this last message clearly switches. On a pure field answer (zip, used/new, empty/loaded, a size tap), leave action null. "export" / "exportacion" → "Exportacion"; renting in an export conversation stays "Exportacion" with export_action "Comprar".
- QUANTITY. "two"/"2"/"dos"/"couple"/"a pair" → 2. "three"/"3"/"tres" → 3. "one"/"1"/"un"/"uno" → 1.
- REEFER STATUS. "working" / "funcionando" / "with ac" / "with motor" → "Funcionando". "not working" / "no funciona" / "no ac" / "sin motor" / "broken" → "No Funcionando".
- LOAD STATUS. "empty" / "vacio" → "Vacio". "under 14000" / "menos de 14000" / "<14k" → "Cargado_Under14000". "over 14000" / "más de 14000" / ">14k" → "Cargado_Over14000". "loaded" / "cargado" / "lleno" / "full" with NO weight → "Cargado_Over14000".
- ZIPS. Extract 5-digit zips exactly and NEVER treat a 3 or 4-digit number (e.g. 1400) as a zip. For transport, "del 33139 al 32470" / "from 33139 to 32470" / "33139 32470" means zip_origin=33139 AND zip_dest=32470 — extract both. If they CORRECT a zip ("me confundí, el zip de entrega es 32148"), use intent "quote" and update zip_dest or zip.
- ITEMS is the full shopping cart. If they previously asked for several sizes (e.g. 20 and 40), output ALL of them with their sizes in EVERY response, even when they are only answering a follow-up question. Never wipe the cart.
- customer_name: YOU alone decide if they gave a person's or company name. Put ONLY that name (e.g. "Jonh", "Juan Carlos", "Crossties of Ocala"). If they say "mi nombre es Jonh" / "my name is Jonh", customer_name is "Jonh". NEVER copy the whole sentence. NEVER use thanks, okay, proceed, greetings, used/new, ZIP, prices, or questions as a name — those are customer_name null. If they say "already did" or "see above", find the name earlier in the conversation. customer_phone: any 10-digit number, else null.
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
        "pending_debounce_version", "pending_debounce_payload",
        "transport_pending_origin", "transport_pending_dest",
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
    if (!session?.action && !session?.size && !session?.zip) {
        if (session?.lang === "ES") return "CRITICAL: The customer is speaking SPANISH. Your ai_reply MUST be in Spanish. Set lang to \"ES\".";
        if (session?.lang === "EN") return "CRITICAL: The customer is speaking ENGLISH. Your ai_reply MUST be in English. Set lang to \"EN\".";
        return "";
    }
    const lines: string[] = [];
    if (session.lang === "ES") {
        lines.push("CRITICAL: The customer is speaking SPANISH. Your ai_reply MUST be in Spanish. Set lang to \"ES\".");
    } else if (session.lang === "EN") {
        lines.push("CRITICAL: The customer is speaking ENGLISH. Your ai_reply MUST be in English. Set lang to \"EN\".");
    }
    lines.push("CURRENT SESSION STATE (already collected — do NOT ask for these again):");
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
    if (session.action === "Transporte") {
        const need: string[] = [];
        if (!session.size) need.push("size of the container they already own (20/40/45)");
        if (!session.zip_origin || !session.zip_dest) {
            need.push("two 5-digit ZIPs (pickup AND delivery). If they named two different cities, ask one ZIP per city. NEVER say to enter the same ZIP twice unless they said it is the same place. NEVER invent a ZIP.");
        }
        if (!session.load_status) need.push("load status: empty / loaded under 14,000 lbs / loaded over 14,000 lbs");
        if (need.length) {
            lines.push("STILL NEEDED — you MUST ask these in ai_reply, in your own words, like a logistics advisor:");
            for (const n of need) lines.push(`- ${n}`);
        }
    }
    lines.push("HARD RULE: never write a $ amount that is not listed in this session state. The database quotes prices.");
    return lines.join("\n");
}

function isBareGreeting(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    return /^(hola+|hello|hi|hey|buenas|buenos d[ií]as|buenas tardes|buenas noches|good (morning|afternoon|evening))[\s!.]*$/i.test(lo);
}

async function callGreetingAI(input: string, lang: string): Promise<string | null> {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return null;
    const spoken = lang === "ES" ? "Spanish" : "English";
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.95,
                max_tokens: 90,
                messages: [
                    {
                        role: "system",
                        content: `You are Tulip, a warm salesperson at RP Tulipan (Florida shipping containers). The customer just opened chat with a greeting. Reply in ${spoken} with 1–2 short, natural sentences. Vary the wording every time. Do not introduce a service menu (no buy/rent/transport list). Do not mention buttons or “elige una opción”. Do not quote prices. Invite them, in your own words, to tell you what they need.`,
                    },
                    { role: "user", content: input },
                ],
            }),
        });
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        if (typeof text === "string" && text.trim()) return text.trim();
    } catch (e) {
        console.error("greeting AI error:", e);
    }
    return null;
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
                temperature: 0.7
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
    if (/\b(don'?t|do not|no)\s+(need|want)\b/i.test(lo) && /\b(new|nuevo|reefer|refriger)/i.test(lo)) return false;
    if (/\b(not|without)\s+(interested in\s+)?(a\s+)?(new|nuevo)\b/i.test(lo)) return false;
    return /\bone[\s-]?trip\b/.test(lo)
        || lo.includes("brand new")
        || /\b(nuevos?|nuevas?|new)\b/.test(lo);
}

function mentionsUsedConditionExplicit(text: string): boolean {
    const lo = text.toLowerCase();
    return /\b(usados?|usadas?|used|second hand|pre-owned|wwt|cargo worthy|cw)\b/.test(lo)
        || lo.includes("wind water tight")
        || /\b(good condition|in good condition|decent condition|fair condition)\b/.test(lo);
}

/** Customer described a used WWT / budget storage unit without saying the word "used". */
function impliesUsedFromQualityPrefs(text: string): boolean {
    if (mentionsNewCondition(text)) return false;
    const lo = (text || "").toLowerCase();
    const looksDontMatter = /how it looks.{0,60}no concern|no concern.{0,40}how it looks|looks?\s+(don'?t|doesn'?t|do not|does not)\s+matter|appearance.{0,40}(no concern|doesn'?t matter|not a concern|no importa)|no me importa.{0,50}(aspecto|apariencia|c[oó]mo se ve|como se ve|est[eé]tica)|aspecto.{0,25}no (me )?import|el aspecto no/i.test(lo);
    const wwtNeed = /\bno leaks\b|sin filtracion|sin goteras|sin fugas|doors?\s+(close|seal)|puertas?\s+(cierren?|cierran|sellan)/i.test(lo);
    const bargainStorage = /price is right/i.test(lo)
        || (/looking for.{0,30}deal/i.test(lo) && /\b(storag|almacen)/i.test(lo));
    return looksDontMatter || wwtNeed || bargainStorage;
}

function mentionsUsedCondition(text: string): boolean {
    return mentionsUsedConditionExplicit(text) || impliesUsedFromQualityPrefs(text);
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

function isLikelyStreetNumber(text: string, match: RegExpMatchArray): boolean {
    const idx = match.index ?? 0;
    const after = text.slice(idx + match[0].length);
    const before = text.slice(Math.max(0, idx - 4), idx);
    if (/#\s*$/.test(before)) return true;
    // Suffix must follow the number as its own token (or after a short street name).
    // Do not scan the rest of the sentence — "1st of October" used to look like "st".
    return /^\s*(?:#\s*)?(?:(?:apt|unit|ste|suite)\s+)?(?:[A-Za-z][A-Za-z0-9.'-]*\s+){0,4}(?:dr|drive|st|street|ave|avenue|rd|road|ln|lane|blvd|boulevard|way|ct|court|pl|place|cir|circle|hwy|highway)\b/i.test(after);
}

function isNonContinentalZipPrefix(prefix: string): boolean {
    return ["006", "007", "009", "995", "996", "997", "998", "999", "967", "968"].includes(prefix);
}

function isValidUsZip(code: string): boolean {
    if (!/^\d{5}$/.test(code)) return false;
    const n = parseInt(code, 10);
    if (n < 501 || n > 99950) return false;
    return !isNonContinentalZipPrefix(code.substring(0, 3));
}

function extractAllValidZips(text: string): string[] {
    const found: string[] = [];
    const re = /\b(\d{5})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (isLikelyStreetNumber(text, m)) continue;
        if (!isValidUsZip(m[1])) continue;
        found.push(m[1]);
    }
    return found;
}

function extractZipFromText(text: string): string | null {
    const zips = extractAllValidZips(text);
    return zips[0] || null;
}

/** Extract origin + destination ZIP pair for transport (del 33139 al 32470, 34135 to 34119, etc.) */
function extractTransportZipsFromText(text: string): { zip_origin: string; zip_dest: string } | null {
    const t = text || "";
    const routePatterns = [
        /(?:del|de|desde|from)\s*(\d{5})\s*(?:al|a|hasta|to)\s*(\d{5})/i,
        /\b(\d{5})\s+(?:to|→)\s+(\d{5})\b/i,
        /\bin\s+(\d{5})\b[\s\S]*?(?:delivered|delivery|entrega|entregar|need delivered|need to be delivered)\s+(?:to\s+)?(\d{5})\b/i,
        /(?:container\s+is\s+)?in\s+(\d{5})[\s\S]*?(?:delivered|delivery|to)\s+(\d{5})\b/i,
        /\b(\d{5})\s+(\d{5})\b/,
    ];
    for (const pat of routePatterns) {
        const m = t.match(pat);
        if (m && isValidUsZip(m[1]) && isValidUsZip(m[2])) {
            return { zip_origin: m[1], zip_dest: m[2] };
        }
    }
    const allZips = extractAllValidZips(t);
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

const TRANSPORT_CITY_RE = /\b(miami|tampa|orlando|jacksonville|savannah|atlanta|titusville|naples|hialeah|kendall|homestead|hollywood|sarasota|bradenton|clearwater|tallahassee|gainesville|ocala|lakeland|pensacola|fort\s+myers|fort\s+lauderdale|west\s+palm|boca\s+raton|st\.?\s*petersburg|bonita\s+springs)\b/gi;

function namedTransportCities(text: string): string[] {
    const found = [...(text || "").matchAll(TRANSPORT_CITY_RE)].map((m) => m[1].replace(/\s+/g, " ").trim());
    const out: string[] = [];
    for (const c of found) {
        if (!out.some((u) => u.toLowerCase() === c.toLowerCase())) out.push(c);
    }
    return out;
}

function conversationCityRoute(input: string, history?: any): { pickup: string; delivery: string } | null {
    for (const text of conversationUserTexts(input, history)) {
        const cities = namedTransportCities(text);
        if (cities.length >= 2) return { pickup: cities[0], delivery: cities[1] };
    }
    return null;
}

function splitTransportAddressParts(text: string): { pickup?: string; delivery?: string } {
    const t = (text || "").replace(/\n/g, " ").replace(/casaen/gi, "casa en");
    const seps = [/\s+\bto\b\s+/i, /\s+→\s+/, /\s+hasta\s+/i, /\s+\ba\b\s+/i, /\s+al\s+/i];
    for (const sep of seps) {
        const parts = t.split(sep);
        if (parts.length >= 2) {
            return { pickup: parts[0].trim(), delivery: parts.slice(1).join(" ").trim() };
        }
    }
    const cities = namedTransportCities(t);
    if (cities.length >= 2) {
        return { pickup: `${cities[0]}, USA`, delivery: `${cities[1]}, USA` };
    }
    return {};
}

function buildTransportZipsAsk(lang: string, input: string, history?: any): string {
    const route = conversationCityRoute(input, history);
    const samePlace = /\b(mismo\s+(zip|lugar|sitio)|same\s+(zip|place|spot)|aqu[ií]\s+mismo)\b/i.test(
        conversationUserTexts(input, history).join(" "),
    );
    if (lang === "ES") {
        if (route && route.pickup.toLowerCase() !== route.delivery.toLowerCase() && !samePlace) {
            return `Sí, hacemos ese traslado. Para cotizar necesito el **ZIP de 5 dígitos de recogida en ${route.pickup}** y el **de entrega en ${route.delivery}**. No es el mismo código postal.`;
        }
        return "Para cotizar el traslado necesito el **código postal de 5 dígitos de recogida** y el **de entrega**.";
    }
    if (route && route.pickup.toLowerCase() !== route.delivery.toLowerCase() && !samePlace) {
        return `Yes, we do that move. To quote it I need the **5-digit pickup ZIP in ${route.pickup}** and the **delivery ZIP in ${route.delivery}**. Those are not the same ZIP.`;
    }
    return "To quote the move I need the **5-digit pickup ZIP** and the **delivery ZIP**.";
}

async function resolveAddressToZip(addressText: string): Promise<string | null> {
    const q = (addressText || "").trim();
    if (!q || q.length < 8) return null;
    const embedded = extractZipFromText(q);
    if (embedded) return embedded;
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { "User-Agent": "RPTulipan-Chatbot/1.0 (contact@rptulipan.com)" } });
        if (!res.ok) return null;
        const json = await res.json();
        if (!Array.isArray(json) || !json[0]?.address?.postcode) return null;
        const pc = json[0].address.postcode.toString().replace(/\D/g, "").substring(0, 5);
        return isValidUsZip(pc) ? pc : null;
    } catch {
        return null;
    }
}

async function tryGeocodeTransportRoute(input: string, history: any): Promise<{ zip_origin: string; zip_dest: string } | null> {
    for (const text of conversationUserTexts(input, history)) {
        const pair = extractTransportZipsFromText(text);
        if (pair) return pair;
        const parts = splitTransportAddressParts(text);
        if (parts.pickup && parts.delivery) {
            const [origin, dest] = await Promise.all([
                resolveAddressToZip(parts.pickup),
                resolveAddressToZip(parts.delivery),
            ]);
            if (origin && dest) return { zip_origin: origin, zip_dest: dest };
        }
    }
    return null;
}

function isTransportZipConfirmation(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    return ["yes", "sí", "si", "correct", "correcto", "that's correct", "thats correct", "yes, that's correct", "sí, correcto", "exacto"].includes(lo)
        || /^(yes|sí|si)[\s,!.]*$/i.test(lo);
}

function isTransportZipRejection(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    return /\b(no|incorrect|wrong|not right)\b/.test(lo)
        || /\b(no,? i('|')?ll type|d[eé]jame escrib|escribo los zip)\b/.test(lo);
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
        const pair = extractTransportZipsFromText(input);
        if (pair && (pair.zip_origin !== session?.zip_origin || pair.zip_dest !== session?.zip_dest)) return true;
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

/**
 * The customer is asking WHICH container type a price refers to, or comparing types
 * ("¿estos precios son de secos o refrigerados?"), instead of ordering that type.
 * Naming a type inside such a question must never switch the quote to it.
 */
function isTypeClarificationQuestion(text: string): boolean {
    const lo = (text || "").toLowerCase().trim();
    if (!/\?/.test(lo) && !/\b(no\?|verdad|cierto|right)\s*$/.test(lo)) return false;
    if (!/\b(reefer\w*|refrigerad\w*|congelad\w*|open[\s-]?side|double[\s-]?door|doble[\s-]?puerta)\b/.test(lo)) return false;

    // "¿... secos o refrigerados?" — they want us to say which one it is
    if (/\b(seco\w*|dry|est[aá]ndar|standard|normal\w*)\b/.test(lo) && /\b(o|or)\b/.test(lo)) return true;
    // "¿estos precios son de refrigerados?" — asking what the quote we already sent covers
    if (/\b(precios?|prices?|cotizaci[oó]n|quote)\b/.test(lo) && /\b(son|es|are|is|incluyen|include)\b/.test(lo)) return true;
    // "¿cuál es la diferencia entre un seco y un refrigerado?"
    if (/\b(diferencia|difference)\b/.test(lo)) return true;
    return false;
}

/**
 * Post-quote: they want the price of a different container type
 * ("quiero saber el precio de los refrigerados"), not a clarification of the current quote.
 */
function typePriceRequestFromInput(input: string, session: any): "Reefer" | "Open Side" | "Double Door" | "Dry" | null {
    if (!hasQuotedPrice(session)) return typeSwitchFromInput(input, session);
    if (isTypeClarificationQuestion(input)) return null;
    const switched = typeSwitchFromInput(input, session);
    if (switched) return switched;
    const lo = (input || "").toLowerCase();
    const named = extractTypeFromText(input);
    const wantsPrice = /\b(precio|price|cotiz|cu[aá]nto|how much|cuestan|cuesta|cost|prices)\b/.test(lo)
        || /^(prices?|precios?)\??$/i.test(lo.trim())
        || statesProductChoice(input);
    if (named && wantsPrice) return named;
    if (named && /\b(entonces|instead|mejor|rather)\b/.test(lo)) return named;
    if (wantsPrice && /\b(seco\w*|dry|regular|standard|normal)\b/.test(lo) && !named) return "Dry";
    return null;
}

function needsBuyType(session: any, input?: string, history?: any): boolean {
    if (session?.action !== "Comprar" || session?.type) return false;
    const combined = input ? conversationUserTexts(input, history).join("\n") : "";
    const inferred = extractTypeFromText(combined);
    if (inferred) return false;
    const size = session?.size;
    if (size && !isReeferEligibleBuySize(size)) return false;
    if (size && isReeferEligibleBuySize(size)) return true;
    // Dual quote (20'+40') when zip is known but no explicit size — still need Dry/Reefer
    if (!size && session?.zip && !hasExplicitSingleSize(session, history, input || "")) return true;
    return false;
}

/** Reefers and the Dry/Reefer question only apply to normal 20' and 40' — never 45'. */
function isReeferEligibleBuySize(size: string | null | undefined): boolean {
    if (!size) return false;
    if (size.includes("45")) return false;
    if (size === "20' & 40'") return true;
    return size.includes("20") || size.includes("40");
}

function isSpecialtyBuyType(type: string | null | undefined): boolean {
    return type === "Open Side" || type === "Double Door";
}

/** Size chips for purchase — reefers and specialty types are 20'/40' only; 45' only for dry. */
function buySizeButtons(session: any, dict: any): string[] {
    if (session?.type === "Reefer" || isSpecialtyBuyType(session?.type)) return ["20'", "40'"];
    if (session?.type === "Dry" && session?.size?.includes("45")) return ["20'", "40'", "45'"];
    return dict.step3_size_btns;
}

/** Auto-set type when Dry/Reefer question does not apply (45', Open Side, Double Door, explicit type). */
function applyBuyTypeDefaults(session: any, updates: any, input: string, history: any): void {
    if (session?.action !== "Comprar" || session?.type) return;
    const combined = conversationUserTexts(input, history).join("\n");
    const inferred = extractTypeFromText(combined);
    if (inferred === "Open Side" || inferred === "Double Door") {
        session.type = inferred;
        updates.type = inferred;
        session.condition = "Nuevo";
        updates.condition = "Nuevo";
        applyTypeToItems(session, inferred);
        if (session.items) updates.items = session.items;
        return;
    }
    if (inferred === "Reefer" || inferred === "Dry") {
        session.type = inferred;
        updates.type = inferred;
        applyTypeToItems(session, inferred);
        if (session.items) updates.items = session.items;
        return;
    }
    const size = session.size || extractSizeFromText(combined);
    if (size && size.includes("45")) {
        session.type = "Dry";
        updates.type = "Dry";
        applyTypeToItems(session, "Dry");
        if (session.items) updates.items = session.items;
    }
}

function applyTypeToItems(session: any, type: string | null | undefined): void {
    if (!type || !Array.isArray(session?.items)) return;
    for (const item of session.items) item.type = type;
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
    const used = mentionsUsedCondition(text);
    const neu = mentionsNewCondition(text);
    if (used && !neu) return "Usado";
    if (neu && !used) return "Nuevo";
    if (neu) return "Nuevo";
    return null;
}

function extractReeferStatus(text: string): "Funcionando" | "No Funcionando" | null {
    const lo = (text || "").toLowerCase().trim();
    if (!lo) return null;
    if (["funcionando", "working"].includes(lo)) return "Funcionando";
    if (["no funcionando", "not working"].includes(lo)) return "No Funcionando";
    if (/\b(no\s+funcionand\w*|not\s+working|sin\s+motor|no\s+ac|broken)\b/.test(lo)) return "No Funcionando";
    if (/\b(funcionand\w*|working|with\s+ac|con\s+motor)\b/.test(lo)) return "Funcionando";
    return null;
}

function extractTypeFromText(text: string): "Reefer" | "Open Side" | "Double Door" | "Dry" | null {
    // Callers pass whole conversations joined by newlines, so filter per message: a
    // clarification question must not count as ordering the type it names.
    const lo = (text || "")
        .split("\n")
        .filter((line) => !isTypeClarificationQuestion(line))
        .join("\n")
        .toLowerCase();
    if (/\b(reefer|refrigerad\w*|refrigerated|freezer|cold storage|congelad\w*)\b/.test(lo)) return "Reefer";
    if (/\b(open[\s-]?side|puertas?\s+laterales?|side[\s-]?opening|abre\s+por\s+el\s+lado)\b/.test(lo)) return "Open Side";
    if (/\b(double[\s-]?door|doble[\s-]?puerta|tunnel|tunel|túnel)\b/.test(lo)) return "Double Door";
    if (/\b(dry|seco\w*|regular|est[aá]ndar|standard|normal)\b/.test(lo)) return "Dry";
    return null;
}

function isCancellationMessage(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    return ["forget it", "never mind", "nevermind", "not interested", "no thanks", "no thank you", "olvidalo", "olvídalo", "déjalo", "dejalo"].includes(lo)
        || /\b(forget it|never mind|not interested|leave it)\b/.test(lo);
}

/** Customer rejects the quoted type or asks for a different one — including without saying "price". */
function typeSwitchFromInput(input: string, session?: any): "Reefer" | "Open Side" | "Double Door" | "Dry" | null {
    const lo = (input || "").toLowerCase();
    if (/\b(don'?t|do not|no)\s+(need|want)\s+(a\s+)?(new\s+)?reefer/i.test(lo)) return "Dry";
    if (/\b(don'?t|do not|no)\s+(need|want)\s+(a\s+)?(new\s+)?refriger/i.test(lo)) return "Dry";
    if (/\b(not|without|no)\s+(a\s+)?reefer/i.test(lo)) return "Dry";
    if (/\b(not|without|no)\s+(a\s+)?refriger/i.test(lo)) return "Dry";
    const named = extractTypeFromText(input);
    if (named) return named;
    if (/\b(regular|standard|normal)\s+(container|contenedor)/i.test(lo)) return "Dry";
    if (/\b(looking for|want|need|i need|i want)\s+(a\s+)?(regular|standard|normal|dry|seco)/i.test(lo)) return "Dry";
    if (session?.type === "Reefer" && /\b(don'?t|do not|no)\s+(need|want)\b/i.test(lo)) return "Dry";
    return null;
}

function sanitizeInferredType(input: string, session: any, data: any): void {
    if (session?.action !== "Comprar" && data.action !== "Comprar") return;
    const combined = conversationUserTexts(input, session?.history).join("\n");
    const explicit = typeSwitchFromInput(input, session) || extractTypeFromText(combined);
    if (explicit) {
        data.type = explicit;
        if (data.items?.length) {
            for (const item of data.items) item.type = explicit;
        }
        return;
    }
    if (data.type === "Reefer" && !/\b(reefer|refrigerad\w*|refrigerated|freezer|cold|congelad\w*)\b/i.test(combined)) {
        data.type = "Dry";
        if (data.items?.length) {
            for (const item of data.items) item.type = "Dry";
        }
    }
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
    if ((data.action || updates.action || session.action) === "Transporte") return;
    const explicitCond = resolveExplicitCondition(input, session.history, data, session);
    if (explicitCond) {
        updates.condition = explicitCond;
        session.condition = explicitCond;
    }
}

function ensureDryDefaultType(session: any, updates: any, input: string, history: any): void {
    const combined = conversationUserTexts(input, history).join("\n");
    const inferredType = extractTypeFromText(combined);
    if (session.action === "Alquilar") {
        session.type = "Dry";
        updates.type = "Dry";
        applyTypeToItems(session, "Dry");
        if (session.items) updates.items = session.items;
        return;
    }
    if (inferredType) {
        session.type = inferredType;
        updates.type = inferredType;
        applyTypeToItems(session, inferredType);
        if (session.items) updates.items = session.items;
        if (inferredType === "Open Side" || inferredType === "Double Door") {
            session.condition = "Nuevo";
            updates.condition = "Nuevo";
        }
        return;
    }
    // Sale asks Dry vs Reefer with buttons — do not assume Dry
    if (session.action === "Comprar") return;
    if (!session.type || session.type === "Dry") {
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

function applyConversationInferences(input: string, history: any, data: any, session?: any): void {
    const userTexts = conversationUserTexts(input, history);
    const combined = userTexts.join("\n");
    const oneTrip = userTexts.some((t) => /\bone[\s-]?trip\b/i.test(t));
    const resolvedCondition = resolveExplicitCondition(input, history, data);
    const inferredSize = extractSizeFromText(combined);
    const lastInferredAction = inferServiceAction(input);
    const convoRent = inferServiceAction(combined) === "Alquilar"
        || servicesNamedInMessage(combined).has("Alquilar")
        || session?.action === "Alquilar";
    const thisMessageBuys = inferServiceAction(input) === "Comprar" || servicesNamedInMessage(input).has("Comprar");
    const sizeDefaultsToBuy = !data.action
        && session?.action !== "Transporte"
        && session?.action !== "Alquilar"
        && !convoRent
        && (inferredSize || oneTrip || /\b(deliver|delivery|entrega|entregar)\b/i.test(combined));
    const inferredAction = lastInferredAction
        || inferServiceAction(combined)
        || (sizeDefaultsToBuy ? "Comprar" : null);

    if (lastInferredAction) data.action = lastInferredAction;
    else if (!data.action && inferredAction) data.action = inferredAction;
    if (convoRent && !thisMessageBuys && data.action !== "Transporte") {
        data.action = "Alquilar";
    }

    const inferredType = extractTypeFromText(combined);
    if (inferredType) {
        data.type = inferredType;
    }

    if (resolvedCondition && data.action !== "Transporte" && session?.action !== "Transporte") {
        data.condition = resolvedCondition;
    }

    if (inferredSize && !data.size) data.size = inferredSize;
    if (!data.type && (data.action === "Alquilar" || inferredAction === "Alquilar")) {
        data.type = "Dry";
    }
    if (!data.type && (data.action === "Comprar" || inferredAction === "Comprar") && !extractTypeFromText(combined)) {
        data.type = "Dry";
    }
    if (resolvedCondition === "Usado" || mentionsUsedCondition(combined)) {
        if (data.action !== "Transporte" && session?.action !== "Transporte") {
            if (!resolvedCondition && mentionsUsedCondition(combined)) data.condition = "Usado";
        }
    }

    const isTransport = (data.action || data.items?.[0]?.action) === "Transporte"
        || session?.action === "Transporte"
        || inferServiceAction(combined) === "Transporte";
    if (isTransport) {
        if (!data.action) data.action = "Transporte";
        const transportZips = inferTransportZipsFromConversation(input, history);
        if (transportZips) {
            if (!data.zip_origin) data.zip_origin = transportZips.zip_origin;
            if (!data.zip_dest) data.zip_dest = transportZips.zip_dest;
        }
        data.zip = null;
    } else if (session?.action !== "Transporte") {
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
        if (data.action === "Alquilar") item.action = "Alquilar";
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
            action: data.action || session?.action || (isTransport ? "Transporte" : "Comprar"),
        })];
        data.size = inferredSize;
    } else if (inferredSize) {
        data.items = [mergeItem({
            size: inferredSize,
            action: data.action || session?.action || (isTransport ? "Transporte" : "Comprar"),
        })];
    }
}

function conversationAssistantTexts(history: any): string[] {
    const texts: string[] = [];
    if (Array.isArray(history)) {
        for (const msg of history) {
            if (msg?.role === "assistant" && msg.content) texts.push(msg.content);
        }
    }
    return texts;
}

function extractQuotedAmountFromText(text: string): number | null {
    const m = (text || "").match(/\$\s*([\d]{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Human agent pasted a price quote in chat — not a generic bot policy message. */
function looksLikeHumanQuote(text: string): boolean {
    if (extractQuotedAmountFromText(text) == null) return false;
    return /\b(total\s+price|precio\s+total|delivered\s+to|delivery\s+to|entreg\w*\s+(a|en|hasta)|container\s+delivered|contenedor\s+entreg|cotizaci[oó]n|quoted|quote\s+is|is\s+\$)\b/i.test(text || "");
}

/** Recover buy/rent/transport + quote fields when a human agent quoted mid-conversation. */
function hydrateSessionFromConversation(session: any, input?: string): Record<string, any> {
    const history = session?.history;
    const userCombined = conversationUserTexts(input || "", history).join("\n");
    const inferredAction = inferServiceAction(userCombined)
        || ((extractSizeFromText(userCombined) || /\b(deliver|delivery|entrega|entregar)\b/i.test(userCombined))
            && !servicesNamedInMessage(userCombined).has("Alquilar")
            ? "Comprar" : null);

    const found: Record<string, any> = {};
    for (const text of conversationAssistantTexts(history)) {
        if (!looksLikeHumanQuote(text)) continue;
        const amount = extractQuotedAmountFromText(text);
        const size = extractSizeFromText(text);
        const condition = extractConditionFromText(text);
        const zip = extractZipFromText(text);
        const action = inferServiceAction(text) || (/\b(deliver|delivery|entreg)\b/i.test(text) ? "Comprar" : null);
        if (amount != null) {
            found.final_amount = amount;
            found.step = 6;
        }
        if (size && !found.size) found.size = size;
        if (condition && !found.condition) found.condition = condition;
        if (zip && !found.zip) found.zip = zip;
        if (action && !found.action) found.action = action;
    }

    if (!found.action && inferredAction) found.action = inferredAction;
    if (!found.size) {
        const sz = extractSizeFromText(userCombined);
        if (sz) found.size = sz;
    }
    if (!found.condition) {
        const cond = resolveExplicitCondition(input || "", history, {}, session)
            || extractConditionFromText(userCombined);
        if (cond) found.condition = cond;
    }
    if (!found.zip) {
        const z = inferZipFromConversation(input || "", history);
        if (z) found.zip = z;
    }
    if ((found.action === "Comprar" || session?.action === "Comprar") && !found.type && !session?.type) {
        found.type = "Dry";
    }

    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(found)) {
        if (value == null || value === "") continue;
        if (key === "step" || key === "final_amount") {
            if (!hasQuotedPrice(session)) updates[key] = value;
        } else if (session?.[key] == null) {
            updates[key] = value;
        }
    }
    return updates;
}

function buildQuoteFromText(input: string): any | null {
    const lo = input.toLowerCase();
    const transportZips = extractTransportZipsFromText(input);
    if (transportZips) {
        return {
            intent: "quote",
            extracted_data: {
                action: "Transporte",
                zip_origin: transportZips.zip_origin,
                zip_dest: transportZips.zip_dest,
                items: [{ action: "Transporte" }],
            },
        };
    }
    const size = extractSizeFromText(input);
    const condition = extractConditionFromText(input);
    const oneTrip = /\bone[\s-]?trip\b/.test(lo);
    const action = inferServiceAction(input) || (size || oneTrip || condition ? "Comprar" : null);
    const zip = extractZipFromText(input);
    if (!size && !oneTrip && !condition && !action && !zip) return null;

    const item: any = { action: action || "Comprar" };
    if (size) item.size = size;
    if (condition) item.condition = condition;

    const extracted_data: any = { items: [item], action: action || item.action };
    if (condition) extracted_data.condition = condition;
    if (size) extracted_data.size = size;
    if (zip) extracted_data.zip = zip;
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
        return "¡Hola! ¿En qué te puedo ayudar hoy?";
    }
    if (priceAsk) {
        return "Hi! Happy to help with pricing. To give you an exact quote, I first need to know **which service** you're looking for:\n\n• **Buy** a container\n• **Rent** for storage\n• **Transport** — move a container you already own\n\nWhich one do you need?";
    }
    return "Hi! How can I help you today?";
}

// ─── DETECCIÓN RÁPIDA SIN IA ──────────────────────────────────────────────────
function quickDetect(input: string, senderId: string, session: any): any | null {
    const lo = input.toLowerCase().trim();
    const quoted = hasQuotedPrice(session);
    const currentAction = session?.action;

    if (!session?.action && !quoted && isInitialPriceInquiry(input)) {
        return null;
    }

    if (["ok", "okay", "ok.", "vale", "perfecto"].includes(lo)) {
        const ack = (session?.lang === "ES")
            ? (quoted ? "Perfecto. Cuando quieras seguimos: dime tu nombre o escribe proceder." : "Perfecto, dime cómo te ayudo.")
            : (quoted ? "Sounds good. Whenever you're ready, send your name or type proceed." : "Sounds good — how can I help?");
        return { intent: "general_chat", lang: session?.lang, ai_reply: ack, extracted_data: {} };
    }

    if (isPhotosRequest(input)) {
        return { intent: "photos", lang: session?.lang, extracted_data: {} };
    }
    if (isDimensionsRequest(input)) {
        return { intent: "dimensions", lang: session?.lang, extracted_data: {} };
    }
    if (isCancellationMessage(input)) {
        return { intent: "cancel", extracted_data: {} };
    }

    const typeSwitch = typeSwitchFromInput(input, session);
    if (typeSwitch && (quoted || session?.type) && typeSwitch !== session?.type) {
        return {
            intent: "quote",
            extracted_data: {
                type: typeSwitch,
                action: session?.action,
                items: [{ type: typeSwitch, action: session?.action, size: session?.size }],
            },
        };
    }
    if (/^(prices?|precios?)\??$/i.test(lo) && quoted) {
        return {
            intent: "quote",
            extracted_data: {
                action: session?.action,
                type: session?.type || "Dry",
                size: session?.size,
                condition: session?.condition,
                zip: session?.zip,
                quantity: session?.quantity,
            },
        };
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
    if (["transporte", "transport"].includes(lo) || (inferServiceAction(input) === "Transporte" && servicesNamedInMessage(input).has("Transporte"))) {
        if (quoted && currentAction === "Transporte" && ["transporte", "transport"].includes(lo)) {
            return { intent: "proceed", extracted_data: {} };
        }
        const sz = extractSizeFromText(input);
        const item: any = { action: "Transporte" };
        if (sz) item.size = sz;
        return {
            intent: "quote",
            extracted_data: {
                action: "Transporte",
                items: [item],
                ...(sz ? { size: sz } : {}),
            },
        };
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
    if (composite) {
        if (quoted && isConversationalSideAsk(input)) return null;
        return composite;
    }
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

    if (transportZips) {
        return { intent: "quote", extracted_data: { zip_origin: transportZips.zip_origin, zip_dest: transportZips.zip_dest, action: "Transporte", items: [{ action: "Transporte" }] } };
    }
    const singleZip = extractZipFromText(input);
    if (singleZip && /^\d{5}$/.test(lo)) return { intent: "quote", extracted_data: { zip: singleZip } };

    return null;
}

// ─── LÓGICA PRINCIPAL ─────────────────────────────────────────────────────────
function parseQueueItem(q: string): { text?: string; mid?: string; type?: string; ts?: number } {
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
    return 0;
}

const MESSENGER_DEBOUNCE_MS = 5000;
const QUEUE_MAX_AGE_MS = 120000;

/**
 * Services the customer explicitly names in THIS message. Used to guard the stored service:
 * the AI defaults to "Comprar" on neutral replies ("usado", a bare zip), which would
 * otherwise turn a rent or transport conversation into a sale.
 */
const TRANSPORT_SERVICE_RE = /\b(mover\w*|moved|moving|move|mudar\w*|muev\w*|traslad\w*|transport\w*|haul\w*|relocat\w*)\b/i;

function mentionsTransportService(text: string): boolean {
    return TRANSPORT_SERVICE_RE.test(text || "");
}

function servicesNamedInMessage(text: string): Set<string> {
    const t = (text || "").toLowerCase();
    const found = new Set<string>();
    if (/\b(export\w*|exportaci[oó]n|overseas|internacional)\b/.test(t)) found.add("Exportacion");
    if (/\b(alquil\w*|rent\w*|lease\w*|arrend\w*)\b/.test(t)) found.add("Alquilar");
    if (/\b(comprar\w*|compra|compras|compro|compramos|buy|buying|purchas\w*|adquir\w*)\b/.test(t)) found.add("Comprar");
    if (mentionsTransportService(t)) found.add("Transporte");
    return found;
}

function looksLikeNeutralFieldAnswer(text: string): boolean {
    if (servicesNamedInMessage(text).size > 0) return false;
    if (inferServiceAction(text)) return false;
    const t = (text || "").trim();
    if (!t) return true;
    if (/^\d{5}(\s+\d{5})?$/.test(t)) return true;
    if (extractTransportZipsFromText(t)) return true;
    const lo = t.toLowerCase().replace(/[.,!?]/g, "").trim();
    if (/^(usado|used|nuevo|new|one[\s-]?trip|wwt|dry|reefer|refrigerado|vac[ií]o|empty|cargado|loaded|funcionando|working|not working|no funcionando)$/i.test(lo)) {
        return true;
    }
    const size = extractSizeFromText(t);
    if (size && t.length < 40 && !/\b(price|precio|how much|cu[aá]nto)\b/i.test(lo)) return true;
    return false;
}

function normalizeServiceAction(raw: any): string | null {
    if (raw == null || raw === "") return null;
    const s = String(raw);
    if (/export/i.test(s)) return "Exportacion";
    if (/alquil|rent/i.test(s)) return "Alquilar";
    if (/transp/i.test(s)) return "Transporte";
    if (/comprar|buy|sale/i.test(s)) return "Comprar";
    return s;
}

/** Trust the model's service when they switched meaning; ignore Comprar drift on zip/used/size taps. */
function resolveExtractedAction(input: string, sessionAction: string | null | undefined, extractedAction: any): string | null {
    const extracted = normalizeServiceAction(extractedAction);
    const current = normalizeServiceAction(sessionAction);
    if (!extracted) return current;
    if (!current || extracted === current) return extracted;
    if (looksLikeNeutralFieldAnswer(input) && !servicesNamedInMessage(input).has(extracted)) return current;
    if (current !== "Comprar" && extracted === "Comprar" && !servicesNamedInMessage(input).has("Comprar") && inferServiceAction(input) !== "Comprar") {
        return current;
    }
    return extracted;
}

function inferServiceAction(text: string): string | null {
    const t = (text || "").toLowerCase();
    if (!t.trim()) return null;
    const wantsExport = /\b(export|exportaci[oó]n|exportar|overseas|internacional)\b/i.test(t);
    if (wantsExport) return "Exportacion";
    const mentionsBuyOrRent = /\b(comprar|buy|purchase|alquil\w*|rent\w*|lease\w*|arrend\w*)\b/i.test(t);
    const wantsMove = mentionsTransportService(t);
    if (wantsMove && !mentionsBuyOrRent) return "Transporte";
    if (/\b(alquil\w*|rent\w*|lease\w*|arrend\w*)\b/i.test(t) && !/\b(comprar|buy|purchase)\b/i.test(t) && !wantsMove) return "Alquilar";
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
    const processQuestion = /\b(c[oó]mo ser[ií]a|how (would|does) (it|that) work|c[oó]mo (es|funciona) (el )?(proceso|pedido|la entrega))\b/.test(lo);
    if (/\?/.test(input) && !/\b(proceder|confirmar\s+(el\s+)?(pedido|orden|order)|ordenar)\b/.test(lo) && !processQuestion) return false;
    if (/\blo quiero\b/.test(lo)) {
        if (/\blo quiero\s+(poner|usar|guardar|colocar|instalar|meter|llevar|tener|dejar|pagar|ver|saber|preguntar|consultar|ponerlo|usarlo)\b/.test(lo)) return false;
        if (/\blo quiero\s+(confirmar|proceder|ordenar|reservar|comprar)\b/.test(lo)) return true;
        if (/^lo quiero[\s,.!]*$/.test(lo)) return true;
        return false;
    }
    if (/\b(me interesa|confirmo|adelante|listo|v[aá]monos|let's do it|lets do it|i'll take it|ill take it|quiero proceder|hag[aá]moslo|hag[aá]?m[oa]sl[oa]|deal|cerramos|ordenar|place the order|place my order|reservar|reserve it)\b/.test(lo)) return true;
    if (isOrderConfirmationPhrase(input) && hasQuotedPrice(session)) return true;
    if (hasQuotedPrice(session)) {
        if (/^(s[ií]|yes|ok|okay|vale|claro)([.!]|\s+(por favor|please))?$/i.test(lo)) return true;
        if (processQuestion) return true;
        if (/\b(qu[eé]\s+necesitas|what do you need|qu[eé] se necesita|qu[eé] m[aá]s necesitas|what else do you need|siguiente paso|next step)\b/.test(lo)) return true;
        if (/\bs[ií]\s*,?\s*qu[eé]\s+necesitas\b/.test(lo)) return true;
        if (/\bconfirmar\s+(el\s+)?(pedido|orden|order)\b/.test(lo)) return true;
        if (isChoosingPaymentMethod(input)) return true;
        if (isChoosingAlreadyQuotedCondition(input, session)) return true;
    }
    return false;
}

function extractUsPhone(input: string): string | null {
    const raw = input || "";
    const compact = raw.replace(/\D/g, "");
    if (compact.length === 11 && compact.startsWith("1")) return compact.slice(1);
    if (compact.length === 10) return compact;
    const m = raw.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/);
    if (!m) return null;
    const d = m[0].replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("1")) return d.slice(1);
    if (d.length === 10) return d;
    return null;
}

function isOrderConfirmationPhrase(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    if (!lo) return false;
    if (/^(ok|okay|okey|vale|claro|s[ií]|yes|dale|bueno|bien|perfecto|listo)[\s,!.]*$/i.test(lo)) return true;
    if (/\b(hag[aá]?m[oa]s?l[oa]|hagamoslo|hagamsolo|hagámoslo|vamos\s+a\s+(hacerlo|pedirlo|ordenarlo)|let'?s\s+do\s+it|lets\s+do\s+it)\b/i.test(lo)) return true;
    if (/^(ok|okay|vale|claro|s[ií]|yes)\s+(hag|vamos|dale|listo|adelante|proced|do it)/i.test(lo)) return true;
    return false;
}

function aiExtractedName(data: any): string | null {
    const n = String(data?.customer_name || "").replace(/\s+/g, " ").trim();
    return n || null;
}

function parseContactFromInput(input: string): { name: string | null; phone: string | null } {
    return { name: null, phone: extractUsPhone(input) };
}

function isChoosingAlreadyQuotedCondition(input: string, session?: any): boolean {
    if (!hasQuotedPrice(session)) return false;
    const quoted = sessionQuotedConditions(session);
    if (!statesProductChoice(input) && !/\b(entonces|mejor)\b/i.test(input || "")) return false;
    const used = mentionsUsedCondition(input);
    const neu = mentionsNewCondition(input);
    if (used && !neu && quoted.includes("Usado")) return true;
    if (neu && !used && quoted.includes("Nuevo")) return true;
    return false;
}

function quotedAmountForCondition(session: any, cond: "Nuevo" | "Usado"): number | null {
    const qp = parseQuotePriceMeta(session).quoted_prices || {};
    const sizeKey = normalizeSizeKey(session?.size || "");
    const n = qp[`${sizeKey}|${cond}`];
    return n != null && Number.isFinite(Number(n)) ? Number(n) : null;
}

function isChoosingPaymentMethod(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    return /^(con\s+)?(zelle|efectivo|cash|tarjeta|card|cheque|check)([.!]|\s+por\s+favor)?$/i.test(lo)
        || /^(pago|pagar[eé]|i'?ll pay|we'?ll pay|pay)\s+(con\s+|with\s+|by\s+)?(zelle|efectivo|cash|tarjeta|card|cheque|check)\b/i.test(lo);
}

function isPaymentPolicyQuestion(input: string): boolean {
    if (isChoosingPaymentMethod(input)) return false;
    const lo = (input || "").toLowerCase();
    if (/\b(cu[aá]ndo\s+(pago|pagamos|lo\s+pago)|pago\s+cuando|when do i pay|pay when|pay on delivery|pago al recibir|cuando lo reciba|forma de pago|payment method|c[oó]mo\s+(se\s+)?paga|how (do i |to |do you |does )?(do the )?pay|aceptan|do you accept|tarjeta o cheque|credit card)\b/.test(lo)) {
        return true;
    }
    if (/\b(payment|pago|pagar)\b/.test(lo) && /\b(how|c[oó]mo|when|cu[aá]ndo|delivery|entrega|before|antes|cash|efectivo|zelle|method|forma)\b/.test(lo)) {
        return true;
    }
    if (/\bpay\b/.test(lo) && /\b(cash|zelle|delivered|delivery|before|card|check)\b/.test(lo)) return true;
    return /\?/.test(input) && /\b(pago|pagar|pay|zelle|efectivo|cash)\b/.test(lo);
}

/** Policy / how-it-works question — not a request for a new database price. */
function isConversationalSideAsk(input: string): boolean {
    if (isChoosingPaymentMethod(input)) return false;
    if (isPaymentPolicyQuestion(input)) return true;
    if (isAskingOurLocation(input)) return true;
    if (isSchedulingQuestion(input)) return true;
    const lo = (input || "").toLowerCase();
    if (/\bhow much\b|\bcu[aá]nto\s*(cuesta|sale|es)\b|\bcot[ií]z/.test(lo)) return false;
    if (/\bhow\b/.test(lo)) return true;
    return /\b(where|located|address|oficina|wwt|leak|permiso|discount|garant)\b/.test(lo);
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

/** Customer hesitates to buy because they cannot see the exact unit first — often right after the photo policy. */
function isPhotoHesitationConcern(input: string, _session?: any): boolean {
    const lo = (input || "").toLowerCase();
    if (/\b(no me gusta|no quiero|me incomoda|me da miedo|me preocupa|me da desconfianza|no conf[ií]o|don't like|don't want|not comfortable|makes me nervous|worried|hesitant)\b/.test(lo)
        && /\b(comprar|buy|buying|ordenar|order|pagar|pay|invertir|invest)\b/.test(lo)
        && /\b(sin ver|without seeing|before seeing|a ciegas|blind|verlo|ver la unidad|ver el contenedor|see it|see what|what i'm buying|lo que compro)\b/.test(lo)) return true;
    if (/\b(sin ver|without seeing|a ciegas|before i see|before seeing)\b/.test(lo)
        && /\b(comprar|buy|antes|first)\b/.test(lo)) return true;
    if (/\bver lo que compro\b/.test(lo) || /\bsee what (i'm|im) buying\b/.test(lo)) return true;
    if (/\b(mmm+|uh+|eh+|no me gusta|no estoy seguro|not sure|no me convence)\b/.test(lo)
        && /\b(ver|see|foto|photo|unidad|unit|contenedor|container|comprar|buy)\b/.test(lo)) return true;
    return false;
}

function historyHasPhotoPolicy(session?: any): boolean {
    return historyLooksLike(session?.history, [
        "#gallery", "[policy_sent:photos]", "fotos del contenedor exacto", "photos of the exact container",
        "el día programado para su entrega", "on the day of your delivery", "depósitos portuarios están automatizados",
    ]);
}

function historyHasWwtInfo(session?: any): boolean {
    return historyLooksLike(session?.history, [
        "wind & water tight", "wind and water tight", "wwt:", "significa **wind",
        "stands for **wind", "garantía estructural wwt", "6-month wwt structural",
    ]);
}

function isAskingWwtMeaning(input: string): boolean {
    const lo = (input || "").toLowerCase();
    if (!/\bwwt\b/.test(lo)) return false;
    return /\b(qu[eé]\s+(significa|quiere decir|es|quiere\s+decir)|significa|what\s+(does|is)|meaning of|stands for|definici[oó]n)\b/.test(lo)
        || /^\s*(y\s+)?(el\s+|la\s+)?wwt\s*\??\s*$/i.test(lo);
}

function buildPhotoHesitationReply(lang: string, session?: any): string {
    if (lang === "ES") {
        let msg = "Te entiendo perfectamente — es **muy normal** querer ver lo que compras. Justamente por eso nuestro proceso funciona así:\n\n";
        msg += "1. **El día de la entrega**, el chofer te envía fotos del contenedor **exacto** seleccionado para ti.\n";
        msg += "2. **No sale hacia tu propiedad hasta que tú lo apruebes.** Si no te gusta, no va — sin presión.\n";
        if (session?.condition === "Usado") {
            msg += "3. Todos los usados son **WWT** (sellados, sin filtraciones) con **garantía estructural de 6 meses**.\n";
        }
        msg += "\nEl precio que te cotizamos ya incluye contenedor + flete, sin cargos ocultos. Muchos clientes empiezan con la misma duda y quedan tranquilos con ese proceso. ¿Te gustaría avanzar o te quedó otra duda?";
        return msg;
    }
    let msg = "I completely understand — it's **totally normal** to want to see what you're buying. That's exactly why our process works this way:\n\n";
    msg += "1. **On delivery day**, the driver sends you photos of the **exact** container selected for you.\n";
    msg += "2. **We don't head to your property until you approve it.** If you don't like it, it doesn't go — no pressure.\n";
    if (session?.condition === "Usado") {
        msg += "3. All used units are **WWT** (sealed, no leaks) with a **6-month structural guarantee**.\n";
    }
    msg += "\nThe price we quoted already includes container + delivery, no hidden fees. Many customers start with the same concern and feel confident once they see how it works. Would you like to move forward, or is there anything else I can help with?";
    return msg;
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

    const typeSwitch = typeSwitchFromInput(input, session);
    if (typeSwitch && typeSwitch !== session.type) return true;
    const loTrim = (input || "").trim();
    if (/^(prices?|precios?|cotizaci[oó]n)\??$/i.test(loTrim) && hasQuotedPrice(session)) return true;

    // Type and motor first: a size already quoted as Dry is a different product as Reefer
    if (data.type && data.type !== session.type) return true;
    const requestedType = typePriceRequestFromInput(input, session);
    if (requestedType && requestedType !== session.type) return true;
    const reeferStatus = data.reefer_status || extractReeferStatus(input);
    if (reeferStatus && reeferStatus !== session.reefer_status) return true;

    const lo = (input || "").toLowerCase();
    const normSize = (s: any) => (s ? s.toString().replace(" STD", "").replace(" & 40'", "").replace("20' & ", "") : "");
    if (data.size && normSize(data.size) !== normSize(session.size)) {
        if (hasQuotedPrice(session) && sizeAlreadyInQuotedSet(session, data.size, data.condition || session.condition)) return false;
        return true;
    }
    if (data.zip && data.zip !== session.zip) return true;
    if (data.zip_origin && data.zip_origin !== session.zip_origin) return true;
    if (data.zip_dest && data.zip_dest !== session.zip_dest) return true;
    if (data.condition && data.condition !== session.condition && !isConditionComparisonQuestion(input)) {
        if (sessionQuotedConditions(session).includes(data.condition) && isChoosingAlreadyQuotedCondition(input, session)) {
            return false;
        }
        return true;
    }
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
function isAskingOurLocation(input: string): boolean {
    const lo = (input || "").toLowerCase();
    const talkingAboutTheirPlace = /\b(mi patio|tu patio|en (el |mi |su )?patio|my (yard|lot)|mi (terreno|propiedad|casa)|almacen\w*|para guardar|storage)\b/.test(lo);
    const askingToVisitUs = /\b(oficina|visitar(nos|los)?|\bvisit\b|d[oó]nde\s+(est[aá]n?|quedan|ubicad)|where\s+(are\s+you|is\s+your)|located|based|address|\boffice\b|ubicaci[oó]n|direcci[oó]n|nuestro patio|our yard|main office|oficina central)\b/.test(lo);
    if (talkingAboutTheirPlace && !askingToVisitUs) return false;
    return askingToVisitUs;
}

function isSchedulingQuestion(input: string): boolean {
    const lo = (input || "").toLowerCase();
    return /\b(cu[aá]ndo\s+(lo\s+)?recib|tiempo\s+de\s+entrega|delivery\s+time|how\s+long|cu[aá]nto\s+tarda|demora|d[ií]as\s+h[aá]bil)\b/.test(lo)
        || /\b(para\s+qu[eé]\s+d[ií]a|qu[eé]\s+d[ií]a|what day|which day|when (can|would|is|do)\b|agendar|pactar|programar|schedule)\b/.test(lo)
        || /\b(cu[aá]ndo\s+(lo\s+)?(mueven|recogen|pasan|van|ser[ií]a|puedo|salen))\b/.test(lo);
}

function buildSchedulingReply(lang: string, session: any): string {
    const isMove = session?.action === "Transporte";
    if (isMove) {
        return lang === "ES"
            ? "En un **traslado** no fijamos el día hasta tener el servicio en sistema. En cuanto registremos tu **nombre y teléfono**, nuestro equipo de despacho **te llama** para revisar la ruta disponible y **pactar la fecha** de recogida y entrega."
            : "On a **relocation** we don’t lock a calendar date until the job is in our system. As soon as we have your **name and phone**, our dispatch team **will call you** to check the next available route and **agree on pickup and delivery dates**.";
    }
    return lang === "ES"
        ? "La entrega suele ser en **1 a 3 días hábiles** después de confirmar el pedido. El día programado, el chofer te contacta y te envía fotos del contenedor exacto antes de salir hacia tu propiedad."
        : "Delivery is typically **1–3 business days** after you confirm the order. On the scheduled day, our driver contacts you and sends photos of the exact unit before heading to your property.";
}

function buildSideQuestionReply(input: string, lang: string, session: any, beforeQuote = false): string | null {
    const lo = (input || "").toLowerCase();
    if (!beforeQuote && isPhotoHesitationConcern(input, session)) {
        return buildPhotoHesitationReply(lang, session);
    }
    if (isTypeClarificationQuestion(input) && hasQuotedPrice(session)) {
        const quoted = session?.type && session.type !== "Dry" ? session.type : "Dry";
        const labels: Record<string, { es: string; en: string }> = {
            "Dry": { es: "secos (dry)", en: "dry containers" },
            "Reefer": { es: "refrigerados (reefer)", en: "refrigerated (reefer) containers" },
            "Open Side": { es: "Open Side (apertura lateral)", en: "Open Side containers" },
            "Double Door": { es: "Double Door (doble puerta)", en: "Double Door containers" },
        };
        const label = labels[quoted] || labels["Dry"];
        if (lang === "ES") {
            let msg = `Los precios que te pasé son de contenedores **${label.es}**.`;
            if (quoted === "Dry") msg += " Un **refrigerado (reefer)** es un equipo distinto, con motor de frío, y cuesta bastante más.";
            if (!beforeQuote) msg += " Si necesitas otro tipo, dime cuál y te lo cotizo enseguida.";
            return msg;
        }
        let msg = `The prices I sent you are for **${label.en}**.`;
        if (quoted === "Dry") msg += " A **refrigerated (reefer)** unit is different equipment, with a cooling engine, and costs considerably more.";
        if (!beforeQuote) msg += " If you need a different type, tell me which one and I'll quote it right away.";
        return msg;
    }
    if ((session?.action === "Alquilar" || /\b(alquil\w*|rent\w*|lease\w*)\b/.test(lo)) && extractTypeFromText(input) === "Reefer") {
        return lang === "ES"
            ? "La renta es solo de contenedores **secos (dry)** para almacenamiento en Estados Unidos. **No alquilamos refrigerados**. Si te sirve un seco para guardar, dime la medida y te cotizo la renta."
            : "We only rent **dry** containers for storage in the United States. **We don't rent reefers**. If a dry unit works for storage, tell me the size and I'll quote the rental.";
    }
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
    if (isAskingWwtMeaning(input)) {
        if (lang === "ES") {
            return historyHasWwtInfo(session)
                ? "**WWT** son las siglas de **Wind & Water Tight**: hermético al **viento y al agua**. Es el estándar de nuestros usados: **no filtra lluvia** y las puertas sellan. El contenedor que te cotizamos sale con esa certificación y **garantía estructural de 6 meses**."
                : "**WWT** significa **Wind & Water Tight** (hermético al viento y al agua). En la práctica el contenedor **no debe filtrar**, las **puertas cierran bien** y la estructura está sólida. Todos nuestros usados salen certificados WWT, con **garantía estructural de 6 meses**.";
        }
        return historyHasWwtInfo(session)
            ? "**WWT** stands for **Wind & Water Tight** — sealed against **wind and water**. That's the standard of our used units: **no rain leaks**, doors that seal. The container we quoted includes that certification and a **6-month structural guarantee**."
            : "**WWT** means **Wind & Water Tight**. In practice the unit **shouldn't leak**, the **doors seal properly**, and the structure is sound. All our used containers ship WWT-certified, with a **6-month structural guarantee**.";
    }
    if (/\b(filtraci\w*|gotera\w*|leaks?|leaking|water tight|wwt|est[aá]nch\w*|sellad\w*)\b/.test(lo)) {
        const chose = statesProductChoice(input) && !beforeQuote;
        const sizeBit = session?.size ? ` ${session.size}` : "";
        if (historyHasWwtInfo(session)) {
            return lang === "ES"
                ? `Sí: el usado${sizeBit} que te cotizamos es **WWT**, o sea **sin filtraciones**, y lleva **garantía estructural de 6 meses**. El día de la entrega te enviamos fotos del equipo exacto antes de que salga el camión.`
                : `Yes: the used${sizeBit} we quoted is **WWT** — **no leaks** — with a **6-month structural guarantee**. On delivery day we send photos of the exact unit before the truck leaves.`;
        }
        if (lang === "ES") {
            let msg = "Todos nuestros contenedores usados son **Wind & Water Tight (WWT)**: sin filtraciones, puertas que sellan bien y estructura sólida. Además incluyen **garantía estructural WWT de 6 meses**.";
            if (chose) msg += `\n\n¡Perfecto entonces! Cuando quieras avanzar con el usado${sizeBit}, dime tu **nombre completo** y armo la orden.`;
            return msg;
        }
        let msg = "All our used containers are **Wind & Water Tight (WWT)**: no leaks, doors seal properly, and the structure is sound. They also include a **6-month WWT structural guarantee**.";
        if (chose) msg += `\n\nSounds good! Whenever you're ready to move forward with the used${sizeBit}, send me your **full name** and I'll set up the order.`;
        return msg;
    }
    if (isPaymentPolicyQuestion(input)) {
        if (session?.action === "Alquilar") {
            return lang === "ES"
                ? "Para renta, el **pago inicial** (primer mes + logística) se realiza **al momento de la entrega**. Aceptamos **efectivo** o **Zelle**."
                : "For rent, the **initial payment** (first month + logistics) is due **at delivery**. We accept **cash** or **Zelle**.";
        }
        return lang === "ES"
            ? "El pago se realiza **al momento de la entrega**. Aceptamos **efectivo** o **Zelle**. Si prefieres tarjeta o cheque, debe pagarse por completo **antes** de que el camión salga de nuestro patio."
            : "Payment is due **at delivery**. We accept **cash** or **Zelle**. If you prefer card or check, it must be paid in full **before** the truck leaves our yard.";
    }
    if (isSchedulingQuestion(input)) {
        return buildSchedulingReply(lang, session);
    }
    if (/\b(permiso|permisos|zoning|county|municipio|legal|regulaci|code enforcement|ordenanza)\b/.test(lo)) {
        return lang === "ES"
            ? "Los requisitos de permisos **varían por condado y ciudad** — nosotros no somos la autoridad municipal. Muchos clientes colocan contenedores en terreno o patio sin problema, pero te recomendamos **verificar con tu condado o municipio** local. Nosotros nos encargamos de la entrega y la colocación en tu propiedad."
            : "Permit requirements **vary by county and city** — we're not the local authority. Many customers place containers on their lot without issues, but we recommend **checking with your local county or municipality**. We handle delivery and placement on your property.";
    }
    if (isAskingOurLocation(input)) {
        return lang === "ES"
            ? "Estamos en Florida, con centros de distribución en **Miami, Tampa, Titusville, Jacksonville, Savannah y Atlanta**. La **oficina central** está en **9804 NW 80th Ave, Hialeah Gardens FL 33016**. **Llámanos antes** al **786-768-4409** o **786-736-6288** para agendar cita — la oficina puede estar cerrada si llegas sin avisar."
            : "We are based in Florida, with distribution centers in **Miami, Tampa, Titusville, Jacksonville, Savannah, and Atlanta**. Our **central office** is at **9804 NW 80th Ave, Hialeah Gardens FL 33016**. **Please call first** at **786-768-4409** or **786-736-6288** to schedule an appointment — the office may be closed if you show up unannounced.";
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
function isReeferRejectionMessage(input: string): boolean {
    const lo = (input || "").toLowerCase();
    return /\b(don'?t|do not|no)\s+(need|want)\s+(a\s+)?(new\s+)?(reefer|refriger)/i.test(lo)
        || /\b(not|without|no)\s+(a\s+)?(reefer|refriger)/i.test(lo);
}

/** Customer confirms they want a standard dry unit — not when rejecting dry ("not a regular container"). */
function isRegularDryAffirmation(input: string): boolean {
    const lo = (input || "").toLowerCase();
    if (!/\b(regular|standard|normal)\s+(container|contenedor)\b/.test(lo)) return false;
    if (/\bnot\s+(a\s+)?(regular|standard|normal)\s+(container|contenedor)\b/.test(lo)) return false;
    if (/\b(no|without)\s+(regular|standard|normal)\s+(container|contenedor)\b/.test(lo)) return false;
    if (/\b(isn'?t|aren'?t|wasn'?t)\s+(a\s+)?(regular|standard|normal)\s+(container|contenedor)\b/.test(lo)) return false;
    return true;
}

function buildReeferRejectionReply(lang: string, session: any, history?: any): string {
    const hist = history || session?.history;
    const histCond = inferConditionFromConversation("", hist) || resolveExplicitCondition("", hist, {}, session);
    const condKey = (histCond || session?.condition) === "Usado" ? (lang === "ES" ? "usado" : "used") : (lang === "ES" ? "nuevo" : "new");
    const size = session?.size || "40'";
    if (lang === "ES") {
        return `La cotización que te di es de un contenedor **seco (dry) ${condKey}** de ${size}, no un refrigerado. ¿Te gustaría proceder?`;
    }
    return `The quote I gave you is for a **standard dry ${condKey}** ${size} container — not a reefer. Would you like to proceed?`;
}

function conversationMentionsReeferIntent(input: string, history: any): boolean {
    for (const text of conversationUserTexts(input, history)) {
        if (isReeferRejectionMessage(text)) continue;
        if (/\b(reefer|refrigerad\w*|refrigerated|freezer|congelad\w*)\b/i.test(text)) return true;
    }
    return false;
}

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

function isCatalogQuestion(input: string): boolean {
    const lo = (input || "").toLowerCase().trim();
    if (/\b(te hice una pregunta|i asked you|no me respondiste|answer (my|the) question|eso no era lo que pregunt)\b/.test(lo)) {
        return true;
    }
    if (extractZipFromText(input)) return false;
    if (extractSizeFromText(input) && /\b(cu[aá]nto|precio|how much|quiero|necesito|need)\b/.test(lo)) return false;
    if (/\b(cu[aá]nto|how much|precio|cotiz|quote)\b/.test(lo)) return false;
    const asksIfWeHave = /\b(venden|vendes|tienen|tienes|hacen|trabajan|manejan|do you (sell|have|carry)|are there|hay|si venden|si vendes|quer[ií]a saber si)\b/.test(lo);
    const namesProduct = /\b(contenedor\w*|container\w*|usado\w*|used|nuevo\w*|new|reefer|refrigerad|wwt|one[\s-]?trip)\b/.test(lo);
    return asksIfWeHave && namesProduct;
}

function buildCatalogAvailabilityReply(input: string, lang: string): string {
    const lo = (input || "").toLowerCase();
    const used = /\b(usado\w*|used|wwt)\b/.test(lo);
    const neu = /\b(nuevo\w*|new|one[\s-]?trip)\b/.test(lo);
    if (inferServiceAction(input) === "Alquilar" || /\b(alquil\w*|rent\w*|lease\w*)\b/.test(lo)) {
        return lang === "ES"
            ? "Sí, alquilamos contenedores **secos (dry)** para almacenamiento en Estados Unidos. ¿Qué tamaño te interesa, 20', 40' o 45'?"
            : "Yes, we rent **dry** storage containers for use in the United States. What size are you looking at — 20', 40', or 45'?";
    }
    if (lang === "ES") {
        if (used && !neu) {
            return "Sí, vendemos contenedores **usados WWT**: estructurales, sin filtraciones y con puertas que sellan. También hay **nuevos one-trip** si los prefieres. Cuando quieras un precio, dime la medida (20, 40 o 45) o el ZIP de entrega y te cotizo.";
        }
        if (neu && !used) {
            return "Sí, tenemos **nuevos one-trip** (casi sin uso previo) y también **usados WWT**. Cuando quieras cotizar, dime medida o ZIP y te armo el precio.";
        }
        return "Sí, vendemos contenedores **usados WWT** y **nuevos one-trip**, en 20', 40' y 45'. Si quieres un precio, dime qué medida te interesa o tu ZIP de entrega.";
    }
    if (used && !neu) {
        return "Yes — we sell **used WWT** containers: structurally sound, no leaks, doors that seal. We also have **brand-new one-trip** units. When you want a price, tell me the size (20, 40, or 45) or the delivery ZIP and I’ll quote it.";
    }
    if (neu && !used) {
        return "Yes, we have **brand-new one-trip** units, and **used WWT** as well. When you’re ready for a quote, tell me the size or ZIP.";
    }
    return "Yes, we sell **used WWT** and **new one-trip** containers in 20', 40', and 45'. If you want a price, tell me the size or delivery ZIP.";
}

function wantsQuoteNow(input: string, session?: any): boolean {
    if (hasQuotedPrice(session)) return true;
    if (extractZipFromText(input)) return true;
    const lo = (input || "").toLowerCase();
    if (/\b(cu[aá]nto\s*(cuesta|sale|es)|how much|precio|cotiz|quote me|pasame (el )?precio|quiero comprar|i want to buy|vamos a cotizar)\b/.test(lo)) {
        return true;
    }
    if (extractSizeFromText(input) && /\b(quiero|necesito|need|want|comprar|buy|alquilar|rent)\b/.test(lo)) return true;
    return false;
}

function isOpenEducationalQuestion(input: string, session?: any): boolean {
    if (isConversationalSideAsk(input)) return true;
    if (isCatalogQuestion(input) && !wantsQuoteNow(input, session)) return true;
    if (isQuotedPriceClarificationQuestion(input, session)) return true;
    if (isStdHcComparisonQuestion(input, session)) return true;
    if (isConditionComparisonQuestion(input)) return true;
    if (isZipCorrectionMessage(input, session)) return false;
    const lo = (input || "").toLowerCase().trim();
    if (isReadyToProceed(input, session)) return false;
    if (parseContactFromInput(input).phone) return false;
    if (/\b(descuentos?|discounts?|jubilad\w*|senior|militar\w*|military|filtraci\w*|gotera\w*|leaks?|garant\w*|warranty)\b/.test(lo)) return true;
    if (isPaymentPolicyQuestion(input)) return true;
    if (/\b(moj\w*|lluvia|humedad|rain|wet|conviene|qu[eé] me conviene)\b/.test(lo)) return true;
    if (/\b(por favor|please)\b/.test(lo) && /\b(sin|no |without|que no)\b/.test(lo)) return true;
    if (isPhotoHesitationConcern(input, session)) return true;
    if (/\b(diferencia|difference|explica|explain|funciona|works|incluye|include|entrega|delivery|demora|tarda|cu[aá]ndo|when|recomiendas?|recommend|transformador|transformer|voltaje|voltage|440|open side|double door|doble puerta|puertas laterales|permiso|permisos|zoning|municipio|county|d[oó]nde|ubicad\w*|oficina|direcci[oó]n)\b/.test(lo)) return true;
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

function prefersStdOverHc(input: string): boolean {
    const lo = (input || "").toLowerCase();
    return /\b(20[\s']*std|est[aá]ndar|standard)\b/.test(lo) && !/\b(hc|high\s*cube)\b/.test(lo);
}

function isHcUsedInsistRequest(input: string, session?: any): boolean {
    const lo = (input || "").toLowerCase().trim();
    if (!lo || prefersStdOverHc(input)) return false;
    if (["cotizar hc usado", "quote used hc", "cotizar hc", "quote hc"].includes(lo)) return true;
    if (/\b(cotiza(r)?\s+(el\s+)?hc(\s+usado)?|precio\s+igual|igual\s+quiero|insisto|dame\s+el\s+precio|with delivery|con\s+flete|quote it anyway|cotizar\s+igual)\b/.test(lo)) {
        return true;
    }
    const warned = !!session?.hc_used_warn_shown;
    const followUp = (input || "").trim().length < 48 && is20HcSize(session?.size)
        && (session?.condition === "Usado" || warned);
    if (!warned && !followUp) return false;
    if (/^(hc|high\s*cube|20[\s']*hc|20[\s']*high\s*cube)$/i.test(lo)) return true;
    if (followUp && /\b(hc|high\s*cube)\b/.test(lo)) return true;
    if (warned && /\b(hc|high\s*cube)\b/.test(lo)) return true;
    if (warned && /^(s[ií]|yes|ok|okay|vale|claro|dale)([.!]|\s+(por favor|please))?$/i.test(lo)) return true;
    return false;
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

    if (!isNew && !isMiamiAreaZip(zip) && !session.hc_used_force_quote && !isHcUsedInsistRequest(input, session)) {
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
        ["dry", "reefer", "refrigerad", "seco", "tipo", "type"],
        ["funcionando", "working", "motor"],
    ];
    return topics.some((words) =>
        words.some((w) => x.includes(w)) && words.some((w) => y.includes(w))
    );
}

// Joins a free-form answer with a structured prompt, dropping the prompt when it would
// just repeat the question the answer already asked.
function asTextActions(actions: Action[]): Action[] {
    return (actions || [])
        .filter((a) => a && a.text)
        .map((a) => ({ type: "text" as const, text: a.text }));
}

function joinWithoutRepeating(reply: string | null | undefined, prompt: string): string {
    if (reply && String(reply).trim()) return String(reply).trim();
    return prompt;
}

function closedQuestionFollowUp(session: any, dict: any): { text: string; options: string[] } | null {
    const step = Number(session?.step) || 0;
    if (session.action === "Comprar" && session.type === "Reefer" && session.condition === "Usado" && !session.reefer_status) {
        return { text: dict.ask_reefer_status, options: dict.ask_reefer_status_btns };
    }
    if (step === 6 && !session.lead_phone) {
        return { text: dict.ask_proceed_short, options: dict.proceed_btns };
    }
    if (!session.action) {
        return { text: dict.ask_service_short, options: dict.step1_btns };
    }
    if (["Comprar", "Alquilar", "Exportacion", "Exportación"].includes(session.action) && needsConditionBeforeQuote(session) && !session.condition) {
        return { text: dict.ask_condition, options: dict.ask_condition_btns };
    }
    if (!hasExplicitSize(session) && session.size !== "20' & 40'") {
        const skipSizeForDualZip = session.action === "Comprar" && session.zip && needsBuyType(session);
        if (!skipSizeForDualZip) {
            const sizeBtns = buySizeButtons(session, dict);
            const text = session.action === "Alquilar" ? dict.step3_size_msg_rent
                : session.action === "Transporte" ? dict.step3_size_msg_transport
                : dict.step3_size_msg;
            return { text, options: sizeBtns };
        }
    }
    if (needsBuyType(session)) {
        return { text: dict.ask_type, options: dict.ask_type_btns };
    }
    if (session.action === "Transporte" && session.zip_origin && session.zip_dest && !isCompleteLoadStatus(session.load_status)) {
        return { text: dict.ask_transport_load, options: dict.ask_load_btns };
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
        const hydration = hydrateSessionFromConversation({ ...session, history: updatedHistory });
        await updateSession(senderId, { history: updatedHistory, ...hydration });
        return [];
    }

    let step = Number(session.step) || 0;

    if (isBareGreeting(input) && !session.action && !hasQuotedPrice(session)) {
        const greetLang = detectMessageLanguage(input, session.lang, session.history);
        const greet = await callGreetingAI(input, greetLang);
        const text = greet || (greetLang === "ES" ? "¡Hola! ¿En qué te puedo ayudar hoy?" : "Hi! How can I help you today?");
        await updateSession(senderId, { lang: greetLang, history: [{ role: "user", content: input }, { role: "assistant", content: text }] });
        return [{ type: "text", text }];
    }

    if (!session.action || !hasQuotedPrice(session)) {
        const hydration = hydrateSessionFromConversation(session, input);
        if (Object.keys(hydration).length > 0) {
            await updateSession(senderId, hydration);
            Object.assign(session, hydration);
            if (hydration.step != null) step = Number(hydration.step);
        }
    }

    // Modo silencio (agente humano activo con //)
    if (isBotPaused(session)) {
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
    if (lang !== session.lang) {
        session.lang = lang;
        await updateSession(senderId, { lang });
    }
    const langSwitch = detectLanguageSwitchRequest(input);
    if (langSwitch) {
        lang = langSwitch;
        dictCurrent = chatDict[lang];
        await updateSession(senderId, { lang });
        if (langSwitch === "ES") {
            const ack = session.action && hasQuotedPrice(session)
                ? "Claro, seguimos en español. ¿Qué más te gustaría saber?"
                : "Perfecto, seguimos en español.";
            actions.push({ type: "text", text: ack });
            return actions;
        }
    }
    const isLangPick = ["español", "espanol", "es", "english", "en"].includes(input.toLowerCase());

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
        extracted = await callAI(recentHistory, {
            ...session,
            action: session.action || inferServiceAction(input),
        });
        if (!extracted) extracted = { intent: "quote", lang, extracted_data: {} };
    }

    if (extracted.lang) {
        const scores = scoreLanguage(input);
        if (scores.es > scores.en) {
            lang = "ES";
        } else if (scores.en > scores.es) {
            lang = "EN";
        } else if (session.lang === "ES") {
            lang = "ES";
        }
        dictCurrent = chatDict[lang];
    }
    const data = extracted.extracted_data || {};
    mergeDataFromSession(session, data, input, session.history);
    applyZipCorrectionFromInput(input, session, data);
    if (!data.load_status && data.items?.[0]?.load_status) data.load_status = data.items[0].load_status;
    if (!data.action && data.items?.[0]?.action) data.action = data.items[0].action;
    applyConversationInferences(input, session.history, data, session);
    sanitizeInferredCondition(input, session, data);
    sanitizeInferredType(input, session, data);

    if (extracted.intent === "general_chat" && !isOpenEducationalQuestion(input, session) && !isConversationalSideAsk(input) && !isQuotedPriceClarificationQuestion(input, session) && (data.size || data.action === "Comprar") && extractSizeFromText(conversationUserTexts(input, session.history).join("\n"))) {
        extracted.intent = "quote";
        extracted.ai_reply = null;
    }
    
    if (data.items && data.items.length > 0) {
        const hasSize = data.items.some((i: any) => i.size);
        const mergedDeltaWithoutSize = !hasSize && session.items && session.items.length > 0;
        if (mergedDeltaWithoutSize) {
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
        // A type/motor-only tap is merged onto the existing cart. Don't collapse
        // "20' & 40'" down to the first item's size.
        if (first.size && !mergedDeltaWithoutSize) data.size = first.size;
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

    const forcedType = typeSwitchFromInput(input, session);
    if (forcedType) {
        data.type = forcedType;
        if (data.items?.length) {
            for (const item of data.items) item.type = forcedType;
        }
    }
    const reeferRejectionOnDryQuote = hasQuotedPrice(session) && isReeferRejectionMessage(input) && session.type !== "Reefer";

    const stdHcComparison = isStdHcComparisonQuestion(input, session);
    // When we can price the other condition from the database, do that instead of a generic comparison
    const otherConditionPrice = asksOtherConditionPrice(input, session);
    const conditionComparison = isConditionComparisonQuestion(input) && !otherConditionPrice;
    const openEducational = isOpenEducationalQuestion(input, session);
    if (isCatalogQuestion(input) && !wantsQuoteNow(input, session)) {
        extracted.intent = "general_chat";
    }
    const alternateSizeRequested = stdHcComparison ? false : applyAlternateSizeRequest(session, data, input);
    const asksAlternatePrice = !stdHcComparison
        && /\b(cu[aá]nto|precio|price|how much|cuesta|cost|sale)\b/i.test(input)
        && (mentionsStdSize(input) || mentionsHcSize(input) || alternateSizeRequested);
    const quoteOpts = { alternateSizeRequested, asksAlternatePrice, stdHcComparison, conditionComparison };
    let shouldRecalculateQuote = wantsQuoteRecalculation(input, session, data, quoteOpts);
    if (reeferRejectionOnDryQuote) shouldRecalculateQuote = false;
    if (hasQuotedPrice(session) && isConversationalSideAsk(input) && !asksAlternatePrice) {
        shouldRecalculateQuote = false;
        if (extracted.intent === "quote") extracted.intent = "general_chat";
    }

    if (hasQuotedPrice(session) && session.type !== "Reefer" && isRegularDryAffirmation(input)) {
        shouldRecalculateQuote = false;
        extracted.intent = "general_chat";
        extracted.ai_reply = buildReeferRejectionReply(lang, session, session.history);
    }

    if (reeferRejectionOnDryQuote) {
        extracted.intent = "general_chat";
        extracted.ai_reply = buildReeferRejectionReply(lang, session, session.history);
        data.type = "Dry";
    }

    if (isCancellationMessage(input)) extracted.intent = "cancel";

    // Cancel before post-quote chat can override intent to general_chat
    if (extracted.intent === "cancel") {
        const ackOnly = ["ok", "okay", "ok.", "vale", "perfecto"].includes(input.toLowerCase().trim());
        if (!ackOnly) {
            if (!session.action && !session.size && !session.zip) {
                return [];
            }
            if (!session.lead_phone) {
                await updateSession(senderId, {
                    step: 0, action: null, size: null, zip: null, zip_origin: null, zip_dest: null,
                    condition: null, type: null, reefer_status: null, quantity: null, history: null,
                    export_action: null, port_dest: null, items: null, quoted_conditions: null,
                    new_stock_cache: null, hc_stock_pending: null, hc_stock_interest: null,
                    hc_used_force_quote: null, hc_used_warn_shown: null,
                    final_amount: null, final_form_amount: null,
                    is_processing: false, queued_messages: null,
                    pending_debounce_payload: null, pending_debounce_version: 0,
                    transport_pending_origin: null, transport_pending_dest: null,
                });
            }
            let defaultMsg = lang === "EN" ? "Thank you!" : "¡Gracias!";
            if (input.toLowerCase().includes("gracias") || input.toLowerCase().includes("thanks")) {
                defaultMsg = lang === "EN" ? "You're welcome!" : "¡De nada!";
            }
            actions.push({ type: "text", text: defaultMsg });
            return actions;
        }
        extracted.intent = "general_chat";
    }

    const typeCorrection = typeSwitchFromInput(input, session);
    if (typeCorrection && typeCorrection !== session.type) {
        data.type = typeCorrection;
        session.type = typeCorrection;
        session.reefer_status = null;
        data.reefer_status = null;
        applyTypeToItems(session, typeCorrection);
        applyTypeToItems(data, typeCorrection);
        if (typeCorrection === "Dry" && mentionsUsedCondition(conversationUserTexts(input, session.history).join("\n"))) {
            data.condition = "Usado";
            session.condition = "Usado";
        }
        extracted.intent = "quote";
        extracted.ai_reply = null;
    }

    if (isHcUsedInsistRequest(input, session) || ["cotizar hc usado", "quote used hc", "cotizar hc", "quote hc"].includes(input.toLowerCase().trim())) {
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
        const contactEarly = parseContactFromInput(input);
        const looksLikeContact = !!(aiExtractedName(data) || contactEarly.phone || data.customer_phone);
        if (!session.hc_stock_pending && !looksLikeContact && (extracted.intent === "general_chat" || extracted.intent === "quote" || extracted.intent === "photos" || extracted.intent === "dimensions" || extracted.intent === "cancel")) {
            step = 6;
            await updateSession(senderId, { step: 6 });
        } else {
            if (step === 7) {
                const parsed = parseContactFromInput(input);
                const nameCandidate = aiExtractedName(data);
                const phoneNow = data.customer_phone || parsed.phone;
                if (nameCandidate && phoneNow) {
                    session.lead_name = nameCandidate;
                    data.customer_phone = phoneNow;
                    await updateSession(senderId, { lead_name: nameCandidate, step: 8 });
                    step = 8;
                    // fall through to phone completion below
                } else if (nameCandidate) {
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
                const phoneRaw = data.customer_phone || parseContactFromInput(input).phone || input;
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
        if (isReadyToProceed(input, session) && !isOpenEducationalQuestion(input, session)) {
            extracted.intent = "proceed";
            extracted.ai_reply = null;
        } else if (shouldRecalculateQuote && !isConversationalSideAsk(input)) {
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
                const switched = typeSwitchFromInput(input, session);
                const mentionedType = !isTypeClarificationQuestion(input)
                    && ["dry", "reefer", "open side", "double door", "refrigerado", "estandar", "regular", "standard", "normal"].some((kw) => lowerInput.includes(kw));
                if (switched) {
                    data.type = switched;
                    if (data.items?.length) data.items[0].type = switched;
                } else if (!mentionedType) {
                    data.type = session.type;
                    if (data.items?.length) data.items[0].type = session.type;
                }
            }
            const requestedType = typeSwitchFromInput(input, session) || typePriceRequestFromInput(input, session);
            if (requestedType && requestedType !== session.type) {
                data.type = requestedType;
                session.type = requestedType;
                session.reefer_status = null;
                data.reefer_status = null;
                if (requestedType === "Dry") {
                    data.condition = data.condition || session.condition || "Usado";
                    session.condition = data.condition;
                }
                applyTypeToItems(session, requestedType);
                applyTypeToItems(data, requestedType);
                if (!data.items?.length && session.items?.length) data.items = session.items;
            }
        } else if (isPhotoHesitationConcern(input, session)) {
            extracted.intent = "general_chat";
            extracted.ai_reply = buildPhotoHesitationReply(lang, session);
        } else if (isPhotosRequest(input)) {
            extracted.intent = "photos";
            extracted.ai_reply = null;
        } else if (isDimensionsRequest(input)) {
            extracted.intent = "dimensions";
            extracted.ai_reply = null;
        } else if (!extracted.ai_reply && isTypeClarificationQuestion(input) && buildSideQuestionReply(input, lang, session)) {
            extracted.intent = "general_chat";
            extracted.ai_reply = buildSideQuestionReply(input, lang, session);
        } else if (!extracted.ai_reply && buildSideQuestionReply(input, lang, session)) {
            extracted.intent = "general_chat";
            extracted.ai_reply = buildSideQuestionReply(input, lang, session);
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
    
    if (!data.action && inferServiceAction(input) === "Transporte") {
        data.action = "Transporte";
    }
    if (data.action) {
        const actionStr = data.action.toString().toLowerCase();
        if (isExportFlow) {
            if (actionStr.includes("comprar") || actionStr.includes("buy") || actionStr.includes("alquilar") || actionStr.includes("rent")) {
                updates.export_action = "Comprar";
            }
        } else {
            const resolved = resolveExtractedAction(input, session.action, data.action);
            if (resolved) {
                updates.action = resolved;
                data.action = resolved;
            }
        }
    }
    if (isCatalogQuestion(input) && !wantsQuoteNow(input, session)) {
        delete updates.condition;
        data.condition = session.condition;
        if (inferServiceAction(input) === "Alquilar") {
            updates.action = "Alquilar";
            data.action = "Alquilar";
        } else {
            delete updates.action;
            data.action = session.action;
        }
    }
    if (updates.action === "Transporte" && session.action !== "Transporte") {
        // Customer-owned unit: condition / buy ZIP do not apply to a move
        updates.condition = null;
        data.condition = null;
        session.condition = null;
        data.zip = null;
        if (session.items) {
            updates.items = session.items.map((item: any) => {
                const next = { ...item, action: "Transporte" };
                delete next.condition;
                return next;
            });
            session.items = updates.items;
        }
    }
    
    if (session.action === "Transporte" || data.action === "Transporte" || updates.action === "Transporte") {
        data.action = "Transporte";
        data.zip = null;
    }
    
    applyExplicitConditionToUpdates(input, session, data, updates);
    const regularDryAffirmation = hasQuotedPrice(session) && session.type !== "Reefer" && isRegularDryAffirmation(input);
    if (reeferRejectionOnDryQuote || regularDryAffirmation) {
        data.type = "Dry";
        const histCond = resolveExplicitCondition(input, session.history, data, session);
        if (histCond) data.condition = histCond;
        updates.type = "Dry";
        applyTypeToItems(session, "Dry");
        if (session.items) updates.items = session.items;
    } else if (data.type) {
        updates.type = data.type;
        if (data.type !== session.type) {
            updates.reefer_status = null;
            session.reefer_status = null;
        }
        applyTypeToItems(session, data.type);
        if (session.items) updates.items = session.items;
    }
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

    const transportPairInInput = extractTransportZipsFromText(input);
    const transportNow = (data.action || session.action || updates.action) === "Transporte";
    if (transportNow && transportPairInInput) {
        data.zip_origin = transportPairInInput.zip_origin;
        data.zip_dest = transportPairInInput.zip_dest;
        data.zip = null;
    } else if (transportNow && data.zip && !data.zip_origin && !data.zip_dest) {
        if (!session.zip_origin) data.zip_origin = data.zip;
        else if (!session.zip_dest) data.zip_dest = data.zip;
        data.zip = null;
    }
    if (transportNow) data.zip = null;

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
    if (transportNow && (data.zip_origin || data.zip_dest)) {
        const explicitZipsInMessage = extractTransportZipsFromText(input);
        if (!explicitZipsInMessage && !isTransportZipConfirmation(input)) {
            if (data.zip_origin && data.zip_dest) {
                updates.transport_pending_origin = data.zip_origin;
                updates.transport_pending_dest = data.zip_dest;
            }
            data.zip_origin = null;
            data.zip_dest = null;
        }
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

    if (data.zip && transportNow) {
        data.zip = null;
    } else if (data.zip) {
        updates.zip = data.zip;
    }

    // Inferir acción si tenemos datos pero no acción
    if (!session.action && !data.action) {
        const inferred = inferServiceAction(input);
        if (data.zip_origin || data.zip_dest) updates.action = "Transporte";
        else if (inferred) updates.action = inferred;
        else if (transportNow) updates.action = "Transporte";
        else if (data.size || data.zip) updates.action = "Comprar";
    }

    // Guardar historial actualizado (máx 10 entradas)
    const updatedHistory = [...recentHistory];
    if (extracted.ai_reply) updatedHistory.push({ role: "assistant", content: extracted.ai_reply });
    updates.history = updatedHistory.slice(-10);

    await updateSession(senderId, updates);
    Object.assign(session, updates);

    const contactNow = parseContactFromInput(input);
    const capturedName = aiExtractedName(data) || session.lead_name;
    const capturedPhone = data.customer_phone || contactNow.phone;
    const waitingForLead = session.final_amount != null && !session.lead_phone
        && [6, 7, 8].includes(Number(session.step));
    if (waitingForLead && (capturedPhone || aiExtractedName(data))) {
        if (capturedName && capturedName !== session.lead_name) {
            session.lead_name = capturedName;
            await updateSession(senderId, { lead_name: capturedName });
        }
        if (capturedPhone && session.lead_name) {
            const priceMetaLead = parseQuotePriceMeta(session);
            const optionNoteLead = priceMetaLead.option ? ` Transport option: ${priceMetaLead.option}.` : "";
            await updateSession(senderId, { lead_phone: capturedPhone, lead_name: session.lead_name, step: 6 });
            await supabase.from("call_logs").insert([{
                customer: session.lead_name, phone: capturedPhone,
                service_type: session.action || "Sales", city: "---",
                description: session.action === "Exportacion" || session.action === "Exportación"
                    ? `Order via AI Bot (EXPORT SALE). Zip: ${session.zip}. Port: ${session.port_dest}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.${optionNoteLead}`
                    : `Order via AI Bot. Zip: ${session.zip}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.${optionNoteLead}`,
                created_by: "AI BOT", source: "chatbot",
                status: "PENDING", date: new Date().toISOString().split("T")[0],
                next_call_date: new Date().toISOString().split("T")[0],
                amount: session.final_amount, zip_code: session.zip, measures: session.size,
                language: mapCallLanguage(lang || session.lang)
            }]);
            actions.push({ type: "text", text: dictCurrent.order_done });
            return actions;
        }
        if (capturedName && !capturedPhone) {
            await updateSession(senderId, { lead_name: capturedName, step: 8 });
            actions.push({ type: "text", text: dictCurrent.ask_phone.replace("{name}", capturedName) });
            return actions;
        }
    }

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
            const followUp = isPhotoHesitationConcern(input, session)
                ? buildPhotoHesitationReply(lang, session)
                : ((!aiLooksCanned && extracted.ai_reply) || (isPhotos
                    ? (lang === "ES"
                        ? "Entiendo que quieras verlo antes, es normal. Como te comenté, no podemos mandarte ahora la unidad exacta porque en el puerto se mueven todo el tiempo. El día de la entrega el chofer te manda las fotos y no sale hacia tu propiedad hasta que las apruebes. ¿Seguimos con la orden o te quedó otra duda?"
                        : "I get that you want to see it first — totally fair. Like I mentioned, we can't send the exact unit right now because the port stacks move constantly. On delivery day the driver sends you photos and waits for your OK before heading to your property. Want to proceed with the order, or is there anything else I can help with?")
                    : (lang === "ES"
                        ? "Las medidas están en el enlace que te pasé hace un momento (largo, ancho, alto y capacidad). Si me dices qué tamaño te interesa, te confirmo lo que aplica a tu cotización."
                        : "The measurements are in the link I sent a moment ago (length, width, height, and capacity). If you tell me which size you want, I can confirm what applies to your quote.")));
            await appendHistory(senderId, session, followUp, isPhotos ? "photos" : "dimensions");
            if (Number(session.step) === 6 && hasQuotedPrice(session) && !session.lead_phone) {
                actions.push({ type: "quick_replies", text: followUp, options: dictCurrent.proceed_btns });
                return actions;
            }
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
            await updateSession(senderId, {
                step: 0, action: null, size: null, zip: null, zip_origin: null, zip_dest: null,
                condition: null, type: null, reefer_status: null, quantity: null, history: null,
                export_action: null, port_dest: null, items: null, quoted_conditions: null,
                new_stock_cache: null, hc_stock_pending: null, hc_stock_interest: null,
                hc_used_force_quote: null, hc_used_warn_shown: null,
                final_amount: null, final_form_amount: null,
                is_processing: false, queued_messages: null,
                pending_debounce_payload: null, pending_debounce_version: 0,
                transport_pending_origin: null, transport_pending_dest: null,
            });
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
    if ((extracted.intent === "proceed" || (step === 6 && isReadyToProceed(input, session)))
        && !isOpenEducationalQuestion(input, session)) {
        if (step !== 6 && !hasQuotedPrice(session)) {
            extracted.intent = "quote";
        } else {
            const transportOpt = parseTransportOption(input) || data.transport_option || null;
            const priceMeta = parseQuotePriceMeta(session);
            let amount = session.final_amount;
            const chosenCond = extractConditionFromText(input);
            if (chosenCond && sessionQuotedConditions(session).includes(chosenCond)) {
                session.condition = chosenCond;
                const restored = quotedAmountForCondition(session, chosenCond);
                if (restored != null) amount = restored;
            }
            if (transportOpt === "Inmediato" && priceMeta.immediate != null) amount = priceMeta.immediate;
            if (transportOpt === "Flexible" && priceMeta.flexible != null) amount = priceMeta.flexible;
            const optionNote = transportOpt ? ` Transport option: ${transportOpt}.` : "";
            const exportNote = session.action === "Exportacion" || session.action === "Exportación"
                ? `Order via AI Bot (EXPORT SALE). Zip: ${session.zip}. Port: ${session.port_dest}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.${optionNote}`
                : `Order via AI Bot. Zip: ${session.zip}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.${optionNote}`;

            await updateSession(senderId, {
                final_amount: amount,
                condition: session.condition,
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
        const postQuoteTypeSwitch = typeSwitchFromInput(input, session);
        if (step === 6 && hasQuotedPrice(session) && postQuoteTypeSwitch && postQuoteTypeSwitch !== session.type) {
            extracted.intent = "quote";
        }
    }
    if (extracted.intent === "general_chat") {
        if (!session.action || (inferServiceAction(input) === "Transporte" && servicesNamedInMessage(input).has("Transporte") && session.action !== "Transporte")) {
            const inferred = inferServiceAction(input);
            if (inferred) {
                session.action = inferred;
                const switchUpdates: any = { action: inferred };
                if (inferred === "Transporte") {
                    session.condition = null;
                    switchUpdates.condition = null;
                }
                await updateSession(senderId, switchUpdates);
            }
        }
        const alreadyPhotos = historyHasPhotoPolicy(session);
        const alreadyDims = historyLooksLike(session.history, ["#container-dimensions", "[policy_sent:dimensions]"]);
        const askingPhotosAgain = /\b(foto|photo|pics|imagen|verlo|see it|see the|gallery|galer)/i.test(input);
        const askingDimsAgain = /\b(medida|dimension|largo|ancho|alto|length|width|height)\b/i.test(input);
        const photoConcern = isPhotoHesitationConcern(input, session);
        const keepChat = (alreadyPhotos && (askingPhotosAgain || photoConcern)) || (alreadyDims && askingDimsAgain);

        if (step < 6 && session.action && !keepChat && !openEducational) {
            extracted.intent = "quote";
        } else {
            // Only greet someone who hasn't started yet — never welcome a customer mid-quote
            const noReplyFallback = isCatalogQuestion(input)
                ? buildCatalogAvailabilityReply(input, lang)
                : (session.action
                    ? (buildPostQuoteFallbackReply(input, lang, session)
                        || (lang === "ES" ? "Con gusto te ayudo. ¿Qué te gustaría saber?" : "Happy to help — what would you like to know?"))
                    : buildWarmWelcomeReply(lang, input));
            let aiMsg = buildSideQuestionReply(input, lang, session) || extracted.ai_reply || noReplyFallback;
            if (isCatalogQuestion(input) && (!extracted.ai_reply || /qu[eé] m[aá]s te gustar[ií]a saber|what else would you like/i.test(extracted.ai_reply))) {
                aiMsg = buildCatalogAvailabilityReply(input, lang);
            }
            const repeatingPhotos = alreadyPhotos && (/^Entiendo que quieras verlo|^I get that you want to see it|^Te entiendo perfectamente|^I completely understand/.test(aiMsg)
                || /#gallery|depósitos portuarios|port depots are automated/i.test(aiMsg));
            const repeatingDims = alreadyDims && /#container-dimensions/i.test(aiMsg);
            if (photoConcern && (alreadyPhotos || step === 6)) {
                aiMsg = buildPhotoHesitationReply(lang, session);
            } else if (repeatingPhotos) {
                aiMsg = lang === "ES"
                    ? "Entiendo que quieras verlo antes, es normal. Como te comenté, el día de la entrega el chofer te manda las fotos de la unidad exacta y no sale hacia tu propiedad hasta que las apruebes. ¿Seguimos con la orden o te quedó otra duda?"
                    : "I get that you want to see it first — totally fair. Like I mentioned, on delivery day the driver sends photos of the exact unit and waits for your OK before heading to your property. Want to proceed, or is there anything else I can help with?";
            } else if (repeatingDims) {
                aiMsg = lang === "ES"
                    ? "Las medidas están en el enlace que te pasé hace un momento. Si me dices el tamaño, te confirmo lo que aplica a tu cotización."
                    : "The measurements are in the link I sent a moment ago. Tell me the size and I’ll confirm what applies to your quote.";
            }
            const followCards = closedQuestionFollowUp(session, dictCurrent);
            if (followCards && step < 6 && session.action && !isCatalogQuestion(input) && !openEducational) {
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
                    if ((isReadyToProceed(input, session) && !isOpenEducationalQuestion(input, session))
                        || aiReplyAsksForKnownField(extracted.ai_reply || "", session, input)) {
                        await updateSession(senderId, { step: 7 });
                        actions.push({ type: "text", text: aiMsg.includes("nombre") || aiMsg.includes("name") ? aiMsg : dictCurrent.ask_name });
                        return actions;
                    }
                }
                await appendHistory(senderId, session, aiMsg, "post_quote_chat");
                if (photoConcern) {
                    actions.push({ type: "quick_replies", text: aiMsg, options: dictCurrent.proceed_btns });
                } else {
                    actions.push({ type: "text", text: aiMsg });
                }
            } else if (step === 6 && !session.lead_phone && isReadyToProceed(input, session) && !isOpenEducationalQuestion(input, session)) {
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
    if (!session.action || (inferServiceAction(input) === "Transporte" && servicesNamedInMessage(input).has("Transporte") && session.action !== "Transporte")) {
        const inferred = inferServiceAction(input);
        if (inferred) {
            session.action = inferred;
            const switchUpdates: any = { action: inferred };
            if (inferred === "Transporte") {
                session.condition = null;
                switchUpdates.condition = null;
            }
            await updateSession(senderId, switchUpdates);
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
            const pendingOrigin = session.transport_pending_origin;
            const pendingDest = session.transport_pending_dest;
            if (pendingOrigin && pendingDest) {
                const loLoadPending = input.toLowerCase();
                if (/\b(vac[ií]o|empty)\b/.test(loLoadPending) && !/\b(cargado|loaded|lleno|full)\b/.test(loLoadPending)) {
                    session.load_status = "Vacio";
                    updates.load_status = "Vacio";
                    await updateSession(senderId, { load_status: "Vacio" });
                }
                if (isTransportZipConfirmation(input)) {
                    session.zip_origin = pendingOrigin;
                    session.zip_dest = pendingDest;
                    updates.zip_origin = pendingOrigin;
                    updates.zip_dest = pendingDest;
                    updates.transport_pending_origin = null;
                    updates.transport_pending_dest = null;
                    await updateSession(senderId, {
                        zip_origin: pendingOrigin,
                        zip_dest: pendingDest,
                        transport_pending_origin: null,
                        transport_pending_dest: null,
                    });
                } else if (isTransportZipRejection(input)) {
                    await updateSession(senderId, { transport_pending_origin: null, transport_pending_dest: null });
                    actions.push({ type: "text", text: appendAiReply(buildTransportZipsAsk(lang, input, session.history)) });
                    return actions;
                } else {
                    const corrected = extractTransportZipsFromText(input);
                    if (corrected) {
                        session.zip_origin = corrected.zip_origin;
                        session.zip_dest = corrected.zip_dest;
                        updates.zip_origin = corrected.zip_origin;
                        updates.zip_dest = corrected.zip_dest;
                        updates.transport_pending_origin = null;
                        updates.transport_pending_dest = null;
                        await updateSession(senderId, {
                            zip_origin: corrected.zip_origin,
                            zip_dest: corrected.zip_dest,
                            transport_pending_origin: null,
                            transport_pending_dest: null,
                        });
                    } else {
                        const confirmText = dictCurrent.transport_zips_confirm
                            .replace("{origin}", pendingOrigin)
                            .replace("{dest}", pendingDest);
                        actions.push({
                            type: "quick_replies",
                            text: appendAiReply(confirmText),
                            options: dictCurrent.transport_zips_confirm_btns,
                        });
                        return actions;
                    }
                }
            } else {
                const geocoded = await tryGeocodeTransportRoute(input, session.history);
                if (geocoded) {
                    session.transport_pending_origin = geocoded.zip_origin;
                    session.transport_pending_dest = geocoded.zip_dest;
                    await updateSession(senderId, {
                        transport_pending_origin: geocoded.zip_origin,
                        transport_pending_dest: geocoded.zip_dest,
                    });
                    const confirmText = dictCurrent.transport_zips_confirm
                        .replace("{origin}", geocoded.zip_origin)
                        .replace("{dest}", geocoded.zip_dest);
                    actions.push({
                        type: "quick_replies",
                        text: appendAiReply(confirmText),
                        options: dictCurrent.transport_zips_confirm_btns,
                    });
                    return actions;
                }
                actions.push({ type: "text", text: appendAiReply(buildTransportZipsAsk(lang, input, session.history)) });
                return actions;
            }
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
        if (!session.size) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg), options: buySizeButtons(session, dictCurrent) }); return actions; }
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
        applyBuyTypeDefaults(session, updates, input, session.history);
        ensureDryDefaultType(session, updates, input, session.history);
        if (needsConditionBeforeQuote(session) && !hasKnownCondition(session, input, session.history, data)) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_condition), options: dictCurrent.ask_condition_btns });
            return actions;
        }
        if (!hasExplicitSize(session) && session.size !== "20' & 40'") {
            const inferredSize = extractSizeFromText(input) || data.size;
            if (inferredSize) {
                const condition = session.condition || resolveConditionFromContext(input, session.history, { condition: session.condition }) || undefined;
                session.size = inferredSize;
                session.items = [{ size: inferredSize, action: "Comprar", ...(session.type ? { type: session.type } : {}), ...(condition ? { condition } : {}) }];
                updates.size = inferredSize;
                updates.items = session.items;
                applyBuyTypeDefaults(session, updates, input, session.history);
            } else if (!session.zip && !inferZipFromConversation(input, session.history)) {
                const dualDryReady = session.type === "Dry" && wantsQuoteNow(input, session);
                if (!dualDryReady) {
                    actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg), options: buySizeButtons(session, dictCurrent) });
                    return actions;
                }
            }
        }
        applyBuyTypeDefaults(session, updates, input, session.history);
        if (needsBuyType(session, input, session.history)) {
            const inferredNow = extractTypeFromText(input) || data.type;
            if (inferredNow) {
                session.type = inferredNow;
                updates.type = inferredNow;
                applyTypeToItems(session, inferredNow);
                if (session.items) updates.items = session.items;
            } else {
                await updateSession(senderId, updates);
                actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_type), options: dictCurrent.ask_type_btns });
                return actions;
            }
        }
        if (session.action === "Comprar") {
            if (session.type === "Reefer" && session.condition === "Usado" && !session.reefer_status) {
                await updateSession(senderId, updates);
                actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_reefer_status), options: dictCurrent.ask_reefer_status_btns }); return actions;
            }
        }
        if (is20HcSize(session.size) && !hasKnownCondition(session, input, session.history, data)) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_condition), options: dictCurrent.ask_condition_btns });
            return actions;
        }
        if (!session.zip) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_zip) }); return actions; }
        if (!session.size) {
            ensureQuoteItems(session, updates, session.history, input, "Comprar");
        }
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
    if (step === 6 && hasQuotedPrice(session) && extracted.intent === "quote" && !shouldRecalculateQuote) {
        let aiMsg = extracted.ai_reply || buildQuotedPriceClarificationReply(input, lang, session) || buildPostQuoteFallbackReply(input, lang, session)
            || (lang === "ES" ? "Claro, ¿qué más te gustaría saber?" : "Sure — what else would you like to know?");
        await appendHistory(senderId, session, aiMsg, "post_quote_chat");
        actions.push({ type: "text", text: aiMsg });
        return actions;
    }

    // ── CALCULAR PRECIO ──
    if (/^(prices?|precios?)\??$/i.test(input.trim()) && hasQuotedPrice(session)) {
        data.type = session.type || "Dry";
        const histCond = inferConditionFromConversation(input, session.history);
        if (histCond) {
            data.condition = histCond;
            session.condition = histCond;
        } else {
            data.condition = session.condition;
        }
        if (session.quantity) data.quantity = session.quantity;
    }
    if (session.action === "Comprar" && !conversationMentionsReeferIntent(input, session.history)) {
        session.type = "Dry";
        data.type = "Dry";
        if (session.items?.length) {
            for (const item of session.items) item.type = "Dry";
        }
    }
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
            const itemType = session.type || item.type || "Dry";
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
            if (itemType) item.type = itemType;
            if (i === 0) {
                session.condition = item.condition;
                session.type = itemType;
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
                        session.hc_used_warn_shown = true;
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
                if (!isNew && (session.hc_used_force_quote || isHcUsedInsistRequest(input, session))) {
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
    const greet = await callGreetingAI(lang === "ES" ? "hola" : "hello", lang);
    const text = greet || (lang === "ES" ? "¡Hola! ¿En qué te puedo ayudar hoy?" : "Hi! How can I help you today?");
    return [{ type: "text", text }];
}

function isBotPaused(session: any): boolean {
    return Number(session?.step) === -1;
}

async function processMessage(senderId: string, messageText: string, isHuman: boolean = false, messageId?: string, extraMidsFromClient: string[] = []): Promise<Action[]> {
    const restartCmd = messageText.toLowerCase().trim();
    if (["reiniciar", "restart", "menu"].includes(restartCmd)) {
        const existing = await getSession(senderId);
        const restartLang: "EN" | "ES" = existing?.lang === "ES" ? "ES" : "EN";
        return await resetChatSession(senderId, restartLang);
    }

    let session = await getSession(senderId);

    // Modo silencio (agente humano tomó el control con //)
    if (!isHuman && isBotPaused(session)) {
        return [];
    }

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
            queue.push(JSON.stringify({ text: messageText, mid: messageId, type: "queue", ts: Date.now() }));
            for (const id of extraMidsFromClient) {
                if (id && id !== messageId) queue.push(JSON.stringify({ type: "seen", mid: id }));
            }
            await updateSession(senderId, { queued_messages: queue });
            return [];
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
            if (item.ts && Date.now() - item.ts > QUEUE_MAX_AGE_MS) return false;
            if (item.mid && (seenMids.includes(item.mid) || historyHasMid(currentSession, item.mid))) return false;
            if (item.text && item.text.trim() === messageText.trim()) return false;
            return true;
        });

        if (freshFollowUps.length > 0) {
            const currentForFollowUp = await getSession(senderId);
            if (!isBotPaused(currentForFollowUp)) {
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
        }
        await updateSession(senderId, { is_processing: false, queued_messages: [] });
    }
    if (actions.length === 0) {
        const idleSession = await getSession(senderId);
        if (isBotPaused(idleSession)) return [];
        const idleDict = chatDict[idleSession?.lang === "ES" ? "ES" : "EN"];
        actions.push({
            type: "text",
            text: idleSession?.lang === "ES"
                ? "No pude responder eso. ¿Puedes repetirlo o escribe **reiniciar** para empezar de nuevo?"
                : "I couldn't respond to that. Please try again or type **restart** to begin again.",
        });
        if (needsConditionBeforeQuote(idleSession) && is20HcSize(idleSession?.size)) {
            actions.push({ type: "text", text: idleDict.ask_condition });
        }
    }
    return asTextActions(actions);
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
