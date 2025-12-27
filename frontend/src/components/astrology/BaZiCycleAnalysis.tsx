import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, LineChart, Sparkles, Search, Plus, Filter } from "lucide-react";
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { STOCK_LIST, loadStockList } from '../../data/stockList';

const Card = ({ className = "", children }: any) => (
  <div className={`rounded-2xl shadow-sm border border-border bg-card ${className}`}>{children}</div>
);
const CardHeader = ({ className = "", children }: any) => (
  <div className={`p-5 border-b border-border ${className}`}>{children}</div>
);
const CardContent = ({ className = "", children }: any) => (
  <div className={`p-5 ${className}`}>{children}</div>
);
const Badge = ({ children, intent = "gray" }: any) => {
  const color: Record<string, string> = {
    gray: "bg-muted text-muted-foreground",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-800",
    red: "bg-red-100 text-red-700",
  };
  return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${color[intent] || color['gray']}`}>{children}</span>;
};

const SectionTitle = ({ icon: Icon, title, subtitle }: any) => (
  <div className="flex items-center gap-3">
    {Icon ? (
      <div className="p-2 rounded-xl bg-muted"><Icon className="w-5 h-5" /></div>
    ) : null}
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  </div>
);

function TimeframeTabs({ value, onChange }: { value: Timeframe; onChange: (v: Timeframe) => void }) {
  const base = 'px-3 py-1.5 text-sm rounded-md border';
  const active = 'bg-primary text-primary-foreground border-primary';
  const inactive = 'bg-background text-foreground hover:bg-muted border-border';
  return (
    <div className="inline-flex items-center gap-1">
      <button className={`${base} ${value === 'yearly' ? active : inactive}`} onClick={() => onChange('yearly')}>Yearly</button>
      <button className={`${base} ${value === 'monthly' ? active : inactive}`} onClick={() => onChange('monthly')}>Monthly</button>
      <button className={`${base} ${value === 'daily' ? active : inactive}`} onClick={() => onChange('daily')}>Daily</button>
    </div>
  );
}

interface RunParams {
  ticker: string;
  anchorMethod: "jiazi1984" | "custom";
  anchorDate?: string;
  startDate: string;
  endDate: string;
  hourPillar: boolean;
}
interface Row {
  date: Date;
  open?: number; high?: number; low?: number; close?: number; volume?: number;
  ret?: number; atr14?: number; atr14_frac?: number;
  pillar_year?: string; element?: string; yinyang?: string; shio?: string;
  stem?: string; branch?: string; stemCN?: string; branchCN?: string;

  // tambahan info (tidak dipakai layout, tapi dipakai agregasi BaZi)
  year_solar?: number;
  year_element?: string; year_yinyang?: "Yin" | "Yang"; year_shio?: string; year_pillarCN?: string;
  month_element?: string; month_yinyang?: "Yin" | "Yang"; month_shio?: string; month_pillarCN?: string; month_index?: number;
  day_element?: string; day_yinyang?: "Yin" | "Yang"; day_shio?: string; day_pillarCN?: string;
}

type Timeframe = 'yearly' | 'monthly' | 'daily';


// Helper function to get date from input
const getDateFromInput = (dateString: string) => {
  return new Date(dateString + 'T00:00:00');
};

// Helper function to trigger date picker
const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
  if (inputRef.current) {
    inputRef.current.showPicker();
  }
};

// Type definition for stock OHLC data from Azure
interface StockOHLCData {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  Value?: number;
  Frequency?: number;
  ChangePercent?: number;
}

function parseCsvSmart(text: string): Row[] {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delim = ([",", ";", "\t"] as const).reduce((best, cur) => {
    const re = new RegExp(cur === "\t" ? "\\t" : cur, "g");
    const cnt = (firstLine.match(re) || []).length;
    const bestCnt = (firstLine.match(new RegExp(best === "\t" ? "\\t" : best, "g")) || []).length;
    return cnt > bestCnt ? cur : best;
  }, ",");

  const lines = text.split(/\r?\n+/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0]?.split(delim).map(h => h.replace(/^\s*\"|\"\s*$/g, "").trim().toLowerCase()) || [];

  const num = (raw?: string): number => {
    if (raw == null) return NaN;
    let s = String(raw).trim().replace(/[\s\$€£¥%]/g, "").replace(/^\"|\"$/g, "");
    if (!s) return NaN;
    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
      if (s.lastIndexOf('.') < s.lastIndexOf(',')) { s = s.replace(/\./g, '').replace(/,/g, '.'); }
      else { s = s.replace(/,/g, ''); }
    } else if (hasComma && !hasDot) { s = s.replace(/\./g, '').replace(/,/g, '.'); }
    else { s = s.replace(/,(?=\d{3}(\D|$))/g, ''); }
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : NaN;
  };

  const idx = (name: string) => headers.findIndex(h => h === name || h.includes(name));
  const iDate = ["date", "time", "timestamp"].map(idx).find(i => i !== -1) ?? 0;
  const iOpen = idx("open");
  const iHigh = idx("high");
  const iLow = idx("low");
  const iClose = headers.findIndex(h => ["close", "adj close", "close price", "closing price"].includes(h));
  const iVol = ["volume", "vol"].map(idx).find(i => i !== -1) ?? -1;

  const rows: Row[] = [];
  for (let k = 1; k < lines.length; k++) {
    const parts = lines[k]?.split(delim).map(p => p.replace(/^\s*\"|\"\s*$/g, "")) || [];
    if (!parts[iDate] || iDate >= parts.length) continue;
    const d = new Date(parts[iDate] || ''); if (isNaN(+d)) continue;
    const r: Row = { date: d };
    if (iOpen !== -1 && parts[iOpen] !== undefined) r.open = num(parts[iOpen]);
    if (iHigh !== -1 && parts[iHigh] !== undefined) r.high = num(parts[iHigh]);
    if (iLow !== -1 && parts[iLow] !== undefined) r.low = num(parts[iLow]);
    if (iClose !== -1 && parts[iClose] !== undefined) r.close = num(parts[iClose]);
    if (iVol !== -1 && parts[iVol] !== undefined) r.volume = num(parts[iVol]);
    rows.push(r);
  }
  return rows.sort((a, b) => +a.date - +b.date);
}

// ========= ASTRONOMY & BAZI (OFFLINE, NO API) =========
const TZ_DEFAULT = "Asia/Jakarta" as const;
const stems = ["Jia", "Yi", "Bing", "Ding", "Wu", "Ji", "Geng", "Xin", "Ren", "Gui"] as const;
const stemsCN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
const stemElem = ["Wood", "Wood", "Fire", "Fire", "Earth", "Earth", "Metal", "Metal", "Water", "Water"] as const;
const stemYY = ["Yang", "Yin", "Yang", "Yin", "Yang", "Yin", "Yang", "Yin", "Yang", "Yin"] as const;
const branches = ["Zi", "Chou", "Yin", "Mao", "Chen", "Si", "Wu", "Wei", "Shen", "You", "Xu", "Hai"] as const;
const branchesCN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
const shio = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"] as const;
const ELEMENTS = ["Wood", "Fire", "Earth", "Metal", "Water"] as const;

// Mapping unsur & yin-yang utk stem CN
const STEM_ELEMENT: Record<string, { element: string; yy: "Yin" | "Yang" }> = {
  "甲": { element: "Wood", yy: "Yang" }, "乙": { element: "Wood", yy: "Yin" },
  "丙": { element: "Fire", yy: "Yang" }, "丁": { element: "Fire", yy: "Yin" },
  "戊": { element: "Earth", yy: "Yang" }, "己": { element: "Earth", yy: "Yin" },
  "庚": { element: "Metal", yy: "Yang" }, "辛": { element: "Metal", yy: "Yin" },
  "壬": { element: "Water", yy: "Yang" }, "癸": { element: "Water", yy: "Yin" },
};
const BRANCH_META_FULL: Record<string, { shio: string; element: string; yy: "Yin" | "Yang" }> = {
  "子": { shio: "Rat", element: "Water", yy: "Yang" },
  "丑": { shio: "Ox", element: "Earth", yy: "Yin" },
  "寅": { shio: "Tiger", element: "Wood", yy: "Yang" },
  "卯": { shio: "Rabbit", element: "Wood", yy: "Yin" },
  "辰": { shio: "Dragon", element: "Earth", yy: "Yang" },
  "巳": { shio: "Snake", element: "Fire", yy: "Yin" },
  "午": { shio: "Horse", element: "Fire", yy: "Yang" },
  "未": { shio: "Goat", element: "Earth", yy: "Yin" },
  "申": { shio: "Monkey", element: "Metal", yy: "Yang" },
  "酉": { shio: "Rooster", element: "Metal", yy: "Yin" },
  "戌": { shio: "Dog", element: "Earth", yy: "Yang" },
  "亥": { shio: "Pig", element: "Water", yy: "Yin" },
};

// Urutan branch bulan mulai Li Chun (寅)
const MONTH_BRANCHES_CN = ["寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑"] as const;
const MONTH_STEM_MAP: Record<string, readonly string[]> = {
  "甲": ["丙", "丁", "戊", "己", "庚", "辛", "壬", "癸", "甲", "乙", "丙", "丁"],
  "乙": ["丁", "戊", "己", "庚", "辛", "壬", "癸", "甲", "乙", "丙", "丁", "戊"],
  "丙": ["戊", "己", "庚", "辛", "壬", "癸", "甲", "乙", "丙", "丁", "戊", "己"],
  "丁": ["己", "庚", "辛", "壬", "癸", "甲", "乙", "丙", "丁", "戊", "己", "庚"],
  "戊": ["庚", "辛", "壬", "癸", "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛"],
  "己": ["辛", "壬", "癸", "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬"],
  "庚": ["壬", "癸", "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"],
  "辛": ["癸", "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸", "甲"],
  "壬": ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸", "甲", "乙"],
  "癸": ["乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸", "甲", "乙", "丙"],
};

// 60-hari pasangan stem-branch (Jia-Zi)
const JIA_ZI = [
  "甲子", "乙丑", "丙寅", "丁卯", "戊辰", "己巳", "庚午", "辛未", "壬申", "癸酉",
  "甲戌", "乙亥", "丙子", "丁丑", "戊寅", "己卯", "庚辰", "辛巳", "壬午", "癸未",
  "甲申", "乙酉", "丙戌", "丁亥", "戊子", "己丑", "庚寅", "辛卯", "壬辰", "癸巳",
  "甲午", "乙未", "丙申", "丁酉", "戊戌", "己亥", "庚子", "辛丑", "壬寅", "癸卯",
  "甲辰", "乙巳", "丙午", "丁未", "戊申", "己酉", "庚戌", "辛亥", "壬子", "癸丑",
  "甲寅", "乙卯", "丙辰", "丁巳", "戊午", "己未", "庚申", "辛酉", "壬戌", "癸亥",
] as const;

const normalize360 = (x: number) => ((x % 360) + 360) % 360;
function toJulianDayUTC(dt: Date): number {
  const y = dt.getUTCFullYear(); let m = dt.getUTCMonth() + 1;
  const D = dt.getUTCDate() + (dt.getUTCHours() + (dt.getUTCMinutes() + dt.getUTCSeconds() / 60) / 60) / 24;
  let Y = y; if (m <= 2) { Y = y - 1; m += 12; }
  const A = Math.floor(Y / 100); const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (m + 1)) + D + B - 1524.5;
}
const julianCenturiesTT = (JD: number) => (JD - 2451545.0) / 36525.0;
function solarAppLongitudeDeg(dtUTC: Date): number {
  const JD = toJulianDayUTC(dtUTC); const T = julianCenturiesTT(JD);
  const L0 = normalize360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = normalize360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * Math.PI / 180)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M * Math.PI / 180)
    + 0.000289 * Math.sin(3 * M * Math.PI / 180);
  const trueLong = L0 + C;
  const omega = normalize360(125.04 - 1934.136 * T);
  const lam = trueLong - 0.00569 - 0.00478 * Math.sin(omega * Math.PI / 180);
  return normalize360(lam);
}
function findTimeWhenSolarLongitude(targetDeg: number, startUTC: Date, endUTC: Date): Date {
  let a = startUTC, b = endUTC;
  const angDiff = (cur: number, tgt: number) => { let x = normalize360(cur - tgt); if (x > 180) x -= 360; return x; };
  let fa = angDiff(solarAppLongitudeDeg(a), targetDeg);
  let fb = angDiff(solarAppLongitudeDeg(b), targetDeg);
  if (fa * fb > 0) { const mid = new Date((a.getTime() + b.getTime()) / 2); const fm = angDiff(solarAppLongitudeDeg(mid), targetDeg); if (fa * fm <= 0) { b = mid; fb = fm; } else { a = mid; fa = fm; } }
  for (let i = 0; i < 64; i++) {
    const m = new Date((a.getTime() + b.getTime()) / 2); const fm = angDiff(solarAppLongitudeDeg(m), targetDeg);
    if (Math.abs(b.getTime() - a.getTime()) <= 500) return m;
    if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return new Date((a.getTime() + b.getTime()) / 2);
}
function liChunLocal(year: number, tz: string = TZ_DEFAULT): Date {
  const start = new Date(Date.UTC(year, 0, 31, 0, 0, 0));
  const end = new Date(Date.UTC(year, 1, 6, 0, 0, 0));
  const hitUTC = findTimeWhenSolarLongitude(315, start, end);
  return new Date(hitUTC.toLocaleString("en-US", { timeZone: tz }));
}
function monthIndexFromLongitude(lam: number): number {
  const d = normalize360(lam - 315); return Math.floor(d / 30) % 12; // 0..11, 0=寅
}
const JIAZI_ANCHOR_UTC = new Date(Date.UTC(1900, 0, 31, 0, 0, 0)); // 甲子

// ——— Pillar exact (Year/Month/Day) ———
function yearPillarExact(localDate: Date, tz: string = TZ_DEFAULT) {
  const lc = liChunLocal(localDate.getFullYear(), tz);
  const solarYear = (localDate.getTime() >= lc.getTime()) ? localDate.getFullYear() : localDate.getFullYear() - 1;
  const n = solarYear - 1984; // 1984 = 甲子
  const stemCN = stemsCN[((n % 10) + 10) % 10]; const branchCN = branchesCN[((n % 12) + 12) % 12];
  const se = STEM_ELEMENT[stemCN || '甲']; const bm = BRANCH_META_FULL[branchCN || '子'];
  return { solarYear, pillarCN: (stemCN || '甲') + (branchCN || '子'), stemCN: stemCN || '甲', branchCN: branchCN || '子', element: se?.element || 'Wood', yinyang: se?.yy || 'Yang', shio: bm?.shio || 'Tiger' };
}
function monthPillarExact(localDate: Date, yearStemCN: string) {
  const lam = solarAppLongitudeDeg(new Date(localDate.toLocaleString("en-US", { timeZone: "UTC" })));
  const idx = monthIndexFromLongitude(lam); // 0..11
  const branchCN = MONTH_BRANCHES_CN[idx]; const stemCN = MONTH_STEM_MAP[yearStemCN]?.[idx];
  const se = STEM_ELEMENT[stemCN || '甲']; const bm = BRANCH_META_FULL[branchCN || '子'];
  return { monthIndex: idx + 1, pillarCN: (stemCN || '甲') + (branchCN || '子'), stemCN: stemCN || '甲', branchCN: branchCN || '子', element: se?.element || 'Wood', yinyang: se?.yy || 'Yang', shio: bm?.shio || 'Tiger' };
}
function dayPillarExact(localDate: Date, _tz: string = TZ_DEFAULT) {
  const dayStartLocal = new Date(new Date(localDate).setHours(0, 0, 0, 0));
  const dayStartUTC = new Date(dayStartLocal.toLocaleString("en-US", { timeZone: "UTC" }));
  const JD = toJulianDayUTC(dayStartUTC); const JD0 = toJulianDayUTC(JIAZI_ANCHOR_UTC);
  const delta = Math.round(JD - JD0); const idx = ((delta % 60) + 60) % 60;
  const pair = JIA_ZI[idx]; const stem = pair?.[0] || '甲', branch = pair?.[1] || '子';
  const se = STEM_ELEMENT[stem]; const bm = BRANCH_META_FULL[branch];
  return { pillarCN: pair || '甲子', stemCN: stem, branchCN: branch, element: se?.element || 'Wood', yinyang: se?.yy || 'Yang', shio: bm?.shio || 'Tiger' };
}

// ——— Compatibility wrappers (menjaga pemanggil lama) ———
function sexagenaryFromDate(d: Date) {
  // Boundary tahun pakai Li Chun (bukan Imlek)
  const y = yearPillarExact(d, TZ_DEFAULT);
  const n = y.solarYear - 1984;
  const idx = ((n % 60) + 60) % 60;
  const stem_idx = ((n % 10) + 10) % 10;
  const branch_idx = ((n % 12) + 12) % 12;
  return { idx, stem_idx, branch_idx, baziYear: y.solarYear };
}

// ========= ENRICH (tidak mengubah bentuk data UI) =========
function enrich(rows: Row[]) {
  const out = rows.map(r => {
    const y = yearPillarExact(r.date, TZ_DEFAULT);
    const m = monthPillarExact(r.date, y.stemCN || '甲');
    const di = dayPillarExact(r.date, TZ_DEFAULT);

    // legacy fields: tetap isi dari Year pillar
    const n = y.solarYear - 1984;
    const stem_idx = ((n % 10) + 10) % 10;
    const branch_idx = ((n % 12) + 12) % 12;
    const stem = stems[stem_idx];
    const branch = branches[branch_idx];
    const pillar_year = `${stem} ${branch}`;
    const element = stemElem[stem_idx];
    const yinyang = stemYY[stem_idx];
    const sh = shio[branch_idx];

    return {
      ...r,
      pillar_year, element, yinyang, shio: sh, stem, branch,
      stemCN: y.stemCN, branchCN: y.branchCN,

      // detail for BaZi aggregations (dipakai fungsi agregasi)
      year_solar: y.solarYear, year_element: y.element, year_yinyang: y.yinyang, year_shio: y.shio, year_pillarCN: y.pillarCN,
      month_element: m.element, month_yinyang: m.yinyang, month_shio: m.shio, month_pillarCN: m.pillarCN, month_index: m.monthIndex,
      day_element: di.element, day_yinyang: di.yinyang, day_shio: di.shio, day_pillarCN: di.pillarCN,
    };
  });

  // ret & ATR14 sama seperti sebelumnya
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]?.close ?? NaN; const cur = out[i]?.close ?? NaN;
    (out as any)[i].ret = (isFinite(prev) && isFinite(cur) && prev !== 0) ? (cur - prev) / prev : NaN;
  }
  const tr: number[] = out.map((row, i) => {
    const h = row.high ?? NaN, l = row.low ?? NaN, cPrev = (i > 0 ? out[i - 1]?.close : NaN) as number;
    const a = (isFinite(h) && isFinite(l)) ? (h - l) : NaN;
    const b = (isFinite(h) && isFinite(cPrev)) ? Math.abs(h - cPrev) : NaN;
    const c = (isFinite(l) && isFinite(cPrev)) ? Math.abs(l - cPrev) : NaN;
    return Math.max(a || 0, b || 0, c || 0) || NaN;
  });
  const atr14: (number | undefined)[] = [];
  for (let i = 0; i < out.length; i++) {
    if (i < 13) { atr14.push(undefined); continue; }
    let s = 0, n = 0; for (let k = i - 13; k <= i; k++) { if (isFinite(tr[k] || 0)) { s += (tr[k] || 0); n++; } }
    atr14.push(n ? s / n : undefined);
  }
  for (let i = 0; i < out.length; i++) {
    (out as any)[i].atr14 = atr14[i];
    const c = out[i]?.close ?? NaN;
    (out as any)[i].atr14_frac = (isFinite(atr14[i] as number) && isFinite(c) && c !== 0) ? (atr14[i] as number) / c : undefined;
  }
  return out;
}

// ========= HELPERS: Probability Up/Down/Flat =========
function upDownFlat(arr: any[]) {
  let up = 0, down = 0, flat = 0, total = 0;
  for (const a of arr) {
    if (Number.isFinite(a.open) && Number.isFinite(a.close)) {
      total++;
      if (a.close > a.open) up++;
      else if (a.close < a.open) down++;
      else flat++;
    }
  }
  return { up, down, flat, total };
}

// ========= AGGREGATIONS (Year/Month/Day) =========
// YEARLY (BaZi year via Li Chun)
function aggregateByElement(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.year_element ?? r.element; (groups[key] ||= []).push(r); });
  const core = Object.entries(groups).map(([element, arr]) => {
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a => a.ret).filter((x: any) => Number.isFinite(x)) as number[];
    const atrs = arr.map(a => a.atr14_frac).filter((x: any) => Number.isFinite(x)) as number[];

    // open->close per BaZi Year (year_solar)
    const perYear: Record<number, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr) {
      const yid = r.year_solar as number;
      if (!perYear[yid]) perYear[yid] = {};
      if (perYear[yid].openStart == null) {
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close) ? r.close : undefined);
        if (o != null) perYear[yid].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perYear[yid].closeEnd = r.close as number;
    }
    const yearRets = Object.values(perYear)
      .map(v => (Number.isFinite(v.openStart) && Number.isFinite(v.closeEnd) && (v.openStart as number) !== 0)
        ? ((v.closeEnd as number) - (v.openStart as number)) / (v.openStart as number) : NaN)
      .filter(x => Number.isFinite(x)) as number[];

    return {
      element,
      days: arr.length,
      avg_daily_ret: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0,
      prob_up: total ? up / total : 0,
      prob_down: total ? down / total : 0,
      prob_flat: total ? flat / total : 0,
      avg_year_oc: yearRets.length ? yearRets.reduce((a, b) => a + b, 0) / yearRets.length : 0,
      n_years: yearRets.length,
      avg_atr_frac: atrs.length ? atrs.reduce((a, b) => a + b, 0) / atrs.length : 0,
    };
  });
  const have = new Set(core.map(r => r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, prob_flat: 0, avg_year_oc: 0, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a, b) => b.avg_year_oc - a.avg_year_oc);
}
function aggregateByShio(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.year_shio ?? r.shio; (groups[key] ||= []).push(r); });
  return Object.entries(groups).map(([shio, arr]) => {
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a => a.ret).filter((x: any) => Number.isFinite(x)) as number[];
    const atrs = arr.map(a => a.atr14_frac).filter((x: any) => Number.isFinite(x)) as number[];

    const perYear: Record<number, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr) {
      const yid = r.year_solar as number;
      if (!perYear[yid]) perYear[yid] = {};
      if (perYear[yid].openStart == null) {
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close) ? r.close : undefined);
        if (o != null) perYear[yid].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perYear[yid].closeEnd = r.close as number;
    }
    const yearRets = Object.values(perYear)
      .map(v => (Number.isFinite(v.openStart) && Number.isFinite(v.closeEnd) && (v.openStart as number) !== 0)
        ? ((v.closeEnd as number) - (v.openStart as number)) / (v.openStart as number) : NaN)
      .filter(x => Number.isFinite(x)) as number[];

    return {
      shio,
      days: arr.length,
      avg_daily_ret: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0,
      prob_up: total ? up / total : 0,
      prob_down: total ? down / total : 0,
      prob_flat: total ? flat / total : 0,
      avg_year_oc: yearRets.length ? yearRets.reduce((a, b) => a + b, 0) / yearRets.length : 0,
      n_years: yearRets.length,
      avg_atr_frac: atrs.length ? atrs.reduce((a, b) => a + b, 0) / atrs.length : 0,
    };
  }).sort((a, b) => b.avg_year_oc - a.avg_year_oc);
}

// MONTHLY (BaZi month via solar longitude)
function aggregateByElementMonthly(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.month_element ?? r.element; (groups[key] ||= []).push(r); });
  const core = Object.entries(groups).map(([element, arr]) => {
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a => a.ret).filter((x: any) => Number.isFinite(x)) as number[];
    const atrs = arr.map(a => a.atr14_frac).filter((x: any) => Number.isFinite(x)) as number[];

    const perMonth: Record<string, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr) {
      const key = `${r.year_solar}-${r.month_index}`;
      if (!perMonth[key]) perMonth[key] = {};
      if (perMonth[key].openStart == null) {
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close) ? r.close : undefined);
        if (o != null) perMonth[key].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perMonth[key].closeEnd = r.close as number;
    }
    const monthRets = Object.values(perMonth)
      .map(v => (Number.isFinite(v.openStart) && Number.isFinite(v.closeEnd) && (v.openStart as number) !== 0)
        ? ((v.closeEnd as number) - (v.openStart as number)) / (v.openStart as number) : NaN)
      .filter(x => Number.isFinite(x)) as number[];

    return {
      element,
      days: arr.length,
      avg_daily_ret: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0,
      prob_up: total ? up / total : 0,
      prob_down: total ? down / total : 0,
      prob_flat: total ? flat / total : 0,
      avg_year_oc: monthRets.length ? monthRets.reduce((a, b) => a + b, 0) / monthRets.length : 0,
      n_years: monthRets.length,
      avg_atr_frac: atrs.length ? atrs.reduce((a, b) => a + b, 0) / atrs.length : 0,
    };
  });
  const have = new Set(core.map(r => r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, prob_flat: 0, avg_year_oc: 0, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a, b) => b.avg_year_oc - a.avg_year_oc);
}
function aggregateByShioMonthly(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.month_shio ?? r.shio; (groups[key] ||= []).push(r); });
  return Object.entries(groups).map(([shio, arr]) => {
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a => a.ret).filter((x: any) => Number.isFinite(x)) as number[];
    const atrs = arr.map(a => a.atr14_frac).filter((x: any) => Number.isFinite(x)) as number[];

    const perMonth: Record<string, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr) {
      const key = `${r.year_solar}-${r.month_index}`;
      if (!perMonth[key]) perMonth[key] = {};
      if (perMonth[key].openStart == null) {
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close) ? r.close : undefined);
        if (o != null) perMonth[key].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perMonth[key].closeEnd = r.close as number;
    }
    const monthRets = Object.values(perMonth)
      .map(v => (Number.isFinite(v.openStart) && Number.isFinite(v.closeEnd) && (v.openStart as number) !== 0)
        ? ((v.closeEnd as number) - (v.openStart as number)) / (v.openStart as number) : NaN)
      .filter(x => Number.isFinite(x)) as number[];

    return {
      shio,
      days: arr.length,
      avg_daily_ret: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0,
      prob_up: total ? up / total : 0,
      prob_down: total ? down / total : 0,
      prob_flat: total ? flat / total : 0,
      avg_year_oc: monthRets.length ? monthRets.reduce((a, b) => a + b, 0) / monthRets.length : 0,
      n_years: monthRets.length,
      avg_atr_frac: atrs.length ? atrs.reduce((a, b) => a + b, 0) / atrs.length : 0,
    };
  }).sort((a, b) => b.avg_year_oc - a.avg_year_oc);
}

// DAILY (per civil day)
function aggregateByElementDaily(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.day_element ?? r.element; (groups[key] ||= []).push(r); });
  const core = Object.entries(groups).map(([element, arr]) => {
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a => a.ret).filter((x: any) => Number.isFinite(x)) as number[];
    const atrs = arr.map(a => a.atr14_frac).filter((x: any) => Number.isFinite(x)) as number[];
    const ocs = arr.map(a => (Number.isFinite(a.open) && Number.isFinite(a.close) && a.open !== 0)
      ? ((a.close as number) - (a.open as number)) / (a.open as number) : NaN).filter((x: any) => Number.isFinite(x)) as number[];
    const avg_day_oc = ocs.length ? ocs.reduce((a, b) => a + b, 0) / ocs.length : 0;
    return {
      element, days: arr.length,
      avg_daily_ret: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0,
      prob_up: total ? up / total : 0,
      prob_down: total ? down / total : 0,
      prob_flat: total ? flat / total : 0,
      avg_year_oc: avg_day_oc,
      n_years: ocs.length,
      avg_atr_frac: atrs.length ? atrs.reduce((a, b) => a + b, 0) / atrs.length : 0,
    };
  });
  const have = new Set(core.map(r => r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, prob_flat: 0, avg_year_oc: 0, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a, b) => b.avg_daily_ret - a.avg_daily_ret);
}
function aggregateByShioDaily(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.day_shio ?? r.shio; (groups[key] ||= []).push(r); });
  return Object.entries(groups).map(([shio, arr]) => {
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a => a.ret).filter((x: any) => Number.isFinite(x)) as number[];
    const atrs = arr.map(a => a.atr14_frac).filter((x: any) => Number.isFinite(x)) as number[];
    const ocs = arr.map(a => (Number.isFinite(a.open) && Number.isFinite(a.close) && a.open !== 0)
      ? ((a.close as number) - (a.open as number)) / (a.open as number) : NaN).filter((x: any) => Number.isFinite(x)) as number[];
    const avg_day_oc = ocs.length ? ocs.reduce((a, b) => a + b, 0) / ocs.length : 0;
    return {
      shio, days: arr.length,
      avg_daily_ret: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0,
      prob_up: total ? up / total : 0,
      prob_down: total ? down / total : 0,
      prob_flat: total ? flat / total : 0,
      avg_year_oc: avg_day_oc,
      n_years: ocs.length,
      avg_atr_frac: atrs.length ? atrs.reduce((a, b) => a + b, 0) / atrs.length : 0,
    };
  }).sort((a, b) => b.avg_daily_ret - a.avg_daily_ret);
}

// ========= UI (LAYOUT TIDAK DIUBAH, hanya isi sel untuk tampilkan Flat) =========

// New, styled 4-section card matching yearly layout
function DateInfoCardNew() {
  const today = new Date();
  const weekdayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const weekday = weekdayNames[today.getDay()];
  const day = today.getDate();
  const month = monthNames[today.getMonth()];
  const year = today.getFullYear();
  const time = today.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const Y = yearPillarExact(today, TZ_DEFAULT);
  const M = monthPillarExact(today, Y.stemCN || '甲');
  const D = dayPillarExact(today, TZ_DEFAULT);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Hari Ini</h3>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center text-center">
          {/* Waktu Sekarang */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Waktu Sekarang</div>
            <div className="text-2xl font-bold">{weekday}</div>
            <div className="text-xl text-foreground">{day} {month} {year}</div>
            <Badge intent="blue">{time}</Badge>
          </div>
          {/* Yearly */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Pilar Tahun</div>
            <div className="text-lg font-semibold">{Y.pillarCN} <span className="text-muted-foreground">({Y.shio})</span></div>
            <div className="text-sm text-muted-foreground">{Y.element} - {Y.yinyang}</div>
          </div>
          {/* Monthly */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Pilar Bulan</div>
            <div className="text-lg font-semibold">{M.pillarCN} <span className="text-muted-foreground">({M.shio})</span></div>
            <div className="text-sm text-muted-foreground">{M.element} - {M.yinyang}</div>
          </div>
          {/* Daily */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Pilar Hari</div>
            <div className="text-lg font-semibold">{D.pillarCN} <span className="text-muted-foreground">({D.shio})</span></div>
            <div className="text-sm text-muted-foreground">{D.element} - {D.yinyang}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


export default function BaZiCycleAnalyzer() {
  const { showToast } = useToast();
  const today = new Date();
  const yyyy = today.getFullYear();
  const endISO = today.toISOString().slice(0, 10);
  const startISO = new Date(yyyy - 3, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  const [params, setParams] = useState<RunParams>({
    ticker: "",
    anchorMethod: "jiazi1984",
    startDate: startISO,
    endDate: endISO,
    hourPillar: false,
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false); // Loading for data fetching (when ticker changes)
  const [analyzing, setAnalyzing] = useState(false); // Loading for analysis (when Run Analysis is clicked)
  const [err, setErr] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('yearly');
  const [elemSort, setElemSort] = useState<{ key: string | null; mode: 'default' | 'desc' | 'asc' }>({ key: null, mode: 'default' });
  const [shioSort, setShioSort] = useState<{ key: string | null; mode: 'default' | 'desc' | 'asc' }>({ key: null, mode: 'default' });
  const [tickerDropdownOpen, setTickerDropdownOpen] = useState<boolean>(false);
  const [tickerActiveIndex, setTickerActiveIndex] = useState<number>(-1);
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [tickerSearchQuery, setTickerSearchQuery] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tickerDropdownWrapRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const anchorDateRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const [isMenuTwoRows, setIsMenuTwoRows] = useState<boolean>(false);

  const filteredTickers = useMemo(() => {
    const q = (tickerSearchQuery || '').toLowerCase().trim();
    if (!q) return availableStocks;
    return availableStocks.filter(t => t.toLowerCase().includes(q));
  }, [tickerSearchQuery, availableStocks]);


  // Load available stocks from stockList.ts on mount
  useEffect(() => {
    const loadStocks = async () => {
      try {
        await loadStockList();
        const stockList = STOCK_LIST;
        setAvailableStocks(stockList);
      } catch (err) {
        console.error('Error loading stocks:', err);
      }
    };

    loadStocks();
  }, []);

  // Load stock data from Azure when ticker is selected
  useEffect(() => {
    const loadStockData = async () => {
      if (!params.ticker || availableStocks.length === 0) {
        setRows([]);
        // Don't reset result - keep previous result visible until user clicks "Run Analysis"
        // setResult(null);
        return;
      }

      // Skip loading if it's demo data (already loaded)
      if (params.ticker === 'DEMO') {
        return;
      }

      // Use the selected ticker directly
      const selectedTicker = params.ticker;
      if (!selectedTicker) {
        setRows([]);
        // Don't reset result - keep previous result visible until user clicks "Run Analysis"
        // setResult(null);
        return;
      }

      try {
        setLoading(true);
        setErr(null);

        const endDate = params.endDate;
        const startDate = params.startDate;

        const result = await api.getStockData(selectedTicker, startDate, endDate, 1000);
        if (result.success && result.data?.data) {
          const stockData = result.data.data;

          // Convert Azure stock data to Row format
          const convertedRows: Row[] = stockData.map((dayData: StockOHLCData) => ({
            date: new Date(dayData.Date),
            open: dayData.Open,
            high: dayData.High,
            low: dayData.Low,
            close: dayData.Close,
            volume: dayData.Volume,
            value: dayData.Value,
            frequency: dayData.Frequency,
            changePercent: dayData.ChangePercent
          }));

          setRows(convertedRows);
          // Don't reset result here - keep previous result visible until user clicks "Run Analysis"
          // setResult(null); // Removed - keep previous result visible
          // Set default start date to oldest available date from loaded data
          try {
            const dates = convertedRows.map(r => r.date).filter((d: any) => d instanceof Date && !isNaN(+d));
            if (dates.length) {
              const minISO = new Date(Math.min.apply(null, dates as any)).toISOString().slice(0, 10);
              // Only update startDate if it's different to avoid triggering unnecessary re-renders
              setParams(p => {
                if (p.startDate !== minISO) {
                  return { ...p, startDate: minISO };
                }
                return p;
              });
            }
          } catch { }
        } else {
          setErr('Failed to load stock data');
          setRows([]);
        }
      } catch (error) {
        console.error('Error loading stock data:', error);
        setErr('Failed to load stock data');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadStockData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ticker, availableStocks]);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tickerDropdownWrapRef.current && !tickerDropdownWrapRef.current.contains(event.target as Node)) {
        setTickerDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Monitor menu height to detect if it wraps to 2 rows
  useEffect(() => {
    const checkMenuHeight = () => {
      if (menuContainerRef.current) {
        const menuHeight = menuContainerRef.current.offsetHeight;
        // If menu height is more than ~50px, it's likely 2 rows (single row is usually ~40-45px)
        setIsMenuTwoRows(menuHeight > 50);
      }
    };

    // Check initially
    checkMenuHeight();

    // Check on window resize
    window.addEventListener('resize', checkMenuHeight);

    // Use ResizeObserver for more accurate detection
    let resizeObserver: ResizeObserver | null = null;
    if (menuContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        checkMenuHeight();
      });
      resizeObserver.observe(menuContainerRef.current);
    }

    // Also check when filters change (affects menu height)
    const timeoutId = setTimeout(checkMenuHeight, 100);

    return () => {
      window.removeEventListener('resize', checkMenuHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      clearTimeout(timeoutId);
    };
  }, [params.ticker, params.anchorMethod, params.anchorDate, params.startDate, params.endDate]);

  const onUpload = async (f: File | null) => {
    setErr(null);
    if (!f) { setRows([]); return; }
    const text = await f.text();
    const parsed = parseCsvSmart(text);
    if (!parsed.length) { setErr("CSV kosong atau tidak terbaca"); setRows([]); return; }
    setRows(parsed);
    // Set ticker field to filename (without extension) for visibility
    try {
      const base = (f.name || '').replace(/\.[^./\\]+$/, '');
      if (base) setParams(p => ({ ...p, ticker: base }));
    } catch { }
    try {
      const dates = parsed.map(r => r.date).filter((d: any) => d instanceof Date && !isNaN(+d));
      if (dates.length) {
        const minISO = new Date(Math.min.apply(null, dates as any)).toISOString().slice(0, 10);
        setParams(p => ({ ...p, startDate: minISO }));
      }
    } catch { }
  };

  const runAnalysis = async () => {
    if (!rows.length) return;

    setAnalyzing(true);
    setErr(null);
    try {
      const start = new Date(params.startDate + "T00:00:00Z");
      const end = new Date(params.endDate + "T23:59:59Z");
      const subset = rows.filter(r => r.date >= start && r.date <= end);
      if (!subset.length) throw new Error("Tidak ada data pada rentang tanggal");

      // Apply anchor method if custom is selected
      let enriched;
      if (params.anchorMethod === "custom" && params.anchorDate) {
        // For custom anchor, we would need to modify the BaZi calculation
        // For now, we'll use the default calculation but this could be extended
        console.log("Custom anchor date selected:", params.anchorDate);
        enriched = enrich(subset);
      } else {
        enriched = enrich(subset);
      }

      const byElemYear = aggregateByElement(enriched as any);
      const byElemMonth = aggregateByElementMonthly(enriched as any);
      const byElemDay = aggregateByElementDaily(enriched as any);
      const byShYear = aggregateByShio(enriched as any);
      const byShMonth = aggregateByShioMonthly(enriched as any);
      const byShDay = aggregateByShioDaily(enriched as any);
      const presentCount = byElemYear.filter((x: any) => x.days > 0).length;
      // Store the ticker and date range used for this analysis so "Ringkasan Data" doesn't change when params change
      setResult({
        enriched,
        byElemYear,
        byElemMonth,
        byElemDay,
        byShYear,
        byShMonth,
        byShDay,
        presentCount,
        analysisTicker: params.ticker,
        analysisStartDate: params.startDate,
        analysisEndDate: params.endDate
      });

      showToast({
        type: 'success',
        title: 'Analysis Complete',
        message: `Ba Zi analysis completed for ${subset.length} data points`
      });
    } catch (e: any) {
      const errorMessage = e?.message || "Gagal menjalankan analisis";
      setErr(errorMessage);
      setResult(null);
      showToast({
        type: 'error',
        title: 'Analysis Error',
        message: errorMessage
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Removed auto-run analysis - analysis will only run when "Run Analysis" button is clicked

  // Handle start date change
  const handleStartDateChange = (dateString: string) => {
    const newDate = getDateFromInput(dateString);

    // Validate start date is not after end date
    if (newDate > new Date(params.endDate + "T00:00:00")) {
      showToast({
        type: 'error',
        title: 'Invalid Date Range',
        message: 'Start date cannot be after end date'
      });
      return;
    }

    setParams(p => ({ ...p, startDate: dateString }));
    setErr(null);
  };

  // Handle end date change
  const handleEndDateChange = (dateString: string) => {
    const newDate = getDateFromInput(dateString);

    // Validate end date is not before start date
    if (newDate < new Date(params.startDate + "T00:00:00")) {
      showToast({
        type: 'error',
        title: 'Invalid Date Range',
        message: 'End date cannot be before start date'
      });
      return;
    }

    setParams(p => ({ ...p, endDate: dateString }));
    setErr(null);
  };

  // anchor label removed from UI

  const elemData = useMemo(() => {
    if (!result) return [] as any[];
    if ('byElemYear' in result) {
      return timeframe === 'yearly' ? result.byElemYear : (timeframe === 'monthly' ? result.byElemMonth : result.byElemDay);
    }
    return (result as any).byElem || [];
  }, [result, timeframe]);

  const sortedElemData = useMemo(() => {
    if (!elemData || !elemData.length || elemSort.mode === 'default' || !elemSort.key) return elemData;
    const key = elemSort.key as keyof any;
    const data = [...elemData];
    data.sort((a: any, b: any) => {
      const va = a[key] ?? 0; const vb = b[key] ?? 0;
      const diff = (Number(va) as number) - (Number(vb) as number);
      return elemSort.mode === 'asc' ? diff : -diff;
    });
    return data;
  }, [elemData, elemSort]);

  const cycleElemSort = (key: string) => {
    setElemSort(prev => {
      const nextMode = (prev.key !== key)
        ? 'desc'
        : prev.mode === 'default' ? 'desc' : prev.mode === 'desc' ? 'asc' : 'default';
      return { key, mode: nextMode };
    });
  };

  const shioData = useMemo(() => {
    if (!result) return [] as any[];
    if ('byShYear' in result) {
      return timeframe === 'yearly' ? result.byShYear : (timeframe === 'monthly' ? result.byShMonth : result.byShDay);
    }
    return (result as any).bySh || [];
  }, [result, timeframe]);

  const sortedShioData = useMemo(() => {
    if (!shioData || !shioData.length || shioSort.mode === 'default' || !shioSort.key) return shioData;
    const key = shioSort.key as keyof any;
    const data = [...shioData];
    data.sort((a: any, b: any) => {
      const va = a[key] ?? 0; const vb = b[key] ?? 0;
      const diff = (Number(va) as number) - (Number(vb) as number);
      return shioSort.mode === 'asc' ? diff : -diff;
    });
    return data;
  }, [shioData, shioSort]);

  const cycleShioSort = (key: string) => {
    setShioSort(prev => {
      const nextMode = (prev.key !== key)
        ? 'desc'
        : prev.mode === 'default' ? 'desc' : prev.mode === 'desc' ? 'asc' : 'default';
      return { key, mode: nextMode };
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-background overflow-x-hidden">
      <div className="w-full">
        {/* Top Controls - Compact without Card */}
        {/* Pada layar kecil/menengah menu ikut scroll; hanya di layar besar (lg+) yang fixed di top */}
        <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1.5 lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
          <div ref={menuContainerRef} className="flex flex-col md:flex-row md:flex-wrap items-center gap-1 md:gap-x-7 md:gap-y-0.5">
            {/* Stock Selection */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
              <label className="text-sm font-medium whitespace-nowrap">Stock:</label>
              <div className="relative flex-1 md:flex-none md:w-64" ref={tickerDropdownWrapRef}>
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={params.ticker === 'DEMO' ? 'DEMO' : params.ticker || 'Search and select stock...'}
                  value={tickerSearchQuery}
                  onChange={(e) => {
                    setTickerSearchQuery(e.target.value);
                    setTickerDropdownOpen(true);
                    setTickerActiveIndex(0);
                  }}
                  onFocus={() => {
                    setTickerDropdownOpen(true);
                    setTickerActiveIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (!tickerDropdownOpen) return;
                    const suggestions = filteredTickers.slice(0, 15);
                    const total = suggestions.length + 1; // +1 for Browse CSV option
                    if (total === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setTickerActiveIndex(prev => {
                        const next = prev + 1;
                        return next >= total ? 0 : next;
                      });
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setTickerActiveIndex(prev => {
                        const next = prev - 1;
                        return next < 0 ? total - 1 : next;
                      });
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const idx = tickerActiveIndex >= 0 ? tickerActiveIndex : 0;
                      if (idx === suggestions.length) {
                        // Browse CSV selected
                        setTickerDropdownOpen(false);
                        setTickerActiveIndex(-1);
                        fileInputRef.current?.click();
                        return;
                      }
                      const choice = suggestions[idx];
                      if (choice) {
                        setParams(p => ({ ...p, ticker: choice }));
                        setTickerSearchQuery('');
                        setTickerDropdownOpen(false);
                        setTickerActiveIndex(-1);
                      }
                    } else if (e.key === 'Escape') {
                      setTickerDropdownOpen(false);
                      setTickerActiveIndex(-1);
                    }
                  }}
                  className="w-full h-9 pl-10 pr-3 text-sm border border-[#3a4252] rounded-md bg-background text-foreground hover:border-primary/50 focus:border-primary focus:outline-none transition-colors"
                  role="combobox"
                  aria-expanded={tickerDropdownOpen}
                  aria-controls="bazi-ticker-suggestions"
                  aria-autocomplete="list"
                />
                {params.ticker && params.ticker !== 'DEMO' && params.ticker !== '' && (
                  <button
                    type="button"
                    aria-label="Clear selection"
                    className="absolute inset-y-0 right-0 pr-2 flex items-center text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setParams(p => ({ ...p, ticker: '' }));
                      setTickerSearchQuery('');
                      setRows([]);
                      // Don't reset result - keep previous result visible until user clicks "Run Analysis"
                      // setResult(null);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}

                {/* Stock Search and Select Dropdown */}
                {tickerDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                    {availableStocks.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">Loading stocks...</div>
                    ) : (
                      <>
                        {/* Show filtered results */}
                        {filteredTickers
                          .slice(0, 15)
                          .map((stock, idx) => (
                            <button
                              key={stock}
                              role="option"
                              aria-selected={tickerActiveIndex === idx}
                              onMouseEnter={() => setTickerActiveIndex(idx)}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setParams(p => ({ ...p, ticker: stock }));
                                setTickerSearchQuery('');
                                setTickerDropdownOpen(false);
                                setTickerActiveIndex(-1);
                              }}
                              className={`flex items-center justify-between w-full px-3 py-2 text-left transition-colors ${tickerActiveIndex === idx ? 'bg-accent' : 'hover:bg-accent'
                                }`}
                            >
                              <span className="text-sm">{stock}</span>
                              <div className="flex items-center gap-2">
                                {params.ticker === stock && (
                                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                                )}
                                <Plus className="w-3 h-3 text-muted-foreground" />
                              </div>
                            </button>
                          ))}

                        {/* Show "more available" message */}
                        {!tickerSearchQuery && filteredTickers.length > 15 && (
                          <div className="text-xs text-muted-foreground px-3 py-2 border-t border-[#3a4252]">
                            +{filteredTickers.length - 15} more stocks available (use search to find specific stocks)
                          </div>
                        )}

                        {/* Show "no results" message */}
                        {tickerSearchQuery && filteredTickers.length === 0 && (
                          <div className="p-2 text-sm text-muted-foreground">
                            No stocks found matching "{tickerSearchQuery}"
                          </div>
                        )}

                        {/* Browse CSV action */}
                        <div className="my-1 h-px bg-[#3a4252]" />
                        <div
                          key="browse-csv"
                          role="option"
                          aria-selected={tickerActiveIndex === filteredTickers.length}
                          onMouseEnter={() => setTickerActiveIndex(filteredTickers.length)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setTickerDropdownOpen(false);
                            setTickerActiveIndex(-1);
                            fileInputRef.current?.click();
                          }}
                          className={`px-3 py-2 rounded cursor-pointer flex items-center justify-between ${tickerActiveIndex === filteredTickers.length ? 'bg-accent' : 'hover:bg-muted'}`}
                        >
                          <span className="text-sm font-medium">Browse CSV…</span>
                          <span className="text-xs text-muted-foreground">Upload file</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {/* Hidden file input to support Browse CSV */}
                <input ref={fileInputRef} className="hidden" type="file" accept=".csv" onChange={(e) => onUpload(e.target.files?.[0] || null)} />
              </div>
            </div>

            {/* Anchor Method */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
              <label className="text-sm font-medium whitespace-nowrap">Anchor Method:</label>
              <select
                value={params.anchorMethod}
                onChange={(e: any) => setParams(p => ({ ...p, anchorMethod: e.target.value }))}
                className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
              >
                <option value="jiazi1984">Default</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {/* Anchor Date (Custom) - Conditional */}
            {params.anchorMethod === "custom" && (
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                <label className="text-sm font-medium whitespace-nowrap">Anchor Date:</label>
                <div
                  className="relative h-9 w-full md:w-auto md:min-w-[140px] rounded-md border border-[#3a4252] bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => triggerDatePicker(anchorDateRef)}
                >
                  <input
                    ref={anchorDateRef}
                    type="date"
                    value={params.anchorDate || ""}
                    onChange={(e: any) => setParams(p => ({ ...p, anchorDate: e.target.value }))}
                    onKeyDown={(e) => e.preventDefault()}
                    onPaste={(e) => e.preventDefault()}
                    onInput={(e) => e.preventDefault()}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ caretColor: 'transparent' }}
                  />
                  <div className="flex items-center gap-2 h-full px-3">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {params.anchorDate ? new Date(params.anchorDate + "T00:00:00").toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      }) : 'Select date'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Start Date */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
              <label className="text-sm font-medium whitespace-nowrap">Start Date:</label>
              <div
                className="relative h-9 w-full md:w-auto md:min-w-[140px] rounded-md border border-[#3a4252] bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(startDateRef)}
              >
                <input
                  ref={startDateRef}
                  type="date"
                  value={params.startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  max={params.endDate}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center gap-2 h-full px-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {new Date(params.startDate + "T00:00:00").toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* End Date */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
              <label className="text-sm font-medium whitespace-nowrap">End Date:</label>
              <div
                className="relative h-9 w-full md:w-auto md:min-w-[140px] rounded-md border border-[#3a4252] bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(endDateRef)}
              >
                <input
                  ref={endDateRef}
                  type="date"
                  value={params.endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  min={params.startDate}
                  max={new Date().toISOString().split('T')[0]}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center gap-2 h-full px-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {new Date(params.endDate + "T00:00:00").toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Run Analysis Button */}
            <button
              type="button"
              onClick={runAnalysis}
              disabled={analyzing || rows.length === 0}
              className={`h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center gap-2 w-full md:w-auto ${loading || rows.length === 0
                  ? ''
                  : ''
                }`}
              aria-disabled={loading || rows.length === 0}
              title={rows.length === 0 ? 'Load data dulu sebelum menjalankan analisis' : 'Jalankan analisis'}
            >
              <Sparkles className="w-4 h-4" />
              {loading ? 'Running…' : 'Run Analysis'}
            </button>
          </div>
        </div>

        {/* Spacer untuk header fixed - hanya diperlukan di layar besar (lg+) */}
        <div className={isMenuTwoRows ? "h-0 lg:h-[60px]" : "h-0 lg:h-[38px]"}></div>

        <div className="w-full space-y-8 p-4 sm:p-6 md:p-10">
          {/* Error and Loading Messages */}
          {err && (
            <div className="text-sm text-destructive px-4 py-2 bg-destructive/10 rounded-md">
              {err}
            </div>
          )}
          {!err && !rows.length && params.ticker && params.ticker !== 'DEMO' && (
            <div className="text-xs text-muted-foreground px-4">
              Tips: pilih stock dari dropdown atau klik <em>Browse CSV</em> untuk upload file CSV.
            </div>
          )}

          {/* Loading indicator removed - loading will be shown on each card when analyzing */}

          {(result || analyzing) && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.4 }}>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 overflow-x-auto">
                <Card className="xl:col-span-1">
                  <CardHeader>
                    <SectionTitle title="Ringkasan Data" />
                  </CardHeader>
                  <CardContent>
                    {analyzing ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex flex-col items-center gap-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                          <div className="text-sm text-muted-foreground">Menjalankan analisis Ba Zi...</div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Ticker</span>
                          <Badge intent="blue">
                            {result.analysisTicker === 'DEMO' ? 'DEMO' :
                              result.analysisTicker ? result.analysisTicker.toUpperCase() : 'No Selection'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between"><span className="text-muted-foreground">Rows</span><span className="font-medium">{result.enriched.length}</span></div>
                        <div className="flex items-center justify-between"><span className="text-muted-foreground">Date Range</span><span className="font-medium text-xs sm:text-sm">{result.analysisStartDate || params.startDate} → {result.analysisEndDate || params.endDate}</span></div>
                        {/* <div className="text-xs text-muted-foreground">Tahun Ba Zi pakai batas <b>Li Chun (λ☉=315°)</b>; tanggal sebelum Li Chun masuk ke tahun sebelumnya.</div> */}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="xl:col-span-2">
                  {analyzing ? (
                    <Card>
                      <CardHeader>
                        <h3 className="text-lg font-semibold">Hari Ini</h3>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-center py-8">
                          <div className="flex flex-col items-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <div className="text-sm text-muted-foreground">Menjalankan analisis Ba Zi...</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <DateInfoCardNew />
                  )}
                </div>

                <Card className="xl:col-span-3">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <SectionTitle title="Performa per Element (Year Pillar)" subtitle="Avg daily return, Probability Up/Down, Avg Open→Close % (per Ba Zi Year), Cycle Count, ATR/Close" />
                    <div className="mt-0"><TimeframeTabs value={timeframe} onChange={setTimeframe} /></div>
                  </CardHeader>
                  <CardContent>
                    {analyzing ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                          <div className="text-sm text-muted-foreground">Menjalankan analisis Ba Zi...</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {timeframe === 'yearly' && (<>
                          <div className="w-full overflow-x-auto">
                            <div className="min-w-[720px] grid grid-cols-1 md:grid-cols-7 gap-2 text-sm font-medium mb-2 justify-items-start">
                              <button className="text-left" onClick={() => cycleElemSort('element')}>Element <Filter className="inline w-3 h-3 ml-1" /></button>
                              <button className="text-left" onClick={() => cycleElemSort('days')}>Days <Filter className="inline w-3 h-3 ml-1" /></button>
                              <button className="text-left" onClick={() => cycleElemSort('prob_up')}>Prob Up <Filter className="inline w-3 h-3 ml-1" /></button>
                              <button className="text-left" onClick={() => cycleElemSort('prob_down')}>Prob Down <Filter className="inline w-3 h-3 ml-1" /></button>
                              <button className="text-left" onClick={() => cycleElemSort('prob_flat')}>Prob Flat <Filter className="inline w-3 h-3 ml-1" /></button>
                              <button className="text-left" onClick={() => cycleElemSort('avg_year_oc')}>Avg Open-Close % (Year) <Filter className="inline w-3 h-3 ml-1" /></button>
                              <button className="text-left" onClick={() => cycleElemSort('n_years')}>Cycle Count <Filter className="inline w-3 h-3 ml-1" /></button>
                            </div>
                            <div className="divide-y min-w-[720px]">
                              {sortedElemData.map((r: any, i: number) => (
                                <div key={i} className="grid grid-cols-1 md:grid-cols-7 gap-2 py-2 text-sm">
                                  <div><Badge intent="violet">{r.element}</Badge></div>
                                  <div>{r.days}</div>

                                  <div>{(r.prob_up * 100).toFixed(1)}%</div>
                                  <div>{(r.prob_down * 100).toFixed(1)}%</div>
                                  <div>{(r.prob_flat * 100).toFixed(1)}%</div>
                                  <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc * 100).toFixed(2) + '%' : '—'}</div>
                                  <div>{r.n_years ?? 0}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>)}
                        {timeframe !== 'yearly' && (
                          <>
                            <div className="w-full overflow-x-auto">
                              <div className={"min-w-[720px] grid grid-cols-1 " + (timeframe === 'daily' ? 'md:grid-cols-7' : 'md:grid-cols-7') + " gap-2 text-sm font-medium mb-2 justify-items-start"}>
                                <button className="text-left" onClick={() => cycleElemSort('element')}>Element <Filter className="inline w-3 h-3 ml-1" /></button>
                                <button className="text-left" onClick={() => cycleElemSort('days')}>Days <Filter className="inline w-3 h-3 ml-1" /></button>
                                <button className="text-left" onClick={() => cycleElemSort('prob_up')}>Prob Up <Filter className="inline w-3 h-3 ml-1" /></button>
                                <button className="text-left" onClick={() => cycleElemSort('prob_down')}>Prob Down <Filter className="inline w-3 h-3 ml-1" /></button>
                                <button className="text-left" onClick={() => cycleElemSort('prob_flat')}>Prob Flat <Filter className="inline w-3 h-3 ml-1" /></button>
                                {timeframe !== 'daily' && (
                                  <>
                                    <button className="text-left" onClick={() => cycleElemSort('avg_year_oc')}>{timeframe === 'monthly' ? 'Avg Open-Close % (BaZi Month)' : 'Avg Open-Close % (Year)'} <Filter className="inline w-3 h-3 ml-1" /></button>
                                    <button className="text-left" onClick={() => cycleElemSort('n_years')}>Cycle Count <Filter className="inline w-3 h-3 ml-1" /></button>
                                  </>
                                )}
                                {timeframe === 'daily' && (
                                  <>
                                    <button className="text-left" onClick={() => cycleElemSort('avg_year_oc')}>Avg Open-Close % (Day) <Filter className="inline w-3 h-3 ml-1" /></button>
                                    <button className="text-left" onClick={() => cycleElemSort('n_years')}>Cycle Count <Filter className="inline w-3 h-3 ml-1" /></button>
                                  </>
                                )}
                              </div>
                              <div className="divide-y min-w-[720px]">
                                {sortedElemData.map((r: any, i: number) => (
                                  <div key={i} className={"grid grid-cols-1 " + (timeframe === 'daily' ? 'md:grid-cols-7' : 'md:grid-cols-7') + " gap-2 py-2 text-sm"}>
                                    <div><Badge intent="violet">{r.element}</Badge></div>
                                    <div>{r.days}</div>
                                    <div>{(r.prob_up * 100).toFixed(1)}%</div>
                                    <div>{(r.prob_down * 100).toFixed(1)}%</div>
                                    <div>{(r.prob_flat * 100).toFixed(1)}%</div>
                                    {timeframe !== 'daily' && (
                                      <>
                                        <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc * 100).toFixed(2) + '%' : '-'}</div>
                                        <div>{r.n_years ?? 0}</div>
                                      </>
                                    )}
                                    {timeframe === 'daily' && (
                                      <>
                                        <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc * 100).toFixed(2) + '%' : '-'}</div>
                                        <div>{r.n_years ?? 0}</div>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                <div className="xl:col-span-3">
                  <Card>
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <SectionTitle title={
                        timeframe === 'yearly' ? 'Performa per Shio (Year Branch)' : (timeframe === 'monthly' ? 'Performa per Shio (BaZi Month)' : 'Performa per Shio (Daily)')
                      } subtitle={
                        timeframe === 'daily'
                          ? 'Avg daily return, Probability Up/Down, ATR/Close'
                          : (timeframe === 'yearly'
                            ? 'Avg daily return, Probability Up/Down, Avg Open→Close % (per Ba Zi Year), Cycle Count, ATR/Close'
                            : 'Avg daily return, Probability Up/Down, Avg Open→Close % (per BaZi Month), Cycle Count, ATR/Close')
                      } />
                      <div className="mt-0"><TimeframeTabs value={timeframe} onChange={setTimeframe} /></div>
                    </CardHeader>
                    <CardContent>
                      {analyzing ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <div className="text-sm text-muted-foreground">Menjalankan analisis Ba Zi...</div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full overflow-x-auto">
                          <div className={"min-w-[720px] grid grid-cols-1 " + (timeframe === 'daily' ? 'md:grid-cols-7' : 'md:grid-cols-7') + " gap-2 text-sm font-medium mb-2 justify-items-start"}>
                            <button className="text-left" onClick={() => cycleShioSort('shio')}>Shio <Filter className="inline w-3 h-3 ml-1" /></button>
                            <button className="text-left" onClick={() => cycleShioSort('days')}>Days <Filter className="inline w-3 h-3 ml-1" /></button>
                            <button className="text-left" onClick={() => cycleShioSort('prob_up')}>Prob Up <Filter className="inline w-3 h-3 ml-1" /></button>
                            <button className="text-left" onClick={() => cycleShioSort('prob_down')}>Prob Down <Filter className="inline w-3 h-3 ml-1" /></button>
                            <button className="text-left" onClick={() => cycleShioSort('prob_flat')}>Prob Flat <Filter className="inline w-3 h-3 ml-1" /></button>
                            {timeframe !== 'daily' && (
                              <>
                                <button className="text-left" onClick={() => cycleShioSort('avg_year_oc')}>{timeframe === 'monthly' ? 'Avg Open→Close % (BaZi Month)' : 'Avg Open→Close % (Year)'} <Filter className="inline w-3 h-3 ml-1" /></button>
                                <button className="text-left" onClick={() => cycleShioSort('n_years')}>Cycle Count <Filter className="inline w-3 h-3 ml-1" /></button>
                              </>
                            )}
                            {timeframe === 'daily' && (<>
                              <button className="text-left" onClick={() => cycleShioSort('avg_year_oc')}>Avg Open-Close % (Day) <Filter className="inline w-3 h-3 ml-1" /></button>
                              <button className="text-left" onClick={() => cycleShioSort('n_years')}>Cycle Count <Filter className="inline w-3 h-3 ml-1" /></button>
                            </>)}
                          </div>
                          <div className="divide-y min-w-[720px]">
                            {sortedShioData.map((r: any, i: number) => (
                              <div key={i} className={"grid grid-cols-1 " + (timeframe === 'daily' ? 'md:grid-cols-7' : 'md:grid-cols-7') + " gap-2 py-2 text-sm"}>
                                <div><Badge intent="gray">{r.shio}</Badge></div>
                                <div>{r.days}</div>

                                <div>{(r.prob_up * 100).toFixed(1)}%</div>
                                <div>{(r.prob_down * 100).toFixed(1)}%</div>
                                <div>{(r.prob_flat * 100).toFixed(1)}%</div>
                                {timeframe !== 'daily' && (
                                  <>
                                    <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc * 100).toFixed(2) + '%' : '—'}</div>
                                    <div>{r.n_years ?? 0}</div>
                                  </>
                                )}
                                {timeframe === 'daily' && (<>
                                  <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc * 100).toFixed(2) + '%' : '-'}</div>
                                  <div>{r.n_years ?? 0}</div>
                                </>)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          {!result && !loading && (
            <Card>
              <CardContent>
                <div className="flex flex-col gap-3 p-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2"><LineChart className="w-5 h-5 text-muted-foreground" />Langkah cepat</div>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Pilih stock dari dropdown atau upload CSV OHLC harian.</li>
                    <li>Pilih Anchor Method + set Date Range.</li>
                    <li>Analisis akan berjalan otomatis setelah data dimuat.</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ——— Simple tests (optional, no UI impact) ———
function runUnitTests() {
  try {
    const csv1 = `date,open,close\n2020-01-01,1,2\n2020-01-02,2,3`;
    const csv2 = `date,open,close\r\n2020-01-01,1,2\r\n2020-01-02,2,3`;
    console.assert(parseCsvSmart(csv1).length === 2 && parseCsvSmart(csv2).length === 2, "CSV newline variants ok");

    const euro = `date;open;close\n2024-01-01;43.850,00;44.000,00\n2024-01-02;44.000,00;44.100,00`;
    const e = parseCsvSmart(euro);
    console.assert(Math.abs((e[1]?.close as number) - 44100) < 1e-6, "EU decimal parsed");

    // Year boundary must flip around early Feb (Li Chun), not Lunar New Year now
    const pre = sexagenaryFromDate(new Date("2024-02-03T00:00:00+07:00"));
    const post = sexagenaryFromDate(new Date("2024-02-05T00:00:00+07:00"));
    console.assert(pre?.baziYear !== post?.baziYear, "BaZi year flips on Li Chun boundary");

    const mini = parseCsvSmart(`date,open,close\n2024-01-01,1,2\n2024-01-02,2,1`);
    const enr = enrich(mini);
    const agg = aggregateByElement(enr as any);
    const count5 = agg.filter(x => (ELEMENTS as readonly string[]).includes(x.element as string)).length;
    console.assert(count5 === 5, "Always show 5 elements (padded)");

    const twoYears = parseCsvSmart(`date,open,close\n2023-02-03,100,100\n2023-12-31,100,120\n2024-02-05,120,120\n2024-12-31,120,132`);
    const enr2 = enrich(twoYears);
    const bySh = aggregateByShio(enr2 as any);
    const anySh = bySh[0];
    console.assert((anySh?.n_years as number) >= 1, "Yearly OC should count at least one BaZi year");
  } catch (err) {
    console.warn("Unit tests warning:", err);
  }
}
if (typeof window !== "undefined") runUnitTests();





















