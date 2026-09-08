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
    choice: ["Hola quiero comprar un contenedor", "usado", "33139", "y los nuevos son mucho mas caros?", "no esta bien quiero el de 40' usado pero sin filtraciones"],
    // Reefer prices must not fall back to dry prices
    reefer: ["Hola quiero comprar un refrigerado", "usado", "Funcionando", "33139"],
    // A straight price question on first contact should get a warm welcome, not a cold prompt
    welcome: ["cuanto cuesta un contenedor"],
    // "quiero ver el precio" must not trigger the photo gallery
    seeprice: ["Hola quiero comprar un contenedor", "usado", "40'", "33139", "quiero ver el precio del 20"],
    // Asking which size to pick must not dump the dimensions link
    advice: ["Hola quiero comprar un contenedor", "que medida me recomiendas para guardar muebles?"],
    // Transport of a container the customer already owns
    transport: ["necesito mover un contenedor de 40", "33139 32470", "vacío"],
    // Rent asks size first, then condition, then zip
    rent: ["quiero alquilar un contenedor", "20'", "usado", "33139"],
    // Photos: full policy first, short human follow-up after
    photos: ["quiero comprar un contenedor usado de 40 para el 33139", "me mandas fotos?", "y no me puedes mandar fotos ahora?"],
    // English must stay in English throughout
    english: ["hi, i want to buy a used 40ft container", "33139", "does that include delivery?"],
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
