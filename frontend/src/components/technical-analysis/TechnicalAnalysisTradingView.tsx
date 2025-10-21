import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../ui/card';
import { Settings as SettingsIcon, BarChart2, Search, Plus, X } from 'lucide-react';
// import { Button } from '../ui/button';
import { FootprintChart } from '../footprint/FootprintChart';
import { api } from '../../services/api';

// Error Boundary Component
class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Chart Error Boundary caught an error:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-destructive mb-2">
              Chart Error
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || 'An error occurred while rendering the chart'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Reload Chart
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
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

// Type declaration for import.meta.glob
declare global {
  interface ImportMeta {
    glob: (pattern: string, options?: any) => Record<string, any>;
  }
}

/* ============================================================================
   1) LOAD AVAILABLE STOCKS FROM AZURE API
   - Get list of available stocks from backend API
   - Replace static CSV file discovery with dynamic API calls
============================================================================ */
// Dynamic stock list will be loaded from API
// let AVAILABLE_SYMBOLS: string[] = []; // Removed - using state instead

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

type ChartStyle = 'line' | 'candles' | 'footprint';
type Timeframe = '1M' | '5M' | '15M' | '30M' | '1H' | '1D' | '1W' | '1MO' | '3M' | '6M' | '1Y';

type Indicator = {
  id: string;
  name: string;
  type: 'ma' | 'sma' | 'ema' | 'rsi' | 'macd' | 'stochastic' | 'volume_histogram' | 'buy_sell_frequency';
  period: number;
  color: string;
  enabled: boolean;
  separateScale?: boolean; // For indicators that need separate scale like RSI
  maMode?: 'simple' | 'exponential'; // for Moving Average (MA) indicator
};

type IndicatorData = {
  time: number;
  value: number;
};


// Removed utility functions - now using API data directly

// Removed parseCsv function - now using API data directly

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
      time: data[i]?.time ?? 0,
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
  let ema = data[0]?.close ?? 0;
  result.push({ time: data[0]?.time ?? 0, value: ema });
  
  for (let i = 1; i < data.length; i++) {
    ema = ((data[i]?.close ?? 0) * multiplier) + (ema * (1 - multiplier));
    result.push({ time: data[i]?.time ?? 0, value: ema });
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
    const change = (data[i]?.close ?? 0) - (data[i - 1]?.close ?? 0);
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate RSI for each period
  for (let i = period; i < gains.length; i++) {
    const avgGain = gains.slice(i - period, i).reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.slice(i - period, i).reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) {
      result.push({ time: data[i + 1]?.time ?? 0, value: 100 });
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push({ time: data[i + 1]?.time ?? 0, value: rsi });
    }
  }
  
  return result;
}

function calculateMACD(data: OhlcRow[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: IndicatorData[], signal: IndicatorData[] } {
  const macdLine: IndicatorData[] = [];
  const signalLine: IndicatorData[] = [];
  
  if (data.length < slowPeriod) return { macd: macdLine, signal: signalLine };
  
  // Calculate EMAs
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  // Calculate MACD line
  for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
    if (fastEMA[i] && slowEMA[i]) {
      macdLine.push({
        time: fastEMA[i]?.time ?? 0,
        value: (fastEMA[i]?.value ?? 0) - (slowEMA[i]?.value ?? 0)
      });
    }
  }
  
  // Calculate signal line (EMA of MACD line)
  const signalLineData = calculateEMA(macdLine.map(d => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value })), signalPeriod);
  
  // Convert signal line data to IndicatorData format
  for (let i = 0; i < signalLineData.length; i++) {
    if (signalLineData[i]) {
      signalLine.push({
        time: signalLineData[i]?.time ?? 0,
        value: signalLineData[i]?.value ?? 0
      });
    }
  }
  
  return { macd: macdLine, signal: signalLine };
}


function calculateVolumeHistogram(data: OhlcRow[]): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (data[i]?.volume !== undefined) {
      result.push({
        time: data[i]?.time ?? 0,
        value: data[i]?.volume ?? 0
      });
    }
  }
  
  return result;
}

function calculateBuySellFrequency(_data: OhlcRow[], _period: number = 14): { buyFreq: IndicatorData[], sellFreq: IndicatorData[] } {
  const buyFreq: IndicatorData[] = [];
  const sellFreq: IndicatorData[] = [];
  
  // For now, return empty arrays - this will be replaced with real footprint data
  // when the footprint chart is implemented with API data
  return { buyFreq, sellFreq };
}

