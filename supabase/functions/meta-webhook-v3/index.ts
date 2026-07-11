import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { sendMessage, sendQuickReplies } from "./meta-api.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN') || 'tulipan-webhook-token-v3';

const chatDict: Record<string, any> = {
    'ES': {
        step1_msg: "¡Hola! Soy tu asesor logístico de RP Tulipan. ¿En qué te puedo ayudar hoy?",
        step1_btns: ['Comprar', 'Alquilar', 'Transporte'],
        step1_5_msg: "¿Es para Almacenamiento o para Exportación?",
        step1_5_btns: ['Almacenamiento', 'Exportación'],
        step2_cond_msg: "¡Excelente! ¿Buscas un contenedor Nuevo (One Trip) o Usado (Cargo Worthy)?",
        step2_cond_btns: ['Nuevo', 'Usado'],
        step2_size_msg: "Claro, para cotizar el movimiento necesito saber de qué tamaño es el contenedor a mover.",
        step3_size_msg: "Perfecto. Ahora indícame qué medida necesitas.",
        step3_size_btns: ["20'", "40'", "45'"],
        step3_5_type_msg: "¿Qué tipo de contenedor necesitas?",
        step3_7_reefer_msg: "¿Lo necesitas con motor funcional o sin motor (solo térmico)?",
        step3_7_reefer_btns: ['Funcional', 'No Funcional'],
        step3_load_msg: "Para cotizar correctamente el movimiento, necesito saber si el contenedor está vacío o cargado.",
        step3_load_btns: ['Vacío', 'Cargado'],
        step4_trans_msg: "Casi listos. Por favor, escribe los DOS códigos postales: primero el de ORIGEN y luego el de DESTINO, separados por un espacio. Ejemplo: 33178 33906",
        step4_other_msg: "¡Excelente! Para darte el precio exacto con entrega, por favor escribe el Zip Code (Código Postal) de donde quieres recibirlo.",
        err_trans: "Por favor ingresa exactamente DOS códigos postales de 5 números, separados por un espacio. Ejemplo: 33178 33906",
        err_other: "El código postal debe tener exactamente 5 números. Por favor, inténtalo de nuevo.",
        faq_photo: "📸 Sobre las fotos: Al trabajar directamente desde los puertos, el inventario se mueve rápido. Para tu total tranquilidad, el día de la entrega nuestro chofer te enviará fotos y videos de tu contenedor específico antes de salir hacia tu destino.",
        faq_payment: "💳 Sobre los pagos: No ofrecemos financiamiento, pero ofrecemos la mayor seguridad: puedes pagar cómodamente **contra entrega**. Aceptamos efectivo, Zelle, cheque o tarjeta al momento de recibir tu contenedor.",
        faq_location: "📍 Nuestra ubicación: Tenemos centros de distribución estratégicos en Miami, Tampa, Titusville, Jacksonville, Savannah y Atlanta. Es por ello que siempre pedimos tu código postal (Zip Code) primero, para enviarlo desde el puerto más cercano y conseguirte el mejor precio de envío.",
        faq_time: "🚚 Tiempo de entrega: ¡Somos muy rápidos! Una vez que confirmamos tu orden, el tiempo estimado para recibir tu contenedor es de **1 a 3 días hábiles**.",
        faq_condition: "🛡️ Sobre la calidad: Todos nuestros contenedores están garantizados en perfecto estado estructural. Son 100% estancos al viento y al agua (Wind and Water Tight), sin goteras y con puertas que sellan correctamente.",
        faq_prompt: "\n\n*(Por favor responde a la pregunta anterior o presiona un botón para continuar con tu cotización)*"
    },
    'EN': {
        step1_msg: "I'm your logistics advisor. How can I help you today?",
        step1_btns: ['Buy', 'Rent', 'Transport'],
        step1_5_msg: "Is it for Storage or Export?",
        step1_5_btns: ['Storage', 'Export'],
        step2_cond_msg: "Excellent! Are you looking for a New (One Trip) or Used (Cargo Worthy) container?",
        step2_cond_btns: ['New', 'Used'],
        step2_size_msg: "Sure, to provide an accurate quote, what size is the container you need to move?",
        step3_size_msg: "Perfect. Now, please let me know what size you need.",
        step3_size_btns: ["20'", "40'", "45'"],
        step3_5_type_msg: "What type of container do you need?",
        step3_7_reefer_msg: "Do you need it with a working motor or non-working (insulated only)?",
        step3_7_reefer_btns: ['Working', 'Non-Working'],
        step3_load_msg: "To calculate the exact rate, is the container empty or loaded?",
        step3_load_btns: ['Empty', 'Loaded'],
        step4_trans_msg: "Almost done. Please type BOTH Zip Codes: first the ORIGIN and then the DESTINATION, separated by a space. Example: 33178 33906",
        step4_other_msg: "Great! To give you the exact final price with delivery, please enter your 5-digit Delivery Zip Code.",
        err_trans: "Please enter exactly TWO 5-digit zip codes, separated by a space. Example: 33178 33906",
        err_other: "The Zip Code must be exactly 5 digits. Please try again.",
        faq_photo: "📸 About photos: Our port inventory moves very fast. For your peace of mind, on the day of delivery, the driver will send you photos and videos of your specific container before heading to your location.",
        faq_payment: "💳 About payments: We do not offer financing, but we offer the highest security: you can pay **upon delivery** (Cash on Delivery). We accept cash, Zelle, check, or credit card right when you receive your container.",
        faq_location: "📍 Our locations: We have strategic distribution centers in Miami, Tampa, Titusville, Jacksonville, Savannah, and Atlanta. That is why we always ask for your Zip Code first, so we can dispatch from the closest port and get you the best shipping rate.",
        faq_time: "🚚 Delivery time: We are very fast! Once your order is confirmed, the estimated delivery time for your container is between **1 to 3 business days**.",
        faq_condition: "🛡️ About quality: All our containers are guaranteed in perfect structural condition. They are 100% Wind and Water Tight (WWT), with no leaks and properly sealing doors.",
        faq_prompt: "\n\n*(Please answer the previous question or tap a button to continue with your quote)*"
    }
};

