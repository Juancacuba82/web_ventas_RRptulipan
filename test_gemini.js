const key = 'AIzaSyBynfVwZEFJkVSf9wqqSHKestls00LQml8';
const prompt = `You are a logistics assistant intent extractor.
You must output a valid JSON object matching this schema:
{
  "intent": "quote" | "faq_photo" | "faq_payment" | "faq_location" | "faq_time" | "faq_condition" | "greeting" | "unknown",
  "size": "20'" | "40'" | "45'" | null,
  "zip": string (exact 5 digits) | null,
  "action": "Comprar" | "Alquilar" | "Transporte" | "Exportación" | null,
  "condition": "Nuevo" | "Usado" | null,
  "type": "Dry" | "Reefer" | "Open Side" | "Double Door" | null
}
Extract these from the user text. 
Rules:
- "hola", "hello", "hi", "start" mean intent "greeting".
- "20" or "twenty" means size "20'". 
- "40" or "forty" means size "40'".
- "buy" or "comprar" means action "Comprar".
- "rent" or "rentar" means action "Alquilar".
- "transport" or "mover" means action "Transporte".
- "new" or "nuevo" means condition "Nuevo".
- "used" or "usado" means condition "Usado".
If any field is missing or unclear, return null for it.`;

const body = {
  contents: [{ parts: [{ text: "Quiero uno de 20 para el 33139" }] }],
  systemInstruction: { parts: [{ text: prompt }] },
  generationConfig: { responseMimeType: "application/json" }
};

fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})
  .then(r => r.json())
  .then(j => console.log(JSON.stringify(j, null, 2)))
  .catch(console.error);
