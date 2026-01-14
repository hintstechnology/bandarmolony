import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CandlestickBar } from './CandlestickBar';
import { Crosshair } from './Crosshair';
import { Axis } from './Axis';
import { api } from '../../services/api';
import { Loader2 } from 'lucide-react';

export interface VolumeLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  originalPrices?: number[]; // For debugging - shows which prices were grouped into this bucket
}

export interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeLevels: VolumeLevel[];
  pocBid: number; // Point of Control for Bid - price with highest bid volume
  pocAsk: number; // Point of Control for Ask - price with highest ask volume
}

// External OHLC input (align with candlestick chart input)
export interface OhlcInputCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CrosshairData {
  x: number;
  y: number;
  price: number;
  time: string;
  bidVol: number;
  askVol: number;
  delta: number;
  visible: boolean;
}

// Format volume with appropriate prefix (K/M/B/T)
export const formatVolume = (volume: number): string => {
  if (volume === 0) return '0';

  const absVolume = Math.abs(volume);

  if (absVolume >= 1e12) {
    return (volume / 1e12).toFixed(1) + 'T';
  } else if (absVolume >= 1e9) {
    return (volume / 1e9).toFixed(1) + 'B';
  } else if (absVolume >= 1e6) {
    return (volume / 1e6).toFixed(1) + 'M';
  } else if (absVolume >= 1e3) {
    return (volume / 1e3).toFixed(1) + 'K';
  } else {
    return volume.toString();
  }
};

// Convert API footprint data to CandleData format
const convertFootprintDataToCandleData = (footprintData: Array<{ Price: number; BLot?: number; SLot?: number; BidVolume?: number; AskVolume?: number; date?: string }>, ohlc?: OhlcInputCandle[]): CandleData[] => {
  if (!ohlc || ohlc.length === 0) {
    // If no OHLC data, group by date and create candles from footprint data
    const dataByDate: { [date: string]: Array<{ Price: number; bidVolume: number; askVolume: number }> } = {};

    footprintData.forEach(record => {
      const date = record.date || 'unknown';
      if (!dataByDate[date]) {
        dataByDate[date] = [];
      }

      // Use BLot/SLot if available, otherwise fallback to BidVolume/AskVolume
      const bidVolume = record.BLot ?? record.BidVolume ?? 0;
      const askVolume = record.SLot ?? record.AskVolume ?? 0;

      dataByDate[date].push({
        Price: record.Price,
        bidVolume,
        askVolume
      });
    });

    const result: CandleData[] = [];

    Object.entries(dataByDate).forEach(([date, dayData]) => {
      if (dayData.length === 0) return;

      // Step 1: Detect dominant price interval
      const prices = dayData.map(d => d.Price).filter(p => p !== undefined).sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        const diff = prices[i]! - prices[i - 1]!;
        if (diff > 0) intervals.push(diff);
      }

      // Find most common interval (dominant tick size)
      const intervalCounts: { [key: number]: number } = {};
      intervals.forEach(interval => {
        intervalCounts[interval] = (intervalCounts[interval] || 0) + 1;
      });

      // Get dominant interval (most frequent)
      let dominantInterval = 25; // Default
      let maxCount = 0;
      Object.entries(intervalCounts).forEach(([interval, count]) => {
        if (count > maxCount) {
          maxCount = count;
          dominantInterval = parseFloat(interval);
        }
      });

      // Step 2: Create price buckets based on dominant interval
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const basePrice = Math.floor(minPrice / dominantInterval) * dominantInterval;

      // Step 3: Group data into buckets
      const buckets: { [bucketPrice: number]: { bidVolume: number; askVolume: number; prices: number[] } } = {};

      dayData.forEach(d => {
        const price = d.Price;
        const bidVolume = d.bidVolume;
        const askVolume = d.askVolume;

        // Calculate which bucket this price belongs to
        const bucketIndex = Math.round((price - basePrice) / dominantInterval);
        const bucketPrice = basePrice + (bucketIndex * dominantInterval);

        if (!buckets[bucketPrice]) {
          buckets[bucketPrice] = { bidVolume: 0, askVolume: 0, prices: [] };
        }

        buckets[bucketPrice].bidVolume += bidVolume;
        buckets[bucketPrice].askVolume += askVolume;
        buckets[bucketPrice].prices.push(price);
      });

      // Step 4: Convert buckets to volume levels
      const volumeLevels = Object.entries(buckets)
        .map(([bucketPrice, data]) => ({
          price: parseFloat(bucketPrice),
          bidVolume: data.bidVolume,
          askVolume: data.askVolume,
          totalVolume: data.bidVolume + data.askVolume,
          originalPrices: data.prices
        }))
        .sort((a, b) => a.price - b.price);

      const avgPrice = (minPrice + maxPrice) / 2;

      // Calculate POC safely
      let pocBid = avgPrice;
      let pocAsk = avgPrice;
      if (volumeLevels.length > 0) {
        let maxBidVolume = volumeLevels[0]!.bidVolume;
        pocBid = volumeLevels[0]!.price;
        for (const level of volumeLevels) {
          if (level.bidVolume > maxBidVolume) {
            maxBidVolume = level.bidVolume;
            pocBid = level.price;
          }
        }
        let maxAskVolume = volumeLevels[0]!.askVolume;
        pocAsk = volumeLevels[0]!.price;
        for (const level of volumeLevels) {
          if (level.askVolume > maxAskVolume) {
            maxAskVolume = level.askVolume;
            pocAsk = level.price;
          }
        }
      }

      console.log(`📊 No OHLC: Created ${volumeLevels.length} volume levels for ${date}, dominant interval: ${dominantInterval}`);

      result.push({
        timestamp: new Date(date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6, 8)).toISOString(),
        open: avgPrice,
        high: maxPrice,
        low: minPrice,
        close: avgPrice,
        volumeLevels,
        pocBid,
        pocAsk
      });
    });

    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // Convert OHLC data to CandleData with footprint volume levels
  return ohlc.map(candle => {
    // Extract date from candle timestamp (YYYY-MM-DD -> YYYYMMDD)
    const candleDate = candle.timestamp.slice(0, 10).replace(/-/g, '');

    // Filter footprint data by BOTH date AND price range
    const candleFootprint = footprintData.filter(d => {
      // Match date first
      const matchesDate = d.date === candleDate;
      // Then match price range
      const matchesPrice = d.Price >= candle.low && d.Price <= candle.high;

      return matchesDate && matchesPrice;
    });

    if (candleFootprint.length === 0) {
      console.log(`📊 No bidask data for candle date ${candleDate}`);
      return {
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volumeLevels: [],
        pocBid: candle.close,
        pocAsk: candle.close
      };
    }

    // Step 1: Detect dominant price interval
    const prices = candleFootprint.map(d => d.Price).filter(p => p !== undefined).sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const diff = prices[i]! - prices[i - 1]!;
      if (diff > 0) intervals.push(diff);
    }

    // Find most common interval (dominant tick size)
    const intervalCounts: { [key: number]: number } = {};
    intervals.forEach(interval => {
      intervalCounts[interval] = (intervalCounts[interval] || 0) + 1;
    });

    // Get dominant interval (most frequent)
    let dominantInterval = 25; // Default for BBCA
    let maxCount = 0;
    Object.entries(intervalCounts).forEach(([interval, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantInterval = parseFloat(interval);
      }
    });

    console.log(`📊 Detected dominant interval: ${dominantInterval} for ${candleDate}, intervals:`, intervalCounts);

    // Step 2: Create price buckets based on dominant interval
    // Find the base price (closest to candle.low that aligns with interval)
    const minPrice = Math.min(...prices);
    const basePrice = Math.floor(minPrice / dominantInterval) * dominantInterval;

    // Step 3: Group data into buckets
    const buckets: { [bucketPrice: number]: { bidVolume: number; askVolume: number; prices: number[] } } = {};

    candleFootprint.forEach(d => {
      const price = d.Price;
      const bidVolume = d.BLot ?? d.BidVolume ?? 0;
      const askVolume = d.SLot ?? d.AskVolume ?? 0;

      // Calculate which bucket this price belongs to
      const bucketIndex = Math.round((price - basePrice) / dominantInterval);
      const bucketPrice = basePrice + (bucketIndex * dominantInterval);

      if (!buckets[bucketPrice]) {
        buckets[bucketPrice] = { bidVolume: 0, askVolume: 0, prices: [] };
      }

      buckets[bucketPrice].bidVolume += bidVolume;
      buckets[bucketPrice].askVolume += askVolume;
      buckets[bucketPrice].prices.push(price);
    });

    // Step 4: Convert buckets to volume levels
    const volumeLevels: VolumeLevel[] = Object.entries(buckets)
      .map(([bucketPrice, data]) => ({
        price: parseFloat(bucketPrice),
        bidVolume: data.bidVolume,
        askVolume: data.askVolume,
        totalVolume: data.bidVolume + data.askVolume,
        // Store original prices for debugging
        originalPrices: data.prices
      }))
      .sort((a, b) => a.price - b.price);

    // Calculate POC safely
    let pocBid = candle.close;
    let pocAsk = candle.close;
    if (volumeLevels.length > 0) {
      let maxBidVolume = volumeLevels[0]!.bidVolume;
      pocBid = volumeLevels[0]!.price;
      for (const level of volumeLevels) {
        if (level.bidVolume > maxBidVolume) {
          maxBidVolume = level.bidVolume;
          pocBid = level.price;
        }
      }
      let maxAskVolume = volumeLevels[0]!.askVolume;
      pocAsk = volumeLevels[0]!.price;
      for (const level of volumeLevels) {
        if (level.askVolume > maxAskVolume) {
          maxAskVolume = level.askVolume;
          pocAsk = level.price;
        }
      }
    }

    console.log(`📊 Created ${volumeLevels.length} volume levels (from ${candleFootprint.length} records) for ${candleDate}, interval: ${dominantInterval}`);

    return {
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volumeLevels,
      pocBid,
      pocAsk
    };
  });
};

