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
        step3_size_msg_transport: "¿Qué medida tiene el contenedor que vamos a mover?",
        step3_size_btns: ["20'", "40'", "45'"],
        calculating: "Calculando precio exacto... ⏳",
        ask_zip: "¿Cuál es tu código postal (Zip Code) de 5 dígitos para la entrega?",
        no_stock: "Lo siento, pero parece que en este momento no tenemos disponibilidad de esa medida o tipo de contenedor en tu área. ¿Te gustaría que cotice un tamaño diferente?",
        no_20hc: "Por ahora no cotizamos contenedores de 20' High Cube (ni usados ni nuevos). Los de 20' que sí tenemos son Standard (8'6\" de alto). ¿Te cotizo un 20' STD?",
        calc_error: "Error calculando. Escribe 'reiniciar'.",
        ask_export_type: "¿Para qué usarás el contenedor? (Almacenamiento o Exportación)",
        ask_export_btns: ["Almacenamiento", "Exportación"],
        ask_export_buy_rent: "¿Deseas comprar el contenedor o prefieres que te lo alquilemos para el envío marítimo?",
        ask_export_buy_rent_btns: ["Comprar", "Alquilar"],
        ask_export_zip: "¿En qué Zip Code (código postal) de EE. UU. necesitas que te dejemos el contenedor para que lo cargues?",
        ask_export_port: "¿A qué puerto y país de destino enviaremos el contenedor? (Ej. Mariel, Cuba)",
        export_buy_price: "El precio de venta del contenedor es **{price}** (incluye certificado de exportación válido por 1 año recogido en nuestro patio). Nosotros no hacemos envíos marítimos, pero ofrecemos el transporte terrestre nacional: te lo llevamos vacío para cargar y luego lo llevamos cargado al puerto en EE.UU. Si haces ambos traslados con nosotros, te descontamos ${discount}. ¿Te cotizamos este transporte (indícanos el Zip Code del puerto) o prefieres proceder solo con la compra?",
        export_rent_msg: "",
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
        price_sale: "El precio total por {qty}contenedor{qty_plural_es} {type} {cond} de {size} entregado{qty_plural_s} en {zip} es **{price}**.\n\n¿Te gustaría proceder?",
        faq_prompt: "\n\n*(Por favor responde la pregunta anterior o toca un botón para continuar con tu cotización)*",
        fallback: "Para darte un precio exacto, dime qué medida de contenedor necesitas (ej. 20 o 40 pies) y tu Zip Code de entrega.",
    },
    "EN": {
        step1_msg: "I am your logistics advisor from RP Tulipan. How can I help you today?",
        step1_btns: ["Buy", "Rent", "Transport"],
        step3_size_msg: "Perfect. Now, please let me know what size you need.",
        step3_size_msg_transport: "What size is the container we would be moving?",
        step3_size_btns: ["20'", "40'", "45'"],
        calculating: "Calculating exact price... ⏳",
        ask_zip: "What is your 5-digit delivery Zip Code?",
        no_stock: "I'm sorry, but it looks like we currently don't have stock for that specific container size or type in your area. Would you like me to quote a different size?",
        no_20hc: "We don't currently quote 20' High Cube containers (used or new). The 20' units we do have are Standard height (8'6\" tall). Would you like a quote for a 20' STD?",
        calc_error: "Calculation error. Type 'restart'.",
        ask_export_type: "What will you use the container for? (Storage or Export)",
        ask_export_btns: ["Storage", "Export"],
        ask_export_buy_rent: "Do you want to buy the container or prefer to rent it from us for the ocean freight?",
        ask_export_buy_rent_btns: ["Buy", "Rent"],
        ask_export_zip: "What is the US Zip Code where you need us to drop off the container for loading?",
        ask_export_port: "What is the destination port and country for the container? (e.g., Kingston, Jamaica)",
        export_buy_price: "The sale price of the container is **{price}** (includes export certificate valid for 1 year, picked up at our yard). We do not offer maritime shipping, but we provide inland transport: we deliver it empty for loading and then take it loaded to the US port. If you do both transports with us, we give you a ${discount} discount. Shall we quote this transport (provide the Port Zip Code) or do you prefer to proceed with just the purchase?",
        export_rent_msg: "",
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
        price_sale: "The total price for {qty}{cond} {type} {size} container{qty_plural_s} delivered to {zip} is **{price}**.\n\nWould you like to proceed?",
        faq_prompt: "\n\n*(Please answer the previous question or tap a button to continue with your quote)*",
        fallback: "To give you an exact price right away, please tell me what container size you need (e.g. 20 or 40 ft) and your delivery Zip Code.",
    }
};

