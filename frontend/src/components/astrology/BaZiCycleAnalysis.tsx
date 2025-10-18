import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, LineChart, Play, RefreshCw, Settings2, Sparkles, Spline } from "lucide-react";

const Card = ({ className = "", children }: any) => (
  <div className={`rounded-2xl shadow-sm border border-border bg-card ${className}`}>{children}</div>
);
const CardHeader = ({ className = "", children }: any) => (
  <div className={`p-5 border-b border-border ${className}`}>{children}</div>
);
const CardContent = ({ className = "", children }: any) => (
  <div className={`p-5 ${className}`}>{children}</div>
);
const Button = ({ className = "", children, ...props }: any) => (
  <button className={`px-4 py-2 rounded-xl shadow-sm border border-border bg-background text-foreground hover:bg-accent transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`} {...props}>{children}</button>
);
const Input = ({ className = "", ...props }: any) => (
  <input className={`w-full px-3 py-2 rounded-xl border border-border bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-accent ${className}`} {...props}/>
);
const Select = ({ className = "", children, ...props }: any) => (
  <select className={`w-full px-3 py-2 rounded-xl border border-border bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-accent ${className}`} {...props}>{children}</select>
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
  return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${color[intent] || color.gray}`}>{children}</span>;
};

const SectionTitle = ({ icon: Icon, title, subtitle }: any) => (
  <div className="flex items-center gap-3">
    <div className="p-2 rounded-xl bg-muted"><Icon className="w-5 h-5" /></div>
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  </div>
);

function TimeframeTabs({ value, onChange }: { value: Timeframe; onChange: (v: Timeframe)=>void }){
  const base = 'px-3 py-1.5 text-sm rounded-md border';
  const active = 'bg-primary text-primary-foreground border-primary';
  const inactive = 'bg-background text-foreground hover:bg-muted border-border';
  return (
    <div className="inline-flex items-center gap-1">
      <button className={`${base} ${value==='yearly'?active:inactive}`} onClick={()=>onChange('yearly')}>Yearly</button>
      <button className={`${base} ${value==='monthly'?active:inactive}`} onClick={()=>onChange('monthly')}>Monthly</button>
      <button className={`${base} ${value==='daily'?active:inactive}`} onClick={()=>onChange('daily')}>Daily</button>
    </div>
  );
}

interface RunParams {
  ticker: string;
  anchorMethod: "personal" | "market" | "jiazi1984" | "custom";
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
}

type Timeframe = 'yearly' | 'monthly' | 'daily';

function parseCsvSmart(text: string): Row[] {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delim = ([",",";","\t"] as const).reduce((best, cur) => {
    const re = new RegExp(cur === "\t" ? "\\t" : cur, "g");
    const cnt = (firstLine.match(re) || []).length;
    const bestCnt = (firstLine.match(new RegExp(best === "\t" ? "\\t" : best, "g")) || []).length;
    return cnt > bestCnt ? cur : best;
  }, ",");

  const lines = text.split(/\r?\n+/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(delim).map(h => h.replace(/^\s*\"|\"\s*$/g, "").trim().toLowerCase());

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
  const iDate = ["date","time","timestamp"].map(idx).find(i => i !== -1) ?? 0;
  const iOpen = idx("open");
  const iHigh = idx("high");
  const iLow  = idx("low");
  const iClose= headers.findIndex(h => ["close","adj close","close price","closing price"].includes(h));
  const iVol  = ["volume","vol"].map(idx).find(i => i !== -1) ?? -1;

  const rows: Row[] = [];
  for (let k = 1; k < lines.length; k++) {
    const parts = lines[k].split(delim).map(p=>p.replace(/^\s*\"|\"\s*$/g, ""));
    if (!parts[iDate]) continue;
    const d = new Date(parts[iDate]); if (isNaN(+d)) continue;
    const r: Row = { date: d };
    if (iOpen !== -1) r.open = num(parts[iOpen]);
    if (iHigh !== -1) r.high = num(parts[iHigh]);
    if (iLow  !== -1) r.low  = num(parts[iLow]);
    if (iClose!== -1) r.close= num(parts[iClose]);
    if (iVol  !== -1) r.volume= num(parts[iVol]);
    rows.push(r);
  }
  return rows.sort((a,b)=>+a.date-+b.date);
}

const LNY: Record<number, string> = {
  2020: "2020-01-25", 2021: "2021-02-12", 2022: "2022-02-01", 2023: "2023-01-22",
  2024: "2024-02-10", 2025: "2025-01-29", 2026: "2026-02-17", 2027: "2027-02-06",
  2028: "2028-01-26", 2029: "2029-02-13", 2030: "2030-02-03",
};
const stems = ["Jia","Yi","Bing","Ding","Wu","Ji","Geng","Xin","Ren","Gui"] as const;
const stemsCN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"] as const;
const stemElem = ["Wood","Wood","Fire","Fire","Earth","Earth","Metal","Metal","Water","Water"] as const;
const stemYY   = ["Yang","Yin","Yang","Yin","Yang","Yin","Yang","Yin","Yang","Yin"] as const;
const branches = ["Zi","Chou","Yin","Mao","Chen","Si","Wu","Wei","Shen","You","Xu","Hai"] as const;
const branchesCN = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"] as const;
const shio = ["Rat","Ox","Tiger","Rabbit","Dragon","Snake","Horse","Goat","Monkey","Rooster","Dog","Pig"] as const;
const ELEMENTS = ["Wood","Fire","Earth","Metal","Water"] as const;

function sexagenaryFromDate(d: Date){
  const y = d.getFullYear();
  const boundary = (y in LNY)
    ? new Date(LNY[y] + "T00:00:00Z")
    : new Date(Date.UTC(y, 1, 4));
  const baziYear = (d.getTime() < boundary.getTime()) ? y - 1 : y;
  const idx = ((baziYear - 1984) % 60 + 60) % 60;
  const stem_idx = idx % 10;
  const branch_idx = idx % 12;
  return { idx, stem_idx, branch_idx, baziYear };
}

// Approximate BaZi month index (0..11) with 0 = Tiger month, using fallback
// solar-term boundaries around the 4th–8th of each Gregorian month.
function getBaziMonthIndex(d: Date): number {
  const starts = [6,4,6,5,6,6,7,8,8,8,7,7]; // Jan..Dec threshold day-of-month when month flips
  const order = [1,2,3,4,5,6,7,8,9,10,11,0]; // Feb..Dec, Jan
  const m = d.getMonth();
  const day = d.getDate();
  const p = order.indexOf(m);
  const threshold = starts[m] ?? 4;
  const idx = day >= threshold ? p : (p + 11) % 12;
  return idx; // 0=Tiger, 1=Rabbit, ..., 11=Ox
}

function getBaziMonthKey(d: Date): string {
  const { baziYear } = sexagenaryFromDate(d);
  const mi = getBaziMonthIndex(d);
  return `${baziYear}-${mi}`;
}

function enrich(rows: Row[]) {
  const out = rows.map(r => {
    const { stem_idx, branch_idx } = sexagenaryFromDate(r.date);
    const stem = stems[stem_idx];
    const branch = branches[branch_idx];
    const pillar_year = `${stem} ${branch}`;
    const element = stemElem[stem_idx];
    const yinyang = stemYY[stem_idx];
    const sh = shio[branch_idx];
    return { ...r, pillar_year, element, yinyang, shio: sh, stem, branch, stemCN: stemsCN[stem_idx], branchCN: branchesCN[branch_idx] };
  });
  for (let i=1;i<out.length;i++){
    const prev = out[i-1].close ?? NaN; const cur = out[i].close ?? NaN;
    (out as any)[i].ret = (isFinite(prev) && isFinite(cur) && prev !== 0) ? (cur - prev)/prev : NaN;
  }
  const tr: number[] = out.map((row, i)=>{
    const h = row.high ?? NaN, l = row.low ?? NaN, cPrev = (i>0 ? out[i-1].close : NaN) as number;
    const a = (isFinite(h)&&isFinite(l)) ? (h - l) : NaN;
    const b = (isFinite(h)&&isFinite(cPrev)) ? Math.abs(h - cPrev) : NaN;
    const c = (isFinite(l)&&isFinite(cPrev)) ? Math.abs(l - cPrev) : NaN;
    return Math.max(a||0,b||0,c||0) || NaN;
  });
  const atr14: (number|undefined)[] = [];
  for (let i=0;i<out.length;i++){
    if (i<13){ atr14.push(undefined); continue; }
    let s = 0, n=0; for (let k=i-13;k<=i;k++){ if (isFinite(tr[k])){ s+=tr[k]; n++; } }
    atr14.push(n? s/n : undefined);
  }
  for (let i=0;i<out.length;i++){
    (out as any)[i].atr14 = atr14[i];
    const c = out[i].close ?? NaN;
    (out as any)[i].atr14_frac = (isFinite(atr14[i] as number) && isFinite(c) && c !== 0) ? (atr14[i] as number)/c : undefined;
  }
  return out;
}

function aggregateByElement(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { if(!groups[r.element]) groups[r.element]=[]; groups[r.element].push(r); });
  const core = Object.entries(groups).map(([element, arr])=>{
    const days = arr.length;
    let upCount = 0, downCount = 0, totalCount = 0;
    for (const a of arr) {
      if (Number.isFinite(a.open) && Number.isFinite(a.close)) {
        totalCount++;
        if (a.close > a.open) upCount++;
        else if (a.close < a.open) downCount++;
      }
    }
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x));
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x));
    const perYear: Record<number, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr) {
      const { baziYear } = sexagenaryFromDate(r.date);
      if (!perYear[baziYear]) perYear[baziYear] = {};
      if (perYear[baziYear].openStart == null) {
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close) ? r.close : undefined);
        if (o != null) perYear[baziYear].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perYear[baziYear].closeEnd = r.close as number;
    }
    const yearRets: number[] = Object.values(perYear)
      .map(v => (Number.isFinite(v.openStart) && Number.isFinite(v.closeEnd) && (v.openStart as number) !== 0)
        ? ((v.closeEnd as number) - (v.openStart as number)) / (v.openStart as number)
        : NaN)
      .filter(x => Number.isFinite(x)) as number[];
    const avg_year_oc = yearRets.length ? yearRets.reduce((a,b)=>a+b,0)/yearRets.length : 0;
    const n_years = yearRets.length;

    return {
      element,
      days,
      avg_daily_ret: rets.length? rets.reduce((a:number,b:number)=>a+b,0)/rets.length : 0,
      prob_up: totalCount? upCount/totalCount : 0,
      prob_down: totalCount? downCount/totalCount : 0,
      avg_year_oc,
      n_years,
      avg_atr_frac: atrs.length? atrs.reduce((a:number,b:number)=>a+b,0)/atrs.length : 0,
    };
  });
  const have = new Set(core.map(r=>r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, avg_year_oc: 0, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a,b)=> b.avg_year_oc - a.avg_year_oc);
}

function aggregateByShio(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { if(!groups[r.shio]) groups[r.shio]=[]; groups[r.shio].push(r); });
  return Object.entries(groups).map(([shio, arr])=>{
    const days = arr.length;
    let upCount = 0, downCount = 0, totalCount = 0;
    for (const a of arr) {
      if (Number.isFinite(a.open) && Number.isFinite(a.close)) {
        totalCount++;
        if (a.close > a.open) upCount++;
        else if (a.close < a.open) downCount++;
      }
    }
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x));
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x));
    const perYear: Record<number, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr) {
      const { baziYear } = sexagenaryFromDate(r.date);
      if (!perYear[baziYear]) perYear[baziYear] = {};
      if (perYear[baziYear].openStart == null) {
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close) ? r.close : undefined);
        if (o != null) perYear[baziYear].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perYear[baziYear].closeEnd = r.close as number;
    }
    const yearRets: number[] = Object.values(perYear)
      .map(v => (Number.isFinite(v.openStart) && Number.isFinite(v.closeEnd) && (v.openStart as number) !== 0)
        ? ((v.closeEnd as number) - (v.openStart as number)) / (v.openStart as number)
        : NaN)
      .filter(x => Number.isFinite(x)) as number[];
    const avg_year_oc = yearRets.length ? yearRets.reduce((a,b)=>a+b,0)/yearRets.length : 0;
    const n_years = yearRets.length;

    return {
      shio,
      days,
      avg_daily_ret: rets.length? rets.reduce((a:number,b:number)=>a+b,0)/rets.length : 0,
      prob_up: totalCount? upCount/totalCount : 0,
      prob_down: totalCount? downCount/totalCount : 0,
      avg_year_oc,
      n_years,
      avg_atr_frac: atrs.length? atrs.reduce((a:number,b:number)=>a+b,0)/atrs.length : 0,
    };
  }).sort((a,b)=> b.avg_year_oc - a.avg_year_oc);
}

// Monthly aggregation (Gregorian months)
function aggregateByElementMonthly(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { if(!groups[r.element]) groups[r.element]=[]; groups[r.element].push(r); });
  const core = Object.entries(groups).map(([element, arr])=>{
    const days = arr.length;
    let upCount = 0, downCount = 0, totalCount = 0;
    for (const a of arr) {
      if (Number.isFinite(a.open) && Number.isFinite(a.close)) {
        totalCount++;
        if (a.close > a.open) upCount++;
        else if (a.close < a.open) downCount++;
      }
    }
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x));
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x));
    const perMonth: Record<string, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr) {
      const key = getBaziMonthKey(r.date);
      if (!perMonth[key]) perMonth[key] = {};
      if (perMonth[key].openStart == null) {
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close) ? r.close : undefined);
        if (o != null) perMonth[key].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perMonth[key].closeEnd = r.close as number;
    }
    const monthRets: number[] = Object.values(perMonth)
      .map(v => (Number.isFinite(v.openStart) && Number.isFinite(v.closeEnd) && (v.openStart as number) !== 0)
        ? ((v.closeEnd as number) - (v.openStart as number)) / (v.openStart as number)
        : NaN)
      .filter(x => Number.isFinite(x)) as number[];
    const avg_year_oc = monthRets.length ? monthRets.reduce((a,b)=>a+b,0)/monthRets.length : 0;
    const n_years = monthRets.length;

    return {
      element,
      days,
      avg_daily_ret: rets.length? rets.reduce((a:number,b:number)=>a+b,0)/rets.length : 0,
      prob_up: totalCount? upCount/totalCount : 0,
      prob_down: totalCount? downCount/totalCount : 0,
      avg_year_oc,
      n_years,
      avg_atr_frac: atrs.length? atrs.reduce((a:number,b:number)=>a+b,0)/atrs.length : 0,
    };
  });
  const have = new Set(core.map(r=>r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, avg_year_oc: 0, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a,b)=> b.avg_year_oc - a.avg_year_oc);
}

function aggregateByShioMonthly(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { if(!groups[r.shio]) groups[r.shio]=[]; groups[r.shio].push(r); });
  return Object.entries(groups).map(([shio, arr])=>{
    const days = arr.length;
    let upCount = 0, downCount = 0, totalCount = 0;
    for (const a of arr) {
      if (Number.isFinite(a.open) && Number.isFinite(a.close)) {
        totalCount++;
        if (a.close > a.open) upCount++;
        else if (a.close < a.open) downCount++;
      }
    }
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x));
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x));
    const perMonth: Record<string, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr) {
      const key = getBaziMonthKey(r.date);
      if (!perMonth[key]) perMonth[key] = {};
      if (perMonth[key].openStart == null) {
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close) ? r.close : undefined);
        if (o != null) perMonth[key].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perMonth[key].closeEnd = r.close as number;
    }
    const monthRets: number[] = Object.values(perMonth)
      .map(v => (Number.isFinite(v.openStart) && Number.isFinite(v.closeEnd) && (v.openStart as number) !== 0)
        ? ((v.closeEnd as number) - (v.openStart as number)) / (v.openStart as number)
        : NaN)
      .filter(x => Number.isFinite(x)) as number[];
    const avg_year_oc = monthRets.length ? monthRets.reduce((a,b)=>a+b,0)/monthRets.length : 0;
    const n_years = monthRets.length;

    return {
      shio,
      days,
      avg_daily_ret: rets.length? rets.reduce((a:number,b:number)=>a+b,0)/rets.length : 0,
      prob_up: totalCount? upCount/totalCount : 0,
      prob_down: totalCount? downCount/totalCount : 0,
      avg_year_oc,
      n_years,
      avg_atr_frac: atrs.length? atrs.reduce((a:number,b:number)=>a+b,0)/atrs.length : 0,
    };
  }).sort((a,b)=> b.avg_year_oc - a.avg_year_oc);
}

// Daily aggregation (with per-day Open→Close average)
function aggregateByElementDaily(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { if(!groups[r.element]) groups[r.element]=[]; groups[r.element].push(r); });
  const core = Object.entries(groups).map(([element, arr])=>{
    const days = arr.length;
    let upCount = 0, downCount = 0, totalCount = 0;
    for (const a of arr) {
      if (Number.isFinite(a.open) && Number.isFinite(a.close)) {
        totalCount++;
        if (a.close > a.open) upCount++;
        else if (a.close < a.open) downCount++;
      }
    }
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x));
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x));
    const ocs = arr
      .map(a => (Number.isFinite(a.open) && Number.isFinite(a.close) && a.open !== 0) ? ((a.close as number) - (a.open as number)) / (a.open as number) : NaN)
      .filter((x:any)=>Number.isFinite(x));
    const avg_day_oc = ocs.length ? (ocs as number[]).reduce((a:number,b:number)=>a+b,0)/ocs.length : NaN;
    return {
      element,
      days,
      avg_daily_ret: rets.length? rets.reduce((a:number,b:number)=>a+b,0)/rets.length : 0,
      prob_up: totalCount? upCount/totalCount : 0,
      prob_down: totalCount? downCount/totalCount : 0,
      avg_year_oc: avg_day_oc,
      n_years: 0,
      avg_atr_frac: atrs.length? atrs.reduce((a:number,b:number)=>a+b,0)/atrs.length : 0,
    };
  });
  const have = new Set(core.map(r=>r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, avg_year_oc: NaN, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a,b)=> b.avg_daily_ret - a.avg_daily_ret);
}

function aggregateByShioDaily(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { if(!groups[r.shio]) groups[r.shio]=[]; groups[r.shio].push(r); });
  return Object.entries(groups).map(([shio, arr])=>{
    const days = arr.length;
    let upCount = 0, downCount = 0, totalCount = 0;
    for (const a of arr) {
      if (Number.isFinite(a.open) && Number.isFinite(a.close)) {
        totalCount++;
        if (a.close > a.open) upCount++;
        else if (a.close < a.open) downCount++;
      }
    }
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x));
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x));
    const ocs = arr
      .map(a => (Number.isFinite(a.open) && Number.isFinite(a.close) && a.open !== 0) ? ((a.close as number) - (a.open as number)) / (a.open as number) : NaN)
      .filter((x:any)=>Number.isFinite(x));
    const avg_day_oc = ocs.length ? (ocs as number[]).reduce((a:number,b:number)=>a+b,0)/ocs.length : NaN;
    return {
      shio,
      days,
      avg_daily_ret: rets.length? rets.reduce((a:number,b:number)=>a+b,0)/rets.length : 0,
      prob_up: totalCount? upCount/totalCount : 0,
      prob_down: totalCount? downCount/totalCount : 0,
      avg_year_oc: avg_day_oc,
      n_years: 0,
      avg_atr_frac: atrs.length? atrs.reduce((a:number,b:number)=>a+b,0)/atrs.length : 0,
    };
  }).sort((a,b)=> b.avg_daily_ret - a.avg_daily_ret);
}
function DateInfoCard() {
  const today = new Date();
  const weekdayNames = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const weekday = weekdayNames[today.getDay()];
  const day = today.getDate();
  const month = monthNames[today.getMonth()];
  const year = today.getFullYear();
  const time = today.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const { stem_idx, branch_idx } = sexagenaryFromDate(today);
  const stem = stems[stem_idx];
  const branch = branches[branch_idx];
  const pillar = `${stem} ${branch}`;
  const pillarCN = `${stemsCN[stem_idx]}${branchesCN[branch_idx]}`;
  const element = stemElem[stem_idx];
  const zodiac = shio[branch_idx];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Hari Ini</h3>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center text-center">
          <div className="space-y-1">
            <div className="text-2xl font-bold">{weekday}</div>
            <div className="text-xl text-foreground">{day} {month} {year}</div>
            <Badge intent="blue">Waktu Lokal: {time}</Badge>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Pilar Tahun</div>
            <div className="text-lg font-semibold">{pillar} <span className="text-muted-foreground">({pillarCN})</span></div>
            <div className="text-sm text-muted-foreground">Element: <span className="font-medium">{element}</span></div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Branch / Shio</div>
            <div className="text-lg font-semibold">{branch} · {zodiac} <span className="text-muted-foreground">({branchesCN[branch_idx]})</span></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function YearBranchCard({ data }: any) {
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <SectionTitle icon={LineChart} title="Performa per Shio (Year Branch)" subtitle="Avg daily return, Probability Up/Down, Avg Open→Close % (per Ba Zi Year), #Years, ATR/Close" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-8 gap-2 text-sm font-medium mb-2">
          <div>Shio</div>
          <div>Days</div>
          <div>Avg Daily Ret</div>
          <div>Prob Up</div>
          <div>Prob Down</div>
          <div>Avg Open→Close % (Year)</div>
          <div>#Years</div>
          <div>Avg ATR/Close</div>
        </div>
        <div className="divide-y">
          {data.map((r:any, i:number)=> (
            <div key={i} className="grid grid-cols-1 md:grid-cols-8 gap-2 py-2 text-sm">
              <div><Badge intent="gray">{r.shio}</Badge></div>
              <div>{r.days}</div>
              <div>{(r.avg_daily_ret*100).toFixed(3)}%</div>
              <div>{(r.prob_up*100).toFixed(1)}%</div>
              <div>{(r.prob_down*100).toFixed(1)}%</div>
              <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '—'}</div>
              <div>{r.n_years ?? 0}</div>
              <div>{(r.avg_atr_frac*100).toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BaZiCycleAnalyzer() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const endISO = today.toISOString().slice(0, 10);
  const startISO = new Date(yyyy - 3, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  const [params, setParams] = useState<RunParams>({
    ticker: "BTCUSD",
    anchorMethod: "jiazi1984",
    startDate: startISO,
    endDate: endISO,
    hourPillar: false,
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('yearly');

  const canRun = useMemo(() => {
    const { ticker, startDate, endDate } = params;
    return ticker.trim().length > 0 && startDate <= endDate && rows.length > 0;
  }, [params, rows]);

  const onUpload = async (f: File | null) => {
    setErr(null);
    if (!f) { setRows([]); return; }
    const text = await f.text();
    const parsed = parseCsvSmart(text);
    if (!parsed.length) { setErr("CSV kosong atau tidak terbaca"); setRows([]); return; }
    setRows(parsed);
  };

  const loadDemo = () => {
    const demo = `date,open,high,low,close,volume\n`
      + `2024-01-01,42000,42500,41800,42400,1000\n`
      + `2024-01-02,42400,43000,42000,42800,1200\n`
      + `2024-01-03,42800,43500,42500,43250,1100\n`
      + `2024-01-04,43250,43800,43000,43500,1300\n`
      + `2024-01-05,43500,44000,43200,43850,1250`;
    setRows(parseCsvSmart(demo));
    setErr(null);
  };

  const onRun = async () => {
    setLoading(true);
    setErr(null);
    try{
      const start = new Date(params.startDate + "T00:00:00Z");
      const end = new Date(params.endDate + "T23:59:59Z");
      const subset = rows.filter(r => r.date >= start && r.date <= end);
      if (!subset.length) throw new Error("Tidak ada data pada rentang tanggal");
      const enriched = enrich(subset);
      const byElemYear = aggregateByElement(enriched as any);
      const byElemMonth = aggregateByElementMonthly(enriched as any);
      const byElemDay = aggregateByElementDaily(enriched as any);
      const byShYear = aggregateByShio(enriched as any);
      const byShMonth = aggregateByShioMonthly(enriched as any);
      const byShDay = aggregateByShioDaily(enriched as any);
      const presentCount = byElemYear.filter((x:any) => x.days > 0).length;
      setResult({ enriched, byElemYear, byElemMonth, byElemDay, byShYear, byShMonth, byShDay, presentCount });
    }catch(e:any){
      setErr(e?.message || "Gagal menjalankan analisis");
      setResult(null);
    }finally{
      setLoading(false);
    }
  };

  const anchorLabel = useMemo(() => {
    switch (params.anchorMethod) {
      case "personal": return "Personal (Tanggal lahir)";
      case "market": return "Market (IPO/Listing)";
      case "jiazi1984": return "Jia Zi 1984 (Imlek)";
      case "custom": return "Custom";
      default: return "";
    }
  }, [params.anchorMethod]);

  const elemData = useMemo(() => {
    if (!result) return [] as any[];
    if ('byElemYear' in result) {
      return timeframe === 'yearly' ? result.byElemYear : (timeframe === 'monthly' ? result.byElemMonth : result.byElemDay);
    }
    return (result as any).byElem || [];
  }, [result, timeframe]);

  const shioData = useMemo(() => {
    if (!result) return [] as any[];
    if ('byShYear' in result) {
      return timeframe === 'yearly' ? result.byShYear : (timeframe === 'monthly' ? result.byShMonth : result.byShDay);
    }
    return (result as any).bySh || [];
  }, [result, timeframe]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-background p-4 sm:p-6 md:p-10">
      <div className="w-full space-y-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Ba Zi Cycle Analyzer</h1>
              <p className="text-muted-foreground mt-2">Upload <strong>CSV OHLC</strong>, isi <strong>ticker</strong>, pilih <strong>anchor</strong>, lalu jalankan analisis.</p>
            </div>
            <Badge intent="blue">v0.7.0</Badge>
          </div>
        </motion.div>

        <Card>
          <CardHeader>
            <SectionTitle icon={Settings2} title="Pengaturan Analisis" subtitle="Isi parameter & upload data sebelum running" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <label className="text-sm font-medium">Ticker Code</label>
                <Input placeholder="BTCUSD / IDX:BBCA / AAPL" value={params.ticker} onChange={(e:any)=>setParams(p=>({...p,ticker:e.target.value}))} className="mt-1"/>
                <p className="text-xs text-muted-foreground mt-1">Dukung prefiks bursa (IDX:, NASDAQ:, NYSE:).</p>
              </div>
              <div className="md:col-span-3">
                <label className="text-sm font-medium">Anchor Method</label>
                <Select value={params.anchorMethod} onChange={(e:any)=>setParams(p=>({...p,anchorMethod:e.target.value}))} className="mt-1">
                  <option value="jiazi1984">Jia Zi 1984 (Imlek)</option>
                  <option value="market">Market (IPO/Listing)</option>
                  <option value="personal">Personal (Tanggal Lahir)</option>
                  <option value="custom">Custom</option>
                </Select>
              </div>
              {params.anchorMethod==="custom" && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium">Anchor Date (Custom)</label>
                  <Input type="date" value={params.anchorDate||""} onChange={(e:any)=>setParams(p=>({...p,anchorDate:e.target.value}))} className="mt-1"/>
                </div>
              )}
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Start Date</label>
                <Input type="date" value={params.startDate} onChange={(e:any)=>setParams(p=>({...p,startDate:e.target.value}))} className="mt-1"/>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">End Date</label>
                <Input type="date" value={params.endDate} onChange={(e:any)=>setParams(p=>({...p,endDate:e.target.value}))} className="mt-1"/>
              </div>

              <div className="md:col-span-12">
                <label className="text-sm font-medium">Upload CSV (OHLC Daily)</label>
                <div className="mt-1 flex items-center gap-3 flex-wrap">
                  <input type="file" accept=".csv" onChange={(e)=> onUpload(e.target.files?.[0] || null)} />
                  <Button onClick={loadDemo}><RefreshCw className="w-4 h-4 mr-2 inline"/>Load Demo (BTC snippet)</Button>
                  <Badge intent={rows.length? "green":"amber"}>{rows.length? `${rows.length} rows loaded` : "No data"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Parser auto: delimiter ",/;/tab" & format angka Eropa/US.</p>
              </div>

              <div className="md:col-span-12 flex items-center justify-between pt-2">
                <div className="text-sm text-muted-foreground">Anchor: <Badge intent="amber">{anchorLabel}</Badge></div>
                <div className="flex gap-2">
                  <Button onClick={()=>{setParams(p=>({...p,ticker:"",anchorMethod:"jiazi1984",anchorDate:undefined})); setRows([]); setResult(null);}}><RefreshCw className="w-4 h-4 mr-2 inline"/>Reset</Button>
                  <Button className="bg-black text-white hover:shadow-md" onClick={onRun} disabled={!canRun || loading}>
                    {loading ? (<><Spline className="w-4 h-4 mr-2 inline animate-spin"/>Running</>) : (<><Play className="w-4 h-4 mr-2 inline"/>Run Analysis</>)}
                  </Button>
                </div>
              </div>
              {err && <div className="md:col-span-12 text-sm text-red-600">{err}</div>}
              {!err && !rows.length && (<div className="md:col-span-12 text-xs text-muted-foreground">Tips: klik <em>Load Demo</em> untuk mencoba analisis tanpa upload.</div>)}
            </div>
          </CardContent>
        </Card>

        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.4 }}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <SectionTitle icon={Sparkles} title="Ringkasan Data" subtitle={anchorLabel} />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Ticker</span><Badge intent="blue">{params.ticker.toUpperCase()}</Badge></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Rows</span><span className="font-medium">{result.enriched.length}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Date Range</span><span className="font-medium">{params.startDate} → {params.endDate}</span></div>
                    <div className="text-xs text-muted-foreground">Tahun Ba Zi pakai batas Imlek; tanggal sebelum Imlek masuk ke tahun sebelumnya.</div>
                  </div>
                  {false && (
                    <>
                      <div className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-6' : 'md:grid-cols-8') + " gap-2 text-sm font-medium mb-2 justify-items-start"}>
                        <div>Element</div>
                        <div>Days</div>
                        <div>Avg Daily Ret</div>
                        <div>Prob Up</div>
                        <div>Prob Down</div>
                        {timeframe!=='daily' && (
                          <>
                            <div>{timeframe==='yearly' ? 'Avg Open→Close % (Year)' : 'Avg Open→Close % (BaZi Month)'}</div>
                            <div>{timeframe==='yearly' ? '#Years' : '#Months'}</div>
                          </>
                        )}
                        <div>Avg ATR/Close</div>
                      </div>
                      <div className="divide-y">
                        {elemData.map((r:any, i:number)=> (
                          <div key={i} className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-6' : 'md:grid-cols-8') + " gap-2 py-2 text-sm"}>
                            <div><Badge intent="violet">{r.element}</Badge></div>
                            <div>{r.days}</div>
                            <div>{(r.avg_daily_ret*100).toFixed(3)}%</div>
                            <div>{(r.prob_up*100).toFixed(1)}%</div>
                            <div>{(r.prob_down*100).toFixed(1)}%</div>
                            {timeframe!=='daily' && (
                              <>
                                <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '—'}</div>
                                <div>{r.n_years ?? 0}</div>
                              </>
                            )}
                            <div>{(r.avg_atr_frac*100).toFixed(2)}%</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="lg:col-span-2">
                <DateInfoCard />
              </div>

              <Card className="lg:col-span-3">
                <CardHeader>
                  <SectionTitle icon={Calendar} title="Performa per Element (Year Pillar)" subtitle="Avg daily return, Probability Up/Down, Avg Open→Close % (per Ba Zi Year), #Years, ATR/Close" />
                </CardHeader>
                <CardContent>
                  <div className="mb-3"><TimeframeTabs value={timeframe} onChange={setTimeframe} /></div>
                  {timeframe==='yearly' && (<>
                  <div className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-6' : 'md:grid-cols-8') + " gap-2 text-sm font-medium mb-2 justify-items-start"}>
                    <div>Element</div>
                    <div>Days</div>
                    <div>Avg Daily Ret</div>
                    <div>Prob Up</div>
                    <div>Prob Down</div>
                    <div>Avg Open→Close % (Year)</div>
                    <div>#Years</div>
                    <div>Avg ATR/Close</div>
                  </div>
                  <div className="divide-y">
                    {elemData.map((r:any, i:number)=> (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-8 gap-2 py-2 text-sm">
                        <div><Badge intent="violet">{r.element}</Badge></div>
                        <div>{r.days}</div>
                        <div>{(r.avg_daily_ret*100).toFixed(3)}%</div>
                        <div>{(r.prob_up*100).toFixed(1)}%</div>
                        <div>{(r.prob_down*100).toFixed(1)}%</div>
                        <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '—'}</div>
                        <div>{r.n_years ?? 0}</div>
                        <div>{(r.avg_atr_frac*100).toFixed(2)}%</div>
                      </div>
                    ))}
                  </div>
                  </>) }
                  {timeframe!=='yearly' && (
                    <>
                      <div className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-7' : 'md:grid-cols-8') + " gap-2 text-sm font-medium mb-2 justify-items-start"}>
                        <div>Element</div>
                        <div>Days</div>
                        <div>Avg Daily Ret</div>
                        <div>Prob Up</div>
                        <div>Prob Down</div>
                        {timeframe!=='daily' && (
                          <>
                            <div>{timeframe==='yearly' ? 'Avg Open-Close % (Year)' : 'Avg Open-Close % (BaZi Month)'}</div>
                            <div>{timeframe==='yearly' ? '#Years' : '#Months'}</div>
                          </>
                        )}
                        {timeframe==='daily' && (<div>Avg Open-Close % (Day)</div>)}
                        <div>Avg ATR/Close</div>
                      </div>
                      <div className="divide-y">
                        {elemData.map((r:any, i:number)=> (
                          <div key={i} className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-7' : 'md:grid-cols-8') + " gap-2 py-2 text-sm"}>
                            <div><Badge intent="violet">{r.element}</Badge></div>
                            <div>{r.days}</div>
                            <div>{(r.avg_daily_ret*100).toFixed(3)}%</div>
                            <div>{(r.prob_up*100).toFixed(1)}%</div>
                            <div>{(r.prob_down*100).toFixed(1)}%</div>
                            {timeframe!=='daily' && (
                              <>
                                <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '-'}</div>
                                <div>{r.n_years ?? 0}</div>
                              </>
                            )}
                            {timeframe==='daily' && (<div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '-'}</div>)}
                            <div>{(r.avg_atr_frac*100).toFixed(2)}%</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="lg:col-span-3">
                <Card>
                  <CardHeader>
                    <SectionTitle icon={LineChart} title={
                      timeframe==='yearly' ? 'Performa per Shio (Year Branch)' : (timeframe==='monthly' ? 'Performa per Shio (BaZi Month)' : 'Performa per Shio (Daily)')
                    } subtitle={
                      timeframe==='daily'
                        ? 'Avg daily return, Probability Up/Down, ATR/Close'
                        : (timeframe==='yearly'
                            ? 'Avg daily return, Probability Up/Down, Avg Open→Close % (per Ba Zi Year), #Years, ATR/Close'
                            : 'Avg daily return, Probability Up/Down, Avg Open→Close % (per BaZi Month), #Months, ATR/Close')
                    } />
                  </CardHeader>
                  <CardContent>
                    <div className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-7' : 'md:grid-cols-8') + " gap-2 text-sm font-medium mb-2 justify-items-start"}>
                      <div>Shio</div>
                      <div>Days</div>
                      <div>Avg Daily Ret</div>
                      <div>Prob Up</div>
                      <div>Prob Down</div>
                      {timeframe!=='daily' && (
                        <>
                          <div>{timeframe==='yearly' ? 'Avg Open→Close % (Year)' : 'Avg Open→Close % (BaZi Month)'}</div>
                          <div>{timeframe==='yearly' ? '#Years' : '#Months'}</div>
                        </>
                      )}
                      {timeframe==='daily' && (<div>Avg Open-Close % (Day)</div>)}
                      <div>Avg ATR/Close</div>
                    </div>
                    <div className="divide-y">
                      {shioData.map((r:any, i:number)=> (
                        <div key={i} className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-7' : 'md:grid-cols-8') + " gap-2 py-2 text-sm"}>
                          <div><Badge intent="gray">{r.shio}</Badge></div>
                          <div>{r.days}</div>
                          <div>{(r.avg_daily_ret*100).toFixed(3)}%</div>
                          <div>{(r.prob_up*100).toFixed(1)}%</div>
                          <div>{(r.prob_down*100).toFixed(1)}%</div>
                          {timeframe!=='daily' && (
                            <>
                              <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '—'}</div>
                              <div>{r.n_years ?? 0}</div>
                            </>
                          )}
                          {timeframe==='daily' && (<div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '-'}</div>)}
                          <div>{(r.avg_atr_frac*100).toFixed(2)}%</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        )}

        {!result && (
          <Card>
            <CardContent>
              <div className="flex flex-col gap-3 p-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><LineChart className="w-5 h-5 text-muted-foreground"/>Langkah cepat</div>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Upload CSV OHLC harian.</li>
                  <li>Isi Ticker + pilih Anchor Method + set Date Range.</li>
                  <li>Klik <em>Run Analysis</em> untuk melihat ringkasan Element & Shio.</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function runUnitTests() {
  try {
    const csv1 = `date,open,close\n2020-01-01,1,2\n2020-01-02,2,3`;
    const csv2 = `date,open,close\r\n2020-01-01,1,2\r\n2020-01-02,2,3`;
    console.assert(parseCsvSmart(csv1).length === 2 && parseCsvSmart(csv2).length === 2, "CSV newline variants ok");

    const euro = `date;open;close\n2024-01-01;43.850,00;44.000,00\n2024-01-02;44.000,00;44.100,00`;
    const e = parseCsvSmart(euro);
    console.assert(Math.abs((e[1].close as number) - 44100) < 1e-6, "EU decimal parsed");

    const pre = sexagenaryFromDate(new Date("2024-02-09T00:00:00Z"));
    const post = sexagenaryFromDate(new Date("2024-02-10T00:00:00Z"));
    console.assert(pre.idx !== post.idx, "Ba Zi year flips on LNY");

    const mini = parseCsvSmart(`date,open,close\n2024-01-01,1,2\n2024-01-02,2,1`);
    const enr = enrich(mini);
    const agg = aggregateByElement(enr as any);
    const count5 = agg.filter(x=> (ELEMENTS as readonly string[]).includes(x.element as string)).length;
    console.assert(count5 === 5, "Always show 5 elements (padded)");

    const twoYears = parseCsvSmart(`date,open,close\n2023-01-21,100,100\n2023-12-31,100,120\n2024-02-11,120,120\n2024-12-31,120,132`);
    const enr2 = enrich(twoYears);
    const bySh = aggregateByShio(enr2 as any);
    const anySh = bySh[0];
    console.assert((anySh.n_years as number) >= 1, "Yearly OC should count at least one year");

    const a2031 = sexagenaryFromDate(new Date("2031-02-03T00:00:00Z"));
    const b2031 = sexagenaryFromDate(new Date("2031-02-04T00:00:00Z"));
    console.assert(a2031.baziYear !== b2031.baziYear, "Fallback Feb 4 boundary should flip BaZi year on 2031-02-04");
  } catch (err) {
    console.warn("Unit tests warning:", err);
  }
}
if (typeof window !== "undefined") runUnitTests();


