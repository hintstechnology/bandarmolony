import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, LineChart, Play, Settings2, Sparkles, Spline, Search } from "lucide-react";

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
  <button className={`px-4 py-2 rounded-xl shadow-sm border border-border bg-background text-foreground hover:bg-accent active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`} {...props}>{children}</button>
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
  year_element?: string; year_yinyang?: "Yin"|"Yang"; year_shio?: string; year_pillarCN?: string;
  month_element?: string; month_yinyang?: "Yin"|"Yang"; month_shio?: string; month_pillarCN?: string; month_index?: number;
  day_element?: string; day_yinyang?: "Yin"|"Yang"; day_shio?: string; day_pillarCN?: string;
}

type Timeframe = 'yearly' | 'monthly' | 'daily';

// Simple list of common tickers for suggestions
const AVAILABLE_TICKERS: string[] = [
  'BTCUSD','ETHUSD','AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','NFLX',
  'BBCA','BBRI','BMRI','BBNI','TLKM','ASII','GOTO','ANTM','MDKA','ADRO',
  'UNVR','ICBP','INDF','PGAS','MEDC','CPIN','JPFA','INCO','TPIA','TKIM'
];

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

// ========= ASTRONOMY & BAZI (OFFLINE, NO API) =========
const TZ_DEFAULT = "Asia/Jakarta" as const;
const stems = ["Jia","Yi","Bing","Ding","Wu","Ji","Geng","Xin","Ren","Gui"] as const;
const stemsCN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"] as const;
const stemElem = ["Wood","Wood","Fire","Fire","Earth","Earth","Metal","Metal","Water","Water"] as const;
const stemYY   = ["Yang","Yin","Yang","Yin","Yang","Yin","Yang","Yin","Yang","Yin"] as const;
const branches = ["Zi","Chou","Yin","Mao","Chen","Si","Wu","Wei","Shen","You","Xu","Hai"] as const;
const branchesCN = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"] as const;
const shio = ["Rat","Ox","Tiger","Rabbit","Dragon","Snake","Horse","Goat","Monkey","Rooster","Dog","Pig"] as const;
const ELEMENTS = ["Wood","Fire","Earth","Metal","Water"] as const;

// Mapping unsur & yin-yang utk stem CN
const STEM_ELEMENT: Record<string, { element: string; yy: "Yin"|"Yang" }> = {
  "甲":{element:"Wood",yy:"Yang"},"乙":{element:"Wood",yy:"Yin"},
  "丙":{element:"Fire",yy:"Yang"},"丁":{element:"Fire",yy:"Yin"},
  "戊":{element:"Earth",yy:"Yang"},"己":{element:"Earth",yy:"Yin"},
  "庚":{element:"Metal",yy:"Yang"},"辛":{element:"Metal",yy:"Yin"},
  "壬":{element:"Water",yy:"Yang"},"癸":{element:"Water",yy:"Yin"},
};
const BRANCH_META_FULL: Record<string,{ shio:string; element:string; yy:"Yin"|"Yang"}> = {
  "子":{shio:"Rat",   element:"Water",yy:"Yang"},
  "丑":{shio:"Ox",    element:"Earth",yy:"Yin"},
  "寅":{shio:"Tiger", element:"Wood", yy:"Yang"},
  "卯":{shio:"Rabbit",element:"Wood", yy:"Yin"},
  "辰":{shio:"Dragon",element:"Earth",yy:"Yang"},
  "巳":{shio:"Snake", element:"Fire", yy:"Yin"},
  "午":{shio:"Horse", element:"Fire", yy:"Yang"},
  "未":{shio:"Goat",  element:"Earth",yy:"Yin"},
  "申":{shio:"Monkey",element:"Metal",yy:"Yang"},
  "酉":{shio:"Rooster",element:"Metal",yy:"Yin"},
  "戌":{shio:"Dog",   element:"Earth",yy:"Yang"},
  "亥":{shio:"Pig",   element:"Water",yy:"Yin"},
};

// Urutan branch bulan mulai Li Chun (寅)
const MONTH_BRANCHES_CN = ["寅","卯","辰","巳","午","未","申","酉","戌","亥","子","丑"] as const;
const MONTH_STEM_MAP: Record<string, readonly string[]> = {
  "甲":["丙","丁","戊","己","庚","辛","壬","癸","甲","乙","丙","丁"],
  "乙":["丁","戊","己","庚","辛","壬","癸","甲","乙","丙","丁","戊"],
  "丙":["戊","己","庚","辛","壬","癸","甲","乙","丙","丁","戊","己"],
  "丁":["己","庚","辛","壬","癸","甲","乙","丙","丁","戊","己","庚"],
  "戊":["庚","辛","壬","癸","甲","乙","丙","丁","戊","己","庚","辛"],
  "己":["辛","壬","癸","甲","乙","丙","丁","戊","己","庚","辛","壬"],
  "庚":["壬","癸","甲","乙","丙","丁","戊","己","庚","辛","壬","癸"],
  "辛":["癸","甲","乙","丙","丁","戊","己","庚","辛","壬","癸","甲"],
  "壬":["甲","乙","丙","丁","戊","己","庚","辛","壬","癸","甲","乙"],
  "癸":["乙","丙","丁","戊","己","庚","辛","壬","癸","甲","乙","丙"],
};

// 60-hari pasangan stem-branch (Jia-Zi)
const JIA_ZI = [
  "甲子","乙丑","丙寅","丁卯","戊辰","己巳","庚午","辛未","壬申","癸酉",
  "甲戌","乙亥","丙子","丁丑","戊寅","己卯","庚辰","辛巳","壬午","癸未",
  "甲申","乙酉","丙戌","丁亥","戊子","己丑","庚寅","辛卯","壬辰","癸巳",
  "甲午","乙未","丙申","丁酉","戊戌","己亥","庚子","辛丑","壬寅","癸卯",
  "甲辰","乙巳","丙午","丁未","戊申","己酉","庚戌","辛亥","壬子","癸丑",
  "甲寅","乙卯","丙辰","丁巳","戊午","己未","庚申","辛酉","壬戌","癸亥",
] as const;

