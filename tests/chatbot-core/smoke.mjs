// Live smoke test against the deployed chatbot-core function.
// Usage: node tests/chatbot-core/smoke.mjs [scenario]
const URL = "https://xtrceqpuwqetzslwxxux.supabase.co/functions/v1/chatbot-core";
const KEY = "sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni";

async function say(sender, message) {
    const res = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ sender_id: sender, message }),
    });
    const json = await res.json().catch(() => ({}));
    const texts = (json.actions || []).map((a) => a.text).filter(Boolean);
    return texts.join("\n---\n") || JSON.stringify(json);
}

const SCENARIOS = {
    // The conversation the customer reported: a used-40' choice was answered as a price complaint
    choice: ["Hola quiero comprar un contenedor", "usado", "Dry (Estándar)", "33139", "y los nuevos son mucho mas caros?", "no esta bien quiero el de 40' usado pero sin filtraciones"],
    // Reefer prices must not fall back to dry prices
    reefer: ["Hola quiero comprar un refrigerado", "usado", "20'", "Funcionando", "33139"],
    // A straight price question on first contact should get a warm welcome, not a cold prompt
    welcome: ["cuanto cuesta un contenedor"],
    // "quiero ver el precio" must not trigger the photo gallery
    seeprice: ["Hola quiero comprar un contenedor", "usado", "40'", "Dry (Estándar)", "33139", "quiero ver el precio del 20"],
    // Asking which size to pick must not dump the dimensions link
    advice: ["Hola quiero comprar un contenedor", "que medida me recomiendas para guardar muebles?"],
    // Transport of a container the customer already owns
    transport: ["necesito mover un contenedor de 40", "33139 32470", "vacío"],
    // Rent asks size first, then condition, then zip
    rent: ["quiero alquilar un contenedor", "20'", "usado", "33139"],
    // Photos: full policy first, short human follow-up after
    photos: ["quiero comprar un contenedor seco usado de 40 para el 33139", "me mandas fotos?", "y no me puedes mandar fotos ahora?"],
    // English must stay in English throughout
    english: ["hi, i want to buy a used 40ft dry container", "33139", "does that include delivery?"],
    // Asking which type the quote covers must be answered, not treated as a reefer order
    // The widget always opens with "hola", which is what sets the session language
    drytype: ["hola", "Comprar", "Usado", "Dry (Estándar)", "33139", "estos precios son de contenedores secos o refrigerados?", "ok quiero un refrigerado entonces"],
    // Switching to reefer after a dry quote must quote reefers after the motor question
    dry2reefer: ["hola", "Comprar", "Usado", "Dry (Estándar)", "33139", "estos precios son de refrigerados?", "quiero saber el precio de los refrigerados", "Funcionando"],
    // After the photo policy, hesitation about buying without seeing must get a warm sales reply
    photobuy: ["hola", "Comprar", "Usado", "Dry (Estándar)", "32139", "puedo ver fotos del contenedor?", "mmm no me gusta comprar sin antes ver lo que compro"],
    // Post-quote: permission question must not jump to name; payment stays in Spanish
    postquote: ["hola", "Comprar", "Usado", "45'", "33139", "pago cuando lo reciba", "cuando lo recibo?", "lo quiero poner en un terreno detras de mi casa, necesito algun permiso para eso?"],
    // Location question after Spanish quote must stay in Spanish
    location: ["hola", "Comprar", "Usado", "20'", "Dry (Estándar)", "33139", "donde estan ubicados?"],
    // Bonita→Naples transport: street numbers must not become ZIPs; no sale drift
    transport_bonita: [
        "Cost to transport 40' hc from Bonita Springs to Naples FL",
        "26571 Chaparel Dr, Bonita Springs. To 5312 Palmetto Woods Dr, Naples",
        "Empty",
        "34135 to 34119",
        "Container is in 34135 need delivered to 34119",
    ],
    // Customer wanted 2x40' good condition dry — not new reefer
    reefer_reject: [
        "Hi, I'm looking for two 40' in good condition",
        "34639",
        "I don't need new reefer",
        "I am looking for a regular container",
        "Prices",
        "Forget it",
    ],
};

const which = process.argv[2];
const names = which ? [which] : Object.keys(SCENARIOS);

for (const name of names) {
    const sender = `web_smoke_${name}_${Date.now().toString(36)}`;
    console.log(`\n${"=".repeat(70)}\nSCENARIO: ${name}\n${"=".repeat(70)}`);
    for (const msg of SCENARIOS[name]) {
        console.log(`\n>> USER: ${msg}`);
        const reply = await say(sender, msg);
        console.log(`<< BOT: ${reply}`);
    }
}
