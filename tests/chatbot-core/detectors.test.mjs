// Behaviour lock for the chatbot's message-routing helpers.
// Run: node tests/chatbot-core/build-harness.mjs
//      node --experimental-strip-types --test tests/chatbot-core/detectors.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import * as core from "./.generated/core.ts";

const quotedSession = (over = {}) => ({
    step: 6,
    final_amount: 1800,
    action: "Comprar",
    condition: "Usado",
    type: "Dry",
    size: "20' & 40'",
    zip: "33139",
    lang: "ES",
    quoted_conditions: ["Usado"],
    final_form_amount: JSON.stringify({ quoted_prices: { "20'": 1500, "40'": 1800 } }),
    ...over,
});

test("language detection follows the last meaningful message", () => {
    assert.equal(core.detectMessageLanguage("quiero comprar un contenedor", null, null), "ES");
    assert.equal(core.detectMessageLanguage("i want to buy a container", null, null), "EN");
    // A bare zip inherits the language already established
    assert.equal(core.detectMessageLanguage("33139", "ES", null), "ES");
    assert.equal(core.detectMessageLanguage("33139", "EN", null), "EN");
    // After a Spanish greeting, a full English question must switch to English
    assert.equal(core.detectMessageLanguage("Where are you located?", "ES", [
        { role: "user", content: "hola" },
        { role: "assistant", content: "¡Hola! ¿En qué te puedo ayudar hoy?" },
    ]), "EN");
});

test("size extraction keeps STD vs HC straight", () => {
    assert.equal(core.extractSizeFromText("quiero un 20"), "20' STD");
    assert.equal(core.extractSizeFromText("quiero un 40 pies"), "40'");
    assert.equal(core.extractSizeFromText("un 20 high cube"), "20' HC");
    assert.equal(core.extractSizeFromText("45"), "45' HC");
});

test("condition words include plurals", () => {
    assert.equal(core.mentionsNewCondition("los nuevos"), true);
    assert.equal(core.mentionsUsedCondition("los usados"), true);
    assert.equal(core.extractConditionFromText("one trip please"), "Nuevo");
    assert.equal(core.extractConditionFromText("wwt"), "Usado");
});

test("WWT / looks-dont-matter / price-is-right means used, not a new-vs-used question", () => {
    const msg = "No leaks , doors close .  How it looks no concern. It's for short  term storage . \n   I'm looking for price is right deal !";
    assert.equal(core.mentionsUsedCondition(msg), true);
    assert.equal(core.extractConditionFromText(msg), "Usado");
    assert.equal(core.extractConditionFromText("sin filtraciones, las puertas cierran, el aspecto no me importa"), "Usado");
    assert.equal(core.extractConditionFromText("40ft the whole package deal how much"), null);
});

test("reefer wording maps to Reefer", () => {
    assert.equal(core.extractTypeFromText("quiero un refrigerado"), "Reefer");
    assert.equal(core.extractTypeFromText("un contenedor refrigerada"), "Reefer");
    assert.equal(core.extractTypeFromText("reefer container"), "Reefer");
    assert.equal(core.extractTypeFromText("open side"), "Open Side");
    assert.equal(core.extractTypeFromText("doble puerta"), "Double Door");
    assert.equal(core.extractTypeFromText("un contenedor de 40"), null);
});

test("service inference covers the three services", () => {
    assert.equal(core.inferServiceAction("quiero comprar un contenedor"), "Comprar");
    assert.equal(core.inferServiceAction("necesito alquilar uno"), "Alquilar");
    assert.equal(core.inferServiceAction("Hola ustedes rentan contenedores?"), "Alquilar");
    assert.equal(core.inferServiceAction("do you rent containers"), "Alquilar");
    assert.equal(core.inferServiceAction("necesito mover un contenedor"), "Transporte");
    assert.equal(core.inferServiceAction("Need one moved"), "Transporte");
    assert.equal(core.inferServiceAction("need it moved"), "Transporte");
    assert.equal(core.inferServiceAction("can you move it"), "Transporte");
    assert.deepEqual([...core.servicesNamedInMessage("Need one moved")], ["Transporte"]);
});

test("a rent conversation does not become a sale when they pick a size", () => {
    const hist = [
        { role: "user", content: "Hola ustedes rentan contenedores?" },
        { role: "assistant", content: "Sí, alquilamos contenedores. Solo ofrecemos contenedores de almacenamiento DRY para uso en Estados Unidos." },
    ];
    const data = { action: "Comprar", items: [{ action: "Comprar", size: "40'" }] };
    core.applyConversationInferences("de 40 pies", hist, data, { action: null });
    assert.equal(data.action, "Alquilar");
    assert.equal(data.items[0].action, "Alquilar");
    const kept = {};
    core.applyConversationInferences("usado", hist, kept, { action: "Alquilar", size: "40'" });
    assert.equal(kept.action, "Alquilar");
});

