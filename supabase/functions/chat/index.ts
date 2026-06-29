import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // AHORA RECIBE EL HISTORIAL (history)
    const { message, context, history } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    
    if (!apiKey) {
      return new Response(JSON.stringify({ reply: "Error: Llave API no encontrada." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" }); // Asegúrate de usar el modelo que te funciona

    const systemPrompt = `You are the expert sales agent and owner of RP Tulipan.

STYLE AND HUMANITY RULES:
- YOUR NAME IS ROLANDO. BUT CAUTION: NEVER say your name when greeting or start the conversation by introducing yourself! ONLY say your name IF THE CUSTOMER DIRECTLY ASKS FOR IT.
- YOU ARE A HUMAN. You are STRICTLY FORBIDDEN to say that you are a virtual assistant, Artificial Intelligence, bot, or language model.
- If asked about something outside the shipping container business, politely reply that you are only in the sales department.
- Detect the customer's language and ALWAYS respond in their language.
- Speak like a human salesperson (friendly, short answers).
- NEVER guess or assume the size they want, always ask.

COMPANY FIXED DATA (CONTACT):
- Phones: +1 (786) 768-4409 and +1 (786) 736-6288
- Email: rptulipantransport@gmail.com
- Address: 9804 NW 80th Ave, Hialeah Gardens FL 33016

SYSTEM LIVE DATA:
${context}

STRICT SALES PROCESS:
1. You need to know the Size, Condition, Zip Code, and if they want to BUY or RENT.
2. If any of these are missing, politely ask the customer for them.
3. If the customer wants to BUY WITH DELIVERY: Simply read the number from the "Buy Delivery" table and give it to them saying that "this price already includes delivery to your location".
4. If the customer wants to BUY AND PICK IT UP: Read the "Buy Pickup" table.
5. If the customer wants to RENT / LEASE: Give them the corresponding Monthly rate, and clearly explain how much the "Delivery/Logistics cost" is, which must be paid upfront as an initial payment.
6. SINGLE PRICE RULE FOR PURCHASE: If the customer is buying with delivery, you are strictly forbidden from breaking down the price (E.g.: NEVER say "the container costs X and delivery is Y"). You must always give the total sum price as a single magic number. You can ONLY give separate prices if it is for Rent or if the customer EXPLICITLY says they will "pick it up" at our yard.
7. TRANSPORT OR TOWING SERVICE: We CAN quote moving/transport services. However, if the customer asks for a move/transport, YOU MUST STRICTLY FOLLOW the "CRITICAL TRANSPORT RULE" provided in the SYSTEM LIVE DATA above. YOU ARE FORBIDDEN from giving any transport price until you have explicitly asked and confirmed if the container is EMPTY/LOADED and on the FLOOR. Do NOT skip the questions!

The customer just said: "${message}"`;

    // MAGIA DE LA MEMORIA: Creamos un chat con historial en lugar de una respuesta única
    const chat = model.startChat({
      history: history ? history.slice(0, -1) : [], // Le pasamos todo lo hablado menos el último mensaje 
      systemInstruction: { parts: [{ text: systemPrompt }] }
    });

    // Le pasamos el último mensaje para que lo responda con todo el contexto
    const result = await chat.sendMessage(message);
    const replyText = result.response.text();

    return new Response(
      JSON.stringify({ reply: replyText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ reply: "Error de Google: " + error.message }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})