const colorMap = {
  black: ["black", "blak", "block", "brak", "nyeusi", "blacki", "weusi"],
  green: ["green", "grin", "kijani", "grini"],
  blue: ["blue", "bluu", "bulu", "blu"],
  red: ["red", "nyekundu", "reed"],
  white: ["white", "nyeupe", "waiti"],
  yellow: ["yellow", "njano", "yelow"],
};
const numberMap = {
  "5": ["five", "tano", "faiv", "5", "fai"], "10": ["ten", "kumi", "10", "teni"],
  "15": ["fifteen", "kumi na tano", "15"], "20": ["twenty", "ishirini", "20"],
  "1": ["one", "moja", "1"], "2": ["two", "mbili", "2"], "3": ["three", "tatu", "3"],
  "6": ["six", "sita", "6"], "7": ["seven", "saba", "7"], "8": ["eight", "nane", "8"],
};
const categoryAttrs = {
  phone_accessories: { colors: Object.keys(colorMap), units: ["pieces", "pcs"], variants: ["color"] },
  mitumba: { colors: Object.keys(colorMap), sizes: ["S", "M", "L", "XL", "XXL"], units: ["pieces", "bale"], variants: ["color", "size"] },
  hardware: { units: ["kg", "g", "pieces", "metre", "litre", "inch"], sizes: ["1/2", "3/4", "1", "2", "3"], variants: ["size"] },
  grocery: { units: ["kg", "g", "litre", "pieces", "packet"], variants: [] },
  cosmetics: { colors: Object.keys(colorMap), units: ["pieces", "ml", "g"], variants: ["color"] },
  shoes: { sizes: ["36", "37", "38", "39", "40", "41", "42", "43", "44"], colors: Object.keys(colorMap), units: ["pairs", "pieces"], variants: ["color", "size"] },
};
function escapeRegExp(value) { return String(value).replace(/[|\{}()[\]^$+*?.-]/g, "\\$&"); }
function replaceWords(text, synonym, standard) {
  const pattern = new RegExp("\\b" + escapeRegExp(synonym).replace(/\\ /g, "\\\\s+") + "\\b", "gi");
  return text.replace(pattern, standard);
}
function normalizeTranscript(raw) {
  let text = String(raw || "").toLowerCase();
  text = text.replace(/\bsamsung\s*17\b/g, "samsung a17");
  text = text.replace(/\bfold\s+five\b/g, "fold 5").replace(/\bfold\s+six\b/g, "fold 6");
  for (const [digit, synonyms] of Object.entries(numberMap).sort((a, b) => Number(b[0]) - Number(a[0]))) for (const synonym of [...synonyms].sort((a, b) => b.length - a.length)) text = replaceWords(text, synonym, digit);
  for (const [standard, synonyms] of Object.entries(colorMap)) for (const synonym of [...synonyms].sort((a, b) => b.length - a.length)) text = replaceWords(text, synonym, standard);
  return text.replace(/\s+/g, " ").trim();
}
module.exports = { colorMap, numberMap, categoryAttrs, normalizeTranscript };