test("need one moved switches a buy session to transport without asking used vs new", () => {
    const buySession = { step: 2, action: "Comprar", size: "40'", lang: "EN" };
    const qd = core.quickDetect("Need one moved", "web_test", buySession);
    assert.equal(qd?.intent, "quote");
    assert.equal(qd?.extracted_data?.action, "Transporte");
    assert.equal(qd?.extracted_data?.items?.[0]?.action, "Transporte");
    assert.equal(qd?.extracted_data?.condition, undefined);
});

test("AI-extracted transport is not vetoed when the regex is incomplete", () => {
    assert.equal(core.resolveExtractedAction("Need one moved", "Comprar", "Transporte"), "Transporte");
    assert.equal(core.resolveExtractedAction("I already have the box, can you haul it?", "Comprar", "Transporte"), "Transporte");
    assert.equal(core.resolveExtractedAction("usado", "Alquilar", "Comprar"), "Alquilar");
    assert.equal(core.resolveExtractedAction("33139", "Transporte", "Comprar"), "Transporte");
    assert.equal(core.resolveExtractedAction("mejor lo alquilo", "Comprar", "Alquilar"), "Alquilar");
});

test("only an explicit mention can switch the service", () => {
    const named = (t) => [...core.servicesNamedInMessage(t)];
    // Neutral answers mid-flow must not name any service
    assert.deepEqual(named("usado"), []);
    assert.deepEqual(named("33139"), []);
    assert.deepEqual(named("20'"), []);
    assert.deepEqual(named("vacío"), []);
    assert.deepEqual(named("y el de 40?"), []);
    // Explicit requests do, including inflected Spanish forms
    assert.deepEqual(named("Comprar"), ["Comprar"]);
    assert.deepEqual(named("prefiero comprarlo"), ["Comprar"]);
    assert.deepEqual(named("mejor quiero rentarlo"), ["Alquilar"]);
    assert.deepEqual(named("necesito alquilar uno"), ["Alquilar"]);
    assert.deepEqual(named("necesito moverlo a mi terreno"), ["Transporte"]);
    assert.deepEqual(named("es para exportacion"), ["Exportacion"]);
});

test("lo quiero poner on my lot is not treated as order confirmation", () => {
    const s = quotedSession({ size: "45' HC", type: "Dry" });
    const msg = "lo quiero poner en un terreno detras de mi casa, necesito algun permiso para eso?";
    assert.equal(core.isReadyToProceed(msg, s), false);
    assert.equal(core.isOpenEducationalQuestion(msg, s), true);
    assert.match(core.buildSideQuestionReply(msg, "ES", s) || "", /permiso|condado|municipio/i);
});

test("transport scheduling is not the 1-3 day sales delivery window", () => {
    const move = quotedSession({ action: "Transporte", size: "40'" });
    const ask = "pero para que dia seria?";
    assert.equal(core.isSchedulingQuestion(ask), true);
    const reply = core.buildSideQuestionReply(ask, "ES", move) || "";
    assert.match(reply, /despacho|pactar|llama/i);
    assert.doesNotMatch(reply, /1 a 3 d[ií]as/i);
    const sale = core.buildSideQuestionReply("cuanto tarda la entrega?", "ES", quotedSession()) || "";
    assert.match(sale, /1 a 3 d[ií]as/i);
});

test("payment on delivery stays in Spanish after a Spanish quote", () => {
    const s = quotedSession({ size: "45' HC", type: "Dry", lang: "ES" });
    const msg = "pago cuando lo reciba";
    assert.equal(core.detectMessageLanguage(msg, "ES", s.history), "ES");
    assert.match(core.buildSideQuestionReply(msg, "ES", s) || "", /entrega|efectivo|Zelle/i);
    assert.doesNotMatch(core.buildSideQuestionReply(msg, "ES", s) || "", /Yes, we accept/i);
});

test("español por favor is recognised as a language switch", () => {
    assert.equal(core.detectLanguageSwitchRequest("español por favor"), "ES");
    assert.equal(core.detectLanguageSwitchRequest("english please"), "EN");
});

test("proceed is only triggered by real confirmations", () => {
    const s = quotedSession();
    assert.equal(core.isReadyToProceed("Sí, proceder", s), true);
    assert.equal(core.isReadyToProceed("lo quiero", s), true);
    assert.equal(core.isReadyToProceed("zelle", s), true);
    assert.equal(core.isReadyToProceed("efectivo", s), true);
    assert.equal(core.isReadyToProceed("si", s), true);
    assert.equal(core.isReadyToProceed("si como seria?", s), true);
    assert.equal(core.isReadyToProceed("lo quiero poner en mi terreno", s), false);
    assert.equal(core.isReadyToProceed("y los nuevos son mucho mas caros?", s), false);
    assert.equal(core.isReadyToProceed("cuanto cuesta el de 40?", s), false);
    assert.equal(core.isReadyToProceed("si el de 20", s), false);
});

