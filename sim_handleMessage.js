const input = "20' 33606";
const session = { step: 0, lang: 'ES' };
let step = Number(session.step) || 0;
let lang = 'ES';
const chatDict = {
    'ES': { step1_msg: "¡Hola! Soy tu asesor", step1_btns: ['Comprar'] },
    'EN': { step1_msg: "Hi", step1_btns: ['Buy'] }
};
const dict = chatDict[lang];

// Fake Gemini output for "20' 33606"
const extracted = { intent: "quote", size: "20'", zip: "33606", action: null, condition: null, type: null };

if (extracted.intent === 'greeting' || input.toLowerCase() === 'hola' || input.toLowerCase() === 'hello') {
    console.log("SENDING: Hello! Welcome to RP Tulipan / ¡Hola! Bienvenido a RP Tulipan.");
} else {
    // Merge extracted data into session
    const updates = { lang };
    if (extracted.size) updates.size = extracted.size;
    if (extracted.zip) updates.zip = extracted.zip;
    if (extracted.action) updates.action = extracted.action;
    if (extracted.condition) updates.condition = extracted.condition;
    if (extracted.type) updates.type = extracted.type;
    
    Object.assign(session, updates); // local update

    const needsQuote = extracted.intent === 'quote' || session.action || session.size || session.zip;
    
    if (needsQuote) {
        if (!session.action) {
            console.log("SENDING:", dict.step1_msg);
        } else {
            console.log("PROCEEDING...");
        }
    } else {
        console.log("FELL THROUGH TO NOTHING");
    }
}