const normalize360 = (x:number)=> ((x%360)+360)%360;
function toJulianDayUTC(dt: Date): number {
  const y = dt.getUTCFullYear(); let m = dt.getUTCMonth()+1;
  const D = dt.getUTCDate() + (dt.getUTCHours() + (dt.getUTCMinutes() + dt.getUTCSeconds()/60)/60)/24;
  let Y = y; if (m<=2){ Y=y-1; m+=12; }
  const A = Math.floor(Y/100); const B = 2 - A + Math.floor(A/4);
  return Math.floor(365.25*(Y+4716)) + Math.floor(30.6001*(m+1)) + D + B - 1524.5;
}
const julianCenturiesTT = (JD:number)=> (JD - 2451545.0)/36525.0;
function solarAppLongitudeDeg(dtUTC: Date): number {
  const JD = toJulianDayUTC(dtUTC); const T  = julianCenturiesTT(JD);
  const L0 = normalize360(280.46646 + 36000.76983*T + 0.0003032*T*T);
  const M  = normalize360(357.52911 + 35999.05029*T - 0.0001537*T*T);
  const C  = (1.914602 - 0.004817*T - 0.000014*T*T)*Math.sin(M*Math.PI/180)
           + (0.019993 - 0.000101*T)*Math.sin(2*M*Math.PI/180)
           + 0.000289*Math.sin(3*M*Math.PI/180);
  const trueLong = L0 + C;
  const omega = normalize360(125.04 - 1934.136*T);
  const lam = trueLong - 0.00569 - 0.00478*Math.sin(omega*Math.PI/180);
  return normalize360(lam);
}
function findTimeWhenSolarLongitude(targetDeg:number, startUTC:Date, endUTC:Date): Date {
  let a = startUTC, b = endUTC;
  const angDiff = (cur:number, tgt:number)=>{ let x=normalize360(cur-tgt); if(x>180) x-=360; return x; };
  let fa = angDiff(solarAppLongitudeDeg(a), targetDeg);
  let fb = angDiff(solarAppLongitudeDeg(b), targetDeg);
  if (fa*fb>0){ const mid=new Date((a.getTime()+b.getTime())/2); const fm=angDiff(solarAppLongitudeDeg(mid), targetDeg); if(fa*fm<=0){ b=mid; fb=fm; } else { a=mid; fa=fm; } }
  for(let i=0;i<64;i++){ const m=new Date((a.getTime()+b.getTime())/2); const fm=angDiff(solarAppLongitudeDeg(m), targetDeg);
    if (Math.abs(b.getTime()-a.getTime())<=500) return m;
    if (fa*fm<=0){ b=m; fb=fm; } else { a=m; fa=fm; } }
  return new Date((a.getTime()+b.getTime())/2);
}
function liChunLocal(year:number, tz:string=TZ_DEFAULT): Date {
  const start = new Date(Date.UTC(year, 0, 31, 0, 0, 0));
  const end   = new Date(Date.UTC(year, 1, 6, 0, 0, 0));
  const hitUTC = findTimeWhenSolarLongitude(315, start, end);
  return new Date(hitUTC.toLocaleString("en-US",{ timeZone: tz }));
}
function monthIndexFromLongitude(lam:number): number {
  const d = normalize360(lam - 315); return Math.floor(d/30) % 12; // 0..11, 0=寅
}
const JIAZI_ANCHOR_UTC = new Date(Date.UTC(1900,0,31,0,0,0)); // 甲子

// ——— Pillar exact (Year/Month/Day) ———
function yearPillarExact(localDate: Date, tz:string=TZ_DEFAULT){
  const lc = liChunLocal(localDate.getFullYear(), tz);
  const solarYear = (localDate.getTime()>=lc.getTime()) ? localDate.getFullYear() : localDate.getFullYear()-1;
  const n = solarYear - 1984; // 1984 = 甲子
  const stemCN = stemsCN[((n%10)+10)%10]; const branchCN = branchesCN[((n%12)+12)%12];
  const se = STEM_ELEMENT[stemCN]; const bm = BRANCH_META_FULL[branchCN];
  return { solarYear, pillarCN: stemCN+branchCN, stemCN, branchCN, element: se.element, yinyang: se.yy, shio: bm.shio };
}
function monthPillarExact(localDate: Date, yearStemCN:string){
  const lam = solarAppLongitudeDeg(new Date(localDate.toLocaleString("en-US",{ timeZone: "UTC" })));
  const idx = monthIndexFromLongitude(lam); // 0..11
  const branchCN = MONTH_BRANCHES_CN[idx]; const stemCN = MONTH_STEM_MAP[yearStemCN][idx];
  const se = STEM_ELEMENT[stemCN]; const bm = BRANCH_META_FULL[branchCN];
  return { monthIndex: idx+1, pillarCN: stemCN+branchCN, stemCN, branchCN, element: se.element, yinyang: se.yy, shio: bm.shio };
}
function dayPillarExact(localDate: Date, tz:string=TZ_DEFAULT){
  const dayStartLocal = new Date(new Date(localDate).setHours(0,0,0,0));
  const dayStartUTC = new Date(dayStartLocal.toLocaleString("en-US",{ timeZone: "UTC" }));
  const JD = toJulianDayUTC(dayStartUTC); const JD0 = toJulianDayUTC(JIAZI_ANCHOR_UTC);
  const delta = Math.round(JD - JD0); const idx = ((delta%60)+60)%60;
  const pair = JIA_ZI[idx]; const stem = pair[0], branch = pair[1];
  const se = STEM_ELEMENT[stem]; const bm = BRANCH_META_FULL[branch];
  return { pillarCN: pair, stemCN: stem, branchCN: branch, element: se.element, yinyang: se.yy, shio: bm.shio };
}