test("after the Miami HC warning, yes 20 HC quotes instead of repeating the warning", () => {
    const warned = { size: "20' HC", condition: "Usado", hc_used_warn_shown: true, zip: "32720" };
    assert.equal(core.isHcUsedInsistRequest("yes 20' HC", warned), true);
    assert.equal(core.isHcUsedInsistRequest("HC", warned), true);
    assert.equal(core.isHcUsedInsistRequest("yes 20' HC", { size: "20' HC", condition: "Usado" }), true);
    assert.equal(core.isHcUsedInsistRequest("Quote 20' STD", warned), false);
    assert.equal(core.isHcUsedInsistRequest("20 ft high cube delivered to 32720", { size: null }), false);
});

test("name and phone in one message are contact details, not a FAQ", () => {
    const s = quotedSession({ quoted_conditions: ["Usado", "Nuevo"], condition: "Nuevo" });
    const contact = core.parseContactFromInput("Juan Carlos 7867684409");
    assert.equal(contact.name, null);
    assert.equal(contact.phone, "7867684409");
    assert.equal(core.parseContactFromInput("okay thank you!").name, null);
    assert.equal(core.parseContactFromInput("ok hagamsolo").name, null);
    assert.equal(core.parseContactFromInput("mi nombre es Jonh").name, null);
    assert.equal(core.isOrderConfirmationPhrase("ok hagamsolo"), true);
    assert.equal(core.isReadyToProceed("ok hagamsolo", s), true);
    assert.equal(core.isOpenEducationalQuestion("Juan Carlos 7867684409", s), false);
    assert.equal(core.isChoosingAlreadyQuotedCondition("prefiero el usado entonces", s), true);
    assert.equal(core.isReadyToProceed("prefiero el usado entonces", s), true);
    assert.equal(core.wantsQuoteRecalculation("prefiero el usado entonces", s, { condition: "Usado" }, {
        alternateSizeRequested: false, asksAlternatePrice: false, stdHcComparison: false, conditionComparison: false,
    }), false);
});

test("zelle after a quote is a payment choice, not a payment FAQ", () => {
    const s = quotedSession();
    assert.equal(core.isChoosingPaymentMethod("zelle"), true);
    assert.equal(core.isChoosingPaymentMethod("pago con zelle"), true);
    assert.equal(core.isPaymentPolicyQuestion("zelle"), false);
    assert.equal(core.isPaymentPolicyQuestion("¿cuándo pago?"), true);
    assert.equal(core.isOpenEducationalQuestion("zelle", s), false);
    assert.equal(core.buildSideQuestionReply("zelle", "ES", s), null);
    const payMsg = "20 std is good.how do you do the payment. Pay cash when delivered or pay before delivery";
    assert.equal(core.isPaymentPolicyQuestion(payMsg), true);
    assert.equal(core.isConversationalSideAsk(payMsg), true);
    assert.match(core.buildSideQuestionReply(payMsg, "EN", s) || "", /at delivery|Cash or Zelle/i);
    assert.equal(core.isOpenEducationalQuestion(payMsg, s), true);
});

test("asking the price of the other condition triggers a real re-quote", () => {
    const s = quotedSession();
    assert.equal(core.conditionPriceRequestFromInput("y los nuevos son mucho mas caros?", s), "Nuevo");
    assert.equal(core.asksOtherConditionPrice("y los nuevos son mucho mas caros?", s), "Nuevo");
    // Not a price question at all
    assert.equal(core.conditionPriceRequestFromInput("los usados tienen filtraciones?", s), null);
});

test("an explicit product choice is never read as a price complaint", () => {
    const s = quotedSession();
    assert.equal(core.statesProductChoice("no esta bien quiero el de 40' usado pero sin filtraciones"), true);
    assert.equal(core.isQuotedPriceClarificationQuestion("no esta bien quiero el de 40' usado pero sin filtraciones", s), false);
});

test("real price doubts are recognised as clarifications", () => {
    const s = quotedSession();
    assert.equal(core.isQuotedPriceClarificationQuestion("el de 40' es mas barato o me pasaste los precios mal?", s), true);
    assert.equal(core.isQuotedPriceClarificationQuestion("por que el 40 es mas barato?", s), true);
    // Before any quote exists there is nothing to clarify
    assert.equal(core.isQuotedPriceClarificationQuestion("los precios estan mal?", { step: 3 }), false);
});

