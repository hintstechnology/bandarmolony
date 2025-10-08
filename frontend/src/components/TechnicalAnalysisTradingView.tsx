import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
} from 'lightweight-charts';
import { chartPreferencesService } from '../services/chartPreferences';

// Type declaration for import.meta.glob
declare global {
  interface ImportMeta {
    glob: (pattern: string, options?: any) => Record<string, any>;
  }
}

/* ============================================================================
   1) AUTO DISCOVER CSV DI src/data/*.csv
   - Taruh file: src/data/BBRI.csv, src/data/BBCA.csv, dst.
   - Dropdown terisi otomatis dari nama file.
============================================================================ */
const csvFiles = import.meta.glob('../data/IDX_DLY_*.csv', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const AVAILABLE_SYMBOLS = Object.keys(csvFiles)
  .map((p) => p.split('/').pop()!)
  .map((f) => f.replace(/\.csv$/i, ''))
  .map((f) => {
    // Extract ticker code from various filename patterns
    // Examples: "IDX_DLY_BBRI, 1D.csv" -> "BBRI", "BBCA.csv" -> "BBCA"
    const patterns = [
      /^IDX_DLY_(.+?),\s*\d+D$/,  // IDX_DLY_BBRI, 1D -> BBRI
      /^IDX_DLY_(.+?),\s*\d+D\s*\(\d+\)$/,  // IDX_DLY_BBRI, 1D (1) -> BBRI
      /^(.+?),\s*\d+D$/,  // BBRI, 1D -> BBRI
      /^(.+?),\s*\d+D\s*\(\d+\)$/,  // BBRI, 1D (1) -> BBRI
      /^IDX_DLY_(.+?)_\d+D$/,  // IDX_DLY_BBRI_1D -> BBRI (fallback)
      /^IDX_DLY_(.+?)_\d+D\s*\(\d+\)$/,  // IDX_DLY_BBRI_1D (1) -> BBRI (fallback)
      /^(.+?)_\d+D$/,  // BBRI_1D -> BBRI (fallback)
      /^(.+?)_\d+D\s*\(\d+\)$/,  // BBRI_1D (1) -> BBRI (fallback)
    ];
    
    for (const pattern of patterns) {
      const match = f.match(pattern);
      if (match) return match[1];
    }
    
    // If no pattern matches, return the original filename
    return f;
  })
  .sort();

/* ============================================================================
   2) TYPES & CSV PARSER (fleksibel header)
============================================================================ */
type OhlcRow = {
  time: number; // UNIX seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type ChartStyle = 'line' | 'candles' | 'area' | 'footprint';
type Timeframe = '1M' | '5M' | '15M' | '30M' | '1H' | '1D' | '1W' | '1MO' | '3M' | '6M' | '1Y';

type Indicator = {
  id: string;
  name: string;
  type: 'sma' | 'ema' | 'rsi' | 'macd' | 'volume_histogram';
  period: number;
  color: string;
  enabled: boolean;
  separateScale?: boolean; // For indicators that need separate scale like RSI
};

type IndicatorData = {
  time: number;
  value: number;
};

// Footprint chart data structure
type FootprintData = {
  time: number;
  priceLevels: {
    price: number;
    bidVolume: number;
    askVolume: number;
    delta: number; // askVolume - bidVolume
  }[];
};

// Bid-Ask Footprint data structure
type BidAskFootprintData = {
  time: number;
  priceLevels: {
    price: number;
    bidVolume: number;
    askVolume: number;
    netVolume: number; // bidVolume - askVolume
    totalVolume: number;
    bidCount: number;
    askCount: number;
  }[];
};

function detectDelimiter(header: string): string {
  const c = (header.match(/,/g) || []).length;
  const s = (header.match(/;/g) || []).length;
  const t = (header.match(/\t/g) || []).length;
  if (s > c && s > t) return ';';
  if (t > c && t > s) return '\t';
  return ',';
}

function toNum(x: string): number | undefined {
  const s = x.trim().replace(/,/g, '');
  if (!s || s.toLowerCase() === 'na' || s.toLowerCase() === 'null') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function toUnix(v: string): number | undefined {
  const s = v.trim();
  if (/^\d{10}$/.test(s)) return Number(s);          // seconds
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000); // ms -> sec
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    // Handle YYYY-MM-DD format (most common in our CSV files)
    // Use local time instead of UTC to avoid timezone issues
    const t = Date.parse(s + 'T00:00:00');
    return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
  }
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) {
    // Handle YYYY.MM.DD format (like 2021.07.04)
    const iso = s.replace(/\./g, '-');
    const t = Date.parse(iso + 'T00:00:00');
    return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const [d, m, yRaw] = s.split('/');
    const y = Number(yRaw.length === 2 ? '20' + yRaw : yRaw);
    const iso = `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
    const t = Date.parse(iso + 'T00:00:00');
    return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

function parseCsv(text: string): OhlcRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const delim = detectDelimiter(lines[0]);
  const split = (line: string) => line.split(delim).map((s) => s.trim());
  const header = split(lines[0]).map((h) => h.toLowerCase());

  const findIdx = (...names: string[]) => {
    const i = header.findIndex((h) => names.some((n) => new RegExp(`^${n}$`, 'i').test(h)));
    return i >= 0 ? i : undefined;
  };

  const iTime =
    findIdx('time', 'date', 'datetime', 'timestamp', '<date>', '<time>') ??
    header.findIndex((h) => h.includes('date') || h.includes('time'));
  const iOpen = findIdx('open', 'o', 'open_price', 'openprice', '<open>');
  const iHigh = findIdx('high', 'h', 'high_price', 'highprice', '<high>');
  const iLow = findIdx('low', 'l', 'low_price', 'lowprice', '<low>');
  const iClose = findIdx('close', 'c', 'adj close', 'close_price', 'closeprice', 'price', 'last', '<close>');
  const iVol = findIdx('volume', 'vol', 'qty', 'amount', 'tickvol', 'tick_vol', '<vol>', '<tickvol>');

  console.log('CSV Headers:', header);
  console.log('Column indices:', { iTime, iOpen, iHigh, iLow, iClose, iVol });

  if (iTime === undefined || iClose === undefined) {
    console.log('Missing required columns: time or close');
    return [];
  }

  const out: OhlcRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = split(lines[r]);
    if (!cols.length) continue;

    const t = toUnix(cols[iTime]);
    const c = toNum(cols[iClose]);
    if (!t || c === undefined) {
      if (r <= 5) console.log(`Skipping row ${r}:`, { time: cols[iTime], close: cols[iClose], t, c });
      continue;
    }

    const o = iOpen !== undefined ? toNum(cols[iOpen]) : undefined;
    const h = iHigh !== undefined ? toNum(cols[iHigh]) : undefined;
    const l = iLow !== undefined ? toNum(cols[iLow]) : undefined;
    const v = iVol !== undefined ? toNum(cols[iVol]) : undefined;

    out.push({
      time: t,
      open: o ?? c,
      high: h ?? c,
      low: l ?? c,
      close: c,
      volume: v,
    });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/* ============================================================================
   3) INDICATOR CALCULATION FUNCTIONS
============================================================================ */
function calculateSMA(data: OhlcRow[], period: number): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, item) => acc + item.close, 0);
    const sma = sum / period;
    
    result.push({
      time: data[i].time,
      value: sma
    });
  }
  
  return result;
}

function calculateEMA(data: OhlcRow[], period: number): IndicatorData[] {
  const result: IndicatorData[] = [];
  const multiplier = 2 / (period + 1);
  
  if (data.length === 0) return result;
  
  // First EMA is the first close price
  let ema = data[0].close;
  result.push({ time: data[0].time, value: ema });
  
  for (let i = 1; i < data.length; i++) {
    ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
    result.push({ time: data[i].time, value: ema });
  }
  
  return result;
}

function calculateRSI(data: OhlcRow[], period: number): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  if (data.length < period + 1) return result;
  
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate RSI for each period
  for (let i = period; i < gains.length; i++) {
    const avgGain = gains.slice(i - period, i).reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.slice(i - period, i).reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) {
      result.push({ time: data[i + 1].time, value: 100 });
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push({ time: data[i + 1].time, value: rsi });
    }
  }
  
  return result;
}

function calculateMACD(data: OhlcRow[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  if (data.length < slowPeriod) return result;
  
  // Calculate EMAs
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  // Calculate MACD line
  const macdLine: IndicatorData[] = [];
  for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
    if (fastEMA[i] && slowEMA[i]) {
      macdLine.push({
        time: fastEMA[i].time,
        value: fastEMA[i].value - slowEMA[i].value
      });
    }
  }
  
  // Calculate signal line (EMA of MACD line)
  const signalLine = calculateEMA(macdLine.map(d => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value })), signalPeriod);
  
  // Calculate histogram (MACD - Signal)
  for (let i = 0; i < Math.min(macdLine.length, signalLine.length); i++) {
    if (macdLine[i] && signalLine[i]) {
      result.push({
        time: macdLine[i].time,
        value: macdLine[i].value - signalLine[i].value
      });
    }
  }
  
  return result;
}


function calculateVolumeHistogram(data: OhlcRow[]): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (data[i].volume !== undefined) {
      result.push({
        time: data[i].time,
        value: data[i].volume!
      });
    }
  }
  
  return result;
}

// Load bid-ask footprint data from CSV
async function loadBidAskFootprintData(symbol: string, date: string): Promise<BidAskFootprintData[]> {
  try {
    // Try to load from by_stock CSV first
    const stockCsvPath = `../bid_ask_250919/by_stock/by_stock.csv`;
    const response = await fetch(stockCsvPath);
    
    if (!response.ok) {
      throw new Error(`Failed to load bid-ask data for ${symbol}`);
    }
    
    const text = await response.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    
    if (lines.length < 2) return [];
    
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const stockCodeIdx = header.findIndex(h => h === 'stockcode');
    const priceIdx = header.findIndex(h => h === 'price');
    const bidVolumeIdx = header.findIndex(h => h === 'bidvolume');
    const askVolumeIdx = header.findIndex(h => h === 'askvolume');
    const netVolumeIdx = header.findIndex(h => h === 'netvolume');
    const totalVolumeIdx = header.findIndex(h => h === 'totalvolume');
    const bidCountIdx = header.findIndex(h => h === 'bidcount');
    const askCountIdx = header.findIndex(h => h === 'askcount');
    
    if (stockCodeIdx === -1 || priceIdx === -1) return [];
    
    // Filter data for specific symbol
    const symbolData = lines.slice(1)
      .map(line => {
        const cols = line.split(',');
        return {
          stockCode: cols[stockCodeIdx]?.trim(),
          price: parseFloat(cols[priceIdx] || '0'),
          bidVolume: parseFloat(cols[bidVolumeIdx] || '0'),
          askVolume: parseFloat(cols[askVolumeIdx] || '0'),
          netVolume: parseFloat(cols[netVolumeIdx] || '0'),
          totalVolume: parseFloat(cols[totalVolumeIdx] || '0'),
          bidCount: parseInt(cols[bidCountIdx] || '0'),
          askCount: parseInt(cols[askCountIdx] || '0')
        };
      })
      .filter(row => row.stockCode === symbol && !isNaN(row.price));
    
    // Group by price level
    const priceLevelMap = new Map<number, typeof symbolData[0]>();
    
    symbolData.forEach(row => {
      const existing = priceLevelMap.get(row.price);
      if (existing) {
        // Aggregate volumes for same price level
        existing.bidVolume += row.bidVolume;
        existing.askVolume += row.askVolume;
        existing.netVolume += row.netVolume;
        existing.totalVolume += row.totalVolume;
        existing.bidCount += row.bidCount;
        existing.askCount += row.askCount;
      } else {
        priceLevelMap.set(row.price, { ...row });
      }
    });
    
    // Convert to footprint data format
    const priceLevels = Array.from(priceLevelMap.values())
      .sort((a, b) => b.price - a.price); // Sort by price descending
    
    // Create timestamp for the date (assuming it's 2025-09-19 based on folder name)
    const timestamp = new Date('2025-09-19').getTime() / 1000;
    
    return [{
      time: timestamp,
      priceLevels: priceLevels.map(level => ({
        price: level.price,
        bidVolume: level.bidVolume,
        askVolume: level.askVolume,
        netVolume: level.netVolume,
        totalVolume: level.totalVolume,
        bidCount: level.bidCount,
        askCount: level.askCount
      }))
    }];
    
  } catch (error) {
    console.error('Error loading bid-ask footprint data:', error);
    return [];
  }
}

// Generate mock footprint data for demonstration
function generateFootprintData(ohlcData: OhlcRow[]): FootprintData[] {
  console.log('generateFootprintData called with', ohlcData.length, 'rows');
  const result: FootprintData[] = [];

  // Limit to the last 30 timestamps/candles to keep the footprint clean
  const limitedData = ohlcData.slice(-30);
  console.log('Limited data (last 14 candles):', limitedData.length, 'rows');
  
  for (const candle of limitedData) {
    const priceLevels: FootprintData['priceLevels'] = [];
    
    // Create price levels with smaller steps for better visualization
    const priceRange = candle.high - candle.low;
    const priceStep = Math.max(0.1, priceRange / 12); // 12 price levels max for performance
    const numLevels = Math.min(12, Math.max(6, Math.floor(priceRange / priceStep)));
    
    // Generate price levels
    for (let i = 0; i < numLevels; i++) {
      const price = candle.low + (i * priceStep);
      
      // Generate more realistic volume distribution
      const baseVolume = (candle.volume || 1000000) / numLevels;
      const pricePosition = (price - candle.low) / (candle.high - candle.low);
      
      // Higher volume at open/close prices and middle range
      let volumeMultiplier = 1;
      if (Math.abs(price - candle.open) < priceStep * 2) volumeMultiplier = 2.5;
      else if (Math.abs(price - candle.close) < priceStep * 2) volumeMultiplier = 2.5;
      else if (pricePosition > 0.3 && pricePosition < 0.7) volumeMultiplier = 1.5;
      
      // Generate bid/ask volumes with some correlation
      const randomFactor = 0.4 + Math.random() * 0.6;
      const bidVolume = Math.floor(baseVolume * volumeMultiplier * randomFactor);
      const askVolume = Math.floor(baseVolume * volumeMultiplier * (0.3 + Math.random() * 0.7));
      
      priceLevels.push({
        price: Math.round(price * 100) / 100,
        bidVolume,
        askVolume,
        delta: askVolume - bidVolume
      });
    }
    
    result.push({
      time: candle.time,
      priceLevels: priceLevels.sort((a, b) => b.price - a.price) // Sort by price descending
    });
  }

  console.log('Generated footprint data:', result.length, 'items');
  return result;
}

/* ============================================================================
   4) AGGREGATION FUNCTIONS
============================================================================ */
function aggregateByWeek(rows: OhlcRow[]): OhlcRow[] {
  const weeklyData: OhlcRow[] = [];
  const weekGroups: { [key: string]: OhlcRow[] } = {};
  
  rows.forEach(row => {
    const date = new Date(row.time * 1000);
    const year = date.getFullYear();
    const weekNumber = getWeekNumber(date);
    const weekKey = `${year}-W${weekNumber}`;
    
    if (!weekGroups[weekKey]) {
      weekGroups[weekKey] = [];
    }
    weekGroups[weekKey].push(row);
  });
  
  Object.values(weekGroups).forEach(weekRows => {
    if (weekRows.length === 0) return;
    
    const sortedWeek = weekRows.sort((a, b) => a.time - b.time);
    const first = sortedWeek[0];
    const last = sortedWeek[sortedWeek.length - 1];
    
    weeklyData.push({
      time: first.time,
      open: first.open,
      high: Math.max(...sortedWeek.map(r => r.high)),
      low: Math.min(...sortedWeek.map(r => r.low)),
      close: last.close,
      volume: sortedWeek.reduce((sum, r) => sum + (r.volume || 0), 0)
    });
  });
  
  return weeklyData.sort((a, b) => a.time - b.time);
}

function aggregateByMonth(rows: OhlcRow[]): OhlcRow[] {
  const monthlyData: OhlcRow[] = [];
  const monthGroups: { [key: string]: OhlcRow[] } = {};
  
  rows.forEach(row => {
    const date = new Date(row.time * 1000);
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    
    if (!monthGroups[monthKey]) {
      monthGroups[monthKey] = [];
    }
    monthGroups[monthKey].push(row);
  });
  
  Object.values(monthGroups).forEach(monthRows => {
    if (monthRows.length === 0) return;
    
    const sortedMonth = monthRows.sort((a, b) => a.time - b.time);
    const first = sortedMonth[0];
    const last = sortedMonth[sortedMonth.length - 1];
    
    monthlyData.push({
      time: first.time,
      open: first.open,
      high: Math.max(...sortedMonth.map(r => r.high)),
      low: Math.min(...sortedMonth.map(r => r.low)),
      close: last.close,
      volume: sortedMonth.reduce((sum, r) => sum + (r.volume || 0), 0)
    });
  });
  
  return monthlyData.sort((a, b) => a.time - b.time);
}

function aggregateByQuarter(rows: OhlcRow[]): OhlcRow[] {
  const quarterlyData: OhlcRow[] = [];
  const quarterGroups: { [key: string]: OhlcRow[] } = {};
  
  rows.forEach(row => {
    const date = new Date(row.time * 1000);
    const quarter = Math.floor((date.getMonth() + 1) / 3);
    const quarterKey = `${date.getFullYear()}-Q${quarter}`;
    
    if (!quarterGroups[quarterKey]) {
      quarterGroups[quarterKey] = [];
    }
    quarterGroups[quarterKey].push(row);
  });
  
  Object.values(quarterGroups).forEach(quarterRows => {
    if (quarterRows.length === 0) return;
    
    const sortedQuarter = quarterRows.sort((a, b) => a.time - b.time);
    const first = sortedQuarter[0];
    const last = sortedQuarter[sortedQuarter.length - 1];
    
    quarterlyData.push({
      time: first.time,
      open: first.open,
      high: Math.max(...sortedQuarter.map(r => r.high)),
      low: Math.min(...sortedQuarter.map(r => r.low)),
      close: last.close,
      volume: sortedQuarter.reduce((sum, r) => sum + (r.volume || 0), 0)
    });
  });
  
  return quarterlyData.sort((a, b) => a.time - b.time);
}

function aggregateByHalfYear(rows: OhlcRow[]): OhlcRow[] {
  const halfYearData: OhlcRow[] = [];
  const halfYearGroups: { [key: string]: OhlcRow[] } = {};
  
  rows.forEach(row => {
    const date = new Date(row.time * 1000);
    const halfYear = Math.floor((date.getMonth() + 1) / 6) + 1;
    const halfYearKey = `${date.getFullYear()}-H${halfYear}`;
    
    if (!halfYearGroups[halfYearKey]) {
      halfYearGroups[halfYearKey] = [];
    }
    halfYearGroups[halfYearKey].push(row);
  });
  
  Object.values(halfYearGroups).forEach(halfYearRows => {
    if (halfYearRows.length === 0) return;
    
    const sortedHalfYear = halfYearRows.sort((a, b) => a.time - b.time);
    const first = sortedHalfYear[0];
    const last = sortedHalfYear[sortedHalfYear.length - 1];
    
    halfYearData.push({
      time: first.time,
      open: first.open,
      high: Math.max(...sortedHalfYear.map(r => r.high)),
      low: Math.min(...sortedHalfYear.map(r => r.low)),
      close: last.close,
      volume: sortedHalfYear.reduce((sum, r) => sum + (r.volume || 0), 0)
    });
  });
  
  return halfYearData.sort((a, b) => a.time - b.time);
}

function aggregateByYear(rows: OhlcRow[]): OhlcRow[] {
  const yearlyData: OhlcRow[] = [];
  const yearGroups: { [key: string]: OhlcRow[] } = {};
  
  rows.forEach(row => {
    const date = new Date(row.time * 1000);
    const yearKey = date.getFullYear().toString();
    
    if (!yearGroups[yearKey]) {
      yearGroups[yearKey] = [];
    }
    yearGroups[yearKey].push(row);
  });
  
  Object.values(yearGroups).forEach(yearRows => {
    if (yearRows.length === 0) return;
    
    const sortedYear = yearRows.sort((a, b) => a.time - b.time);
    const first = sortedYear[0];
    const last = sortedYear[sortedYear.length - 1];
    
    yearlyData.push({
      time: first.time,
      open: first.open,
      high: Math.max(...sortedYear.map(r => r.high)),
      low: Math.min(...sortedYear.map(r => r.low)),
      close: last.close,
      volume: sortedYear.reduce((sum, r) => sum + (r.volume || 0), 0)
    });
  });
  
  return yearlyData.sort((a, b) => a.time - b.time);
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function aggregateByMinute(rows: OhlcRow[], minutes: number): OhlcRow[] {
  const minuteData: OhlcRow[] = [];
  const minuteGroups: { [key: string]: OhlcRow[] } = {};
  
  rows.forEach(row => {
    const date = new Date(row.time * 1000);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Fix: getMonth() returns 0-11, we need 1-12
    const day = date.getDate();
    const hour = date.getHours();
    const minute = Math.floor(date.getMinutes() / minutes) * minutes;
    
    const minuteKey = `${year}-${month}-${day}-${hour}-${minute}`;
    
    if (!minuteGroups[minuteKey]) {
      minuteGroups[minuteKey] = [];
    }
    minuteGroups[minuteKey].push(row);
  });
  
  Object.values(minuteGroups).forEach(minuteRows => {
    if (minuteRows.length === 0) return;
    
    const sortedMinute = minuteRows.sort((a, b) => a.time - b.time);
    const first = sortedMinute[0];
    const last = sortedMinute[sortedMinute.length - 1];
    
    minuteData.push({
      time: first.time,
      open: first.open,
      high: Math.max(...sortedMinute.map(r => r.high)),
      low: Math.min(...sortedMinute.map(r => r.low)),
      close: last.close,
      volume: sortedMinute.reduce((sum, r) => sum + (r.volume || 0), 0)
    });
  });
  
  return minuteData.sort((a, b) => a.time - b.time);
}

function aggregateByHour(rows: OhlcRow[]): OhlcRow[] {
  const hourlyData: OhlcRow[] = [];
  const hourGroups: { [key: string]: OhlcRow[] } = {};
  
  rows.forEach(row => {
    const date = new Date(row.time * 1000);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Fix: getMonth() returns 0-11, we need 1-12
    const day = date.getDate();
    const hour = date.getHours();
    
    const hourKey = `${year}-${month}-${day}-${hour}`;
    
    if (!hourGroups[hourKey]) {
      hourGroups[hourKey] = [];
    }
    hourGroups[hourKey].push(row);
  });
  
  Object.values(hourGroups).forEach(hourRows => {
    if (hourRows.length === 0) return;
    
    const sortedHour = hourRows.sort((a, b) => a.time - b.time);
    const first = sortedHour[0];
    const last = sortedHour[sortedHour.length - 1];
    
    hourlyData.push({
      time: first.time,
      open: first.open,
      high: Math.max(...sortedHour.map(r => r.high)),
      low: Math.min(...sortedHour.map(r => r.low)),
      close: last.close,
      volume: sortedHour.reduce((sum, r) => sum + (r.volume || 0), 0)
    });
  });
  
  return hourlyData.sort((a, b) => a.time - b.time);
}

function aggregateByTradingDay(rows: OhlcRow[]): OhlcRow[] {
  const tradingDayData: OhlcRow[] = [];
  const tradingDayGroups: { [key: string]: OhlcRow[] } = {};
  
  rows.forEach(row => {
    const date = new Date(row.time * 1000);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Fix: getMonth() returns 0-11, we need 1-12
    const day = date.getDate();
    const hour = date.getHours();
    
    // Determine trading day: if hour < 7, it belongs to previous day's trading session
    let tradingDay = `${year}-${month}-${day}`;
    if (hour < 7) {
      // This is part of previous day's trading session (overnight)
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      tradingDay = `${prevDate.getFullYear()}-${prevDate.getMonth() + 1}-${prevDate.getDate()}`;
    }
    
    if (!tradingDayGroups[tradingDay]) {
      tradingDayGroups[tradingDay] = [];
    }
    tradingDayGroups[tradingDay].push(row);
  });
  
  Object.values(tradingDayGroups).forEach(tradingDayRows => {
    if (tradingDayRows.length === 0) return;
    
    const sortedTradingDay = tradingDayRows.sort((a, b) => a.time - b.time);
    const first = sortedTradingDay[0];
    const last = sortedTradingDay[sortedTradingDay.length - 1];
    
    tradingDayData.push({
      time: first.time,
      open: first.open,
      high: Math.max(...sortedTradingDay.map(r => r.high)),
      low: Math.min(...sortedTradingDay.map(r => r.low)),
      close: last.close,
      volume: sortedTradingDay.reduce((sum, r) => sum + (r.volume || 0), 0)
    });
  });
  
  return tradingDayData.sort((a, b) => a.time - b.time);
}

/* ============================================================================
   4) KOMPONEN UTAMA
============================================================================ */
export function TechnicalAnalysisTradingView({ hideControls = false, selectedSymbol }: { hideControls?: boolean; selectedSymbol?: string } = {}) {
  const [symbol, setSymbol] = useState<string>(selectedSymbol || 'BBCA');
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [style, setStyle] = useState<ChartStyle>('candles');
  const [rows, setRows] = useState<OhlcRow[]>([]);
  const [src, setSrc] = useState<'file' | 'mock' | 'none'>('none');
  const [plotted, setPlotted] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [chartColors, setChartColors] = useState(() => {
    const cached = chartPreferencesService.getCachedColors();
    return {
      line: '#2563eb',
      candles: {
        up: cached?.bullish ?? '#16a34a',
        down: cached?.bearish ?? '#dc2626',
        wickUp: cached?.bullish ?? '#16a34a',
        wickDown: cached?.bearish ?? '#dc2626'
      },
      area: { line: '#2563eb', top: 'rgba(37,99,235,0.20)', bottom: 'rgba(37,99,235,0.05)' }
    };
  });
  const [indicatorChartHeight, setIndicatorChartHeight] = useState(100);
  const [rsiSettings, setRsiSettings] = useState({
    overbought: 70,
    oversold: 30,
    showOverbought: true,
    showOversold: true
  });
  const [volumeHistogramSettings, setVolumeHistogramSettings] = useState({
    upColor: 'rgba(22,163,74,0.6)',
    downColor: 'rgba(220,38,38,0.6)',
    showUpColor: true,
    showDownColor: true
  });
  const [showSettings, setShowSettings] = useState(false);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [showIndicatorSettings, setShowIndicatorSettings] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<Indicator | null>(null);
  const [showIndicatorEditor, setShowIndicatorEditor] = useState(false);

  // Update symbol when selectedSymbol prop changes
  useEffect(() => {
    if (selectedSymbol && selectedSymbol !== symbol) {
      setSymbol(selectedSymbol);
    }
  }, [selectedSymbol, symbol]);
  const [showIndividualSettings, setShowIndividualSettings] = useState(false);
  const [selectedIndicatorForSettings, setSelectedIndicatorForSettings] = useState<Indicator | null>(null);
  const [bidAskFootprintData, setBidAskFootprintData] = useState<BidAskFootprintData[]>([]);

  // Load saved colors from localStorage
  useEffect(() => {
    const savedColors = localStorage.getItem('chartColors');
    if (savedColors) {
      try {
        const parsed = JSON.parse(savedColors);
        setChartColors((prev) => ({
          ...prev,
          line: parsed.line ?? prev.line,
          candles: {
            up: parsed.candles?.up ?? prev.candles.up,
            down: parsed.candles?.down ?? prev.candles.down,
            wickUp: parsed.candles?.wickUp ?? prev.candles.wickUp,
            wickDown: parsed.candles?.wickDown ?? prev.candles.wickDown,
          },
          area: parsed.area ?? prev.area,
        }));
      } catch (e) {
        console.log('Failed to load saved colors, using defaults');
      }
    }
    
    const savedHeight = localStorage.getItem('indicatorChartHeight');
    if (savedHeight) {
      try {
        setIndicatorChartHeight(parseInt(savedHeight));
      } catch (e) {
        console.log('Failed to load saved chart height, using defaults');
      }
    }
    
    const savedRsiSettings = localStorage.getItem('rsiSettings');
    if (savedRsiSettings) {
      try {
        setRsiSettings(JSON.parse(savedRsiSettings));
      } catch (e) {
        console.log('Failed to load saved RSI settings, using defaults');
      }
    }
    
    const savedVolumeHistogramSettings = localStorage.getItem('volumeHistogramSettings');
    if (savedVolumeHistogramSettings) {
      try {
        setVolumeHistogramSettings(JSON.parse(savedVolumeHistogramSettings));
      } catch (e) {
        console.log('Failed to load saved volume histogram settings, using defaults');
      }
    }
    
  }, []);

  // Save colors to localStorage when they change
  useEffect(() => {
    localStorage.setItem('chartColors', JSON.stringify(chartColors));
  }, [chartColors]);

  // Save chart height to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('indicatorChartHeight', indicatorChartHeight.toString());
  }, [indicatorChartHeight]);

  // Save RSI settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('rsiSettings', JSON.stringify(rsiSettings));
  }, [rsiSettings]);

  // Save volume histogram settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('volumeHistogramSettings', JSON.stringify(volumeHistogramSettings));
  }, [volumeHistogramSettings]);

  // Load user chart colors (bullish/bearish) from Supabase once
  useEffect(() => {
    (async () => {
      try {
        const userColors = await chartPreferencesService.loadColors();
        if (userColors) {
          setChartColors((prev) => ({
            ...prev,
            candles: {
              ...prev.candles,
              up: userColors.bullish,
              wickUp: userColors.bullish,
              down: userColors.bearish,
              wickDown: userColors.bearish,
            },
          }));
          // Force re-render of chart series to apply new colors immediately
          try {
            if (chartRef.current && priceRef.current) {
              const series = priceRef.current;
              const options = {
                upColor: userColors.bullish,
                downColor: userColors.bearish,
                wickUpColor: userColors.bullish,
                wickDownColor: userColors.bearish,
              } as any;
              if (series.applyOptions) series.applyOptions(options);
            }
          } catch (_) {}
        }
      } catch (e) {
        console.log('Failed to load user chart colors from Supabase:', e);
      }
    })();
  }, []);


  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<any | null>(null);
  const volRef = useRef<any | null>(null);
  const indicatorRefs = useRef<{ [key: string]: any }>({});
  
  // Separate chart refs for indicators
  const indicatorChartRefs = useRef<{ [key: string]: IChartApi }>({});
  const indicatorContainerRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Indicator management functions
  const addIndicator = (type: Indicator['type'], color: string, separateScale: boolean = false) => {
    // Default periods for each indicator type
    const defaultPeriods = {
      'sma': 20,
      'ema': 12,
      'rsi': 14,
      'macd': 12,
      'volume_histogram': 1
    };
    
    const newIndicator: Indicator = {
      id: `${type}_${Date.now()}`,
      name: `${type.toUpperCase()}`,
      type,
      period: defaultPeriods[type],
      color,
      enabled: true,
      separateScale
    };
    setIndicators(prev => [...prev, newIndicator]);
  };

  const removeIndicator = (id: string) => {
    setIndicators(prev => prev.filter(ind => ind.id !== id));
    
    // Remove from main chart
    if (indicatorRefs.current[id] && chartRef.current) {
      chartRef.current.removeSeries(indicatorRefs.current[id]);
      delete indicatorRefs.current[id];
    }

    // Remove separate chart if exists
    if (indicatorChartRefs.current[id]) {
      const chart = indicatorChartRefs.current[id];

      // Cleanup time scale subscription
      if ((chart as any)._timeScaleUnsubscribe) {
        (chart as any)._timeScaleUnsubscribe();
      }

      chart.remove();
      delete indicatorChartRefs.current[id];
    }

    // Clear container ref
    delete indicatorContainerRefs.current[id];
  };

  // Function to remove indicator from main chart when moved to separate chart
  const removeFromMainChart = (id: string) => {
    if (indicatorRefs.current[id] && chartRef.current) {
      chartRef.current.removeSeries(indicatorRefs.current[id]);
      delete indicatorRefs.current[id];
    }
  };

  const toggleIndicator = (id: string) => {
    const indicator = indicators.find(ind => ind.id === id);
    if (!indicator) return;
    
    const newEnabled = !indicator.enabled;
    
    if (!newEnabled) {
      // Remove from main chart when disabled
      if (indicatorRefs.current[id] && chartRef.current) {
        chartRef.current.removeSeries(indicatorRefs.current[id]);
        delete indicatorRefs.current[id];
      }
      
      // Remove separate chart when disabled
      if (indicatorChartRefs.current[id]) {
        const chart = indicatorChartRefs.current[id];
        if ((chart as any)._timeScaleUnsubscribe) {
          (chart as any)._timeScaleUnsubscribe();
        }
        chart.remove();
        delete indicatorChartRefs.current[id];
      }
    }
    
    setIndicators(prev => prev.map(ind => 
      ind.id === id ? { ...ind, enabled: newEnabled } : ind
    ));
  };

  const editIndicator = (indicator: Indicator) => {
    setEditingIndicator(indicator);
    setShowIndicatorEditor(true);
  };

  const updateIndicator = (updatedIndicator: Indicator) => {
    // Check if indicator is being moved from main chart to separate chart
    const currentIndicator = indicators.find(ind => ind.id === updatedIndicator.id);
    if (currentIndicator && !currentIndicator.separateScale && updatedIndicator.separateScale) {
      // Remove from main chart when moving to separate chart
      removeFromMainChart(updatedIndicator.id);
    }
    
    setIndicators(prev => prev.map(ind => 
      ind.id === updatedIndicator.id ? updatedIndicator : ind
    ));
    setShowIndicatorEditor(false);
    setEditingIndicator(null);
  };

  // Function to sync time scale with all indicator charts
  const syncTimeScaleWithIndicators = () => {
    if (!chartRef.current) return;
    
    const mainTimeScale = chartRef.current.timeScale();
    const visibleRange = mainTimeScale.getVisibleRange();
    
    if (visibleRange) {
      Object.values(indicatorChartRefs.current).forEach(indicatorChart => {
        if (indicatorChart && (indicatorChart as any).timeScale) {
          (indicatorChart as any).timeScale().setVisibleRange(visibleRange);
        }
      });
    }
  };

  // Get theme-aware colors
  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280'
    };
  };

  const symbols = useMemo(() => (AVAILABLE_SYMBOLS.length ? AVAILABLE_SYMBOLS : ['MOCK']), []);
  
  // Filter symbols based on search query
  const filteredSymbols = useMemo(() => {
    if (!searchQuery.trim()) return symbols.slice(0, 10); // Show first 10 if no search
    return symbols
      .filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 10); // Limit to 10 results
  }, [symbols, searchQuery]);

  // Initialize search query with default symbol only once
  useEffect(() => {
    if (symbol && !searchQuery) {
      setSearchQuery(symbol);
    }
  }, [symbol]); // Remove searchQuery from dependencies

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredSymbols.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredSymbols.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredSymbols.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredSymbols.length) {
          const selectedSymbol = filteredSymbols[selectedIndex];
          setSymbol(selectedSymbol);
          setSearchQuery(selectedSymbol);
          setShowSuggestions(false);
          setSelectedIndex(-1);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Load CSV ketika symbol berubah
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        setPlotted(0);

        if (symbol === 'MOCK' || !AVAILABLE_SYMBOLS.length) {
          // fallback mock jika tak ada CSV
          const now = Date.now();
          const mock: OhlcRow[] = Array.from({ length: 120 }).map((_, i) => {
            const base = 4500 + Math.sin(i * 0.15) * 60 + Math.random() * 20;
            const open = base + (Math.random() - 0.5) * 20;
            const close = base + (Math.random() - 0.5) * 20;
            const high = Math.max(open, close) + Math.random() * 25;
            const low = Math.min(open, close) - Math.random() * 25;
            const t = Math.floor((now - (119 - i) * 86400000) / 1000);
            return {
              time: t,
              open: Math.round(open),
              high: Math.round(high),
              low: Math.round(low),
              close: Math.round(close),
              volume: Math.floor(1_000_000 + Math.random() * 9_000_000),
            };
          });
          if (!cancelled) {
            setRows(mock);
            setSrc('mock');
          }
          return;
        }

        // Find CSV file that matches the symbol (handle various filename patterns)
        const path = Object.keys(csvFiles).find((p) => {
          const filename = p.split('/').pop()!.replace(/\.csv$/i, '');
          const patterns = [
            /^IDX_DLY_(.+?),\s*\d+D$/,  // IDX_DLY_BBRI, 1D
            /^IDX_DLY_(.+?),\s*\d+D\s*\(\d+\)$/,  // IDX_DLY_BBRI, 1D (1)
            /^(.+?),\s*\d+D$/,  // BBRI, 1D
            /^(.+?),\s*\d+D\s*\(\d+\)$/,  // BBRI, 1D (1)
            /^IDX_DLY_(.+?)_\d+D$/,  // IDX_DLY_BBRI_1D (fallback)
            /^IDX_DLY_(.+?)_\d+D\s*\(\d+\)$/,  // IDX_DLY_BBRI_1D (1) (fallback)
            /^(.+?)_\d+D$/,  // BBRI_1D (fallback)
            /^(.+?)_\d+D\s*\(\d+\)$/,  // BBRI_1D (1) (fallback)
          ];
          
          for (const pattern of patterns) {
            const match = filename.match(pattern);
            if (match && match[1] === symbol) return true;
          }
          
          // Direct match
          return filename === symbol;
        });
        
        if (!path) throw new Error(`CSV untuk ${symbol} tidak ditemukan di src/data`);
        const url = csvFiles[path];

        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Gagal fetch CSV ${symbol}`);

        const text = await res.text();
        console.log(`Loading CSV for ${symbol}:`, text.substring(0, 200) + '...');
        const parsed = parseCsv(text);
        console.log(`Parsed ${parsed.length} rows for ${symbol}`);
        if (!parsed.length) throw new Error(`CSV ${symbol} tidak berisi data OHLC valid`);

        if (!cancelled) {
          setRows(parsed);
          setSrc('file');
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message ?? 'CSV load error');
          setRows([]);
          setSrc('none');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [symbol]);

  // Load bid-ask footprint data when symbol changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const footprintData = await loadBidAskFootprintData(symbol, '2025-09-19');
        if (!cancelled) {
          setBidAskFootprintData(footprintData);
        }
      } catch (error) {
        console.error('Error loading bid-ask footprint data:', error);
        if (!cancelled) {
          setBidAskFootprintData([]);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [symbol]);

  // Detect data frequency and available timeframes
  const dataFrequency = useMemo(() => {
    if (!rows.length) return 'unknown';
    
    const sortedRows = [...rows].sort((a, b) => a.time - b.time);
    if (sortedRows.length < 2) return 'unknown';
    
    // Calculate time differences between consecutive data points
    const timeDiffs: number[] = [];
    for (let i = 1; i < Math.min(sortedRows.length, 10); i++) {
      const diff = sortedRows[i].time - sortedRows[i-1].time;
      timeDiffs.push(diff);
    }
    
    const avgDiff = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;
    const avgDiffMinutes = avgDiff / 60;
    
    console.log('Data frequency analysis:', {
      avgDiffSeconds: avgDiff,
      avgDiffMinutes: avgDiffMinutes,
      timeDiffs: timeDiffs.slice(0, 5)
    });
    
    if (avgDiffMinutes <= 1) return '1min';
    if (avgDiffMinutes <= 5) return '5min';
    if (avgDiffMinutes <= 15) return '15min';
    if (avgDiffMinutes <= 30) return '30min';
    if (avgDiffMinutes <= 60) return '1hour';
    if (avgDiffMinutes <= 1440) return '1day';
    return 'unknown';
  }, [rows]);

  // Get available timeframes based on data frequency
  const availableTimeframes = useMemo(() => {
    const allTimeframes: { value: Timeframe; label: string; minFreq: string }[] = [
      { value: '1M', label: '1 Minute', minFreq: '1min' },
      { value: '5M', label: '5 Minutes', minFreq: '5min' },
      { value: '15M', label: '15 Minutes', minFreq: '15min' },
      { value: '30M', label: '30 Minutes', minFreq: '30min' },
      { value: '1H', label: '1 Hour', minFreq: '1hour' },
      { value: '1D', label: '1 Day', minFreq: '1day' },
      { value: '1W', label: '1 Week', minFreq: '1day' },
      { value: '1MO', label: '1 Month', minFreq: '1day' },
      { value: '3M', label: '3 Months', minFreq: '1day' },
      { value: '6M', label: '6 Months', minFreq: '1day' },
      { value: '1Y', label: '1 Year', minFreq: '1day' }
    ];
    
    const freqOrder = ['1min', '5min', '15min', '30min', '1hour', '1day', 'unknown'];
    const dataFreqIndex = freqOrder.indexOf(dataFrequency);
    
    return allTimeframes.filter(tf => {
      const tfFreqIndex = freqOrder.indexOf(tf.minFreq);
      return tfFreqIndex <= dataFreqIndex;
    });
  }, [dataFrequency]);

  // Auto-select appropriate timeframe when data changes
  useEffect(() => {
    if (availableTimeframes.length > 0) {
      const currentTimeframe = availableTimeframes.find(tf => tf.value === timeframe);
      if (!currentTimeframe) {
        // Current timeframe is not available, select the first available one
        setTimeframe(availableTimeframes[0].value);
      }
    }
  }, [availableTimeframes, timeframe]);

  // Aggregate data based on timeframe
  const filteredRows = useMemo(() => {
    if (!rows.length) return rows;
    
    // Sort rows by time
    const sortedRows = [...rows].sort((a, b) => a.time - b.time);
    
    console.log('Aggregating data for timeframe:', timeframe, 'Total rows:', rows.length);
    
    // Handle minute-based timeframes
    if (timeframe === '1M') {
      // 1 minute - no aggregation needed
      return sortedRows;
    }
    
    if (timeframe === '5M') {
      // Group by 5-minute intervals
      return aggregateByMinute(sortedRows, 5);
    }
    
    if (timeframe === '15M') {
      // Group by 15-minute intervals
      return aggregateByMinute(sortedRows, 15);
    }
    
    if (timeframe === '30M') {
      // Group by 30-minute intervals
      return aggregateByMinute(sortedRows, 30);
    }
    
    if (timeframe === '1H') {
      // Group by hour
      return aggregateByHour(sortedRows);
    }
    
    if (timeframe === '1D') {
      // For 1D, group by trading day (7 AM to 1 AM next day)
      return aggregateByTradingDay(sortedRows);
    }
    
    if (timeframe === '1W') {
      // Group by week (Monday to Friday = 1 bar)
      return aggregateByWeek(sortedRows);
    }
    
    if (timeframe === '1MO') {
      // Group by month (each month = 1 bar)
      return aggregateByMonth(sortedRows);
    }
    
    if (timeframe === '3M') {
      // Group by quarter (every 3 months = 1 bar)
      return aggregateByQuarter(sortedRows);
    }
    
    if (timeframe === '6M') {
      // Group by half-year (every 6 months = 1 bar)
      return aggregateByHalfYear(sortedRows);
    }
    
    if (timeframe === '1Y') {
      // Group by year (every year = 1 bar)
      return aggregateByYear(sortedRows);
    }
    
    return sortedRows;
  }, [rows, timeframe]);

  // Build / Update chart saat data/gaya berubah
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // init chart atau update existing chart
    if (!chartRef.current) {
      const width = el.clientWidth || 800;
      const height = el.clientHeight || 420;
      const colors = getThemeColors();
      console.log(`Creating chart with dimensions: ${width}x${height}`);
      chartRef.current = createChart(el, {
        width,
        height,
        layout: { 
          background: { type: ColorType.Solid, color: 'transparent' }, 
          textColor: colors.axisTextColor
        },
        grid: { 
          horzLines: { color: colors.gridColor, style: 1 }, 
          vertLines: { color: colors.gridColor, style: 1 } 
        },
        rightPriceScale: { 
          borderColor: colors.borderColor
        },
        timeScale: { 
          borderColor: colors.borderColor,
          visible: !indicators.some(ind => ind.enabled && ind.separateScale)
        },
        crosshair: { mode: CrosshairMode.Normal },
      });
    }

    const chart = chartRef.current!;
    
    // Update timeScale visibility based on indicators
    const hasVisibleSeparateCharts = indicators.some(ind => ind.enabled && ind.separateScale);
    chart.timeScale().applyOptions({
      visible: !hasVisibleSeparateCharts
    });
    
    
    // Add time scale change listener for synchronization (only once)
    if (!(chart as any)._timeScaleListenerAdded) {
      const timeScale = chart.timeScale();
      const unsubscribeTimeScale = timeScale.subscribeVisibleTimeRangeChange((timeRange) => {
        if (timeRange) {
          // Sync with all indicator charts
          Object.values(indicatorChartRefs.current).forEach(indicatorChart => {
            if (indicatorChart && (indicatorChart as any).timeScale) {
              (indicatorChart as any).timeScale().setVisibleRange(timeRange);
            }
          });
        }
      });
      
      // Sync crosshair from main chart to indicator charts
      const unsubscribeCrosshair = chart.subscribeCrosshairMove((param) => {
        if (param && param.time) {
          console.log('Main chart crosshair move:', {
            time: param.time,
            logical: param.logical,
            seriesData: param.seriesData,
            indicatorCharts: Object.keys(indicatorChartRefs.current).length
          });
          
          // Sync with all indicator charts using direct crosshair positioning
          Object.values(indicatorChartRefs.current).forEach((indicatorChart, index) => {
            if (indicatorChart) {
              try {
                console.log(`Syncing to indicator chart ${index}:`, param.logical);
                
                // Try both time and logical positioning
                if ((indicatorChart as any).setCrosshairPosition) {
                  try {
                    (indicatorChart as any).setCrosshairPosition(param.time, param.seriesData || {});
                  } catch (timeError) {
                    console.log('Time positioning failed, trying logical:', timeError);
                    try {
                      (indicatorChart as any).setCrosshairPosition(param.logical, param.seriesData || {});
                    } catch (logicalError) {
                      console.log('Logical positioning also failed:', logicalError);
                    }
                  }
                }
              } catch (error) {
                console.log('Error syncing crosshair to indicator chart:', error);
              }
            }
          });
        }
      });
      
      // Store unsubscribe functions
      (chart as any)._timeScaleUnsubscribe = unsubscribeTimeScale;
      (chart as any)._crosshairUnsubscribe = unsubscribeCrosshair;
      (chart as any)._timeScaleListenerAdded = true;
    }

    // bersihkan seri lama
    if (priceRef.current) { chart.removeSeries(priceRef.current); priceRef.current = null; }
    if (volRef.current) { chart.removeSeries(volRef.current); volRef.current = null; }

    if (!filteredRows.length) { 
      console.log('No rows to plot');
      setPlotted(0); 
      return; 
    }

    console.log(`Rendering chart with ${filteredRows.length} rows, style: ${style}`);
    try {
      // --- price series (v5 pakai addSeries(TipeSeri, opsi)) ---
      if (style === 'line') {
        const s = chart.addSeries(LineSeries, { 
          color: chartColors.line, 
          lineWidth: 2 
        });
        s.setData(filteredRows.map(d => ({ time: d.time as any, value: d.close })));
        priceRef.current = s;
      } else if (style === 'area') {
        const s = chart.addSeries(AreaSeries, {
          lineColor: chartColors.area.line,
          topColor: chartColors.area.top,
          bottomColor: chartColors.area.bottom,
        });
        s.setData(filteredRows.map(d => ({ time: d.time as any, value: d.close })));
        priceRef.current = s;
      } else if (style === 'footprint') {
        // For footprint chart, we'll use a custom series that replaces candles
        // We'll create a simple line series as base and render footprint data on top
        const s = chart.addSeries(LineSeries, {
          color: '#666666',
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        
        // Set minimal line data for chart structure
        const lineData = filteredRows.map(d => ({
          time: d.time,
          value: (d.open + d.close) / 2, // Use mid price
        }));
        s.setData(lineData.map(d => ({ time: d.time as any, value: d.value })));
        priceRef.current = s;

        // Store footprint data for custom rendering
        const footprintData = generateFootprintData(filteredRows);
        (chart as any)._footprintData = footprintData;
      } else {
        const s = chart.addSeries(CandlestickSeries, {
          upColor: chartColors.candles.up,
          downColor: chartColors.candles.down,
          borderVisible: false,
          wickUpColor: chartColors.candles.wickUp,
          wickDownColor: chartColors.candles.wickDown,
        });
        s.setData(filteredRows.map(d => ({
          time: d.time as any,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })));
        priceRef.current = s;
      }

      // Volume histogram removed - now handled as separate indicator

      // --- indicators ---
      indicators.forEach(indicator => {
        // Remove existing series if indicator is disabled
        if (!indicator.enabled) {
          if (indicatorRefs.current[indicator.id] && chartRef.current) {
            chartRef.current.removeSeries(indicatorRefs.current[indicator.id]);
            delete indicatorRefs.current[indicator.id];
          }
          return;
        }
        
        // Skip separate scale indicators for main chart
        if (indicator.separateScale) return;
        
        let indicatorData: IndicatorData[] = [];
        
        switch (indicator.type) {
          case 'sma':
            indicatorData = calculateSMA(filteredRows, indicator.period);
            break;
          case 'ema':
            indicatorData = calculateEMA(filteredRows, indicator.period);
            break;
          case 'rsi':
            indicatorData = calculateRSI(filteredRows, indicator.period);
            break;
          case 'macd':
            indicatorData = calculateMACD(filteredRows, 12, 26, 9);
            break;
          case 'volume_histogram':
            indicatorData = calculateVolumeHistogram(filteredRows);
            break;
        }
        
        if (indicatorData.length > 0) {
          // Remove existing series if it exists
          if (indicatorRefs.current[indicator.id] && chartRef.current) {
            chartRef.current.removeSeries(indicatorRefs.current[indicator.id]);
          }
          
          // Add to main chart
          let indicatorSeries;
          if (indicator.type === 'volume_histogram') {
            // Use HistogramSeries for volume histogram
            indicatorSeries = chart.addSeries(HistogramSeries, {
              priceFormat: { type: 'volume' },
              priceScaleId: '',
              color: indicator.color,
            });
            indicatorSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
            
            // Set data with color based on price movement
            indicatorSeries.setData(filteredRows.map(d => ({
              time: d.time,
              value: d.volume ?? 0,
              color: d.close >= d.open ? volumeHistogramSettings.upColor : volumeHistogramSettings.downColor,
            })));
          } else {
            // Use LineSeries for other indicators
            indicatorSeries = chart.addSeries(LineSeries, {
              color: indicator.color,
              lineWidth: 2,
              title: indicator.name
            });
            indicatorSeries.setData(indicatorData);
          }
          
          indicatorRefs.current[indicator.id] = indicatorSeries;
        }
      });

      chart.timeScale().fitContent();
      setPlotted(filteredRows.length);
      setErr(null);
      
      // Sync time scale with indicator charts
      syncTimeScaleWithIndicators();
    } catch (e: any) {
      setErr(e?.message ?? 'render error');
      setPlotted(0);
    }
  }, [filteredRows, style, chartColors, indicators, volumeHistogramSettings]);

  // Create separate charts for indicators
  useEffect(() => {
    const enabledSeparateIndicators = indicators.filter(ind => ind.enabled && ind.separateScale);
    
    indicators.forEach((indicator) => {
      // Remove chart if indicator is disabled
      if (!indicator.enabled) {
        if (indicatorChartRefs.current[indicator.id]) {
          const chart = indicatorChartRefs.current[indicator.id];
          if ((chart as any)._timeScaleUnsubscribe) {
            (chart as any)._timeScaleUnsubscribe();
          }
          chart.remove();
          delete indicatorChartRefs.current[indicator.id];
        }
        return;
      }
      
      if (!indicator.separateScale) return;
      
      // Find index in enabled separate indicators
      const separateIndex = enabledSeparateIndicators.findIndex(ind => ind.id === indicator.id);
      
      const container = indicatorContainerRefs.current[indicator.id];
      if (!container) return;
      
      // Always remove existing chart to force recreation
      if (indicatorChartRefs.current[indicator.id]) {
        indicatorChartRefs.current[indicator.id].remove();
        delete indicatorChartRefs.current[indicator.id];
      }
      
      // Create new chart
      const colors = getThemeColors();
      const indicatorChart = createChart(container, {
        width: container.clientWidth || 400,
        height: indicatorChartHeight,
        layout: { 
          background: { type: ColorType.Solid, color: 'transparent' }, 
          textColor: colors.axisTextColor
        },
        grid: { 
          horzLines: { color: colors.gridColor, style: 1 }, 
          vertLines: { color: colors.gridColor, style: 1 } 
        },
        rightPriceScale: { 
          borderColor: colors.borderColor
        },
        timeScale: { 
          borderColor: colors.borderColor,
          visible: separateIndex === enabledSeparateIndicators.length - 1
        },
        crosshair: { mode: CrosshairMode.Normal },
      });
      
      // Calculate indicator data
      let indicatorData: IndicatorData[] = [];
      switch (indicator.type) {
        case 'rsi':
          indicatorData = calculateRSI(filteredRows, indicator.period);
          break;
        case 'macd':
          indicatorData = calculateMACD(filteredRows, 12, 26, 9);
          break;
        case 'volume_histogram':
          indicatorData = calculateVolumeHistogram(filteredRows);
          break;
      }
      
      if (indicatorData.length > 0) {
        // Add indicator series
        let indicatorSeries;
        if (indicator.type === 'volume_histogram') {
          // Use HistogramSeries for volume histogram
          indicatorSeries = indicatorChart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: '',
            color: indicator.color,
          });
          indicatorSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
          
          // Set data with color based on price movement
          indicatorSeries.setData(filteredRows.map(d => ({
            time: d.time,
            value: d.volume ?? 0,
            color: d.close >= d.open ? volumeHistogramSettings.upColor : volumeHistogramSettings.downColor,
          })));
        } else {
          // Use LineSeries for other indicators
          indicatorSeries = indicatorChart.addSeries(LineSeries, {
            color: indicator.color,
            lineWidth: 2,
            title: indicator.name
          });
          
          // Convert data format for lightweight-charts
          const chartData = indicatorData.map(d => ({
            time: d.time as any,
            value: d.value
          }));
          
          indicatorSeries.setData(chartData);
        }
        
        // Add reference lines for RSI
        if (indicator.type === 'rsi') {
          // Overbought line
          if (rsiSettings.showOverbought) {
            indicatorSeries.createPriceLine({
              price: rsiSettings.overbought,
              color: '#ff6b6b',
              lineWidth: 1,
              lineStyle: 2, // dashed
              axisLabelVisible: true,
              title: 'Overbought'
            });
          }
          
          // Oversold line
          if (rsiSettings.showOversold) {
            indicatorSeries.createPriceLine({
              price: rsiSettings.oversold,
              color: '#4ecdc4',
              lineWidth: 1,
              lineStyle: 2, // dashed
              axisLabelVisible: true,
              title: 'Oversold'
            });
          }
        }
        
        // Add zero line for MACD
        if (indicator.type === 'macd') {
          indicatorSeries.createPriceLine({
            price: 0,
            color: '#666',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: 'Zero'
          });
        }
        
        indicatorChart.timeScale().fitContent();
        indicatorChartRefs.current[indicator.id] = indicatorChart;
        
        
        // Synchronize time scale with main chart
        if (chartRef.current) {
          const mainTimeScale = chartRef.current.timeScale();
          const indicatorTimeScale = indicatorChart.timeScale();
          
          // Sync visible range
          const visibleRange = mainTimeScale.getVisibleRange();
          if (visibleRange) {
            indicatorTimeScale.setVisibleRange(visibleRange);
          }
          
          // Listen to main chart time scale changes
          const unsubscribeMain = mainTimeScale.subscribeVisibleTimeRangeChange((timeRange) => {
            if (timeRange) {
              indicatorTimeScale.setVisibleRange(timeRange);
            }
          });
          
          // Listen to indicator chart time scale changes (two-way sync)
          indicatorTimeScale.subscribeVisibleTimeRangeChange((timeRange) => {
            if (timeRange && chartRef.current) {
              // Sync main chart with indicator chart
              chartRef.current.timeScale().setVisibleRange(timeRange);
              
              // Sync other indicator charts
              Object.entries(indicatorChartRefs.current).forEach(([id, otherChart]) => {
                if (id !== indicator.id && otherChart && otherChart !== indicatorChart) {
                  (otherChart as any).timeScale().setVisibleRange(timeRange);
                }
              });
            }
          });
          
          // Sync crosshair/hover cursor
          indicatorChart.subscribeCrosshairMove((param) => {
            if (param && param.time && chartRef.current) {
              console.log(`Indicator chart ${indicator.id} crosshair move:`, {
                time: param.time,
                logical: param.logical,
                seriesData: param.seriesData
              });
              
              // Sync main chart crosshair with same time
              try {
                console.log(`Syncing to main chart from ${indicator.id}:`, param.logical);
                
                // Try crosshair positioning with proper parameters
                  try {
                  (chartRef.current as any).setCrosshairPosition(param.time, param.logical);
                  } catch (timeError) {
                  console.log('Crosshair positioning failed on main chart:', timeError);
                }
              } catch (error) {
                console.log('Error syncing crosshair to main chart:', error);
              }
              
              // Sync other indicator charts crosshair
              Object.entries(indicatorChartRefs.current).forEach(([id, otherChart]) => {
                if (id !== indicator.id && otherChart && otherChart !== indicatorChart) {
                  try {
                    console.log(`Syncing to other indicator chart ${id} from ${indicator.id}:`, param.logical);
                    
                    // Try both time and logical positioning
                    if ((otherChart as any).setCrosshairPosition) {
                      try {
                        (otherChart as any).setCrosshairPosition(param.time, param.seriesData || {});
                      } catch (timeError) {
                        console.log('Time positioning failed on other chart, trying logical:', timeError);
                        try {
                          (otherChart as any).setCrosshairPosition(param.logical, param.seriesData || {});
                        } catch (logicalError) {
                          console.log('Logical positioning also failed on other chart:', logicalError);
                        }
                      }
                    }
                  } catch (error) {
                    console.log('Error syncing crosshair to other indicator chart:', error);
                  }
                }
              });
            }
          });
          
          // Store unsubscribe function for cleanup
          (indicatorChart as any)._timeScaleUnsubscribe = unsubscribeMain;
        }
      }
    });
  }, [filteredRows, indicators, indicatorChartHeight, rsiSettings, volumeHistogramSettings]);


  // Resize responsif
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: Math.max(1, Math.floor(cr.width)),
        height: Math.max(1, Math.floor(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup main chart subscriptions
      if (chartRef.current) {
        if ((chartRef.current as any)._timeScaleUnsubscribe) {
          (chartRef.current as any)._timeScaleUnsubscribe();
        }
        if ((chartRef.current as any)._crosshairUnsubscribe) {
          (chartRef.current as any)._crosshairUnsubscribe();
        }
      }

      // Cleanup indicator chart subscriptions
      Object.values(indicatorChartRefs.current).forEach(chart => {
        if (chart && (chart as any)._timeScaleUnsubscribe) {
          (chart as any)._timeScaleUnsubscribe();
        }
      });
    };
  }, []);

  const latest = filteredRows.at(-1);
  const prev = filteredRows.length > 1 ? filteredRows[filteredRows.length - 2] : undefined;
  const chg = latest && prev ? latest.close - prev.close : 0;
  const chgPct = latest && prev ? (chg / prev.close) * 100 : 0;

  return (
    <div className="flex flex-col space-y-2 h-[560px]">
      <style>{`
        #tv-attr-logo {
          display: none !important;
        }
      `}</style>
      {!hideControls && (
        <Card className="p-3">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2 relative">
              <label className="font-medium">Symbol:</label>
              <div className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                    setSelectedIndex(-1);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onKeyDown={handleKeyDown}
                    placeholder="Type symbol code..."
                    className="px-3 py-1 pr-8 border border-border rounded-md font-mono w-48 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setShowSuggestions(true);
                        setSelectedIndex(-1);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
                      title="Clear"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {showSuggestions && filteredSymbols.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-popover border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                    {filteredSymbols.map((s, index) => (
                      <button
                        key={s}
                        onClick={() => {
                          setSymbol(s);
                          setSearchQuery(s);
                          setShowSuggestions(false);
                          setSelectedIndex(-1);
                        }}
                        className={`w-full px-3 py-2 text-left font-mono text-sm text-popover-foreground ${
                          index === selectedIndex 
                            ? 'bg-accent text-accent-foreground' 
                            : 'hover:bg-accent'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Timeframe:</span>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                className="px-3 py-1 border border-border rounded-md text-sm bg-background text-foreground"
              >
                {availableTimeframes.map(tf => (
                  <option key={tf.value} value={tf.value}>
                    {tf.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Chart Style:</span>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as ChartStyle)}
                className="px-3 py-1 border border-border rounded-md text-sm bg-background text-foreground"
              >
                <option value="line">Line</option>
                <option value="candles">Candles</option>
                <option value="area">Area</option>
                <option value="footprint">Footprint (Chart Style)</option>
              </select>
              <button
                onClick={() => setShowSettings(true)}
                className="px-3 py-1 border border-border rounded-md text-sm bg-background text-foreground hover:bg-accent"
              >
                ⚙️ Settings
              </button>
              <button
                onClick={() => setShowIndicatorSettings(true)}
                className="px-3 py-1 border border-border rounded-md text-sm bg-background text-foreground hover:bg-accent"
              >
                📊 Indicators
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono text-lg font-medium">{latest ? latest.close.toLocaleString() : '-'}</div>
              <div className={`text-sm font-medium ${chg >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {chg >= 0 ? '+' : ''}{chg.toFixed(0)} ({chgPct.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>
      </Card>
      )}

      <Card className="flex-1 p-0 relative">
        <div ref={containerRef} className="h-full w-full min-h-[400px] relative">
          {/* Bid-Ask Footprint Overlay for main chart */}
          {/* Footprint overlay as indicator removed: footprint is only via Chart Style now */}
        </div>
        {(() => {
          console.log('Checking footprint conditions:', { 
            style, 
            filteredRowsLength: filteredRows.length,
            shouldRender: style === 'footprint' && filteredRows.length > 0
          });
          
          if (style === 'footprint' && filteredRows.length > 0) {
            console.log('Rendering FootprintOverlay with', filteredRows.length, 'filtered rows');
            const footprintData = generateFootprintData(filteredRows);
            console.log('Generated footprint data:', footprintData.length, 'items');
            return (
              <FootprintOverlay 
                chartRef={chartRef}
                footprintData={footprintData}
              />
            );
          }
          return null;
        })()}
      </Card>

      {/* Separate indicator charts */}
      {indicators.filter(ind => ind.separateScale).map(indicator => (
        <Card key={indicator.id} className="p-0 relative">
          <div className="p-2 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: indicator.color }}
                />
                <span className="text-sm font-medium">{indicator.name}</span>
                <span className="text-xs text-muted-foreground">Separate Chart</span>
              </div>
              <div className="flex items-center gap-1">
                {indicator.type === 'rsi' && (
                  <button
                    onClick={() => {
                      setSelectedIndicatorForSettings(indicator);
                      setShowIndividualSettings(true);
                    }}
                    className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                    title="RSI Settings"
                  >
                    ⚙️
                  </button>
                )}
                <button
                  onClick={() => toggleIndicator(indicator.id)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                  title={indicator.enabled ? "Hide indicator" : "Show indicator"}
                >
                  {indicator.enabled ? "👁️" : "🚫👁️"}
                </button>
                <button
                  onClick={() => removeIndicator(indicator.id)}
                  className="px-2 py-1 text-xs border border-red-500 text-red-500 rounded hover:bg-red-50"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
          {indicator.enabled && (
            <div 
              ref={(el) => {
                if (el) {
                  indicatorContainerRefs.current[indicator.id] = el;
                }
              }}
              className="w-full relative"
              style={{ height: `${indicatorChartHeight}px` }}
            />
          )}
        </Card>
      ))}

      {/* Settings Popup */}
      {showSettings && (
        <div className="fixed inset-0 flex items-center justify-center z-40">
          <div className="bg-background border border-border rounded-lg shadow-lg p-4 w-80 max-w-[90vw]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Chart Colors</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            {/* Line Chart Colors */}
            {style === 'line' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Line Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={chartColors.line}
                    onChange={(e) => setChartColors(prev => ({ ...prev, line: e.target.value }))}
                    className="w-8 h-6 border border-border rounded cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground font-mono">{chartColors.line}</span>
                </div>
              </div>
            )}

            {/* Candlestick Colors */}
            {style === 'candles' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Bullish (Up)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={chartColors.candles.up}
                      onChange={(e) => setChartColors(prev => ({ 
                        ...prev, 
                        candles: { ...prev.candles, up: e.target.value, wickUp: e.target.value }
                      }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{chartColors.candles.up}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Bearish (Down)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={chartColors.candles.down}
                      onChange={(e) => setChartColors(prev => ({ 
                        ...prev, 
                        candles: { ...prev.candles, down: e.target.value, wickDown: e.target.value }
                      }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{chartColors.candles.down}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Area Chart Colors */}
            {style === 'area' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Line Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={chartColors.area.line}
                      onChange={(e) => setChartColors(prev => ({ 
                        ...prev, 
                        area: { ...prev.area, line: e.target.value }
                      }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{chartColors.area.line}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Fill Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={chartColors.area.top}
                      onChange={(e) => setChartColors(prev => ({ 
                        ...prev, 
                        area: { ...prev.area, top: e.target.value + '33', bottom: e.target.value + '0D' }
                      }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{chartColors.area.top}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Chart Height Control */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Indicator Chart Height</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="50"
                  max="200"
                  value={indicatorChartHeight}
                  onChange={(e) => setIndicatorChartHeight(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs text-muted-foreground font-mono w-12 text-right">
                  {indicatorChartHeight}px
                </span>
              </div>
            </div>


              {/* Action Buttons */}
            <div className="pt-2 border-t border-border">
                <div className="flex gap-2">
              <button
                onClick={() => {
                  setChartColors({
                    line: '#2563eb',
                    candles: { up: '#16a34a', down: '#dc2626', wickUp: '#16a34a', wickDown: '#dc2626' },
                    area: { line: '#2563eb', top: 'rgba(37,99,235,0.20)', bottom: 'rgba(37,99,235,0.05)' }
                  });
                  setIndicatorChartHeight(100);
                }}
                className="px-3 py-1 text-xs border border-border rounded hover:bg-accent"
              >
                Reset Default
              </button>
                  <button
                    onClick={async () => {
                      try {
                        await chartPreferencesService.saveColors({
                          bullish: chartColors.candles.up,
                          bearish: chartColors.candles.down,
                        });
                      } catch (e) {
                        console.log('Failed to save user chart colors to Supabase:', e);
                      }
                      setShowSettings(false);
                    }}
                    className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    Save Changes
              </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Technical Indicators Manager Popup */}
      {showIndicatorSettings && (
        <div className="fixed inset-0 flex items-center justify-center z-40">
          <div className="bg-background border border-border rounded-lg shadow-lg p-4 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Technical Indicators Manager</h3>
              <button
                onClick={() => setShowIndicatorSettings(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Add New Indicator */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground">Add New Indicator</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => addIndicator('sma', '#ff6b6b', false)}
                    className="px-3 py-2 text-xs border border-border rounded hover:bg-accent"
                  >
                    SMA
                  </button>
                  <button
                    onClick={() => addIndicator('ema', '#45b7d1', false)}
                    className="px-3 py-2 text-xs border border-border rounded hover:bg-accent"
                  >
                    EMA
                  </button>
                  <button
                    onClick={() => addIndicator('rsi', '#6c5ce7', true)}
                    className="px-3 py-2 text-xs border border-border rounded hover:bg-accent"
                  >
                    Relative Strength Index
                  </button>
                  <button
                    onClick={() => addIndicator('macd', '#e17055', true)}
                    className="px-3 py-2 text-xs border border-border rounded hover:bg-accent"
                  >
                    Moving Average Convergence Divergence
                  </button>
                  <button
                    onClick={() => addIndicator('volume_histogram', '#e67e22', false)}
                    className="px-3 py-2 text-xs border border-border rounded hover:bg-accent"
                  >
                    Volume Histogram
                  </button>
                  {/* Footprint indicator removed: use Chart Style 'footprint' instead */}
                </div>
              </div>

              {/* Active Indicators */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Active Indicators</h4>
                {indicators.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">No indicators added</p>
                ) : (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {indicators.map((indicator) => (
                      <div key={indicator.id} className="flex items-center justify-between p-2 border border-border rounded">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: indicator.color }}
                          />
                          <span className="text-xs font-mono">{indicator.name}</span>
                          {indicator.separateScale && (
                            <span className="text-xs text-blue-500">Separate Chart</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => editIndicator(indicator)}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            ⚙️
                          </button>
                          <button
                            onClick={() => toggleIndicator(indicator.id)}
                            className={`px-2 py-1 text-xs rounded ${
                              indicator.enabled 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {indicator.enabled ? 'ON' : 'OFF'}
                          </button>
                          <button
                            onClick={() => removeIndicator(indicator.id)}
                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Individual Indicator Settings Popup */}
      {showIndividualSettings && selectedIndicatorForSettings && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg shadow-lg p-4 w-80 max-w-[90vw]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{selectedIndicatorForSettings.name} Settings</h3>
              <button
                onClick={() => {
                  setShowIndividualSettings(false);
                  setSelectedIndicatorForSettings(null);
                }}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* RSI Settings */}
              {selectedIndicatorForSettings.type === 'rsi' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-muted-foreground">RSI Reference Lines</h4>
                  
                  {/* Overbought Line */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Overbought Line</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rsiSettings.showOverbought}
                          onChange={(e) => setRsiSettings(prev => ({ ...prev, showOverbought: e.target.checked }))}
                          className="w-3 h-3"
                        />
                        <span className="text-xs text-muted-foreground">Show</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="60"
                        max="90"
                        value={rsiSettings.overbought}
                        onChange={(e) => setRsiSettings(prev => ({ ...prev, overbought: parseInt(e.target.value) }))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        disabled={!rsiSettings.showOverbought}
                      />
                      <span className="text-xs text-muted-foreground font-mono w-8 text-right">
                        {rsiSettings.overbought}
                      </span>
                    </div>
                  </div>

                  {/* Oversold Line */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Oversold Line</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rsiSettings.showOversold}
                          onChange={(e) => setRsiSettings(prev => ({ ...prev, showOversold: e.target.checked }))}
                          className="w-3 h-3"
                        />
                        <span className="text-xs text-muted-foreground">Show</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="10"
                        max="40"
                        value={rsiSettings.oversold}
                        onChange={(e) => setRsiSettings(prev => ({ ...prev, oversold: parseInt(e.target.value) }))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        disabled={!rsiSettings.showOversold}
                      />
                      <span className="text-xs text-muted-foreground font-mono w-8 text-right">
                        {rsiSettings.oversold}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 border-t border-border">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setRsiSettings({
                        overbought: 70,
                        oversold: 30,
                        showOverbought: true,
                        showOversold: true
                      });
                    }}
                    className="px-3 py-1 text-xs border border-border rounded hover:bg-accent"
                  >
                    Reset Default
                  </button>
                  <button
                    onClick={() => {
                      setShowIndividualSettings(false);
                      setSelectedIndicatorForSettings(null);
                    }}
                    className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Indicator Editor Modal */}
      {showIndicatorEditor && editingIndicator && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg shadow-lg p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Indicator</h3>
              <button
                onClick={() => setShowIndicatorEditor(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <IndicatorEditor 
              indicator={editingIndicator}
              onSave={updateIndicator}
              onCancel={() => setShowIndicatorEditor(false)}
              volumeHistogramSettings={volumeHistogramSettings}
              setVolumeHistogramSettings={setVolumeHistogramSettings}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Indicator Editor Component
function IndicatorEditor({ 
  indicator, 
  onSave, 
  onCancel,
  volumeHistogramSettings,
  setVolumeHistogramSettings
}: { 
  indicator: Indicator; 
  onSave: (indicator: Indicator) => void; 
  onCancel: () => void;
  volumeHistogramSettings: any;
  setVolumeHistogramSettings: any;
}) {
  const [editedIndicator, setEditedIndicator] = useState<Indicator>(indicator);

  const handleSave = () => {
    onSave(editedIndicator);
  };

  const renderIndicatorSettings = () => {
    switch (editedIndicator.type) {
      case 'sma':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Period</label>
              <input
                type="number"
                value={editedIndicator.period}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, period: parseInt(e.target.value) || 20 }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                min="1"
                max="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editedIndicator.color}
                  onChange={(e) => setEditedIndicator(prev => ({ ...prev, color: e.target.value }))}
                  className="w-8 h-8 border border-border rounded cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{editedIndicator.color}</span>
              </div>
            </div>
          </div>
        );

      case 'ema':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Period</label>
              <input
                type="number"
                value={editedIndicator.period}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, period: parseInt(e.target.value) || 12 }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                min="1"
                max="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editedIndicator.color}
                  onChange={(e) => setEditedIndicator(prev => ({ ...prev, color: e.target.value }))}
                  className="w-8 h-8 border border-border rounded cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{editedIndicator.color}</span>
              </div>
            </div>
          </div>
        );

      case 'rsi':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Period</label>
              <input
                type="number"
                value={editedIndicator.period}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, period: parseInt(e.target.value) || 14 }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                min="1"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editedIndicator.color}
                  onChange={(e) => setEditedIndicator(prev => ({ ...prev, color: e.target.value }))}
                  className="w-8 h-8 border border-border rounded cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{editedIndicator.color}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Chart Type</label>
              <select
                value={editedIndicator.separateScale ? 'separate' : 'overlay'}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, separateScale: e.target.value === 'separate' }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="overlay">Overlay on Main Chart</option>
                <option value="separate">Separate Chart Below</option>
              </select>
            </div>
          </div>
        );

      case 'macd':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Fast Period</label>
              <input
                type="number"
                value={12}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Slow Period</label>
              <input
                type="number"
                value={26}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Signal Period</label>
              <input
                type="number"
                value={9}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editedIndicator.color}
                  onChange={(e) => setEditedIndicator(prev => ({ ...prev, color: e.target.value }))}
                  className="w-8 h-8 border border-border rounded cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{editedIndicator.color}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Chart Type</label>
              <select
                value={editedIndicator.separateScale ? 'separate' : 'overlay'}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, separateScale: e.target.value === 'separate' }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="overlay">Overlay on Main Chart</option>
                <option value="separate">Separate Chart Below</option>
              </select>
            </div>
          </div>
        );

      case 'volume_histogram':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Base Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editedIndicator.color}
                  onChange={(e) => setEditedIndicator(prev => ({ ...prev, color: e.target.value }))}
                  className="w-8 h-8 border border-border rounded cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{editedIndicator.color}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Chart Type</label>
              <select
                value={editedIndicator.separateScale ? 'separate' : 'overlay'}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, separateScale: e.target.value === 'separate' }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="overlay">Overlay on Main Chart</option>
                <option value="separate">Separate Chart Below</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Volume Colors</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Up Color (Price Rising)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={volumeHistogramSettings.upColor}
                      onChange={(e) => setVolumeHistogramSettings(prev => ({ ...prev, upColor: e.target.value }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{volumeHistogramSettings.upColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Down Color (Price Falling)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={volumeHistogramSettings.downColor}
                      onChange={(e) => setVolumeHistogramSettings(prev => ({ ...prev, downColor: e.target.value }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{volumeHistogramSettings.downColor}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return <div>Unknown indicator type</div>;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Indicator Name</label>
        <input
          type="text"
          value={editedIndicator.name}
          onChange={(e) => setEditedIndicator(prev => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
        />
      </div>

      {renderIndicatorSettings()}

      <div className="flex gap-2 pt-4">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Save Changes
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-md hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Footprint Overlay Component
function FootprintOverlay({ 
  chartRef, 
  footprintData 
}: { 
  chartRef: React.RefObject<IChartApi | null>; 
  footprintData: FootprintData[] 
}) {
  const [visibleData, setVisibleData] = useState<FootprintData[]>([]);
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
  const [activeTime, setActiveTime] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  console.log('FootprintOverlay rendering:', { 
    footprintDataLength: footprintData.length, 
    chartRef: !!chartRef.current,
    overlayRef: !!overlayRef.current 
  });

  useEffect(() => {
    console.log('FootprintOverlay useEffect triggered');
    
    // Set initial data immediately
    setVisibleData(footprintData);
    
    if (!chartRef.current) {
      console.log('Missing chartRef');
      return;
    }

    const chart = chartRef.current;
    
    // Get visible time range
    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleRange();
    
    console.log('Visible range:', visibleRange);
    
    if (visibleRange) {
      const filteredData = footprintData.filter(data => 
        data.time >= (visibleRange.from as number) && data.time <= (visibleRange.to as number)
      );
      console.log('Filtered data length:', filteredData.length);
      setVisibleData(filteredData);
    }

    // Listen for time scale changes
    const onRangeChange = (timeRange: any) => {
      console.log('Time range changed:', timeRange);
      if (timeRange) {
        const filteredData = footprintData.filter(data => 
          data.time >= (timeRange.from as number) && data.time <= (timeRange.to as number)
        );
        setVisibleData(filteredData);
      }
    };
    timeScale.subscribeVisibleTimeRangeChange(onRangeChange);

    // Track crosshair to show single active timestamp footprint
    const onCrosshairMove = (param: any) => {
      if (param && param.time) {
        const t = Number(param.time as any);
        if (!Number.isNaN(t)) setActiveTime(t);
      }
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    return () => {
      try { timeScale.unsubscribeVisibleTimeRangeChange(onRangeChange); } catch (_) {}
      try { chart.unsubscribeCrosshairMove(onCrosshairMove); } catch (_) {}
    };
  }, [chartRef, footprintData]);

  // Separate effect for dimensions
  useEffect(() => {
    if (!overlayRef.current) return;

    const container = overlayRef.current;
    
    // Get chart dimensions
    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      console.log('Chart dimensions:', rect);
      setChartDimensions({ width: rect.width, height: rect.height });
    };
    
    updateDimensions();

    // Listen for resize
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Determine the single footprint to display (crosshair time or latest visible)
  const pool = (visibleData.length > 0 ? visibleData : footprintData).slice(-30);
  let selected: FootprintData | null = null;
  if (activeTime) {
    selected = pool.find(d => d.time === activeTime) || null;
  }
  if (!selected && pool.length) {
    selected = pool[pool.length - 1];
  }

  console.log('Selected footprint present:', !!selected);

  if (!selected) {
    console.log('No display data, returning null');
    return null;
  }

  console.log('Rendering FootprintOverlay for time', selected?.time);

  // Helper to map time to X coordinate (approx)
  const getX = (time: number) => {
    if (!chartRef.current) return 0;
    const ts = chartRef.current.timeScale();
    const vr = ts.getVisibleRange();
    if (!vr) return 0;
    const from = Number(vr.from as any);
    const to = Number(vr.to as any);
    const pos = (time - from) / Math.max(1, (to - from));
    return Math.max(0, Math.min(chartDimensions.width - 1, pos * chartDimensions.width));
  };

  const x = getX(selected.time);
  const priceLevelsSorted = [...selected.priceLevels]
    .sort((a, b) => b.price - a.price);
  const significant = priceLevelsSorted
    .sort((a, b) => (b.bidVolume + b.askVolume) - (a.bidVolume + a.askVolume))
    .slice(0, 12);

  const format = (v: number) => v >= 1000000 ? `${Math.round(v/1000)/1000}M` : v >= 1000 ? `${Math.round(v/100)/10}k` : `${v}`;

  return (
    <div ref={overlayRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      <div
        className="absolute pointer-events-none"
        style={{
          left: Math.min(Math.max(0, x + 10), Math.max(0, chartDimensions.width - 140)),
          top: 20,
          width: 140,
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          padding: '6px 8px'
        }}
      >
        {significant.map((lvl, i) => (
          <div key={i} className="flex items-center justify-between py-[1px]">
            <span className="text-[10px] font-mono text-red-400">{format(lvl.bidVolume)}</span>
            <span className="text-[10px] font-mono text-muted-foreground mx-2">|</span>
            <span className="text-[10px] font-mono text-green-400">{format(lvl.askVolume)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Individual Footprint Column Component
function FootprintColumn({ 
  data, 
  index, 
  total, 
  chartWidth, 
  chartHeight 
}: { 
  data: FootprintData; 
  index: number; 
  total: number; 
  chartWidth: number; 
  chartHeight: number 
}) {
  const columnWidth = Math.max(30, chartWidth / total);
  const x = index * columnWidth;

  // Calculate price range for this footprint
  const prices = data.priceLevels.map(level => level.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  // Calculate max volume for scaling
  const maxVolume = Math.max(...data.priceLevels.map(level => Math.max(level.bidVolume, level.askVolume)));

  // Reduce crowding by showing only top 8 most significant levels
  const significantLevels = data.priceLevels
    .filter(level => level.bidVolume > maxVolume * 0.15 || level.askVolume > maxVolume * 0.15)
    .sort((a, b) => (b.bidVolume + b.askVolume) - (a.bidVolume + a.askVolume))
    .slice(0, 8);

         return (
           <div
             className="absolute top-0 bottom-0"
             style={{
               left: Math.max(0, Math.min(x, chartWidth - columnWidth)),
               width: Math.min(columnWidth, chartWidth - x),
               height: chartHeight
             }}
           >
      {significantLevels.map((level, levelIndex) => {
        // Calculate position based on price - distribute evenly across chart height
        const priceY = ((maxPrice - level.price) / priceRange) * chartHeight;
        const barHeight = Math.max(8, chartHeight / 12); // Fixed height for consistency

        // Calculate bar widths - much smaller to prevent overflow
        const maxBarWidth = Math.min(columnWidth * 0.15, 20); // Reduced to 15% of column width, max 20px
        const bidBarWidth = maxVolume > 0 ? Math.min((level.bidVolume / maxVolume) * maxBarWidth, maxBarWidth) : 0;
        const askBarWidth = maxVolume > 0 ? Math.min((level.askVolume / maxVolume) * maxBarWidth, maxBarWidth) : 0;

        return (
          <div
            key={levelIndex}
            className="absolute flex items-center justify-between"
            style={{
              top: priceY - barHeight / 2,
              height: barHeight,
              width: columnWidth,
              left: 0
            }}
          >
            {/* Bid Volume Bar (Left side, Red) */}
            {bidBarWidth > 1 && (
              <div
                className="bg-red-500 opacity-90 rounded-sm"
                style={{
                  width: `${bidBarWidth}px`,
                  height: barHeight,
                  minWidth: '1px',
                  maxWidth: `${maxBarWidth}px`
                }}
                title={`Bid: ${level.bidVolume}`}
              />
            )}

                     {/* Price Label - only show for very significant levels */}
                     {level.bidVolume > maxVolume * 0.3 || level.askVolume > maxVolume * 0.3 ? (
                       <div className="flex-1 text-center px-1">
                         <span className="text-xs font-mono text-foreground px-1 text-center">
                           {level.price.toFixed(1)}
                         </span>
                       </div>
                     ) : (
                       <div className="flex-1" />
                     )}

            {/* Ask Volume Bar (Right side, Green) */}
            {askBarWidth > 1 && (
              <div
                className="bg-green-500 opacity-90 rounded-sm"
                style={{
                  width: `${askBarWidth}px`,
                  height: barHeight,
                  minWidth: '1px',
                  maxWidth: `${maxBarWidth}px`
                }}
                title={`Ask: ${level.askVolume}`}
              />
            )}

            {/* Delta Value - only show for most significant levels */}
            {(level.bidVolume > maxVolume * 0.4 || level.askVolume > maxVolume * 0.4) && (
              <div className="absolute -right-6 top-0 text-xs font-mono px-1">
                <span className={`${level.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {level.delta >= 0 ? '+' : ''}{Math.round(level.delta / 1000)}k
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Bid-Ask Footprint Individual Candlestick Overlay Component
function BidAskFootprintOverlay({ 
  data, 
  containerRef,
  chartRef,
  candlestickData
}: { 
  data: BidAskFootprintData[]; 
  containerRef: HTMLDivElement | null;
  chartRef: React.RefObject<IChartApi>;
  candlestickData: any[];
}) {
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
  const [priceRange, setPriceRange] = useState({ min: 0, max: 0 });
  const [timeRange, setTimeRange] = useState({ from: 0, to: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef || !chartRef.current) return;

    const updateDimensions = () => {
      const rect = containerRef.getBoundingClientRect();
      setChartDimensions({ width: rect.width, height: rect.height });
      
      // Get price range from chart
      const priceScale = chartRef.current?.priceScale('right');
      if (priceScale) {
        const priceRange = priceScale.getVisibleRange();
        if (priceRange) {
          setPriceRange({ min: priceRange.from, max: priceRange.to });
        }
      }

      // Get time range from chart
      const timeScale = chartRef.current?.timeScale();
      if (timeScale) {
        const timeRange = timeScale.getVisibleRange();
        if (timeRange) {
          setTimeRange({ from: timeRange.from as number, to: timeRange.to as number });
        }
      }
    };
    
    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef);

    // Use interval to update ranges for real-time tracking
    const interval = setInterval(updateDimensions, 100); // Update every 100ms

    return () => {
      resizeObserver.disconnect();
      clearInterval(interval);
    };
  }, [containerRef, chartRef]);

  if (!data.length || !chartDimensions.width || !chartDimensions.height || priceRange.min === 0 || !candlestickData.length) {
    return null;
  }

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(0)}K`;
    } else {
      return volume.toString();
    }
  };

  // Calculate position for each candlestick based on actual candlestick data
  const getCandlestickX = (time: number) => {
    const timeRangeSize = timeRange.to - timeRange.from;
    const timePosition = (time - timeRange.from) / timeRangeSize;
    return timePosition * chartDimensions.width;
  };

  const getCandlestickY = (price: number) => {
    const priceRangeSize = priceRange.max - priceRange.min;
    const pricePosition = (priceRange.max - price) / priceRangeSize;
    return pricePosition * chartDimensions.height;
  };

  // Filter candlesticks that are within visible time range and limit to latest 30
  const visibleCandlesticks = candlestickData
    .filter(candle => candle.time >= timeRange.from && candle.time <= timeRange.to)
    .sort((a, b) => b.time - a.time) // Sort by time descending (newest first)
    .slice(0, 30); // Take only latest 30 candlesticks

  console.log('BidAskFootprintOverlay Debug:', {
    dataLength: data.length,
    candlestickDataLength: candlestickData.length,
    visibleCandlesticksLength: visibleCandlesticks.length,
    chartDimensions,
    priceRange,
    timeRange,
    firstCandlestick: visibleCandlesticks[0],
    firstFootprint: data[0],
    limitedTo30: true,
    note: 'Showing only latest 30 candlesticks'
  });

  return (
    <div 
      ref={overlayRef}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ 
        zIndex: 20,
        width: chartDimensions.width,
        height: chartDimensions.height
      }}
    >
      {visibleCandlesticks.map((candle, index) => {
        const x = getCandlestickX(candle.time);
        const y = getCandlestickY(candle.close);
        const isVisible = x >= 0 && x <= chartDimensions.width && y >= 0 && y <= chartDimensions.height;
        
        console.log(`Candlestick ${index}:`, {
          candle,
          x,
          y,
          isVisible,
          chartDimensions
        });
        
        if (!isVisible) return null;

        // Find corresponding footprint data for this candlestick time
        const footprintData = data.find(point => point.time === candle.time);
        
        console.log(`Footprint data for candlestick ${index}:`, {
          candleTime: candle.time,
          footprintData,
          allFootprintTimes: data.map(d => d.time)
        });
        
        // Get top 5 price levels for this data point
        let topLevels: any[] = [];
        if (footprintData) {
          topLevels = footprintData.priceLevels
            .sort((a, b) => b.totalVolume - a.totalVolume)
            .slice(0, 5);
        } else {
          // Fallback: create dummy data for testing
          topLevels = [
            { bidVolume: 1000, askVolume: 2000, totalVolume: 3000 },
            { bidVolume: 500, askVolume: 1500, totalVolume: 2000 },
            { bidVolume: 800, askVolume: 1200, totalVolume: 2000 },
            { bidVolume: 300, askVolume: 900, totalVolume: 1200 },
            { bidVolume: 600, askVolume: 400, totalVolume: 1000 }
          ];
        }

        console.log(`Rendering table for candlestick ${index}:`, {
          x: x + 15,
          y: Math.max(10, y - 30),
          topLevels
        });

        // Calculate candlestick height and position
        const candleHighY = getCandlestickY(candle.high);
        const candleLowY = getCandlestickY(candle.low);
        const candleHeight = Math.abs(candleHighY - candleLowY);
        const candleTop = Math.min(candleHighY, candleLowY);

        return (
          <div
            key={index}
            className="absolute pointer-events-none"
            style={{
              left: `${x + 8}px`, // 8px offset from candlestick edge
              top: `${candleTop}px`, // Align with candlestick top
              zIndex: 25,
              width: '12px', // Very thin footprint bar
              height: `${candleHeight}px` // Match candlestick height
            }}
          >
            {/* Vertical footprint bar */}
            <div 
              className="relative"
              style={{ 
                width: '12px',
                height: `${candleHeight}px`,
                background: 'rgba(0, 0, 0, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '2px'
              }}
            >
              {/* Render horizontal segments for each price level */}
              {topLevels.map((level, levelIndex) => {
                // Calculate position of this price level within the candlestick
                const levelPrice = level.price || (candle.high - (levelIndex * (candle.high - candle.low) / topLevels.length));
                const levelY = getCandlestickY(levelPrice);
                const relativeY = levelY - candleTop;
                
                // Calculate segment widths based on volume
                const maxVolume = Math.max(...topLevels.map(l => Math.max(l.bidVolume, l.askVolume)));
                const bidWidth = level.bidVolume > 0 ? (level.bidVolume / maxVolume) * 6 : 0;
                const askWidth = level.askVolume > 0 ? (level.askVolume / maxVolume) * 6 : 0;
                
                return (
                  <div
                    key={levelIndex}
                    className="absolute"
                    style={{
                      top: `${relativeY}px`,
                      left: '0px',
                      width: '12px',
                      height: '2px'
                    }}
                  >
                    {/* Bid segment (left side) */}
                    {bidWidth > 0 && (
                      <div
                        className="absolute bg-red-500"
                        style={{
                          left: '0px',
                          top: '0px',
                          width: `${bidWidth}px`,
                          height: '2px',
                          borderRadius: '1px'
                        }}
                      />
                    )}
                    
                    {/* Ask segment (right side) */}
                    {askWidth > 0 && (
                      <div
                        className="absolute bg-green-500"
                        style={{
                          right: '0px',
                          top: '0px',
                          width: `${askWidth}px`,
                          height: '2px',
                          borderRadius: '1px'
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}