// ——— Compatibility wrappers (menjaga pemanggil lama) ———
function sexagenaryFromDate(d: Date){
  // Boundary tahun pakai Li Chun (bukan Imlek)
  const y = yearPillarExact(d, TZ_DEFAULT);
  const n = y.solarYear - 1984;
  const idx = ((n%60)+60)%60;
  const stem_idx = ((n%10)+10)%10;
  const branch_idx = ((n%12)+12)%12;
  return { idx, stem_idx, branch_idx, baziYear: y.solarYear };
}
function getBaziMonthIndex(d: Date): number {
  // Astronomical: dari λ☉, 0=Tiger(寅)
  const lam = solarAppLongitudeDeg(new Date(d.toLocaleString("en-US",{ timeZone: "UTC" })));
  return monthIndexFromLongitude(lam);
}
function getBaziMonthKey(d: Date): string {
  const { baziYear } = sexagenaryFromDate(d);
  const mi = getBaziMonthIndex(d); // 0..11
  return `${baziYear}-${mi+1}`;    // tampilkan 1..12
}

// ========= ENRICH (tidak mengubah bentuk data UI) =========
function enrich(rows: Row[]) {
  const out = rows.map(r => {
    const y = yearPillarExact(r.date, TZ_DEFAULT);
    const m = monthPillarExact(r.date, y.stemCN);
    const di = dayPillarExact(r.date, TZ_DEFAULT);

    // legacy fields: tetap isi dari Year pillar
    const n = y.solarYear - 1984;
    const stem_idx = ((n%10)+10)%10;
    const branch_idx = ((n%12)+12)%12;
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

// ========= HELPERS: Probability Up/Down/Flat =========
function upDownFlat(arr: any[]){
  let up=0, down=0, flat=0, total=0;
  for (const a of arr){
    if (Number.isFinite(a.open) && Number.isFinite(a.close)){
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
  const core = Object.entries(groups).map(([element, arr])=>{
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x)) as number[];
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x)) as number[];

    // open->close per BaZi Year (year_solar)
    const perYear: Record<number, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr){
      const yid = r.year_solar as number;
      if (!perYear[yid]) perYear[yid] = {};
      if (perYear[yid].openStart == null){
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close)? r.close : undefined);
        if (o != null) perYear[yid].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perYear[yid].closeEnd = r.close as number;
    }
    const yearRets = Object.values(perYear)
      .map(v => (Number.isFinite(v.openStart)&&Number.isFinite(v.closeEnd)&& (v.openStart as number)!==0)
        ? ((v.closeEnd as number)-(v.openStart as number))/(v.openStart as number) : NaN)
      .filter(x=>Number.isFinite(x)) as number[];

    return {
      element,
      days: arr.length,
      avg_daily_ret: rets.length? rets.reduce((a,b)=>a+b,0)/rets.length : 0,
      prob_up: total? up/total : 0,
      prob_down: total? down/total : 0,
      prob_flat: total? flat/total : 0,
      avg_year_oc: yearRets.length? yearRets.reduce((a,b)=>a+b,0)/yearRets.length : 0,
      n_years: yearRets.length,
      avg_atr_frac: atrs.length? atrs.reduce((a,b)=>a+b,0)/atrs.length : 0,
    };
  });
  const have = new Set(core.map(r=>r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, prob_flat: 0, avg_year_oc: 0, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a,b)=> b.avg_year_oc - a.avg_year_oc);
}
function aggregateByShio(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.year_shio ?? r.shio; (groups[key] ||= []).push(r); });
  return Object.entries(groups).map(([shio, arr])=>{
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x)) as number[];
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x)) as number[];

    const perYear: Record<number, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr){
      const yid = r.year_solar as number;
      if (!perYear[yid]) perYear[yid] = {};
      if (perYear[yid].openStart == null){
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close)? r.close : undefined);
        if (o != null) perYear[yid].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perYear[yid].closeEnd = r.close as number;
    }
    const yearRets = Object.values(perYear)
      .map(v => (Number.isFinite(v.openStart)&&Number.isFinite(v.closeEnd)&& (v.openStart as number)!==0)
        ? ((v.closeEnd as number)-(v.openStart as number))/(v.openStart as number) : NaN)
      .filter(x=>Number.isFinite(x)) as number[];

    return {
      shio,
      days: arr.length,
      avg_daily_ret: rets.length? rets.reduce((a,b)=>a+b,0)/rets.length : 0,
      prob_up: total? up/total : 0,
      prob_down: total? down/total : 0,
      prob_flat: total? flat/total : 0,
      avg_year_oc: yearRets.length? yearRets.reduce((a,b)=>a+b,0)/yearRets.length : 0,
      n_years: yearRets.length,
      avg_atr_frac: atrs.length? atrs.reduce((a,b)=>a+b,0)/atrs.length : 0,
    };
  }).sort((a,b)=> b.avg_year_oc - a.avg_year_oc);
}