// Note: Removed generateDataFromOHLC function - chart now only uses actual bidask data

interface FootprintChartProps {
  showCrosshair?: boolean;
  showPOC?: boolean;
  showDelta?: boolean;
  timeframe?: string;
  zoom?: number;
  verticalScaleProp?: number;
  onVerticalScaleChange?: (scale: number) => void;
  horizontalScaleProp?: number;
  onHorizontalScaleChange?: (scale: number) => void;
  ohlc?: OhlcInputCandle[]; // External OHLC input to mirror candlestick chart
  stockCode?: string; // Stock code for API data
  date?: string; // Date for API data
}

type DateRangeOption = '7' | '14' | '30' | '60' | '90' | 'all';

interface FootprintApiResponse {
  success: boolean;
  data?: {
    code: string;
    date: string;
    data: Array<{
      Price: number;
      BLot?: number;
      SLot?: number;
      BidVolume?: number;
      AskVolume?: number;
      NetVolume: number;
      TotalVolume: number;
      BidCount: number;
      AskCount: number;
      UniqueBidBrokers: number;
      UniqueAskBrokers: number;
    }>;
    total: number;
    generated_at: string;
  };
  error?: string;
}

export const FootprintChart: React.FC<FootprintChartProps> = React.memo(({
  showCrosshair: propShowCrosshair,
  showPOC: propShowPOC,
  showDelta: propShowDelta,
  // timeframe: propTimeframe,
  zoom: propZoom,
  verticalScaleProp,
  onVerticalScaleChange,
  horizontalScaleProp,
  onHorizontalScaleChange,
  ohlc,
  stockCode,
  date
}) => {
  const [data, setData] = useState<CandleData[]>([]);
  const previousDataLengthRef = useRef<number>(0);
  const [crosshair, setCrosshair] = useState<CrosshairData>({
    x: 0, y: 0, price: 0, time: '', bidVol: 0, askVol: 0, delta: 0, visible: false
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy loading state
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [currentDate, setCurrentDate] = useState<string>(date || '');
  const [loadedDates, setLoadedDates] = useState<string[]>([]);
  const [allBidAskData, setAllBidAskData] = useState<any[]>([]);
  const [isUserScrolling, setIsUserScrolling] = useState<boolean>(false);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);

  // Date range selector state
  const [dateRange, setDateRange] = useState<DateRangeOption>('14');

  // Chart dimensions and layout - responsive
  // Use measured container height instead of a fixed window-based constant
  // const PRICE_LEVEL_HEIGHT = 16;

  const [showCrosshair, setShowCrosshair] = useState(propShowCrosshair ?? true);
  const [showPOC, setShowPOC] = useState(propShowPOC ?? true);
  const [showDelta, setShowDelta] = useState(propShowDelta ?? false);
  // const [timeframe, setTimeframe] = useState(propTimeframe ?? '15m');
  const [zoom, setZoom] = useState(propZoom ?? 1.1);

  // Chart scroll state - moved up to avoid initialization error
  const [scrollX, setScrollX] = useState(0);

  // Initial load - load first 14 candles worth of data starting from today
  useEffect(() => {
    const loadInitialData = async () => {
      if (!stockCode) {
        // No stock code provided, show empty chart
        setData([]);
        return;
      }

      setIsLoading(true);
      setError(null);
      setIsInitialLoad(true); // Reset initial load flag for new stock

      // Start from today's date instead of provided date
      const today = new Date();
      const todayString = today.toISOString().slice(0, 10).replace(/-/g, '');
      setCurrentDate(todayString);
      setLoadedDates([]);
      setAllBidAskData([]);

      try {
        console.log(`📊 Loading initial bid/ask data for ${stockCode} starting from today (${todayString})`);
        await loadNextBatch();
      } catch (err) {
        console.error('Error loading initial footprint data:', err);
        setError('Failed to load footprint data');
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [stockCode, ohlc, dateRange]); // Added dateRange dependency

  // Load next batch of data based on date range
  const loadNextBatch = async () => {
    if (!stockCode || !currentDate || isLoadingMore) return;

    setIsLoadingMore(true);

    try {
      // Determine max attempts based on date range selector
      const maxAttempts = dateRange === 'all' ? 90 : parseInt(dateRange);
      let attempts = 0;
      let currentDateToLoad = currentDate;
      let newBidAskData: any[] = [];
      let foundData = false;

      console.log(`📊 Loading ${maxAttempts} days of data (date range: ${dateRange})`);

      while (attempts < maxAttempts) {
        // Skip if we already loaded this date
        if (loadedDates.includes(currentDateToLoad)) {
          const currentDateObj = new Date(currentDateToLoad.slice(0, 4) + '-' + currentDateToLoad.slice(4, 6) + '-' + currentDateToLoad.slice(6, 8));
          currentDateObj.setDate(currentDateObj.getDate() - 1);
          currentDateToLoad = currentDateObj.toISOString().slice(0, 10).replace(/-/g, '');
          attempts++;
          continue;
        }

        const response = await api.getBidAskData(stockCode, currentDateToLoad);

        if (response.success && response.data?.data && response.data.data.length > 0) {
          const apiData = response.data.data;
          console.log(`📊 Retrieved ${apiData.length} bid/ask records for ${stockCode} on ${currentDateToLoad}`);

          const dataWithDate = apiData.map((record: any) => ({
            ...record,
            date: currentDateToLoad
          }));

          newBidAskData = [...newBidAskData, ...dataWithDate];
          setLoadedDates(prev => [...prev, currentDateToLoad]);
          foundData = true;
        }

        // Move to previous day
        attempts++;
        const currentDateObj = new Date(currentDateToLoad.slice(0, 4) + '-' + currentDateToLoad.slice(4, 6) + '-' + currentDateToLoad.slice(6, 8));
        currentDateObj.setDate(currentDateObj.getDate() - 1);
        currentDateToLoad = currentDateObj.toISOString().slice(0, 10).replace(/-/g, '');

        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (foundData && newBidAskData.length > 0) {
        // Update data atomically to prevent race conditions
        setAllBidAskData(prev => {
          const updatedData = [...prev, ...newBidAskData];
          console.log(`📊 Loaded batch: ${newBidAskData.length} records, total: ${updatedData.length}`);

          // Convert all data to CandleData format and sort by date (newest first)
          const convertedData = convertFootprintDataToCandleData(updatedData, ohlc);

          // Use setTimeout to ensure state update happens after current render cycle
          setTimeout(() => {
            setData(convertedData);
            console.log(`📊 Data updated: ${convertedData.length} candles`);
          }, 0);

          return updatedData;
        });

        // Update current date for next batch (continue loading)
        setCurrentDate(currentDateToLoad);
        console.log(`📊 Ready for next batch from ${currentDateToLoad}`);
      } else {
        console.log(`📊 No bid/ask data found for ${stockCode} in this batch`);
      }

    } catch (err) {
      console.error('Error loading next batch:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Theme detection
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Chart dimensions
  const [chartWidth, setChartWidth] = useState(800);
  const [chartHeight, setChartHeight] = useState(400);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'zoom'>('none');
  const [verticalScale, setVerticalScaleInternal] = useState(verticalScaleProp ?? 10);
  const [horizontalScale, setHorizontalScaleInternal] = useState(horizontalScaleProp ?? 1.5);

  // Sync with props
  useEffect(() => {
    if (verticalScaleProp !== undefined && verticalScaleProp !== verticalScale) {
      setVerticalScaleInternal(verticalScaleProp);
    }
  }, [verticalScaleProp]);

  useEffect(() => {
    if (horizontalScaleProp !== undefined && horizontalScaleProp !== horizontalScale) {
      setHorizontalScaleInternal(horizontalScaleProp);
    }
  }, [horizontalScaleProp]);

  const setVerticalScale = useCallback((newScale: number | ((prev: number) => number)) => {
    setVerticalScaleInternal(prev => {
      const next = typeof newScale === 'function' ? newScale(prev) : newScale;
      onVerticalScaleChange?.(next);
      return next;
    });
  }, [onVerticalScaleChange]);

  const setHorizontalScale = useCallback((newScale: number | ((prev: number) => number)) => {
    setHorizontalScaleInternal(prev => {
      const next = typeof newScale === 'function' ? newScale(prev) : newScale;
      onHorizontalScaleChange?.(next);
      return next;
    });
  }, [onHorizontalScaleChange]);

  // Chart dimensions with scaling
  const CANDLE_WIDTH = 120 * horizontalScale; // Apply horizontal scaling

  // const [containerHeight, setContainerHeight] = useState(400);
  // const [isDoubleClicking, setIsDoubleClicking] = useState(false);
  const [lastPinchDistance, setLastPinchDistance] = useState(0);
  // const [isPinching, setIsPinching] = useState(false);
  const [showPanIndicator, setShowPanIndicator] = useState(false);

  // Sync props with state
  useEffect(() => {
    if (propShowCrosshair !== undefined) setShowCrosshair(propShowCrosshair);
    if (propShowPOC !== undefined) setShowPOC(propShowPOC);
    if (propShowDelta !== undefined) setShowDelta(propShowDelta);
    // if (propTimeframe !== undefined) setTimeframe(propTimeframe);
    if (propZoom !== undefined) setZoom(propZoom);
  }, [propShowCrosshair, propShowPOC, propShowDelta, propZoom]);

  // Theme detection
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  // Update chart dimensions
  useEffect(() => {
    const updateDimensions = () => {
      const container = chartRef.current?.parentElement; // Get the chart container directly
      if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Set chart dimensions to fill the container
        setChartWidth(containerWidth - 64); // Subtract Y-axis width
        const h = Math.max(200, containerHeight - 24);
        setChartHeight(h); // Subtract X-axis height
        // Center bars using chart container size / 2
        setScrollY(Math.round(containerHeight / 2));

        // Update container height state
        // setContainerHeight(containerHeight);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Auto scroll to first bar (most recent) ONLY on initial load
  useEffect(() => {
    if (data.length > 0 && isInitialLoad) {
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const rightMargin = CANDLE_WIDTH * 1; // 1 bar width margin to prevent rightmost bar from being too close to Y-axis

      // To show the first bar (most recent) on the RIGHT side of the screen:
      // We need to scroll to the RIGHTMOST position with 1 bar margin
      // Calculate total width of all bars
      const totalBarsWidth = data.length * CANDLE_WIDTH;

      // Calculate scroll position to show the rightmost part (first bar on the right) with 1 bar spacing
      const rightmostPosition = Math.max(0, totalBarsWidth - screenWidth + rightMargin);

      // Temporarily disable user scrolling flag to prevent auto-loading
      setIsUserScrolling(false);
      setScrollX(rightmostPosition);
      setIsInitialLoad(false); // Mark initial load as complete
      previousDataLengthRef.current = data.length; // Update ref

      console.log(`📊 Initial scroll to RIGHTMOST position: ${rightmostPosition} (total width: ${totalBarsWidth}, screen: ${screenWidth}, margin: ${rightMargin}px = 1 bar)`);
    }
  }, [data.length, CANDLE_WIDTH, isInitialLoad]);

  // Adjust scroll position when data length changes (for lazy loading)
  useEffect(() => {
    if (!isInitialLoad && data.length > previousDataLengthRef.current && previousDataLengthRef.current > 0) {
      const addedBars = data.length - previousDataLengthRef.current;
      const scrollAdjustment = addedBars * CANDLE_WIDTH;

      setScrollX(prev => {
        const newScrollX = prev + scrollAdjustment;
        console.log(`📊 Scroll preserved: ${prev} → ${newScrollX} (+${addedBars} bars)`);
        return newScrollX;
      });
    }

    // Update ref for next time
    previousDataLengthRef.current = data.length;
  }, [data.length, CANDLE_WIDTH, isInitialLoad]);

  // Set initial horizontal scale to match double-click reset value (1.5)
  useEffect(() => {
    if (data.length > 0 && isInitialLoad) {
      const defaultScale = 1.5; // Same as double-click reset
      setHorizontalScale(defaultScale);
      console.log(`📊 Initial horizontal scale set to reset value: ${defaultScale} (${Math.round(defaultScale * 100)}%)`);
    }
  }, [data.length, isInitialLoad]);


  // Scroll-based lazy loading trigger - disabled when using date range selector
  // Data is loaded once based on selected range
  useEffect(() => {
    // Disabled lazy loading - all data loaded based on date range selector
    return undefined;
  }, [scrollX, isLoadingMore, data.length, CANDLE_WIDTH, isUserScrolling]);

  // Get theme colors from the main app (unused for now)
  // const getThemeColors = () => {
  //   const isDark = document.documentElement.classList.contains('dark');
  //   return {
  //     textColor: isDark ? '#f9fafb' : '#111827',
  //     gridColor: isDark ? '#4b5563' : '#e5e7eb',
  //     borderColor: isDark ? '#6b7280' : '#d1d5db',
  //     axisTextColor: isDark ? '#d1d5db' : '#6b7280',
  //     backgroundColor: isDark ? '#131722' : '#FFFFFF',
  //     cardBackground: isDark ? '#1E222D' : '#FFFFFF',
  //     cardBorder: isDark ? '#2A2E39' : '#E1E3E6'
  //   };
  // };

  // const themeColors = getThemeColors();

  const chartRef = useRef<HTMLDivElement>(null);

  // Update container height on mount and resize
  // useEffect(() => {
  //   const updateHeight = () => {
  //     setContainerHeight(window.innerHeight - 80);
  //   };

  //   updateHeight();
  //   window.addEventListener('resize', updateHeight);
  //   return () => window.removeEventListener('resize', updateHeight);
  // }, []);

  // Auto-scroll to show the last candles by default with 5% right margin
  const totalBars = data.length;
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  // const visibleBars = Math.floor(screenWidth / CANDLE_WIDTH);
  const rightMargin = screenWidth * 0.1; // 10% of screen width for better margin
  // Calculate position to show the very last bar with margin
  const lastCandlePosition = Math.max(0, totalBars * CANDLE_WIDTH - screenWidth + rightMargin);

  // Start with scrollY to center bars
  const [scrollY, setScrollY] = useState(0);

  // Calculate price range
  const allPrices = data.flatMap(candle =>
    candle.volumeLevels.map(level => level.price)
  );
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 1000;
  const priceRange = maxPrice - minPrice;

  // Set initial vertical scale to optimal density (no overlap) and center Y-axis
  useEffect(() => {
    if (data.length === 0 || !isInitialLoad || chartHeight === 0) return; // Only run on initial load

    // Calculate optimal vertical scale based on data density
    const allPricesFromData: number[] = [];
    data.forEach(candle => {
      allPricesFromData.push(candle.high, candle.low);
      candle.volumeLevels.forEach(level => allPricesFromData.push(level.price));
    });

    if (allPricesFromData.length > 0) {
      const dataMinPrice = Math.min(...allPricesFromData);
      const dataMaxPrice = Math.max(...allPricesFromData);

      // Calculate total volume levels across all candles
      const totalVolumeLevels = data.reduce((sum, candle) => sum + candle.volumeLevels.length, 0);
      const averageLevelsPerCandle = totalVolumeLevels / data.length;

      // Calculate optimal scale for maximum density without overlap
      // Each volume bar is 20px tall, we want them to be as close as possible without overlapping
      const barHeight = 20; // Fixed volume bar height
      const maxBarsPerScreen = Math.floor(chartHeight / barHeight);

      // Calculate minimum scale needed to fit all bars without overlap
      const minScaleForNoOverlap = maxBarsPerScreen / Math.max(1, averageLevelsPerCandle);

      // Use default scale instead of calculated optimal
      const defaultScale = 2.4;

      console.log(`📊 Using default vertical scale: ${defaultScale} (${averageLevelsPerCandle.toFixed(1)} levels/candle, ${maxBarsPerScreen} bars fit)`);
      setVerticalScale(defaultScale);

      // Center Y-axis based on actual price range
      const middlePrice = (dataMinPrice + dataMaxPrice) / 2;
      const totalContentHeight = chartHeight * defaultScale;
      const centerPosition = (totalContentHeight - chartHeight) / 2;

      setScrollY(centerPosition);
      console.log(`📊 Initial Y-axis centered: scrollY=${centerPosition.toFixed(0)}, price range: ${dataMinPrice}-${dataMaxPrice} (middle: ${middlePrice})`);
    } else {
      // Fallback to default scale
      const defaultScale = 2.4;
      console.log(`📊 Using fallback vertical scale: ${defaultScale}`);
      setVerticalScale(defaultScale);
    }
  }, [data.length, isInitialLoad, chartHeight]);

  // Debug effect to track data changes and ensure rendering
  useEffect(() => {
    if (data.length > 0) {
      console.log(`📊 Data state updated: ${data.length} candles, volume levels: ${data.reduce((sum, candle) => sum + candle.volumeLevels.length, 0)}`);

      // Force re-render by updating a dummy state if needed
      if (data.some(candle => candle.volumeLevels.length === 0)) {
        console.warn(`📊 Warning: Some candles have no volume levels!`);
      }
    }
  }, [data]);

  // Fixed bar height - volume bars always 20px tall regardless of scaling
  const dynamicBarHeight = 20;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!chartRef.current || !showCrosshair) return;

    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate which candle
    const candleIndex = Math.floor((x + scrollX) / CANDLE_WIDTH);

    if (candleIndex >= 0 && candleIndex < data.length) {
      const candle = data[candleIndex];
      if (!candle) return;

      // Visual-based detection: Check if mouse is over any volume bar element
      const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);

      // Look for volume bar elements (they have specific data attributes)
      let detectedLevel: VolumeLevel | null = null;
      let detectedY = y;

      // Check if we're over a volume bar by looking for elements with volume data
      for (const element of elementsAtPoint) {
        // Check if this is a volume bar element by looking for data attributes or classes
        if (element.getAttribute('data-volume-level') === 'true' ||
          element.classList.contains('volume-bar')) {

          // Extract volume data from the element
          const price = parseFloat(element.getAttribute('data-price') || '0');
          const bidVol = parseInt(element.getAttribute('data-bid-volume') || '0');
          const askVol = parseInt(element.getAttribute('data-ask-volume') || '0');

          // Find the matching level in our data
          const matchingLevel = candle.volumeLevels.find(level =>
            Math.abs(level.price - price) < 0.01 &&
            level.bidVolume === bidVol &&
            level.askVolume === askVol
          );

          if (matchingLevel) {
            detectedLevel = matchingLevel;
            // Get the actual visual position of the element
            const elementRect = element.getBoundingClientRect();
            detectedY = elementRect.top - rect.top + (elementRect.height / 2);
            break;
          }
        }
      }

      if (detectedLevel) {
        setCrosshair({
          x,
          y: detectedY,
          price: detectedLevel.price, // Price level from bid/ask volume detection
          time: candle.timestamp,
          bidVol: detectedLevel.bidVolume,
          askVol: detectedLevel.askVolume,
          delta: detectedLevel.askVolume - detectedLevel.bidVolume,
          visible: true
        });
      }
    }
  }, [data, scrollX, scrollY, zoom, verticalScale, maxPrice, priceRange, showCrosshair]);

  const handleMouseLeave = useCallback(() => {
    setCrosshair(prev => ({ ...prev, visible: false }));
  }, []);

  const handleScroll = useCallback((deltaX: number, deltaY: number) => {
    // Mark that user is scrolling
    setIsUserScrolling(true);

    setScrollX(prev => {
      const newScrollX = prev + deltaX;
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const leftMargin = CANDLE_WIDTH * 5; // Allow scrolling 5 bars to the left
      const rightMargin = CANDLE_WIDTH * 5; // Allow scrolling 5 bars to the right
      const maxScrollX = data.length * CANDLE_WIDTH - screenWidth + rightMargin; // Allow extra space on right
      return Math.max(-leftMargin, Math.min(maxScrollX, newScrollX));
    });
    setScrollY(prev => {
      const newScrollY = prev + deltaY;
      // Allow panning above highest bar by adding extra space (50% of chart height)
      const extraSpace = chartHeight * 0.6; // allow more upward shift
      const maxScrollY = chartHeight * verticalScale - chartHeight + extraSpace;
      const minScrollY = -extraSpace; // Allow negative scroll to pan above
      return Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
    });

    // Reset user scrolling flag after a short delay
    setTimeout(() => setIsUserScrolling(false), 1000);
  }, [data.length, CANDLE_WIDTH, chartHeight, zoom, verticalScale]);

  const handleZoom = useCallback((delta: number) => {
    setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
  }, []);

  // const handleVerticalScale = useCallback((delta: number) => {
  //   setVerticalScale(prev => {
  //     const newScale = Math.max(0.5, Math.min(3, prev + delta));
  //     console.log('Vertical Scale:', { from: prev, to: newScale, percentage: Math.round(newScale * 100) + '%' });
  //     return newScale;
  //   });
  // }, []);

  const handleYAxisDrag = useCallback((deltaY: number) => {
    const scaleDelta = deltaY * -0.0008; // Less sensitive scaling for Y-axis drag
    setVerticalScale(prev => {
      // No minimum limit - allow user to zoom out as much as they want
      const newScale = Math.max(0.01, Math.min(100, prev + scaleDelta));
      console.log('Vertical Scale (Y-axis Drag):', {
        from: prev,
        to: newScale,
        percentage: Math.round(newScale * 100) + '%'
      });
      return newScale;
    });
  }, []);

  const handleXAxisDrag = useCallback((deltaX: number) => {
    const scaleDelta = deltaX * -0.0001; // Invert: drag left (negative deltaX) = zoom in, drag right (positive deltaX) = zoom out

    // Calculate anchor point - last visible candle position
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const visibleBars = Math.floor(screenWidth / CANDLE_WIDTH);
    const lastVisibleIndex = Math.min(data.length - 1, Math.floor(scrollX / CANDLE_WIDTH) + visibleBars);
    const anchorX = lastVisibleIndex * CANDLE_WIDTH;

    setHorizontalScale(prev => {
      const newScale = Math.max(0.5, Math.min(3, prev + scaleDelta));

      // Calculate new CANDLE_WIDTH with new scale
      const newCandleWidth = 120 * newScale;

      // Calculate how much the anchor point moved due to scaling
      const oldCandleWidth = 120 * prev;
      const scaleRatio = newCandleWidth / oldCandleWidth;
      const anchorOffset = anchorX * (scaleRatio - 1);

      // Adjust scroll to keep anchor point fixed
      setScrollX(prevScroll => {
        const newScrollX = prevScroll - anchorOffset;
        const leftMargin = newCandleWidth * 5; // Allow scrolling 5 bars to the left
        const rightMargin = newCandleWidth * 5; // Allow scrolling 5 bars to the right
        const maxScrollX = data.length * newCandleWidth - screenWidth + rightMargin; // Allow extra space on right
        return Math.max(-leftMargin, Math.min(maxScrollX, newScrollX));
      });

      console.log('Horizontal Scale:', {
        from: prev,
        to: newScale,
        percentage: Math.round(newScale * 100) + '%',
        deltaX,
        scaleDelta,
        anchorIndex: lastVisibleIndex,
        anchorOffset
      });

      return newScale;
    });
  }, [data.length, CANDLE_WIDTH, scrollX]);

  const handleAxisDrag = useCallback((type: 'x' | 'y', delta: number) => {
    if (type === 'x') {
      handleXAxisDrag(delta);
    } else if (type === 'y') {
      handleYAxisDrag(delta);
    }
  }, [handleXAxisDrag, handleYAxisDrag]);

  const handleAxisDoubleClick = useCallback((type: 'x' | 'y') => {
    if (type === 'x') {
      setHorizontalScale(1.5); // Reset horizontal scale to 1.5 (default)
      console.log('Horizontal Scale Reset to 150%');
    } else if (type === 'y') {
      setVerticalScale(5); // Reset vertical scale to 5 (default)
      setScrollY(Math.round(chartHeight / 2)); // Reset to center position
      console.log('Vertical Scale Reset to 500% and position reset');
    }
  }, [chartHeight]);

  // Calculate distance between two touch points
  const getPinchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    if (!touch1 || !touch2) return 0;
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Handle pinch gesture for horizontal scaling
  const handlePinch = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.touches.length === 2) {
      const currentDistance = getPinchDistance(e.touches);

      if (lastPinchDistance > 0) {
        const scaleChange = (currentDistance - lastPinchDistance) * 0.01;
        setHorizontalScale(prev => {
          const newScale = Math.max(0.5, Math.min(3, prev - scaleChange)); // Invert for pinch behavior
          console.log('Pinch Scale:', { from: prev, to: newScale, percentage: Math.round(newScale * 100) + '%' });
          return newScale;
        });
      }

      setLastPinchDistance(currentDistance);
      // setIsPinching(true);
    }
  }, [lastPinchDistance, getPinchDistance]);

  // Handle touch start for pinch
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = getPinchDistance(e.touches);
      setLastPinchDistance(distance);
      // setIsPinching(true);
    }
  }, [getPinchDistance]);

  // Handle touch end for pinch
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      setLastPinchDistance(0);
      // setIsPinching(false);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDragging(true);
    setDragStart({ x, y });
    // setShowPanIndicator(true); // disabled
    setDragMode('pan');

    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Reset view to show latest data
  // const resetView = useCallback(() => {
  //   const totalBars = data.length;
  //   const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  //   const visibleBars = Math.floor(screenWidth / CANDLE_WIDTH);
  //   const rightMargin = screenWidth * 0.1; // 10% of screen width for better margin
  //   // Calculate position to show the very last bar with margin
  //   const lastCandlePosition = Math.max(0, totalBars * CANDLE_WIDTH - screenWidth + rightMargin);

  //   setScrollX(lastCandlePosition);
  //   setScrollY(0);
  //   setZoom(1);
  //   setVerticalScale(1.6);
  //   setHorizontalScale(1.5);
  // }, [data.length, CANDLE_WIDTH]);



  const handleMouseMoveGlobal = useCallback((e: MouseEvent) => {
    if (!isDragging || !chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const deltaX = x - dragStart.x;
    const deltaY = y - dragStart.y;

    if (dragMode === 'pan') {
      // Check if dragging in Y-axis area (left side of chart) for vertical scaling
      if (x < 100) { // Left edge - Y-axis area for vertical scaling
        handleYAxisDrag(deltaY);
        setDragStart({ x, y });
      } else {
        // Normal pan behavior
        // Mark that user is scrolling via drag
        setIsUserScrolling(true);

        // Pan with boundaries
        setScrollX(prev => {
          const newScrollX = prev - deltaX;
          const leftMargin = CANDLE_WIDTH * 5; // Allow scrolling 5 bars to the left
          const rightMargin = CANDLE_WIDTH * 5; // Allow scrolling 5 bars to the right
          const maxScrollX = data.length * CANDLE_WIDTH - rect.width + rightMargin; // Allow extra space on right
          return Math.max(-leftMargin, Math.min(maxScrollX, newScrollX));
        });
        setScrollY(prev => {
          const newScrollY = prev - deltaY;
          // Allow panning above highest bar by adding extra space (50% of chart height)
          const extraSpace = chartHeight * 0.6;
          const maxScrollY = chartHeight * verticalScale - rect.height + extraSpace;
          const minScrollY = -extraSpace; // Allow negative scroll to pan above
          return Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
        });
        setDragStart({ x, y });
      }
    } else if (dragMode === 'zoom') {
      if (x > rect.width - 100) { // Right edge - vertical scaling
        handleYAxisDrag(deltaY);
      } else if (y > rect.height - 50) { // Bottom edge - horizontal scaling
        handleXAxisDrag(deltaX);
      } else {
        const zoomDelta = deltaY * -0.01;
        setZoom(prev => Math.max(0.5, Math.min(3, prev + zoomDelta)));
      }
      setDragStart({ x, y });
    }
  }, [isDragging, dragStart, dragMode, data.length, CANDLE_WIDTH, chartHeight, zoom, verticalScale, handleYAxisDrag, handleXAxisDrag]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragMode('none');
    // Hide pan indicator after a short delay (disabled)
    // setTimeout(() => setShowPanIndicator(false), 1000);
  }, []);

  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMoveGlobal);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent default drag behavior
      document.addEventListener('dragstart', (e) => e.preventDefault());
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveGlobal);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('dragstart', (e) => e.preventDefault());
      };
    }
    return undefined;
  }, [isDragging, handleMouseMoveGlobal, handleMouseUp]);

  // Add keyboard shortcuts for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Pan with arrow keys
      const panAmount = 50;
      if (e.key === 'ArrowLeft') {
        setScrollX(prev => {
          const newScrollX = prev - panAmount;
          const leftMargin = CANDLE_WIDTH * 5; // Allow scrolling 5 bars to the left
          const rightMargin = CANDLE_WIDTH * 5; // Allow scrolling 5 bars to the right
          const maxScrollX = data.length * CANDLE_WIDTH - (typeof window !== 'undefined' ? window.innerWidth : 1200) + rightMargin;
          return Math.max(-leftMargin, Math.min(maxScrollX, newScrollX));
        });
      } else if (e.key === 'ArrowRight') {
        setScrollX(prev => {
          const newScrollX = prev + panAmount;
          const leftMargin = CANDLE_WIDTH * 5; // Allow scrolling 5 bars to the left
          const rightMargin = CANDLE_WIDTH * 5; // Allow scrolling 5 bars to the right
          const maxScrollX = data.length * CANDLE_WIDTH - (typeof window !== 'undefined' ? window.innerWidth : 1200) + rightMargin;
          return Math.max(-leftMargin, Math.min(maxScrollX, newScrollX));
        });
      } else if (e.key === 'ArrowUp') {
        setScrollY(prev => {
          const newScrollY = prev - panAmount;
          // Allow panning above highest bar by adding extra space (50% of chart height)
          const extraSpace = chartHeight * 0.6;
          const maxScrollY = chartHeight * verticalScale - chartHeight + extraSpace;
          const minScrollY = -extraSpace; // Allow negative scroll to pan above
          return Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
        });
      } else if (e.key === 'ArrowDown') {
        setScrollY(prev => {
          const newScrollY = prev + panAmount;
          // Allow panning above highest bar by adding extra space (50% of chart height)
          const extraSpace = chartHeight * 0.6;
          const maxScrollY = chartHeight * verticalScale - chartHeight + extraSpace;
          const minScrollY = -extraSpace; // Allow negative scroll to pan above
          return Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [data.length, CANDLE_WIDTH, chartHeight, zoom, verticalScale]);

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-2 bg-background/90 border border-border px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-medium">Loading initial footprint data...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-card text-card-foreground">
        <div className="text-center text-red-600">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // Debug: Log data state before rendering
  console.log(`📊 Rendering chart with ${data.length} candles, isLoading: ${isLoading}, isLoadingMore: ${isLoadingMore}`);

  return (
    <div
      className="w-full h-full relative overflow-hidden bg-card text-card-foreground"
      style={{
        height: '100%', // Use full height
        width: '100%',  // Use full width
        zIndex: 1,
        userSelect: 'none', // Prevent text selection
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      }}
    >
      {/* Date Range Selector - Top Right */}
      <div className="absolute top-4 right-20 z-10 flex items-center gap-2 bg-background/90 border border-border px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm">
        <span className="text-xs font-medium text-foreground">Range:</span>
        <select
          value={dateRange}
          onChange={(e) => {
            const newRange = e.target.value as DateRangeOption;
            setDateRange(newRange);
            // Reset and reload with new range
            setLoadedDates([]);
            setAllBidAskData([]);
            setData([]);
            setIsInitialLoad(true);
            const today = new Date();
            const todayString = today.toISOString().slice(0, 10).replace(/-/g, '');
            setCurrentDate(todayString);
          }}
          className="bg-background text-foreground border border-border rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
        >
          <option value="7">7 Hari</option>
          <option value="14">14 Hari</option>
          <option value="30">30 Hari</option>
          <option value="60">60 Hari</option>
          <option value="90">90 Hari</option>
          <option value="all">Semua</option>
        </select>
      </div>

      {/* Main Chart Area */}
      <div
        className="w-full h-full relative"
        style={{
          height: '100%', // Use full height
          width: '100%',   // Use full width
          paddingRight: '64px',        // Space for Y-axis
          // Removed paddingBottom to make chart reach bottom
          boxSizing: 'border-box'     // Include padding in dimensions
        }}
      >
        <div
          ref={chartRef}
          className={`w-full h-full relative ${dragMode === 'pan' ? 'cursor-move' :
              dragMode === 'zoom' ? 'cursor-ns-resize' : 'cursor-crosshair'
            }`}
          style={{
            overflowX: 'hidden',
            overflowY: 'hidden',
            zIndex: 1,
            height: '100%', // Use full height
            width: '100%',  // Use full width
            userSelect: 'none' // Prevent text selection during drag
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onWheel={(e) => {
            e.preventDefault();
            if (e.ctrlKey) {
              handleZoom(e.deltaY > 0 ? -0.1 : 0.1);
            } else {
              handleScroll(e.deltaX, e.deltaY);
            }
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handlePinch}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={(e) => {
            // Prevent double click interference
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* Grid Lines - Optimized */}
          <div className="absolute inset-0 pointer-events-none">
            {/* All grid lines removed for clean background */}
          </div>

          {/* Candlestick Bars - Optimized rendering */}
          <div
            className="relative"
            style={{
              width: data.length * CANDLE_WIDTH,
              height: '100%', // Use full height
              marginLeft: -scrollX,
              marginTop: -scrollY
            }}
          >
            {data.map((candle, index) => {
              // Only render visible candles
              const xPos = index * CANDLE_WIDTH;
              const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
              if (xPos < scrollX - CANDLE_WIDTH || xPos > scrollX + windowWidth + CANDLE_WIDTH) {
                return null;
              }

              // Ensure candle has volume levels before rendering
              if (!candle.volumeLevels || candle.volumeLevels.length === 0) {
                console.warn(`📊 Candle ${index} has no volume levels:`, candle);
                return null;
              }

              return (
                <CandlestickBar
                  key={`candle-${candle.timestamp}-${index}`} // More stable key
                  data={candle}
                  index={index}
                  width={CANDLE_WIDTH}
                  height={chartHeight} // Use measured height
                  minPrice={minPrice}
                  maxPrice={maxPrice}
                  showPOC={showPOC}
                  showDelta={showDelta}
                  zoom={zoom}
                  verticalScale={verticalScale}
                  horizontalScale={horizontalScale}
                  barHeight={dynamicBarHeight}
                />
              );
            })}
          </div>

          {/* Crosshair */}
          {showCrosshair && (
            <Crosshair data={crosshair} chartHeight={chartHeight} />
          )}

          {/* Pan Indicator */}
          {false && showPanIndicator && (
            <div className="absolute top-4 left-4 bg-primary text-primary-foreground px-3 py-2 rounded-md text-sm font-medium shadow-lg">
              {dragMode === 'pan' ? 'Pan Mode - Drag to move' : 'Zoom Mode - Drag to scale'}
            </div>
          )}

          {/* Loading More Indicator - Bottom Right */}
          {isLoadingMore && (
            <div className="absolute bottom-4 right-4 bg-background/90 text-foreground border border-border px-3 py-2 rounded-md text-sm font-medium shadow-lg flex items-center gap-2 backdrop-blur-sm">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Loading more data...</span>
            </div>
          )}
        </div>

      </div>

      {/* X-Axis - Moved inside main container */}
      <Axis
        type="x"
        data={data}
        width={chartWidth}
        height={chartHeight}
        scrollX={scrollX}
        scrollY={scrollY}
        zoom={zoom}
        verticalScale={verticalScale}
        minPrice={minPrice}
        maxPrice={maxPrice}
        candleWidth={CANDLE_WIDTH}
        chartHeight={chartHeight}
        theme={theme}
        onAxisDrag={handleAxisDrag}
        onAxisDoubleClick={handleAxisDoubleClick}
        crosshairX={crosshair.x}
        crosshairTime={crosshair.time}
        showCrosshair={crosshair.visible}
      />

      {/* Y-Axis - Moved inside main container */}
      <Axis
        type="y"
        data={data}
        width={chartWidth}
        height={chartHeight}
        scrollX={scrollX}
        scrollY={scrollY}
        zoom={zoom}
        verticalScale={verticalScale}
        minPrice={minPrice}
        maxPrice={maxPrice}
        candleWidth={CANDLE_WIDTH}
        chartHeight={chartHeight}
        theme={theme}
        onAxisDrag={handleAxisDrag}
        onAxisDoubleClick={handleAxisDoubleClick}
        crosshairY={crosshair.y}
        crosshairPrice={crosshair.price}
        showCrosshair={crosshair.visible}
      />

    </div>
  );
});
