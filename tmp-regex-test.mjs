const inputs = ["20' HC", "20' hc", "20 HC", "33470"];
for (const lo of inputs.map(s => s.toLowerCase())) {
  console.log(lo, {
    new: /\b(nuevo|new|one[\s-]?trip|brand[\s-]?new)\b/i.test(lo),
    extractNew: /\b(nuevo|new)\b/i.test(lo),
    hc: /\b(hc|high\s*cube)\b/.test(lo),
  });
}
