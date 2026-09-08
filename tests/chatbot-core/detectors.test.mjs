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
    assert.equal(core.inferServiceAction("necesito mover un contenedor"), "Transporte");
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

test("proceed is only triggered by real confirmations", () => {
    const s = quotedSession();
    assert.equal(core.isReadyToProceed("Sí, proceder", s), true);
    assert.equal(core.isReadyToProceed("lo quiero", s), true);
    assert.equal(core.isReadyToProceed("y los nuevos son mucho mas caros?", s), false);
    assert.equal(core.isReadyToProceed("cuanto cuesta el de 40?", s), false);
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
    assert.ok(hit, "first-contact price question should be handled without the AI");
    assert.equal(hit.intent, "general_chat");
    assert.match(hit.ai_reply, /Comprar|Alquilar|Transporte/);
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
