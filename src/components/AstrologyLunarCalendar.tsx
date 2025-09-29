import React, { useState } from 'react';
import { Card } from './ui-clean/Card';
import { Button } from './ui-clean/Button';

// Import custom zodiac and element images
import waterElementImg from 'figma:asset/4255e7ae98a6d199734497d70d1ed00697870a98.png';
import dogZodiacImg from 'figma:asset/236aa6196c1df263dbb637a5597e54ddc120818b.png';
import horseZodiacImg from 'figma:asset/cf3f47f46a455eb6d6c734c09fd98e231a65cec3.png';
import tigerZodiacImg from 'figma:asset/7ec75ed747daf18da7cc3980340b64e6c8fc0af3.png';
import pigZodiacImg from 'figma:asset/70740f4b0f3dce8852a9f26a193b0f1fb49095f1.png';
import roosterZodiacImg from 'figma:asset/92293969156e0ea91d94f454c08ce3aefe708be3.png';
import jiaYangWoodImg from 'figma:asset/3c77dc2d17df5c1ac4ee8022e05ae6195978050d.png';
import yiYinWoodImg from 'figma:asset/c789adb78a9fb10e322bb818bcc42795e4266151.png';
import goatZodiacImg from 'figma:asset/bc5443954dc36712f7c708cb5cfe10f5ea7076d4.png';
import monkeyZodiacImg from 'figma:asset/6de46a776b02fe0728d5977ece894aa760268ac3.png';
import rabbitZodiacImg from 'figma:asset/baca25cac02e40888124d2667204954fdc3788cd.png';
import oxZodiacImg from 'figma:asset/1a660f01851542452ce6c702dfdb3eb107bd9e19.png';
import dragonZodiacImg from 'figma:asset/2367c54b426d7c8aca77b1ad8adf3ea3cdc8512a.png';
import ratZodiacImg from 'figma:asset/7c7f7a9e6063527a3f9b130dc540b3c2eb1fe07e.png';
import snakeZodiacImg from 'figma:asset/7f325b73d8ff8b3575967ded34e912a00849b2e8.png';
import wuYangEarthImg from 'figma:asset/6de8b69e32a43e16b50d7a9a0b5136847f63dd12.png';
import xinYinMetalImg from 'figma:asset/1e74b6d864b571246a3ecbcae422dcfa3ab16c5f.png';
import jiYinEarthImg from 'figma:asset/a1da2170314b33553c24905ee684ab8a0ff4901a.png';
import gengYangMetalImg from 'figma:asset/2fb89929b8ec77fedf8d123cbf826c8c1dca5956.png';
import dingYinFireImg from 'figma:asset/9e5722cd94988069207ab6e16f3ed901900b0975.png';
import bingYangFireImg from 'figma:asset/561830e674839cd0e624c159832268488d3a9a7e.png';
import renYangWaterImg from 'figma:asset/8e605be6eb9887712262b6c183afb52c07063771.png';

// 12 Sio Cina dengan emoji - urutan baru sesuai feedback
const chineseZodiac = [
  { id: 1, name: 'Tiger', emoji: '🐅', element: 'Wood' },
  { id: 2, name: 'Rabbit', emoji: '🐰', element: 'Wood' },
  { id: 3, name: 'Dragon', emoji: '🐲', element: 'Earth' },
  { id: 4, name: 'Snake', emoji: '🐍', element: 'Fire' },
  { id: 5, name: 'Horse', emoji: '🐴', element: 'Fire' },
  { id: 6, name: 'Goat', emoji: '🐑', element: 'Earth' },
  { id: 7, name: 'Monkey', emoji: '🐒', element: 'Metal' },
  { id: 8, name: 'Rooster', emoji: '🐓', element: 'Metal' },
  { id: 9, name: 'Dog', emoji: '🐕', element: 'Earth' },
  { id: 10, name: 'Pig', emoji: '🐷', element: 'Water' },
  { id: 11, name: 'Rat', emoji: '🐭', element: 'Water' },
  { id: 0, name: 'Ox', emoji: '🐂', element: 'Earth' }
];