async function getSession(senderId: string) {
    const { data, error } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('sender_id', senderId)
        .single();
        
    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching session:', error);
    }
    
    if (data) return data;
    
    // Create new session if doesn't exist
    const newSession = { sender_id: senderId, step: 0 };
    await supabase.from('bot_sessions').insert([newSession]);
    return newSession;
}

async function updateSession(senderId: string, updates: any) {
    await supabase.from('bot_sessions').update(updates).eq('sender_id', senderId);
}

// Function to clean up input, checking for both button payloads or typed text
function normalizeInput(input: string) {
    // Meta sometimes prepends "@Meta AI" to messages or quick replies. Strip it.
    return input.replace(/^@meta ai\s*/i, '').trim();
}

async function handleMessage(senderId: string, messageText: string) {
    const input = normalizeInput(messageText);
    const session = await getSession(senderId);
    let step = Number(session.step) || 0;
    
    // Pause check (Human Takeover)
    if (step === -1) {
        if (input.toLowerCase() === 'reiniciar' || input.toLowerCase() === 'restart' || input.toLowerCase() === 'menu') {
            // let it continue to the restart block below to wake up
        } else {
            return; // Stay paused
        }
    }

    // Commands to restart
    if (input.toLowerCase() === 'reiniciar' || input.toLowerCase() === 'restart' || input.toLowerCase() === 'menu') {
        await updateSession(senderId, { step: 0, lang: null, action: null, condition: null, size: null, type: null, zip: null });
        step = 0;
    }

    // FAQ Interceptor
    if (step > 0.1 && input.length > 3) {
        const lowerInput = input.toLowerCase();
        let faqKey = null;
        if (lowerInput.match(/(foto|photo|imagen|pic)/)) faqKey = 'faq_photo';
        else if (lowerInput.match(/(financiamiento|pagar|pago|finance|pay|payment)/)) faqKey = 'faq_payment';
        else if (lowerInput.match(/(ubicacion|ubicados|donde|location|located|where)/)) faqKey = 'faq_location';
        else if (lowerInput.match(/(tiempo|demoran|tardan|entrega|time|delivery|long)/)) faqKey = 'faq_time';
        else if (lowerInput.match(/(estado|condicion|condición|calidad|estanco|rotos|golpes|oxidados|oxido|rust|condition|quality|broken|leaks|good)/)) faqKey = 'faq_condition';

        if (faqKey) {
            const faqDict = chatDict[session.lang || 'ES'];
            await sendMessage(senderId, faqDict[faqKey] + faqDict.faq_prompt);
            return;
        }
    }

    if (step === 0) {
        await sendQuickReplies(senderId, "Hello! Welcome to RP Tulipan / ¡Hola! Bienvenido a RP Tulipan.", ['English', 'Español']);
        await updateSession(senderId, { step: 0.1 });
        return;
    }

    if (step === 0.1) {
        const lang = input.toLowerCase().includes('english') ? 'EN' : 'ES';
        await updateSession(senderId, { lang: lang, step: 1 });
        const dict = chatDict[lang];
        await sendQuickReplies(senderId, dict.step1_msg, dict.step1_btns);
        return;
    }

    const lang = session.lang || 'ES';
    const dict = chatDict[lang];

    if (step === 1) {
        // Enforce exact matches for safety, or map closely
        let action = null;
        if (input === 'Comprar' || input === 'Buy') action = 'Comprar';
        else if (input === 'Alquilar' || input === 'Rent') action = 'Alquilar';
        else if (input === 'Transporte' || input === 'Transport') action = 'Transporte';
        else {
            // Invalid input, reprompt
            await sendQuickReplies(senderId, dict.step1_msg, dict.step1_btns);
            return;
        }

        if (action === 'Comprar') {
            await updateSession(senderId, { action, step: 1.5 });
            await sendQuickReplies(senderId, dict.step1_5_msg, dict.step1_5_btns);
        } else {
            await updateSession(senderId, { action, step: 2 });
            if (action === 'Transporte') {
                await sendQuickReplies(senderId, dict.step2_size_msg, dict.step3_size_btns);
            } else {
                await sendQuickReplies(senderId, dict.step2_cond_msg, dict.step2_cond_btns);
            }
        }
        return;
    }

    if (step === 1.5) {
        // Storage or Export
        let action = 'Comprar';
        if (input.includes('Export')) action = 'Exportación';
        
        await updateSession(senderId, { action, step: 2 });
        await sendQuickReplies(senderId, dict.step2_cond_msg, dict.step2_cond_btns);
        return;
    }

    if (step === 2) {
        if (['Comprar', 'Alquilar', 'Exportación'].includes(session.action)) {
            let condition = (input === 'Nuevo' || input === 'New') ? 'Nuevo' : 'Usado';
            await updateSession(senderId, { condition, step: 3 });
            await sendQuickReplies(senderId, dict.step3_size_msg, dict.step3_size_btns);
        } else if (session.action === 'Transporte') {
            let size = input;
            if (!["20'", "40'", "45'"].includes(size)) size = "40'"; // fallback
            await updateSession(senderId, { size, step: 3 });
            await sendQuickReplies(senderId, dict.step3_load_msg, dict.step3_load_btns);
        }
        return;
    }

    if (step === 3) {
        if (['Comprar', 'Alquilar', 'Exportación'].includes(session.action)) {
            let size = input;
            if (!["20'", "40'", "45'"].includes(size)) size = "40'";
            
            if (session.action === 'Alquilar' || size === "45'") {
                await updateSession(senderId, { size, type: 'Dry', step: 4 });
                await sendMessage(senderId, dict.step4_other_msg);
            } else {
                await updateSession(senderId, { size, step: 3.5 });
                let typeBtns = ['Dry', 'Reefer'];
                if ((session.condition === 'Nuevo' || session.condition === 'New') && session.action !== 'Alquilar') {
                    typeBtns.push('Open Side', 'Double Door');
                }
                await sendQuickReplies(senderId, dict.step3_5_type_msg, typeBtns);
            }
        } else if (session.action === 'Transporte') {
            let loadStatus = (input === 'Vacío' || input === 'Empty') ? 'Vacío' : 'Cargado';
            await updateSession(senderId, { load_status: loadStatus, step: 4 });
            await sendMessage(senderId, dict.step4_trans_msg);
        }
        return;
    }

    if (step === 3.5) {
        let type = input;
        await updateSession(senderId, { type });
        if (type === 'Reefer') {
            await updateSession(senderId, { step: 3.7 });
            await sendQuickReplies(senderId, dict.step3_7_reefer_msg, dict.step3_7_reefer_btns);
        } else {
            await updateSession(senderId, { step: 4 });
            await sendMessage(senderId, dict.step4_other_msg);
        }
        return;
    }

    if (step === 3.7) {
        let reeferStatus = (input === 'Funcional' || input === 'Working') ? 'Funcional' : 'No Funcional';
        await updateSession(senderId, { reefer_status: reeferStatus, step: 4 });
        await sendMessage(senderId, dict.step4_other_msg);
        return;
    }

    if (step === 4) {
        if (session.action === 'Transporte') {
            const zips = input.split(' ').filter(z => z.trim().length > 0);
            if (zips.length !== 2 || !/^\d{5}$/.test(zips[0]) || !/^\d{5}$/.test(zips[1])) {
                await sendMessage(senderId, dict.err_trans);
                return;
            }
            await updateSession(senderId, { zip_origin: zips[0], zip_dest: zips[1] });
            session.zip_origin = zips[0];
            session.zip_dest = zips[1];
        } else {
            if (!/^\d{5}$/.test(input)) {
                await sendMessage(senderId, dict.err_other);
                return;
            }
            await updateSession(senderId, { zip: input });
            session.zip = input;
        }

        // Call calculate-quote
        await sendMessage(senderId, lang === 'EN' ? "Calculating exact price... ⏳" : "Calculando precio exacto... ⏳");
        
        try {
            const isTransport = session.action === 'Transporte' || session.action === 'Transport';
            const isExport = session.action === 'Exportación' || session.action === 'Export';
            const isNew = session.condition === 'Nuevo' || session.condition === 'New';
            
            let sizeKey = '';
            if (session.size === "20'") {
                if (session.type === 'Reefer') sizeKey = session.reefer_status === 'Funcional' ? '20func' : '20nofunc';
                else if (session.type === 'Open Side') sizeKey = '20side';
                else if (session.type === 'Double Door') sizeKey = '20dd';
                else sizeKey = '20std';
            }
            else if (session.size === "40'") {
                if (session.type === 'Reefer') sizeKey = session.reefer_status === 'Funcional' ? '40func' : '40nofunc';
                else if (session.type === 'Open Side') sizeKey = '40side';
                else if (session.type === 'Double Door') sizeKey = '40dd';
                else sizeKey = '40hc';
            }
            else if (session.size === "45'") sizeKey = '45hc';

            const reqBody = {
                operation_mode: session.action === 'Alquilar' ? 'rent' : (isTransport ? 'transport_only' : 'sale'),
                condition: isNew ? 'new' : 'used',
                zip_origen: isTransport ? session.zip_origin : undefined,
                zip_destino: isTransport ? session.zip_dest : session.zip,
                container_size: sizeKey,
                options: {
                    export_certificate: isExport,
                    extra_service: session.load_status === 'Vacío',
                    crane_service: session.load_status === 'Cargado'
                }
            };

            const { data, error } = await supabase.functions.invoke('calculate-quote', {
                body: reqBody
            });

            if (error || (data && data.error)) {
                const err = lang === 'EN' 
                    ? "Oops! It looks like we are out of stock for that model in your area. Type 'Restart' to try a different size." 
                    : "¡Ups! Parece que se nos agotó el inventario para ese modelo en específico en tu zona. Escribe 'Reiniciar' para intentar otra medida.";
                await sendMessage(senderId, err);
                return;
            }

            let finalPrice = data.total_price || data.totalPrice;
            let immediatePrice = data.immediate_price;

            if (!finalPrice) {
                await sendMessage(senderId, lang === 'EN' ? "Oops! Out of stock. Type 'Restart'" : "¡Ups! Agotado. Escribe 'Reiniciar'");
                return;
            }

            if (isExport) {
                const isSpecialBox = ['Reefer', 'Open Side', 'Double Door'].includes(session.type);
                const basePrice = (data.container_price || 0) + (isSpecialBox ? 0 : (data.cert_fee || 0));
                const formattedBase = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(basePrice);
                
                await updateSession(senderId, { final_amount: basePrice, final_form_amount: formattedBase, step: 6 });
                
                const certTextFinalEN = isSpecialBox ? 'container' : 'container and certification';
                const certTextFinalES = isSpecialBox ? 'el contenedor' : 'el contenedor y la certificación';
                const cMsg = lang === 'EN'
                    ? `Perfect. The total price for the ${certTextFinalEN} is **${formattedBase}**. Would you like to proceed and leave your contact details?`
                    : `Perfecto. El precio total por ${certTextFinalES} es de **${formattedBase}**. ¿Te gustaría proceder con la compra y dejarnos tus datos de contacto?`;
                
                await sendQuickReplies(senderId, cMsg, lang === 'EN' ? ['Yes, proceed', 'No, thanks'] : ['Sí, proceder', 'No, gracias']);

            } else {
                const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(finalPrice);
                const formattedImm = immediatePrice ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(immediatePrice) : null;
                
                let closingMsg = lang === 'EN'
                    ? `Great news! The total price for your ${session.condition === 'Nuevo' ? 'New' : 'Used'} ${session.size} container delivered to ${session.zip} is **${formattedPrice}**.\n\nWould you like to proceed and leave your contact details to coordinate?`
                    : `¡Excelente noticia! El precio total para tu contenedor ${session.condition === 'Nuevo' ? 'Nuevo' : 'Usado'} de ${session.size} entregado al Zip Code ${session.zip} es de **${formattedPrice}**.\n\n¿Te gustaría proceder con la compra y dejarnos tus datos de contacto para coordinar?`;
                    
                if (session.action === 'Alquilar') {
                    const rentMonthly = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(data.container_price || 0);
                    const rentLogistics = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(data.delivery_cost || 0);
                    
                    closingMsg = lang === 'EN'
                        ? `Great news! We have availability to rent your ${session.size} container to Zip Code ${session.zip}.\n\n🔹 Monthly Rent: ${rentMonthly}\n🔹 Logistics (Delivery & future pickup): ${rentLogistics} (one-time fee)\n\nTo start, the initial payment would be ${formattedPrice}. Would you like to proceed?`
                        : `¡Excelente noticia! Tenemos disponibilidad para renta de tu contenedor de ${session.size} en el Zip Code ${session.zip}.\n\n🔹 Renta Mensual: ${rentMonthly}\n🔹 Logística (Entrega y Recogida futura): ${rentLogistics} (pago único)\n\nPara iniciar, el pago inicial sería de ${formattedPrice}. ¿Te gustaría proceder con la renta?`;
                } else if (isTransport) {
                    closingMsg = lang === 'EN'
                        ? `We have two transport options for your ${session.size} container:\n🔹 Flexible Delivery: ${formattedPrice}\n🔹 Immediate Delivery: ${formattedImm}\n\nWould you like to proceed with one of these options?`
                        : `Tenemos dos opciones de transporte para tu contenedor de ${session.size}:\n🔹 Envío Flexible: ${formattedPrice}\n🔹 Envío Inmediato: ${formattedImm}\n\n¿Te gustaría proceder con alguna de estas opciones?`;
                }

                await updateSession(senderId, { final_amount: finalPrice, final_form_amount: formattedPrice, step: 6 });
                await sendQuickReplies(senderId, closingMsg, lang === 'EN' ? ['Yes, proceed', 'No, thanks'] : ['Sí, proceder', 'No, gracias']);
            }
        } catch (e) {
            console.error('Error calculating quote:', e);
            await sendMessage(senderId, "Error calculando. Escribe 'reiniciar'.");
        }
        return;
    }

    if (step === 6) {
        if (input.includes('No')) {
            await updateSession(senderId, { step: 0 }); // reset
            await sendMessage(senderId, lang === 'EN' ? "No problem. Let me know if you need anything else! Type 'Restart' to start again." : "No hay problema. ¡Avísame si necesitas algo más! Escribe 'Reiniciar' para volver a empezar.");
        } else {
            await updateSession(senderId, { step: 7 });
            await sendMessage(senderId, lang === 'EN' ? "Excellent! Please enter your full name to start the order." : "¡Excelente! Por favor, escribe tu nombre completo para iniciar la orden.");
        }
        return;
    }

    if (step === 7) {
        if (input.length < 2) {
            await sendMessage(senderId, lang === 'EN' ? "Please enter a valid name." : "Por favor ingresa un nombre válido.");
            return;
        }
        await updateSession(senderId, { lead_name: input, step: 8 });
        await sendMessage(senderId, lang === 'EN' ? `Thank you, ${input}. Now, please enter your contact phone number.` : `Gracias, ${input}. Ahora, por favor escribe tu número de teléfono de contacto.`);
        return;
    }

    if (step === 8) {
        await updateSession(senderId, { lead_phone: input, step: 0 });
        
        // Log to call_logs table
        const payload = {
            customer: session.lead_name || 'Unknown',
            phone: input || '---',
            service_type: session.action || 'Sales',
            city: '---', // or extrapolate from zip
            description: `Order requested via Meta Webhook (State Machine). Zip: ${session.zip || session.zip_dest}. Condition: ${session.condition}. Size: ${session.size}. Type: ${session.type}.`,
            created_by: 'rptulipantransport@gmail.com', // Default assigned
            source: 'facebook_bot',
            status: 'PENDING',
            date: new Date().toISOString().split('T')[0],
            next_call_date: new Date().toISOString().split('T')[0],
            amount: session.final_amount,
            zip_code: session.zip || session.zip_dest,
            measures: session.size
        };
        await supabase.from('call_logs').insert([payload]);

        await sendMessage(senderId, lang === 'EN' 
            ? "Perfect! We have received your request. An agent will contact you shortly via phone or WhatsApp to finalize the details. Have a great day!" 
            : "¡Perfecto! Hemos recibido tu solicitud. Un agente te contactará en breve por teléfono o WhatsApp para finalizar los detalles. ¡Que tengas un gran día!");
        return;
    }
}