test("price clarifications never trigger a recalculation", () => {
    const s = quotedSession();
    const opts = { alternateSizeRequested: false, asksAlternatePrice: false, stdHcComparison: false, conditionComparison: false };
    assert.equal(core.wantsQuoteRecalculation("el de 40' es mas barato o me pasaste los precios mal?", s, {}, opts), false);
    assert.equal(core.wantsQuoteRecalculation("y los nuevos son mucho mas caros?", s, {}, opts), true);
});

test("initial price inquiry gets the warm welcome path", () => {
    assert.equal(core.isInitialPriceInquiry("precios?"), true);
    assert.equal(core.isInitialPriceInquiry("cuanto cuesta un contenedor"), true);
    assert.equal(core.isInitialPriceInquiry("quiero saber los precios"), true);
    assert.equal(core.isInitialPriceInquiry("how much"), true);
    assert.equal(core.isInitialPriceInquiry("hola"), false);
    // Already concrete enough to quote: let the quoting flow take over
    assert.equal(core.isInitialPriceInquiry("cuanto cuesta un 40"), false);
    assert.equal(core.isInitialPriceInquiry("precio para comprar"), false);
});

test("a straight price question on first contact is welcomed, not quoted blindly", () => {
    const fresh = { step: 0 };
    const hit = core.quickDetect("cuanto cuesta un contenedor", "web_1", fresh);
    assert.equal(hit, null);
});

test("advice about rain is educational, not a canned used-vs-new overwrite", () => {
    const msg = "que me conviene mas para que mis cosas no se mojen";
    assert.equal(core.isOpenEducationalQuestion(msg, { action: "Comprar", step: 2 }), true);
    const ai = "El usado WWT está certificado contra filtraciones; el nuevo one-trip también sella. El usado suele alcanzar para patio.";
    const canned = "Perfecto. ¿Lo quieres **usado (WWT)** o **nuevo one-trip**?";
    assert.equal(core.joinWithoutRepeating(ai, canned), ai);
});

test("do you sell used is answered, not a ZIP request", () => {
    const msg = "Hola, buenas tardes, venden contenedores usados";
    assert.equal(core.isCatalogQuestion(msg), true);
    assert.equal(core.wantsQuoteNow(msg, { step: 0 }), false);
    assert.equal(core.isOpenEducationalQuestion(msg, { step: 0 }), true);
    assert.equal(core.isCatalogQuestion("Hola como estas, queria saber si vendes usados"), true);
    const polite = core.buildCatalogAvailabilityReply("queria saber si vendes usados", "ES");
    assert.match(polite, /s[ií].*usado/i);
    assert.doesNotMatch(polite, /qu[eé] m[aá]s te gustar[ií]a saber/i);
    assert.doesNotMatch(polite, /ind[ií]came qu[eé] medida/i);
    assert.equal(core.isCatalogQuestion("te hice una pregunta"), true);
    assert.equal(core.wantsQuoteNow("cuanto cuesta un usado a 33139", { step: 0 }), true);
    assert.equal(core.isCatalogQuestion("cuanto cuesta un usado a 33139"), false);
});

test("photo requests do not swallow price questions", () => {
    assert.equal(core.isPhotosRequest("me mandas fotos?"), true);
    assert.equal(core.isPhotosRequest("quiero verlo antes de comprar"), true);
    assert.equal(core.isPhotosRequest("can i see the container first"), true);
    // Regression: "quiero ver" must not hijack a pricing question
    assert.equal(core.isPhotosRequest("quiero ver el precio del 40"), false);
    assert.equal(core.isPhotosRequest("quiero ver cuanto cuesta"), false);
    assert.equal(core.isPhotosRequest("want to see the price"), false);
    // An explicit photo word still wins even next to a price word
    assert.equal(core.isPhotosRequest("me mandas fotos y el precio?"), true);
    assert.equal(core.mentionsPhotoWord("me mandas fotos y el precio?"), true);
    assert.equal(core.mentionsPhotoWord("quiero ver el precio"), false);
});

test("dimension requests do not swallow size selection", () => {
    assert.equal(core.isDimensionsRequest("cuales son las medidas del 40?"), true);
    assert.equal(core.isDimensionsRequest("what are the dimensions"), true);
    assert.equal(core.isDimensionsRequest("how long does delivery take"), false);
    // Regression: asking which size to pick is advice, not a dimensions link
    assert.equal(core.isDimensionsRequest("que medida me recomiendas?"), false);
    assert.equal(core.isDimensionsRequest("que medida necesito para almacenar muebles"), false);
    assert.equal(core.isDimensionsRequest("which size should i get"), false);
});