function calculateStochastic(data: OhlcRow[], kPeriod: number = 14, dPeriod: number = 3): { k: IndicatorData[], d: IndicatorData[] } {
  const kValues: IndicatorData[] = [];
  const dValues: IndicatorData[] = [];
  
  if (data.length < kPeriod) return { k: kValues, d: dValues };
  
  // Calculate %K values
  for (let i = kPeriod - 1; i < data.length; i++) {
    const slice = data.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice.map(item => item?.high ?? 0));
    const lowestLow = Math.min(...slice.map(item => item?.low ?? 0));
    const currentClose = data[i]?.close ?? 0;
    
    // Calculate %K
    const kPercent = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    kValues.push({
      time: data[i]?.time ?? 0,
      value: kPercent
    });
  }
  
  // Calculate %D values (SMA of %K)
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    const slice = kValues.slice(i - dPeriod + 1, i + 1);
    const dValue = slice.reduce((sum, item) => sum + item.value, 0) / dPeriod;
    
    dValues.push({
      time: kValues[i]?.time ?? 0,
      value: dValue
    });
  }
  
  return { k: kValues, d: dValues };
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
    
    if (first && last) {
      weeklyData.push({
        time: first.time,
        open: first.open,
        high: Math.max(...sortedWeek.map(r => r?.high ?? 0)),
        low: Math.min(...sortedWeek.map(r => r?.low ?? 0)),
        close: last.close,
        volume: sortedWeek.reduce((sum, r) => sum + (r?.volume || 0), 0)
      });
    }
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
    
    if (first && last) {
      monthlyData.push({
        time: first.time,
        open: first.open,
        high: Math.max(...sortedMonth.map(r => r?.high ?? 0)),
        low: Math.min(...sortedMonth.map(r => r?.low ?? 0)),
        close: last.close,
        volume: sortedMonth.reduce((sum, r) => sum + (r?.volume || 0), 0)
      });
    }
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
    
    if (first && last) {
      quarterlyData.push({
        time: first.time,
        open: first.open,
        high: Math.max(...sortedQuarter.map(r => r?.high ?? 0)),
        low: Math.min(...sortedQuarter.map(r => r?.low ?? 0)),
        close: last.close,
        volume: sortedQuarter.reduce((sum, r) => sum + (r?.volume || 0), 0)
      });
    }
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
    
    if (first && last) {
      halfYearData.push({
        time: first.time,
        open: first.open,
        high: Math.max(...sortedHalfYear.map(r => r?.high ?? 0)),
        low: Math.min(...sortedHalfYear.map(r => r?.low ?? 0)),
        close: last.close,
        volume: sortedHalfYear.reduce((sum, r) => sum + (r?.volume || 0), 0)
      });
    }
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
    
    if (first && last) {
      yearlyData.push({
        time: first.time,
        open: first.open,
        high: Math.max(...sortedYear.map(r => r?.high ?? 0)),
        low: Math.min(...sortedYear.map(r => r?.low ?? 0)),
        close: last.close,
        volume: sortedYear.reduce((sum, r) => sum + (r?.volume || 0), 0)
      });
    }
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
    
    if (first && last) {
      minuteData.push({
        time: first.time,
        open: first.open,
        high: Math.max(...sortedMinute.map(r => r?.high ?? 0)),
        low: Math.min(...sortedMinute.map(r => r?.low ?? 0)),
        close: last.close,
        volume: sortedMinute.reduce((sum, r) => sum + (r?.volume || 0), 0)
      });
    }
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
    
    if (first && last) {
      hourlyData.push({
        time: first.time,
        open: first.open,
        high: Math.max(...sortedHour.map(r => r?.high ?? 0)),
        low: Math.min(...sortedHour.map(r => r?.low ?? 0)),
        close: last.close,
        volume: sortedHour.reduce((sum, r) => sum + (r?.volume || 0), 0)
      });
    }
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
    tradingDayGroups[tradingDay]?.push(row);
  });
  
  Object.values(tradingDayGroups).forEach(tradingDayRows => {
    if (tradingDayRows.length === 0) return;
    
    const sortedTradingDay = tradingDayRows.sort((a, b) => a.time - b.time);
    const first = sortedTradingDay[0];
    const last = sortedTradingDay[sortedTradingDay.length - 1];
    
    if (first && last) {
      tradingDayData.push({
        time: first.time,
        open: first.open,
        high: Math.max(...sortedTradingDay.map(r => r?.high ?? 0)),
        low: Math.min(...sortedTradingDay.map(r => r?.low ?? 0)),
        close: last.close,
        volume: sortedTradingDay.reduce((sum, r) => sum + (r?.volume || 0), 0)
      });
    }
  });
  
  return tradingDayData.sort((a, b) => a.time - b.time);
}

/* ============================================================================
   4) KOMPONEN UTAMA
============================================================================ */
interface TechnicalAnalysisTradingViewProps {
  selectedStock?: string;
  hideControls?: boolean;
  styleProp?: ChartStyle;
  timeframeProp?: string;
}

