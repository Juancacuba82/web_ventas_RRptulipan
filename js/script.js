// Supabase Configuration
const SUPABASE_URL = 'https://xtrceqpuwqetzslwxxux.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';
let supabaseClient = null;

// â”€â”€â”€ Dynamic Price Config (loaded from Supabase 'licencias') â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LS_PRICE_KEY = 'tulipan_prices_v1';
let DYNAMIC_PRICES = null; // Will be populated on page load

/**
 * Maps the hub JSON structure from Supabase into the price dictionaries
 * expected by the calculators:
 *   USED_CONTAINER_PRICES, NEW_CONTAINER_PRICES, REEFER_PRICES,
 *   RENT_PRICES_USED, RENT_PRICES_NEW, DEPOTS
 *
 * Size key mapping:
 *   "20std"  â†’ "20'"
 *   "40std"  â†’ "40' STD"
 *   "40hc"   â†’ "40' HC"
 *   "45hc"   â†’ "45'"
 * Reefer key mapping:
 *   "20func" â†’ "20'"
 *   "40func" â†’ "40' STD" and "40' HC"   (same price for both 40-foot variants)
 */
function buildPricesFromHubs(hubs) {
    const sizeMap = {
        '20std': "20'",
        '40std': "40' STD",
        '40hc':  "40' HC",
        '45hc':  "45'"
    };

    const usedPrices  = {};
    const newPrices   = {};
    const reeferPrices = {};
    const depots      = [];

    hubs.forEach(hub => {
        if (!hub.active) return; // Skip inactive hubs

        const hubName = `${hub.name} (${hub.zip})`;
        depots.push({ label: hubName, zip: hub.zip });

        // --- USED ---
        const usedEntry = {};
        Object.entries(hub.used || {}).forEach(([rawKey, price]) => {
            const sizeLabel = sizeMap[rawKey];
            if (sizeLabel && price > 0) usedEntry[sizeLabel] = price;
        });
        if (Object.keys(usedEntry).length) usedPrices[hubName] = usedEntry;

        // --- NEW ---
        const newEntry = {};
        Object.entries(hub.new || {}).forEach(([rawKey, price]) => {
            const sizeLabel = sizeMap[rawKey];
            if (sizeLabel && price > 0) newEntry[sizeLabel] = price;
        });
        if (Object.keys(newEntry).length) newPrices[hubName] = newEntry;

        // --- REEFER ---
        const reeferEntry = {};
        const r = hub.reefer || {};
        if (r['20func']  > 0) reeferEntry["20'"]      = r['20func'];
        if (r['40func']  > 0) { reeferEntry["40' STD"] = r['40func']; reeferEntry["40' HC"] = r['40func']; }
        if (r['20nofunc'] > 0) reeferEntry["20'"]      = reeferEntry["20'"]      || r['20nofunc'];
        if (r['40nofunc'] > 0) { reeferEntry["40' STD"] = reeferEntry["40' STD"] || r['40nofunc']; reeferEntry["40' HC"] = reeferEntry["40' HC"] || r['40nofunc']; }
        if (r['45hc']    > 0) reeferEntry["45'"]       = r['45hc'];
        if (Object.keys(reeferEntry).length) reeferPrices[hubName] = reeferEntry;
    });

    // Rental prices: derive from the first active hub that has non-zero values
    // (or keep a global flat rate if the hub data doesn't carry rent prices)
    // For now we keep the rent prices as-is; they can be added to the JSON later.
    return { usedPrices, newPrices, reeferPrices, depots };
}

/**
 * Fetches price config from Supabase, caches it in localStorage.
 * Falls back to cached version if fetch fails.
 */
