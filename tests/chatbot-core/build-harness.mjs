// Loads the real chatbot-core source into Node so the pure detection helpers can
// be unit-tested. Deno/Supabase/OpenAI are stubbed; nothing here runs in production.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "supabase", "functions", "chatbot-core", "index.ts");
const OUT = join(here, ".generated", "core.ts");

const EXPORTED = [
    "detectMessageLanguage",
    "mentionsNewCondition",
    "mentionsUsedCondition",
    "mentionsUsedConditionExplicit",
    "impliesUsedFromQualityPrefs",
    "extractSizeFromText",
    "extractConditionFromText",
    "extractTypeFromText",
    "extractZipFromText",
    "extractTransportZipsFromText",
    "splitTransportAddressParts",
    "buildTransportZipsAsk",
    "namedTransportCities",
    "extractAllValidZips",
    "isValidUsZip",
    "isLikelyStreetNumber",
    "normalizeLoadStatus",
    "inferServiceAction",
    "servicesNamedInMessage",
    "applyConversationInferences",
    "resolveExtractedAction",
    "isConditionComparisonQuestion",
    "isTypeClarificationQuestion",
    "typePriceRequestFromInput",
    "typeSwitchFromInput",
    "sanitizeInferredType",
    "isCancellationMessage",
    "extractReeferStatus",
    "needsBuyType",
    "isReeferEligibleBuySize",
    "isSpecialtyBuyType",
    "applyBuyTypeDefaults",
    "extractTypeFromText",
    "isStdHcComparisonQuestion",
    "is20StdHcQuestion",
    "detectLanguageSwitchRequest",
    "isAskingOurLocation",
    "joinWithoutRepeating",
    "isCatalogQuestion",
    "buildCatalogAvailabilityReply",
    "wantsQuoteNow",
    "isOpenEducationalQuestion",
    "statesProductChoice",
    "conditionPriceRequestFromInput",
    "asksOtherConditionPrice",
    "isPhotosRequest",
    "mentionsPhotoWord",
    "isDimensionsRequest",
    "isReadyToProceed",
    "isChoosingPaymentMethod",
    "isPaymentPolicyQuestion",
    "isConversationalSideAsk",
    "buildQuoteFromText",
    "parseContactFromInput",
    "extractUsPhone",
    "isOrderConfirmationPhrase",
    "isChoosingAlreadyQuotedCondition",
    "quotedAmountForCondition",
    "isQuotedPriceClarificationQuestion",
    "wantsQuoteRecalculation",
    "isInitialPriceInquiry",
    "isZipCorrectionMessage",
    "hasQuotedPrice",
    "resolveExplicitCondition",
    "quickDetect",
    "isBareGreeting",
    "buildQuoteFromText",
    "normalizeSizeKey",
    "resolveContainerSizeKey",
    "parseTransportOption",
    "isHcStockCheckRequest",
    "isHcUsedInsistRequest",
    "sessionQuotedConditions",
    "sizeAlreadyInQuotedSet",
    "isPhotoHesitationConcern",
    "buildPhotoHesitationReply",
    "historyHasPhotoPolicy",
    "historyHasWwtInfo",
    "isAskingWwtMeaning",
    "buildSideQuestionReply",
    "isSchedulingQuestion",
    "buildSchedulingReply",
    "buildPostQuoteFallbackReply",
    "buildQuotedPriceClarificationReply",
    "applyAlternateSizeRequest",
    "extractQuotedAmountFromText",
    "looksLikeHumanQuote",
    "hydrateSessionFromConversation",
    "isRegularDryAffirmation",
    "wantsQuoteRecalculation",
];

const STUB_HEADER = `
// ==== TEST STUBS (injected) ====
const Deno = { env: { get: (_k) => "test" } } as any;
function chain(): any {
    const p: any = Promise.resolve({ data: null, error: null });
    const h: any = new Proxy(function () {}, {
        get: (_t, k) => (k === "then" || k === "catch" || k === "finally" ? p[k].bind(p) : () => h),
        apply: () => h,
    });
    return h;
}
const createClient = (_u?: any, _k?: any) => ({ from: () => chain() }) as any;
const serve = (_h?: any) => undefined;
globalThis.fetch = (async () => { throw new Error("fetch disabled in tests"); }) as any;
// ==== END TEST STUBS ====
`;

let src = readFileSync(SRC, "utf8");

// Drop remote imports (Deno-only URLs) and replace with the stubs above.
src = src.replace(/^import[\s\S]*?from\s+"https:[^"]+";\s*$/gm, "");
src = STUB_HEADER + src;

// Neutralize the HTTP entrypoint so importing the module has no side effects.
src = src.replace(/^serve\(async \(req\)[\s\S]*$/m, "// serve() entrypoint stripped for tests\n");

const present = [...new Set(EXPORTED)].filter((n) => new RegExp(`\\b(?:async\\s+)?function\\s+${n}\\b`).test(src));
src += `\nexport { ${present.join(", ")} };\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, src, "utf8");
console.log(`harness built: ${present.length} helpers exported`);
const missing = EXPORTED.filter((n) => !present.includes(n));
if (missing.length) console.log(`(not present in source yet: ${missing.join(", ")})`);
