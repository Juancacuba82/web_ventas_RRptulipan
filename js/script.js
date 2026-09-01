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
 *   "20std"  → "20'"
 *   "20hc"   → "20' HC"
 *   "40std"  → "40' STD"
 *   "40hc"   → "40' HC"
 *   "45hc"   → "45'"
 * Reefer key mapping:
 *   "20func" â†’ "20'"
 *   "40func" â†’ "40' STD" and "40' HC"   (same price for both 40-foot variants)
 */
function buildPricesFromHubs(hubs) {
    const sizeMap = {
        '20std': "20'",
        '20hc':  "20' HC",
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
    if (!supabaseClient) throw new Error('Supabase is not initialized');
    try {
        const now = new Date();
        const createdDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const payload = {
            customer: leadData.name || 'Unknown',
            phone: leadData.phone || '---',
            service_type: leadData.service || 'Sales',
            city: (leadData.city || '---').toUpperCase(),
            description: leadData.message || '---',
            created_by: 'Website RP',
            source: 'Website RP',
            status: 'PENDING',
            date: createdDate,
            next_call_date: createdDate
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
                throw fallbackError;
            }
        }
    } catch (err) {
        console.error("Supabase Exception:", err);
        throw err;
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

    // Language: follow the device (Spanish vs English)
    const detectDeviceLang = () => {
        const primary = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
        return String(primary).toLowerCase().startsWith('es') ? 'es' : 'en';
    };
    let currentLang = detectDeviceLang();

    const translations = {
        en: {
            "ai-restart-btn": "Restart",
            "nav-home": "Home",
            "nav-services": "Services",
            "nav-about": "About Us",
            "nav-gallery": "Gallery",
            "nav-dimensions": "Dimensions",
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
            "buy-step-qty-hint": "How many containers do you need? Most customers start with 1.",
            "buy-step2": "Type of Service",
            "buy-step2-hint": "Storage means you will use the container in the U.S. (yard, business, or property). Export means you will send it overseas — we only sell the certified container, we do not ship it by sea.",
            "buy-step-cond": "Container Condition",
            "buy-step-cond-hint": "This is how the container looks and how it has been used. All used units we sell are wind and water tight (they do not leak).",
            "buy-step3": "Climate Control",
            "buy-step3-hint": "Most people need a regular (Dry) container. Choose Reefer only if you need refrigeration.",
            "buy-step4": "Delivery or Pickup",
            "buy-step4-hint": "Choose whether we bring the container to you, or you pick it up at one of our yards.",
            "buy-step5": "Logistics Details",
            "buy-step5-delivery": "Delivery ZIP code",
            "buy-step5-delivery-hint": "Enter the U.S. ZIP code where you want the container dropped off. Delivery cost is added to the price based on distance.",
            "buy-step5-pickup": "ZIP code to locate the nearest depot",
            "buy-step5-pickup-hint": "Enter a ZIP code near you. We use it to show the closest yard. You would pick up the container there — this is not a delivery.",
            "buy-step6": "Payment Method",
            "buy-step6-hint": "Cash and Zelle can be paid on delivery or pickup. Card and check must be paid in full before the driver leaves our yard.",
            "buy-step7": "Contact Information",
            "buy-step7-hint": "We use this to confirm your order and contact you about delivery or pickup.",
            "buy-step-size": "Select Size",
            "buy-step-size-hint": "This is the length of the container. A 20' is compact; a 40' is about twice as long and holds much more.",
            "buy-step-contact": "Contact Details",
            "buy-summary-subtotal": "Container Subtotal",
            "buy-summary-export": "Export Fee",
            "buy-summary-shipping": "Shipping Cost",
            "buy-summary-delivery": "Delivery Cost",
            "buy-summary-total": "Total Price",
            "rent-summary-monthly": "Monthly rent",
            "rent-summary-delivery": "Delivery (one time)",
            "rent-summary-pickup": "Pickup (one time)",
            "rent-summary-first-month": "Due first month",
            "rent-summary-next-months": "Each following month",
            "rent-summary-hint": "The first month includes bringing the container to you and picking it up when the rental ends. After that, you only pay the monthly rent.",
            "buy-summary-dist": "Distance",
            "buy-calculating": "Calculating distance...",
            "pay-note": "On delivery or pickup we only accept Cash or Zelle. Credit/debit card and check must be paid in full before the driver leaves our yard.",
            "buy-depot-info": "Select the depot closest to your location to get the lowest shipping rates.",
            "buy-summary": "Summary",
            "buy-btn-pricing": "Place Order.",
            "buy-btn-restart": "Restart",
            "buy-back": "Back",
            "buy-back-home": "Back to Services",
            "buy-opt-20": "20' Standard",
            "buy-opt-20-desc": "The most compact size. Good for a backyard, small business, or extra storage.",
            "buy-opt-20hc": "20' High Cube",
            "buy-opt-20hc-desc": "Same length as a 20', but taller inside so you can stack more.",
            "buy-opt-40": "40' High Cube",
            "buy-opt-40-desc": "The most popular size. Twice as long as a 20' and taller inside.",
            "buy-opt-40std": "40' Standard",
            "buy-opt-40std-desc": "Twice as long as a 20'. Lots of space, standard height.",
            "buy-opt-45": "45' High Cube",
            "buy-opt-45-desc": "The largest option. For when you need maximum space.",
            "buy-opt-int": "Export",
            "buy-opt-int-desc": "Certified container. Ocean freight not included.",
            "buy-opt-local": "Storage",
            "buy-opt-local-desc": "You keep and use it in the U.S. — storage, workshop, office, or on your property.",
            "buy-opt-export-buy": "Buy",
            "buy-opt-export-buy-desc": "You purchase the certified container",
            "buy-step-export-action": "Export sale",
            "buy-export-action-hint": "For export we only sell the certified container in the United States. We do not rent it and we do not ship it overseas.",
            "buy-step-export-port": "Where do you plan to export?",
            "buy-port-placeholder": "e.g., Mariel, Cuba",
            "buy-port-hint": "For our records only. We do not provide ocean freight to this destination.",
            "buy-step-export-zip": "U.S. ZIP code to find your nearest depot",
            "buy-zip-export-placeholder": "e.g., 33139",
            "buy-zip-export-hint": "Delivery to this ZIP is not included. We use it to see which of our yards is most convenient if you later need the container delivered.",
            "export-notice-title": "Delivery and ocean freight are not included",
            "export-notice": "This price is only for the container with a 1-year export certificate. It does not include delivery to your ZIP code or ocean freight to the destination country. We ask for the ZIP to locate the nearest depot in case you later need delivery. You arrange ocean shipping with a freight forwarder or shipping line.",
            "buy-summary-export-label": "Export (certified, 1 year)",
            "buy-summary-action": "Sale",
            "buy-summary-planned-dest": "Planned destination",
            "buy-summary-us-pickup": "Yard pickup (delivery not included)",
            "buy-summary-depot": "Nearest depot",
            "buy-summary-zip-depot": "ZIP (to locate depot)",
            "buy-summary-total-export": "Total (container only)",
            "buy-summary-container": "Container",
            "buy-summary-price-note": "Does not include delivery to your ZIP or ocean freight to the destination country.",
            "summary-logistics": "Logistics",
            "summary-details": "Details",
            "summary-size": "Size",
            "summary-condition": "Condition",
            "summary-climate": "Climate",
            "summary-payment": "Payment",
            "buy-opt-cw": "Used (CW)",
            "buy-opt-cw-desc": "Used, in better cosmetic condition. Still wind and water tight — no leaks.",
            "buy-opt-new-cond": "New (One Trip)",
            "buy-opt-new-cond-desc": "Almost new. It made only one trip from the factory. Best appearance.",
            "buy-opt-wwt": "Used (WWT)",
            "buy-opt-wwt-desc": "Used and wind/water tight (does not leak). May have dents or cosmetic rust. Fine for storage.",
            "buy-opt-dry": "Dry",
            "buy-opt-dry-desc": "Standard container, no refrigeration. For storing most items.",
            "buy-opt-reefer": "Reefer",
            "buy-opt-reefer-desc": "Has a cooling unit. Only if you need temperature control.",
            "buy-opt-delivery": "Delivery",
            "buy-opt-delivery-desc": "We bring the container to your ZIP code. Delivery cost is added to the price.",
            "buy-opt-pickup": "Pickup",
            "buy-opt-pickup-desc": "You pick it up at our yard. Usually cheaper because there is no delivery.",
            "buy-pay-cash": "Cash",
            "buy-pay-cash-desc": "Pay in cash when the container is delivered or picked up.",
            "buy-pay-zelle": "Zelle",
            "buy-pay-zelle-desc": "Pay by Zelle on delivery or pickup.",
            "buy-pay-card": "Credit/Debit Card",
            "buy-pay-card-desc": "Must be paid in full before the driver leaves our yard.",
            "buy-pay-check": "Check",
            "buy-pay-check-desc": "Must be paid in full before the driver leaves our yard.",
            "buy-zip-placeholder": "Enter Delivery Zip Code",
            "buy-zip-placeholder-pickup": "Enter a ZIP code near you",
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
            "trans-p": "This service moves a container you already own. We pick it up at one place and take it to another. You are not buying or renting a container here.",
            "trans-step1": "1. Container Size",
            "trans-step1-hint": "What size is YOUR container? We need this so the truck can haul it. You are not purchasing a container in this step.",
            "trans-step2": "2. Container Status",
            "trans-step2-hint": "Is it empty or loaded? A loaded container, especially a heavy one, costs more to move.",
            "trans-step3": "3. Route Details",
            "trans-step3-hint": "Enter the U.S. ZIP where we pick up your container, and the ZIP where we should leave it.",
            "trans-step-qty-hint": "How many of your containers should we move? Each container is a separate truck trip.",
            "trans-step-contact-hint": "We use this to confirm the move and contact you with the quote.",
            "trans-opt-empty": "Empty",
            "trans-opt-empty-desc": "Nothing inside. This is usually the cheapest move.",
            "trans-opt-full": "Loaded",
            "trans-opt-full-desc": "There is cargo inside the container.",
            "trans-opt-full-under": "Loaded under 14,000 lbs",
            "trans-opt-full-under-desc": "Has cargo, but under 14,000 lbs. A standard loaded move.",
            "trans-opt-full-over": "Loaded over 14,000 lbs",
            "trans-opt-full-over-desc": "Cargo over 14,000 lbs. Needs a heavier truck and often a crane to load or unload.",
            "trans-opt-crane-yes": "Crane Needed",
            "trans-opt-crane-no": "No Crane Needed",
            "trans-zip-pickup": "Pickup Zip Code",
            "trans-zip-pickup-hint": "Where is your container right now?",
            "trans-zip-delivery": "Delivery Zip Code",
            "trans-zip-delivery-hint": "Where should we take it?",
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
            "buy-step-qty-hint": "¿Cuántos contenedores necesita? La mayoría de clientes empieza con 1.",
            "buy-step2": "Tipo de Servicio",
            "buy-step2-hint": "Almacenamiento es para usarlo en EE.UU. (patio, negocio o propiedad). Exportación es para enviarlo a otro país: solo vendemos el contenedor certificado, no hacemos el flete marítimo.",
            "buy-step-cond": "Condición del Contenedor",
            "buy-step-cond-hint": "Esto indica cómo se ve el contenedor y cuánto se ha usado. Todos los usados que vendemos son wind and water tight: no filtran aire ni agua.",
            "buy-step3": "Climatización",
            "buy-step3-hint": "La mayoría necesita un contenedor normal (Dry). Elija Reefer solo si necesita refrigeración.",
            "buy-step4": "Entrega o Recogida",
            "buy-step4-hint": "Elija si se lo llevamos a su dirección, o si usted lo recoge en uno de nuestros depósitos.",
            "buy-step5": "Detalles de Logística",
            "buy-step5-delivery": "Código postal de entrega",
            "buy-step5-delivery-hint": "Indique el código postal de EE.UU. donde quiere que le dejemos el contenedor. El costo de entrega se suma al precio según la distancia.",
            "buy-step5-pickup": "Código postal para ubicar el depósito más cercano",
            "buy-step5-pickup-hint": "Indique un código postal cerca de usted. Lo usamos para mostrarle el depósito más conveniente. Usted recogería el contenedor allí: esto no es una entrega.",
            "buy-step6": "Método de Pago",
            "buy-step6-hint": "Efectivo y Zelle se pueden pagar en la entrega o recogida. Tarjeta y cheque deben pagarse completos antes de que el chofer salga de nuestro patio.",
            "buy-step7": "Información de Contacto",
            "buy-step7-hint": "Lo usamos para confirmar su pedido y contactarlo sobre la entrega o recogida.",
            "buy-step-size": "Seleccionar Tamaño",
            "buy-step-size-hint": "Es el largo del contenedor. Un 20' es compacto; un 40' mide el doble y guarda mucho más.",
            "buy-step-contact": "Datos de Contacto",
            "buy-summary-subtotal": "Subtotal Contenedor",
            "buy-summary-export": "Tarifa de Exportación",
            "buy-summary-shipping": "Costo de Envío",
            "buy-summary-delivery": "Costo de Entrega",
            "buy-summary-total": "Precio Total",
            "rent-summary-monthly": "Alquiler mensual",
            "rent-summary-delivery": "Entrega (única)",
            "rent-summary-pickup": "Recogida (única)",
            "rent-summary-first-month": "A pagar el primer mes",
            "rent-summary-next-months": "Cada mes siguiente",
            "rent-summary-hint": "El primer mes incluye llevarle el contenedor y recogerlo al finalizar el alquiler. Los meses siguientes solo paga el alquiler.",
            "buy-summary-dist": "Distancia",
            "buy-calculating": "Calculando distancia...",
            "pay-note": "En la entrega o recogida solo aceptamos Efectivo o Zelle. Tarjeta de crédito/débito y cheque deben pagarse completos antes de que el chofer salga de nuestro patio.",
            "buy-depot-info": "Seleccione el depósito más cercano a su ubicación para obtener las tarifas de envío más bajas.",
            "buy-summary": "Resumen",
            "buy-btn-pricing": "Realizar Pedido.",
            "buy-btn-restart": "Reiniciar",
            "buy-back": "Atrás",
            "buy-back-home": "Volver a Servicios",
            "buy-opt-20": "20' Estándar",
            "buy-opt-20-desc": "El más compacto. Ideal para un patio, un negocio pequeño o guardar herramientas.",
            "buy-opt-20hc": "20' High Cube",
            "buy-opt-20hc-desc": "Igual de largo que un 20', pero más alto por dentro para apilar más.",
            "buy-opt-40": "40' High Cube",
            "buy-opt-40-desc": "El más usado. El doble de largo que un 20' y más alto por dentro.",
            "buy-opt-40std": "40' Estándar",
            "buy-opt-40std-desc": "El doble de largo que un 20'. Mucho espacio, altura estándar.",
            "buy-opt-45": "45' High Cube",
            "buy-opt-45-desc": "El más grande. Para quien necesita el máximo espacio.",
            "buy-opt-int": "Exportación",
            "buy-opt-int-desc": "Contenedor certificado. El flete marítimo no está incluido.",
            "buy-opt-local": "Almacenamiento",
            "buy-opt-local-desc": "Lo usa y lo deja en EE.UU.: guardar cosas, taller, oficina o en su propiedad.",
            "buy-opt-export-buy": "Comprar",
            "buy-opt-export-buy-desc": "Usted compra el contenedor certificado",
            "buy-step-export-action": "Venta para exportación",
            "buy-export-action-hint": "Para exportación solo vendemos el contenedor certificado en Estados Unidos. No lo alquilamos y no lo enviamos al exterior.",
            "buy-step-export-port": "¿A dónde planeas exportar?",
            "buy-port-placeholder": "Ej., Mariel, Cuba",
            "buy-port-hint": "Solo para nuestros registros. No enviamos el contenedor por vía marítima.",
            "buy-step-export-zip": "Código postal de EE.UU. para ubicar el depósito más cercano",
            "buy-zip-export-placeholder": "Ej., 33139",
            "buy-zip-export-hint": "La entrega a este código postal no está incluida. Lo usamos para saber cuál de nuestros centros le conviene más si más adelante necesita que se lo entreguemos.",
            "export-notice-title": "No incluye entrega ni flete marítimo",
            "export-notice": "Este precio es solo del contenedor con certificado de exportación válido por 1 año. No incluye la entrega a su código postal ni el flete marítimo al país de destino. Pedimos el ZIP para ubicar el depósito más cercano por si más adelante necesita que se lo entreguemos. El envío marítimo lo gestiona usted con un freight forwarder o naviera.",
            "buy-summary-export-label": "Exportación (certificado 1 año)",
            "buy-summary-action": "Venta",
            "buy-summary-planned-dest": "Destino previsto",
            "buy-summary-us-pickup": "Recogida en depósito (entrega no incluida)",
            "buy-summary-depot": "Depósito más cercano",
            "buy-summary-zip-depot": "ZIP (para ubicar depósito)",
            "buy-summary-total-export": "Total (solo contenedor)",
            "buy-summary-container": "Contenedor",
            "buy-summary-price-note": "No incluye entrega a su código postal ni envío marítimo al país de destino.",
            "summary-logistics": "Logística",
            "summary-details": "Detalles",
            "summary-size": "Tamaño",
            "summary-condition": "Condición",
            "summary-climate": "Climatización",
            "summary-payment": "Pago",
            "buy-opt-cw": "Usado (CW)",
            "buy-opt-cw-desc": "Usado, en mejor estado visual. También cerrado al viento y al agua: no filtra.",
            "buy-opt-new-cond": "Nuevo (One Trip)",
            "buy-opt-new-cond-desc": "Casi nuevo. Solo hizo un viaje desde la fábrica. La mejor apariencia.",
            "buy-opt-wwt": "Usado (WWT)",
            "buy-opt-wwt-desc": "Usado y cerrado al viento y al agua (no filtra). Puede tener abolladuras u óxido cosmético. Sirve para guardar.",
            "buy-opt-dry": "Dry",
            "buy-opt-dry-desc": "Contenedor estándar, sin refrigeración. Para guardar la mayoría de las cosas.",
            "buy-opt-reefer": "Reefer",
            "buy-opt-reefer-desc": "Tiene equipo de frío. Solo si necesita temperatura controlada.",
            "buy-opt-delivery": "Entrega",
            "buy-opt-delivery-desc": "Se lo llevamos a su código postal. El costo de entrega se suma al precio.",
            "buy-opt-pickup": "Recogida",
            "buy-opt-pickup-desc": "Usted lo recoge en nuestro depósito. Suele ser más económico porque no hay entrega.",
            "buy-pay-cash": "Efectivo",
            "buy-pay-cash-desc": "Paga en efectivo al recibir o recoger el contenedor.",
            "buy-pay-zelle": "Zelle",
            "buy-pay-zelle-desc": "Paga con Zelle en la entrega o recogida.",
            "buy-pay-card": "Tarjeta de Crédito/Débito",
            "buy-pay-card-desc": "Debe pagarse completo antes de que el chofer salga de nuestro patio.",
            "buy-pay-check": "Cheque",
            "buy-pay-check-desc": "Debe pagarse completo antes de que el chofer salga de nuestro patio.",
            "buy-zip-placeholder": "Código Postal de Entrega",
            "buy-zip-placeholder-pickup": "Código postal cerca de usted",
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
            "trans-p": "Este servicio mueve un contenedor que usted ya tiene. Lo recogemos en un lugar y lo llevamos a otro. Aquí no está comprando ni alquilando un contenedor.",
            "trans-step1": "1. Tamaño del Contenedor",
            "trans-step1-hint": "¿De qué tamaño es SU contenedor? Lo necesitamos para saber qué camión usar. En este paso no está comprando un contenedor.",
            "trans-step2": "2. Estado del Contenedor",
            "trans-step2-hint": "¿Está vacío o cargado? Un contenedor con carga, sobre todo si es pesado, cuesta más de mover.",
            "trans-step3": "3. Detalles de la Ruta",
            "trans-step3-hint": "Indique el código postal de EE.UU. donde recogemos su contenedor y el código postal donde debemos dejarlo.",
            "trans-step-qty-hint": "¿Cuántos de sus contenedores debemos mover? Cada contenedor es un viaje de camión aparte.",
            "trans-step-contact-hint": "Lo usamos para confirmar el traslado y enviarle la cotización.",
            "trans-opt-empty": "Vacío",
            "trans-opt-empty-desc": "No lleva nada adentro. Suele ser el traslado más económico.",
            "trans-opt-full": "Cargado",
            "trans-opt-full-desc": "El contenedor tiene carga adentro.",
            "trans-opt-full-under": "Cargado (menos de 14,000 lbs)",
            "trans-opt-full-under-desc": "Tiene carga, pero menos de 14,000 lbs. Es un traslado cargado estándar.",
            "trans-opt-full-over": "Cargado (más de 14,000 lbs)",
            "trans-opt-full-over-desc": "Carga de más de 14,000 lbs. Necesita un camión más pesado y a menudo grúa para cargar o descargar.",
            "trans-opt-crane-yes": "Necesita Grúa",
            "trans-opt-crane-no": "No necesita Grúa",
            "trans-zip-pickup": "Zip Code de Recogida",
            "trans-zip-pickup-hint": "¿Dónde está su contenedor ahora?",
            "trans-zip-delivery": "Zip Code de Entrega",
            "trans-zip-delivery-hint": "¿A dónde debemos llevarlo?",
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
        document.documentElement.lang = lang;
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

    const showView = (viewName, preserveHash = false) => {
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

        if (!preserveHash) {
            window.scrollTo(0, 0);
        }
        
        if (nav.classList.contains('nav-active')) {
            burger.click();
        }

        // Update the browser URL without refreshing the page
        if (viewName === 'home') {
            if (!preserveHash) {
                history.pushState(null, null, window.location.pathname);
            }
        } else {
            history.pushState(null, null, '#' + viewName);
        }
    };

    async function submitOrderToCallLogs(btn, originalText, leadData) {
        try {
            await sendLeadToSupabase(leadData);
            btn.innerText = currentLang === 'en' ? 'Request Sent!' : 'Solicitud Enviada!';
            btn.style.backgroundColor = '#2ecc71';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.backgroundColor = 'var(--primary-color)';
                btn.disabled = false;
                showView('home');
            }, 3000);
            return true;
        } catch (err) {
            console.error('Order save error:', err);
            btn.innerText = 'Error';
            btn.disabled = false;
            return false;
        }
    }

    // Handle URL Hash for direct links
    if (window.location.hash) {
        const hashView = window.location.hash.substring(1);
        const validViews = ['home', 'gallery', 'buy', 'rent', 'trans', 'crane'];
        if (validViews.includes(hashView)) {
            showView(hashView);
        }
    }

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
        link.addEventListener('click', (e) => {
            const target = link.getAttribute('href');
            if (!target || target === '#home' || target === '#') {
                showView('home');
            } else {
                showView('home', true);
                setTimeout(() => {
                    try {
                        const el = document.querySelector(target);
                        if (el) {
                            const y = el.getBoundingClientRect().top + window.scrollY - 80;
                            window.scrollTo({ top: y, behavior: 'smooth' });
                        }
                    } catch(err) {}
                }, 50);
            }
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

    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = contactForm.querySelector('button');
            const originalBtnText = submitBtn.innerText;
            
            submitBtn.innerText = currentLang === 'en' ? 'Sending...' : 'Enviando...';
            submitBtn.disabled = true;

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const service = document.getElementById('service').value;
            const message = document.getElementById('message').value;

            try {
                await sendLeadToSupabase({
                    name,
                    phone,
                    service,
                    message: `Email: ${email}\n\n${message}`
                });
                submitBtn.innerText = currentLang === 'en' ? 'Message Sent!' : '¡Mensaje Enviado!';
                submitBtn.style.backgroundColor = '#2ecc71';
                contactForm.reset();
                setTimeout(() => {
                    submitBtn.innerText = originalBtnText;
                    submitBtn.style.backgroundColor = 'var(--primary-color)';
                    submitBtn.disabled = false;
                }, 3000);
            } catch (error) {
                console.error('Contact save error:', error);
                submitBtn.innerText = currentLang === 'en' ? 'Error!' : '¡Error!';
                submitBtn.style.backgroundColor = '#e74c3c';
                setTimeout(() => {
                    submitBtn.innerText = originalBtnText;
                    submitBtn.style.backgroundColor = 'var(--primary-color)';
                    submitBtn.disabled = false;
                }, 3000);
            }
        });
    }


    async function renderGallery() {
        const galleryView = document.getElementById('gallery-view');
        const headerHTML = `<header class="gallery-header"><div class="container"><h1 data-i18n="gallery-h1">${translations[currentLang]["gallery-h1"]}</h1><p data-i18n="gallery-p">${translations[currentLang]["gallery-p"]}</p></div></header>`;
        
        // Show loading spinner
        galleryView.innerHTML = `${headerHTML}<main class="container"><div style="text-align: center; padding: 50px;"><i class="fas fa-spinner fa-spin fa-3x" style="color: var(--primary-color);"></i><p style="margin-top: 15px;">${currentLang === 'en' ? 'Loading gallery...' : 'Cargando galería...'}</p></div></main>`;
        document.title = currentLang === 'en' ? "Photo Gallery | RP Tulipan Logistics" : "Galería de Fotos | RP Tulipan Logistics";

        try {
            if (!supabaseClient) throw new Error("Supabase is not initialized.");
            
            // List files in the 'gallery' bucket
            const { data, error } = await supabaseClient.storage.from('gallery').list();

            if (error) throw error;
            
            // Filter out hidden files or folders (like .emptyFolderPlaceholder)
            const files = data ? data.filter(file => file.name !== '.emptyFolderPlaceholder') : [];
            
            if (files.length === 0) {
                galleryView.innerHTML = `${headerHTML}<main class="container"><p style="text-align: center; padding: 50px; font-size: 1.2rem; color: #666;">${currentLang === 'en' ? "No photos available this week." : "No hay fotos disponibles esta semana."}</p></main>`;
                return;
            }

            // Build grid
            const gridHTML = files.map(file => {
                const { data: publicUrlData } = supabaseClient.storage.from('gallery').getPublicUrl(file.name);
                const url = publicUrlData.publicUrl;
                // Added zoomable-image class and inline cursor style for better UX
                return `<div class="gallery-item reveal active"><img src="${url}" alt="Gallery Photo" class="zoomable-image" style="cursor: zoom-in; transition: transform 0.3s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'"></div>`;
            }).join('');

            galleryView.innerHTML = `${headerHTML}<main class="container"><section class="gallery-grid">${gridHTML}</section></main>`;
            
            // Re-attach modal listeners for the new dynamic images
            setupLightbox();

        } catch (err) {
            console.error("Error fetching gallery images:", err);
            galleryView.innerHTML = `${headerHTML}<main class="container"><p style="text-align: center; padding: 50px; color: #d90429; font-weight: bold;">${currentLang === 'en' ? "Error loading gallery. Please make sure the 'gallery' bucket exists and is Public in Supabase." : "Error al cargar la galería. Asegúrese de que el bucket 'gallery' exista y sea Público en Supabase."}</p></main>`;
        }
    }

    function setupLightbox() {
        const modal = document.getElementById('image-modal');
        const modalImg = document.getElementById('zoomed-image');
        const closeModal = document.querySelector('.close-modal');
        const zoomableImages = document.querySelectorAll('.zoomable-image');

        if (!modal || !modalImg || !closeModal) return;

        zoomableImages.forEach(img => {
            img.addEventListener('click', function() {
                modal.style.display = 'block';
                modalImg.src = this.src;
                // Optional: prevent background scrolling
                document.body.style.overflow = 'hidden'; 
            });
        });

        const closeFunc = () => {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto'; // Restore scrolling
        };

        // Close when clicking X
        closeModal.addEventListener('click', closeFunc);

        // Close when clicking outside the image
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeFunc();
            }
        });
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
                            <p class="step-hint" data-i18n="buy-step2-hint">${t["buy-step2-hint"]}</p>
                            <div class="options-grid">
                                <div class="option-card" data-value="International">
                                    <i class="fas fa-file-circle-check"></i>
                                    <span data-i18n="buy-opt-int">${t["buy-opt-int"]}</span>
                                    <small class="option-card-desc" data-i18n="buy-opt-int-desc">${t["buy-opt-int-desc"]}</small>
                                </div>
                                <div class="option-card" data-value="Local">
                                    <i class="fas fa-warehouse"></i>
                                    <span data-i18n="buy-opt-local">${t["buy-opt-local"]}</span>
                                    <small class="option-card-desc" data-i18n="buy-opt-local-desc">${t["buy-opt-local-desc"]}</small>
                                </div>
                            </div>
                        </div>

                        <!-- Step 1.5: Export Port -->
                        <div class="buy-step" id="${mode}-step-export-port" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="logistics-details"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step-export-port">${t["buy-step-export-port"]}</h3>
                            <p class="step-hint" data-i18n="buy-port-hint">${t["buy-port-hint"]}</p>
                            <div class="form-group" style="margin-top: 20px;">
                                <input type="text" id="${mode}-export-port" placeholder="${t["buy-port-placeholder"]}" data-i18n-placeholder="buy-port-placeholder" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 25px;">
                                <button class="btn btn-primary" id="${mode}-btn-port-next" style="width: 100%;" disabled>${t["buy-btn-next"]}</button>
                            </div>
                        </div>

                        <!-- Step 2: Size -->
                        <div class="buy-step" id="${mode}-step-size" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="condition"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step-size">${t["buy-step-size"]}</h3>
                            <p class="step-hint" data-i18n="buy-step-size-hint">${t["buy-step-size-hint"]}</p>
                            <div id="${mode}-size-options-container" class="options-grid">
                                <!-- JS will populate this based on depot -->
                            </div>
                        </div>

                        <!-- Step 3: Container Condition -->
                        <div class="buy-step" id="${mode}-step-container-condition" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="size"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="${mode}-step-cond">${mode === 'buy' ? t["buy-step-cond"] : t["rent-step-cond"]}</h3>
                            <p class="step-hint" data-i18n="buy-step-cond-hint">${t["buy-step-cond-hint"]}</p>
                            <div class="options-grid" id="${mode}-cond-options">
                                <!-- JS will populate this -->
                            </div>
                        </div>

                        <!-- Step 4: Climate Control -->
                        <div class="buy-step" id="${mode}-step-type" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="container-condition"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step3">${t["buy-step3"]}</h3>
                            <p class="step-hint" data-i18n="buy-step3-hint">${t["buy-step3-hint"]}</p>
                            <div class="options-grid" id="${mode}-climate-options">
                                <!-- JS populated -->
                            </div>
                        </div>

                        <!-- Step 5: Payment Method -->
                        <div class="buy-step" id="${mode}-step-payment-method" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="type"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="${mode}-step-pay">${mode === 'buy' ? t["buy-step6"] : t["rent-step-pay"]}</h3>
                            <p class="step-hint" data-i18n="buy-step6-hint">${t["buy-step6-hint"]}</p>
                            <div class="payment-note">
                                <i class="fas fa-hand-holding-dollar"></i>
                                <span data-i18n="pay-note">${t["pay-note"]}</span>
                            </div>
                            <div class="options-grid">
                                <div class="option-card" data-value="Cash"><i class="fas fa-money-bill-wave"></i><span>${t["buy-pay-cash"]}</span><small class="option-card-desc">${t["buy-pay-cash-desc"]}</small></div>
                                <div class="option-card" data-value="Zelle"><i class="fas fa-mobile-screen-button"></i><span>${t["buy-pay-zelle"]}</span><small class="option-card-desc">${t["buy-pay-zelle-desc"]}</small></div>
                                <div class="option-card" data-value="Card"><i class="fas fa-credit-card"></i><span>${t["buy-pay-card"]}</span><small class="option-card-desc">${t["buy-pay-card-desc"]}</small></div>
                                <div class="option-card" data-value="Check"><i class="fas fa-money-check-dollar"></i><span>${t["buy-pay-check"]}</span><small class="option-card-desc">${t["buy-pay-check-desc"]}</small></div>
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
                            <p class="step-hint" data-i18n="buy-step7-hint">${t["buy-step7-hint"]}</p>
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
                            <p class="step-hint" data-i18n="buy-step4-hint">${t["buy-step4-hint"]}</p>
                            <div class="options-grid">
                                <div class="option-card" data-value="Delivery">
                                    <i class="fas fa-truck-fast"></i>
                                    <span>${t["buy-opt-delivery"]}</span>
                                    <small class="option-card-desc">${t["buy-opt-delivery-desc"]}</small>
                                </div>
                                <div class="option-card" data-value="Pickup">
                                    <i class="fas fa-warehouse"></i>
                                    <span>${t["buy-opt-pickup"]}</span>
                                    <small class="option-card-desc">${t["buy-opt-pickup-desc"]}</small>
                                </div>
                            </div>
                        </div>

                        <div class="buy-step" id="${mode}-step-qty" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="type"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step-qty">${t["buy-step-qty"]}</h3>
                            <p class="step-hint" data-i18n="buy-step-qty-hint">${t["buy-step-qty-hint"]}</p>
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
            const allSizes = ["20'", "20' HC", "40' STD", "40' HC", "45'"];
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

        const selections = { size: null, quantity: 1, condition: mode === 'rent' ? 'Local' : null, 'export-action': null, 'export-port': null, 'container-condition': null, type: mode === 'rent' ? 'Dry' : null, 'delivery-mode': mode === 'rent' ? 'Delivery' : null, 'logistics-details': null, 'payment-method': null, contact: {}, distance: 0, shippingCost: 0, pricePerUnit: 0, bestDepot: null, allDistances: {} };
        let steps = mode === 'buy' 
            ? ['condition'] 
            : ['logistics-details', 'size', 'qty', 'container-condition', 'type', 'payment-method', 'price', 'contact'];
        let currentIndex = 0;

        const isExportFlow = () => selections.condition === 'International';

        const exportNoticeHtml = () => `
            <div class="export-notice">
                <i class="fas fa-circle-info"></i>
                <div>
                    <strong>${t["export-notice-title"]}</strong>
                    <p>${t["export-notice"]}</p>
                </div>
            </div>
        `;

        const buildSummaryMetaHtml = (includeContact) => {
            const exportFlow = isExportFlow();
            const serviceValue = exportFlow ? t["buy-summary-export-label"] : t["buy-opt-local"];
            const logisticsValue = exportFlow
                ? t["buy-summary-us-pickup"]
                : (selections['delivery-mode'] || '-');
            const detailsLabel = exportFlow ? t["buy-summary-zip-depot"] : t["summary-details"];

            let html = '';
            if (exportFlow) html += exportNoticeHtml();

            html += `
                <div class="summary-item"><strong>${t["summary-logistics"]}:</strong> <span>${logisticsValue}</span></div>
                ${selections['logistics-details'] ? `<div class="summary-item"><strong>${detailsLabel}:</strong> <span>${selections['logistics-details']}</span></div>` : ''}
                ${exportFlow && selections.bestDepot ? `<div class="summary-item"><strong>${t["buy-summary-depot"]}:</strong> <span>${selections.bestDepot}</span></div>` : ''}
                <div class="summary-item"><strong>${t["summary-size"]}:</strong> <span>${selections.size}</span></div>
                <div class="summary-item"><strong>${t["summary-quantity"] || 'Quantity'}:</strong> <span style="font-weight: 700; color: var(--primary-color);">${selections.quantity}</span></div>
                <div class="summary-item"><strong>${t["buy-step2"]}:</strong> <span>${serviceValue}</span></div>
            `;

            if (exportFlow) {
                html += `
                    <div class="summary-item"><strong>${t["buy-summary-planned-dest"]}:</strong> <span>${selections['export-port']}</span></div>
                `;
            }

            html += `
                <div class="summary-item"><strong>${t["summary-condition"]}:</strong> <span>${selections['container-condition'] || '-'}</span></div>
                <div class="summary-item"><strong>${t["summary-climate"]}:</strong> <span>${selections.type || 'Dry'}</span></div>
                <div class="summary-item"><strong>${t["summary-payment"]}:</strong> <span>${selections['payment-method'] || '-'}</span></div>
            `;

            if (includeContact) {
                html += `<div class="summary-item"><strong>${t["summary-contact"]}:</strong> <span>${selections.contact.name || '-'}</span></div>`;
            }

            return html;
        };

        const exportPriceFooterHtml = () => isExportFlow()
            ? `<p class="export-price-note">${t["buy-summary-price-note"]}</p>`
            : '';

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
            const sizeIcons  = { "20'": "fa-box", "20' HC": "fa-box", "40' STD": "fa-boxes", "40' HC": "fa-boxes", "45'": "fa-boxes" };
            const sizeLabels = { "20'": t["buy-opt-20"], "20' HC": t["buy-opt-20hc"], "40' STD": t["buy-opt-40std"], "40' HC": t["buy-opt-40"], "45'": t["buy-opt-45"] };
            const sizeDescs  = { "20'": t["buy-opt-20-desc"], "20' HC": t["buy-opt-20hc-desc"], "40' STD": t["buy-opt-40std-desc"], "40' HC": t["buy-opt-40-desc"], "45'": t["buy-opt-45-desc"] };

            container.innerHTML = availableSizes.map(size => `
                <div class="option-card size-option" data-value="${size}">
                    <i class="fas ${sizeIcons[size]}"></i>
                    <span>${sizeLabels[size]}</span>
                    <small class="option-card-desc">${sizeDescs[size] || ''}</small>
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
                html += `<div class="option-card" data-value="Dry"><i class="fas fa-wind"></i><span>${t["buy-opt-dry"]}</span><small class="option-card-desc">${t["buy-opt-dry-desc"]}</small></div>`;
            }
            if (hasReefer) {
                html += `<div class="option-card" data-value="Reefer"><i class="fas fa-snowflake"></i><span>${t["buy-opt-reefer"]}</span><small class="option-card-desc">${t["buy-opt-reefer-desc"]}</small></div>`;
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
                    html += `<div class="option-card" data-value="Used"><i class="fas fa-check-circle"></i><span>${t["rent-opt-used"]}</span><small class="option-card-desc">${t["buy-opt-wwt-desc"]}</small></div>`;
                }
                if (hasNewRent) {
                    html += `<div class="option-card" data-value="New"><i class="fas fa-star"></i><span>${t["rent-opt-new"]}</span><small class="option-card-desc">${t["buy-opt-new-cond-desc"]}</small></div>`;
                }
            } else {
                const hasUsedPrice = DEPOTS.some(d => USED_CONTAINER_PRICES[d.label] && (USED_CONTAINER_PRICES[d.label][size] || 0) > 0);
                const hasNewPrice  = DEPOTS.some(d => NEW_CONTAINER_PRICES[d.label] && (NEW_CONTAINER_PRICES[d.label][size] || 0) > 0);

                if (hasUsedPrice) {
                    if (serviceType === 'International') {
                        html += `<div class="option-card" data-value="CW"><i class="fas fa-check-circle"></i><span>${t["buy-opt-cw"]}</span><small class="option-card-desc">${t["buy-opt-cw-desc"]}</small></div>`;
                    } else {
                        // Storage (Local) shows both WWT and CW
                        html += `
                            <div class="option-card" data-value="WWT"><i class="fas fa-water"></i><span>${t["buy-opt-wwt"]}</span><small class="option-card-desc">${t["buy-opt-wwt-desc"]}</small></div>
                            <div class="option-card" data-value="CW"><i class="fas fa-check-circle"></i><span>${t["buy-opt-cw"]}</span><small class="option-card-desc">${t["buy-opt-cw-desc"]}</small></div>
                        `;
                    }
                }

                if (hasNewPrice) {
                    html += `<div class="option-card" data-value="New"><i class="fas fa-star"></i><span>${t["buy-opt-new-cond"]}</span><small class="option-card-desc">${t["buy-opt-new-cond-desc"]}</small></div>`;
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
            const logisticsH3 = viewEl.querySelector(`#${mode}-step-logistics-details h3`);
            const isPickup = selections['delivery-mode'] === 'Pickup';
            const zipPlaceholder = isExportFlow()
                ? t["buy-zip-export-placeholder"]
                : (isPickup ? t["buy-zip-placeholder-pickup"] : t["buy-zip-placeholder"]);
            const storageHint = isPickup ? t["buy-step5-pickup-hint"] : t["buy-step5-delivery-hint"];
            
            if (logisticsH3) {
                if (isExportFlow()) {
                    logisticsH3.textContent = t["buy-step-export-zip"];
                } else if (isPickup) {
                    logisticsH3.textContent = t["buy-step5-pickup"];
                } else {
                    logisticsH3.textContent = t["buy-step5-delivery"];
                }
            }

            if (mode === 'buy') {
                document.body.classList.add('with-countdown');
            } else {
                document.body.classList.remove('with-countdown');
            }

            container.innerHTML = `
                ${isExportFlow() ? exportNoticeHtml() : ''}
                ${isExportFlow() ? `<p class="step-hint">${t["buy-zip-export-hint"]}</p>` : `<p class="step-hint">${storageHint}</p>`}
                <div class="form-group" style="margin-top: 20px;">

                    <input type="text" id="${mode}-zip-input" placeholder="${zipPlaceholder}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 25px;">
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
                
                const nonContinentalPrefixes = ['006', '007', '009', '995', '996', '997', '998', '999', '967', '968'];
                if (zip && nonContinentalPrefixes.includes(zip.substring(0, 3))) {
                    Swal.fire({
                        icon: 'warning',
                        title: currentLang === 'en' ? 'Continental US Zip Code Required' : 'Zip Code Continental Requerido',
                        text: currentLang === 'en' 
                            ? 'The zip code you entered is outside the continental US. Please enter the continental US zip code where you want us to deliver the container for loading.'
                            : 'El código postal ingresado está fuera de EE. UU. continental. Por favor, introduzca el código postal dentro de Estados Unidos donde desea que entreguemos el contenedor para ser cargado.'
                    });
                    return;
                }
                
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
            if (selections.size.includes("20' HC")) apiSize = "20hc";
            else if (selections.size.includes("40' STD")) apiSize = "40std";
            else if (selections.size.includes("40' HC") || selections.size.includes("40' High Cube")) apiSize = "40hc";
            else if (selections.size.includes("45'")) apiSize = "45hc";
            
            const isNew = selections['container-condition'] === 'New';
            if (selections.type === 'Reefer') {
                const prefix = selections.size.includes("20") ? "20" : "40";
                apiSize = isNew ? `${prefix}new` : `${prefix}func`;
            }
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

                if (data.requires_manual_quote) {
                    selections.subtotal = 0;
                    selections.total = 0;
                    selections.discount = 0;
                    selections.exportFee = 0;
                    selections.shippingTotal = 0;
                    selections.pricePerUnit = 0;
                    
                    if (container.classList.contains('price-preview-details')) {
                        container.innerHTML = `
                            ${isExportFlow() ? exportNoticeHtml() : ''}
                            <div style="text-align: center; padding: 20px;">
                                <p style="font-size: 1.1rem; color: #333; margin-bottom: 15px;">
                                    ${isExportFlow()
                                        ? (currentLang === 'en'
                                            ? "A specialist will confirm the price of the certified container. Ocean freight to the destination country is not included."
                                            : "Un especialista confirmará el precio del contenedor certificado. El flete marítimo al país de destino no está incluido.")
                                        : (currentLang === 'en' 
                                            ? "Due to high demand and varying rates for your location, we quote this order upon request." 
                                            : "Debido a la alta demanda y variaciones en tarifas para su ubicación, cotizamos este pedido bajo solicitud.")}
                                </p>
                                <p style="font-size: 1rem; color: #555;">
                                    ${currentLang === 'en'
                                        ? "Please proceed to the next step so a specialist can contact you with the exact quote."
                                        : "Continúe al siguiente paso para que un especialista le asigne la cotización exacta."}
                                </p>
                            </div>
                        `;
                    } else if (container.classList.contains('final-summary-details')) {
                        let html = buildSummaryMetaHtml(true);
                        html += `
                            <hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;">
                            <div class="summary-item total-line" style="font-size: 1.25rem; color: var(--primary-color); margin-top: 10px; align-items: flex-start;">
                                <strong>${isExportFlow() ? t["buy-summary-total-export"] : t["buy-summary-total"]}:</strong> 
                                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                                    <span style="font-weight: 700; font-size: 1.1rem;">${currentLang === 'en' ? 'To Be Determined' : 'Por Determinar'}</span>
                                </div>
                            </div>
                            ${exportPriceFooterHtml()}
                        `;
                        container.innerHTML = html;
                    }
                    return;
                }

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

                const includeContact = container.classList.contains('final-summary-details');
                let html = buildSummaryMetaHtml(includeContact);

                const deliveryIncludedText = (!isExportFlow() && mode !== 'rent' && isDelivery) ? (currentLang === 'en' ? '(Delivery included)' : '(Envío incluido)') : '';
                const totalLabel = isExportFlow() ? t["buy-summary-total-export"] : t["buy-summary-total"];
                const money = (n) => `$${Math.max(0, n).toLocaleString()}`;

                html += `<hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;">`;

                if (mode === 'rent') {
                    const logisticsRoundtrip = shippingTotal;
                    const oneWayLogistics = logisticsRoundtrip / 2;
                    html += `
                    <div class="summary-item"><strong>${t["rent-summary-monthly"]}:</strong> <span>${money(baseSubtotal)}</span></div>
                    ${isDelivery ? `
                    <div class="summary-item"><strong>${t["rent-summary-delivery"]}:</strong> <span>${money(oneWayLogistics)}</span></div>
                    <div class="summary-item"><strong>${t["rent-summary-pickup"]}:</strong> <span>${money(oneWayLogistics)}</span></div>
                    ` : ''}
                    <div class="summary-item total-line" style="font-size: 1.25rem; color: var(--primary-color); margin-top: 10px; align-items: flex-start;">
                        <strong>${t["rent-summary-first-month"]}:</strong>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="font-weight: 700;">${money(total)}</span>
                        </div>
                    </div>
                    <div class="summary-item" style="margin-top: 6px;">
                        <strong>${t["rent-summary-next-months"]}:</strong>
                        <span style="font-weight: 700; color: var(--primary-color);">${money(baseSubtotal)}</span>
                    </div>
                    <p class="export-price-note">${t["rent-summary-hint"]}</p>
                    `;
                } else {
                    html += `
                    <div class="summary-item total-line" style="font-size: 1.25rem; color: var(--primary-color); margin-top: 10px; align-items: flex-start;">
                        <strong>${totalLabel}:</strong> 
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="font-weight: 700;">${money(total)}</span>
                            ${deliveryIncludedText ? `<small style="color: #888; font-size: 0.9rem; font-weight: normal; margin-top: 4px;">${deliveryIncludedText}</small>` : ''}
                        </div>
                    </div>
                    ${exportPriceFooterHtml()}
                    `;
                }

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
            
            if (stepId === 'export-port') {
                const portInput = viewEl.querySelector(`#${mode}-export-port`);
                const portNextBtn = viewEl.querySelector(`#${mode}-btn-port-next`);
                if (portInput && portNextBtn && !portNextBtn.dataset.bound) {
                    portNextBtn.dataset.bound = 'true';
                    portInput.addEventListener('input', () => {
                        portNextBtn.disabled = !portInput.value.trim();
                    });

                    portNextBtn.addEventListener('click', () => {
                        selections['export-port'] = portInput.value.trim();
                        viewEl.querySelector(`#${mode}-step-export-port`).style.display = 'none';
                        currentIndex++;
                        const nextStep = steps[currentIndex];
                        prepareStep(nextStep);
                        const nextEl = viewEl.querySelector(`#${mode}-step-${nextStep}`);
                        nextEl.style.display = 'block';
                        nextEl.classList.add('fade-in');
                    });
                }
            }
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
                        steps = ['condition', 'logistics-details', 'export-port', 'size', 'qty', 'container-condition', 'type', 'payment-method', 'price', 'contact'];
                        selections['delivery-mode'] = 'Pickup';
                        selections['export-action'] = 'Buy';
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
        
        viewEl.querySelector('.btn-get-pricing').addEventListener('click', async (e) => {
            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = currentLang === 'en' ? 'Sending Request...' : 'Enviando Solicitud...';
            btn.disabled = true;

            const summary = `
CONFIGURATION SUMMARY
---------------------------------
Logistics: ${selections['delivery-mode']}${isExportFlow() ? ' (United States)' : ''}
Optimal Location: ${selections.bestDepot}
Details: ${selections['logistics-details']}
Distance: ${selections.distance.toFixed(1)} miles
Shipping Cost: $${selections.shippingCost}
Size: ${selections.size}
Quantity: ${selections.quantity}
Type of Service: ${isExportFlow() ? 'Export SALE (certified container, ocean freight NOT included)' : selections.condition}${isExportFlow() ? `\nPlanned Destination: ${selections['export-port']} (customer arranges ocean freight)` : ''}
Condition: ${selections['container-condition']}
Climate: ${selections.type}
Payment: ${selections['payment-method']}

PRICING DETAILS
---------------------------------
Unit Price: $${selections.pricePerUnit.toLocaleString()}
Subtotal${selections.exportFee > 0 ? ' (Includes Export Certificate)' : ''}: $${selections.subtotal.toLocaleString()}
Shipping Total: $${selections.shippingTotal.toLocaleString()}
${selections.discount > 0 ? `Promo Discount: -$${selections.discount}\n` : ''}${isExportFlow() ? 'TOTAL (container + certificate only)' : (mode === 'rent' ? 'FIRST MONTH DUE (rent + delivery + pickup)' : 'TOTAL PRICE')}: $${selections.total.toLocaleString()}
${mode === 'rent' ? `FOLLOWING MONTHS (rent only): $${selections.subtotal.toLocaleString()}\nNOTE: First month includes delivery and pickup. After that, only monthly rent.\n` : ''}${isExportFlow() ? 'NOTE: Ocean freight to the destination country is NOT included.\n' : ''}
CONTACT INFORMATION
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

            const orderSaved = await submitOrderToCallLogs(btn, originalText, {
                name: templateParams.name,
                phone: templateParams.phone_number,
                service: templateParams.service,
                message: templateParams.message,
                amount: selections.total,
                delivery_place: selections.zip || selections['logistics-details'],
                size: selections.size,
                city: selections.bestDepot || ''
            });

            if (!orderSaved) return;

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
                    <p data-i18n="trans-p">${t["trans-p"]}</p>
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
                            <p class="step-hint" data-i18n="trans-step1-hint">${t["trans-step1-hint"]}</p>
                            <div class="options-grid">
                                <div class="option-card" data-value="20'"><i class="fas fa-box"></i><span>${t["buy-opt-20"]}</span><small class="option-card-desc">${t["buy-opt-20-desc"]}</small></div>
                                <div class="option-card" data-value="40' STD"><i class="fas fa-boxes"></i><span>${t["buy-opt-40std"]}</span><small class="option-card-desc">${t["buy-opt-40std-desc"]}</small></div>
                                <div class="option-card" data-value="40' HC"><i class="fas fa-boxes"></i><span>${t["buy-opt-40"]}</span><small class="option-card-desc">${t["buy-opt-40-desc"]}</small></div>
                                <div class="option-card" data-value="45'"><i class="fas fa-boxes"></i><span>${t["buy-opt-45"]}</span><small class="option-card-desc">${t["buy-opt-45-desc"]}</small></div>
                            </div>
                        </div>
                        <!-- Step 1.5: Quantity -->
                        <div class="buy-step" id="trans-step-qty" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="size"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="buy-step-qty">${t["buy-step-qty"] || "Select Quantity"}</h3>
                            <p class="step-hint" data-i18n="trans-step-qty-hint">${t["trans-step-qty-hint"]}</p>
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
                            <p class="step-hint" data-i18n="trans-step2-hint">${t["trans-step2-hint"]}</p>
                            <div class="options-grid">
                                <div class="option-card" data-value="Empty"><i class="fas fa-cube"></i><span>${t["trans-opt-empty"]}</span><small class="option-card-desc">${t["trans-opt-empty-desc"]}</small></div>
                                <div class="option-card" data-value="FullUnder"><i class="fas fa-boxes"></i><span>${t["trans-opt-full-under"]}</span><small class="option-card-desc">${t["trans-opt-full-under-desc"]}</small></div>
                                <div class="option-card" data-value="FullOver"><i class="fas fa-cubes"></i><span>${t["trans-opt-full-over"]}</span><small class="option-card-desc">${t["trans-opt-full-over-desc"]}</small></div>
                            </div>
                        </div>
                        <!-- Step 3: Zip Codes -->
                        <div class="buy-step" id="trans-step-route" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="status"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step3">${t["trans-step3"]}</h3>
                            <p class="step-hint" data-i18n="trans-step3-hint">${t["trans-step3-hint"]}</p>
                            <div class="form-group" style="margin-top: 20px;">
                                <label class="step-hint" style="display:block; text-align:left; margin: 0 0 6px; max-width: none;" for="zip-pickup">${t["trans-zip-pickup-hint"]}</label>
                                <input type="text" id="zip-pickup" placeholder="${t["trans-zip-pickup"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <label class="step-hint" style="display:block; text-align:left; margin: 0 0 6px; max-width: none;" for="zip-delivery">${t["trans-zip-delivery-hint"]}</label>
                                <input type="text" id="zip-delivery" placeholder="${t["trans-zip-delivery"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
                                <button class="btn btn-primary" id="btn-submit-route" style="width: 100%; margin-top: 20px;">${t["buy-btn-next"]}</button>
                            </div>
                        </div>
                        <!-- Step 4: Contact Info -->
                        <div class="buy-step" id="trans-step-contact" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="route"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step-contact">${t["trans-step-contact"]}</h3>
                            <p class="step-hint" data-i18n="trans-step-contact-hint">${t["trans-step-contact-hint"]}</p>
                            <div class="form-group" style="margin-top: 20px;">
                                <div id="trans-contact-prices" style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #eee; text-align: left;">
                                    <div id="trans-vehicle-info-contact" style="text-align: center; margin-bottom: 15px; display: none;">
                                        <img id="trans-vehicle-img-contact" src="" alt="Vehicle" style="max-width: 100%; max-height: 150px; border-radius: 8px; object-fit: cover;">
                                        <p id="trans-vehicle-name-contact" style="margin-top: 10px; font-weight: 600; color: #333;"></p>
                                    </div>
                                    <p style="margin-bottom: 2px; color: #333; font-size: 1.1rem;"><strong>${currentLang === 'en' ? 'Flexible (En Route)' : 'Flexible (En Ruta)'}:</strong> $<span class="contact-price-flexible">0.00</span></p>
                                    <p style="font-size: 0.85rem; color: #666; margin-bottom: 15px;"><em>${currentLang === 'en' ? '(When our trucks are already near the pickup location)' : '(Cuando nuestros camiones estén cerca del lugar de recogida)'}</em></p>
                                    <p style="margin-bottom: 2px; color: #333; font-size: 1.1rem;"><strong>${currentLang === 'en' ? 'Immediate Dispatch' : 'Servicio Inmediato'}:</strong> $<span class="contact-price-immediate">0.00</span></p>
                                    <p class="trans-immed-note" style="font-size: 0.85rem; color: #666; margin-bottom: 0;"><em>${currentLang === 'en' ? '(We send a truck from our yard as soon as possible)' : '(Mandamos un camión desde nuestro patio lo antes posible)'}</em></p>
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
                        extra_service: selections.status === 'Empty',
                        crane_service: selections.status === 'Full' || selections.status === 'FullOver',
                        cargo_case: selections.status === 'Empty' ? 'empty'
                            : selections.status === 'FullUnder' ? 'loaded_under_14000'
                            : (selections.status === 'FullOver' || selections.status === 'Full') ? 'loaded_over_14000'
                            : undefined
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
                
                // Cargo case fee (empty / under 14k / over 14k) is already included in the API totals.
                selections.priceFlexible = costDirect * multiplier;
                selections.priceImmediate = costImmediate * multiplier;
                
                transView.querySelector('.contact-price-flexible').textContent = selections.priceFlexible.toFixed(2);
                transView.querySelector('.contact-price-immediate').textContent = selections.priceImmediate.toFixed(2);
                const immedNote = transView.querySelector('.trans-immed-note em');
                if (immedNote) {
                    const isCrane = selections.status === 'FullOver' || selections.status === 'Full';
                    immedNote.textContent = isCrane
                        ? (currentLang === 'en'
                            ? '(Crane dispatched from our Miami hub as soon as possible)'
                            : '(La grúa sale desde nuestro hub de Miami lo antes posible)')
                        : (currentLang === 'en'
                            ? '(We send a truck from our nearest yard as soon as possible)'
                            : '(Mandamos un camión desde el patio más cercano lo antes posible)');
                }
                
                const vehicleImgContact = transView.querySelector('#trans-vehicle-img-contact');
                const vehicleNameContact = transView.querySelector('#trans-vehicle-name-contact');
                const vehicleInfoContact = transView.querySelector('#trans-vehicle-info-contact');
                
                if (selections.status === 'Empty' || selections.status === 'FullUnder') {
                    vehicleImgContact.src = 'assets/transport.png';
                    vehicleNameContact.innerText = currentLang === 'en' ? 'Pick up truck with tilt trailer' : 'Camioneta Pick-up con Tráiler Inclinable';
                    vehicleInfoContact.style.display = 'block';
                } else if (selections.status === 'FullOver' || selections.status === 'Full') {
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
                transView.querySelector('.summary-status').textContent =
                    selections.status === 'Empty' ? t['trans-opt-empty']
                    : selections.status === 'FullUnder' ? t['trans-opt-full-under']
                    : (selections.status === 'FullOver' || selections.status === 'Full') ? t['trans-opt-full-over']
                    : (selections.status || '-');
                transView.querySelector('.summary-route').textContent = `${selections.pickup} ➔ ${selections.delivery}`;
                transView.querySelector('.summary-contact').textContent = `${selections.contact.name} (${selections.contact.email}) - ${selections.contact.phone}`;
                if (selections.priceFlexible !== undefined && selections.priceImmediate !== undefined) {
                    transView.querySelector('.summary-price-flexible').textContent = selections.priceFlexible.toFixed(2);
                    transView.querySelector('.summary-price-immediate').textContent = selections.priceImmediate.toFixed(2);
                }
                
                const vehicleImgSummary = transView.querySelector('#trans-vehicle-img-summary');
                const vehicleNameSummary = transView.querySelector('#trans-vehicle-name-summary');
                const vehicleInfoSummary = transView.querySelector('#trans-vehicle-info-summary');
                
                if (selections.status === 'Empty' || selections.status === 'FullUnder') {
                    vehicleImgSummary.src = 'assets/transport.png';
                    vehicleNameSummary.innerText = currentLang === 'en' ? 'Pick up truck with tilt trailer' : 'Camioneta Pick-up con Tráiler Inclinable';
                    vehicleInfoSummary.style.display = 'block';
                } else if (selections.status === 'FullOver' || selections.status === 'Full') {
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

        transView.querySelector('.btn-get-pricing').addEventListener('click', async (e) => {
            const btn = e.target;
            const originalText = btn.innerText;
            btn.innerText = currentLang === 'en' ? 'Sending Request...' : 'Enviando Solicitud...';
            btn.disabled = true;

            const transStatusLabel = selections.status === 'Empty' ? t['trans-opt-empty']
                : selections.status === 'FullUnder' ? t['trans-opt-full-under']
                : (selections.status === 'FullOver' || selections.status === 'Full') ? t['trans-opt-full-over']
                : (selections.status || '-');
            const summary = `
ðŸš› TRANSPORTATION QUOTE REQUEST
---------------------------------
Size: ${selections.size}
Quantity: ${selections.quantity}
Status: ${transStatusLabel}
Route: ${selections.pickup} ➔ ${selections.delivery}
Est. Price (Flexible): $${selections.priceFlexible ? selections.priceFlexible.toFixed(2) : '0.00'}
Est. Price (Immediate): $${selections.priceImmediate ? selections.priceImmediate.toFixed(2) : '0.00'}

ðŸ‘¤ CONTACT INFORMATION
---------------------------------
Name: ${selections.contact.name}
Email: ${selections.contact.email}
Phone: ${selections.contact.phone}
            `.trim();

            await submitOrderToCallLogs(btn, originalText, {
                name: selections.contact.name,
                phone: selections.contact.phone,
                service: 'Transportation Quote',
                message: summary,
                amount: selections.priceImmediate || selections.priceFlexible,
                delivery_place: `${selections.pickup || ''} -> ${selections.delivery || ''}`,
                size: selections.size,
                city: selections.delivery || selections.pickup || ''
            });
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

        craneView.querySelector('.btn-get-pricing').addEventListener('click', async (e) => {
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

            await submitOrderToCallLogs(btn, originalText, {
                name: selections.contact.name,
                phone: selections.contact.phone,
                service: 'Crane Service Quote',
                message: summary,
                amount: selections.priceImmediate || selections.priceFlexible,
                delivery_place: `${selections.pickup || ''} -> ${selections.delivery || ''}`,
                size: selections.size,
                city: selections.delivery || selections.pickup || ''
            });
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
    const validHashViews = ['home', 'gallery', 'buy', 'rent', 'trans', 'crane'];
    if (window.location.hash && !validHashViews.includes(window.location.hash.substring(1))) {
        showView('home', true);
        setTimeout(() => {
            try {
                const el = document.querySelector(window.location.hash);
                if (el) {
                    const y = el.getBoundingClientRect().top + window.scrollY - 80;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            } catch(e) {}
        }, 100);
    } else if (!window.location.hash || window.location.hash === '#home') {
        showView('home');
    }

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
            // Auto-linkify https:// URLs, then render bold and newlines
            // Using negative lookbehind to avoid wrapping URLs that are already inside href='...'
            const processed = text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>')
                .replace(/(?<!href=['"])(https?:\/\/[^\s<"']+)/g, '<a href="$1" target="_blank" style="color:#c8102e;text-decoration:underline;font-weight:bold;word-break:break-all;">$1</a>');
            div.innerHTML = processed;
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
            // Do not auto-open the chat if the user navigated directly to the gallery or dimensions
            if (window.location.hash !== '#gallery' && window.location.hash !== '#container-dimensions') {
                aiChatWindow.classList.add('active');
                aiChatBtn.style.display = 'none';
            }
            sendToCore('hello');
        }, 1000);
    }

});