async function loadDynamicPrices() {
    if (!supabaseClient) return false;

    try {
        const { data, error } = await supabaseClient
            .from('licencias')
            .select('config')
            .eq('clave', 'ROL26_#kR8t!v2M')
            .single();

        if (error || !data || !data.config) throw new Error(error?.message || 'No config data');

        const hubs = data.config.hubs;
        if (!Array.isArray(hubs) || hubs.length === 0) throw new Error('Empty hubs array');

        DYNAMIC_PRICES = buildPricesFromHubs(hubs);
        if (data.config.deliveryRates) {
            DYNAMIC_PRICES.deliveryRates = data.config.deliveryRates;
        }

        // Cache a fresh copy for offline fallback
        try { localStorage.setItem(LS_PRICE_KEY, JSON.stringify(data.config)); } catch (_) {}

        console.log('[Prices] Loaded from Supabase âœ“', DYNAMIC_PRICES);
        return true;

    } catch (err) {
        console.warn('[Prices] Supabase fetch failed, trying localStorage cache...', err);

        try {
            const cached = localStorage.getItem(LS_PRICE_KEY);
            if (cached) {
                const configCache = JSON.parse(cached);
                if (Array.isArray(configCache)) {
                    DYNAMIC_PRICES = buildPricesFromHubs(configCache);
                } else {
                    DYNAMIC_PRICES = buildPricesFromHubs(configCache.hubs);
                    if (configCache.deliveryRates) {
                        DYNAMIC_PRICES.deliveryRates = configCache.deliveryRates;
                    }
                }
                console.log('[Prices] Loaded from localStorage cache âœ“');
                return true;
            }
        } catch (_) {}

        console.warn('[Prices] No cache found, falling back to hardcoded prices.');
        return false; // Hardcoded prices remain as final fallback
    }
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


async function sendLeadToSupabase(leadData) {
    if (!supabaseClient) return;
    try {
        // Round Robin: Isabella & Anthony
        let assignedTo = 'rptulipantransport@gmail.com'; // Default Isabella
        
        // Fetch the very last lead that came from the website
        const { data: lastLeads } = await supabaseClient
            .from('call_logs')
            .select('created_by')
            .eq('source', 'website')
            .order('id', { ascending: false })
            .limit(1);

        if (lastLeads && lastLeads.length > 0) {
            const lastEmail = lastLeads[0].created_by;
            // If the last one was Isabella, now it's Anthony's turn
            if (lastEmail === 'rptulipantransport@gmail.com') {
                assignedTo = 'anthonyps06@icloud.com';
            } else {
                // Otherwise (if it was Anthony or any other), back to Isabella
                assignedTo = 'rptulipantransport@gmail.com';
            }
        }

        const payload = {
            customer: leadData.name || 'Unknown',
            phone: leadData.phone || '---',
            service_type: leadData.service || 'Sales',
            city: (leadData.city || '---').toUpperCase(),
            description: leadData.message || '---',
            created_by: assignedTo,
            source: 'website',
            status: 'PENDING',
            date: new Date().toISOString().split('T')[0],
            next_call_date: new Date().toISOString().split('T')[0]
        };

        // AÃ±adir columnas personalizadas si vienen en los datos
        if (leadData.amount !== undefined && leadData.amount !== null) payload.amount = leadData.amount;
        if (leadData.delivery_place) payload.zip_code = leadData.delivery_place;
        if (leadData.size) payload.measures = leadData.size;

        const { error } = await supabaseClient.from('call_logs').insert([payload]);
        
        if (error) {
            console.warn("Supabase insert falló con columnas extra, intentando modo seguro (fallback):", error);
            
            // Si falló, posiblemente sea porque las columnas amount, zip_code o measures no existen o tienen límite.
            // Removemos las columnas problemáticas y ponemos la info en la descripción para no perderla.
            delete payload.amount;
            delete payload.zip_code;
            delete payload.measures;
            
            payload.description += `\n[Fallback Data] Address: ${leadData.delivery_place || ''} | Size: ${leadData.size || ''} | Price: ${leadData.amount || ''}`;
            
            const { error: fallbackError } = await supabaseClient.from('call_logs').insert([payload]);
            if (fallbackError) {
                console.error("Supabase Fallback Error:", fallbackError);
            }
        }
    } catch (err) {
        console.error("Supabase Exception:", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Supabase safely
    if (typeof window.supabase !== 'undefined') {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } catch(e) { console.error("Supabase Init Error:", e); }
    }

    // Load dynamic prices from Supabase (async, with localStorage fallback)
    loadDynamicPrices();
    
    // Initialize EmailJS once
    if (typeof emailjs !== 'undefined') {
        emailjs.init("4x1rkqnQuj83tl-mh");
    }

    // Mobile Menu Toggle
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    const navLinks = document.querySelectorAll('.nav-links li');

    burger.addEventListener('click', () => {
        nav.classList.toggle('nav-active');
        navLinks.forEach((link, index) => {
            if (link.style.animation) {
                link.style.animation = '';
            } else {
                link.style.animation = `navLinkFade 0.5s ease forwards ${index / 7 + 0.3}s`;
            }
        });
        burger.classList.toggle('toggle');
    });

    // Language Logic
    let currentLang = 'en';
    const langSwitch = document.getElementById('lang-switch');

    const translations = {
        en: {
            "ai-restart-btn": "Restart",
            "nav-home": "Home",
            "nav-services": "Services",
            "nav-about": "About Us",
            "nav-gallery": "Gallery",
            "nav-contact": "Contact",
            "hero-title": "Modern Container Solutions",
            "hero-p": "Global logistics made simple. We sell, rent, and transport high-quality containers tailored to your business needs.",
            "hero-btn-services": "Our Services",
            "services-title": "Our Services",
            "service-sales-h3": "Container Sales",
            "service-sales-p": "Looking for a permanent solution? We offer a wide range of new and used shipping containers for sale.",
            "service-sales-btn": "Buy",
            "service-rent-h3": "Container Rentals",
            "service-rent-p": "Flexible rental options for short and long-term storage needs. Reliable and secure containers at your disposal.",
            "service-rent-btn": "Rent",
            "service-trans-h3": "Transportation & Crane Services",
            "service-trans-p": "Fast transportation and safe heavy lifting crane services for containers and large equipment.",
            "service-trans-btn": "Quote",
            "service-crane-h3": "Crane Services",
            "service-crane-p": "Need heavy lifting? Our crane services provide safe and efficient handling for containers and large equipment.",
            "service-crane-btn": "Request",
            "crane-h1": "Crane Service Quote",
            "about-h2": "Why Choose RP Tulipan?",
            "about-p": "With years of experience in the logistics industry, we pride ourselves on providing top-tier container solutions. Our commitment to quality and customer satisfaction makes us a leader in the market.",
            "about-f1": "High-quality steel containers",
            "about-f2": "Competitive market pricing",
            "about-f3": "24/7 Customer support",
            "about-f4": "Global delivery network",
            "contact-h2": "Contact Us",
            "contact-h3": "Get in Touch",
            "contact-p": "Have questions about our services? Our team is ready to help you find the perfect container solution.",
            "contact-address": "9804 NW 80th Ave, Hialeah Gardens FL 33016, United States",
            "form-name": "Your Name",
            "form-email": "Your Email",
            "form-phone": "Phone Number",
            "form-service-placeholder": "Select Service",
            "form-service-sales": "Container Sales",
            "form-service-rent": "Container Rentals",
            "form-service-trans": "Transportation",
            "form-service-crane": "Crane Services",
            "form-message": "Your Message",
            "form-btn": "Send Message",
            "footer-p": "Providing excellence in container logistics.",
            "footer-links-h4": "Quick Links",
            "footer-social-h4": "Follow Us",
            "footer-bottom": "&copy; 2026 RP Tulipan Logistics. All rights reserved.",
            "gallery-h1": "Our Photo Gallery",
            "gallery-p": "Explore our containers and logistics operations",
            "buy-h1": "Configure Your Container",
            "buy-p": "Select the options that best fit your needs",
            "buy-step1": "Delivery or Pickup",
            "buy-step-qty": "Select Quantity",
            "buy-step2": "Type of Service",
            "buy-step-cond": "Container Condition",
            "buy-step3": "Climate Control",
            "buy-step4": "Delivery or Pickup",
            "buy-step5": "Logistics Details",
            "buy-step6": "Payment Method",
            "buy-step7": "Contact Information",
            "buy-step-size": "Select Size",
            "buy-step-contact": "Contact Details",
            "buy-summary-subtotal": "Container Subtotal",
            "buy-summary-export": "Export Fee",
            "buy-summary-shipping": "Shipping Cost",
            "buy-summary-delivery": "Delivery Cost",
            "buy-summary-total": "Total Price",
            "buy-summary-dist": "Distance",
            "buy-calculating": "Calculating distance...",
            "pay-note": "You can pay upon delivery using any method: Zelle, Cash, Check, or Credit Card.",
            "buy-depot-info": "Select the depot closest to your location to get the lowest shipping rates.",
            "buy-summary": "Summary",
            "buy-btn-pricing": "Place Order.",
            "buy-btn-restart": "Restart",
            "buy-back": "Back",
            "buy-back-home": "Back to Services",
            "buy-opt-20": "20' Standard",
            "buy-opt-40": "40' High Cube",
            "buy-opt-40std": "40' Standard",
            "buy-opt-45": "45' High Cube",
            "buy-opt-int": "Shipping",
            "buy-opt-local": "Storage",
            "buy-opt-cw": "Used (CW)",
            "buy-opt-new-cond": "New (One Trip)",
            "buy-opt-wwt": "Used (WWT)",
            "buy-opt-dry": "Dry",
            "buy-opt-reefer": "Reefer",
            "buy-opt-delivery": "Delivery",
            "buy-opt-pickup": "Pickup",
            "buy-pay-cash": "Cash",
            "buy-pay-zelle": "Zelle",
            "buy-pay-card": "Credit/Debit Card",
            "buy-pay-check": "Check",
            "buy-zip-placeholder": "Enter Delivery Zip Code",
            "buy-btn-next": "Next",
            "buy-depot-sav": "Savannah (31408)",
            "buy-depot-atl": "Atlanta (30288)",
            "buy-depot-jax": "Jacksonville (32218)",
            "buy-depot-tit": "Titusville (32780)",
            "buy-depot-tam": "Tampa (33619)",
            "buy-depot-mia": "Miami (33178)",
            "rent-step-cond": "5. Container Condition",
            "rent-step-logistics": "2. Logistics Details",
            "rent-step-pay": "6. Payment Method",
            "rent-step-contact": "7. Contact Information",
            "rent-step-size": "3. Select Size",
            "rent-step-qty": "4. Select Quantity",
            "rent-opt-used": "Used",
            "rent-opt-new": "New",
            "rent-h1": "Rent Your Container",
            "rent-btn-pricing": "Place Order.",
            "trans-h1": "Transportation Quote",
            "trans-step1": "1. Container Size",
            "trans-step2": "2. Container Status",
            "trans-step3": "3. Route Details",
            "trans-opt-empty": "Empty",
            "trans-opt-full": "Loaded",
            "trans-opt-crane-yes": "Crane Needed",
            "trans-opt-crane-no": "No Crane Needed",
            "trans-zip-pickup": "Pickup Zip Code",
            "trans-zip-delivery": "Delivery Zip Code",
            "trans-btn-pricing": "Get Estimated Quote",
            "exact-quote-text": "For an exact quote please contact:",
            "trans-step-contact": "4. Contact Information",
            "summary-status": "Status",
            "summary-crane": "Crane",
            "summary-route": "Route",
            "summary-quantity": "Quantity",
            "summary-contact": "Contact",
            "promo-label": "GRAND OPENING DISCOUNT",
            "promo-only": "PURCHASE ONLY",
            "promo-sub": "WEBSITE LAUNCH SPECIAL",
            "countdown-text": "GRAND OPENING DISCOUNT ends in:",
            "timer-days": "Days",
            "timer-hours": "Hours",
            "timer-minutes": "Minutes",
            "timer-seconds": "Seconds",
            "sizes-title": "Container Dimensions",
            "whatsapp-tooltip": "Chat with us!",
            "tax-warning": "* Taxes may apply depending on your tax status."
        },
        es: {
            "ai-restart-btn": "Reiniciar",
            "nav-home": "Inicio",
            "nav-services": "Servicios",
            "nav-about": "Nosotros",
            "nav-gallery": "Galería",
            "nav-contact": "Contacto",
            "hero-title": "Soluciones Modernas de Contenedores",
            "hero-p": "Logística global simplificada. Vendemos, alquilamos y transportamos contenedores de alta calidad adaptados a sus necesidades comerciales.",
            "hero-btn-services": "Nuestros Servicios",
            "services-title": "Nuestros Servicios",
            "service-sales-h3": "Venta de Contenedores",
            "service-sales-p": "¿Buscas una solución permanente? Ofrecemos una amplia gama de contenedores de envío nuevos y usados para la venta.",
            "service-sales-btn": "Comprar",
            "service-rent-h3": "Alquiler de Contenedores",
            "service-rent-p": "Opciones de alquiler flexibles para necesidades de almacenamiento a corto y largo plazo. Contenedores fiables y seguros a su disposición.",
            "service-rent-btn": "Alquilar",
            "service-trans-h3": "Transporte y Servicio de Grúa",
            "service-trans-p": "Transporte rápido y seguro junto con servicios de grúa de elevación pesada para contenedores y equipos grandes.",
            "service-trans-btn": "Cotizar",
            "service-crane-h3": "Servicio de Grúa",
            "service-crane-p": "¿Necesita elevación pesada? Nuestros servicios de grúa ofrecen un manejo seguro y eficiente para contenedores y equipos grandes.",
            "service-crane-btn": "Solicitar",
            "crane-h1": "Cotización de Servicio de Grúa",
            "about-h2": "¿Por qué elegir RP Tulipan?",
            "about-p": "Con años de experiencia en la industria logística, nos enorgullecemos de brindar soluciones de contenedores de primer nivel. Nuestro compromiso con la calidad y la satisfacción del cliente nos convierte en líderes en el mercado.",
            "about-f1": "Contenedores de acero de alta calidad",
            "about-f2": "Precios competitivos de mercado",
            "about-f3": "Atención al cliente 24/7",
            "about-f4": "Red de entrega global",
            "contact-h2": "Contáctenos",
            "contact-h3": "Ponerse en contacto",
            "contact-p": "¿Tiene preguntas sobre nuestros servicios? Nuestro equipo está listo para ayudarlo a encontrar la solución de contenedor perfecta.",
            "contact-address": "9804 NW 80th Ave, Hialeah Gardens FL 33016, Estados Unidos",
            "form-name": "Tu nombre",
            "form-email": "Tu correo electrónico",
            "form-phone": "Número de teléfono",
            "form-service-placeholder": "Seleccionar servicio",
            "form-service-sales": "Venta de contenedores",
            "form-service-rent": "Alquiler de contenedores",
            "form-service-trans": "Transporte",
            "form-service-crane": "Servicio de grúa",
            "form-message": "Tu mensaje",
            "form-btn": "Enviar mensaje",
            "footer-p": "Brindando excelencia en logística de contenedores.",
            "footer-links-h4": "Enlaces rápidos",
            "footer-social-h4": "Síguenos",
            "footer-bottom": "&copy; 2026 RP Tulipan Logistics. Todos los derechos reservados.",
            "gallery-h1": "Nuestra Galería de Fotos",
            "gallery-p": "Explore nuestros contenedores y operaciones logísticas",
            "buy-h1": "Configura tu Contenedor",
            "buy-p": "Selecciona las opciones que mejor se adapten a tus necesidades",
            "buy-step1": "Entrega o Recogida",
            "buy-step-qty": "Seleccionar Cantidad",
            "buy-step2": "Tipo de Servicio",
            "buy-step-cond": "Condición del Contenedor",
            "buy-step3": "Climatización",
            "buy-step4": "Entrega o Recogida",
            "buy-step5": "Detalles de Logística",
            "buy-step6": "Método de Pago",
            "buy-step7": "Información de Contacto",
            "buy-step-size": "Seleccionar Tamaño",
            "buy-step-contact": "Datos de Contacto",
            "buy-summary-subtotal": "Subtotal Contenedor",
            "buy-summary-export": "Tarifa de Exportación",
            "buy-summary-shipping": "Costo de Envío",
            "buy-summary-delivery": "Costo de Entrega",
            "buy-summary-total": "Precio Total",
            "buy-summary-dist": "Distancia",
            "buy-calculating": "Calculando distancia...",
            "pay-note": "Puedes pagar contra entrega usando cualquier método: Zelle, Cash, Check o Tarjeta de Crédito/Débito.",
            "buy-depot-info": "Seleccione el depósito más cercano a su ubicación para obtener las tarifas de envío más bajas.",
            "buy-summary": "Resumen",
            "buy-btn-pricing": "Realizar Pedido.",
            "buy-btn-restart": "Reiniciar",
            "buy-back": "Atrás",
            "buy-back-home": "Volver a Servicios",
            "buy-opt-20": "20' Estándar",
            "buy-opt-40": "40' High Cube",
            "buy-opt-40std": "40' Estándar",
            "buy-opt-45": "45' High Cube",
            "buy-opt-int": "Shipping",
            "buy-opt-local": "Storage",
            "buy-opt-cw": "Usado (CW)",
            "buy-opt-new-cond": "Nuevo (One Trip)",
            "buy-opt-wwt": "Usado (WWT)",
            "buy-opt-dry": "Dry",
            "buy-opt-reefer": "Reefer",
            "buy-opt-delivery": "Entrega",
            "buy-opt-pickup": "Recogida",
            "buy-pay-cash": "Efectivo",
            "buy-pay-zelle": "Zelle",
            "buy-pay-card": "Tarjeta de Crédito/Débito",
            "buy-pay-check": "Cheque",
            "buy-zip-placeholder": "Código Postal de Entrega",
            "buy-btn-next": "Siguiente",
            "buy-depot-sav": "Savannah (31408)",
            "buy-depot-atl": "Atlanta (30288)",
            "buy-depot-jax": "Jacksonville (32218)",
            "buy-depot-tit": "Titusville (32780)",
            "buy-depot-tam": "Tampa (33619)",
            "buy-depot-mia": "Miami (33178)",
            "rent-step-cond": "5. Condición del Contenedor",
            "rent-step-logistics": "2. Detalles de Logística",
            "rent-step-pay": "6. Método de Pago",
            "rent-step-contact": "7. Información de Contacto",
            "rent-step-size": "3. Seleccionar Tamaño",
            "rent-step-qty": "4. Seleccionar Cantidad",
            "rent-opt-used": "Usado",
            "rent-opt-new": "Nuevo",
            "rent-h1": "Alquila tu Contenedor",
            "rent-btn-pricing": "Realizar Pedido.",
            "trans-h1": "Cotización de Transporte",
            "trans-step1": "1. Tamaño del Contenedor",
            "trans-step2": "2. Estado del Contenedor",
            "trans-step3": "3. Detalles de la Ruta",
            "trans-opt-empty": "Vacío",
            "trans-opt-full": "Cargado",
            "trans-opt-crane-yes": "Necesita Grúa",
            "trans-opt-crane-no": "No necesita Grúa",
            "trans-zip-pickup": "Zip Code de Recogida",
            "trans-zip-delivery": "Zip Code de Entrega",
            "trans-btn-pricing": "Obtener Presupuesto Estimado",
            "exact-quote-text": "Para una cotización exacta por favor comuníquese al:",
            "trans-step-contact": "4. Información de Contacto",
            "summary-status": "Estado",
            "summary-crane": "Grúa",
            "summary-route": "Ruta",
            "summary-quantity": "Cantidad",
            "summary-contact": "Contacto",
            "promo-label": "DESCUENTO DE APERTURA",
            "promo-only": "SOLO COMPRA",
            "promo-sub": "POR LANZAMIENTO DE LA WEB",
            "countdown-text": "EL DESCUENTO DE APERTURA TERMINA EN:",
            "timer-days": "Días",
            "timer-hours": "Horas",
            "timer-minutes": "Minutos",
            "timer-seconds": "Segundos",
            "sizes-title": "Dimensiones de Contenedores",
            "whatsapp-tooltip": "¡Chatea con nosotros!",
            "tax-warning": "* Pueden aplicarse impuestos según su estatus fiscal."
        }
    };

    const updateLanguage = (lang) => {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                if (el.querySelector('span')) {
                    const fullText = translations[lang][key];
                    el.innerHTML = fullText.replace('Solutions', `<span>Solutions</span>`)
                                           .replace('TULIPAN', `<span>TULIPAN</span>`)
                                           .replace('RP Tulipan?', `<span>RP Tulipan?</span>`)
                                           .replace('Photo Gallery', `<span>Photo Gallery</span>`)
                                           .replace('Container', `<span>Container</span>`);
                } else {
                    el.innerText = translations[lang][key];
                }
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[lang][key]) {
                el.placeholder = translations[lang][key];
            }
        });

        if (galleryView.style.display === 'block') renderGallery();
        if (buyView.style.display === 'block') renderBuyView();
        if (rentView.style.display === 'block') renderRentView();
        if (transView.style.display === 'block') renderTransView();
    };

    if (langSwitch) {
        langSwitch.addEventListener('click', () => {
            currentLang = currentLang === 'en' ? 'es' : 'en';
            langSwitch.innerText = currentLang === 'en' ? 'ES' : 'EN';
            updateLanguage(currentLang);
        });
    }

    // SPA Navigation Logic
    const homeView = document.getElementById('home-view');
    const galleryView = document.getElementById('gallery-view');
    const buyView = document.getElementById('buy-view');
    const rentView = document.getElementById('rent-view');
    const transView = document.getElementById('trans-view');
    const craneView = document.getElementById('crane-view');
    const navGallery = document.getElementById('nav-gallery');
    const footerGallery = document.querySelector('.footer-gallery');
    const btnBuyContainer = document.getElementById('btn-buy-container');
    const btnRentContainer = document.getElementById('btn-rent-container');
    const btnTransContainer = document.getElementById('btn-trans-container');
    const btnCraneService = document.getElementById('btn-crane-service');
    const logoHome = document.querySelectorAll('#logo-home, .logo-home');
    const homeLinks = document.querySelectorAll('.nav-link, #nav-home');

    const showView = (viewName) => {
        homeView.style.display = viewName === 'home' ? 'block' : 'none';
        galleryView.style.display = viewName === 'gallery' ? 'block' : 'none';
        buyView.style.display = viewName === 'buy' ? 'block' : 'none';
        rentView.style.display = viewName === 'rent' ? 'block' : 'none';
        transView.style.display = viewName === 'trans' ? 'block' : 'none';
        craneView.style.display = viewName === 'crane' ? 'block' : 'none';
        
        // Show countdown only in "home" and "buy" views
        const countdownBanner = document.getElementById('countdown-banner');
        if (countdownBanner) {
            if (viewName === 'home' || viewName === 'buy') {
                countdownBanner.style.display = 'block';
                document.body.classList.add('with-countdown');
            } else {
                countdownBanner.style.display = 'none';
                document.body.classList.remove('with-countdown');
            }
        }

        if (viewName === 'gallery') renderGallery();
        if (viewName === 'buy') renderBuyView();
        if (viewName === 'rent') renderRentView();
        if (viewName === 'trans') renderTransView();
        if (viewName === 'crane') renderCraneView();

        window.scrollTo(0, 0);
        if (nav.classList.contains('nav-active')) {
            burger.click();
        }
    };

    navGallery.addEventListener('click', (e) => {
        e.preventDefault();
        showView('gallery');
    });

    if (footerGallery) {
        footerGallery.addEventListener('click', (e) => {
            e.preventDefault();
            showView('gallery');
        });
    }

    logoHome.forEach(logo => {
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            showView('home');
        });
    });

    homeLinks.forEach(link => {
        link.addEventListener('click', () => {
            showView('home');
        });
    });

    if (btnBuyContainer) btnBuyContainer.addEventListener('click', (e) => { e.preventDefault(); showView('buy'); });
    if (btnRentContainer) btnRentContainer.addEventListener('click', (e) => { e.preventDefault(); showView('rent'); });
    if (btnTransContainer) btnTransContainer.addEventListener('click', (e) => { e.preventDefault(); showView('trans'); });
    if (btnCraneService) {
        btnCraneService.addEventListener('click', (e) => {
            e.preventDefault();
            showView('crane');
        });
    }

    // Make Service Cards clickable
    document.querySelectorAll('.service-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.card-link')) {
                const link = card.querySelector('.card-link');
                if (link) link.click();
            }
        });
    });

    // Reveal on Scroll
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('active');
        });
    }, { threshold: 0.1 });
    revealElements.forEach(el => revealObserver.observe(el));

    // Navbar Scroll Effect
    const mainNav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            mainNav.style.padding = '10px 0';
            mainNav.style.backgroundColor = 'rgba(217, 4, 41, 0.95)';
        } else {
            mainNav.style.padding = '0';
            mainNav.style.backgroundColor = 'var(--primary-color)';
        }
    });

    // EmailJS Form Submission
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const submitBtn = contactForm.querySelector('button');
            const originalBtnText = submitBtn.innerText;
            
            submitBtn.innerText = currentLang === 'en' ? 'Sending...' : 'Enviando...';
            submitBtn.disabled = true;

            const templateParams = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                phone_number: document.getElementById('phone').value,
                service: document.getElementById('service').value,
                message: document.getElementById('message').value,
                title: currentLang === 'en' ? 'Contact Message' : 'Mensaje de Contacto'
            };

            if (typeof emailjs === 'undefined') {
                alert('El servicio de correo ha tardado en cargar. Reintentando...');
                location.reload(); 
                return;
            }

            // Send to Supabase (Safe call)
            sendLeadToSupabase({
                name: templateParams.name,
                phone: templateParams.phone_number,
                service: templateParams.service,
                message: templateParams.message
            }).catch(e => console.error("DB Error:", e));

            emailjs.send('service_pfwtd14', 'template_0xc7f3i', templateParams)
                .then(() => {
                    submitBtn.innerText = currentLang === 'en' ? 'Message Sent!' : '¡Mensaje Enviado!';
                    submitBtn.style.backgroundColor = '#2ecc71';
                    contactForm.reset();
                    setTimeout(() => {
                        submitBtn.innerText = originalBtnText;
                        submitBtn.style.backgroundColor = 'var(--primary-color)';
                        submitBtn.disabled = false;
                    }, 3000);
                }, (error) => {
                    console.error('EmailJS Error:', error);
                    submitBtn.innerText = currentLang === 'en' ? 'Error!' : '¡Error!';
                    submitBtn.style.backgroundColor = '#e74c3c';
                    setTimeout(() => {
                        submitBtn.innerText = originalBtnText;
                        submitBtn.style.backgroundColor = 'var(--primary-color)';
                        submitBtn.disabled = false;
                    }, 3000);
                });
        });
    }


    function renderGallery() {
        const images = ['imgi_10_58-169x300.jpg', 'imgi_110_Diseno-sin-titulo-5-300x300.png', 'imgi_116_Diseno-sin-titulo-10-300x300.png', 'imgi_117_Diseno-sin-titulo-8-169x300.png', 'imgi_119_Diseno-sin-titulo-6-300x300.png', 'imgi_11_57-169x300.jpg', 'imgi_12_56-169x300.jpg', 'imgi_13_55-169x300.jpg', 'imgi_14_54-169x300.jpg', 'imgi_15_53-169x300.jpg', 'imgi_16_52-169x300.jpg', 'imgi_17_51-169x300.jpg', 'imgi_18_50-169x300.jpg', 'imgi_19_49-169x300.jpg', 'imgi_20_48-169x300.jpg', 'imgi_21_47-169x300.jpg', 'imgi_22_46-169x300.jpg', 'imgi_23_45-169x300.jpg', 'imgi_24_44-169x300.jpg', 'imgi_25_43-169x300.jpg', 'imgi_26_42-169x300.jpg', 'imgi_27_41-169x300.jpg', 'imgi_28_40-169x300.jpg', 'imgi_29_39-169x300.jpg', 'imgi_30_38-169x300.jpg', 'imgi_31_37-169x300.jpg', 'imgi_32_36-169x300.jpg', 'imgi_33_35-169x300.jpg', 'imgi_34_34-169x300.jpg', 'imgi_35_33-169x300.jpg', 'imgi_36_32-169x300.jpg', 'imgi_37_31-169x300.jpg', 'imgi_38_30-169x300.jpg', 'imgi_39_29-169x300.jpg', 'imgi_40_28-169x300.jpg', 'imgi_41_27-169x300.jpg', 'imgi_42_26-169x300.jpg', 'imgi_43_25-169x300.jpg', 'imgi_44_24-169x300.jpg', 'imgi_45_23-169x300.jpg', 'imgi_46_22-169x300.jpg', 'imgi_47_21-169x300.jpg', 'imgi_48_20-169x300.jpg', 'imgi_49_19-169x300.jpg', 'imgi_4_64-169x300.jpg', 'imgi_50_18-1-169x300.jpg', 'imgi_51_17-1-169x300.jpg', 'imgi_52_16-1-169x300.jpg', 'imgi_53_15-1-169x300.jpg', 'imgi_54_14-1-169x300.jpg', 'imgi_55_13-1-169x300.jpg', 'imgi_56_12-1-169x300.jpg', 'imgi_57_11-1-169x300.jpg', 'imgi_58_10-1-169x300.jpg', 'imgi_59_9-1-169x300.jpg', 'imgi_5_63-169x300.jpg', 'imgi_60_8-1-169x300.jpg', 'imgi_61_7-1-169x300.jpg', 'imgi_62_6-1-169x300.jpg', 'imgi_63_5-1-169x300.jpg', 'imgi_64_4-1-169x300.jpg', 'imgi_65_3-1-169x300.jpg', 'imgi_66_2-1-169x300.jpg', 'imgi_67_1-1-169x300.jpg', 'imgi_68_18-300x300.jpg', 'imgi_69_17-300x300.jpg', 'imgi_6_62-169x300.jpg', 'imgi_70_16-300x300.jpg', 'imgi_71_15-300x300.jpg', 'imgi_72_14-300x300.jpg', 'imgi_73_13-300x300.jpg', 'imgi_74_12-300x300.jpg', 'imgi_75_11-300x300.jpg', 'imgi_76_10-300x300.jpg', 'imgi_77_9-300x300.jpg', 'imgi_78_8-300x300.jpg', 'imgi_79_7-300x300.jpg', 'imgi_7_61-169x300.jpg', 'imgi_80_6-300x300.jpg', 'imgi_81_5-300x300.jpg', 'imgi_82_4-300x300.jpg', 'imgi_83_3-300x300.jpg', 'imgi_84_2-300x300.jpg', 'imgi_85_1-300x300.jpg', 'imgi_86_Diseno-sin-titulo-24-300x300.png', 'imgi_87_Diseno-sin-titulo-25-300x300.png', 'imgi_88_Diseno-sin-titulo-29-300x300.png', 'imgi_89_services-fullfill-300x185.jpg', 'imgi_8_60-169x300.jpg', 'imgi_90_services-finalmile-300x185.jpg', 'imgi_93_Diseno-sin-titulo-22-300x300.png', 'imgi_94_Diseno-sin-titulo-23-300x300.png', 'imgi_95_Diseno-sin-titulo-26-300x300.png', 'imgi_98_Diseno-sin-titulo-19-300x300.png', 'imgi_9_59-169x300.jpg'];
        const gridHTML = images.map(img => `<div class="gallery-item reveal active"><img src="assets/gallery/${img}" alt="Gallery Photo"></div>`).join('');
        const galleryView = document.getElementById('gallery-view');
        galleryView.innerHTML = `<header class="gallery-header"><div class="container"><h1 data-i18n="gallery-h1">${translations[currentLang]["gallery-h1"]}</h1><p data-i18n="gallery-p">${translations[currentLang]["gallery-p"]}</p></div></header><main class="container"><section class="gallery-grid">${gridHTML}</section></main>`;
        document.title = currentLang === 'en' ? "Photo Gallery | RP Tulipan Logistics" : "Galería de Fotos | RP Tulipan Logistics";
    }

    function renderConfigurationView(viewId, mode) {
        const viewEl = document.getElementById(viewId);
        const t = translations[currentLang];
        const h1 = mode === 'buy' ? t["buy-h1"] : t["rent-h1"];
        const btnPricing = mode === 'buy' ? t["buy-btn-pricing"] : t["rent-btn-pricing"];
        
        viewEl.innerHTML = `
            <header class="buy-header">
                <div class="container">
                    <h1 data-i18n="${mode}-h1">${h1}</h1>
                    <p data-i18n="buy-p">${t["buy-p"]}</p>
                </div>
            </header>
            <main class="container">
                <div class="buy-container">
                    <div id="${mode}-steps">
                        <!-- Step 1: Shipping or Storage (Service Type) -->
                        <div class="buy-step ${mode === 'buy' ? 'active' : ''}" id="${mode}-step-condition" style="${mode === 'rent' ? 'display:none;' : ''}">
                            <button class="btn-back back-btn-action"><i class="fas fa-arrow-left"></i> ${t["buy-back-home"]}</button>
                            <h3 data-i18n="buy-step2">${t["buy-step2"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="International"><i class="fas fa-ship"></i><span>${t["buy-opt-int"]}</span></div>
                                <div class="option-card" data-value="Local"><i class="fas fa-warehouse"></i><span>${t["buy-opt-local"]}</span></div>
                            </div>
                        </div>

                        <!-- Step 2: Size -->
                        <div class="buy-step" id="${mode}-step-size" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="condition"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step-size">${t["buy-step-size"]}</h3>
                            <div id="${mode}-size-options-container" class="options-grid">
                                <!-- JS will populate this based on depot -->
                            </div>
                        </div>

                        <!-- Step 3: Container Condition -->
                        <div class="buy-step" id="${mode}-step-container-condition" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="size"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="${mode}-step-cond">${mode === 'buy' ? t["buy-step-cond"] : t["rent-step-cond"]}</h3>
                            <div class="options-grid" id="${mode}-cond-options">
                                <!-- JS will populate this -->
                            </div>
                        </div>

                        <!-- Step 4: Climate Control -->
                        <div class="buy-step" id="${mode}-step-type" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="container-condition"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step3">${t["buy-step3"]}</h3>
                            <div class="options-grid" id="${mode}-climate-options">
                                <!-- JS populated -->
                            </div>
                        </div>

                        <!-- Step 5: Payment Method -->
                        <div class="buy-step" id="${mode}-step-payment-method" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="type"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="${mode}-step-pay">${mode === 'buy' ? t["buy-step6"] : t["rent-step-pay"]}</h3>
                            <div class="payment-note">
                                <i class="fas fa-hand-holding-dollar"></i>
                                <span data-i18n="pay-note">${t["pay-note"]}</span>
                            </div>
                            <div class="options-grid">
                                <div class="option-card" data-value="Cash"><i class="fas fa-money-bill-wave"></i><span>${t["buy-pay-cash"]}</span></div>
                                <div class="option-card" data-value="Zelle"><i class="fas fa-mobile-screen-button"></i><span>${t["buy-pay-zelle"]}</span></div>
                                <div class="option-card" data-value="Card"><i class="fas fa-credit-card"></i><span>${t["buy-pay-card"]}</span></div>
                                <div class="option-card" data-value="Check"><i class="fas fa-money-check-dollar"></i><span>${t["buy-pay-check"]}</span></div>
                            </div>
                        </div>

                        <!-- Step 6: Price Display (New Step) -->
                        <div class="buy-step" id="${mode}-step-price" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="payment-method"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-summary">${t["buy-summary"]}</h3>
                            <div class="summary-details price-preview-details">
                                <!-- JS will populate summary details here -->
                            </div>
                            


                            <button class="btn btn-primary next-btn-action" data-next="contact" style="width: 100%; margin-top: 20px;">${t["buy-btn-next"]}</button>
                        </div>

                        <!-- Step 7: Contact Info -->
                        <div class="buy-step" id="${mode}-step-contact" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="price"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="${mode}-step-contact">${mode === 'buy' ? t["buy-step7"] : t["rent-step-contact"]}</h3>
                            <div class="form-group" style="margin-top: 20px;">
                                <input type="text" id="${mode}-contact-name" placeholder="${t["form-name"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="email" id="${mode}-contact-email" placeholder="${t["form-email"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="tel" id="${mode}-contact-phone" placeholder="${t["form-phone"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <button class="btn btn-primary next-btn-action" data-next="summary" style="width: 100%;">${t["buy-btn-next"]}</button>
                            </div>
                        </div>

                        <!-- Steps for Rent (Original sequence or branch) -->
                        <div class="buy-step ${mode === 'rent' ? 'active' : ''}" id="${mode}-step-logistics-details" style="${mode === 'buy' ? 'display:none;' : ''}">
                            <button class="btn-back back-btn-action"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step5">${t["buy-step5"]}</h3>
                            <div id="${mode}-logistics-content">
                                <!-- JS will populate this -->
                            </div>
                        </div>

                        <!-- Original/Hidden steps that might be needed for Storage flow later -->
                        <div class="buy-step" id="${mode}-step-delivery-mode" style="display:none;">
                            <button class="btn-back back-btn-action"><i class="fas fa-arrow-left"></i> ${t["buy-back-home"]}</button>
                            <h3 data-i18n="buy-step4">${t["buy-step4"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="Delivery"><i class="fas fa-truck-fast"></i><span>${t["buy-opt-delivery"]}</span></div>
                                <div class="option-card" data-value="Pickup"><i class="fas fa-warehouse"></i><span>${t["buy-opt-pickup"]}</span></div>
                            </div>
                        </div>

                        <div class="buy-step" id="${mode}-step-qty" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="type"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step-qty">${t["buy-step-qty"]}</h3>
                            <div class="quantity-selector">
                                <button class="qty-btn minus"><i class="fas fa-minus"></i></button>
                                <input type="number" class="qty-input" value="1" min="1" max="99">
                                <button class="qty-btn plus"><i class="fas fa-plus"></i></button>
                            </div>
                            <button class="btn btn-primary next-btn-action" data-next="condition" style="width: 100%;">${t["buy-btn-next"]}</button>
                        </div>
                    </div>

                    <div id="${mode}-summary" style="display:none;" class="summary-view">
                        <button class="btn-back back-btn-action" data-prev="contact"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                        <h3 data-i18n="buy-summary">${t["buy-summary"]}</h3>
                        <div class="summary-details final-summary-details">
                            <!-- JS will populate final summary details here -->
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="btn btn-primary btn-get-pricing" style="flex: 1;" data-i18n="${mode}-btn-pricing">${btnPricing}</button>
                            <button class="btn btn-outline btn-restart-action" style="flex: 1; color: var(--primary-color); border-color: var(--primary-color);" data-i18n="buy-btn-restart">${t["buy-btn-restart"]}</button>
                        </div>
                    </div>
                    </div>
                </div>
            </main>`;

        // â”€â”€ Price Data: use Supabase dynamic prices if loaded, else fall back to hardcoded â”€â”€
        const USED_CONTAINER_PRICES = (DYNAMIC_PRICES && DYNAMIC_PRICES.usedPrices) ? DYNAMIC_PRICES.usedPrices : {
            "Savannah (31408)": { "20'": 1450, "40' STD": 1800, "40' HC": 1850, "45'": 2050 },
            "Atlanta (30288)": { "20'": 1800, "40' STD": 2100, "40' HC": 2150 },
            "Jacksonville (32218)": { "20'": 1800, "40' STD": 2050, "40' HC": 2100 },
            "Titusville (32780)": { "20'": 1900, "40' STD": 2150, "40' HC": 2200 },
            "Tampa (33619)": { "20'": 1800, "40' STD": 2150, "40' HC": 2200 },
            "Miami (33178)": { "20'": 1500, "40' STD": 1800, "40' HC": 1850, "45'": 2300 }
        };

        const NEW_CONTAINER_PRICES = (DYNAMIC_PRICES && DYNAMIC_PRICES.newPrices) ? DYNAMIC_PRICES.newPrices : {
            "Savannah (31408)": { "20'": 2650, "40' HC": 3650 },
            "Jacksonville (32218)": { "20'": 3150, "40' HC": 4150 },
            "Tampa (33619)": { "20'": 2950, "40' HC": 3950 },
            "Miami (33178)": { "20'": 2550, "40' HC": 3550 }
        };

        const REEFER_PRICES = (DYNAMIC_PRICES && DYNAMIC_PRICES.reeferPrices) ? DYNAMIC_PRICES.reeferPrices : {
            "Savannah (31408)": { "20'": 8200, "40' STD": 6700, "40' HC": 6700, "45'": 6700 },
            "Atlanta (30288)": { "20'": 8200, "40' STD": 6700, "40' HC": 6700 },
            "Jacksonville (32218)": { "20'": 8200, "40' STD": 6700, "40' HC": 6700 },
            "Titusville (32780)": { "20'": 8200, "40' STD": 6700, "40' HC": 6700 },
            "Tampa (33619)": { "20'": 8200, "40' STD": 6700, "40' HC": 6700 },
            "Miami (33178)": { "20'": 8200, "40' STD": 6700, "40' HC": 6700, "45'": 6700 }
        };

        const RENT_PRICES_USED = { "20'": 150, "40' STD": 225, "40' HC": 250, "45'": 300 };
        const RENT_PRICES_NEW  = { "20'": 250, "40' STD": 325, "40' HC": 350, "45'": 400 };

        const DEPOTS = (DYNAMIC_PRICES && DYNAMIC_PRICES.depots && DYNAMIC_PRICES.depots.length > 0)
            ? DYNAMIC_PRICES.depots
            : [
                { label: "Savannah (31408)",    zip: "31408" },
                { label: "Atlanta (30288)",      zip: "30288" },
                { label: "Jacksonville (32218)", zip: "32218" },
                { label: "Titusville (32780)",   zip: "32780" },
                { label: "Tampa (33619)",         zip: "33619" },
                { label: "Miami (33178)",         zip: "33178" }
            ];

        // Helper: returns all unique sizes that have at least one non-zero price
        const getAvailableSizes = (depotName = null, currentMode = 'buy') => {
            const allSizes = ["20'", "40' STD", "40' HC", "45'"];
            return allSizes.filter(size => {
                if (currentMode === 'rent') {
                    const hasRentUsed = (RENT_PRICES_USED[size] || 0) > 0;
                    const hasRentNew  = (RENT_PRICES_NEW[size]  || 0) > 0;
                    return hasRentUsed || hasRentNew;
                }
                
                const depotsToCheck = depotName ? [{label: depotName}] : DEPOTS;
                return depotsToCheck.some(d => {
                    const dl = d.label;
                    const hasUsed   = USED_CONTAINER_PRICES[dl]  && (USED_CONTAINER_PRICES[dl][size]  || 0) > 0;
                    const hasNew    = NEW_CONTAINER_PRICES[dl]   && (NEW_CONTAINER_PRICES[dl][size]   || 0) > 0;
                    const hasReefer = REEFER_PRICES[dl]          && (REEFER_PRICES[dl][size]          || 0) > 0;
                    return hasUsed || hasNew || hasReefer;
                });
            });
        };

        let SHIPPING_RATES = [
            { max: 30, price: 350 },
            { max: 60, price: 450 },
            { max: 80, price: 500 },
            { max: 100, price: 550 }
        ];
        let FLAT_RATE_OVER_100 = 5.5;

        if (typeof DYNAMIC_PRICES !== 'undefined' && DYNAMIC_PRICES && DYNAMIC_PRICES.deliveryRates) {
            const dr = DYNAMIC_PRICES.deliveryRates;
            SHIPPING_RATES = [
                { max: 30, price: dr["0-30"] !== undefined ? dr["0-30"] : 350 },
                { max: 60, price: dr["31-60"] !== undefined ? dr["31-60"] : 450 },
                { max: 80, price: dr["61-80"] !== undefined ? dr["61-80"] : 500 },
                { max: 100, price: dr["81-100"] !== undefined ? dr["81-100"] : 550 }
            ];
            if (dr["over 100"] !== undefined) FLAT_RATE_OVER_100 = dr["over 100"];
        }

        const PROMO_DISCOUNT = 0;

        const selections = { size: null, quantity: 1, condition: mode === 'rent' ? 'Local' : null, 'container-condition': null, type: mode === 'rent' ? 'Dry' : null, 'delivery-mode': mode === 'rent' ? 'Delivery' : null, 'logistics-details': null, 'payment-method': null, contact: {}, distance: 0, shippingCost: 0, pricePerUnit: 0, bestDepot: null, allDistances: {} };
        let steps = mode === 'buy' 
            ? ['condition'] 
            : ['logistics-details', 'size', 'qty', 'container-condition', 'type', 'payment-method', 'price', 'contact'];
        let currentIndex = 0;

        const calculateShippingCost = (miles) => {
            if (miles <= 100) {
                const rate = SHIPPING_RATES.find(r => miles <= r.max);
                return rate ? rate.price : SHIPPING_RATES[3].price;
            }
            return miles * FLAT_RATE_OVER_100;
        };

        const getCoordinates = async (zip) => {
            if (window.coordCache && window.coordCache[zip]) return window.coordCache[zip];
            const cleanZip = zip.replace(/\D/g, '').substring(0, 5); // Extract just the 5-digit zip
            
            try {
                // First try zippopotam.us (Fast, no strict rate limit)
                const zipResp = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
                if (zipResp.ok) {
                    const zipData = await zipResp.json();
                    if (zipData && zipData.places && zipData.places.length > 0) {
                        const coords = { lat: parseFloat(zipData.places[0].latitude), lon: parseFloat(zipData.places[0].longitude) };
                        if (!window.coordCache) window.coordCache = {};
                        window.coordCache[zip] = coords;
                        return coords;
                    }
                }
            } catch (e) { console.warn("Zippopotamus error:", e); }

            const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZip}&countrycodes=us`;
            try {
                const response = await fetch(url, { headers: { 'User-Agent': 'RPTulipan-Web/1.0' } });
                const data = await response.json();
                if (data && data.length > 0) {
                    const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
                    if (!window.coordCache) window.coordCache = {};
                    window.coordCache[zip] = coords;
                    return coords;
                }
                throw new Error('Coordinates not found for ' + zip);
            } catch (e) {
                console.error("Geocoding Error:", e);
                throw e;
            }
        };

        const getDistance = async (origin, destination) => {
            try {
                const originCoords = await getCoordinates(origin);
                const destCoords = await getCoordinates(destination);
                const url = `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`;
                const response = await fetch(url);
                const data = await response.json();
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    const distanceMeters = data.routes[0].distance;
                    return distanceMeters / 1609.344;
                }
                throw new Error('Could not calculate distance from OSRM');
            } catch (e) {
                console.error("Routing Error:", e);
                throw e;
            }
        };

        const getSelectedDepot = () => {
            return selections['logistics-details'] && selections['logistics-details'].includes('|') 
                ? selections['logistics-details'].split('|')[1].trim() 
                : selections['logistics-details'];
        };

        const updateSizeOptions = () => {
            const container = viewEl.querySelector(`#${mode}-size-options-container`);
            // Show sizes that have a price in the selected depot (or any depot if none selected)
            const availableSizes = getAvailableSizes(selections.bestDepot, mode);
            const sizeIcons  = { "20'": "fa-box", "40' STD": "fa-boxes", "40' HC": "fa-boxes", "45'": "fa-boxes" };
            const sizeLabels = { "20'": t["buy-opt-20"], "40' STD": t["buy-opt-40std"], "40' HC": t["buy-opt-40"], "45'": t["buy-opt-45"] };

            container.innerHTML = availableSizes.map(size => `
                <div class="option-card size-option" data-value="${size}">
                    <i class="fas ${sizeIcons[size]}"></i>
                    <span>${sizeLabels[size]}</span>
                </div>
            `).join('');

            container.querySelectorAll('.size-option').forEach(card => {
                card.addEventListener('click', () => {
                    selections.size = card.dataset.value;
                    container.querySelectorAll('.size-option').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    setTimeout(() => {
                        viewEl.querySelector(`#${mode}-step-size`).style.display = 'none';
                        currentIndex++;
                        const nextStep = steps[currentIndex];
                        prepareStep(nextStep);
                        const nextEl = viewEl.querySelector(`#${mode}-step-${nextStep}`);
                        nextEl.style.display = 'block';
                        nextEl.classList.add('fade-in');
                    }, 400);
                });
            });
        };

        const updateClimateOptions = () => {
            const container = viewEl.querySelector(`#${mode}-climate-options`);
            const size = selections.size;
            
            let html = '';
            let hasDry = false;
            let hasReefer = false;
            
            if (mode === 'rent') {
                hasDry = (RENT_PRICES_USED[size] || 0) > 0 || (RENT_PRICES_NEW[size] || 0) > 0;
                hasReefer = false;
            } else {
                const usedAvailable = DEPOTS.some(d => USED_CONTAINER_PRICES[d.label] && (USED_CONTAINER_PRICES[d.label][size] || 0) > 0);
                const newAvailable  = DEPOTS.some(d => NEW_CONTAINER_PRICES[d.label] && (NEW_CONTAINER_PRICES[d.label][size] || 0) > 0);
                const reeferAvailable = DEPOTS.some(d => REEFER_PRICES[d.label] && (REEFER_PRICES[d.label][size] || 0) > 0);
                
                hasDry = (usedAvailable || newAvailable);
                hasReefer = reeferAvailable;
            }
            
            if (hasDry) {
                html += `<div class="option-card" data-value="Dry"><i class="fas fa-wind"></i><span>${t["buy-opt-dry"]}</span></div>`;
            }
            if (hasReefer) {
                html += `<div class="option-card" data-value="Reefer"><i class="fas fa-snowflake"></i><span>${t["buy-opt-reefer"]}</span></div>`;
            }

            container.innerHTML = html;

            container.querySelectorAll('.option-card').forEach(card => {
                card.addEventListener('click', () => {
                    selections.type = card.dataset.value;
                    container.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    setTimeout(() => {
                        viewEl.querySelector(`#${mode}-step-type`).style.display = 'none';
                        currentIndex++;
                        const nextStep = steps[currentIndex];
                        prepareStep(nextStep);
                        const nextEl = viewEl.querySelector(`#${mode}-step-${nextStep}`);
                        nextEl.style.display = 'block';
                        nextEl.classList.add('fade-in');
                    }, 400);
                });
            });
        };

        const updateConditionOptions = (serviceType) => {
            const container = viewEl.querySelector(`#${mode}-cond-options`);
            const size = selections.size;
            
            let html = '';
            if (mode === 'rent') {
                const hasUsedRent = (RENT_PRICES_USED[size] || 0) > 0;
                const hasNewRent  = (RENT_PRICES_NEW[size] || 0) > 0;
                
                if (hasUsedRent) {
                    html += `<div class="option-card" data-value="Used"><i class="fas fa-check-circle"></i><span>${t["rent-opt-used"]}</span></div>`;
                }
                if (hasNewRent) {
                    html += `<div class="option-card" data-value="New"><i class="fas fa-star"></i><span>${t["rent-opt-new"]}</span></div>`;
                }
            } else {
                const hasUsedPrice = DEPOTS.some(d => USED_CONTAINER_PRICES[d.label] && (USED_CONTAINER_PRICES[d.label][size] || 0) > 0);
                const hasNewPrice  = DEPOTS.some(d => NEW_CONTAINER_PRICES[d.label] && (NEW_CONTAINER_PRICES[d.label][size] || 0) > 0);

                if (hasUsedPrice) {
                    if (serviceType === 'International') {
                        html += `<div class="option-card" data-value="CW"><i class="fas fa-check-circle"></i><span>${t["buy-opt-cw"]}</span></div>`;
                    } else {
                        // Storage (Local) shows both WWT and CW
                        html += `
                            <div class="option-card" data-value="WWT"><i class="fas fa-water"></i><span>${t["buy-opt-wwt"]}</span></div>
                            <div class="option-card" data-value="CW"><i class="fas fa-check-circle"></i><span>${t["buy-opt-cw"]}</span></div>
                        `;
                    }
                }

                if (hasNewPrice) {
                    html += `<div class="option-card" data-value="New"><i class="fas fa-star"></i><span>${t["buy-opt-new-cond"]}</span></div>`;
                }
            }
            container.innerHTML = html;
            
            container.querySelectorAll('.option-card').forEach(card => {
                card.addEventListener('click', () => {
                    selections['container-condition'] = card.dataset.value;
                    container.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    setTimeout(() => {
                        viewEl.querySelector(`#${mode}-step-container-condition`).style.display = 'none';
                        currentIndex++;
                        const nextStep = steps[currentIndex];
                        prepareStep(nextStep);
                        const nextEl = viewEl.querySelector(`#${mode}-step-${nextStep}`);
                        nextEl.style.display = 'block';
                        nextEl.classList.add('fade-in');
                    }, 400);
                });
            });
        };

        const updateLogisticsDetails = (modeType) => {
            const container = viewEl.querySelector(`#${mode}-logistics-content`);
            
            if (mode === 'buy') {
                document.body.classList.add('with-countdown');
            } else {
                document.body.classList.remove('with-countdown');
            }

            container.innerHTML = `
                <div class="form-group" style="margin-top: 20px;">

                    <input type="text" id="${mode}-zip-input" placeholder="${t["buy-zip-placeholder"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 25px;">
                    <button class="btn btn-primary" id="${mode}-btn-zip-next" style="width: 100%;" disabled>${t["buy-btn-next"]}</button>
                </div>
            `;

            const zipInput = viewEl.querySelector(`#${mode}-zip-input`);
            const nextBtn = viewEl.querySelector(`#${mode}-btn-zip-next`);

            zipInput.addEventListener('input', () => {
                nextBtn.disabled = !zipInput.value;
            });

            nextBtn.addEventListener('click', async () => {
                const zip = zipInput.value.trim();
                if (!zip || zip.length < 5) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Zip Code Inválido',
                        text: 'Por favor, ingrese un Zip Code válido de 5 dígitos.'
                    });
                    return;
                }
                
                selections.zip = zip;
                selections['logistics-details'] = `ZIP: ${zip}`;
                
                viewEl.querySelector(`#${mode}-step-logistics-details`).style.display = 'none';
                currentIndex++;
                const nextStep = steps[currentIndex];
                prepareStep(nextStep);
                const nextEl = viewEl.querySelector(`#${mode}-step-${nextStep}`);
                nextEl.style.display = 'block';
                nextEl.classList.add('fade-in');
            });
        };

        const renderSummaryDetails = async (container) => {
            container.innerHTML = '<div style="text-align:center; padding: 20px;"><div class="loader-ring" style="width: 30px; height: 30px; border: 4px solid #f3f3f3; border-top: 4px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div><p style="margin-top: 10px; color: #666;">Calculando ruta óptima y precios...</p></div>';
            
            let apiSize = "20std";
            if (selections.size.includes("40' STD")) apiSize = "40std";
            else if (selections.size.includes("40' HC") || selections.size.includes("40' High Cube")) apiSize = "40hc";
            else if (selections.size.includes("45'")) apiSize = "45hc";
            
            if (selections.type === 'Reefer') {
                apiSize = selections.size.includes("20") ? "20func" : "40func";
            }
            
            const isNew = selections['container-condition'] === 'New';
            const apiCondition = isNew ? "new" : "used";
            const isDelivery = selections['delivery-mode'] === 'Delivery';
            
            const apiPayload = {
                zip_destino: selections.zip,
                container_size: apiSize,
                condition: apiCondition,
                operation_mode: mode === 'rent' ? 'rent' : 'sale',
                options: {
                    export_certificate: selections.condition === 'International'
                }
            };
            
            try {
                const apiResp = await fetch('https://xtrceqpuwqetzslwxxux.supabase.co/functions/v1/calculate-quote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(apiPayload)
                });
                const data = await apiResp.json();
                
                if (data.error) throw new Error(data.error);

                selections.bestDepot = data.origin_hub;
                selections.distance = data.distance_miles;
                selections.pricePerUnit = data.container_price;
                
                const actualShipCost = isDelivery ? data.delivery_cost : 0;
                selections.shippingCost = actualShipCost;

                const baseSubtotal = data.container_price * selections.quantity;
                const exportFee = data.cert_fee || 0;
                const subtotal = baseSubtotal + exportFee;
                
                // API already returns roundtrip delivery cost for rent
                const shippingMultiplier = 1;
                const shippingTotal = actualShipCost * shippingMultiplier * selections.quantity;
                const totalBeforeDiscount = subtotal + shippingTotal;
                
                const discount = (mode === 'buy' ? PROMO_DISCOUNT : 0);
                const total = totalBeforeDiscount - discount;

                selections.subtotal = subtotal;
                selections.total = total;
                selections.discount = discount;
                selections.exportFee = exportFee;
                selections.shippingTotal = shippingTotal;

                let subtotalDetailText = '';
                if (selections.quantity > 1) {
                    subtotalDetailText = ` <small style="color: #666; font-weight: normal;">($${data.container_price.toLocaleString()} x ${selections.quantity}${exportFee > 0 ? ` + $${exportFee} export` : ''})</small>`;
                }

                let shippingDetailText = '';
                if (isDelivery) {
                    if (selections.quantity > 1) {
                        if (mode === 'rent') {
                            shippingDetailText = currentLang === 'en' 
                                ? `<div style="text-align: right; font-size: 0.85rem; color: #d90429; font-weight: 600; margin-top: 2px; width: 100%;"><i class="fas fa-info-circle"></i> Multiple containers: requires ${selections.quantity} delivery trips & ${selections.quantity} pickup trips (1 container per trip) at $${actualShipCost.toLocaleString()} per container.</div>`
                                : `<div style="text-align: right; font-size: 0.85rem; color: #d90429; font-weight: 600; margin-top: 2px; width: 100%;"><i class="fas fa-info-circle"></i> Múltiples contenedores: requiere ${selections.quantity} entregas y ${selections.quantity} retiros (1 contenedor por viaje) a $${actualShipCost.toLocaleString()} por contenedor.</div>`;
                        } else {
                            shippingDetailText = currentLang === 'en'
                                ? `<div style="text-align: right; font-size: 0.85rem; color: #d90429; font-weight: 600; margin-top: 2px; width: 100%;"><i class="fas fa-info-circle"></i> Multiple containers: requires ${selections.quantity} separate shipping trips (1 container per trip) at $${actualShipCost.toLocaleString()} each.</div>`
                                : `<div style="text-align: right; font-size: 0.85rem; color: #d90429; font-weight: 600; margin-top: 2px; width: 100%;"><i class="fas fa-info-circle"></i> Múltiples contenedores: requiere ${selections.quantity} viajes independientes (1 contenedor por viaje) a $${actualShipCost.toLocaleString()} c/u.</div>`;
                        }
                    } else {
                        if (mode === 'rent') {
                            shippingDetailText = `<small style="color: #666;">(${data.distance_miles.toFixed(1)} miles / ${currentLang === 'en' ? 'Delivery & Pickup' : 'Entrega y Recogida'})</small>`;
                        } else {
                            shippingDetailText = `<small style="color: #666;">(${data.distance_miles.toFixed(1)} miles)</small>`;
                        }
                    }
                }

                let html = `
                    <div class="summary-item"><strong>Logistics:</strong> <span>${selections['delivery-mode'] || '-'}</span></div>
                    ${selections['logistics-details'] ? `<div class="summary-item"><strong>Details:</strong> <span>${selections['logistics-details']}</span></div>` : ''}
                    <div class="summary-item"><strong>Size:</strong> <span>${selections.size}</span></div>
                    <div class="summary-item"><strong>${t["summary-quantity"] || 'Quantity'}:</strong> <span style="font-weight: 700; color: var(--primary-color);">${selections.quantity}</span></div>
                    <div class="summary-item"><strong>Type of Service:</strong> <span>${selections.condition || '-'}</span></div>
                    <div class="summary-item"><strong>Condition:</strong> <span>${selections['container-condition'] || '-'}</span></div>
                    <div class="summary-item"><strong>Climate:</strong> <span>${selections.type || 'Dry'}</span></div>
                    <div class="summary-item"><strong>Payment:</strong> <span>${selections['payment-method'] || '-'}</span></div>
                `;

                if (container.classList.contains('final-summary-details')) {
                    html += `<div class="summary-item"><strong>Contact:</strong> <span>${selections.contact.name || '-'}</span></div>`;
                }

                const deliveryIncludedText = isDelivery ? (currentLang === 'en' ? '(Delivery included)' : '(Envío incluido)') : '';
                
                html += `
                    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;">
                    <div class="summary-item total-line" style="font-size: 1.25rem; color: var(--primary-color); margin-top: 10px; align-items: flex-start;">
                        <strong>${t["buy-summary-total"]}:</strong> 
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="font-weight: 700;">$${Math.max(0, total).toLocaleString()}</span>
                            ${deliveryIncludedText ? `<small style="color: #888; font-size: 0.9rem; font-weight: normal; margin-top: 4px;">${deliveryIncludedText}</small>` : ''}
                        </div>
                    </div>
                `;

                const taxWarningMethods = ["Zelle", "Card", "Check"];
                if (taxWarningMethods.includes(selections['payment-method'])) {
                    html += `<div class="tax-notice" style="font-size: 0.85rem; color: #666; margin-top: 10px; font-style: italic; border-top: 1px dashed #ddd; padding-top: 10px;">${t["tax-warning"]}</div>`;
                }

                container.innerHTML = html;
            } catch (err) {
                console.error(err);
                container.innerHTML = `<div style="color: red; text-align: center;">Error: No se pudo calcular el precio. Verifica el código postal.</div>`;
            }
        };

        const showSummary = async () => {
            const finalContainer = viewEl.querySelector('.final-summary-details');
            if (finalContainer) {
                viewEl.querySelector('.summary-view').style.display = 'block';
                viewEl.querySelector('.summary-view').classList.add('fade-in');
                await renderSummaryDetails(finalContainer);
            }
            currentIndex = steps.length;
        };

        const showPricePreview = async () => {
            const previewContainer = viewEl.querySelector('.price-preview-details');
            if (previewContainer) await renderSummaryDetails(previewContainer);
        };

        const prepareStep = (stepId) => {
            const stepEl = viewEl.querySelector(`#${mode}-step-${stepId}`);
            if (stepEl) {
                const backBtn = stepEl.querySelector('.back-btn-action');
                if (backBtn) {
                    if (currentIndex > 0) {
                        backBtn.dataset.prev = steps[currentIndex - 1];
                    } else {
                        delete backBtn.dataset.prev;
                    }
                }
            }

            if (stepId === 'logistics-details') updateLogisticsDetails(selections['delivery-mode']);
            if (stepId === 'size') updateSizeOptions();
            if (stepId === 'type') updateClimateOptions();
            if (stepId === 'container-condition') updateConditionOptions(selections.condition);
            if (stepId === 'price') showPricePreview();
        };

        viewEl.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = viewEl.querySelector('.qty-input');
                let val = parseInt(input.value);
                if (btn.classList.contains('minus') && val > 1) val--;
                if (btn.classList.contains('plus') && val < 99) val++;
                input.value = val;
                selections.quantity = val;
            });
        });

        viewEl.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                const stepEl = card.closest('.buy-step');
                if (!stepEl) return;
                const stepId = stepEl.id.replace(`${mode}-step-`, '');
                if (stepId === 'logistics-details' || stepId === 'size') return; 

                selections[stepId] = card.dataset.value;
                card.parentNode.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');

                if (stepId === 'condition') {
                    if (card.dataset.value === 'International') {
                        steps = ['condition', 'logistics-details', 'size', 'qty', 'container-condition', 'type', 'payment-method', 'price', 'contact'];
                        selections['delivery-mode'] = 'Pickup';
                    } else {
                        // Storage sequence
                        steps = ['condition', 'delivery-mode', 'logistics-details', 'size', 'qty', 'container-condition', 'type', 'payment-method', 'price', 'contact'];
                    }
                }

                if (stepId === 'condition') {
                    updateConditionOptions(card.dataset.value);
                }
                if (stepId === 'delivery-mode') {
                    updateLogisticsDetails(card.dataset.value);
                }

                setTimeout(() => {
                    viewEl.querySelector(`#${mode}-step-${stepId}`).style.display = 'none';
                    currentIndex++;
                    if (currentIndex < steps.length) {
                        const nextStep = steps[currentIndex];
                        prepareStep(nextStep);
                        const nextEl = viewEl.querySelector(`#${mode}-step-${nextStep}`);
                        nextEl.style.display = 'block';
                        nextEl.classList.add('fade-in');
                    } else {
                        showSummary();
                    }
                }, 400);
            });
        });

        viewEl.querySelectorAll('.back-btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.dataset.prev) { showView('home'); return; }
                const prevStep = btn.dataset.prev;
                const currentStepEl = btn.closest('.buy-step') || viewEl.querySelector('.summary-view');
                currentStepEl.style.display = 'none';
                const prevEl = viewEl.querySelector(`#${mode}-step-${prevStep}`);
                prevEl.style.display = 'block';
                prevEl.classList.add('fade-in');
                currentIndex = steps.indexOf(prevStep);
                prepareStep(prevStep);
            });
        });
        
        viewEl.querySelector('.btn-get-pricing').addEventListener('click', (e) => {
            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = currentLang === 'en' ? 'Sending Request...' : 'Enviando Solicitud...';
            btn.disabled = true;

            const summary = `
ðŸ“¦ CONFIGURATION SUMMARY
---------------------------------
Logistics: ${selections['delivery-mode']}
Optimal Location: ${selections.bestDepot}
Details: ${selections['logistics-details']}
Distance: ${selections.distance.toFixed(1)} miles
Shipping Cost: $${selections.shippingCost}
Size: ${selections.size}
Quantity: ${selections.quantity}
Type of Service: ${selections.condition}
Condition: ${selections['container-condition']}
Climate: ${selections.type}
Payment: ${selections['payment-method']}

ðŸ’° PRICING DETAILS
---------------------------------
Unit Price: $${selections.pricePerUnit.toLocaleString()}
Subtotal${selections.exportFee > 0 ? ' (Includes Export Documents)' : ''}: $${selections.subtotal.toLocaleString()}
Shipping Total: $${selections.shippingTotal.toLocaleString()}
${selections.discount > 0 ? `Promo Discount: -$${selections.discount}\n` : ''}TOTAL PRICE: $${selections.total.toLocaleString()}

ðŸ‘¤ CONTACT INFORMATION
---------------------------------
Name: ${selections.contact.name}
Email: ${selections.contact.email}
Phone: ${selections.contact.phone}
            `.trim();

            const templateParams = {
                name: selections.contact.name,
                email: selections.contact.email,
                phone_number: selections.contact.phone,
                service: mode === 'buy' ? 'Container Purchase' : 'Container Rental',
                message: summary,
                title: mode === 'buy' ? 'New Purchase Request' : 'New Rental Request'
            };

            // Background task: burn promo code if used
            if (selections.validPromoCode) {
                fetch(`${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${selections.validPromoCode.code}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({ is_used: true })
                }).catch(e => console.error('Failed to burn promo code', e));
            }

            // Background task: activate the promo code they just won
            if (selections.generatedPromoCode) {
                fetch(`${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${selections.generatedPromoCode}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({ is_active: true })
                }).catch(e => console.error('Failed to activate promo code', e));
            }

            if (typeof emailjs !== 'undefined') {
                // Send to Supabase (Safe call)
                sendLeadToSupabase({
                    name: templateParams.name,
                    phone: templateParams.phone_number,
                    service: templateParams.service,
                    message: templateParams.message
                }).catch(e => console.error("DB Error:", e));
                emailjs.send('service_pfwtd14', 'template_0xc7f3i', templateParams)
                    .then(() => {
                        btn.innerText = currentLang === 'en' ? 'Request Sent!' : 'Solicitud Enviada!';
                        btn.style.backgroundColor = '#2ecc71';
                        setTimeout(() => {
                            btn.innerText = originalText;
                            btn.style.backgroundColor = 'var(--primary-color)';
                            btn.disabled = false;
                            showView('home');
                        }, 3000);
                    })
                    .catch((err) => {
                        console.error('EmailJS Error:', err);
                        btn.innerText = 'Error';
                        btn.disabled = false;
                    });
            } else {
                alert('Email service error. Please contact us directly.');
                btn.disabled = false;
            }
        });

        viewEl.querySelectorAll('.next-btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const nextStep = btn.dataset.next;
                if (nextStep === 'summary') {
                    selections.contact = {
                        name: viewEl.querySelector(`#${mode}-contact-name`).value,
                        email: viewEl.querySelector(`#${mode}-contact-email`).value,
                        phone: viewEl.querySelector(`#${mode}-contact-phone`).value
                    };
                    if (!selections.contact.name || !selections.contact.email) {
                        alert(currentLang === 'en' ? 'Please fill name and email' : 'Por favor ingrese nombre y email');
                        return;
                    }
                    viewEl.querySelector(`#${mode}-step-contact`).style.display = 'none';
                    showSummary();
                    return;
                }
                
                const stepEl = btn.closest('.buy-step');
                const stepId = stepEl.id.replace(`${mode}-step-`, '');
                stepEl.style.display = 'none';
                currentIndex++;
                const nextStepName = steps[currentIndex];
                prepareStep(nextStepName);
                const nextEl = viewEl.querySelector(`#${mode}-step-${nextStepName}`);
                nextEl.style.display = 'block';
                nextEl.classList.add('fade-in');
            });
        });

        viewEl.querySelector('.btn-restart-action').addEventListener('click', () => renderConfigurationView(viewId, mode));
        if (mode === 'rent') updateLogisticsDetails('Delivery');
        document.title = (mode === 'buy' ? t["service-sales-h3"] : t["service-rent-h3"]) + " | RP Tulipan Logistics";
    }

    // --- Global Logistics Helpers for Trans/Crane ---
    const getGlobalDepots = () => {
        if (typeof DYNAMIC_PRICES !== 'undefined' && DYNAMIC_PRICES && DYNAMIC_PRICES.depots && DYNAMIC_PRICES.depots.length > 0) {
            return DYNAMIC_PRICES.depots;
        }
        return [
            { label: "Savannah (31408)",    zip: "31408" },
            { label: "Atlanta (30288)",      zip: "30288" },
            { label: "Jacksonville (32218)", zip: "32218" },
            { label: "Titusville (32780)",   zip: "32780" },
            { label: "Tampa (33619)",         zip: "33619" },
            { label: "Miami (33178)",         zip: "33178" }
        ];
    };

    const globalCalculateShippingCost = (miles) => {
        let rates = [
            { max: 30, price: 350 },
            { max: 60, price: 450 },
            { max: 80, price: 500 },
            { max: 100, price: 550 }
        ];
        let flatRate = 5.5;
        if (typeof DYNAMIC_PRICES !== 'undefined' && DYNAMIC_PRICES && DYNAMIC_PRICES.deliveryRates) {
            const dr = DYNAMIC_PRICES.deliveryRates;
            rates = [
                { max: 30, price: dr["0-30"] !== undefined ? dr["0-30"] : 350 },
                { max: 60, price: dr["31-60"] !== undefined ? dr["31-60"] : 450 },
                { max: 80, price: dr["61-80"] !== undefined ? dr["61-80"] : 500 },
                { max: 100, price: dr["81-100"] !== undefined ? dr["81-100"] : 550 }
            ];
            if (dr["over 100"] !== undefined) flatRate = dr["over 100"];
        }
        
        if (miles <= 100) {
            const rate = rates.find(r => miles <= r.max);
            return rate ? rate.price : rates[3].price;
        }
        return miles * flatRate;
    };

    const globalGetCoordinates = async (zip) => {
        if (window.coordCache && window.coordCache[zip]) return window.coordCache[zip];
        const cleanZip = zip.replace(/\D/g, '').substring(0, 5);
        const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZip}&countrycodes=us`;
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'RPTulipan-Web/1.0' } });
            const data = await response.json();
            if (data && data.length > 0) {
                const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
                if (!window.coordCache) window.coordCache = {};
                window.coordCache[zip] = coords;
                return coords;
            }
            throw new Error('Coordinates not found for ' + zip);
        } catch (e) {
            console.error("Geocoding Error:", e);
            throw e;
        }
    };

    const globalGetDistance = async (origin, destination) => {
        try {
            const originCoords = await globalGetCoordinates(origin);
            const destCoords = await globalGetCoordinates(destination);
            const url = `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const distanceMeters = data.routes[0].distance;
                return distanceMeters / 1609.344;
            }
            throw new Error('Could not calculate distance from OSRM');
        } catch (e) {
            console.error("Routing Error:", e);
            throw e;
        }
    };

    const globalGetRouteGeometry = async (origin, destination) => {
        try {
            const originCoords = await globalGetCoordinates(origin);
            const destCoords = await globalGetCoordinates(destination);
            const url = `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=full&geometries=geojson`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                return data.routes[0].geometry;
            }
            return null;
        } catch (e) {
            console.error("Routing Geometry Error:", e);
            return null;
        }
    };
    // ----------------------------------------------

    function renderTransView() {
        const transView = document.getElementById('trans-view');
        const t = translations[currentLang];
        transView.innerHTML = `
            <header class="buy-header">
                <div class="container">
                    <h1 data-i18n="trans-h1">${t["trans-h1"]}</h1>
                    <p data-i18n="buy-p">${t["buy-p"]}</p>
                </div>
            </header>
            <div class="container" style="margin-top: 20px;">
                <div style="background: var(--primary-color); color: #fff; padding: 15px; border-radius: 10px; text-align: center; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 5px;" data-i18n="exact-quote-text">${t["exact-quote-text"] || "For an exact quote please contact:"}</p>
                    <a href="tel:7867684409" style="font-size: 2.2rem; font-weight: 800; color: #fff; text-decoration: none; display: block;">786-768-4409</a>
                </div>
            </div>
            <main class="container">
                <div class="buy-container">
                    <div id="trans-steps">
                        <!-- Step 1: Size -->
                        <div class="buy-step active" id="trans-step-size">
                            <button class="btn-back back-btn-action"><i class="fas fa-arrow-left"></i> ${t["buy-back-home"]}</button>
                            <h3 data-i18n="trans-step1">${t["trans-step1"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="20'"><i class="fas fa-box"></i><span>${t["buy-opt-20"]}</span></div>
                                <div class="option-card" data-value="40' STD"><i class="fas fa-boxes"></i><span>${t["buy-opt-40std"]}</span></div>
                                <div class="option-card" data-value="40' HC"><i class="fas fa-boxes"></i><span>${t["buy-opt-40"]}</span></div>
                                <div class="option-card" data-value="45'"><i class="fas fa-boxes"></i><span>${t["buy-opt-45"]}</span></div>
                            </div>
                        </div>
                        <!-- Step 1.5: Quantity -->
                        <div class="buy-step" id="trans-step-qty" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="size"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step-qty">${t["buy-step-qty"] || "Select Quantity"}</h3>
                            <div class="quantity-selector">
                                <button class="qty-btn minus"><i class="fas fa-minus"></i></button>
                                <input type="number" class="qty-input trans-qty-input" value="1" min="1" max="99" readonly>
                                <button class="qty-btn plus"><i class="fas fa-plus"></i></button>
                            </div>
                            <div style="text-align: center; margin-top: 20px;">
                                <button class="btn btn-primary btn-submit-qty" style="width: 100%;">${t["buy-btn-next"] || "Next"}</button>
                            </div>
                        </div>
                        <!-- Step 2: Status -->
                        <div class="buy-step" id="trans-step-status" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="qty"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step2">${t["trans-step2"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="Empty"><i class="fas fa-cube"></i><span>${t["trans-opt-empty"]}</span></div>
                                <div class="option-card" data-value="Full"><i class="fas fa-cubes"></i><span>${t["trans-opt-full"]}</span></div>
                            </div>
                        </div>
                        <!-- Step 3: Zip Codes -->
                        <div class="buy-step" id="trans-step-route" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="status"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step3">${t["trans-step3"]}</h3>
                            <div class="form-group" style="margin-top: 20px;">
                                <input type="text" id="zip-pickup" placeholder="${t["trans-zip-pickup"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="text" id="zip-delivery" placeholder="${t["trans-zip-delivery"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
                                <button class="btn btn-primary" id="btn-submit-route" style="width: 100%; margin-top: 20px;">Next</button>
                            </div>
                        </div>
                        <!-- Step 4: Contact Info -->
                        <div class="buy-step" id="trans-step-contact" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="route"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step-contact">${t["trans-step-contact"]}</h3>
                            <div class="form-group" style="margin-top: 20px;">
                                <div id="trans-contact-prices" style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #eee; text-align: left;">
                                    <div id="trans-vehicle-info-contact" style="text-align: center; margin-bottom: 15px; display: none;">
                                        <img id="trans-vehicle-img-contact" src="" alt="Vehicle" style="max-width: 100%; max-height: 150px; border-radius: 8px; object-fit: cover;">
                                        <p id="trans-vehicle-name-contact" style="margin-top: 10px; font-weight: 600; color: #333;"></p>
                                    </div>
                                    <p style="margin-bottom: 2px; color: #333; font-size: 1.1rem;"><strong>${currentLang === 'en' ? 'Estimated Price (Flexible Date)' : 'Mejor Precio (fecha flexible)'}:</strong> $<span class="contact-price-flexible">0.00</span></p>
                                    <p style="font-size: 0.85rem; color: #666; margin-bottom: 15px;"><em>${currentLang === 'en' ? '(Only charges from pickup to delivery)' : '(Solo pagas el trayecto desde la recogida hasta la entrega)'}</em></p>
                                    <p style="margin-bottom: 2px; color: #333; font-size: 1.1rem;"><strong>${currentLang === 'en' ? 'Estimated Price (Immediate)' : 'Servicio Inmediato'}:</strong> $<span class="contact-price-immediate">0.00</span></p>
                                    <p style="font-size: 0.85rem; color: #666; margin-bottom: 0;"><em>${currentLang === 'en' ? '(Includes empty trip from our depot to pickup)' : '(Incluye el envío del equipo vacío desde nuestro depósito a la recogida)'}</em></p>
                                </div>
                                <input type="text" id="trans-contact-name" placeholder="${t["form-name"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="email" id="trans-contact-email" placeholder="${t["form-email"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="tel" id="trans-contact-phone" placeholder="${t["form-phone"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <button class="btn btn-primary" id="btn-submit-contact" style="width: 100%;">${t["buy-btn-next"]}</button>
                            </div>
                        </div>
                    </div>
                    <div id="trans-summary" style="display:none;" class="summary-view">
                        <button class="btn-back back-btn-action" data-prev="contact"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                        <h3 data-i18n="buy-summary">${t["buy-summary"]}</h3>
                        <div class="summary-details">
                            <div id="trans-vehicle-info-summary" style="text-align: center; margin-bottom: 15px; display: none;">
                                <img id="trans-vehicle-img-summary" src="" alt="Vehicle" style="max-width: 100%; max-height: 150px; border-radius: 8px; object-fit: cover;">
                                <p id="trans-vehicle-name-summary" style="margin-top: 10px; font-weight: 600; color: #333;"></p>
                            </div>
                            <p><strong>Size:</strong> <span class="summary-size">-</span></p>
                            <p><strong>${t["summary-quantity"] || "Quantity"}:</strong> <span class="summary-quantity">-</span></p>
                            <p><strong>${t["summary-status"]}:</strong> <span class="summary-status">-</span></p>
                            <p><strong>${t["summary-route"]}:</strong> <span class="summary-route">-</span></p>
                            <p><strong>${t["summary-contact"]}:</strong> <span class="summary-contact">-</span></p>
                            <hr style="border-color: #eee; margin: 10px 0;">
                            <p style="margin-bottom: 2px;"><strong>${currentLang === 'en' ? 'Estimated Price (Flexible Date)' : 'Mejor Precio (fecha flexible)'}:</strong> $<span class="summary-price-flexible">0.00</span></p>
                            <p style="font-size: 0.85rem; color: #666; margin-bottom: 10px;"><em>${currentLang === 'en' ? '(Only charges from pickup to delivery)' : '(Solo pagas el trayecto desde la recogida hasta la entrega)'}</em></p>
                            <p style="margin-bottom: 2px;"><strong>${currentLang === 'en' ? 'Estimated Price (Immediate)' : 'Servicio Inmediato'}:</strong> $<span class="summary-price-immediate">0.00</span></p>
                            <p style="font-size: 0.85rem; color: #666; margin-bottom: 0;"><em>${currentLang === 'en' ? '(Includes empty trip from our depot to pickup)' : '(Incluye el envío del equipo vacío desde nuestro depósito a la recogida)'}</em></p>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="btn btn-primary btn-get-pricing" style="flex: 1;" data-i18n="trans-btn-pricing">${t["trans-btn-pricing"]}</button>
                            <button class="btn btn-outline btn-restart-action" style="flex: 1; color: var(--primary-color); border-color: var(--primary-color);" data-i18n="buy-btn-restart">${t["buy-btn-restart"]}</button>
                        </div>
                    </div>
                </div>
                <div id="trans-route-map-container" style="display: none; height: 350px; margin-top: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 2px solid var(--primary-color); z-index: 1; margin-bottom: 20px;"></div>
            </main>
        `;

        const selections = { size: null, quantity: 1, status: null, pickup: '', delivery: '', contact: {} };
        const steps = ['size', 'qty', 'status', 'route', 'contact'];
        let currentIndex = 0;

        transView.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = transView.querySelector('.trans-qty-input');
                let val = parseInt(input.value);
                if (btn.classList.contains('minus') && val > 1) val--;
                if (btn.classList.contains('plus') && val < 99) val++;
                input.value = val;
                selections.quantity = val;
            });
        });

        transView.querySelector('.btn-submit-qty').addEventListener('click', () => {
            transView.querySelector('#trans-step-qty').style.display = 'none';
            currentIndex++;
            const nextStep = steps[currentIndex];
            const nextEl = transView.querySelector(`#trans-step-${nextStep}`);
            nextEl.style.display = 'block';
            nextEl.classList.add('fade-in');
        });

        transView.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                const stepId = card.closest('.buy-step').id.split('-').pop();
                selections[stepId] = card.dataset.value;
                card.parentNode.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                setTimeout(() => {
                    transView.querySelector(`#trans-step-${stepId}`).style.display = 'none';
                    currentIndex++;
                    const nextStep = steps[currentIndex];
                    const nextEl = transView.querySelector(`#trans-step-${nextStep}`);
                    nextEl.style.display = 'block';
                    nextEl.classList.add('fade-in');
                }, 400);
            });
        });

        transView.querySelector('#btn-submit-route').addEventListener('click', async (e) => {
            selections.pickup = transView.querySelector('#zip-pickup').value;
            selections.delivery = transView.querySelector('#zip-delivery').value;
            if (!selections.pickup || !selections.delivery) {
                alert(currentLang === 'en' ? 'Please enter both zip codes' : 'Por favor ingrese ambos cÃ³digos postales');
                return;
            }

            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = currentLang === 'en' ? 'Calculating...' : 'Calculando...';
            btn.disabled = true;

            try {
                const apiPayload = {
                    zip_origen: selections.pickup,
                    zip_destino: selections.delivery,
                    operation_mode: 'transport_only',
                    container_size: selections.size === "20'" ? "20std" : "40std",
                    options: {
                        extra_service: false,
                        crane_service: selections.status === 'Full'
                    }
                };
                
                const apiResp = await fetch('https://xtrceqpuwqetzslwxxux.supabase.co/functions/v1/calculate-quote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(apiPayload)
                });
                const data = await apiResp.json();
                
                if (data.error) throw new Error(data.error);

                const closestDepotZip = data.closest_yard_zip || "33178";
                const costDirect = data.total_price;
                const costImmediate = data.immediate_price || costDirect;
                
                let multiplier = selections.quantity;
                if (selections.size === "20'") {
                    multiplier = Math.ceil(selections.quantity / 2);
                }
                
                let extraStatusCost = 0;
                if (selections.status === 'Empty') {
                    if (selections.size === "20'" && selections.quantity === 2) {
                        extraStatusCost = 100 * selections.quantity;
                    } else {
                        extraStatusCost = 150 * selections.quantity;
                    }
                }
                // Note: If 'Full', the $800 crane service fee is already included natively in costDirect and costImmediate by the backend API.
                
                selections.priceFlexible = (costDirect * multiplier) + extraStatusCost;
                selections.priceImmediate = (costImmediate * multiplier) + extraStatusCost;
                
                transView.querySelector('.contact-price-flexible').textContent = selections.priceFlexible.toFixed(2);
                transView.querySelector('.contact-price-immediate').textContent = selections.priceImmediate.toFixed(2);
                
                const vehicleImgContact = transView.querySelector('#trans-vehicle-img-contact');
                const vehicleNameContact = transView.querySelector('#trans-vehicle-name-contact');
                const vehicleInfoContact = transView.querySelector('#trans-vehicle-info-contact');
                
                if (selections.status === 'Empty') {
                    vehicleImgContact.src = 'assets/transport.png';
                    vehicleNameContact.innerText = currentLang === 'en' ? 'Pick up truck with tilt trailer' : 'Camioneta Pick-up con Tráiler Inclinable';
                    vehicleInfoContact.style.display = 'block';
                } else if (selections.status === 'Full') {
                    vehicleImgContact.src = 'assets/crane.png';
                    vehicleNameContact.innerText = currentLang === 'en' ? 'Side Loader Crane' : 'Grúa Side Loader';
                    vehicleInfoContact.style.display = 'block';
                } else {
                    vehicleInfoContact.style.display = 'none';
                }
                
                btn.innerText = originalText;
                btn.disabled = false;
                
                transView.querySelector('#trans-step-route').style.display = 'none';
                currentIndex++;
                const nextStep = steps[currentIndex];
                const nextEl = transView.querySelector(`#trans-step-${nextStep}`);
                nextEl.style.display = 'block';
                nextEl.classList.add('fade-in');
                
                // Map Rendering
                setTimeout(async () => {
                    const mapContainer = document.getElementById('trans-route-map-container');
                    if (mapContainer && typeof L !== 'undefined') {
                        mapContainer.style.display = 'block';
                        
                        if (window.transRouteMap) {
                            window.transRouteMap.remove();
                        }
                        
                        window.transRouteMap = L.map('trans-route-map-container');
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '© OpenStreetMap contributors'
                        }).addTo(window.transRouteMap);
                        
                        try {
                            const depotCoords = await globalGetCoordinates(closestDepotZip);
                            const pickupCoords = await globalGetCoordinates(selections.pickup);
                            const deliveryCoords = await globalGetCoordinates(selections.delivery);
                            
                            const depotIcon = L.divIcon({ html: '<i class="fas fa-warehouse" style="color: blue; font-size: 24px;"></i>', className: '', iconSize: [24, 24], iconAnchor: [12, 24] });
                            const pickupIcon = L.divIcon({ html: '<i class="fas fa-box" style="color: orange; font-size: 24px;"></i>', className: '', iconSize: [24, 24], iconAnchor: [12, 24] });
                            const deliveryIcon = L.divIcon({ html: '<i class="fas fa-map-marker-alt" style="color: red; font-size: 24px;"></i>', className: '', iconSize: [24, 24], iconAnchor: [12, 24] });
                            
                            const depotMarker = L.marker([depotCoords.lat, depotCoords.lon], {icon: depotIcon}).bindPopup('<b>Depot:</b> ' + closestDepotZip).addTo(window.transRouteMap);
                            const pickupMarker = L.marker([pickupCoords.lat, pickupCoords.lon], {icon: pickupIcon}).bindPopup('<b>Pickup:</b> ' + selections.pickup).addTo(window.transRouteMap);
                            const deliveryMarker = L.marker([deliveryCoords.lat, deliveryCoords.lon], {icon: deliveryIcon}).bindPopup('<b>Delivery:</b> ' + selections.delivery).addTo(window.transRouteMap);
                            
                            // Draw routes
                            const depotToPickupRoute = await globalGetRouteGeometry(closestDepotZip, selections.pickup);
                            if (depotToPickupRoute) {
                                L.geoJSON(depotToPickupRoute, { style: { color: 'blue', weight: 4, opacity: 0.7, dashArray: '5, 10' } }).addTo(window.transRouteMap);
                            }
                            
                            const pickupToDeliveryRoute = await globalGetRouteGeometry(selections.pickup, selections.delivery);
                            if (pickupToDeliveryRoute) {
                                L.geoJSON(pickupToDeliveryRoute, { style: { color: 'red', weight: 5, opacity: 0.9 } }).addTo(window.transRouteMap);
                            }
                            
                            // Fit bounds to show all markers
                            const group = new L.featureGroup([depotMarker, pickupMarker, deliveryMarker]);
                            window.transRouteMap.fitBounds(group.getBounds(), { padding: [30, 30] });
                            window.transRouteMap.invalidateSize();
                            
                        } catch (e) {
                            console.error("Map Drawing Error:", e);
                        }
                    }
                }, 100);

            } catch (error) {
                console.error("Distance Calculation Error:", error);
                alert(currentLang === 'en' ? 'Error calculating distance. Please check the zip codes and try again.' : 'Error calculando distancia. Revise los cÃ³digos postales e intente de nuevo.');
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });

        transView.querySelector('#btn-submit-contact').addEventListener('click', () => {
            try {
                selections.contact = {
                    name: transView.querySelector('#trans-contact-name').value,
                    email: transView.querySelector('#trans-contact-email').value,
                    phone: transView.querySelector('#trans-contact-phone').value
                };
                if (!selections.contact.name || !selections.contact.email) {
                    alert(currentLang === 'en' ? 'Please fill name and email' : 'Por favor ingrese nombre y email');
                    return;
                }
                transView.querySelector('#trans-step-contact').style.display = 'none';
                transView.querySelector('.summary-size').textContent = selections.size || '-';
                transView.querySelector('.summary-quantity').textContent = selections.quantity || '-';
                transView.querySelector('.summary-status').textContent = selections.status || '-';
                transView.querySelector('.summary-route').textContent = `${selections.pickup} ➔ ${selections.delivery}`;
                transView.querySelector('.summary-contact').textContent = `${selections.contact.name} (${selections.contact.email}) - ${selections.contact.phone}`;
                if (selections.priceFlexible !== undefined && selections.priceImmediate !== undefined) {
                    transView.querySelector('.summary-price-flexible').textContent = selections.priceFlexible.toFixed(2);
                    transView.querySelector('.summary-price-immediate').textContent = selections.priceImmediate.toFixed(2);
                }
                
                const vehicleImgSummary = transView.querySelector('#trans-vehicle-img-summary');
                const vehicleNameSummary = transView.querySelector('#trans-vehicle-name-summary');
                const vehicleInfoSummary = transView.querySelector('#trans-vehicle-info-summary');
                
                if (selections.status === 'Empty') {
                    vehicleImgSummary.src = 'assets/transport.png';
                    vehicleNameSummary.innerText = currentLang === 'en' ? 'Pick up truck with tilt trailer' : 'Camioneta Pick-up con Tráiler Inclinable';
                    vehicleInfoSummary.style.display = 'block';
                } else if (selections.status === 'Full') {
                    vehicleImgSummary.src = 'assets/crane.png';
                    vehicleNameSummary.innerText = currentLang === 'en' ? 'Side Loader Crane' : 'Grúa Side Loader';
                    vehicleInfoSummary.style.display = 'block';
                } else {
                    vehicleInfoSummary.style.display = 'none';
                }
                
                transView.querySelector('#trans-summary').style.display = 'block';
                transView.querySelector('#trans-summary').classList.add('fade-in');
            } catch (err) {
                alert("Debug Error: " + err.message + "\nLine: " + err.lineNumber);
                console.error(err);
            }
        });

        transView.querySelectorAll('.back-btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.dataset.prev) { showView('home'); return; }
                const prevStep = btn.dataset.prev;
                const currentStepEl = btn.closest('.buy-step') || transView.querySelector('#trans-summary');
                currentStepEl.style.display = 'none';
                const prevEl = transView.querySelector(`#trans-step-${prevStep}`);
                prevEl.style.display = 'block';
                prevEl.classList.add('fade-in');
                currentIndex = steps.indexOf(prevStep);
            });
        });

        transView.querySelector('.btn-restart-action').addEventListener('click', () => renderTransView());

        transView.querySelector('.btn-get-pricing').addEventListener('click', (e) => {
            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = currentLang === 'en' ? 'Sending Request...' : 'Enviando Solicitud...';
            btn.disabled = true;

            const summary = `
ðŸš› TRANSPORTATION QUOTE REQUEST
---------------------------------
Size: ${selections.size}
Quantity: ${selections.quantity}
Status: ${selections.status}
Route: ${selections.pickup} ➔ ${selections.delivery}
Est. Price (Flexible): $${selections.priceFlexible ? selections.priceFlexible.toFixed(2) : '0.00'}
Est. Price (Immediate): $${selections.priceImmediate ? selections.priceImmediate.toFixed(2) : '0.00'}

ðŸ‘¤ CONTACT INFORMATION
---------------------------------
Name: ${selections.contact.name}
Email: ${selections.contact.email}
Phone: ${selections.contact.phone}
            `.trim();

            const templateParams = {
                name: selections.contact.name,
                email: selections.contact.email,
                phone_number: selections.contact.phone,
                service: 'Transportation Quote',
                message: summary,
                title: 'New Transportation Quote Request'
            };

            if (typeof emailjs !== 'undefined') {
                // Send to Supabase (Safe call)
                sendLeadToSupabase({
                    name: templateParams.name,
                    phone: templateParams.phone_number,
                    service: templateParams.service,
                    message: templateParams.message
                }).catch(e => console.error("DB Error:", e));
                emailjs.send('service_pfwtd14', 'template_0xc7f3i', templateParams)
                    .then(() => {
                        btn.innerText = currentLang === 'en' ? 'Request Sent!' : 'Solicitud Enviada!';
                        btn.style.backgroundColor = '#2ecc71';
                        setTimeout(() => {
                            btn.innerText = originalText;
                            btn.style.backgroundColor = 'var(--primary-color)';
                            btn.disabled = false;
                            showView('home');
                        }, 3000);
                    })
                    .catch((err) => {
                        console.error('EmailJS Error:', err);
                        btn.innerText = 'Error';
                        btn.disabled = false;
                    });
            } else {
                alert('Email service error. Please contact us directly.');
                btn.disabled = false;
            }
        });

        document.title = t["service-trans-h3"] + " | RP Tulipan Logistics";
    }

    function renderCraneView() {
        const craneView = document.getElementById('crane-view');
        const t = translations[currentLang];
        craneView.innerHTML = `
            <header class="buy-header">
                <div class="container">
                    <h1 data-i18n="crane-h1">${t["crane-h1"]}</h1>
                    <p data-i18n="buy-p">${t["buy-p"]}</p>
                </div>
            </header>
            <div class="container" style="margin-top: 20px;">
                <div style="background: var(--primary-color); color: #fff; padding: 15px; border-radius: 10px; text-align: center; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 5px;" data-i18n="exact-quote-text">${t["exact-quote-text"] || "For an exact quote please contact:"}</p>
                    <a href="tel:7867684409" style="font-size: 2.2rem; font-weight: 800; color: #fff; text-decoration: none; display: block;">786-768-4409</a>
                </div>
            </div>
            <main class="container">
                <div class="buy-container">
                    <div id="crane-steps">
                        <!-- Step 1: Size -->
                        <div class="buy-step active" id="crane-step-size">
                            <button class="btn-back back-btn-action"><i class="fas fa-arrow-left"></i> ${t["buy-back-home"]}</button>
                            <h3 data-i18n="trans-step1">${t["trans-step1"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="20'"><i class="fas fa-box"></i><span>${t["buy-opt-20"]}</span></div>
                                <div class="option-card" data-value="40' STD"><i class="fas fa-boxes"></i><span>${t["buy-opt-40std"]}</span></div>
                                <div class="option-card" data-value="40' HC"><i class="fas fa-boxes"></i><span>${t["buy-opt-40"]}</span></div>
                                <div class="option-card" data-value="45'"><i class="fas fa-boxes"></i><span>${t["buy-opt-45"]}</span></div>
                            </div>
                        </div>
                        <!-- Step 1.5: Quantity -->
                        <div class="buy-step" id="crane-step-qty" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="size"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step-qty">${t["buy-step-qty"] || "Select Quantity"}</h3>
                            <div class="quantity-selector">
                                <button class="qty-btn minus"><i class="fas fa-minus"></i></button>
                                <input type="number" class="qty-input crane-qty-input" value="1" min="1" max="99" readonly>
                                <button class="qty-btn plus"><i class="fas fa-plus"></i></button>
                            </div>
                            <div style="text-align: center; margin-top: 20px;">
                                <button class="btn btn-primary btn-submit-qty" style="width: 100%;">${t["buy-btn-next"] || "Next"}</button>
                            </div>
                        </div>
                        <!-- Step 2: Status -->
                        <div class="buy-step" id="crane-step-status" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="qty"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step2">${t["trans-step2"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="Empty"><i class="fas fa-cube"></i><span>${t["trans-opt-empty"]}</span></div>
                                <div class="option-card" data-value="Full"><i class="fas fa-cubes"></i><span>${t["trans-opt-full"]}</span></div>
                            </div>
                        </div>
                        <!-- Step 3: Zip Codes -->
                        <div class="buy-step" id="crane-step-route" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="status"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step3">${t["trans-step3"]}</h3>
                            <div class="form-group" style="margin-top: 20px;">
                                <input type="text" id="crane-zip-pickup" placeholder="${t["trans-zip-pickup"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="text" id="crane-zip-delivery" placeholder="${t["trans-zip-delivery"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
                                <button class="btn btn-primary" id="crane-btn-submit-route" style="width: 100%; margin-top: 20px;">Next</button>
                            </div>
                        </div>
                        <!-- Step 4: Contact Info -->
                        <div class="buy-step" id="crane-step-contact" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="route"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step-contact">${t["trans-step-contact"]}</h3>
                            <div class="form-group" style="margin-top: 20px;">
                                <div id="crane-contact-prices" style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #eee; text-align: left;">
                                    <p style="margin-bottom: 10px; color: #333; font-size: 1.1rem;"><strong>${currentLang === 'en' ? 'Estimated Price (Flexible Date)' : 'Mejor Precio (fecha flexible)'}:</strong> $<span class="contact-price-flexible">0.00</span></p>
                                    <p style="margin-bottom: 0; color: #333; font-size: 1.1rem;"><strong>${currentLang === 'en' ? 'Estimated Price (Immediate)' : 'Servicio Inmediato'}:</strong> $<span class="contact-price-immediate">0.00</span></p>
                                </div>
                                <input type="text" id="crane-contact-name" placeholder="${t["form-name"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="email" id="crane-contact-email" placeholder="${t["form-email"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="tel" id="crane-contact-phone" placeholder="${t["form-phone"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <button class="btn btn-primary" id="crane-btn-submit-contact" style="width: 100%;">${t["buy-btn-next"]}</button>
                            </div>
                        </div>
                    </div>
                    <div id="crane-summary" style="display:none;" class="summary-view">
                        <button class="btn-back back-btn-action" data-prev="contact"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                        <h3 data-i18n="buy-summary">${t["buy-summary"]}</h3>
                        <div class="summary-details">
                            <p><strong>Size:</strong> <span class="summary-size">-</span></p>
                            <p><strong>${t["summary-quantity"] || "Quantity"}:</strong> <span class="summary-quantity">-</span></p>
                            <p><strong>${t["summary-status"]}:</strong> <span class="summary-status">-</span></p>
                            <p><strong>${t["summary-route"]}:</strong> <span class="summary-route">-</span></p>
                            <p><strong>${t["summary-contact"]}:</strong> <span class="summary-contact">-</span></p>
                            <hr style="border-color: #eee; margin: 10px 0;">
                            <p><strong>${currentLang === 'en' ? 'Estimated Price (Flexible Date)' : 'Mejor Precio (fecha flexible)'}:</strong> $<span class="summary-price-flexible">0.00</span></p>
                            <p><strong>${currentLang === 'en' ? 'Estimated Price (Immediate)' : 'Servicio Inmediato'}:</strong> $<span class="summary-price-immediate">0.00</span></p>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="btn btn-primary btn-get-pricing" style="flex: 1;" data-i18n="trans-btn-pricing">${t["trans-btn-pricing"]}</button>
                            <button class="btn btn-outline btn-restart-action" style="flex: 1; color: var(--primary-color); border-color: var(--primary-color);" data-i18n="buy-btn-restart">${t["buy-btn-restart"]}</button>
                        </div>
                    </div>
                </div>
            </main>
        `;

        const selections = { size: null, quantity: 1, status: null, pickup: '', delivery: '', contact: {} };
        const steps = ['size', 'qty', 'status', 'route', 'contact'];
        let currentIndex = 0;

        craneView.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = craneView.querySelector('.crane-qty-input');
                let val = parseInt(input.value);
                if (btn.classList.contains('minus') && val > 1) val--;
                if (btn.classList.contains('plus') && val < 99) val++;
                input.value = val;
                selections.quantity = val;
            });
        });

        craneView.querySelector('.btn-submit-qty').addEventListener('click', () => {
            craneView.querySelector('#crane-step-qty').style.display = 'none';
            currentIndex++;
            const nextStep = steps[currentIndex];
            const nextEl = craneView.querySelector(`#crane-step-${nextStep}`);
            nextEl.style.display = 'block';
            nextEl.classList.add('fade-in');
        });

        craneView.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                const stepId = card.closest('.buy-step').id.split('-').pop();
                selections[stepId] = card.dataset.value;
                card.parentNode.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                setTimeout(() => {
                    craneView.querySelector(`#crane-step-${stepId}`).style.display = 'none';
                    currentIndex++;
                    const nextStep = steps[currentIndex];
                    const nextEl = craneView.querySelector(`#crane-step-${nextStep}`);
                    nextEl.style.display = 'block';
                    nextEl.classList.add('fade-in');
                }, 400);
            });
        });

        craneView.querySelector('#crane-btn-submit-route').addEventListener('click', async (e) => {
            selections.pickup = craneView.querySelector('#crane-zip-pickup').value;
            selections.delivery = craneView.querySelector('#crane-zip-delivery').value;
            if (!selections.pickup || !selections.delivery) {
                alert(currentLang === 'en' ? 'Please enter both zip codes' : 'Por favor ingrese ambos cÃ³digos postales');
                return;
            }

            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = currentLang === 'en' ? 'Calculating...' : 'Calculando...';
            btn.disabled = true;

            try {
                const distDirect = await globalGetDistance(selections.pickup, selections.delivery);
                
                let minDistToPickup = Infinity;
                const depots = getGlobalDepots();
                for (let d of depots) {
                    if (d.label.includes('32780') || d.zip === '32780') continue; // Skip Titusville
                    try {
                        const dDist = await globalGetDistance(d.zip, selections.pickup);
                        if (dDist < minDistToPickup) minDistToPickup = dDist;
                    } catch (e) {
                        console.log("Could not calculate distance for depot " + d.label);
                    }
                }
                
                if (minDistToPickup === Infinity) minDistToPickup = 0;
                
                const costDirect = globalCalculateShippingCost(distDirect);
                const costImmediate = globalCalculateShippingCost(minDistToPickup + distDirect);
                
                let multiplier = selections.quantity;
                if (selections.size === "20'") {
                    multiplier = Math.ceil(selections.quantity / 2);
                }
                
                let extraStatusCost = 0;
                if (selections.status === 'Empty') {
                    if (selections.size === "20'" && selections.quantity === 2) {
                        extraStatusCost = 100 * selections.quantity;
                    } else {
                        extraStatusCost = 150 * selections.quantity;
                    }
                } else if (selections.status === 'Full') {
                    extraStatusCost = 800 * selections.quantity;
                }
                
                selections.priceFlexible = (costDirect * multiplier) + extraStatusCost;
                selections.priceImmediate = (costImmediate * multiplier) + extraStatusCost;
                
                craneView.querySelector('.contact-price-flexible').textContent = selections.priceFlexible.toFixed(2);
                craneView.querySelector('.contact-price-immediate').textContent = selections.priceImmediate.toFixed(2);
                
                btn.innerText = originalText;
                btn.disabled = false;
                
                craneView.querySelector('#crane-step-route').style.display = 'none';
                currentIndex++;
                const nextStep = steps[currentIndex];
                const nextEl = craneView.querySelector(`#crane-step-${nextStep}`);
                nextEl.style.display = 'block';
                nextEl.classList.add('fade-in');
            } catch (error) {
                console.error("Distance Calculation Error:", error);
                alert(currentLang === 'en' ? 'Error calculating distance. Please check the zip codes and try again.' : 'Error calculando distancia. Revise los cÃ³digos postales e intente de nuevo.');
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });

        craneView.querySelector('#crane-btn-submit-contact').addEventListener('click', () => {
            try {
                selections.contact = {
                    name: craneView.querySelector('#crane-contact-name').value,
                    email: craneView.querySelector('#crane-contact-email').value,
                    phone: craneView.querySelector('#crane-contact-phone').value
                };
                if (!selections.contact.name || !selections.contact.email) {
                    alert(currentLang === 'en' ? 'Please fill name and email' : 'Por favor ingrese nombre y email');
                    return;
                }
                craneView.querySelector('#crane-step-contact').style.display = 'none';
                craneView.querySelector('.summary-size').textContent = selections.size || '-';
                craneView.querySelector('.summary-quantity').textContent = selections.quantity || '-';
                craneView.querySelector('.summary-status').textContent = selections.status || '-';
                craneView.querySelector('.summary-route').textContent = `${selections.pickup} ➔ ${selections.delivery}`;
                craneView.querySelector('.summary-contact').textContent = `${selections.contact.name} (${selections.contact.email}) - ${selections.contact.phone}`;
                if (selections.priceFlexible !== undefined && selections.priceImmediate !== undefined) {
                    craneView.querySelector('.summary-price-flexible').textContent = selections.priceFlexible.toFixed(2);
                    craneView.querySelector('.summary-price-immediate').textContent = selections.priceImmediate.toFixed(2);
                }
                craneView.querySelector('#crane-summary').style.display = 'block';
                craneView.querySelector('#crane-summary').classList.add('fade-in');
            } catch (err) {
                alert("Debug Error: " + err.message + "\nLine: " + err.lineNumber);
                console.error(err);
            }
        });

        craneView.querySelectorAll('.back-btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.dataset.prev) { showView('home'); return; }
                const prevStep = btn.dataset.prev;
                const currentStepEl = btn.closest('.buy-step') || craneView.querySelector('#crane-summary');
                currentStepEl.style.display = 'none';
                const prevEl = craneView.querySelector(`#crane-step-${prevStep}`);
                prevEl.style.display = 'block';
                prevEl.classList.add('fade-in');
                currentIndex = steps.indexOf(prevStep);
            });
        });

        craneView.querySelector('.btn-restart-action').addEventListener('click', () => renderCraneView());

        craneView.querySelector('.btn-get-pricing').addEventListener('click', (e) => {
            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = currentLang === 'en' ? 'Sending Request...' : 'Enviando Solicitud...';
            btn.disabled = true;

            const summary = `
ðŸ—ï¸ CRANE SERVICE QUOTE REQUEST
---------------------------------
Size: ${selections.size}
Quantity: ${selections.quantity}
Status: ${selections.status}
Route: ${selections.pickup} ➔ ${selections.delivery}
Est. Price (Flexible): $${selections.priceFlexible ? selections.priceFlexible.toFixed(2) : '0.00'}
Est. Price (Immediate): $${selections.priceImmediate ? selections.priceImmediate.toFixed(2) : '0.00'}

ðŸ‘¤ CONTACT INFORMATION
---------------------------------
Name: ${selections.contact.name}
Email: ${selections.contact.email}
Phone: ${selections.contact.phone}
            `.trim();

            const templateParams = {
                name: selections.contact.name,
                email: selections.contact.email,
                phone_number: selections.contact.phone,
                service: 'Crane Service Quote',
                message: summary,
                title: 'New Crane Service Request'
            };

            if (typeof emailjs !== 'undefined') {
                // Send to Supabase (Safe call)
                sendLeadToSupabase({
                    name: templateParams.name,
                    phone: templateParams.phone_number,
                    service: templateParams.service,
                    message: templateParams.message
                }).catch(e => console.error("DB Error:", e));
                emailjs.send('service_pfwtd14', 'template_0xc7f3i', templateParams)
                    .then(() => {
                        btn.innerText = currentLang === 'en' ? 'Request Sent!' : 'Solicitud Enviada!';
                        btn.style.backgroundColor = '#2ecc71';
                        setTimeout(() => {
                            btn.innerText = originalText;
                            btn.style.backgroundColor = 'var(--primary-color)';
                            btn.disabled = false;
                            showView('home');
                        }, 3000);
                    })
                    .catch((err) => {
                        console.error('EmailJS Error:', err);
                        btn.innerText = 'Error';
                        btn.disabled = false;
                    });
            } else {
                alert('Email service error. Please contact us directly.');
                btn.disabled = false;
            }
        });

        document.title = t["service-crane-h3"] + " | RP Tulipan Logistics";
    }

    function renderBuyView() { renderConfigurationView('buy-view', 'buy'); }
    function renderRentView() { renderConfigurationView('rent-view', 'rent'); }

    // Container Dimensions Carousel Logic
    const track = document.querySelector('.carousel-track');
    const slides = Array.from(document.querySelectorAll('.carousel-slide'));
    const nextButton = document.getElementById('dims-next');
    const prevButton = document.getElementById('dims-prev');
    const indicatorContainer = document.querySelector('.carousel-indicators');
    const indicators = Array.from(document.querySelectorAll('.indicator'));

    let currentSlideIndex = 0;

    const moveToSlide = (index) => {
        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;
        
        track.style.transform = `translateX(-${index * 100}%)`;
        slides.forEach(s => s.classList.remove('active'));
        indicators.forEach(i => i.classList.remove('active'));
        
        slides[index].classList.add('active');
        indicators[index].classList.add('active');
        currentSlideIndex = index;
    };

    if (nextButton && prevButton) {
        nextButton.addEventListener('click', () => {
            moveToSlide(currentSlideIndex + 1);
        });

        prevButton.addEventListener('click', () => {
            moveToSlide(currentSlideIndex - 1);
        });

        indicators.forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                moveToSlide(index);
            });
        });

        // Auto-play (Optional, every 5 seconds)
        setInterval(() => {
            moveToSlide(currentSlideIndex + 1);
        }, 5000);
    }

    // Image Zoom Modal Logic
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('zoomed-image');
    const captionText = document.getElementById('modal-caption');
    const closeBtn = document.querySelector('.close-modal');

    document.querySelectorAll('.carousel-slide img').forEach(img => {
        img.addEventListener('click', () => {
            modal.style.display = 'block';
            modalImg.src = img.src;
            captionText.innerHTML = img.alt;
            document.body.style.overflow = 'hidden'; // Prevent scroll
        });
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto'; // Restore scroll
        });
    }

    // Close modal on click outside image
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    }

    // Initial language sync and view setup
    updateLanguage(currentLang);
    showView('home');

    // ───────────────────────────────────────────────────────
    // AI Chat Logic — powered by chatbot-core (Cerebro Maestro)
    // ───────────────────────────────────────────────────────
    const aiChatBtn      = document.getElementById('ai-chat-btn');
    const aiChatWindow   = document.getElementById('ai-chat-window');
    const aiChatClose    = document.getElementById('ai-chat-close');
    const aiChatRestart  = document.getElementById('ai-chat-restart');
    const aiChatSend     = document.getElementById('ai-chat-send');
    const aiChatInput    = document.getElementById('ai-chat-input');
    const aiChatMessages = document.getElementById('ai-chat-messages');
    const typingIndicator = document.getElementById('ai-typing-indicator');

    // Generate a unique session ID per browser so chatbot-core can track state
    if (!localStorage.getItem('rpt_chat_sender_id')) {
        localStorage.setItem('rpt_chat_sender_id', 'web_' + Math.random().toString(36).substr(2, 12));
    }
    const SENDER_ID = localStorage.getItem('rpt_chat_sender_id');

    if (aiChatBtn && aiChatWindow) {
        aiChatBtn.addEventListener('click', () => {
            aiChatWindow.classList.add('active');
            aiChatBtn.style.display = 'none';
        });

        aiChatClose.addEventListener('click', () => {
            aiChatWindow.classList.remove('active');
            setTimeout(() => { aiChatBtn.style.display = 'flex'; }, 300);
        });

        if (aiChatRestart) {
            aiChatRestart.addEventListener('click', () => {
                // Clear all chat messages
                const msgs = aiChatMessages.querySelectorAll('.chat-message, .chat-buttons-container');
                msgs.forEach(m => m.remove());
                // Generate a fresh session ID so the core resets
                localStorage.setItem('rpt_chat_sender_id', 'web_' + Math.random().toString(36).substr(2, 12));
                location.reload();
            });
        }

        // ── Render helpers ────────────────────────────────────
        const appendMessage = (text, sender) => {
            const div = document.createElement('div');
            div.classList.add('chat-message', sender);
            div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
            aiChatMessages.insertBefore(div, typingIndicator);
            aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        };

        const showQuickReplies = (options) => {
            const old = aiChatMessages.querySelector('.chat-buttons-container');
            if (old) old.remove();

            const container = document.createElement('div');
            container.classList.add('chat-buttons-container');
            container.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;margin-bottom:15px;';

            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.textContent = opt;
                btn.style.cssText = 'padding:8px 15px;border-radius:20px;border:1px solid #c8102e;background:white;color:#c8102e;cursor:pointer;font-weight:bold;';
                btn.addEventListener('click', () => {
                    container.remove();
                    appendMessage(opt, 'user');
                    sendToCore(opt);
                });
                container.appendChild(btn);
            });

            aiChatMessages.insertBefore(container, typingIndicator);
            aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        };

        // ── Core API call ─────────────────────────────────────
        const sendToCore = async (text) => {
            typingIndicator.classList.add('active');
            aiChatMessages.scrollTop = aiChatMessages.scrollHeight;

            try {
                const senderId = localStorage.getItem('rpt_chat_sender_id');
                const { data, error } = await supabaseClient.functions.invoke('chatbot-core', {
                    body: { sender_id: senderId, message: text }
                });

                typingIndicator.classList.remove('active');

                if (error || !data?.actions) {
                    appendMessage('Lo siento, hubo un error. Por favor escribe "reiniciar" o haz clic en Restart.', 'bot');
                    return;
                }

                for (const action of data.actions) {
                    if (action.type === 'quick_replies' && action.options && action.options.length) {
                        appendMessage(action.text, 'bot');
                        showQuickReplies(action.options);
                    } else {
                        appendMessage(action.text, 'bot');
                    }
                }
            } catch (err) {
                typingIndicator.classList.remove('active');
                console.error('chatbot-core error:', err);
                appendMessage('Error de conexión. Por favor inténtalo de nuevo.', 'bot');
            }
        };

        // ── Text input ────────────────────────────────────────
        const handleUserInput = () => {
            const text = aiChatInput.value.trim();
            if (!text) return;
            aiChatInput.value = '';
            appendMessage(text, 'user');
            sendToCore(text);
        };

        aiChatSend.addEventListener('click', handleUserInput);
        aiChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserInput();
        });

        // ── Auto-open and greet on page load ─────────────────
        setTimeout(() => {
            aiChatWindow.classList.add('active');
            aiChatBtn.style.display = 'none';
            sendToCore('hola');
        }, 1000);
    }

});

