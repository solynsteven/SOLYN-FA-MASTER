const TZ = "Asia/Shanghai";

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(x).replace(/\//g, "-");
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(x).replace(/\//g, "-");
}

export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