test("quickDetect answers buttons without calling the AI", () => {
    const fresh = { step: 0 };
    const buy = core.quickDetect("Comprar", "web_1", fresh);
    assert.ok(buy, "Comprar should be handled deterministically");
    assert.equal(buy.extracted_data.items[0].action, "Comprar");
    assert.equal(buy.intent, "quote");

    const hello = core.quickDetect("hola", "web_1", fresh);
    assert.equal(hello, null);
    assert.equal(core.isBareGreeting("hola"), true);
    assert.equal(core.isBareGreeting("buenas tardes"), true);
    assert.equal(core.isBareGreeting("quiero comprar"), false);

    const zip = core.quickDetect("33139", "web_1", { step: 5, action: "Comprar", size: "40' STD", condition: "Usado" });
    assert.ok(zip, "a bare zip should be handled deterministically");
    assert.equal(zip.extracted_data.zip, "33139");
});

test("transport option parsing", () => {
    assert.equal(core.parseTransportOption("flexible"), "Flexible");
    assert.equal(core.parseTransportOption("inmediato"), "Inmediato");
    assert.equal(core.parseTransportOption("hola"), null);
});

test("load status normalisation", () => {
    assert.equal(core.normalizeLoadStatus("Vacío"), "Vacio");
    assert.equal(core.normalizeLoadStatus("Cargado <14k"), "Cargado_Under14000");
    assert.equal(core.normalizeLoadStatus("Cargado >14k"), "Cargado_Over14000");
});

test("quoted price bookkeeping", () => {
    const s = quotedSession();
    assert.equal(core.hasQuotedPrice(s), true);
    assert.equal(core.hasQuotedPrice({ step: 5, final_amount: 100 }), false);
    assert.deepEqual(core.sessionQuotedConditions(s), ["Usado"]);
    assert.equal(core.sizeAlreadyInQuotedSet(s, "40' STD"), true);
});

test("what does WWT mean is an acronym answer, not the leak copy-paste", () => {
    const s = quotedSession({ size: "20' STD" });
    const meaning = core.buildSideQuestionReply("que significa WWT?", "ES", s) || "";
    assert.match(meaning, /significa|siglas/i);
    assert.match(meaning, /Wind & Water Tight/i);
    const leak = core.buildSideQuestionReply("me aseguras que no tiene filtraciones?", "ES", s) || "";
    assert.match(leak, /sin filtraciones/i);
    assert.notEqual(meaning, leak);

    const afterWwt = quotedSession({
        size: "20' STD",
        history: [{ role: "assistant", content: leak }],
    });
    const again = core.buildSideQuestionReply("que significa WWT?", "ES", afterWwt) || "";
    assert.match(again, /siglas|hermético|hermetico/i);
    assert.notEqual(again, leak);
});

test("Spanish word endings are matched, not just the stem", () => {
    const s = quotedSession();
    // "filtraciones", "descuentos", "garantía" all inflect past the stem in the regexes
    assert.ok(core.buildSideQuestionReply("lo quiero pero sin filtraciones", "ES", s, true));
    assert.ok(core.buildSideQuestionReply("hay descuentos para jubilados?", "ES", s, true));
    assert.equal(core.isOpenEducationalQuestion("tiene garantía?", s), true);
    assert.equal(core.isOpenEducationalQuestion("hay goteras?", s), true);
    // Price complaints with inflected verbs
    assert.equal(core.isQuotedPriceClarificationQuestion("creo que te equivocaste con los precios", s), true);
    assert.equal(core.isQuotedPriceClarificationQuestion("me pasaste los precios incorrectos?", s), true);
});

test("changing condition on an already-quoted size is a real re-quote", () => {
    // Only the new-unit prices are on record; asking for the used 40' must recalculate.
    // Quoted prices are keyed by normalizeSizeKey, e.g. "40std|Nuevo".
    const s = quotedSession({
        condition: "Nuevo",
        quoted_conditions: ["Nuevo"],
        final_form_amount: JSON.stringify({ quoted_prices: { "20std|Nuevo": 2650, "40std|Nuevo": 3550 } }),
    });
    assert.equal(core.sizeAlreadyInQuotedSet(s, "40'", "Usado"), false);
    assert.equal(core.sizeAlreadyInQuotedSet(s, "40'", "Nuevo"), true);
    // Without a condition it keeps the old size-only behaviour
    assert.equal(core.sizeAlreadyInQuotedSet(s, "40'"), true);

    const opts = { alternateSizeRequested: false, asksAlternatePrice: false, stdHcComparison: false, conditionComparison: false };
    const input = "no esta bien quiero el de 40' usado pero sin filtraciones";
    assert.equal(core.wantsQuoteRecalculation(input, s, { condition: "Usado", size: "40'" }, opts), true);
    // ...and the leak question still gets answered alongside whatever price is sent
    assert.match(core.buildSideQuestionReply(input, "ES", s, true), /Wind & Water Tight/);
});