// ─── PROMPT MAESTRO: AGENTE DE VENTAS EXPERTO ────────────────────────────────
const MASTER_PROMPT = `You are "Tulip", an expert sales assistant for RP Tulipan — a shipping container company based in Florida, USA. You sell, rent, and transport used and new ISO shipping containers (20ft, 40ft, 45ft), including Dry, Reefer (refrigerated), Open Side, and Double Door types.

Your personality: Professional, friendly, and direct. You speak in the same language the customer uses (English or Spanish).

COMPANY KNOWLEDGE (use this to answer questions naturally — never make things up):
- NEW CONTAINERS: We DO have brand new (One-Trip) containers available in 20ft STD, 40ft, and 45ft (including standard Dry). NEVER say we don't have new 20' STD / 40' / 45' containers. Do NOT claim we have brand-new 20' High Cube.
- PAYMENT: For payment on delivery (COD), we ONLY accept Cash or Zelle. If the customer wishes to pay with a Credit Card or Check, it MUST be paid in full BEFORE delivery. NO financing.
- DELIVERY TIME: 1-3 business days after order confirmation.
- PHOTOS: The FIRST time the user asks for photos, pictures, images, or to see the container before buying, set intent to "photos" and leave ai_reply null (the system sends the full policy + gallery). CRITICAL FOLLOW-UP: If history already includes that photo/gallery explanation (gallery link, "on the day of your delivery", "el día programado para su entrega", or tag photos), do NOT set intent to "photos" again and do NOT repeat the long message or the gallery link. Set intent to "general_chat" and write a short, warm, human ai_reply (2-4 sentences): acknowledge you already explained this, reassure that the driver sends photos of the exact unit on delivery day and waits for approval before driving to their property, and ask if they want to proceed or have another question. Sound like a person, not a script. Never invent that you can email or WhatsApp photos of the exact unit now. Only share the gallery link again if they explicitly ask for the link/gallery.
- CONDITION (Used): All used containers are Wind & Water Tight (WWT). Structurally sound, no leaks, doors seal properly. DO NOT proactively mention the guarantee here.
- FLOORS: Used containers have hardwood or bamboo floors in good structural condition.
- PRICE IN ADS: Ads show the container price at the port only. Delivery cost varies by zip code distance, so we cannot advertise one price. Our quote is FINAL: container + flatbed delivery, no hidden fees. CRITICAL: NEVER invent, calculate, or provide a price yourself in ai_reply. The system will calculate the exact price using a database if you set intent to "quote". If the user asks for a price or asks "how much is X", ALWAYS set intent to "quote". However, if the user asks a conversational question (e.g., "is this to own?", "does it include delivery?", "how long does it take?"), set intent to "general_chat" and answer it naturally in ai_reply.
- DISCOUNTS: Prices are already the lowest wholesale port prices with zero hidden margins. No additional discounts available.
- MILITARY/SENIOR/FIRST RESPONDER: We do not offer special discounts. Our prices are already the best in the market.
- LOCATIONS/HUBS: Distribution centers in Miami, Tampa, Titusville, Jacksonville, Savannah, and Atlanta. Our main office is at 8500 NW 87 Ave, Miami, FL 33166. CRITICAL: WHENEVER you give the office address, you MUST also tell the customer that if they wish to visit, they MUST call us first to schedule an appointment so they don't find the office closed.
- SIZES: 20ft STANDARD (8'6" / STD), 40ft standard, 45ft high cube. We do NOT carry 10ft (must be custom-cut from a 20ft, costs MORE). A regular 20' is NOT a High Cube. NEVER tell the customer that a 20' is HC, and NEVER say we currently have 20' HC in stock. If they explicitly ask for a 20' HC, extract size "20' HC" and set intent to "quote"; leave ai_reply null so the system can check whether a 20' HC price exists. CRITICAL: If the customer asks for a 40' container without specifying High Cube (HC) or Standard (STD), extract "40'". ONLY extract "40' HC" if they explicitly type "HC" or "High Cube".
- 10FT: We don't stock them. Recommend the 20ft instead — it's cheaper and ready to go.
- REEFERS: Available Working (Functional) or Not Working (No AC), and also brand New.
- GUARANTEES: NEVER mention or offer a guarantee/warranty unless the customer explicitly asks about it. If they ask, explain that we ONLY offer a 6-month Wind and Water Tight structural guarantee on all used containers, and NO OTHER guarantees are provided.
- CONTACT INFO: Phone numbers: 786-768-4409 | 786-736-6288. Email: rptulipantransport@gmail.com. IMPORTANT: You ARE authorized to give these phone numbers and email to the customer when they ask to speak to a human, ask for a phone number, or want to call us. Do not refuse to give the phone number.
- INTERNATIONAL/EXPORT SHIPPING: We can provide containers for international export! When a customer wants to ship a container to another country (e.g. Puerto Rico, Cuba, Bahamas, etc.), you MUST set the action to "Exportacion" and the intent to "quote". We ONLY sell the certified container and offer inland transport to the US port, we DO NOT offer maritime shipping. CRITICAL: When they first ask for export, do NOT ask for the port zip code. The system will automatically ask for the US zip code where they want to load the container and will quote the container first. ONLY IF the customer has ALREADY received the container quote AND explicitly asks to add or quote the inland transport to the port, you should ask for the US Port Zip Code and store it in the port_dest variable.
- TRANSPORT (moving a container the customer ALREADY OWNS): Set action to "Transporte". This is NOT a purchase or rental. Do NOT ask New vs Used, Dry vs Reefer, or "what size they need to buy". Ask what size the container they already have IS (20, 40, or 45). Then we need the 5-digit origin zip, destination zip, and load status: Empty, Loaded under 14,000 lbs, or Loaded over 14,000 lbs. A city name (e.g. Tampa) is NOT a zip code. If they only say "loaded/cargado/lleno/full" without the weight, set load_status to "Cargado_Over14000" (we quote the full loaded / crane rate). CRITICAL: When intent is "quote" for transport and you are only collecting missing fields, leave ai_reply null so the system asks with the correct wording. Only write ai_reply if they also asked a side question (payment, timing, crane, etc.).

SLANG/JARGON (interpret these correctly):
- "need closer", "can you do better", "bottom line", "best price", "lowest", "closer deal", "military discount", "senior discount", "any discounts" → customer wants a price reduction → explain our pricing policy warmly.
- "water tight", "wwt", "wind water tight", "no leaks", "good condition", "guarantee", "guaranteed" → quality/guarantee question → answer with our WWT and 6-month guarantee info.
- "cash on delivery", "payment", "how do I pay", "accept credit", "do you finance", "payment options" → payment question.
- "how long", "when will it arrive", "delivery time", "when", "how fast" → timing question.
- "photos", "pictures", "can I see it first", "pics", "quiero verlo", "verlo antes", "ver el contenedor" → FIRST time: intent "photos". If photos were already explained in this chat: intent "general_chat" with a short human reply (do not repeat the script).
- "where are you located", "where do you ship from", "do you deliver to" → location question.
- "good floors", "floor condition", "floor quality" → floor question.
- "pick up", "retirar", "lo retiro yo", "buscar", "recoger" → Customer wants to pick up the container themselves. SET intent to "general_chat" and output exactly this in ai_reply: (EN) "If you prefer to pick up the container yourself at our yard, please call us at 786-768-4409." (ES) "Si prefiere retirarlo usted mismo en nuestro patio, por favor llámenos al 786-768-4409." Do NOT change the action.
- "phone number", "contact", "telefono", "numero", "speak to a human" → If the customer asks for OUR phone number or wants to call us, provide the company phone numbers enthusiastically. CRITICAL: If the customer instead says "call me", "llámame", or gives instructions on when to call them, DO NOT give our phone numbers; just acknowledge their request politely and tell them an agent will contact them.

OUTPUT: You MUST output a valid JSON object with NO markdown, NO code blocks, NO extra text:
{
  "intent": "quote" | "general_chat" | "cancel" | "proceed" | "photos" | "dimensions" | "provide_info",
  "lang": "EN" | "ES", // CRITICAL: This MUST match the exact language the customer used in their VERY LAST message. If they spoke Spanish, output "ES".
  "extracted_data": {
    "items": [
      {
        "action": "Comprar" | "Alquilar" | "Transporte" | "Exportacion" | null,
        "export_action": "Comprar" | "Alquilar" | null,
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

INTENT RULES:
- "quote": Customer is giving NEW data (size, zip, condition) to advance a quote, explicitly requesting a new price calculation, asking for a delivery fee/cost/price, OR asking if we offer a service they already named (e.g. "necesito mover un contenedor, ¿hacen este servicio?"). CRITICAL: If they said they need to MOVE/haul a container, action MUST be "Transporte" and intent MUST be "quote" — do NOT use general_chat and do NOT ask if they want to buy or rent. If they provide a Zip Code and a size asking for a price/fee, the intent MUST ALWAYS be "quote". NEVER use "general_chat" to give a price. CRITICAL: When setting intent to "quote", DO NOT write filler text in ai_reply like "I will get you a quote shortly" or "Here is your price". Leave ai_reply as null, UNLESS you need to answer a specific yes/no question they asked at the same time (e.g. "do you offer this?" → a short "Yes" is ok, but still set action Transporte and intent quote). EXCEPTION: If the yes/no is about 20' High Cube availability or whether a 20' is HC, NEVER answer "yes". For "is the 20' HC?" use general_chat and say it is STD. For "I want / do you have 20' HC" extract size "20' HC", intent "quote", ai_reply null.
- "general_chat": Customer is asking a general question (quality, payment, guarantees) WITHOUT requesting a new price. If they ask for a price (e.g. "how much is the 20"), use "quote". NEVER give or invent a price in general_chat.
- "cancel": Customer says bye, thanks, no thanks, stop, not interested, too expensive, ok (alone with no other info), OR indicates they are waiting/shopping around (e.g. "waiting for quotes", "I'll think about it", "shopping around"). CRITICAL: For ai_reply, ALWAYS MATCH THE CUSTOMER'S EXACT LANGUAGE. If they spoke English, you MUST reply in English. If Spanish, in Spanish. If they thank you or say "no thanks" (e.g., gracias, thanks, no gracias), reply with "¡De nada!" or "You're welcome!". If they just cancel, say bye, or say ok, reply with "¡Gracias!" or "Thank you!".
- "proceed": Customer explicitly CONFIRMS they want to place the order AFTER receiving a final price quote (e.g., yes, si, proceed, let's do it, I'll take it). Do NOT use this if they are just starting a request. CRITICAL: If the customer agrees but AT THE SAME TIME changes the quantity (e.g. "I'll just take one for now"), you MUST use "quote" instead of "proceed" to recalculate the new price.
- "provide_info": Customer is providing their name or phone number as requested by the bot.
- "photos": FIRST request for photos, pictures, images, gallery, or seeing the unit before buying. If that policy was already sent in this conversation, use "general_chat" instead and write a short human ai_reply.
- "dimensions": FIRST request for exact dimensions, measurements, length, width, or physical size. CRITICAL: Do NOT use this if they ask for delivery time (e.g. "how long"). If dimensions were already sent in this conversation, use "general_chat" instead.

CONVERSATION RULES:
- ALWAYS answer the customer's questions in the "ai_reply" field, EVEN if the intent is "quote" or "proceed". Do not stay silent if they asked a question (even if they forgot the question mark).
- If they ask if a 20' container is HC or STD (e.g. "es HC?", "is it high cube?"), answer that our 20' containers are STD (8'6" tall), NOT High Cube (9'6"). Do NOT extract size "20' HC" for that question. Do NOT say we sell 20' HC as new.
- If they ask if a 40' used container is HC or STD, or say something like "este de 40 es HC", explain that for 40' USED containers we have BOTH STD and HC available for the EXACT SAME PRECIO, and extract the size as "40' HC".
- CRITICAL: 45' containers are ONLY Dry and ONLY HC. Do not ask the customer if they want Reefer, Open Side, etc. for a 45' container.
- CRITICAL: Open Side and Double Door containers are ONLY available in BRAND NEW condition, and ONLY in sizes 20ft and 40ft. Do not offer 45ft for them.
- CRITICAL: If the customer asks technical questions about refrigerated (reefer) containers like the year or data sheet, the FIRST time you MUST reply exactly with this message in ai_reply depending on the language:
  English: "Great question! Since technical details (year, data sheet, etc.) vary depending on the exact unit we have in the yard, I suggest speaking with our sales team to get precise information. You can call us right now at +1 (786) 768-4409 or +1 (786) 736-6288 and a specialist will help you immediately."
  Spanish: "¡Excelente pregunta! Como los detalles técnicos (año, ficha técnica, etc.) varían dependiendo de la unidad exacta que tenemos en el patio, te sugiero hablar con nuestro equipo de ventas para darte la información precisa. Puedes llamarnos ahora mismo al +1 (786) 768-4409 o al +1 (786) 736-6288 y un especialista te ayudará de inmediato."
  If you already sent that full message in this conversation, do NOT paste it again. Reply briefly in your own words, keep the same phone numbers, and ask if they want you to have a specialist call them.
- VOLTAGE/CURRENT FOR REEFERS: If the customer asks about the voltage or current for refrigerated containers (e.g., "qué corriente usa", "what voltage"), ALWAYS answer that they use 440V 3-phase (440V trifásica).
- TRANSFORMERS: If the customer mentions they do not have 440V, or asks about transformers, explain that we sell transformers that convert 220V to 440V. If they ask for prices of the transformers, quote them: Used $2500, New $3000. Set intent to "general_chat" for these answers unless they are also asking for container prices.
- UNLOADING TO THE GROUND / CRANE DELIVERY: If the customer asks if we can put the container on the ground/floor, or if they ask "can you unload this yourself?", ALWAYS answer YES. The FIRST time you MUST reply exactly with this message in ai_reply depending on the language (use \n for line breaks):
  English: "Yes, we can leave the container directly on the ground. We deliver and lower the container using our specialized crane equipment on our trailers. I invite you to see how our crane works here:\n\nWith our side crane: https://www.youtube.com/shorts/wdqOKA2CFwE\nWith our trailers: https://www.youtube.com/shorts/1Q8G_lf3QXs"
  Spanish: "¡Sí! Entregamos y bajamos el contenedor directamente al piso utilizando nuestro equipo de grúa especializado. Te invito a ver cómo funciona en estos videos:\n\nCon nuestra grúa lateral: https://www.youtube.com/shorts/wdqOKA2CFwE\nCon nuestros trailers: https://www.youtube.com/shorts/1Q8G_lf3QXs"
  If you already sent those video links in this conversation, do NOT paste the full message or the links again unless they ask for the videos. Reply briefly: yes, we unload it to the ground with our crane, and ask if they want to proceed.
- TRANSPORT WORDING: Never ask a transport customer what size they "need" as if they were buying. They already have the container. The system will ask what size it is. Do not ask Dry/Reefer/New/Used for a simple move.

EXTRACTION RULES:
- "20", "20'", "20ft", "twenty", "20 pies" (without HC/High Cube) → size "20' STD".
- "20 HC", "20 High Cube", "20' HC", "20ft HC" → size "20' HC". Leave condition as they stated (or null). Do NOT say yes we have it. Leave ai_reply null and set intent "quote" so the system checks prices. A regular 20' without HC is "20' STD", never "20' HC".
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
- "move"/"transport"/"mover"/"transporte"/"haul"/"relocate"/"de mi casa"/"to my lot"/"hasta un terreno" → action "Transporte". Do NOT also extract type or condition unless they explicitly name them.
- "working"/"funcionando"/"with ac"/"with motor" → reefer_status "Funcionando". "not working"/"no funciona"/"no ac"/"sin motor"/"broken" → reefer_status "No Funcionando".
- "empty"/"vacio"/"vacío" → load_status "Vacio".
- "loaded under 14"/"cargado <14k"/"menos de 14000"/"under 14000"/"<14k" → load_status "Cargado_Under14000".
- "loaded over 14"/"cargado >14k"/"más de 14000"/"mas de 14000"/"over 14000"/">14k" → load_status "Cargado_Over14000".
- "loaded"/"cargado"/"lleno"/"full" WITHOUT a weight → load_status "Cargado_Over14000" (quote the full loaded rate, over 14,000 lbs).
- Extract 5-digit zip codes exactly. CRITICAL: NEVER extract a 3 or 4-digit number (e.g., 1400) as a zip code. If a customer sends a number like "1400" next to a size, DO NOT assume what it means. Treat this as general_chat and ASK the customer what they mean by that number (e.g. "What do you mean by 1400?"). Once they explain it's a price, then explain our pricing policy. If two zips: first is zip_origin, second is zip_dest. If the customer provides a zip code for the port or says "puerto [zip]", assign it to 'port_dest' inside the item. If one zip is provided without explicit origin/destination/port context, assign it to 'zip', DO NOT guess zip_origin or zip_dest.
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
    if (["20 hc", "20' hc", "20ft hc", "20 high cube", "20' high cube"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ size: "20' HC" }] } };
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
    if (["cargado <14k", "loaded <14k"].includes(lo) || /<\s*14/.test(lo) || lo.includes("under 14") || lo.includes("menos de 14")) return { intent: "quote", extracted_data: { items: [{ load_status: "Cargado_Under14000" }] } };
    if (["cargado >14k", "loaded >14k"].includes(lo) || />\s*14/.test(lo) || lo.includes("over 14") || lo.includes("más de 14") || lo.includes("mas de 14")) return { intent: "quote", extracted_data: { items: [{ load_status: "Cargado_Over14000" }] } };
    if (["cargado", "loaded", "lleno", "full"].includes(lo)) return { intent: "quote", extracted_data: { items: [{ load_status: "Cargado_Over14000" }] } };
    if (["flexible", "en ruta", "inmediato", "immediate"].includes(lo)) return { intent: "proceed", extracted_data: {} };
    if (["sí, proceder", "yes, proceed", "yes", "sí", "si"].includes(lo)) return { intent: "proceed", extracted_data: {} };

    const twoZips = lo.match(/\b(\d{5})\s+(\d{5})\b/);
    if (twoZips) return { intent: "quote", extracted_data: { zip_origin: twoZips[1], zip_dest: twoZips[2] } };
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

function inferServiceAction(text: string): string | null {
    const t = (text || "").toLowerCase();
    if (!t.trim()) return null;
    const mentionsBuy = /\b(comprar|buy|purchase|alquilar|rentar?|lease|renta)\b/i.test(t);
    const wantsMove = /\b(mover|transporte|transportar|transport|haul|relocate|mudar|traslad)/i.test(t);
    if (wantsMove && !mentionsBuy) return "Transporte";
    if (/\b(alquilar|rentar?|lease|renta)\b/i.test(t) && !/\b(comprar|buy|purchase)\b/i.test(t) && !wantsMove) return "Alquilar";
    if (/\b(comprar|buy|purchase)\b/i.test(t) && !wantsMove) return "Comprar";
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
    const recentHistory: Array<{role: string, content: string, mid?: string, mids?: string[]}> = Array.isArray(rawHistory) ? rawHistory.slice(-8) : [];
    const allMids = [messageId, ...extraMids].filter((m): m is string => !!m);
    recentHistory.push({ role: "user", content: input, mid: messageId, mids: allMids.length ? allMids : undefined });

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
        if (first.condition) data.condition = first.condition;
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
                            description: session.action === "Exportacion" || session.action === "Exportación" ? `Order via AI Bot (EXPORT). Zip: ${session.zip}. Port: ${session.port_dest}. Buy/Rent: ${session.export_action}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.` : `Order via AI Bot. Zip: ${session.zip}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}. Qty: ${session.quantity || 1}.`,
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
        // Sanitize possible AI hallucinations on follow-up questions
        const lowerInput = input.toLowerCase();
        if (data.condition && data.condition !== session.condition) {
            const mentionedNew = lowerInput.includes("nuevo") || lowerInput.includes("new");
            const mentionedUsed = lowerInput.includes("usad") || lowerInput.includes("used");
            if (!mentionedNew && !mentionedUsed) {
                data.condition = session.condition; // Revert hallucinated condition
                if (data.items && data.items.length > 0) data.items[0].condition = session.condition;
            }
        }
        if (data.type && data.type !== session.type) {
            const mentionedType = ["dry", "reefer", "open side", "double door", "refrigerado", "estandar"].some(kw => lowerInput.includes(kw));
            if (!mentionedType) {
                data.type = session.type; // Revert hallucinated type
                if (data.items && data.items.length > 0) data.items[0].type = session.type;
            }
        }

        const qData = data.quantity || 1;
        const qSess = session.quantity || 1;
        const normSize = (s: any) => s ? s.toString().replace(" STD", "") : "";
        const changedPricingVar = 
            (data.size && normSize(data.size) !== normSize(session.size)) ||
            (data.zip && data.zip !== session.zip) ||
            (data.zip_origin && data.zip_origin !== session.zip_origin) ||
            (data.zip_dest && data.zip_dest !== session.zip_dest) ||
            (data.condition && data.condition !== session.condition) ||
            (data.type && data.type !== session.type) ||
            (data.quantity && qData !== qSess) ||
            (data.port_dest && data.port_dest !== session.port_dest);
        
        if (!changedPricingVar) {
            const isExportSession = session.action === "Exportación" || session.action === "Exportacion";
            if (extracted.ai_reply || (isExportSession && !session.port_dest)) {
                extracted.intent = "general_chat";
                if (isExportSession && !session.port_dest && !extracted.ai_reply) {
                    extracted.ai_reply = lang === "EN" 
                        ? "Perfect! To quote the inland transportation, please tell me the Zip Code of the port." 
                        : "¡Perfecto! Para poder cotizarte el transporte terrestre, por favor indícame cuál es el Zip Code (código postal) del puerto.";
                }
            }
        }
    }

    // ── OVERRIDE (Removed size override to let AI handle HC vs STD) ──
    const lo = input.toLowerCase();
    
    const isExportFlow = session.action === "Exportación" || session.action === "Exportacion";
    if (isExportFlow) {
        if (lo.includes("comprar") || lo.includes("buy")) data.export_action = "Comprar";
        else if (lo.includes("alquilar") || lo.includes("rent") || lo.includes("alquilo")) data.export_action = "Alquilar";

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
    const updates: any = { lang };
    if (session.items) updates.items = session.items;
    if (data.size) updates.size = data.size;
    
    if (data.action) {
        const actionStr = data.action.toString().toLowerCase();
        if (isExportFlow) {
            if (actionStr.includes("comprar") || actionStr.includes("buy") || actionStr.includes("alquilar") || actionStr.includes("rent")) {
                updates.export_action = (actionStr.includes("comprar") || actionStr.includes("buy")) ? "Comprar" : "Alquilar";
            }
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
    if (data.load_status) {
        const normalized = normalizeLoadStatus(data.load_status);
        if (normalized) updates.load_status = normalized;
    }
    if (data.quantity && data.quantity > 0) updates.quantity = data.quantity;
    
    if (data.export_action) {
        const eaStr = data.export_action.toString().toLowerCase();
        updates.export_action = (eaStr.includes("comprar") || eaStr.includes("buy")) ? "Comprar" : "Alquilar";
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
        
        let pendingOptions: string[] | null = null;
        if (step === 6) pendingOptions = null;
        else if (!session.action) pendingOptions = dictCurrent.step1_btns;
        else if (!session.size) pendingOptions = (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dictCurrent.step3_size_btns;
        else if (session.action === "Transporte" && !isCompleteLoadStatus(session.load_status)) pendingOptions = dictCurrent.ask_load_btns;

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

        if (step < 6 && session.action && !keepChat) {
            extracted.intent = "quote";
        } else {
            let aiMsg = extracted.ai_reply || (lang === "EN" ? "I'm sorry, could you clarify?" : "Lo siento, ¿podrías aclarar?");
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
            let pendingOptions: string[] | null = null;
            if (step === 6 && !session.lead_phone) pendingOptions = null;
            else if (!session.action) pendingOptions = dictCurrent.step1_btns;

            if (pendingOptions) {
                actions.push({ type: "quick_replies", text: aiMsg, options: pendingOptions });
            } else {
                actions.push({ type: "text", text: aiMsg });
            }
            return actions;
        }
    }

    // Prepend the AI's side answer only if it is not asking the same thing as the structured prompt
    const appendAiReply = (msg: string) => {
        const ai = extracted.ai_reply;
        if (!ai) return msg;
        const a = ai.toLowerCase();
        const c = msg.toLowerCase();
        const keys = ["medida", "size", "tamaño", "tamano", "zip", "código postal", "codigo postal", "vacío", "vacio", "cargado", "empty", "loaded"];
        const overlap = keys.filter((k) => a.includes(k) && c.includes(k));
        if (overlap.length > 0) return msg;
        return `${ai}\n\n${msg}`;
    };

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
            const saidEmpty = /\b(vac[ií]o|empty)\b/.test(loLoad);
            if (saidLoaded && !saidUnder && !saidEmpty) {
                session.load_status = "Cargado_Over14000";
                await updateSession(senderId, { load_status: "Cargado_Over14000" });
            }
        }
        if (!isCompleteLoadStatus(session.load_status)) {
            actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.ask_transport_load), options: dictCurrent.ask_load_btns });
            return actions;
        }
    } else if (session.action === "Exportación" || session.action === "Exportacion") {
        if (!session.size) { actions.push({ type: "quick_replies", text: appendAiReply(dictCurrent.step3_size_msg), options: (["Reefer", "Open Side", "Double Door"].includes(session.type)) ? ["20'", "40'"] : dictCurrent.step3_size_btns }); return actions; }
        if (!session.zip) { actions.push({ type: "text", text: appendAiReply(dictCurrent.ask_export_zip) }); return actions; }
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
        let missing20hc = false;
        
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
            if (!item.type) item.type = itemType;
            if (i === 0) {
                session.condition = item.condition;
                session.type = item.type;
            }
            
            if (itemSize && itemSize.includes("45") && item.condition !== "Usado") item.condition = "Usado";
            if (i === 0) session.condition = item.condition;
            
            const isExport = itemAction === "Exportación" || itemAction === "Exportacion";
            let isNew = item.condition === "Nuevo";
            const quantity = itemQty;

            let sizeKey = "";
            if (itemSize === "20' STD" || itemSize === "20'") {
                if (itemType === "Reefer") sizeKey = isNew ? "20new" : (item.reefer_status === "No Funcionando" ? "20nofunc" : "20func");
                else if (itemType === "Open Side") sizeKey = "20side";
                else if (itemType === "Double Door") sizeKey = "20dd";
                else sizeKey = "20std";
            } else if (itemSize === "20' HC") {
                if (itemType === "Reefer") sizeKey = isNew ? "20new" : (item.reefer_status === "No Funcionando" ? "20nofunc" : "20func");
                else if (itemType === "Open Side") sizeKey = "20side";
                else if (itemType === "Double Door") sizeKey = "20dd";
                else sizeKey = "20hc";
            } else if (itemSize === "40' STD") {
                if (itemType === "Reefer") sizeKey = isNew ? "40new" : (item.reefer_status === "No Funcionando" ? "40nofunc" : "40func");
                else if (itemType === "Open Side") sizeKey = "40side";
                else if (itemType === "Double Door") sizeKey = "40dd";
                else sizeKey = "40std";
            } else if (itemSize === "40' HC" || itemSize === "40'") {
                if (itemType === "Reefer") sizeKey = isNew ? "40new" : (item.reefer_status === "No Funcionando" ? "40nofunc" : "40func");
                else if (itemType === "Open Side") sizeKey = "40side";
                else if (itemType === "Double Door") sizeKey = "40dd";
                else sizeKey = "40hc";
            } else if (itemSize === "45' HC" || itemSize === "45'" || itemSize === "45" || (itemSize && itemSize.includes("45"))) {
                sizeKey = "45hc";
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

            let { data: qData, error } = await supabase.functions.invoke("calculate-quote", { body: quoteBody(isNew) });

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

            let itemPrice = qData.total_price || 0;
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

            const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
            let msg = "";
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
                const yardName = qData.closest_yard || (lang === "EN" ? "our yard" : "nuestro patio");
                const craneNote = loadStatus === "Cargado_Over14000"
                    ? (lang === "EN" ? "\nThe crane is dispatched only from our Miami hub." : "\nLa grúa sale únicamente desde nuestro hub de Miami.")
                    : "";
                msg = dictCurrent.price_transport
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
                const condLabel = lang === "EN" ? ((singleItem.condition || session.condition || "Usado") === "Nuevo" ? "New" : "Used") : (singleItem.condition || session.condition || "Usado");
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
        await updateSession(senderId, { 
            step: 6, 
            final_amount: finalTotalPrice, 
            history: historyAfterQuote.slice(-10),
            items: session.items,
            condition: session.condition,
            type: session.type
        });

        if (session.action === "Transporte") {
            actions.push({ type: "quick_replies", text: msg, options: dictCurrent.transport_option_btns });
        } else {
            actions.push({ type: "text", text: msg });
        }
        return actions;
    } catch (e) {
        console.error("Quote error:", e);
        actions.push({ type: "text", text: dictCurrent.calc_error });
        return actions;
    }
}

async function processMessage(senderId: string, messageText: string, isHuman: boolean = false, messageId?: string, extraMidsFromClient: string[] = []): Promise<Action[]> {
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
        if (messageText.toLowerCase().trim() === "reiniciar" || messageText.toLowerCase().trim() === "restart") {
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
