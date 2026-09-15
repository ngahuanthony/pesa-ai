const PARSER_VERSION = "v2.1";

const colorMap = {
  black: ["black", "blak", "block", "brak", "burak", "nyeusi", "blacki", "weusi"],
  green: ["green", "grin", "kijani", "grini"], blue: ["blue", "bluu", "bulu", "blu"],
  red: ["red", "nyekundu", "reed"], white: ["white", "nyeupe", "waiti"],
  yellow: ["yellow", "njano", "manjano", "yelow"], orange: ["orange", "orenge", "orrange", "machungwa"],
  purple: ["purple", "zambarau"], pink: ["pink", "waridi"], brown: ["brown", "kahawia"], grey: ["grey", "gray", "kijivu"],
};
const numberMap = {
  "1": ["one", "moja", "1"], "2": ["two", "mbili", "2"], "3": ["three", "tatu", "3"],
  "4": ["four", "nne", "4"], "5": ["five", "tano", "faiv", "5", "fai"],
  "6": ["six", "sita", "6"], "7": ["seven", "saba", "7"], "8": ["eight", "nane", "8"],
  "9": ["nine", "tisa", "9"], "10": ["ten", "kumi", "10", "teni"],
  "15": ["fifteen", "kumi na tano", "15"], "20": ["twenty", "ishirini", "20"],
};
const productTermMap = {
  milk: ["maziwa"], bread: ["mkate"], sugar: ["sukari"], salt: ["chumvi"], flour: ["unga"], shirt: ["shati"], nails: ["misumari"],
  max: ["max", "marks", "mark", "maks", "maxx"], cover: ["kavare", "kava", "cava"], iphone: ["aifon", "aifone"], samsung: ["samson"],
};
const unitMap = {
  pieces: ["piece", "pieces", "pc", "pcs", "unit", "units"], boxes: ["box", "boxes"], sets: ["set", "sets"], pairs: ["pair", "pairs"],
  kg: ["kg", "kgs", "kilo", "kilos"], g: ["g", "gram", "grams"], metre: ["m", "metre", "metres", "meter", "meters", "mita"],
  litre: ["l", "litre", "litres", "liter", "liters"], packet: ["packet", "packets", "pack"], bale: ["bale", "bales"],
};
const categoryAttrs = {
  phone_accessories: { colors: Object.keys(colorMap), units: ["pieces", "pcs"], variants: ["color"] },
  mitumba: { colors: Object.keys(colorMap), sizes: ["S", "M", "L", "XL", "XXL"], units: ["pieces", "bale"], variants: ["color", "size"] },
  hardware: { units: ["kg", "g", "pieces", "metre", "litre", "inch"], sizes: ["1/2", "3/4", "1", "2", "3"], variants: ["size"] },
  grocery: { colors: Object.keys(colorMap), units: ["kg", "g", "litre", "pieces", "packet"], variants: [] },
  cosmetics: { colors: Object.keys(colorMap), units: ["pieces", "ml", "g"], variants: ["color"] },
  shoes: { sizes: ["36", "37", "38", "39", "40", "41", "42", "43", "44"], colors: Object.keys(colorMap), units: ["pairs", "pieces"], variants: ["color", "size"] },
};
function escapeRegExp(value) { return String(value).replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&"); }
function replaceWords(text, synonym, standard) {
  const escaped = escapeRegExp(synonym).replace(/\s+/g, "\\s+");
  return text.replace(new RegExp("\\b" + escaped + "\\b", "gi"), standard);
}
function normalizeTranscript(raw) {
  let text = String(raw || "").toLowerCase();
  text = text.replace(/\bsamsung\s*17\b/g, "samsung a17");
  const phraseRules = [
    [/\b(?:sixteen|sikistini|sikstini|six\s+teen)\b/gi, "16"],
    [/\b(?:seventeen|sabatini|saba\s+teen)\b/gi, "17"],
    [/\bfold\s+(?:five|fai|faiv)\b/gi, "fold 5"],
    [/\bfold\s+six\b/gi, "fold 6"],
  ];
  for (const [pattern, value] of phraseRules) text = text.replace(pattern, value);
  for (const [digit, synonyms] of Object.entries(numberMap).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    for (const synonym of [...synonyms].sort((a, b) => b.length - a.length)) text = replaceWords(text, synonym, digit);
  }
  for (const [standard, synonyms] of Object.entries(colorMap)) for (const synonym of [...synonyms].sort((a, b) => b.length - a.length)) text = replaceWords(text, synonym, standard);
  for (const [standard, synonyms] of Object.entries(productTermMap)) for (const synonym of [...synonyms].sort((a, b) => b.length - a.length)) text = replaceWords(text, synonym, standard);
  for (const [standard, synonyms] of Object.entries(unitMap)) for (const synonym of [...synonyms].sort((a, b) => b.length - a.length)) text = replaceWords(text, synonym, standard);
  return text.replace(/\s+/g, " ").trim();
}
module.exports = { PARSER_VERSION, colorMap, numberMap, productTermMap, unitMap, categoryAttrs, normalizeTranscript };