export const TechnicalAnalysisTradingView = React.memo(function TechnicalAnalysisTradingView({ selectedStock, hideControls = false, styleProp, timeframeProp }: TechnicalAnalysisTradingViewProps) {
  const [symbol, setSymbol] = useState<string>(selectedStock || 'BBCA');
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [style, setStyle] = useState<ChartStyle>('candles');
  const [rows, setRows] = useState<OhlcRow[]>([]);
  const [, setSrc] = useState<'file' | 'mock' | 'none'>('none');
  const [, setPlotted] = useState(0);
  const [, setErr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('BBCA');
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);
  const [searchDropdownIndex, setSearchDropdownIndex] = useState<number>(-1);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState<boolean>(true);
  const searchRef = useRef<HTMLDivElement>(null);
  const [chartColors, setChartColors] = useState({
      line: '#2563eb',
    candles: { up: '#16a34a', down: '#dc2626', wickUp: '#16a34a', wickDown: '#dc2626' },
      area: { line: '#2563eb', top: 'rgba(37,99,235,0.20)', bottom: 'rgba(37,99,235,0.05)' }
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
  const [stochasticSettings] = useState({
    kColor: '#9b59b6',
    dColor: '#ffa726',
    showOverbought: true,
    showOversold: true
  });
  const [showSettings, setShowSettings] = useState(false);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [showIndicatorSettings, setShowIndicatorSettings] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<Indicator | null>(null);
  const [showIndicatorEditor, setShowIndicatorEditor] = useState(false);
  const [showIndividualSettings, setShowIndividualSettings] = useState(false);
  const [selectedIndicatorForSettings, setSelectedIndicatorForSettings] = useState<Indicator | null>(null);
  
  // New: measure controls height and compute available viewport height for the chart
  const controlsContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartViewportHeight, setChartViewportHeight] = useState<number>(600);
  useEffect(() => {
    const HEADER_H = 56; // h-14 in header
    const MAIN_PADDING_V = 48; // p-6 top+bottom in <main>
    const GAPS = 16; // approximate vertical gaps between elements

    const recalc = () => {
      const controlsH = hideControls ? 0 : (controlsContainerRef.current?.offsetHeight || 0);
      const h = window.innerHeight - HEADER_H - MAIN_PADDING_V - GAPS - (hideControls ? 0 : GAPS) - 0;
      // Deduct controls height to fit without page scroll
      const finalH = Math.max(320, h - controlsH);
      setChartViewportHeight(finalH);
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [hideControls]);
  
  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        // Don't close if clicking on clear button
        const target = event.target as HTMLElement;
        if (target && target.closest('button[aria-label="Clear search"]')) {
          return;
        }
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load available symbols from API
  useEffect(() => {
    const loadSymbols = async () => {
      try {
        setIsLoadingSymbols(true);
        const result = await api.getStockList();
        console.log('🔍 TechnicalAnalysis: Loading symbols result:', result);
        if (result.success && result.data?.stocks) {
          console.log('✅ TechnicalAnalysis: Loaded symbols:', result.data.stocks.length, 'symbols');
          setAvailableSymbols(result.data.stocks);
          // Set default symbol if none selected
          if (!selectedStock && result.data.stocks.length > 0) {
            // Try to set BBCA as default, fallback to first available
            const defaultSymbol = result.data.stocks.includes('BBCA') ? 'BBCA' : result.data.stocks[0];
            setSymbol(defaultSymbol);
            // Don't force setSearchQuery here - let user control it
          }
        } else {
          console.error('❌ TechnicalAnalysis: Failed to load stock symbols:', result.error);
          setAvailableSymbols(['MOCK']);
        }
      } catch (error) {
        console.error('Error loading stock symbols:', error);
        setAvailableSymbols(['MOCK']);
      } finally {
        setIsLoadingSymbols(false);
      }
    };
    
    loadSymbols();
  }, []);

  // Update symbol when selectedStock prop changes
  useEffect(() => {
    if (selectedStock && selectedStock !== symbol) {
      setSymbol(selectedStock);
    }
  }, [selectedStock, symbol]);
  
  // Footprint chart settings
  const [footprintSettings, setFootprintSettings] = useState({
    showCrosshair: true,
    showPOC: true,
    showDelta: false, // Default delta off
    timeframe: '15m',
    zoom: 1.1 // Default zoom 1.1x
  });

  // Load saved colors from localStorage
  useEffect(() => {
    const savedColors = localStorage.getItem('chartColors');
    if (savedColors) {
      try {
        setChartColors(JSON.parse(savedColors));
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


  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<any | null>(null);
  const volRef = useRef<any | null>(null);
  const indicatorRefs = useRef<{ [key: string]: any }>({});
  // Track any auxiliary series added for a single indicator (e.g., MACD signal, Stochastic %D)
  const indicatorAuxRefs = useRef<{ [key: string]: any[] }>({});
  
  // Separate chart refs for indicators
  const indicatorChartRefs = useRef<{ [key: string]: IChartApi }>({});
  const indicatorContainerRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Indicator management functions
  const addIndicator = (type: Indicator['type'], color: string, separateScale: boolean = false, maMode: 'simple' | 'exponential' = 'simple') => {
    // Default periods for each indicator type
    const defaultPeriods = {
      'ma': 20,
      'sma': 20,
      'ema': 12,
      'rsi': 14,
      'macd': 12,
      'stochastic': 14,
      'volume_histogram': 1,
      'buy_sell_frequency': 14
    };
    
    const newIndicator: Indicator = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: type === 'ma' ? `MA (${maMode === 'exponential' ? 'Exponential' : 'Simple'})` :
            type === 'stochastic' ? '%K (Stochastic)' : 
            type === 'buy_sell_frequency' ? 'Buy / Sell Frequency' : 
            `${type.toUpperCase()}`,
      type,
      period: (defaultPeriods as any)[type],
      color,
      enabled: true,
      separateScale,
      ...(type === 'ma' && { maMode })
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

  const symbols = useMemo(() => (availableSymbols.length ? availableSymbols : ['MOCK']), [availableSymbols]);
  
  // Filter symbols based on search query (like MarketRotationRRC)
  const getFilteredSymbols = () => {
    return symbols.filter(symbol => 
      symbol.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // Removed useEffect that was forcing searchQuery to match symbol
  // This was causing the clear button to not work properly

  // Handle keyboard navigation (like MarketRotationRRC)
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    const filteredSymbols = getFilteredSymbols();
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSearchDropdownIndex(prev => 
          prev < filteredSymbols.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSearchDropdownIndex(prev => 
          prev > 0 ? prev - 1 : filteredSymbols.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (searchDropdownIndex >= 0 && filteredSymbols[searchDropdownIndex]) {
          const selectedSymbol = filteredSymbols[searchDropdownIndex];
          setSymbol(selectedSymbol);
          setSearchQuery(selectedSymbol);
          setShowSearchDropdown(false);
          setSearchDropdownIndex(-1);
        }
        break;
      case 'Escape':
        setShowSearchDropdown(false);
        setSearchDropdownIndex(-1);
        break;
    }
  };

  // Load stock data from API when symbol changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        setPlotted(0);

        if (symbol === 'MOCK' || !availableSymbols.length) {
          // fallback mock jika tak ada data
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

        // Load stock data from API
        console.log(`Loading stock data for ${symbol} from API...`);
        const result = await api.getStockData(symbol);
        
        if (!result.success) {
          throw new Error(result.error || `Failed to load data for ${symbol}`);
        }

        if (!result.data?.data || result.data.data.length === 0) {
          throw new Error(`No data found for ${symbol}`);
        }

        // Convert API data to OhlcRow format
        const apiData = result.data.data;
        const parsed: OhlcRow[] = apiData.map((row: any) => {
          // Convert date to Unix timestamp
          const dateStr = row.Date || row.date || '';
          const time = new Date(dateStr).getTime() / 1000;
          
          return {
            time: Math.floor(time),
            open: parseFloat(row.Open || row.open || 0),
            high: parseFloat(row.High || row.high || 0),
            low: parseFloat(row.Low || row.low || 0),
            close: parseFloat(row.Close || row.close || 0),
            volume: parseFloat(row.Volume || row.volume || 0)
          };
        }).filter((row: OhlcRow) => row.time > 0); // Filter out invalid dates

        console.log(`Loaded ${parsed.length} rows for ${symbol} from API`);
        if (!parsed.length) throw new Error(`No valid OHLC data for ${symbol}`);

        if (!cancelled) {
          setRows(parsed);
          setSrc('file');
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message ?? 'API load error');
          setRows([]);
          setSrc('none');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [symbol, availableSymbols]);

  // Detect data frequency and available timeframes
  const dataFrequency = useMemo(() => {
    if (!rows.length) return 'unknown';
    
    const sortedRows = [...rows].sort((a, b) => a.time - b.time);
    if (sortedRows.length < 2) return 'unknown';
    
    // Calculate time differences between consecutive data points
    const timeDiffs: number[] = [];
    for (let i = 1; i < Math.min(sortedRows.length, 10); i++) {
      const diff = (sortedRows[i]?.time ?? 0) - (sortedRows[i-1]?.time ?? 0);
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
        setTimeframe(availableTimeframes[0]?.value ?? '1D');
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

  // Create chart only once when container is ready
  useEffect(() => {
    // Early return for footprint style - don't create any chart
    if (style === 'footprint' as ChartStyle) {
      console.log('🚫 Skipping chart creation for footprint style');
      // Cleanup any existing chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      return;
    }

    const el = containerRef.current;
    if (!el) return;
    
    // Cleanup existing chart when style changes
    if (chartRef.current) {
      console.log('🗑️ Removing existing chart for style change');
      chartRef.current.remove();
      chartRef.current = null;
      priceRef.current = null;
      volRef.current = null;
    }

    console.log('📊 Creating lightweight-charts for style:', style);

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
      crosshair: { mode: style === 'footprint' as ChartStyle ? CrosshairMode.Hidden : CrosshairMode.Normal },
      handleScroll: style === 'footprint' as ChartStyle ? false : true,
      handleScale: style === 'footprint' as ChartStyle ? false : true,
    });
          // Reset indicator refs when recreating chart to avoid stale series handles
          indicatorRefs.current = {};
          indicatorAuxRefs.current = {};
        }, [style]);

  // Update chart data when data changes
  useEffect(() => {
    if (!chartRef.current || style === 'footprint' as ChartStyle) return;

    const chart = chartRef.current!;
    
    // Update timeScale visibility based on indicators
    const hasVisibleSeparateCharts = indicators.some(ind => ind.enabled && ind.separateScale);
    chart.timeScale().applyOptions({
      visible: !hasVisibleSeparateCharts
    });

    // bersihkan seri lama
    if (priceRef.current) { 
      try {
        chart.removeSeries(priceRef.current); 
      } catch (error) {
        console.warn('Error removing price series:', error);
      } finally {
        priceRef.current = null; 
      }
    }
    if (volRef.current) { 
      try {
        chart.removeSeries(volRef.current); 
      } catch (error) {
        console.warn('Error removing volume series:', error);
      } finally {
        volRef.current = null; 
      }
    }

    if (!filteredRows.length) { 
      console.log('No rows to plot');
      setPlotted(0); 
      return; 
    }

    console.log(`Rendering chart with ${filteredRows.length} rows, style: ${style}`);
    try {
      // --- price series (v5 pakai addSeries(TipeSeri, opsi)) ---
      if (style === 'line') {
        const s = chart.addSeries(AreaSeries, {
          lineColor: chartColors.area.line,
          topColor: chartColors.area.top,
          bottomColor: chartColors.area.bottom,
        });
        s.setData(filteredRows.map(d => ({ time: d.time as any, value: d.close })));
        priceRef.current = s;
      } else if (style === 'footprint' as ChartStyle) {
        // For footprint chart, we'll use a simple line series as base
        const s = chart.addSeries(LineSeries, {
          color: '#666666',
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        
        // Set minimal line data for chart structure
        const lineData = filteredRows.map(d => ({
          time: d.time as any,
          value: (d.open + d.close) / 2, // Use mid price
        }));
        s.setData(lineData);
        priceRef.current = s;
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
          if (chartRef.current) {
            try {
              if (indicatorRefs.current[indicator.id]) {
                chartRef.current?.removeSeries(indicatorRefs.current[indicator.id]);
              }
            } catch {}
          }
          delete indicatorRefs.current[indicator.id];
          // Remove any auxiliary series for this indicator
          if (indicatorAuxRefs.current[indicator.id] && chartRef.current) {
            try {
              indicatorAuxRefs.current[indicator.id]?.forEach(s => {
                try { chartRef.current?.removeSeries(s); } catch {}
              });
            } catch {}
          }
          delete indicatorAuxRefs.current[indicator.id];
          return;
        }
        
        // Skip separate scale indicators for main chart
        if (indicator.separateScale) return;
        
        let indicatorData: IndicatorData[] = [];
        
        switch (indicator.type) {
          case 'ma':
            if ((indicator.maMode || 'simple') === 'exponential') {
              indicatorData = calculateEMA(filteredRows, indicator.period);
            } else {
              indicatorData = calculateSMA(filteredRows, indicator.period);
            }
            break;
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
            const macdData = calculateMACD(filteredRows, 12, 26, 9);
            indicatorData = macdData.macd;
            break;
          case 'stochastic':
            const stochasticData = calculateStochastic(filteredRows, indicator.period, 3);
            // For main chart, we'll use %K line
            indicatorData = stochasticData.k;
            break;
          case 'volume_histogram':
            indicatorData = calculateVolumeHistogram(filteredRows);
            break;
          case 'buy_sell_frequency':
            const buySellData = calculateBuySellFrequency(filteredRows, indicator.period);
            indicatorData = buySellData.buyFreq;
            break;
        }
        
        if (indicatorData.length > 0) {
          // Remove existing series (and any aux) if they exist
          if (chartRef.current) {
            try {
              if (indicatorRefs.current[indicator.id]) {
                chartRef.current?.removeSeries(indicatorRefs.current[indicator.id]);
              }
            } catch {}
            if (indicatorAuxRefs.current[indicator.id]) {
              indicatorAuxRefs.current[indicator.id]?.forEach(s => {
                try { chartRef.current?.removeSeries(s); } catch {}
              });
              indicatorAuxRefs.current[indicator.id] = [];
            }
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
              time: d.time as any,
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
            indicatorSeries.setData(indicatorData.map(d => ({
              time: d.time as any,
              value: d.value
            })));
            
        // Add %D line for Stochastic Oscillator in main chart
        if (indicator.type === 'stochastic') {
          const stochasticData = calculateStochastic(filteredRows, indicator.period, 3);
          if (stochasticData.d.length > 0) {
            const dSeries = chart.addSeries(LineSeries, {
              color: stochasticSettings.dColor,
              lineWidth: 2,
              title: '%D (Signal)'
            });
            dSeries.setData(stochasticData.d.map(d => ({
              time: d.time as any,
              value: d.value
            })));
            // track aux
            if (!indicatorAuxRefs.current[indicator.id]) indicatorAuxRefs.current[indicator.id] = [];
            indicatorAuxRefs.current[indicator.id]?.push(dSeries);
          }
        }
        
        // Add signal line for MACD in main chart
        if (indicator.type === 'macd') {
          const macdData = calculateMACD(filteredRows, 12, 26, 9);
          if (macdData.signal.length > 0) {
            const signalSeries = chart.addSeries(LineSeries, {
              color: '#ff6b6b',
              lineWidth: 2,
              title: 'MACD Signal'
            });
            signalSeries.setData(macdData.signal.map(s => ({
              time: s.time as any,
              value: s.value
            })));
            if (!indicatorAuxRefs.current[indicator.id]) indicatorAuxRefs.current[indicator.id] = [];
            indicatorAuxRefs.current[indicator.id]?.push(signalSeries);
          }
        }
        
        // Add sell frequency line for Buy/Sell Frequency in main chart
        if (indicator.type === 'buy_sell_frequency') {
          const buySellData = calculateBuySellFrequency(filteredRows, indicator.period);
          if (buySellData.sellFreq.length > 0) {
            const sellSeries = chart.addSeries(LineSeries, {
              color: '#e74c3c',
              lineWidth: 2,
              title: 'Sell Frequency'
            });
            sellSeries.setData(buySellData.sellFreq.map(s => ({
              time: s.time as any,
              value: s.value
            })));
            if (!indicatorAuxRefs.current[indicator.id]) indicatorAuxRefs.current[indicator.id] = [];
            indicatorAuxRefs.current[indicator.id]?.push(sellSeries);
          }
        }
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
  }, [filteredRows, chartColors, volumeHistogramSettings, rsiSettings, stochasticSettings, style, indicators]);

  // Add chart listeners only once
  useEffect(() => {
    if (!chartRef.current || style === 'footprint' as ChartStyle) return;

    const chart = chartRef.current;
    
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
          // Sync with all indicator charts using direct crosshair positioning
          Object.values(indicatorChartRefs.current).forEach((indicatorChart, _index) => {
            if (indicatorChart) {
              try {
                // Try both time and logical positioning
                if ((indicatorChart as any).setCrosshairPosition) {
                  try {
                    (indicatorChart as any).setCrosshairPosition(param.time, param.seriesData || {});
                  } catch (timeError) {
                    try {
                      (indicatorChart as any).setCrosshairPosition(param.logical, param.seriesData || {});
                    } catch (logicalError) {
                      // Silent fail
                    }
                  }
                }
              } catch (error) {
                // Silent fail
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
  }, [style]);

  // Separate useEffect for footprint cleanup and chart recreation
  useEffect(() => {
    if (style === 'footprint' as ChartStyle && chartRef.current) {
      console.log('🧹 Cleaning up chart for footprint style');
      // Clean up series refs first
      priceRef.current = null;
      volRef.current = null;
      // Then remove chart
      chartRef.current.remove();
      chartRef.current = null;
    } else if (style !== 'footprint' as ChartStyle && !chartRef.current) {
      console.log('🔄 Force recreating chart after footprint switch');
      // Force recreation by resetting state
      setPlotted(0);
      setErr('');
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        // Trigger chart recreation by updating a dependency
        setPlotted(0);
      }, 50);
    }
  }, [style]);

  // Create separate charts for indicators
  useEffect(() => {
    // Skip indicator charts for footprint style
    if (style === 'footprint' as ChartStyle) {
      return;
    }
    
    const enabledSeparateIndicators = indicators.filter(ind => ind.enabled && ind.separateScale);
    
    indicators.forEach((indicator) => {
      // Remove chart if indicator is disabled
      if (!indicator.enabled) {
        if (indicatorChartRefs.current[indicator.id]) {
          const chart = indicatorChartRefs.current[indicator.id];
          if ((chart as any)._timeScaleUnsubscribe) {
            (chart as any)._timeScaleUnsubscribe();
          }
          chart?.remove();
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
        indicatorChartRefs.current[indicator.id]?.remove();
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
        crosshair: { mode: style === 'footprint' as ChartStyle ? CrosshairMode.Hidden : CrosshairMode.Normal },
      });
      
      // Calculate indicator data
      let indicatorData: IndicatorData[] = [];
      switch (indicator.type) {
        case 'rsi':
          indicatorData = calculateRSI(filteredRows, indicator.period);
          break;
        case 'macd':
          const macdData = calculateMACD(filteredRows, 12, 26, 9);
          indicatorData = macdData.macd;
          break;
        case 'stochastic':
          const stochasticData = calculateStochastic(filteredRows, indicator.period, 3);
          // For separate chart, we'll use %K line
          indicatorData = stochasticData.k;
          break;
        case 'volume_histogram':
          indicatorData = calculateVolumeHistogram(filteredRows);
          break;
        case 'buy_sell_frequency':
          const buySellData = calculateBuySellFrequency(filteredRows, indicator.period);
          indicatorData = buySellData.buyFreq;
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
            time: d.time as any,
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
        
        // Add reference lines for Stochastic Oscillator
        if (indicator.type === 'stochastic') {
          // Overbought line (80)
          indicatorSeries.createPriceLine({
            price: 80,
            color: '#ff6b6b',
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: 'Overbought (80)'
          });
          
          // Oversold line (20)
          indicatorSeries.createPriceLine({
            price: 20,
            color: '#4ecdc4',
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: 'Oversold (20)'
          });
          
          // Add %D line (signal line)
          const stochasticData = calculateStochastic(filteredRows, indicator.period, 3);
          if (stochasticData.d.length > 0) {
            const dSeries = indicatorChart.addSeries(LineSeries, {
              color: stochasticSettings.dColor,
              lineWidth: 2,
              title: '%D (Signal)'
            });
            
            const dChartData = stochasticData.d.map(d => ({
              time: d.time as any,
              value: d.value
            }));
            
            dSeries.setData(dChartData);
          }
        }
        
        // Add zero line and signal line for MACD
        if (indicator.type === 'macd') {
          indicatorSeries.createPriceLine({
            price: 0,
            color: '#666',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: 'Zero'
          });
          
          // Add signal line
          const macdData = calculateMACD(filteredRows, 12, 26, 9);
          if (macdData.signal.length > 0) {
            const signalSeries = indicatorChart.addSeries(LineSeries, {
              color: '#ff6b6b',
              lineWidth: 2,
              title: 'MACD Signal'
            });
            
            const signalChartData = macdData.signal.map(s => ({
              time: s.time as any,
              value: s.value
            }));
            
            signalSeries.setData(signalChartData);
          }
        }
        
        // Add sell frequency line for Buy/Sell Frequency in separate chart
        if (indicator.type === 'buy_sell_frequency') {
          const buySellData = calculateBuySellFrequency(filteredRows, indicator.period);
          if (buySellData.sellFreq.length > 0) {
            const sellSeries = indicatorChart.addSeries(LineSeries, {
              color: '#e74c3c',
              lineWidth: 2,
              title: 'Sell Frequency'
            });
            
            const sellChartData = buySellData.sellFreq.map(s => ({
              time: s.time as any,
              value: s.value
            }));
            
            sellSeries.setData(sellChartData);
          }
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
                
                // Try both time and logical positioning
                if (chartRef.current.setCrosshairPosition) {
                  try {
                    chartRef.current.setCrosshairPosition(param.time as any, param.seriesData as any, param.time as any);
                  } catch (timeError) {
                    console.log('Time positioning failed on main chart, trying logical:', timeError);
                    try {
                      chartRef.current.setCrosshairPosition(param.logical as any, param.seriesData as any, param.logical as any);
                    } catch (logicalError) {
                      console.log('Logical positioning also failed on main chart:', logicalError);
                    }
                  }
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
    // Skip resize observer for footprint style
    if (style === 'footprint' as ChartStyle) {
      return;
    }

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
  }, [style]);

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

  // Sync style from parent when provided
  useEffect(() => {
    if (styleProp && styleProp !== style) {
      setStyle(styleProp);
    }
  }, [styleProp, style]);

  // Sync timeframe from parent when provided
  useEffect(() => {
    if (timeframeProp && timeframeProp !== timeframe) {
      setTimeframe(timeframeProp as Timeframe);
    }
  }, [timeframeProp, timeframe]);

  return (
    <div className="flex flex-col space-y-2 h-full">
      <style>{`
        #tv-attr-logo {
          display: none !important;
        }
      `}</style>
      
      {!hideControls && (
        <Card className="p-4" ref={controlsContainerRef}>
        <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 items-start xl:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center w-full xl:w-auto">
            {/* Symbol/Ticker selector styled like BrokerInventoryPage */}
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium mb-2">Symbol:</label>
              <div className="relative" ref={searchRef}>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchDropdown(true);
                      setSearchDropdownIndex(-1);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search and select stocks..."
                    className="w-full pl-7 pr-8 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground z-20 pointer-events-auto"
                      onTouchStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔍 Clear button onTouchStart clicked - searchQuery before:', searchQuery);
                        setSearchQuery('');
                        setShowSearchDropdown(false);
                        setSearchDropdownIndex(-1);
                        console.log('🔍 Clear button onTouchStart clicked - searchQuery after: ""');
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔍 Clear button onPointerDown clicked - searchQuery before:', searchQuery);
                        setSearchQuery('');
                        setShowSearchDropdown(false);
                        setSearchDropdownIndex(-1);
                        console.log('🔍 Clear button onPointerDown clicked - searchQuery after: ""');
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔍 Clear button onMouseDown clicked - searchQuery before:', searchQuery);
                        setSearchQuery('');
                        setShowSearchDropdown(false);
                        setSearchDropdownIndex(-1);
                        console.log('🔍 Clear button onMouseDown clicked - searchQuery after: ""');
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔍 Clear button onClick clicked - searchQuery before:', searchQuery);
                        setSearchQuery('');
                        setShowSearchDropdown(false);
                        setSearchDropdownIndex(-1);
                        console.log('🔍 Clear button onClick clicked - searchQuery after: ""');
                      }}
                      aria-label="Clear search"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                
                {/* Combined Search and Select Dropdown */}
                {showSearchDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                    {isLoadingSymbols ? (
                      <div className="p-3 text-sm text-muted-foreground">Loading symbols...</div>
                    ) : (
                      <>
                        {/* Show filtered results if searching, otherwise show all available */}
                        {(searchQuery ? getFilteredSymbols() : symbols)
                          .slice(0, 15)
                          .map((symbol, index) => (
                            <button
                              key={symbol}
                              onClick={() => {
                                setSymbol(symbol);
                                setSearchQuery(symbol);
                                setShowSearchDropdown(false);
                                setSearchDropdownIndex(-1);
                              }}
                              className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${
                                index === searchDropdownIndex ? 'bg-accent' : ''
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: '#3B82F6' }}
                                ></div>
                                <span className="text-sm">{symbol}</span>
                              </div>
                              <Plus className="w-3 h-3 text-muted-foreground" />
                            </button>
                          ))}
                        
                        {/* Show "more available" message */}
                        {!searchQuery && symbols.length > 15 && (
                          <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                            +{symbols.length - 15} more stocks available (use search to find specific stocks)
                          </div>
                        )}
                        
                        {/* Show "no results" message */}
                        {searchQuery && getFilteredSymbols().length === 0 && (
                          <div className="p-2 text-sm text-muted-foreground">
                            No stocks found matching "{searchQuery}"
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium mb-2">Timeframe:</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {availableTimeframes.map(tf => (
                  <option key={tf.value} value={tf.value}>
                    {tf.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium mb-2">Chart Style:</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as ChartStyle)}
                  className="w-full sm:w-auto px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="line">Line</option>
                  <option value="candles">Candles</option>
                  <option value="footprint">Footprint</option>
                </select>
              <button
                onClick={() => setShowSettings(true)}
                className="hidden w-full sm:w-auto px-2 sm:px-3 py-1 text-xs sm:text-sm border border-border rounded-md bg-background text-foreground hover:bg-accent"
              >
                ⚙️ Settings
              </button>
             <button
               onClick={() => setShowSettings(true)}
               className="w-full sm:w-auto px-2 sm:px-3 py-1 text-xs sm:text-sm border border-border rounded-md bg-background text-foreground hover:bg-accent inline-flex items-center gap-2"
             >
               <SettingsIcon className="w-4 h-4" />
               <span>Settings</span>
             </button>
              <button
                onClick={() => setShowIndicatorSettings(true)}
                className="hidden w-full sm:w-auto px-2 sm:px-3 py-1 text-xs sm:text-sm border border-border rounded-md bg-background text-foreground hover:bg-accent"
              >
                📊 Indicators
              </button>
             <button
               onClick={() => setShowIndicatorSettings(true)}
               className="w-full sm:w-auto px-2 sm:px-3 py-1 text-xs sm:text-sm border border-border rounded-md bg-background text-foreground hover:bg-accent inline-flex items-center gap-2"
             >
               <BarChart2 className="w-4 h-4" />
               <span>Indicators</span>
             </button>
            </div>
          </div>

          {/* Right-side space previously used for price is removed; price moved onto chart overlay */}
        </div>
        </div>
        </Card>
      )}

      <Card className="flex-1 p-0 relative" style={{ padding: 0, margin: 0, height: chartViewportHeight }}>
        {/* Price overlay (top-left) for better focus on mobile/desktop */}
        <div className="absolute top-2 left-2 z-10 bg-background/80 backdrop-blur-sm border border-border rounded px-2 py-1">
          <div className="font-mono text-xs sm:text-sm font-medium">{latest ? latest.close.toLocaleString() : '-'}</div>
          <div className={`text-xs sm:text-sm font-medium ${chg >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {chg >= 0 ? '+' : ''}{chg.toFixed(0)} ({chgPct.toFixed(2)}%)
          </div>
        </div>
        <ChartErrorBoundary>
          {style === 'footprint' ? (
            <div className="w-full h-full" style={{ height: '100%', padding: 0, margin: 0 }}>
              <FootprintChart 
                showCrosshair={footprintSettings.showCrosshair}
                showPOC={footprintSettings.showPOC}
                showDelta={footprintSettings.showDelta}
                timeframe={footprintSettings.timeframe}
                zoom={footprintSettings.zoom}
                ohlc={filteredRows.map(d => ({
                  timestamp: new Date((d.time || 0) * 1000).toISOString(),
                  open: d.open,
                  high: d.high,
                  low: d.low,
                  close: d.close
                }))}
              />
        </div>
          ) : (
            <div 
              ref={containerRef} 
              className="h-full w-full"
            />
          )}
        </ChartErrorBoundary>
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
              className="w-full"
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
            {/* Line Chart Colors (Area Chart) */}
            {style === 'line' && (
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
                  <label className="text-xs font-medium text-muted-foreground">Top Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={chartColors.area.top}
                      onChange={(e) => setChartColors(prev => ({ 
                        ...prev, 
                        area: { ...prev.area, top: e.target.value }
                      }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{chartColors.area.top}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Bottom Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={chartColors.area.bottom}
                      onChange={(e) => setChartColors(prev => ({ 
                        ...prev, 
                        area: { ...prev.area, bottom: e.target.value }
                      }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{chartColors.area.bottom}</span>
                  </div>
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


            {/* Footprint Chart Settings */}
            {style === 'footprint' && (
              <div className="space-y-3 border-t border-border pt-3">
                <h4 className="text-xs font-medium text-muted-foreground">Footprint Chart Settings</h4>
                
                {/* Display Controls */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Show Crosshair</label>
                    <input
                      type="checkbox"
                      checked={footprintSettings.showCrosshair}
                      onChange={(e) => setFootprintSettings(prev => ({ ...prev, showCrosshair: e.target.checked }))}
                      className="w-3 h-3"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Show POC</label>
                    <input
                      type="checkbox"
                      checked={footprintSettings.showPOC}
                      onChange={(e) => setFootprintSettings(prev => ({ ...prev, showPOC: e.target.checked }))}
                      className="w-3 h-3"
                    />
                </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Show Delta</label>
                    <input
                      type="checkbox"
                      checked={footprintSettings.showDelta}
                      onChange={(e) => setFootprintSettings(prev => ({ ...prev, showDelta: e.target.checked }))}
                      className="w-3 h-3"
                    />
                  </div>
                </div>
                
                {/* Timeframe Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Timeframe</label>
                  <select
                    value={footprintSettings.timeframe}
                    onChange={(e) => setFootprintSettings(prev => ({ ...prev, timeframe: e.target.value }))}
                    className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  >
                    <option value="1m">1 Minute</option>
                    <option value="5m">5 Minutes</option>
                    <option value="15m">15 Minutes</option>
                    <option value="30m">30 Minutes</option>
                    <option value="1h">1 Hour</option>
                    <option value="4h">4 Hours</option>
                    <option value="1d">1 Day</option>
                  </select>
                </div>
                
                {/* Zoom Control */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Zoom Level</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={footprintSettings.zoom}
                      onChange={(e) => setFootprintSettings(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono w-12 text-right">
                      {footprintSettings.zoom.toFixed(1)}x
                    </span>
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
                    onClick={() => setShowSettings(false)}
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
                <div className="max-h-48 overflow-y-auto space-y-2">
                  <button
                    onClick={() => addIndicator('ma', '#45b7d1', false, 'simple')}
                    className="w-full px-3 py-2 text-xs border border-border rounded hover:bg-accent text-left"
                  >
                    Moving Average (MA)
                  </button>
                  <button
                    onClick={() => addIndicator('rsi', '#6c5ce7', true)}
                    className="w-full px-3 py-2 text-xs border border-border rounded hover:bg-accent text-left"
                  >
                    Relative Strength Index
                  </button>
                  <button
                    onClick={() => addIndicator('macd', '#e17055', true)}
                    className="w-full px-3 py-2 text-xs border border-border rounded hover:bg-accent text-left"
                  >
                    Moving Average Convergence Divergence
                  </button>
                  <button
                    onClick={() => addIndicator('stochastic', '#9b59b6', true)}
                    className="w-full px-3 py-2 text-xs border border-border rounded hover:bg-accent text-left"
                  >
                    Stochastic Oscillator
                  </button>
                  <button
                    onClick={() => addIndicator('volume_histogram', '#e67e22', false)}
                    className="w-full px-3 py-2 text-xs border border-border rounded hover:bg-accent text-left"
                  >
                    Volume Histogram
                  </button>
                  <button
                    onClick={() => addIndicator('buy_sell_frequency', '#8e44ad', true)}
                    className="w-full px-3 py-2 text-xs border border-border rounded hover:bg-accent text-left"
                  >
                    Buy / Sell Frequency
                  </button>
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
});

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
      case 'ma':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Period</label>
              <input
                type="number"
                value={editedIndicator.period}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, period: parseInt(e.target.value) || (prev.period || 20) }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                min="1"
                max="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Mode</label>
              <select
                value={editedIndicator.maMode || 'simple'}
                onChange={(e) => setEditedIndicator(prev => ({ 
                  ...prev, 
                  type: 'ma',
                  maMode: (e.target.value as 'simple' | 'exponential'),
                  name: `MA (${e.target.value === 'exponential' ? 'Exponential' : 'Simple'})`
                }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="simple">Simple</option>
                <option value="exponential">Exponential</option>
              </select>
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
                      onChange={(e) => setVolumeHistogramSettings((prev: any) => ({ ...prev, upColor: e.target.value }))}
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
                      onChange={(e) => setVolumeHistogramSettings((prev: any) => ({ ...prev, downColor: e.target.value }))}
                      className="w-8 h-6 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{volumeHistogramSettings.downColor}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'buy_sell_frequency':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Line Color</label>
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
              <label className="block text-sm font-medium mb-2">Period</label>
              <input
                type="number"
                value={editedIndicator.period}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, period: parseInt(e.target.value) || 14 }))}
                min="1"
                max="100"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Chart Type</label>
              <select
                value={editedIndicator.separateScale ? 'separate' : 'overlay'}
                onChange={(e) => setEditedIndicator(prev => ({ ...prev, separateScale: e.target.value === 'separate' }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="overlay">Overlay on Price</option>
                <option value="separate">Separate Chart</option>
              </select>
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


