import { IndicatorData } from '../TechnicalAnalysisTradingView';
import { OhlcRow } from './SMA';

// Element based on 60-day Ganzhi cycle (5 elements x 12 days = 60)

// STEM_ELEMENT mapping
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

// 60-hari pasangan stem-branch (Jia-Zi)
const JIA_ZI = [
  "甲子","乙丑","丙寅","丁卯","戊辰","己巳","庚午","辛未","壬申","癸酉",
  "甲戌","乙亥","丙子","丁丑","戊寅","己卯","庚辰","辛巳","壬午","癸未",
  "甲申","乙酉","丙戌","丁亥","戊子","己丑","庚寅","辛卯","壬辰","癸巳",
  "甲午","乙未","丙申","丁酉","戊戌","己亥","庚子","辛丑","壬寅","癸卯",
  "甲辰","乙巳","丙午","丁未","戊申","己酉","庚戌","辛亥","壬子","癸丑",
  "甲寅","乙卯","丙辰","丁巳","戊午","己未","庚申","辛酉","壬戌","癸亥",
] as const;

const JIAZI_ANCHOR_UTC = new Date(Date.UTC(1900,0,31,0,0,0)); // 甲子

function toJulianDayUTC(dt: Date): number {
  const y = dt.getUTCFullYear(); let m = dt.getUTCMonth()+1;
  const D = dt.getUTCDate() + (dt.getUTCHours() + (dt.getUTCMinutes() + dt.getUTCSeconds()/60)/60)/24;
  let Y = y; if (m<=2){ Y=y-1; m+=12; }
  const A = Math.floor(Y/100); const B = 2 - A + Math.floor(A/4);
  return Math.floor(365.25*(Y+4716)) + Math.floor(30.6001*(m+1)) + D + B - 1524.5;
}


// Element to number mapping
const elementToNumber: Record<string, number> = {
  "Wood": 1,
  "Fire": 2,
  "Earth": 3,
  "Metal": 4,
  "Water": 5
};

// Element color mapping
const elementColors: Record<string, string> = {
  "Wood": "#16a34a",    // Green
  "Fire": "#dc2626",    // Red
  "Earth": "#d97706",   // Amber
  "Metal": "#6b7280",   // Gray
  "Water": "#2563eb"    // Blue
};

// Get element emoji
const getElementEmoji = (element: string): string => {
  const emojiMap: Record<string, string> = {
    "Wood": "🌳",
    "Fire": "🔥",
    "Earth": "⛰️",
    "Metal": "⚒️",
    "Water": "🌊"
  };
  return emojiMap[element] || "⭐";
};

// Export function to get daily element info
export function getDailyElementInfo(date: Date): { element: string; color: string; emoji: string } {
  const pillarData = dayPillarExact(date);
  const element = pillarData.element;
  return {
    element,
    color: elementColors[element] || "#6B7280",
    emoji: getElementEmoji(element)
  };
}

// Export element info for legend
export const ELEMENT_INFO = Object.keys(elementColors).map(element => ({
  name: element,
  emoji: getElementEmoji(element),
  color: elementColors[element]
}));

// Use BaZiCycleAnalysis method exactly (copied from BaZiCycleAnalysis.tsx line 273-281)
function dayPillarExact(localDate: Date){
  const dayStartLocal = new Date(new Date(localDate).setHours(0,0,0,0));
  const dayStartUTC = new Date(dayStartLocal.toLocaleString("en-US",{ timeZone: "UTC" }));
  const JD = toJulianDayUTC(dayStartUTC); 
  const JD0 = toJulianDayUTC(JIAZI_ANCHOR_UTC);
  const delta = Math.round(JD - JD0); 
  const idx = ((delta % 60) + 60) % 60;
  const pair = JIA_ZI[idx]; 
  const stem = pair?.[0] || '甲';
  const branch = pair?.[1] || '子';
  const se = STEM_ELEMENT[stem]; 
  const bm = BRANCH_META_FULL[branch];
  return { 
    pillarCN: pair || '甲子', 
    stemCN: stem, 
    branchCN: branch, 
    element: se?.element || 'Wood', 
    yinyang: se?.yy || 'Yang', 
    shio: bm?.shio || 'Rat' 
  };
}

export function calculateDailyElement(data: OhlcRow[]): { 
  data: IndicatorData[]; 
  labels: string[];
  colors: string[];
} {
  const result: IndicatorData[] = [];
  const labels: string[] = [];
  const colors: string[] = [];
  
  let lastDate = '';
  
  for (const row of data) {
    const date = new Date(row.time * 1000);
    
    // Get date string in YYYY-MM-DD format to check if it's a new day
    const dateStr = date.toISOString().split('T')[0] || '';
    const isNewDay = dateStr !== lastDate;
    
    if (isNewDay) {
      const pillarData = dayPillarExact(date);
      const element = pillarData.element;
      const elementNum = elementToNumber[element] || 0;
      
      result.push({
        time: row.time,
        value: elementNum
      });
      
      labels.push(element);
      colors.push(elementColors[element] || "#6B7280");
      
      lastDate = dateStr;
    } else {
      // For same day, use the last calculated value
      result.push({
        time: row.time,
        value: result[result.length - 1]?.value || 1
      });
      
      labels.push(labels[labels.length - 1] || "Wood");
      colors.push(colors[colors.length - 1] || "#6B7280");
    }
  }
  
  return { data: result, labels, colors };
}