// MONTHLY (BaZi month via solar longitude)
function aggregateByElementMonthly(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.month_element ?? r.element; (groups[key] ||= []).push(r); });
  const core = Object.entries(groups).map(([element, arr])=>{
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x)) as number[];
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x)) as number[];

    const perMonth: Record<string, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr){
      const key = `${r.year_solar}-${r.month_index}`;
      if (!perMonth[key]) perMonth[key] = {};
      if (perMonth[key].openStart == null){
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close)? r.close : undefined);
        if (o != null) perMonth[key].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perMonth[key].closeEnd = r.close as number;
    }
    const monthRets = Object.values(perMonth)
      .map(v => (Number.isFinite(v.openStart)&&Number.isFinite(v.closeEnd)&& (v.openStart as number)!==0)
        ? ((v.closeEnd as number)-(v.openStart as number))/(v.openStart as number) : NaN)
      .filter(x=>Number.isFinite(x)) as number[];

    return {
      element,
      days: arr.length,
      avg_daily_ret: rets.length? rets.reduce((a,b)=>a+b,0)/rets.length : 0,
      prob_up: total? up/total : 0,
      prob_down: total? down/total : 0,
      prob_flat: total? flat/total : 0,
      avg_year_oc: monthRets.length? monthRets.reduce((a,b)=>a+b,0)/monthRets.length : 0,
      n_years: monthRets.length,
      avg_atr_frac: atrs.length? atrs.reduce((a,b)=>a+b,0)/atrs.length : 0,
    };
  });
  const have = new Set(core.map(r=>r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, prob_flat: 0, avg_year_oc: 0, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a,b)=> b.avg_year_oc - a.avg_year_oc);
}
function aggregateByShioMonthly(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.month_shio ?? r.shio; (groups[key] ||= []).push(r); });
  return Object.entries(groups).map(([shio, arr])=>{
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x)) as number[];
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x)) as number[];

    const perMonth: Record<string, { openStart?: number; closeEnd?: number }> = {};
    for (const r of arr){
      const key = `${r.year_solar}-${r.month_index}`;
      if (!perMonth[key]) perMonth[key] = {};
      if (perMonth[key].openStart == null){
        const o = Number.isFinite(r.open) ? r.open : (Number.isFinite(r.close)? r.close : undefined);
        if (o != null) perMonth[key].openStart = o as number;
      }
      if (Number.isFinite(r.close)) perMonth[key].closeEnd = r.close as number;
    }
    const monthRets = Object.values(perMonth)
      .map(v => (Number.isFinite(v.openStart)&&Number.isFinite(v.closeEnd)&& (v.openStart as number)!==0)
        ? ((v.closeEnd as number)-(v.openStart as number))/(v.openStart as number) : NaN)
      .filter(x=>Number.isFinite(x)) as number[];

    return {
      shio,
      days: arr.length,
      avg_daily_ret: rets.length? rets.reduce((a,b)=>a+b,0)/rets.length : 0,
      prob_up: total? up/total : 0,
      prob_down: total? down/total : 0,
      prob_flat: total? flat/total : 0,
      avg_year_oc: monthRets.length? monthRets.reduce((a,b)=>a+b,0)/monthRets.length : 0,
      n_years: monthRets.length,
      avg_atr_frac: atrs.length? atrs.reduce((a,b)=>a+b,0)/atrs.length : 0,
    };
  }).sort((a,b)=> b.avg_year_oc - a.avg_year_oc);
}

// DAILY (per civil day)
function aggregateByElementDaily(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.day_element ?? r.element; (groups[key] ||= []).push(r); });
  const core = Object.entries(groups).map(([element, arr])=>{
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x)) as number[];
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x)) as number[];
    const ocs = arr.map(a => (Number.isFinite(a.open)&&Number.isFinite(a.close)&&a.open!==0)
      ? ((a.close as number)-(a.open as number))/(a.open as number) : NaN).filter((x:any)=>Number.isFinite(x)) as number[];
    const avg_day_oc = ocs.length ? ocs.reduce((a,b)=>a+b,0)/ocs.length : 0;
    return {
      element, days: arr.length,
      avg_daily_ret: rets.length? rets.reduce((a,b)=>a+b,0)/rets.length : 0,
      prob_up: total? up/total : 0,
      prob_down: total? down/total : 0,
      prob_flat: total? flat/total : 0,
      avg_year_oc: avg_day_oc,
      n_years: ocs.length,
      avg_atr_frac: atrs.length? atrs.reduce((a,b)=>a+b,0)/atrs.length : 0,
    };
  });
  const have = new Set(core.map(r=>r.element));
  (ELEMENTS as readonly string[]).forEach(el => {
    if (!have.has(el)) core.push({ element: el, days: 0, avg_daily_ret: 0, prob_up: 0, prob_down: 0, prob_flat: 0, avg_year_oc: 0, n_years: 0, avg_atr_frac: 0 });
  });
  return core.sort((a,b)=> b.avg_daily_ret - a.avg_daily_ret);
}
function aggregateByShioDaily(rows: any[]) {
  const groups: Record<string, any[]> = {};
  rows.forEach(r => { const key = r.day_shio ?? r.shio; (groups[key] ||= []).push(r); });
  return Object.entries(groups).map(([shio, arr])=>{
    const { up, down, flat, total } = upDownFlat(arr);
    const rets = arr.map(a=>a.ret).filter((x:any)=>Number.isFinite(x)) as number[];
    const atrs = arr.map(a=>a.atr14_frac).filter((x:any)=>Number.isFinite(x)) as number[];
    const ocs = arr.map(a => (Number.isFinite(a.open)&&Number.isFinite(a.close)&&a.open!==0)
      ? ((a.close as number)-(a.open as number))/(a.open as number) : NaN).filter((x:any)=>Number.isFinite(x)) as number[];
    const avg_day_oc = ocs.length ? ocs.reduce((a,b)=>a+b,0)/ocs.length : 0;
    return {
      shio, days: arr.length,
      avg_daily_ret: rets.length? rets.reduce((a,b)=>a+b,0)/rets.length : 0,
      prob_up: total? up/total : 0,
      prob_down: total? down/total : 0,
      prob_flat: total? flat/total : 0,
      avg_year_oc: avg_day_oc,
      n_years: ocs.length,
      avg_atr_frac: atrs.length? atrs.reduce((a,b)=>a+b,0)/atrs.length : 0,
    };
  }).sort((a,b)=> b.avg_daily_ret - a.avg_daily_ret);
}