test("the used-price upsell is not counted as a new-condition quote", () => {
    const history = [
        { role: "user", content: "usado" },
        {
            role: "assistant",
            content: "Aquí tienes los precios con entrega al código postal 33139:\n\n🔹 Usado 20': **$1,500**\n🔹 Usado 40': **$1,800**\n\nSi prefieres one-trip nuevo, con gusto te lo cotizo también.",
        },
    ];
    // Without quoted_conditions stored, the history fallback must still say "only Usado"
    const s = quotedSession({ quoted_conditions: null, history });
    assert.deepEqual(core.sessionQuotedConditions(s), ["Usado"]);

    // ...so asking for the new price still triggers a real database re-quote
    const opts = { alternateSizeRequested: false, asksAlternatePrice: false, stdHcComparison: false, conditionComparison: false };
    assert.equal(core.wantsQuoteRecalculation("y los nuevos son mucho mas caros?", s, {}, opts), true);
});

test("the customer's latest explicit condition wins", () => {
    const s = quotedSession({ condition: "Usado" });
    assert.equal(core.resolveExplicitCondition("quiero el nuevo", null, {}, s), "Nuevo");
    assert.equal(core.resolveExplicitCondition("y los nuevos son mas caros?", null, {}, s), "Nuevo");
    // A used/new comparison must not silently flip the stored condition
    assert.equal(core.isConditionComparisonQuestion("el usado es mas barato que el nuevo?"), true);
});

test("asking which container type a quote covers is not an order for that type", () => {
    // The reported bug: after a dry quote, "¿estos precios son de secos o refrigerados?"
    // switched the session to Reefer and jumped into the reefer motor question.
    assert.equal(core.isTypeClarificationQuestion("estos precios son de contenedores secos o refrigerados?"), true);
    assert.equal(core.extractTypeFromText("estos precios son de contenedores secos o refrigerados?"), null);
    assert.equal(core.isTypeClarificationQuestion("cual es la diferencia entre un seco y un refrigerado?"), true);
    assert.equal(core.isTypeClarificationQuestion("are these prices for dry or reefer containers?"), true);

    // A real reefer request must still be picked up
    assert.equal(core.extractTypeFromText("hola quiero comprar un contenedor refrigerado"), "Reefer");
    assert.equal(core.extractTypeFromText("me cotizas un reefer de 40?"), "Reefer");
    assert.equal(core.isTypeClarificationQuestion("tienen refrigerados?"), false);
    assert.equal(core.extractTypeFromText("tienen refrigerados?"), "Reefer");
    assert.equal(core.extractTypeFromText("quiero un open side"), "Open Side");

    // Mixed conversation: the earlier real request survives the later question
    assert.equal(core.extractTypeFromText("estos precios son de secos o refrigerados?\nquiero un refrigerado"), "Reefer");
});

test("the type clarification is answered from the session, never invented", () => {
    const dry = quotedSession({ type: "Dry" });
    const reply = core.buildSideQuestionReply("estos precios son de contenedores secos o refrigerados?", "ES", dry);
    assert.match(reply, /secos/);
    assert.doesNotMatch(reply, /\$/); // must not restate or invent any amount

    const reefer = quotedSession({ type: "Reefer" });
    assert.match(core.buildSideQuestionReply("estos precios son de secos o refrigerados?", "ES", reefer), /refrigerados/);
});

test("asking for reefer prices after a dry quote is a real re-quote, not a clarification", () => {
    const s = quotedSession({ type: "Dry" });
    const opts = { alternateSizeRequested: false, asksAlternatePrice: false, stdHcComparison: false, conditionComparison: false };
    assert.equal(core.isTypeClarificationQuestion("estos precios son de refrigerados?"), true);
    assert.equal(core.typePriceRequestFromInput("estos precios son de refrigerados?", s), null);
    assert.equal(core.typePriceRequestFromInput("quiero saber el precio de los refrigerados", s), "Reefer");
    assert.equal(core.wantsQuoteRecalculation("quiero saber el precio de los refrigerados", s, { type: "Reefer" }, opts), true);
});

