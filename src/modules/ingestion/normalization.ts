const MONTHS: Record<string, string> = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12" };

export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/\bADM\.?\b/g, "ADMINISTRACION").replace(/\bS\.?R\.?L\.?\b/g, "SRL")
    .replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeCuit(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

export function parseArgentineAmount(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, "").replace(/^(ARS|\$)/i, "");
  if (!cleaned || /[^\d.,-]/.test(cleaned)) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let canonical: string;
  if (lastComma > lastDot) canonical = cleaned.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastDot >= 0 && cleaned.length - lastDot - 1 <= 2) canonical = cleaned.replace(/,/g, "");
  else canonical = cleaned.replace(/[.,]/g, "");
  const amount = Number(canonical);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export function normalizeDate(value: string): string | null {
  const raw = value.trim().toLowerCase();
  let year: string, month: string, day: string;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) [, year, month, day] = match;
  else {
    match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (match) [, day, month, year] = match.map(String);
    else {
      match = raw.match(/^(\d{1,2})[- ]([a-z]{3})[- ](\d{4})$/);
      if (!match || !MONTHS[match[2]]) return null;
      [, day, , year] = match;
      month = MONTHS[match[2]];
    }
  }
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return date.toISOString().startsWith(iso) ? iso : null;
}