serve(async (req) => {
    // 1. Webhook Verification (GET)
    if (req.method === 'GET') {
        const url = new URL(req.url);
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            return new Response(challenge, { status: 200 });
        } else {
            return new Response('Forbidden', { status: 403 });
        }
    }

    // 2. Webhook Event Handling (POST)
    if (req.method === 'POST') {
        try {
            const body = await req.json();
            
            if (body.object === 'page' || body.object === 'instagram') {
                for (const entry of body.entry) {
                    // Check if it's a standard message or a standby message (Handover Protocol)
                    const events = entry.messaging || entry.standby || [];
                    
                    for (const event of events) {
                        if (!event.sender || !event.sender.id) continue;
                        
                        const senderId = event.sender.id;
                        
                        // We only care about text messages or quick reply payloads
                        if (event.message) {
                            // Check if it's an echo from the admin (Human Takeover)
                            if (event.message.is_echo) {
                                if (event.message.text) {
                                    const text = event.message.text.trim().toLowerCase();
                                    const customerId = event.recipient.id;
                                    if (text.startsWith('//activar') || text.startsWith('// reiniciar')) {
                                        await updateSession(customerId, { step: 0.1 });
                                        await sendQuickReplies(customerId, "Hello! Welcome to RP Tulipan / ¡Hola! Bienvenido a RP Tulipan.", ['English', 'Español']);
                                    } else if (text.startsWith('//')) {
                                        await updateSession(customerId, { step: -1 });
                                    }
                                }
                                continue;
                            }

                            let text = '';
                            if (event.message.quick_reply && event.message.quick_reply.payload) {
                                text = event.message.quick_reply.payload;
                            } else if (event.message.text) {
                                text = event.message.text;
                            }

                            if (text) {
                                await handleMessage(senderId, text);
                            }
                        }
                    }
                }
                return new Response('EVENT_RECEIVED', { status: 200 });
            }
            return new Response('Not Found', { status: 404 });
        } catch (e) {
            console.error('Webhook error:', e);
            return new Response('Internal Error', { status: 500 });
        }
    }

    return new Response('Method Not Allowed', { status: 405 });
});