// ========= UI (LAYOUT TIDAK DIUBAH, hanya isi sel untuk tampilkan Flat) =========
function DateInfoCard() {
  const today = new Date();
  const weekdayNames = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const weekday = weekdayNames[today.getDay()];
  const day = today.getDate();
  const month = monthNames[today.getMonth()];
  const year = today.getFullYear();
  const time = today.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const Y = yearPillarExact(today, TZ_DEFAULT);
  const M = monthPillarExact(today, Y.stemCN);
  const D = dayPillarExact(today, TZ_DEFAULT);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Hari Ini</h3>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center text-center">
          <div className="space-y-1">
            <div className="text-2xl font-bold">{weekday}</div>
            <div className="text-xl text-foreground">{day} {month} {year}</div>
            <Badge intent="blue">Waktu Lokal: {time}</Badge>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Pilar Tahun</div>
            <div className="text-lg font-semibold">{Y.pillarCN} <span className="text-muted-foreground">({Y.shio})</span></div>
            <div className="text-sm text-muted-foreground">Element: <span className="font-medium">{Y.element}</span> · Yin–Yang: <span className="font-medium">{Y.yinyang}</span></div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Monthly (Pilar Bulan)</div>
            <div className="text-sm"><b>Month:</b> {M.pillarCN} ({M.shio}) — <b>{M.element}</b> · {M.yinyang}</div>
            <div className="text-sm"><b>Day:</b> {D.pillarCN} ({D.shio}) — <b>{D.element}</b> · {D.yinyang}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Daily (Pilar Hari)</div>
            <div className="text-sm"><b>Day:</b> {D.pillarCN} ({D.shio})</div>
            <div className="text-sm">Element: <b>{D.element}</b> · {D.yinyang}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// New, styled 4-section card matching yearly layout
function DateInfoCardNew() {
  const today = new Date();
  const weekdayNames = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const weekday = weekdayNames[today.getDay()];
  const day = today.getDate();
  const month = monthNames[today.getMonth()];
  const year = today.getFullYear();
  const time = today.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const Y = yearPillarExact(today, TZ_DEFAULT);
  const M = monthPillarExact(today, Y.stemCN);
  const D = dayPillarExact(today, TZ_DEFAULT);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Hari Ini</h3>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center text-center">
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
            <div className="text-sm text-muted-foreground">Element: <span className="font-medium">{Y.element}</span> · Yin/Yang: <span className="font-medium">{Y.yinyang}</span></div>
          </div>
          {/* Monthly */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Pilar Bulan</div>
            <div className="text-lg font-semibold">{M.pillarCN} <span className="text-muted-foreground">({M.shio})</span></div>
            <div className="text-sm text-muted-foreground">Element: <span className="font-medium">{M.element}</span> · Yin/Yang: <span className="font-medium">{M.yinyang}</span></div>
          </div>
          {/* Daily */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Pilar Hari</div>
            <div className="text-lg font-semibold">{D.pillarCN} <span className="text-muted-foreground">({D.shio})</span></div>
            <div className="text-sm text-muted-foreground">Element: <span className="font-medium">{D.element}</span> · Yin/Yang: <span className="font-medium">{D.yinyang}</span></div>
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
        <SectionTitle icon={LineChart} title="Performa per Shio (Year Branch)" subtitle="Avg daily return, Probability Up/Down, Avg Open→Close % (per Ba Zi Year), Cycle Count, ATR/Close" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-sm font-medium mb-2">
          <div>Shio</div>
          <div>Days</div>
          
          <div>Prob Up</div>
                      <div>Prob Down</div>
                      <div>Prob Flat</div>
          <div>Avg Open→Close % (Year)</div>
          <div>Cycle Count</div>
          
        </div>
        <div className="divide-y">
          {data.map((r:any, i:number)=> (
            <div key={i} className="grid grid-cols-1 md:grid-cols-7 gap-2 py-2 text-sm">
              <div><Badge intent="gray">{r.shio}</Badge></div>
              <div>{r.days}</div>
              
              <div>{(r.prob_up*100).toFixed(1)}%</div>
              
              <div>{(r.prob_down*100).toFixed(1)}%</div>
              <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '—'}</div>
              <div>{r.n_years ?? 0}</div>
              <div>{(r.prob_flat*100).toFixed(1)}%</div>
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
  const [recentFiles, setRecentFiles] = useState<any[]>([]);
  const [fileSearch, setFileSearch] = useState<string>("");
  const [fileDropdownOpen, setFileDropdownOpen] = useState<boolean>(false);
  const [fileActiveIndex, setFileActiveIndex] = useState<number>(-1);
  const [tickerDropdownOpen, setTickerDropdownOpen] = useState<boolean>(false);
  const [tickerActiveIndex, setTickerActiveIndex] = useState<number>(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileSearchRef = useRef<HTMLInputElement>(null);
  const tickerInputRef = useRef<HTMLInputElement>(null);
  const fileDropdownWrapRef = useRef<HTMLDivElement>(null);
  const tickerDropdownWrapRef = useRef<HTMLDivElement>(null);

  const filteredTickers = useMemo(() => {
    const q = (params.ticker || '').toLowerCase().trim();
    if (!q) return AVAILABLE_TICKERS;
    return AVAILABLE_TICKERS.filter(t => t.toLowerCase().includes(q));
  }, [params.ticker]);

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
    // Set ticker field to filename (without extension) for visibility
    try {
      const base = (f.name || '').replace(/\.[^./\\]+$/,'');
      if (base) setParams(p=>({ ...p, ticker: base }));
    } catch {}
    try {
      const dates = parsed.map(r=>r.date).filter((d:any)=> d instanceof Date && !isNaN(+d));
      if (dates.length) {
        const minISO = new Date(Math.min.apply(null, dates as any)).toISOString().slice(0,10);
        setParams(p=>({...p, startDate: minISO }));
      }
    } catch {}
    try {
      const meta = { name: f.name || 'uploaded.csv', rows: parsed };
      setRecentFiles(prev => {
        const next = [meta, ...prev.filter(x=>x.name!==meta.name)].slice(0, 10);
        try { localStorage.setItem('baziRecentFiles', JSON.stringify(next)); } catch {}
        return next;
      });
    } catch {}
  };

  const loadDemo = () => {
    const demo = `date,open,high,low,close,volume
2024-01-01,42000,42500,41800,42400,1000
2024-01-02,42400,43000,42000,42800,1200
2024-01-03,42800,43500,42500,43250,1100
2024-01-04,43250,43800,43000,43500,1300
2024-01-05,43500,44000,43200,43850,1250`;
    const parsed = parseCsvSmart(demo);
    setRows(parsed);
    try {
      const dates = parsed.map(r=>r.date).filter((d:any)=> d instanceof Date && !isNaN(+d));
      if (dates.length) {
        const minISO = new Date(Math.min.apply(null, dates as any)).toISOString().slice(0,10);
        setParams(p=>({...p, startDate: minISO }));
      }
    } catch {}
    setErr(null);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('baziRecentFiles');
      if (raw) {
        const arr = JSON.parse(raw);
        setRecentFiles(Array.isArray(arr) ? arr : []);
      }
    } catch {}
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleDocumentMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (fileDropdownOpen) {
        const wrap = fileDropdownWrapRef.current;
        if (wrap && t && !wrap.contains(t)) {
          setFileDropdownOpen(false);
        }
      }
      if (tickerDropdownOpen) {
        const wrap = tickerDropdownWrapRef.current;
        if (wrap && t && !wrap.contains(t)) {
          setTickerDropdownOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [fileDropdownOpen, tickerDropdownOpen]);

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

  // anchor label removed from UI

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
            <Badge intent="blue">v0.8.0</Badge>
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
                <div ref={tickerDropdownWrapRef} className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                    <Search className="w-4 h-4 text-muted-foreground"/>
                  </div>
                  <input
                    type="text"
                    placeholder="BTCUSD / IDX:BBCA / AAPL"
                    value={params.ticker}
                    onChange={(e)=>{ setParams(p=>({...p,ticker:e.target.value})); setTickerDropdownOpen(true); setTickerActiveIndex(0); }}
                    onFocus={()=>{ setTickerDropdownOpen(true); setTickerActiveIndex(0); }}
                    onKeyDown={(e)=>{
                      if (!tickerDropdownOpen) return;
                      const suggestions = (params.ticker.trim() ? filteredTickers : AVAILABLE_TICKERS).slice(0,10);
                      const total = suggestions.length + 1; // +1 for Browse CSV option
                      if (total === 0) return;
                      if (e.key === 'ArrowDown'){
                        e.preventDefault();
                        setTickerActiveIndex(prev => {
                          const next = prev + 1;
                          return next >= total ? 0 : next;
                        });
                      } else if (e.key === 'ArrowUp'){
                        e.preventDefault();
                        setTickerActiveIndex(prev => {
                          const next = prev - 1;
                          return next < 0 ? total - 1 : next;
                        });
                      } else if (e.key === 'Enter'){
                        e.preventDefault();
                        const idx = tickerActiveIndex >= 0 ? tickerActiveIndex : 0;
                        if (idx === suggestions.length){
                          // Browse CSV selected
                          setTickerDropdownOpen(false);
                          setTickerActiveIndex(-1);
                          fileInputRef.current?.click();
                          return;
                        }
                        const choice = suggestions[idx];
                        if (choice){
                          setParams(p=>({...p,ticker: choice}));
                          setTickerDropdownOpen(false);
                          setTickerActiveIndex(-1);
                        }
                      } else if (e.key === 'Escape'){
                        setTickerDropdownOpen(false);
                        setTickerActiveIndex(-1);
                      }
                    }}
                    className="w-full pl-9 pr-9 py-2 rounded-xl border border-border bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    role="combobox"
                    aria-expanded={tickerDropdownOpen}
                    aria-controls="bazi-ticker-suggestions"
                    aria-autocomplete="list"
                  />
                  <button
                    type="button"
                    aria-label="Toggle ticker suggestions"
                    className="absolute inset-y-0 right-0 pr-2 flex items-center text-muted-foreground hover:text-foreground"
                    onClick={()=>{ setTickerDropdownOpen(o=>!o); if (!tickerDropdownOpen) setTickerActiveIndex(0); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {tickerDropdownOpen && (
                    (()=>{
                      const suggestions = (params.ticker.trim() ? filteredTickers : AVAILABLE_TICKERS).slice(0,10);
                      return (
                        <div id="bazi-ticker-suggestions" role="listbox" className="absolute left-0 right-0 z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                          <div className="p-1">
                            {suggestions.map((tkr, idx) => (
                              <div
                                key={tkr}
                                role="option"
                                aria-selected={idx === tickerActiveIndex}
                                onMouseEnter={()=> setTickerActiveIndex(idx)}
                                onMouseDown={(e)=> e.preventDefault()}
                                onClick={()=>{ setParams(p=>({...p,ticker:tkr})); setTickerDropdownOpen(false); setTickerActiveIndex(-1); }}
                                className={`px-3 py-2 rounded cursor-pointer ${idx===tickerActiveIndex ? 'bg-accent' : 'hover:bg-muted'}`}
                              >
                                <span className="text-sm">{tkr}</span>
                              </div>
                            ))}
                            {/* Browse CSV action */}
                            <div className="my-1 h-px bg-border" />
                            <div
                              key="browse-csv"
                              role="option"
                              aria-selected={tickerActiveIndex === suggestions.length}
                              onMouseEnter={()=> setTickerActiveIndex(suggestions.length)}
                              onMouseDown={(e)=> e.preventDefault()}
                              onClick={()=>{ setTickerDropdownOpen(false); setTickerActiveIndex(-1); fileInputRef.current?.click(); }}
                              className={`px-3 py-2 rounded cursor-pointer flex items-center justify-between ${tickerActiveIndex===suggestions.length ? 'bg-accent' : 'hover:bg-muted'}`}
                            >
                              <span className="text-sm font-medium">Browse CSV…</span>
                              <span className="text-xs text-muted-foreground">Upload file</span>
                            </div>
                            {suggestions.length===0 && (
                              <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Kamu juga bisa drag & drop CSV ke area ini.</p>
                {/* Hidden file input to support Browse CSV */}
                <input ref={fileInputRef} className="hidden" type="file" accept=".csv" onChange={(e)=> onUpload(e.target.files?.[0] || null)} />
              </div>
              <div className="md:col-span-3">
                <label className="text-sm font-medium">Anchor Method</label>
                <Select value={params.anchorMethod} onChange={(e:any)=>setParams(p=>({...p,anchorMethod:e.target.value}))} className="mt-1">
                  <option value="jiazi1984">Default</option>
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

              <div className="md:col-span-12 flex items-center justify-end pt-2">
                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: loading ? 1 : 1.02 }}
                    whileTap={{ scale: loading ? 1 : 0.98 }}
                    className={`px-4 py-2 rounded-xl shadow-sm border border-border bg-black text-white hover:shadow-md active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed ${loading ? 'animate-pulse' : ''}`}
                    onClick={onRun}
                    disabled={!canRun || loading}
                  >
                    {loading ? (
                      <>
                        <Spline className="w-4 h-4 mr-2 inline animate-spin"/>
                        Running
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2 inline"/>
                        Run Analysis
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
              {err && <div className="md:col-span-12 text-sm text-red-600">{err}</div>}
              {!err && !rows.length && (<div className="md:col-span-12 text-xs text-muted-foreground">Tips: klik <em>Load Demo</em> untuk mencoba analisis tanpa upload.</div>)}
            </div>
          </CardContent>
        </Card>

                {loading && !result && (
          <div className="w-full">
            <Card>
              <CardHeader>
                <SectionTitle icon={Spline} title="Menjalankan analisis..." subtitle="Menghitung statistik per Element &amp; Shio" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-muted rounded"></div>
                  <div className="h-4 bg-muted rounded w-5/6"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}{result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.4 }}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <SectionTitle icon={Sparkles} title="Ringkasan Data" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Ticker</span><Badge intent="blue">{params.ticker.toUpperCase()}</Badge></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Rows</span><span className="font-medium">{result.enriched.length}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Date Range</span><span className="font-medium">{params.startDate} → {params.endDate}</span></div>
                    <div className="text-xs text-muted-foreground">Tahun Ba Zi pakai batas <b>Li Chun (λ☉=315°)</b>; tanggal sebelum Li Chun masuk ke tahun sebelumnya.</div>
                  </div>
                </CardContent>
              </Card>

              <div className="lg:col-span-2">
                <DateInfoCardNew />
              </div>

              <Card className="lg:col-span-3">
                <CardHeader className="flex items-center justify-between">
                  <SectionTitle icon={Calendar} title="Performa per Element (Year Pillar)" subtitle="Avg daily return, Probability Up/Down, Avg Open→Close % (per Ba Zi Year), Cycle Count, ATR/Close" />
                  <div className="mt-2 md:mt-0"><TimeframeTabs value={timeframe} onChange={setTimeframe} /></div>
                </CardHeader>
                <CardContent>
                  {timeframe==='yearly' && (<>
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-sm font-medium mb-2 justify-items-start">
                    <div>Element</div>
                    <div>Days</div>
                    
                    <div>Prob Up</div>
                    <div>Prob Down</div>
                    <div>Prob Flat</div>
                    <div>Avg Open-Close % (Year)</div>
                    <div>Cycle Count</div>
                  </div>
                  <div className="divide-y">
                    {elemData.map((r:any, i:number)=> (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-7 gap-2 py-2 text-sm">
                        <div><Badge intent="violet">{r.element}</Badge></div>
                        <div>{r.days}</div>
                        
                        <div>{(r.prob_up*100).toFixed(1)}%</div>
                        <div>{(r.prob_down*100).toFixed(1)}%</div>
                        <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '—'}</div>
                        <div>{r.n_years ?? 0}</div>
                        <div>{(r.prob_flat*100).toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>
                  </>) }
                  {timeframe!=='yearly' && (
                    <>
                      <div className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-7' : 'md:grid-cols-7') + " gap-2 text-sm font-medium mb-2 justify-items-start"}>
                        <div>Element</div>
                        <div>Days</div>
                        <div>Prob Up</div>
                        <div>Prob Down</div>
                        <div>Prob Flat</div>
                        {timeframe!=='daily' && (
                          <>
                            <div>{timeframe==='yearly' ? 'Avg Open-Close % (Year)' : 'Avg Open-Close % (BaZi Month)'}</div>
                            <div>Cycle Count</div>
                          </>
                        )}
                        {timeframe==='daily' && (
                          <>
                            <div>Avg Open-Close % (Day)</div>
                            <div>Cycle Count</div>
                          </>
                        )}
                      </div>
                      <div className="divide-y">
                        {elemData.map((r:any, i:number)=> (
                          <div key={i} className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-7' : 'md:grid-cols-7') + " gap-2 py-2 text-sm"}>
                            <div><Badge intent="violet">{r.element}</Badge></div>
                            <div>{r.days}</div>
                            <div>{(r.prob_up*100).toFixed(1)}%</div>
                            <div>{(r.prob_down*100).toFixed(1)}%</div>
                            <div>{(r.prob_flat*100).toFixed(1)}%</div>
                            {timeframe!=='daily' && (
                              <>
                                <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '-'}</div>
                                <div>{r.n_years ?? 0}</div>
                              </>
                            )}
                            {timeframe==='daily' && (
                              <>
                                <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '-'}</div>
                                <div>{r.n_years ?? 0}</div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="lg:col-span-3">
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <SectionTitle icon={LineChart} title={
                      timeframe==='yearly' ? 'Performa per Shio (Year Branch)' : (timeframe==='monthly' ? 'Performa per Shio (BaZi Month)' : 'Performa per Shio (Daily)')
                    } subtitle={
                      timeframe==='daily'
                        ? 'Avg daily return, Probability Up/Down, ATR/Close'
                        : (timeframe==='yearly'
                            ? 'Avg daily return, Probability Up/Down, Avg Open→Close % (per Ba Zi Year), Cycle Count, ATR/Close'
                            : 'Avg daily return, Probability Up/Down, Avg Open→Close % (per BaZi Month), Cycle Count, ATR/Close')
                    } />
                    <div className="mt-2 md:mt-0"><TimeframeTabs value={timeframe} onChange={setTimeframe} /></div>
                  </CardHeader>
                  <CardContent>
                    <div className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-7' : 'md:grid-cols-7') + " gap-2 text-sm font-medium mb-2 justify-items-start"}>
                      <div>Shio</div>
                      <div>Days</div>
                      
                      <div>Prob Up</div>
                      <div>Prob Down</div>
                      <div>Prob Flat</div>
                      {timeframe!=='daily' && (
                        <>
                          <div>{timeframe==='yearly' ? 'Avg Open→Close % (Year)' : 'Avg Open→Close % (BaZi Month)'}</div>
                          <div>Cycle Count</div>
                        </>
                      )}
                      {timeframe==='daily' && (<>\n                          <div>Avg Open-Close % (Day)</div>\n                          <div>Cycle Count</div>\n                        </>)}
                      
                    </div>
                    <div className="divide-y">
                      {shioData.map((r:any, i:number)=> (
                        <div key={i} className={"grid grid-cols-1 " + (timeframe==='daily' ? 'md:grid-cols-7' : 'md:grid-cols-7') + " gap-2 py-2 text-sm"}>
                          <div><Badge intent="gray">{r.shio}</Badge></div>
                          <div>{r.days}</div>
                          
                          <div>{(r.prob_up*100).toFixed(1)}%</div>
                          <div>{(r.prob_down*100).toFixed(1)}%</div>
                          <div>{(r.prob_flat*100).toFixed(1)}%</div>
                          {timeframe!=='daily' && (
                            <>
                              <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '—'}</div>
                              <div>{r.n_years ?? 0}</div>
                            </>
                          )}
                          {timeframe==='daily' && (
                            <>
                              <div>{Number.isFinite(r.avg_year_oc) ? (r.avg_year_oc*100).toFixed(2) + '%' : '-'}</div>
                              <div>{r.n_years ?? 0}</div>
                            </>
                          )}
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

// ——— Simple tests (optional, no UI impact) ———
function runUnitTests() {
  try {
    const csv1 = `date,open,close\n2020-01-01,1,2\n2020-01-02,2,3`;
    const csv2 = `date,open,close\r\n2020-01-01,1,2\r\n2020-01-02,2,3`;
    console.assert(parseCsvSmart(csv1).length === 2 && parseCsvSmart(csv2).length === 2, "CSV newline variants ok");

    const euro = `date;open;close\n2024-01-01;43.850,00;44.000,00\n2024-01-02;44.000,00;44.100,00`;
    const e = parseCsvSmart(euro);
    console.assert(Math.abs((e[1].close as number) - 44100) < 1e-6, "EU decimal parsed");

    // Year boundary must flip around early Feb (Li Chun), not Lunar New Year now
    const pre = sexagenaryFromDate(new Date("2024-02-03T00:00:00+07:00"));
    const post = sexagenaryFromDate(new Date("2024-02-05T00:00:00+07:00"));
    console.assert(pre.baziYear !== post.baziYear, "BaZi year flips on Li Chun boundary");

    const mini = parseCsvSmart(`date,open,close\n2024-01-01,1,2\n2024-01-02,2,1`);
    const enr = enrich(mini);
    const agg = aggregateByElement(enr as any);
    const count5 = agg.filter(x=> (ELEMENTS as readonly string[]).includes(x.element as string)).length;
    console.assert(count5 === 5, "Always show 5 elements (padded)");

    const twoYears = parseCsvSmart(`date,open,close\n2023-02-03,100,100\n2023-12-31,100,120\n2024-02-05,120,120\n2024-12-31,120,132`);
    const enr2 = enrich(twoYears);
    const bySh = aggregateByShio(enr2 as any);
    const anySh = bySh[0];
    console.assert((anySh.n_years as number) >= 1, "Yearly OC should count at least one BaZi year");
  } catch (err) {
    console.warn("Unit tests warning:", err);
  }
}
if (typeof window !== "undefined") runUnitTests();





















