import { IndicatorData } from '../TechnicalAnalysisTradingView';
import { OhlcRow } from './SMA';

// Exact BaZi calculation constants from BaZiCycleAnalysis.tsx
const TZ_DEFAULT = "Asia/Jakarta" as const;
const stemsCN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"] as const;

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

// Month calculation using solar longitude (BaZiCycleAnalysis.tsx method)
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

const normalize360 = (x:number)=> ((x%360)+360)%360;

function toJulianDayUTC(dt: Date): number {
  const y = dt.getUTCFullYear(); let m = dt.getUTCMonth()+1;
  const D = dt.getUTCDate() + (dt.getUTCHours() + (dt.getUTCMinutes() + dt.getUTCSeconds()/60)/60)/24;
  let Y = y; if (m<=2){ Y=y-1; m+=12; }
  const A = Math.floor(Y/100); const B = 2 - A + Math.floor(A/4);
  return Math.floor(365.25*(Y+4716)) + Math.floor(30.6001*(m+1)) + D + B - 1524.5;
}

function julianCenturiesTT(JD:number): number {
  return (JD - 2451545.0)/36525.0;
}

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

function monthIndexFromLongitude(lam:number): number {
  const d = normalize360(lam - 315); return Math.floor(d/30) % 12; // 0..11, 0=寅
}

// Year pillar to get year stem
function yearPillarExact(localDate: Date, tz:string=TZ_DEFAULT){
  // Simplified year calculation - for month pillar we only need the stem
  const solarYear = localDate.getFullYear();
  const n = solarYear - 1984; // 1984 = 甲子
  const stemCN = stemsCN[((n%10)+10)%10];
  return { stemCN: stemCN || '甲' };
}

// Month pillar exact (BaZiCycleAnalysis.tsx method) - simplified to return only element
function monthPillarExact(localDate: Date){
  const yearInfo = yearPillarExact(localDate);
  const lam = solarAppLongitudeDeg(new Date(localDate.toLocaleString("en-US",{ timeZone: "UTC" })));
  const idx = monthIndexFromLongitude(lam); // 0..11
  const branchCN = MONTH_BRANCHES_CN[idx] || '寅'; 
  const stemCN = MONTH_STEM_MAP[yearInfo.stemCN || '甲']?.[idx] || '甲';
  const se = STEM_ELEMENT[stemCN] || { element: 'Wood', yy: 'Yang' as const };
  // Return only element, no need for yinyang
  return { element: se.element };
}

// Element to number mapping
const elementToNumber: Record<string, number> = {
  "Wood": 1,
  "Fire": 2,
  "Earth": 3,
  "Metal": 4,
  "Water": 5
};

const elementColors: Record<string, string> = {
  "Wood": "#16a34a",    // Green
  "Fire": "#dc2626",    // Red
  "Earth": "#d97706",   // Amber
  "Metal": "#6b7280",   // Gray
  "Water": "#2563eb"    // Blue
};

export function calculateDailyElement(data: OhlcRow[]): { 
  data: IndicatorData[]; 
  labels: string[];
  colors: string[];
} {
  const result: IndicatorData[] = [];
  const labels: string[] = [];
  const colors: string[] = [];
  
  // Track the last element to avoid duplicates within the same day
  let lastElement: string | null = null;
  let lastDay = '';
  
  for (const row of data) {
    const date = new Date(row.time * 1000);
    
    // Get date string in YYYY-MM-DD format to check if it's a new day
    const dateStr = date.toISOString().split('T')[0] || '';
    const isNewDay = dateStr !== lastDay;
    
    const monthInfo = monthPillarExact(date);
    const element = monthInfo.element;
    const elementNum = elementToNumber[element] || 0;
    
    // Only add if it's a new element or a new day
    const shouldAdd = isNewDay || element !== lastElement;
    
    if (shouldAdd) {
      result.push({
        time: row.time,
        value: elementNum
      });
      
      labels.push(element);
      colors.push(elementColors[element] || "#6B7280");
      
      lastElement = element;
      lastDay = dateStr;
    } else {
      // Skip duplicate element on the same day
      // But still add the data point to maintain the time series
      result.push({
        time: row.time,
        value: elementNum
      });
      
      labels.push(element);
      colors.push(elementColors[element] || "#6B7280");
    }
  }
  
  return { data: result, labels, colors };
}
