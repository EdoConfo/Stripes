// Built-in store catalog. Colors are approximations of each chain's palette,
// used only to tint the card: no logos are shipped, the "logo" is a wordmark
// drawn with the store name. Every value stays editable per card.
export const BRANDS = [
  // Supermarkets
  { id: "esselunga", name: "Esselunga", bg: "#0B4EA2", fg: "#FFFFFF", alias: "fidaty" },
  { id: "coop", name: "Coop", bg: "#E2001A", fg: "#FFFFFF", alias: "socio coop alleanza" },
  { id: "conad", name: "Conad", bg: "#E30613", fg: "#FFE14D", alias: "carta insieme" },
  { id: "carrefour", name: "Carrefour", bg: "#004E9F", fg: "#FFFFFF", alias: "carta spesa amica" },
  { id: "lidl", name: "Lidl", bg: "#0050AA", fg: "#FFF000", alias: "lidl plus" },
  { id: "eurospin", name: "Eurospin", bg: "#0A3F8F", fg: "#FFD400" },
  { id: "aldi", name: "Aldi", bg: "#00205B", fg: "#F9B000" },
  { id: "penny", name: "Penny", bg: "#CD1719", fg: "#FFE500" },
  { id: "md", name: "MD", bg: "#FFD200", fg: "#D6001C" },
  { id: "pam", name: "Pam Panorama", bg: "#D7141A", fg: "#FFFFFF", alias: "pam local" },
  { id: "despar", name: "Despar", bg: "#00843D", fg: "#FFFFFF", alias: "eurospar interspar spar" },
  { id: "famila", name: "Famila", bg: "#C8102E", fg: "#FFFFFF" },
  { id: "iper", name: "Iper", bg: "#E4002B", fg: "#FFFFFF", alias: "la grande i" },
  { id: "bennet", name: "Bennet", bg: "#E2001A", fg: "#FFFFFF" },
  { id: "crai", name: "Crai", bg: "#D6001C", fg: "#FFFFFF" },
  { id: "sigma", name: "Sigma", bg: "#E4032E", fg: "#FFFFFF" },
  { id: "tigros", name: "Tigros", bg: "#E30613", fg: "#FFFFFF" },
  { id: "unes", name: "Unes", bg: "#E3000F", fg: "#FFFFFF", alias: "u2" },
  { id: "todis", name: "Todis", bg: "#E30613", fg: "#FFFFFF" },
  { id: "deco", name: "Decò", bg: "#E30613", fg: "#FFFFFF", alias: "deco" },
  { id: "gigante", name: "Il Gigante", bg: "#E30613", fg: "#FFFFFF", alias: "gigante" },
  { id: "ali", name: "Alì", bg: "#E30613", fg: "#FFE100", alias: "ali aliper" },
  { id: "basko", name: "Basko", bg: "#E2001A", fg: "#FFFFFF" },
  { id: "tuodi", name: "Tuodì", bg: "#E30613", fg: "#FFFFFF", alias: "tuodi" },
  { id: "naturasi", name: "NaturaSì", bg: "#6FA83A", fg: "#FFFFFF", alias: "naturasi" },
  { id: "carrefourexpress", name: "Carrefour Express", bg: "#1E8C3A", fg: "#FFFFFF" },
  // Drugstores & beauty
  { id: "tigota", name: "Tigotà", bg: "#E6007E", fg: "#FFFFFF", alias: "tigota" },
  { id: "acquaesapone", name: "Acqua & Sapone", bg: "#0089CF", fg: "#FFFFFF", alias: "acqua e sapone" },
  { id: "sephora", name: "Sephora", bg: "#111111", fg: "#FFFFFF" },
  { id: "douglas", name: "Douglas", bg: "#9BDCD2", fg: "#0B0B0B" },
  { id: "kiko", name: "Kiko", bg: "#1A1A1A", fg: "#FFFFFF" },
  // Home, tech, books, sport
  { id: "ikea", name: "IKEA Family", bg: "#0058A3", fg: "#FFDA1A", alias: "ikea" },
  { id: "leroymerlin", name: "Leroy Merlin", bg: "#78BE20", fg: "#FFFFFF" },
  { id: "decathlon", name: "Decathlon", bg: "#3643BA", fg: "#FFFFFF" },
  { id: "mediaworld", name: "MediaWorld", bg: "#DF0000", fg: "#FFFFFF" },
  { id: "unieuro", name: "Unieuro", bg: "#FF6A00", fg: "#FFFFFF" },
  { id: "euronics", name: "Euronics", bg: "#003F8A", fg: "#FFD200" },
  { id: "feltrinelli", name: "laFeltrinelli", bg: "#E30613", fg: "#FFFFFF", alias: "feltrinelli" },
  { id: "mondadori", name: "Mondadori", bg: "#1C1C1C", fg: "#FFFFFF" },
  { id: "ovs", name: "OVS", bg: "#1B2A4A", fg: "#FFFFFF" },
  { id: "hm", name: "H&M", bg: "#E50010", fg: "#FFFFFF", alias: "hm hennes" },
  { id: "arcaplanet", name: "Arcaplanet", bg: "#00A0DF", fg: "#FFFFFF" },
  { id: "maxizoo", name: "Maxi Zoo", bg: "#E30613", fg: "#FFFFFF", alias: "maxizoo" },
];

// Fallback palette for stores not in the catalog.
export const PALETTE = [
  "#E5484D", "#F76B15", "#FFB224", "#46A758", "#12A594", "#0091FF",
  "#3E63DD", "#6E56CF", "#AB4ABA", "#D6409F", "#8D6E63", "#2B2F36",
];

const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function brandById(id) {
  return BRANDS.find((b) => b.id === id) || null;
}

export function searchBrands(query) {
  const q = fold(query || "");
  if (!q) return BRANDS;
  return BRANDS
    .map((b) => {
      const name = fold(b.name);
      const hay = name + " " + fold(b.alias || "");
      const rank = name.startsWith(q) ? 0 : hay.split(" ").some((w) => w.startsWith(q)) ? 1 : hay.includes(q) ? 2 : -1;
      return { b, rank };
    })
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.b);
}

export function exactBrand(name) {
  const q = fold(name || "");
  return BRANDS.find((b) => fold(b.name) === q) || null;
}

export function colorForName(name) {
  let h = 0;
  for (const ch of fold(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Picks black or white text for a background, by relative luminance.
export function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.45 ? "#111111" : "#FFFFFF";
}