test("answering the reefer motor question continues the quote", () => {
    const s = quotedSession({ type: "Reefer", reefer_status: null });
    const opts = { alternateSizeRequested: false, asksAlternatePrice: false, stdHcComparison: false, conditionComparison: false };
    assert.equal(core.extractReeferStatus("Funcionando"), "Funcionando");
    assert.equal(core.extractReeferStatus("No Funcionando"), "No Funcionando");
    assert.equal(core.extractReeferStatus("Working"), "Funcionando");
    assert.equal(core.wantsQuoteRecalculation("Funcionando", s, { reefer_status: "Funcionando" }, opts), true);
    // Merging the motor answer onto the previous dry cart attaches a size that was
    // already quoted — that must not block the reefer recalculation
    assert.equal(core.wantsQuoteRecalculation("Funcionando", s, { size: "20'", reefer_status: "Funcionando" }, opts), true);
    assert.equal(core.needsBuyType({ action: "Comprar", type: null, size: "20'" }), true);
    assert.equal(core.needsBuyType({ action: "Comprar", type: null, size: "20' & 40'" }), true);
    assert.equal(core.needsBuyType({ action: "Comprar", type: null, zip: "33139" }), true);
    assert.equal(core.needsBuyType({ action: "Comprar", type: null }), false);
    assert.equal(core.needsBuyType({ action: "Comprar", type: null, size: "45'" }), false);
    assert.equal(core.needsBuyType({ action: "Comprar", type: "Dry" }), false);
    assert.equal(core.needsBuyType({ action: "Alquilar", type: null }), false);
    assert.equal(core.isReeferEligibleBuySize("20'"), true);
    assert.equal(core.isReeferEligibleBuySize("40' STD"), true);
    assert.equal(core.isReeferEligibleBuySize("20' & 40'"), true);
    assert.equal(core.isReeferEligibleBuySize("45' HC"), false);
    const s45 = { action: "Comprar", type: null, size: "45'" };
    core.applyBuyTypeDefaults(s45, {}, "45'", null);
    assert.equal(s45.type, "Dry");
});

test("location question stays in Spanish after a Spanish quote", () => {
    const s = quotedSession({ lang: "ES" });
    const msg = "donde estan ubicados?";
    assert.equal(core.detectMessageLanguage(msg, "ES", s.history), "ES");
    assert.match(core.buildSideQuestionReply(msg, "ES", s) || "", /9804 NW 80th Ave|Hialeah Gardens/i);
    assert.doesNotMatch(core.buildSideQuestionReply(msg, "ES", s) || "", /Our central office/i);
});

test("storage on my patio is not a visit to our office", () => {
    const msg = "estoy buscando un contenedor para almacenar en mi patio";
    assert.equal(core.isAskingOurLocation(msg), false);
    assert.equal(core.isAskingOurLocation("in my yard for storage"), false);
    assert.equal(core.isAskingOurLocation("donde estan ubicados?"), true);
    assert.equal(core.isAskingOurLocation("Where are you located?"), true);
    assert.equal(core.isAskingOurLocation("puedo visitar la oficina?"), true);
    const reply = core.buildSideQuestionReply(msg, "ES", { lang: "ES", step: 0 });
    if (reply) assert.doesNotMatch(reply, /9804 NW 80th Ave|oficina central/i);
    assert.match(core.buildSideQuestionReply("Where are you located?", "EN", { lang: "EN", step: 0 }) || "", /9804 NW 80th Ave, Hialeah Gardens FL 33016/i);
});

test("hesitation about buying without seeing gets a warm reply, not the generic fallback", () => {
    const msg = "mmm no me gusta comprar sin antes ver lo que compro";
    assert.equal(core.isPhotoHesitationConcern(msg), true);
    const s = quotedSession({ condition: "Usado" });
    const reply = core.buildPhotoHesitationReply("ES", s);
    assert.match(reply, /Te entiendo|entrega|apruebes|WWT/i);
    assert.doesNotMatch(reply, /qué más te gustaría saber/i);
    assert.match(core.buildSideQuestionReply(msg, "ES", s) || "", /apruebes/i);
});

test("street numbers are not mistaken for ZIP codes", () => {
    assert.equal(core.extractZipFromText("26571 Chaparel Dr, Bonita Springs, FL"), null);
    assert.deepEqual(core.extractAllValidZips("26571 Chaparel Dr, Bonita Springs"), []);
    assert.equal(core.extractZipFromText("20 ft high cube if possible used/good condition delivered to Deland Florida 32720. CO$T please.will need at the 1st of October"), "32720");
    assert.equal(core.extractZipFromText("33139"), "33139");
});

test("transport route parses X to Y and in-X-delivered-to-Y patterns", () => {
    assert.deepEqual(core.extractTransportZipsFromText("34135 to 34119"), { zip_origin: "34135", zip_dest: "34119" });
    assert.deepEqual(
        core.extractTransportZipsFromText("Container is in 34135 need delivered to 34119"),
        { zip_origin: "34135", zip_dest: "34119" },
    );
});