// 10 Heavenly Stems - detailed Yin-Yang elements (天干)
const heavenlyStems = [
  'Jia',  // 甲 Yang Wood
  'Yi',   // 乙 Yin Wood  
  'Bing', // 丙 Yang Fire
  'Ding', // 丁 Yin Fire
  'Wu',   // 戊 Yang Earth
  'Ji',   // 己 Yin Earth
  'Geng', // 庚 Yang Metal
  'Xin',  // 辛 Yin Metal
  'Ren',  // 壬 Yang Water
  'Gui'   // 癸 Yin Water
];

// Basic 5 Elements for backward compatibility
const basicElements = [
  'Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth', 'Metal', 'Metal', 'Water', 'Water'
];

// Colors for elements based on Bazi system
const elementColors = {
  'Wood': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-300' },
  'Fire': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300' },
  'Earth': { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-300' },
  'Metal': { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300' },
  'Water': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300' }
};

// Custom images mapping for elements and zodiac
const elementImages = {
  'Water': waterElementImg, // ✅ 癸 (Gui) Yin Water
  'Wood': jiaYangWoodImg,   // ✅ 甲 (Jia) Yang Wood - using as main Wood representation
  // Still need: Fire 火, Earth 土, Metal 金
};

// ✅ COMPLETE Heavenly Stems images mapping - 10/10 DONE! 🎉🎯
const heavenlyStemImages = {
  'Jia': jiaYangWoodImg,   // ✅ Yang Wood - big tree
  'Yi': yiYinWoodImg,      // ✅ Yin Wood - vine/grass
  'Bing': bingYangFireImg, // ✅ Yang Fire - sun/big fire
  'Ding': dingYinFireImg,  // ✅ Yin Fire - candle/small fire
  'Wu': wuYangEarthImg,    // ✅ Yang Earth - mountain/hard earth
  'Ji': jiYinEarthImg,     // ✅ Yin Earth - field/soft earth  
  'Geng': gengYangMetalImg, // ✅ Yang Metal - axe/weapon/hard metal
  'Xin': xinYinMetalImg,   // ✅ Yin Metal - jewelry/refined metal
  'Ren': renYangWaterImg,  // ✅ Yang Water - ocean/big water 🌊
  'Gui': waterElementImg,  // ✅ Yin Water - dew/small water
};
// 🎯 STATUS: 100% COMPLETE HEAVENLY STEMS SYSTEM!

// Complete mapping of all 10 Heavenly Stems with Yin-Yang polarity
const heavenlyStemInfo = {
  'Jia': { element: 'Wood', polarity: 'Yang', meaning: 'Big Tree' },
  'Yi': { element: 'Wood', polarity: 'Yin', meaning: 'Vine/Grass' },
  'Bing': { element: 'Fire', polarity: 'Yang', meaning: 'Sun/Big Fire' },
  'Ding': { element: 'Fire', polarity: 'Yin', meaning: 'Candle/Small Fire' },
  'Wu': { element: 'Earth', polarity: 'Yang', meaning: 'Mountain/Hard Earth' },
  'Ji': { element: 'Earth', polarity: 'Yin', meaning: 'Field/Soft Earth' },
  'Geng': { element: 'Metal', polarity: 'Yang', meaning: 'Weapon/Hard Metal' },
  'Xin': { element: 'Metal', polarity: 'Yin', meaning: 'Jewelry/Refined Metal' },
  'Ren': { element: 'Water', polarity: 'Yang', meaning: 'Ocean/Big Water' },
  'Gui': { element: 'Water', polarity: 'Yin', meaning: 'Dew/Small Water' }
};

const zodiacImages = {
  'Dog': dogZodiacImg,      // ✅ 戌 (Xu) Yang Earth
  'Horse': horseZodiacImg,  // ✅ 午 (Wu) Yang Fire  
  'Tiger': tigerZodiacImg,  // ✅ 寅 (Yin) Yang Wood
  'Pig': pigZodiacImg,      // ✅ 亥 (Hai) Yin Water
  'Rooster': roosterZodiacImg, // ✅ 酉 (You) Yin Metal
  'Goat': goatZodiacImg,    // ✅ 未 (Wei) Yin Earth
  'Monkey': monkeyZodiacImg, // ✅ 申 (Shen) Yang Metal
  'Rabbit': rabbitZodiacImg, // ✅ 卯 (Mao) Yin Wood
  'Ox': oxZodiacImg,        // ✅ 丑 (Chou) Yin Earth
  'Dragon': dragonZodiacImg, // ✅ 辰 (Chen) Yang Earth
  'Snake': snakeZodiacImg,  // ✅ 巳 (Si) Yin Fire
  'Rat': ratZodiacImg,      // ✅ 子 (Zi) Yang Water
  // 🎉 ALL 12 ZODIAC COMPLETE! 🎉
};

// Component to render zodiac with image or emoji fallback
const ZodiacDisplay = ({ zodiac, size = 'text-xl' }: { zodiac: typeof chineseZodiac[0], size?: string }) => {
  const customImage = zodiacImages[zodiac.name as keyof typeof zodiacImages];
  
  if (customImage) {
    return (
      <div className="flex flex-col items-center gap-1">
        <img 
          src={customImage} 
          alt={zodiac.name}
          className={`${size === 'text-2xl' ? 'w-8 h-8' : size === 'text-xl' ? 'w-6 h-6' : 'w-5 h-5'} object-contain`}
        />
        <span className="text-xs text-muted-foreground">{zodiac.name}</span>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={size}>{zodiac.emoji}</span>
      <span className="text-xs text-muted-foreground">{zodiac.name}</span>
    </div>
  );
};

// Component to render Heavenly Stem with detailed image - Clean format (no Chinese names)
const HeavenlyStemDisplay = ({ heavenlyStem, className = '' }: { heavenlyStem: string, className?: string }) => {
  const customImage = heavenlyStemImages[heavenlyStem as keyof typeof heavenlyStemImages];
  const stemInfo = heavenlyStemInfo[heavenlyStem];
  const elementColor = elementColors[stemInfo?.element as keyof typeof elementColors];
  
  if (customImage && stemInfo) {
    return (
      <td className={`p-2 text-center border-r border-border ${className}`}>
        <div className="flex flex-col items-center gap-1">
          <img 
            src={customImage} 
            alt={`${stemInfo.polarity} ${stemInfo.element}`}
            className="w-6 h-6 object-contain"
          />
          <div className="text-center">
            <div className={`text-xs font-medium ${elementColor?.text}`}>
              {stemInfo.polarity} {stemInfo.element}
            </div>
          </div>
        </div>
      </td>
    );
  }
  
  // Fallback to basic element display (clean format)
  const basicElement = stemInfo?.element || heavenlyStem;
  return (
    <td className={`p-2 text-center border-r border-border ${elementColor?.bg} ${className}`}>
      <div className={`px-2 py-1 rounded text-xs font-medium ${elementColor?.text}`}>
        <div>{stemInfo?.polarity} {stemInfo?.element}</div>
      </div>
    </td>
  );
};

// Component to render basic element with image or text fallback
const ElementDisplay = ({ element, className = '' }: { element: string, className?: string }) => {
  const customImage = elementImages[element as keyof typeof elementImages];
  
  if (customImage) {
    return (
      <td className={`p-2 text-center border-r border-border ${className}`}>
        <div className="flex flex-col items-center gap-1">
          <img 
            src={customImage} 
            alt={element}
            className="w-6 h-6 object-contain"
          />
          <span className={`text-xs font-medium ${elementColors[element as keyof typeof elementColors].text}`}>
            {element}
          </span>
        </div>
      </td>
    );
  }
  
  return (
    <td className={`p-2 text-center border-r border-border ${elementColors[element as keyof typeof elementColors].bg} ${className}`}>
      <div className={`px-2 py-1 rounded text-xs font-medium ${elementColors[element as keyof typeof elementColors].text}`}>
        {element}
      </div>
    </td>
  );
};

// Function untuk mendapatkan detailed Heavenly Stem berdasarkan tanggal
// Base reference: kemarin=Ji(己Yin Earth), today=Geng(庚Yang Metal), besok=Xin(辛Yin Metal)
const getHeavenlyStemByDate = (date: Date, type: 'daily' | 'monthly' | 'yearly'): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let baseIndex;
  if (type === 'daily') {
    // Today is Geng (index 6), yesterday was Ji (index 5), tomorrow is Xin (index 7)
    // Heavenly Stems: Jia, Yi, Bing, Ding, Wu, Ji, Geng, Xin, Ren, Gui (0-9)
    const daysDiff = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    baseIndex = (6 + daysDiff) % 10; // Geng is index 6
  } else if (type === 'monthly') {
    const monthsDiff = (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
    baseIndex = (6 + monthsDiff) % 10;
  } else { // yearly
    const yearsDiff = date.getFullYear() - today.getFullYear();
    baseIndex = (6 + yearsDiff) % 10;
  }
  
  return heavenlyStems[baseIndex < 0 ? baseIndex + 10 : baseIndex];
};

// Function untuk mendapatkan basic element (for backward compatibility)
const getElementByDate = (date: Date, type: 'daily' | 'monthly' | 'yearly'): string => {
  const heavenlyStem = getHeavenlyStemByDate(date, type);
  return heavenlyStemInfo[heavenlyStem].element;
};

const getZodiacByDate = (date: Date, type: 'daily' | 'monthly' | 'yearly'): typeof chineseZodiac[0] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let baseIndex;
  if (type === 'daily') {
    // Today is Horse (index 4), yesterday was Snake (index 3), tomorrow is Goat (index 5)
    // Zodiac cycle: Tiger, Rabbit, Dragon, Snake, Horse, Goat, Monkey, Rooster, Dog, Pig, Rat, Ox (0-11)
    const daysDiff = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    baseIndex = (4 + daysDiff) % 12;
  } else if (type === 'monthly') {
    const monthsDiff = (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
    baseIndex = (4 + monthsDiff) % 12;
  } else { // yearly
    const yearsDiff = date.getFullYear() - today.getFullYear();
    baseIndex = (4 + yearsDiff) % 12;
  }
  
  const finalIndex = baseIndex < 0 ? baseIndex + 12 : baseIndex;
  return chineseZodiac[finalIndex];
};

// Mock data untuk astrology calendar
const generateAstrologyData = () => {
  const data = [];
  const currentDate = new Date();
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() - i);
    
    // Get previous day for price comparison
    const prevDate = new Date(date);
    prevDate.setDate(date.getDate() - 1);
    
    // Get detailed Heavenly Stems
    const yearHeavenlyStem = getHeavenlyStemByDate(date, 'yearly');
    const yearElement = getElementByDate(date, 'yearly');
    const yearZodiac = getZodiacByDate(date, 'yearly');
    const monthHeavenlyStem = getHeavenlyStemByDate(date, 'monthly');
    const monthElement = getElementByDate(date, 'monthly');
    const monthZodiac = getZodiacByDate(date, 'monthly');
    const dayHeavenlyStem = getHeavenlyStemByDate(date, 'daily');
    const dayElement = getElementByDate(date, 'daily');
    const dayZodiac = getZodiacByDate(date, 'daily');
    
    // Mock stock data
    const basePrice = 4500 + Math.random() * 500;
    const high = basePrice + Math.random() * 100;
    const low = basePrice - Math.random() * 100;
    const close = low + Math.random() * (high - low);
    const open = low + Math.random() * (high - low);
    const volume = Math.floor(Math.random() * 50000000) + 10000000;
    
    // Previous day close price
    const prevClose = basePrice * (0.90 + Math.random() * 0.20); // Random previous close
    
    // Calculate % kenaikan (close today vs close yesterday)
    const priceChange = ((close - prevClose) / prevClose) * 100;
    
    // Calculate % spike ((close + high) / 2 vs close yesterday)
    const spikePrice = (close + high) / 2;
    const spikeChange = ((spikePrice - prevClose) / prevClose) * 100;
    
    // Formula analysis: (high + close) / 2 > 5%
    const isRising = spikeChange > 5;
    
    data.push({
      id: i + 1,
      date: date.toISOString().split('T')[0],
      dateFormatted: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      yearHeavenlyStem,
      yearElement,
      yearZodiac,
      monthHeavenlyStem,
      monthElement,
      monthZodiac,
      dayHeavenlyStem,
      dayElement,
      dayZodiac,
      yearEarth: date.getFullYear(),
      monthEarth: date.getMonth() + 1,
      dayEarth: date.getDate(),
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      prevClose: Math.round(prevClose),
      volume,
      priceChange: Math.round(priceChange * 100) / 100,
      spikeChange: Math.round(spikeChange * 100) / 100,
      isRising,
      element: dayElement
    });
  }
  
  return data.reverse();
};

export function AstrologyLunarCalendar() {
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [filterType, setFilterType] = useState('all');
  const [selectedZodiac, setSelectedZodiac] = useState('all');
  const [showPivot, setShowPivot] = useState(false);
  const [priceFilter, setPriceFilter] = useState('all'); // all, 5%, 10%
  const [spikeFilter, setSpikeFilter] = useState('all'); // all, 5%, 10%
  
  const astrologyData = generateAstrologyData();
  const stocks = ['BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM'];
  
  // Filter data based on selected criteria
  const filteredData = astrologyData.filter(item => {
    // Zodiac filter
    if (selectedZodiac !== 'all') {
      return item.dayZodiac.name.toLowerCase() === selectedZodiac.toLowerCase();
    }
    
    // Price change filter
    if (priceFilter === '5%') {
      return Math.abs(item.priceChange) > 5;
    }
    if (priceFilter === '10%') {
      return Math.abs(item.priceChange) > 10;
    }
    
    // Spike filter
    if (spikeFilter === '5%') {
      return Math.abs(item.spikeChange) > 5;
    }
    if (spikeFilter === '10%') {
      return Math.abs(item.spikeChange) > 10;
    }
    
    return true;
  });

  // Get rising stocks (spike > 5%)
  const risingStocks = filteredData.filter(item => item.spikeChange > 5).slice(0, 10);
  
  // Group data by different criteria for pivot
  const groupByYear = astrologyData.reduce((acc, item) => {
    const key = `${item.yearElement}-${item.yearZodiac.name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, typeof astrologyData>);

  const groupByMonth = astrologyData.reduce((acc, item) => {
    const key = `${item.monthElement}-${item.monthZodiac.name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, typeof astrologyData>);

  const groupByDay = astrologyData.reduce((acc, item) => {
    const key = `${item.dayElement}-${item.dayZodiac.name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, typeof astrologyData>);

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <label className="font-medium">Stock:</label>
              <select
                value={selectedStock}
                onChange={(e) => setSelectedStock(e.target.value)}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground"
              >
                {stocks.map(stock => (
                  <option key={stock} value={stock}>{stock}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="font-medium">Filter Shio:</label>
              <select
                value={selectedZodiac}
                onChange={(e) => setSelectedZodiac(e.target.value)}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground"
              >
                <option value="all">All Shio</option>
                {chineseZodiac.map(zodiac => (
                  <option key={zodiac.id} value={zodiac.name}>{zodiac.emoji} {zodiac.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="font-medium">Price Change:</label>
              <select
                value={priceFilter}
                onChange={(e) => setPriceFilter(e.target.value)}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground"
              >
                <option value="all">All</option>
                <option value="5%">Above 5%</option>
                <option value="10%">Above 10%</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="font-medium">Spike:</label>
              <select
                value={spikeFilter}
                onChange={(e) => setSpikeFilter(e.target.value)}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground"
              >
                <option value="all">All</option>
                <option value="5%">Above 5%</option>
                <option value="10%">Above 10%</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showPivot"
                checked={showPivot}
                onChange={(e) => setShowPivot(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="showPivot" className="font-medium">Show Pivot Analysis</label>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground">
            🌙 Lunar Calendar Analysis - {selectedStock}
          </div>
        </div>
      </Card>

      {/* Main Astrology Table */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Input Data Astrology</h3>
          <div className="text-sm text-muted-foreground">
            Total Records: {filteredData.length}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-center p-2 border-r border-border">Yearly Element</th>
                <th className="text-center p-2 border-r border-border">Yearly Animal</th>
                <th className="text-center p-2 border-r border-border">Monthly Element</th>
                <th className="text-center p-2 border-r border-border">Monthly Animal</th>
                <th className="text-center p-2 border-r border-border">Daily Element</th>
                <th className="text-center p-2 border-r border-border">Daily Animal</th>
                <th className="text-center p-2 border-r border-border bg-yellow-200 dark:bg-yellow-700">DATE</th>
                <th className="text-center p-2 border-r border-border">OPEN</th>
                <th className="text-center p-2 border-r border-border">HIGH</th>
                <th className="text-center p-2 border-r border-border">LOW</th>
                <th className="text-center p-2 border-r border-border">CLOSE</th>
                <th className="text-center p-2 border-r border-border">% CHANGE</th>
                <th className="text-center p-2 border-r border-border">% SPIKE</th>
                <th className="text-center p-2">VOLUME</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, index) => (
                <tr key={row.id} className={`border-b border-border/50 hover:bg-muted/20 ${row.isRising ? 'bg-green-50 dark:bg-green-950/20' : ''}`}>
                  <HeavenlyStemDisplay heavenlyStem={row.yearHeavenlyStem} />
                  <td className="p-2 text-center border-r border-border">
                    <ZodiacDisplay zodiac={row.yearZodiac} size="text-2xl" />
                  </td>
                  <HeavenlyStemDisplay heavenlyStem={row.monthHeavenlyStem} />
                  <td className="p-2 text-center border-r border-border">
                    <ZodiacDisplay zodiac={row.monthZodiac} size="text-xl" />
                  </td>
                  <HeavenlyStemDisplay heavenlyStem={row.dayHeavenlyStem} />
                  <td className="p-2 text-center border-r border-border">
                    <ZodiacDisplay zodiac={row.dayZodiac} size="text-xl" />
                  </td>
                  <td className="p-2 text-center border-r border-border bg-yellow-100 dark:bg-yellow-900/30 font-medium">
                    {row.dateFormatted}
                  </td>
                  <td className="p-2 text-right border-r border-border font-mono">{row.open.toLocaleString()}</td>
                  <td className="p-2 text-right border-r border-border font-mono text-green-600">{row.high.toLocaleString()}</td>
                  <td className="p-2 text-right border-r border-border font-mono text-red-600">{row.low.toLocaleString()}</td>
                  <td className="p-2 text-right border-r border-border font-mono">{row.close.toLocaleString()}</td>
                  <td className={`p-2 text-right border-r border-border font-mono font-medium ${row.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {row.priceChange >= 0 ? '+' : ''}{row.priceChange.toFixed(2)}%
                  </td>
                  <td className={`p-2 text-right border-r border-border font-mono font-medium ${row.spikeChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {row.spikeChange >= 0 ? '+' : ''}{row.spikeChange.toFixed(2)}%
                  </td>
                  <td className="p-2 text-right font-mono text-xs">{row.volume.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Analysis Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rising Stocks */}
        <Card className="p-4">
          <h3 className="font-medium mb-4">Highest Spike List</h3>
          <div className="mb-3 flex gap-2">
            <Button 
              variant={filterType === 'all' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setFilterType('all')}
            >
              All
            </Button>
            <Button 
              variant={filterType === 'year' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setFilterType('year')}
            >
              By Year
            </Button>
            <Button 
              variant={filterType === 'month' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setFilterType('month')}
            >
              By Month
            </Button>
            <Button 
              variant={filterType === 'day' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setFilterType('day')}
            >
              By Day
            </Button>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Formula: (high + close) / 2 vs yesterday close {'>'} 5%
            </div>
            
            <div className="max-h-64 overflow-y-auto">
              {risingStocks.map((stock, index) => (
                <div key={stock.id} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/20 rounded mb-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0">
                      <ZodiacDisplay zodiac={stock.dayZodiac} size="text-lg" />
                    </div>
                    <div>
                      <div className="font-medium">{stock.dateFormatted}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-green-600">+{stock.spikeChange.toFixed(2)}%</div>
                    <div className="text-xs text-muted-foreground">Spike: {((stock.close + stock.high) / 2).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Zodiac Elements Analysis */}
        <Card className="p-4">
          <h3 className="font-medium mb-4">Element Analysis</h3>
          <div className="space-y-3">
            {['Water', 'Earth', 'Wood', 'Fire', 'Metal'].map(element => {
              const elementData = filteredData.filter(item => item.element === element);
              const avgPercentage = elementData.length > 0 
                ? elementData.reduce((sum, item) => sum + item.spikeChange, 0) / elementData.length 
                : 0;
              const risingCount = elementData.filter(item => item.spikeChange > 5).length;
              
              return (
                <div key={element} className={`p-3 rounded ${elementColors[element].bg} ${elementColors[element].border} border`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`font-medium ${elementColors[element].text}`}>{element}</span>
                    <span className={`font-medium ${avgPercentage > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {avgPercentage > 0 ? '+' : ''}{avgPercentage.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Rising Days: {risingCount}/{elementData.length} | 
                    Success Rate: {elementData.length > 0 ? Math.round((risingCount / elementData.length) * 100) : 0}%
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Pivot Analysis (Conditional) */}
      {showPivot && (
        <Card className="p-4">
          <h3 className="font-medium mb-4">Pivot Analysis by Element-Shio Combination</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* By Year Zodiac */}
            <div>
              <h4 className="font-medium mb-3">By Yearly Element-Shio</h4>
              <div className="space-y-2">
                {Object.entries(groupByYear).map(([combo, data]) => {
                  const avgGain = data.reduce((sum, item) => sum + item.spikeChange, 0) / data.length;
                  const risingCount = data.filter(item => item.spikeChange > 5).length;
                  const [element, zodiacName] = combo.split('-');
                  
                  return (
                    <div key={combo} className={`p-2 rounded text-sm ${elementColors[element as keyof typeof elementColors].bg} border ${elementColors[element as keyof typeof elementColors].border}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0">
                            {zodiacImages[zodiacName as keyof typeof zodiacImages] ? (
                              <img 
                                src={zodiacImages[zodiacName as keyof typeof zodiacImages]} 
                                alt={zodiacName}
                                className="w-4 h-4 object-contain"
                              />
                            ) : (
                              <span className="text-sm">{chineseZodiac.find(z => z.name === zodiacName)?.emoji}</span>
                            )}
                          </div>
                          <span className={`text-sm ${elementColors[element as keyof typeof elementColors].text}`}>
                            {element}-{zodiacName}
                          </span>
                        </div>
                        <span className={avgGain > 0 ? 'text-green-600' : 'text-red-600'}>
                          {avgGain > 0 ? '+' : ''}{avgGain.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {risingCount}/{data.length} days rising
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Month Zodiac */}
            <div>
              <h4 className="font-medium mb-3">By Monthly Element-Shio</h4>
              <div className="space-y-2">
                {Object.entries(groupByMonth).map(([combo, data]) => {
                  const avgGain = data.reduce((sum, item) => sum + item.spikeChange, 0) / data.length;
                  const risingCount = data.filter(item => item.spikeChange > 5).length;
                  const [element, zodiacName] = combo.split('-');
                  
                  return (
                    <div key={combo} className={`p-2 rounded text-sm ${elementColors[element as keyof typeof elementColors].bg} border ${elementColors[element as keyof typeof elementColors].border}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0">
                            {zodiacImages[zodiacName as keyof typeof zodiacImages] ? (
                              <img 
                                src={zodiacImages[zodiacName as keyof typeof zodiacImages]} 
                                alt={zodiacName}
                                className="w-4 h-4 object-contain"
                              />
                            ) : (
                              <span className="text-sm">{chineseZodiac.find(z => z.name === zodiacName)?.emoji}</span>
                            )}
                          </div>
                          <span className={`text-sm ${elementColors[element as keyof typeof elementColors].text}`}>
                            {element}-{zodiacName}
                          </span>
                        </div>
                        <span className={avgGain > 0 ? 'text-green-600' : 'text-red-600'}>
                          {avgGain > 0 ? '+' : ''}{avgGain.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {risingCount}/{data.length} days rising
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Day Zodiac */}
            <div>
              <h4 className="font-medium mb-3">By Daily Element-Shio</h4>
              <div className="space-y-2">
                {Object.entries(groupByDay).map(([combo, data]) => {
                  const avgGain = data.reduce((sum, item) => sum + item.spikeChange, 0) / data.length;
                  const risingCount = data.filter(item => item.spikeChange > 5).length;
                  const [element, zodiacName] = combo.split('-');
                  
                  return (
                    <div key={combo} className={`p-2 rounded text-sm ${elementColors[element as keyof typeof elementColors].bg} border ${elementColors[element as keyof typeof elementColors].border}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0">
                            {zodiacImages[zodiacName as keyof typeof zodiacImages] ? (
                              <img 
                                src={zodiacImages[zodiacName as keyof typeof zodiacImages]} 
                                alt={zodiacName}
                                className="w-4 h-4 object-contain"
                              />
                            ) : (
                              <span className="text-sm">{chineseZodiac.find(z => z.name === zodiacName)?.emoji}</span>
                            )}
                          </div>
                          <span className={`text-sm ${elementColors[element as keyof typeof elementColors].text}`}>
                            {element}-{zodiacName}
                          </span>
                        </div>
                        <span className={avgGain > 0 ? 'text-green-600' : 'text-red-600'}>
                          {avgGain > 0 ? '+' : ''}{avgGain.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {risingCount}/{data.length} days rising
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}