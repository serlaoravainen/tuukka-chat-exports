// dateutils.ts
export type WeekStartDay = "monday" | "sunday";

// Paikallinen keskiyö -> YYYY-MM-DD ilman UTC-heittelyä
export function toLocalISO(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysLocalISO(iso: string, add: number) {
  const [y, m, da] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, da); // paikallinen
  d.setDate(d.getDate() + add);
  return toLocalISO(d);
}

export function alignToWeekStart(iso: string, weekStart: WeekStartDay) {
  const [y, m, da] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, da); // paikallinen
  const day = d.getDay(); // 0 = su, 1 = ma
  const startIndex = weekStart === "monday" ? 1 : 0;
  const diff = (day - startIndex + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toLocalISO(d);
}