test("miami to tampa does not ask to type the same ZIP twice", () => {
    const msg = "necesito mover un contenedor de mi casaen miami a mi terreno en tampa, ustedes hacen este servicio?";
    assert.deepEqual(core.namedTransportCities(msg).map((c) => c.toLowerCase()), ["miami", "tampa"]);
    const parts = core.splitTransportAddressParts(msg);
    assert.match(parts.pickup || "", /miami/i);
    assert.match(parts.delivery || "", /tampa/i);
    const ask = core.buildTransportZipsAsk("ES", msg, []);
    assert.match(ask, /miami/i);
    assert.match(ask, /tampa/i);
    assert.doesNotMatch(ask, /dos veces|33139 33139|mismo código postal dos/i);
});

test("transport session does not drift to Comprar on zip-only messages", () => {
    const transportSession = { step: 3, action: "Transporte", size: "40' HC", lang: "EN" };
    const qd = core.quickDetect("34135 to 34119", transportSession);
    assert.equal(qd?.extracted_data?.action, "Transporte");
    assert.equal(qd?.extracted_data?.zip_origin, "34135");
    assert.equal(qd?.extracted_data?.zip_dest, "34119");
    assert.notEqual(qd?.extracted_data?.action, "Comprar");
    assert.equal(core.isReadyToProceed("Container is in 34135 need delivered to 34119", transportSession), false);
});

test("good condition maps to used; regular container means dry not reefer", () => {
    assert.equal(core.mentionsUsedCondition("two 40' in good condition"), true);
    assert.equal(core.extractTypeFromText("I am looking for a regular container"), "Dry");
    assert.equal(core.typeSwitchFromInput("I don't need new reefer", { type: "Reefer" }), "Dry");
    assert.equal(core.typeSwitchFromInput("I am looking for a regular container", { type: "Reefer" }), "Dry");
});

test("not a regular container + freezer switches to reefer quote", () => {
    const msg = "Not a regular container, a 40 foot freezer container.";
    const session = { step: 6, final_amount: 2000, action: "Comprar", type: "Dry", condition: "Usado", size: "40'", zip: "34105" };
    assert.equal(core.isRegularDryAffirmation(msg), false);
    assert.equal(core.isRegularDryAffirmation("I am looking for a regular container"), true);
    assert.equal(core.typeSwitchFromInput(msg, session), "Reefer");
    const qd = core.quickDetect(msg, "web_test", session);
    assert.equal(qd?.intent, "quote");
    assert.equal(qd?.extracted_data?.type, "Reefer");
    assert.equal(
        core.wantsQuoteRecalculation(msg, session, { type: "Reefer" }, { alternateSizeRequested: false, asksAlternatePrice: false, stdHcComparison: false, conditionComparison: false }),
        true,
    );
});

test("sanitizeInferredType strips reefer when customer never asked for it", () => {
    const data = { type: "Reefer", items: [{ type: "Reefer", action: "Comprar" }] };
    core.sanitizeInferredType("Hi, I'm looking for two 40' in good condition", { action: "Comprar", history: [] }, data);
    assert.equal(data.type, "Dry");
});

test("forget it is treated as cancel", () => {
    assert.equal(core.isCancellationMessage("Forget it"), true);
    const qd = core.quickDetect("Forget it", "web_test", { action: "Comprar", step: 6, final_amount: 5000 });
    assert.equal(qd?.intent, "cancel");
});

test("human quote in assistant history hydrates buy session", () => {
    const quote = "The total price for Used 40' container delivered to 33756 is $2,200 (container + delivery, no hidden fees).";
    assert.equal(core.extractQuotedAmountFromText(quote), 2200);
    assert.equal(core.looksLikeHumanQuote(quote), true);
    assert.equal(core.looksLikeHumanQuote("We cannot send photos right now."), false);

    const session = {
        step: 0,
        action: null,
        history: [
            { role: "user", content: "Looking for a 40ft delivery to zip code 33756" },
            { role: "assistant", content: quote },
        ],
    };
    const hydration = core.hydrateSessionFromConversation(session);
    assert.equal(hydration.action, "Comprar");
    assert.equal(hydration.size, "40'");
    assert.equal(hydration.zip, "33756");
    assert.equal(hydration.condition, "Usado");
    assert.equal(hydration.final_amount, 2200);
    assert.equal(hydration.step, 6);
});

test("hydration does not overwrite an existing quoted session", () => {
    const session = { step: 6, final_amount: 1800, action: "Comprar", size: "20'", zip: "33139" };
    const hydration = core.hydrateSessionFromConversation({
        ...session,
        history: [{ role: "assistant", content: "The total price for Used 40' container delivered to 33756 is $2,200." }],
    });
    assert.equal(hydration.final_amount, undefined);
    assert.equal(hydration.step, undefined);
    assert.equal(hydration.action, undefined);
});
