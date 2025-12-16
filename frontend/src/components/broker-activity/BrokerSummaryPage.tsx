import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Loader2, Calendar } from 'lucide-react';
 
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface BrokerSummaryData {
  broker: string;
  buyerVol: number;   // BuyerVol (for BLot in BUY table) - SWAPPED: actually Seller data
  buyerValue: number; // BuyerValue (for BVal in BUY table) - SWAPPED: actually Seller data
  bavg: number;       // BuyerAvg (for BAvg in BUY table) - SWAPPED: actually Seller avg
  sellerVol: number;  // SellerVol (for SLot in SELL table) - SWAPPED: actually Buyer data
  sellerValue: number; // SellerValue (for SVal in SELL table) - SWAPPED: actually Buyer data
  savg: number;       // SellerAvg (for SAvg in SELL table) - SWAPPED: actually Buyer avg
  // Net Buy fields (always >= 0, if negative becomes 0 and goes to NetSell)
  netBuyVol: number;  // NetBuyVol (for NBLot in NET table) - already >= 0 from backend
  netBuyValue: number; // NetBuyValue (for NBVal in NET table) - already >= 0 from backend
  netBuyerAvg: number; // NetBuyerAvg (for NBAvg in NET table) - already calculated from backend
  // Net Sell fields (always >= 0)
  netSellVol: number;  // NetSellVol (for NSLot in NET table) - already >= 0 from backend
  netSellValue: number; // NetSellValue (for NSVal in NET table) - already >= 0 from backend
  netSellerAvg: number; // NetSellerAvg (for NSAvg in NET table) - already calculated from backend
  // Legacy fields for backward compatibility
  nblot: number;      // Legacy: same as netBuyVol
  nbval: number;      // Legacy: same as netBuyValue
  sl: number;         // Legacy: same as sellerVol
  nslot: number;      // Legacy: negative sellerVol (not used anymore, use netSellVol instead)
  nsval: number;      // Legacy: negative sellerValue (not used anymore, use netSellValue instead)
}

// Note: TICKERS constant removed - now using dynamic stock loading from API

// Foreign brokers (red background)
const FOREIGN_BROKERS = [
  "AG", "AH", "AI", "AK", "BK", "BQ", "CG", "CS", "DP", "DR", "DU", "FS", "GW", "HD", "KK", 
  "KZ", "LH", "LG", "LS", "MS", "RB", "RX", "TX", "YP", "YU", "ZP"
];

// Government brokers (green background)
const GOVERNMENT_BROKERS = ['CC', 'NI', 'OD', 'DX'];

// Note: local generator removed in favor of backend API
// Default dates (last 3 days) are now set from API data in component useEffect

// Minimum date that can be selected: 19/09/2025
const MIN_DATE = '2025-09-19';

const formatNumber = (value: number): string => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1000000000) {
    return `${sign}${(absValue / 1000000000).toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    return `${sign}${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${sign}${(absValue / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
};

// Format Lot: jika >= 1,000,000 gunakan format dengan M (25.6M), jika < 1,000,000 gunakan format koma ribuan biasa (12,000)
const formatLot = (value: number): string => {
  const rounded = Math.round(value);
  if (rounded >= 1000000) {
    // Format dengan M untuk nilai >= 1,000,000 (misal: 25,636,000 -> 25.6M)
    const millions = rounded / 1000000;
    return `${millions.toFixed(1)}M`;
  }
  // Format koma ribuan biasa untuk nilai < 1,000,000 (misal: 12,000 -> 12,000)
  return rounded.toLocaleString('en-US');
};

const formatAverage = (value: number): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return '-';
  }
  if (value === 0) {
    return '0.0';
  }
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};

const formatDisplayDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

interface BrokerSummaryPageProps {
  selectedStock?: string;
}

export function BrokerSummaryPage({ selectedStock: propSelectedStock }: BrokerSummaryPageProps) {
  const { showToast } = useToast();
  // Default dates will be set from API (maxAvailableDate useEffect)
  // Using empty initial state - will be populated from API
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedTickers, setSelectedTickers] = useState<string[]>(propSelectedStock ? [propSelectedStock] : ['BBCA']);
  const [tickerInput, setTickerInput] = useState<string>('');
  const [fdFilter, setFdFilter] = useState<'All' | 'Foreign' | 'Domestic'>('All'); // Temporary filter (can be changed before Show button clicked)
  const [displayedFdFilter, setDisplayedFdFilter] = useState<'All' | 'Foreign' | 'Domestic'>('All'); // Actual filter used for data display (updated when Show button clicked)
  const [marketFilter, setMarketFilter] = useState<'RG' | 'TN' | 'NG' | ''>('RG'); // Default to RG
  const [displayedTickers, setDisplayedTickers] = useState<string[]>(propSelectedStock ? [propSelectedStock] : ['BBCA']); // Tickers displayed in header (updated when Show button clicked)
  const [displayedMarket, setDisplayedMarket] = useState<'RG' | 'TN' | 'NG' | ''>('RG'); // Market/Board displayed in header (updated when Show button clicked)
  
  // Stock selection state
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [sectorMapping, setSectorMapping] = useState<{ [sector: string]: string[] }>({}); // Sector -> list of stocks
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const [stockSearchTimeout, setStockSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const valueTableRef = useRef<HTMLTableElement>(null);
  const netTableRef = useRef<HTMLTableElement>(null);
  const totalTableRef = useRef<HTMLTableElement>(null);
  const valueTableContainerRef = useRef<HTMLDivElement>(null);
  const netTableContainerRef = useRef<HTMLDivElement>(null);
  const totalTableContainerRef = useRef<HTMLDivElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const [isMenuTwoRows, setIsMenuTwoRows] = useState<boolean>(false);
  const dateColumnWidthsRef = useRef<Map<string, number>>(new Map()); // Store width of each date column from VALUE table
  const totalColumnWidthRef = useRef<number>(0); // Store width of Total column from VALUE table

  // API-driven broker summary data by date
  const [summaryByDate, setSummaryByDate] = useState<Map<string, BrokerSummaryData[]>>(new Map()); // Filtered data (based on displayedFdFilter)
  const [rawSummaryByDate, setRawSummaryByDate] = useState<Map<string, BrokerSummaryData[]>>(new Map()); // Raw data without investor filter (for client-side filtering)
  const [lastFetchParams, setLastFetchParams] = useState<{ tickers: string[]; dates: string[]; market: string } | null>(null); // Track last fetch parameters
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDataReady, setIsDataReady] = useState<boolean>(false); // Control when to show tables
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false); // Control when to fetch data (only when Show button clicked)
  const [maxAvailableDate, setMaxAvailableDate] = useState<string>(''); // Maximum date available from API (format: YYYY-MM-DD)
  const shouldFetchDataRef = useRef<boolean>(false); // Ref to track shouldFetchData for async functions (always up-to-date)
  const abortControllerRef = useRef<AbortController | null>(null); // Ref to abort ongoing fetch

  // Enhanced cache system with persistence and size limits
  // Key format: `${ticker}-${date}-${market}` or `sector-${sectorName}-${date}-${market}`
  const dataCacheRef = useRef<Map<string, { data: BrokerSummaryData[]; timestamp: number }>>(new Map());
  
  // Cache configuration
  const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes (increased from 5 minutes)
  const CACHE_STORAGE_KEY = 'broker_summary_data_cache';
  const MAX_CACHE_SIZE = 500; // Maximum number of cache entries (to prevent memory overflow)
  const MAX_CACHE_AGE_DAYS = 1; // Cache can persist for 1 day in localStorage
  
  // Load cache from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        const maxAge = MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;
        
        // Filter out expired entries
        const validEntries: Array<[string, { data: BrokerSummaryData[]; timestamp: number }]> = [];
        for (const [key, value] of Object.entries(parsed)) {
          const entry = value as { data: BrokerSummaryData[]; timestamp: number };
          if (now - entry.timestamp < maxAge) {
            validEntries.push([key, entry]);
          }
        }
        
        // Restore valid cache entries
        if (validEntries.length > 0) {
          dataCacheRef.current = new Map(validEntries);
          console.log(`[BrokerSummary] Loaded ${validEntries.length} cache entries from localStorage`);
        }
      }
    } catch (e) {
      console.warn('[BrokerSummary] Failed to load cache from localStorage:', e);
    }
  }, []);
  
  // Helper function to save cache to localStorage (debounced)
  const saveCacheToStorageRef = useRef<NodeJS.Timeout | null>(null);
  const saveCacheToStorage = () => {
    if (saveCacheToStorageRef.current) {
      clearTimeout(saveCacheToStorageRef.current);
    }
    
    saveCacheToStorageRef.current = setTimeout(() => {
      try {
        const cacheObj: { [key: string]: { data: BrokerSummaryData[]; timestamp: number } } = {};
        dataCacheRef.current.forEach((value, key) => {
          cacheObj[key] = value;
        });
        
        // Limit size before saving (keep most recent entries)
        const entries = Object.entries(cacheObj);
        if (entries.length > MAX_CACHE_SIZE) {
          // Sort by timestamp (newest first) and keep only MAX_CACHE_SIZE
          entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
          const limitedEntries = entries.slice(0, MAX_CACHE_SIZE);
          const limitedObj: { [key: string]: { data: BrokerSummaryData[]; timestamp: number } } = {};
          limitedEntries.forEach(([key, value]) => {
            limitedObj[key] = value;
          });
          localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(limitedObj));
          console.log(`[BrokerSummary] Cache size limited to ${MAX_CACHE_SIZE} entries`);
        } else {
          localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheObj));
        }
      } catch (e) {
        // Handle quota exceeded error
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          console.warn('[BrokerSummary] localStorage quota exceeded, clearing old cache entries');
          // Clear oldest 50% of cache
          const entries = Array.from(dataCacheRef.current.entries());
          entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
          const toRemove = entries.slice(0, Math.floor(entries.length / 2));
          toRemove.forEach(([key]) => {
            dataCacheRef.current.delete(key);
          });
          // Retry saving
          setTimeout(() => saveCacheToStorage(), 100);
        } else {
          console.warn('[BrokerSummary] Failed to save cache to localStorage:', e);
        }
      }
    }, 1000); // Debounce: save 1 second after last update
  };
  
  // Cleanup expired cache entries periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [key, value] of dataCacheRef.current.entries()) {
        if (now - value.timestamp > CACHE_EXPIRY_MS) {
          dataCacheRef.current.delete(key);
          cleaned++;
        }
      }
      
      // Also check size limit
      if (dataCacheRef.current.size > MAX_CACHE_SIZE) {
        // Remove oldest entries
        const entries = Array.from(dataCacheRef.current.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, dataCacheRef.current.size - MAX_CACHE_SIZE);
        toRemove.forEach(([key]) => {
          dataCacheRef.current.delete(key);
          cleaned++;
        });
      }
      
      if (cleaned > 0) {
        console.log(`[BrokerSummary] Cleaned up ${cleaned} expired cache entries`);
        saveCacheToStorage();
      }
    }, 5 * 60 * 1000); // Cleanup every 5 minutes
    
    return () => clearInterval(cleanupInterval);
  }, []);

  // Check if more than 7 days selected - if so, only show Total column
  // CRITICAL: Calculate from summaryByDate (data that exists), not from selectedDates (which changes on date picker)
  // This ensures no re-render when user changes dates - only when data changes (after Show button clicked)
  const showOnlyTotal = summaryByDate.size > 7;

  // Load maximum available date on mount - use this for validation and default dates
  // IMPORTANT: This effect runs ONLY ONCE on mount - load metadata only, NO auto-fetch data
  useEffect(() => {
    const loadMaxDate = async () => {
      try {
        const result = await api.getBrokerSummaryDates();
        
        if (result.success && result.data?.dates && Array.isArray(result.data.dates) && result.data.dates.length > 0) {
          // Backend sudah memberikan dates sorted newest first
          // Langsung ambil 3 teratas tanpa logic tambahan
          const apiDates = result.data.dates.map((d: string) => {
            const yyyy = d.slice(0, 4);
            const mm = d.slice(4, 6);
            const dd = d.slice(6, 8);
            return `${yyyy}-${mm}-${dd}`;
          });
          
          // Ambil 3 teratas (yang sudah newest first), lalu sort ascending untuk display
          const lastThreeDates = apiDates.slice(0, 3).sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime());
          
          // Set maxAvailableDate (tanggal terbaru)
          const latestDateStr = result.data.dates[0];
          const formattedDate = `${latestDateStr.slice(0, 4)}-${latestDateStr.slice(4, 6)}-${latestDateStr.slice(6, 8)}`;
          
          // Set semua state sekaligus
          // NO auto-fetch - user must click Show button to fetch data
          setMaxAvailableDate(formattedDate);
          setSelectedDates(lastThreeDates);
          setStartDate(lastThreeDates[0]);
          setEndDate(lastThreeDates[lastThreeDates.length - 1]);
        } else {
          console.warn('[BrokerSummary] No dates available from API', result);
          // Show error toast
          if (result.error) {
            showToast({
              type: 'error',
              title: 'Error',
              message: `Gagal memuat tanggal: ${result.error}`,
            });
          }
        }
      } catch (err) {
        console.error('Error loading max available date:', err);
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Gagal memuat data tanggal. Silakan refresh halaman.',
        });
      }
    };
    
    loadMaxDate();
  }, []); // IMPORTANT: Empty dependency array - only run once on mount
  
  // REMOVED: Auto-fetch effect - now triggered directly from loadMaxDate after all states are set
  // This ensures no re-runs when user changes dates (which would trigger auto-fetch again)
  // Initial auto-fetch is now handled directly in loadMaxDate useEffect

  // Update selectedTickers when prop changes
  useEffect(() => {
    if (propSelectedStock && !selectedTickers.includes(propSelectedStock)) {
      setSelectedTickers([propSelectedStock]);
      setTickerInput('');
    }
  }, [propSelectedStock]);

  // Toast "Range Tanggal Lebih dari 7 Hari" is now shown only after clicking Show button (in fetchAll)

  // Load available stocks ONCE on mount - OPTIMIZED with localStorage cache for instant display
  // This is faster than getBrokerSummaryStocks() which requires a date
  useEffect(() => {
    const loadStocks = async () => {
      if (availableStocks.length > 0) return; // Already loaded
      
      // Cache keys and TTL
      const STOCK_LIST_CACHE_KEY = 'broker_summary_stock_list';
      const SECTOR_MAPPING_CACHE_KEY = 'broker_summary_sector_mapping';
      const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
      
      // Helper function to process and combine stocks + sectors
      const processStocksAndSectors = (
        stocks: string[],
        sectors: string[]
      ): string[] => {
        // Remove IDX from ticker list (IDX is now a sector, not a ticker)
        const stocksWithoutIdx = stocks.filter(stock => stock !== 'IDX');
        
        // Add sectors to the list (with prefix to distinguish from stocks)
        // IDX should already be in sectors from backend
        const sectorsWithPrefix = sectors.map(sector => `[SECTOR] ${sector}`);
        
        // Combine stocks and sectors, then sort alphabetically
        // Ensure IDX is always first
        return [...stocksWithoutIdx, ...sectorsWithPrefix].sort((a: string, b: string) => {
          // IDX always comes first
          if (a === '[SECTOR] IDX') return -1;
          if (b === '[SECTOR] IDX') return 1;
          return a.localeCompare(b);
        });
      };
      
      // Try to load from cache first for instant display
      let cachedStocks: string[] | null = null;
      let cachedSectorMapping: { sectors: string[]; sectorMapping: { [sector: string]: string[] }; timestamp: number } | null = null;
      
      try {
        // Load cached stock list
        const cachedStockData = localStorage.getItem(STOCK_LIST_CACHE_KEY);
        if (cachedStockData) {
          const parsed = JSON.parse(cachedStockData);
          if (parsed.timestamp && (Date.now() - parsed.timestamp) < CACHE_TTL && parsed.stocks && Array.isArray(parsed.stocks)) {
            cachedStocks = parsed.stocks;
          }
        }
        
        // Load cached sector mapping
        const cachedSectorData = localStorage.getItem(SECTOR_MAPPING_CACHE_KEY);
        if (cachedSectorData) {
          const parsed = JSON.parse(cachedSectorData);
          if (parsed.timestamp && (Date.now() - parsed.timestamp) < CACHE_TTL) {
            cachedSectorMapping = {
              sectors: parsed.sectors || [],
              sectorMapping: parsed.sectorMapping || {},
              timestamp: parsed.timestamp
            };
          }
        }
        
        // If we have both cached data, use them immediately for instant display
        if (cachedStocks && cachedSectorMapping) {
          // Ensure IDX is in sectors list (IDX is special - not in sectorMapping)
          if (!cachedSectorMapping.sectors.includes('IDX')) {
            cachedSectorMapping.sectors.push('IDX');
          }
          
          const allItems = processStocksAndSectors(
            cachedStocks,
            cachedSectorMapping.sectors
          );
          setAvailableStocks(allItems);
          setSectorMapping(cachedSectorMapping.sectorMapping);
          console.log(`[BrokerSummary] Loaded ${cachedStocks.length} stocks and ${cachedSectorMapping.sectors.length} sectors from cache (instant display)`);
        }
      } catch (e) {
        // Ignore cache errors, will fetch from API
        console.warn('[BrokerSummary] Cache read error, will fetch from API:', e);
      }
      
      // Fetch from API in background (even if cache exists, to update cache)
      try {
        console.log('[BrokerSummary] Fetching stock list and sector mapping from API...');
        
        // Load both stock list and sector mapping in parallel
        const [stockResult, sectorResult] = await Promise.all([
          api.getStockList(),
          cachedSectorMapping ? Promise.resolve({ success: true, data: cachedSectorMapping }) : api.getSectorMapping()
        ]);
        
        let stocks: string[] = [];
        let sectors: string[] = [];
        let mapping: { [sector: string]: string[] } = {};
        
        if (stockResult.success && stockResult.data?.stocks && Array.isArray(stockResult.data.stocks)) {
          stocks = stockResult.data.stocks;
          
          // Cache stock list
          try {
            localStorage.setItem(STOCK_LIST_CACHE_KEY, JSON.stringify({
              stocks,
              timestamp: Date.now()
            }));
          } catch (e) {
            // Ignore cache write errors
          }
        }
        
        if (sectorResult.success && sectorResult.data) {
          sectors = sectorResult.data.sectors || [];
          mapping = sectorResult.data.sectorMapping || {};
          
          // Ensure IDX is in sectors list (IDX is a special sector that appears in menu)
          // Note: IDX is NOT in sectorMapping because it's not a regular sector with multiple stocks
          // IDX is a special ticker that exists as IDX.csv in broker_summary folders
          if (!sectors.includes('IDX')) {
            sectors.push('IDX');
            console.log('[BrokerSummary] Added IDX to sectors list (IDX is special - not in sectorMapping)');
          }
          
          setSectorMapping(mapping);
          
          // Cache sector mapping
          try {
            localStorage.setItem(SECTOR_MAPPING_CACHE_KEY, JSON.stringify({
              sectors,
              sectorMapping: mapping,
              timestamp: Date.now()
            }));
          } catch (e) {
            // Ignore cache write errors
          }
        }
        
        // Process and update available stocks (will update if cache was stale or missing)
        const allItems = processStocksAndSectors(stocks, sectors);
        setAvailableStocks(allItems);
        console.log(`[BrokerSummary] Loaded ${stocks.filter(s => s !== 'IDX').length} stocks and ${sectors.length} sectors from API`);
      } catch (err) {
        console.error('[BrokerSummary] Error loading stock list:', err);
        // Even if API fails, ensure IDX is available as sector (if cache also failed)
        if (availableStocks.length === 0) {
          setAvailableStocks(['[SECTOR] IDX']);
        }
      }
    };
    
    loadStocks();
  }, []); // Only run once on mount

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (stockSearchTimeout) {
        clearTimeout(stockSearchTimeout);
      }
    };
  }, [stockSearchTimeout]);

  // REMOVED: useLayoutEffect that resets shouldFetchData
  // Reset is now handled directly in onChange handlers (startDate and endDate)
  // This ensures NO effect runs when user changes dates - completely silent
  
  // REMOVED: Initial auto-fetch tracking - no longer needed since we don't auto-fetch on mount

  // REMOVED: Reminder toast effect
  // User wants NO side effects when changing dates - completely silent
  // Reminder toast removed per user request: "jangan lakukan apa-apa di manapun, biarkan aja begitu"
  
  // REMOVED: Auto-fetch on initial load - user MUST click Show button to fetch data
  // This ensures no data is displayed automatically without user clicking Show

  // Load broker summary data from backend for each selected date and aggregate multiple tickers
  // Only fetch when shouldFetchData is true (triggered by Show button ONLY)
  // IMPORTANT: This effect only runs when shouldFetchData changes, NOT when selectedTickers/selectedDates change
  // CRITICAL: This effect should NEVER run on mount - only when user clicks Show button
  useEffect(() => {
    // CRITICAL: Check state FIRST - if false, don't fetch
    if (!shouldFetchData) {
      // Reset ref to match state
      shouldFetchDataRef.current = false;
      return; // Early return if shouldFetchData is false
    }
    
    // CRITICAL: Also check ref for consistency
    if (!shouldFetchDataRef.current) {
      return; // Early return if ref is false - this is the secondary guard
    }
    
    // CRITICAL: Sync ref with state before proceeding
    shouldFetchDataRef.current = true;
    
    // CRITICAL: Cancel any ongoing fetch before starting new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Final check: make sure ref is still true after cleanup
    if (!shouldFetchDataRef.current) {
      return;
    }
    
    // Create new AbortController for this fetch
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    const fetchAll = async () => {
      // CRITICAL: Check ref instead of state - ref is always up-to-date even in async context
      // This is especially important if user changes dates while fetch is queued
      if (!shouldFetchDataRef.current) {
        setIsLoading(false);
        setIsDataReady(false);
        return;
      }
      
      if (selectedTickers.length === 0 || selectedDates.length === 0) {
        setIsLoading(false);
        setIsDataReady(false);
        shouldFetchDataRef.current = false;
        setShouldFetchData(false); // Reset fetch trigger
        return;
      }
      
      // Process selected tickers - sectors are now fetched directly from backend (no expansion)
      // Backend handles sector aggregation, frontend just fetches the sector CSV
      const tickersToFetch: string[] = [];
      
      selectedTickers.forEach(ticker => {
        if (ticker.startsWith('[SECTOR] ')) {
          const sectorName = ticker.replace('[SECTOR] ', '');
          // Fetch sector CSV directly from backend (backend already aggregated)
          tickersToFetch.push(sectorName);
          console.log(`[BrokerSummary] Sector ${sectorName} selected - will fetch sector CSV directly from backend`);
          } else {
          // Regular stock - fetch directly
          tickersToFetch.push(ticker);
        }
      });
      
      // Remove duplicates
      const uniqueTickers = Array.from(new Set(tickersToFetch));
      
      console.log(`[BrokerSummary] Processing ${selectedTickers.length} selected tickers (${uniqueTickers.length} unique):`, uniqueTickers);
      
      if (uniqueTickers.length === 0) {
        console.warn('[BrokerSummary] No tickers to fetch');
        setIsLoading(false);
        setIsDataReady(false);
        shouldFetchDataRef.current = false;
        setShouldFetchData(false);
        return;
      }
      
      // Note: maxAvailableDate validation is done in date picker, not here
      // If we reach here, dates should already be valid

      // CRITICAL: Check ref again after validation - user might have changed dates
      if (!shouldFetchDataRef.current) {
        setIsLoading(false);
        setIsDataReady(false);
        return;
      }
      
      // Validate that all selected dates are within maxAvailableDate
      if (maxAvailableDate && maxAvailableDate.trim() !== '') {
        const invalidDates = selectedDates.filter(date => date > maxAvailableDate);
        if (invalidDates.length > 0) {
          showToast({
            type: 'warning',
            title: 'Tanggal Tidak Valid',
            message: `Tanggal paling baru yang tersedia adalah ${new Date(maxAvailableDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}. Beberapa tanggal yang dipilih melebihi batas maksimum.`,
          });
          setIsLoading(false);
          setIsDataReady(false);
          shouldFetchDataRef.current = false;
          setShouldFetchData(false); // Reset fetch trigger
          return;
        }
      }

      // CRITICAL: Final check before starting fetch - user might have changed dates during validation
      if (!shouldFetchDataRef.current) {
        setIsLoading(false);
        setIsDataReady(false);
        return;
      }

      // Start loading (data and tables already cleared by the separate useEffect above)
      // But add safety check here too to ensure tables are hidden
      setIsDataReady(false);
      setIsLoading(true);
      setError(null);

      try {
        const market = marketFilter || '';
        const cache = dataCacheRef.current;

        // Helper function to fetch data for a single ticker-date combination (with cache)
        const fetchSingleData = async (ticker: string, date: string, skipCache: boolean = false): Promise<{ ticker: string; date: string; data: BrokerSummaryData[] }> => {
          // CRITICAL: Check if fetch was aborted
          if (abortController.signal.aborted || !shouldFetchDataRef.current) {
            throw new Error('Fetch aborted');
          }
          
          const cacheKey = `${ticker}-${date}-${market}`;
          const now = Date.now();
          const cached = cache.get(cacheKey);

          // Check cache first (skip cache on retry)
          // Cache is valid if it exists and hasn't expired
          if (!skipCache && cached) {
            const age = now - cached.timestamp;
            if (age <= CACHE_EXPIRY_MS) {
              console.log(`[BrokerSummary] Cache HIT: ${ticker} on ${date} (age: ${Math.round(age / 1000)}s)`);
              return { ticker, date, data: cached.data };
            } else {
              // Cache expired, remove it
              cache.delete(cacheKey);
              console.log(`[BrokerSummary] Cache EXPIRED: ${ticker} on ${date} (age: ${Math.round(age / 1000)}s)`);
            }
          } else if (!skipCache) {
            console.log(`[BrokerSummary] Cache MISS: ${ticker} on ${date}`);
          }

          // CRITICAL: Check again before API call
          if (abortController.signal.aborted || !shouldFetchDataRef.current) {
            throw new Error('Fetch aborted');
          }

          // Fetch from API
                const res = await api.getBrokerSummaryData(ticker, date, market as 'RG' | 'TN' | 'NG' | '');
                
                // Check if response is successful
                if (!res || !res.success) {
                  console.error(`[BrokerSummary] Failed to fetch data for ${ticker} on ${date}:`, res?.error || 'Unknown error');
              return { ticker, date, data: [] };
                }
                
                // Check if brokerData exists
                if (!res.data || !res.data.brokerData || !Array.isArray(res.data.brokerData)) {
                  console.warn(`[BrokerSummary] No broker data in response for ${ticker} on ${date}`);
              return { ticker, date, data: [] };
                }
                
            // Check if this is a sector or IDX
            const isSector = selectedTickers.some(t => t.startsWith('[SECTOR] ') && t.replace('[SECTOR] ', '') === ticker);
            const isIDX = ticker === 'IDX';
                
            const rows: BrokerSummaryData[] = (res.data.brokerData ?? []).map((r: any) => {
            // Backend already calculates NetSellVol, NetSellValue, NetBuyerAvg, NetSellerAvg
            // Backend also handles the logic: if NetBuy is negative, it becomes NetSell and NetBuy = 0
            // IMPORTANT: 
            // - For IDX: Calculate NetBuy/NetSell directly from BuyerVol - SellerVol in frontend (more precise)
            // - For sectors: NetBuy/NetSell need to be swapped because CSV has swap
            // - For regular stocks: use as is from CSV
              
              // Get base values from CSV
              const buyerVol = Number(r.BuyerVol ?? 0);
              const buyerValue = Number(r.BuyerValue ?? 0);
              const sellerVol = Number(r.SellerVol ?? 0);
              const sellerValue = Number(r.SellerValue ?? 0);
              
              let netBuyVol = 0;
              let netBuyValue = 0;
              let netSellVol = 0;
              let netSellValue = 0;
              let netBuyerAvg = 0;
              let netSellerAvg = 0;
              
              if (isIDX) {
                // IDX: Calculate NetBuy/NetSell directly from BuyerVol - SellerVol (more precise)
                // IMPORTANT: In CSV there's a SWAP:
                // - BuyerVol (CSV) = data from BRK_COD1 (actual seller)
                // - SellerVol (CSV) = data from BRK_COD2 (actual buyer)
                // So to calculate NetBuy correctly, we need to swap back:
                // NetBuy = actual buyer - actual seller = SellerVol (CSV) - BuyerVol (CSV)
                const actualBuyerVol = sellerVol;  // SellerVol (CSV) = actual buyer (BRK_COD2)
                const actualBuyerValue = sellerValue;
                const actualSellerVol = buyerVol;   // BuyerVol (CSV) = actual seller (BRK_COD1)
                const actualSellerValue = buyerValue;
                
                // NetBuy = actual buyer - actual seller
                const rawNetBuyVol = actualBuyerVol - actualSellerVol;
                const rawNetBuyValue = actualBuyerValue - actualSellerValue;
                
                if (rawNetBuyVol < 0 || rawNetBuyValue < 0) {
                  // NetBuy is negative, so it becomes NetSell
                  netSellVol = Math.abs(rawNetBuyVol);
                  netSellValue = Math.abs(rawNetBuyValue);
                  netBuyVol = 0;
                  netBuyValue = 0;
                } else {
                  // NetBuy is positive or zero, keep it and NetSell is 0
                  netBuyVol = rawNetBuyVol;
                  netBuyValue = rawNetBuyValue;
                  netSellVol = 0;
                  netSellValue = 0;
                }
                
                // Calculate averages in frontend for IDX
                netBuyerAvg = netBuyVol > 0 ? netBuyValue / netBuyVol : 0;
                netSellerAvg = netSellVol > 0 ? netSellValue / netSellVol : 0;
              } else if (isSector) {
                // For sectors: swap NetBuy and NetSell (because CSV has swap)
                const rawNetBuyVol = Number(r.NetBuyVol ?? 0);
                const rawNetBuyValue = Number(r.NetBuyValue ?? 0);
                const rawNetSellVol = Number(r.NetSellVol ?? 0);
                const rawNetSellValue = Number(r.NetSellValue ?? 0);
                
                netBuyVol = rawNetSellVol;
                netBuyValue = rawNetSellValue;
                netSellVol = rawNetBuyVol;
                netSellValue = rawNetBuyValue;
                netBuyerAvg = Number(r.NetSellerAvg ?? 0);
                netSellerAvg = Number(r.NetBuyerAvg ?? 0);
              } else {
                // For regular stocks: use as is from CSV
                netBuyVol = Number(r.NetBuyVol ?? 0);
                netBuyValue = Number(r.NetBuyValue ?? 0);
                netSellVol = Number(r.NetSellVol ?? 0);
                netSellValue = Number(r.NetSellValue ?? 0);
                netBuyerAvg = Number(r.NetBuyerAvg ?? 0);
                netSellerAvg = Number(r.NetSellerAvg ?? 0);
              }
              
              return {
                    broker: r.BrokerCode ?? r.broker ?? r.BROKER ?? r.code ?? '',
                    buyerVol: Number(r.BuyerVol ?? 0),
                    buyerValue: Number(r.BuyerValue ?? 0),
                    bavg: Number(r.BuyerAvg ?? r.bavg ?? 0),
                    sellerVol: Number(r.SellerVol ?? 0),
                    sellerValue: Number(r.SellerValue ?? 0),
                    savg: Number(r.SellerAvg ?? r.savg ?? 0),
              // Net Buy fields (swapped for sectors)
                    netBuyVol: netBuyVol,
                    netBuyValue: netBuyValue,
              netBuyerAvg: netBuyerAvg,
              // Net Sell fields (swapped for sectors)
              netSellVol: netSellVol,
              netSellValue: netSellValue,
              netSellerAvg: netSellerAvg,
              // Legacy fields for backward compatibility
                    nblot: netBuyVol,
                    nbval: netBuyValue,
                    sl: Number(r.SellerVol ?? r.sl ?? 0),
              nslot: netSellVol,
              nsval: netSellValue
                  };
                }) as BrokerSummaryData[];
                
          // Store in cache
          cache.set(cacheKey, { data: rows, timestamp: now });
          
          // Save to localStorage (debounced)
          saveCacheToStorage();
                
            return { ticker, date, data: rows };
        };

        // OPTIMIZED: Fetch all data in parallel with batching to avoid overwhelming browser
        // Batch size: Increased to 20 for faster sector loading (sectors have many stocks)
        // For sectors with 20+ stocks, this reduces batch count significantly
        const BATCH_SIZE = 20;
        
        // Create all fetch task descriptions (NOT promises yet - create promises only when needed)
        // Use uniqueTickers (sectors are fetched directly, not expanded)
        const allFetchTasks = selectedDates.flatMap(date =>
          uniqueTickers.map(ticker => ({ ticker, date }))
        );
        
        // Retry mechanism: try up to 3 times if no valid data fetched
        const MAX_RETRIES = 3;
        let validResults: Array<{ ticker: string; date: string; data: BrokerSummaryData[] }> = [];
        let retryAttempt = 0;
        
        while (retryAttempt < MAX_RETRIES) {
          // CRITICAL: Check ref before each retry attempt
          if (!shouldFetchDataRef.current || abortController.signal.aborted) {
            setIsLoading(false);
            setIsDataReady(false);
            return;
          }
          
          const now = Date.now();
          
          // Clear expired cache entries
          for (const [key, value] of cache.entries()) {
            if (now - value.timestamp > CACHE_EXPIRY_MS) {
              cache.delete(key);
            }
          }
          
          const allDataResults: Array<{ ticker: string; date: string; data: BrokerSummaryData[] }> = [];
          
          if (retryAttempt > 0) {
            // Add delay between retries (500ms)
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          // OPTIMIZED: Process in batches with progressive rendering for faster display
          // For sectors with many stocks, show data as soon as first batch completes
          let hasShownFirstData = false;
          
          // Create promises only when needed (not all at once)
          for (let i = 0; i < allFetchTasks.length; i += BATCH_SIZE) {
            // CRITICAL: Check ref before each batch - user might have changed dates
            if (!shouldFetchDataRef.current || abortController.signal.aborted) {
              setIsLoading(false);
              setIsDataReady(false);
              return;
            }
            
            const batch = allFetchTasks.slice(i, i + BATCH_SIZE);
            
            try {
              // Create promises only for this batch (not all at once)
              // Skip cache on retry attempts (retryAttempt > 0)
              const batchPromises = batch.map(({ ticker, date }) => fetchSingleData(ticker, date, retryAttempt > 0));
              
              // Wait for current batch to complete
              const batchResults = await Promise.all(batchPromises);
              
              // CRITICAL: Check ref after each batch - user might have changed dates
              if (!shouldFetchDataRef.current || abortController.signal.aborted) {
                setIsLoading(false);
                setIsDataReady(false);
                return;
              }
              
              allDataResults.push(...batchResults);
              
              // PROGRESSIVE RENDERING: Show data after first batch completes (for faster display)
              // This is especially useful for sectors with many stocks
              if (!hasShownFirstData && allDataResults.length > 0) {
                const firstBatchValidResults = allDataResults.filter(result => result.ticker && result.date && result.data.length > 0);
                if (firstBatchValidResults.length > 0) {
                  // Aggregate and show first batch data immediately
                  const tempAggregatedMap = new Map<string, Map<string, BrokerSummaryData>>();
                  selectedDates.forEach(date => {
                    tempAggregatedMap.set(date, new Map<string, BrokerSummaryData>());
                  });
                  
                  firstBatchValidResults.forEach(({ date, data }) => {
                    const dateMap = tempAggregatedMap.get(date);
                    if (!dateMap) return;
                    
                    data.forEach(row => {
                      const broker = row.broker;
                      if (!broker) return;
                      
                      const existing = dateMap.get(broker);
                      if (existing) {
                        existing.buyerVol += row.buyerVol;
                        existing.buyerValue += row.buyerValue;
                        existing.sellerVol += row.sellerVol;
                        existing.sellerValue += row.sellerValue;
                        existing.netBuyVol += row.netBuyVol;
                        existing.netBuyValue += row.netBuyValue;
                        existing.netSellVol += row.netSellVol;
                        existing.netSellValue += row.netSellValue;
                        existing.nblot += row.nblot;
                        existing.nbval += row.nbval;
                        existing.sl += row.sl;
                        existing.nslot += row.nslot;
                        existing.nsval += row.nsval;
                        existing.bavg = existing.buyerVol > 0 ? existing.buyerValue / existing.buyerVol : 0;
                        existing.savg = existing.sellerVol > 0 ? existing.sellerValue / existing.sellerVol : 0;
                        existing.netBuyerAvg = existing.netBuyVol > 0 ? existing.netBuyValue / existing.netBuyVol : 0;
                        existing.netSellerAvg = existing.netSellVol > 0 ? existing.netSellValue / existing.netSellVol : 0;
                      } else {
                        dateMap.set(broker, { ...row });
                      }
                    });
                  });
                  
                  // Convert to final format (Map<string, BrokerSummaryData[]>) and show immediately
                  const tempFinalMap = new Map<string, BrokerSummaryData[]>();
                  tempAggregatedMap.forEach((brokerMap, date) => {
                    tempFinalMap.set(date, Array.from(brokerMap.values()));
                  });
                  
                  setRawSummaryByDate(tempFinalMap);
                  setIsDataReady(true); // Show data immediately
                  hasShownFirstData = true;
                  console.log(`[BrokerSummary] Progressive rendering: Showing first batch data (${firstBatchValidResults.length} results)`);
                }
              }
            } catch (error: any) {
              // If aborted, silently abort
              if (error?.message === 'Fetch aborted' || !shouldFetchDataRef.current || abortController.signal.aborted) {
                setIsLoading(false);
                setIsDataReady(false);
                return;
              }
              
              // For other errors, log but continue with next batch
              console.error(`[BrokerSummary] Error in batch:`, error);
              // Don't add empty results - just skip failed items
            }
          }
          
          // CRITICAL: Final check after all batches - user might have changed dates during fetch
          if (!shouldFetchDataRef.current) {
            console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false after all batches, aborting aggregation');
            setIsLoading(false);
            setIsDataReady(false);
            return;
          }
          
          // Filter out empty results (failed fetches)
          validResults = allDataResults.filter(result => result.ticker && result.date && result.data.length > 0);
          console.log(`[BrokerSummary] Completed ${validResults.length}/${allFetchTasks.length} successful fetches (attempt ${retryAttempt + 1}/${MAX_RETRIES})`);
          
          // If we have valid results, break out of retry loop
          if (validResults.length > 0) {
            console.log(`[BrokerSummary] Successfully fetched data on attempt ${retryAttempt + 1}`);
            break;
          }
          
          // If no valid results and we haven't reached max retries, try again
          if (retryAttempt < MAX_RETRIES - 1) {
            console.warn(`[BrokerSummary] No valid data fetched on attempt ${retryAttempt + 1}, retrying...`);
            retryAttempt++;
          } else {
            // Last attempt failed, break and show error
            console.warn(`[BrokerSummary] No valid data fetched after ${MAX_RETRIES} attempts`);
            break;
          }
        }
        
        // If still no valid results after all retries, show "No Data Available" in table
        if (validResults.length === 0) {
          console.warn('[BrokerSummary] No valid data fetched after all retry attempts');
          // Clear data to show "No Data Available" in table
          setRawSummaryByDate(new Map());
          setSummaryByDate(new Map());
          setIsLoading(false);
          setIsDataReady(true); // Set to true so table can render "No Data Available"
          setError(null); // Clear error so table can render
          // Reset shouldFetchData to allow Show button to be clicked again
          shouldFetchDataRef.current = false;
          setShouldFetchData(false);
          return;
        }
        
        // Aggregate data per date and per broker (sum all tickers)
        const aggregatedMap = new Map<string, Map<string, BrokerSummaryData>>();
        
        selectedDates.forEach(date => {
          aggregatedMap.set(date, new Map<string, BrokerSummaryData>());
        });
        
        validResults.forEach(({ date, data }) => {
          // CRITICAL: Check ref during aggregation - user might have changed dates
          if (!shouldFetchDataRef.current) {
            return;
          }
          
          const dateMap = aggregatedMap.get(date);
          if (!dateMap) return;
          
          data.forEach(row => {
            const broker = row.broker;
            if (!broker) return;
            
            const existing = dateMap.get(broker);
            if (existing) {
              // Sum values from multiple tickers
              existing.buyerVol += row.buyerVol;
              existing.buyerValue += row.buyerValue;
              existing.sellerVol += row.sellerVol;
              existing.sellerValue += row.sellerValue;
              // Net Buy fields - sum directly (backend already handles negative -> NetSell conversion)
              existing.netBuyVol += row.netBuyVol;
              existing.netBuyValue += row.netBuyValue;
              existing.netSellVol += row.netSellVol;
              existing.netSellValue += row.netSellValue;
              
              // Legacy fields
              existing.nblot += row.nblot;
              existing.nbval += row.nbval;
              existing.sl += row.sl;
              existing.nslot += row.nslot;
              existing.nsval += row.nsval;

              // Recalculate averages (only for Buyer/Seller avg, NetBuyerAvg/NetSellerAvg already from backend per ticker)
              // For aggregated data across multiple tickers, we need to recalculate net averages
              existing.bavg = existing.buyerVol > 0 ? existing.buyerValue / existing.buyerVol : 0;
              existing.savg = existing.sellerVol > 0 ? existing.sellerValue / existing.sellerVol : 0;
              // Recalculate net averages from aggregated values
              existing.netBuyerAvg = existing.netBuyVol > 0 ? existing.netBuyValue / existing.netBuyVol : 0;
              existing.netSellerAvg = existing.netSellVol > 0 ? existing.netSellValue / existing.netSellVol : 0;
            } else {
              // First occurrence of this broker for this date - clone row
              dateMap.set(broker, { ...row });
            }
          });
        });
        
        // CRITICAL: Check ref again before setting data - user might have changed dates during aggregation
        if (!shouldFetchDataRef.current || abortController.signal.aborted) {
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }
        
        // Convert aggregated map to the format expected by the component
        const finalMap = new Map<string, BrokerSummaryData[]>();
        aggregatedMap.forEach((brokerMap, date) => {
          const rows = Array.from(brokerMap.values());
          finalMap.set(date, rows);
        });
        
        // CRITICAL: Final check before storing data - user might have changed dates
        if (!shouldFetchDataRef.current || abortController.signal.aborted) {
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }
        
        // Store raw data (without investor filter) for client-side filtering
        setRawSummaryByDate(finalMap);
        
        // Note: summaryByDate will be updated by the filter effect below based on displayedFdFilter

        // CRITICAL: Check ref again before showing toast and setting data ready
        // User might have changed dates during aggregation
        if (!shouldFetchDataRef.current || abortController.signal.aborted) {
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }

        // Show toast for range > 7 days only after data is fetched (after clicking Show)
        const showOnlyTotalNow = selectedDates.length > 7;
        if (showOnlyTotalNow) {
          showToast({
            type: 'info',
            title: 'Range Tanggal Lebih dari 7 Hari',
            message: `Anda telah memilih ${selectedDates.length} hari kerja. Hanya kolom Total yang akan ditampilkan untuk VALUE dan NET.`,
          });
        }

        // CRITICAL: Final check before marking data ready
        if (!shouldFetchDataRef.current || abortController.signal.aborted) {
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }

        // Update displayed values when data is successfully fetched
        // This ensures header shows correct tickers and market after data is loaded
        setDisplayedTickers([...selectedTickers]);
        setDisplayedMarket(marketFilter);

        // Mark loading as complete and show data immediately
        setIsLoading(false);
        
        // OPTIMIZED: Show data immediately after state update
        // Column width sync will happen after data is visible (non-blocking)
        setIsDataReady(true);
        
        // CRITICAL: Reset shouldFetchData to false after successful fetch
        // This allows the Show button to be clicked again and trigger a new fetch
        shouldFetchDataRef.current = false;
        setShouldFetchData(false);
        
        // Clear abort controller after successful fetch
        abortControllerRef.current = null;
      } catch (e: any) {
        // If aborted, don't show error - just reset state
        // Check abortControllerRef.current instead of local abortController (which might be stale)
        const wasAborted = abortControllerRef.current?.signal.aborted || e?.message === 'Fetch aborted' || !shouldFetchDataRef.current;
        if (wasAborted) {
          setIsLoading(false);
          setIsDataReady(false);
          // Reset shouldFetchData to allow Show button to be clicked again
          shouldFetchDataRef.current = false;
          setShouldFetchData(false);
          abortControllerRef.current = null;
          return;
        }
        console.error('[BrokerSummary] Error fetching data:', e);
        setError(e?.message || 'Failed to load broker summary');
        setIsLoading(false);
        setIsDataReady(false);
        // Reset shouldFetchData to allow Show button to be clicked again
        shouldFetchDataRef.current = false;
        setShouldFetchData(false);
        abortControllerRef.current = null;
      }
    };

    fetchAll();
    
    // Cleanup: abort fetch if component unmounts or effect re-runs
    return () => {
      if (abortControllerRef.current) {
        console.log('[BrokerSummary] Cleaning up: aborting fetch');
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
    // Only depend on shouldFetchData - selectedTickers, selectedDates, marketFilter are already accessed inside
    // This prevents auto-fetch when dates/tickers change - only fetch when Show button is clicked
  }, [shouldFetchData]);

  // OPTIMIZED: Removed measureColumnWidths - width sync handled in syncTableWidths() which is more efficient

  // Sync NET container width with VALUE container width (tables auto-size, only sync container)
  useEffect(() => {
    const syncTableWidths = () => {
      const valueContainer = valueTableContainerRef.current;
      const netContainer = netTableContainerRef.current;

      if (!valueContainer || !netContainer) return;

      // Calculate showOnlyTotal from current data (not from dependency) to avoid effect re-run when dates change
      const showOnlyTotalNow = summaryByDate.size > 0 && Array.from(summaryByDate.keys()).length > 7;

      // For showOnlyTotal, let tables size naturally based on content (don't force width)
      if (showOnlyTotalNow) {
        // Reset any forced widths to allow natural sizing
        valueContainer.style.width = '';
        valueContainer.style.minWidth = '';
        netContainer.style.width = '';
        netContainer.style.minWidth = '';
        
        // Reset parent wrappers
        const valueParentWrapper = valueContainer.parentElement;
        const netParentWrapper = netContainer.parentElement;
        if (valueParentWrapper && netParentWrapper) {
          valueParentWrapper.style.width = '';
          valueParentWrapper.style.minWidth = '';
          netParentWrapper.style.width = '';
          netParentWrapper.style.minWidth = '';
        }
        
        // Reset main wrappers
        const valueMainWrapper = valueParentWrapper?.parentElement;
        const netMainWrapper = netParentWrapper?.parentElement;
        if (valueMainWrapper && netMainWrapper) {
          valueMainWrapper.style.width = '';
          valueMainWrapper.style.minWidth = '';
          netMainWrapper.style.width = '';
          netMainWrapper.style.minWidth = '';
        }
        
        // Still sync column widths for alignment
        // (will continue to syncTableWidths logic below)
      } else {
        // For normal view (with date columns), sync container widths
        const valueContainerWidth = valueContainer.offsetWidth || valueContainer.clientWidth;
        
        if (valueContainerWidth > 0) {
          // Sync NET container width to match VALUE container width exactly
          // Tables will auto-size based on their content, but containers have same width
          netContainer.style.width = `${valueContainerWidth}px`;
          netContainer.style.minWidth = `${valueContainerWidth}px`;
          
          // Sync parent wrappers to ensure same width
          const valueParentWrapper = valueContainer.parentElement;
          const netParentWrapper = netContainer.parentElement;
          if (valueParentWrapper && netParentWrapper) {
            const valueParentWidth = valueParentWrapper.offsetWidth || valueParentWrapper.clientWidth;
            if (valueParentWidth > 0) {
              netParentWrapper.style.width = `${valueParentWidth}px`;
              netParentWrapper.style.minWidth = `${valueParentWidth}px`;
            }
          }
          
          // Sync main wrappers
          const valueMainWrapper = valueParentWrapper?.parentElement;
          const netMainWrapper = netParentWrapper?.parentElement;
          if (valueMainWrapper && netMainWrapper) {
            const valueMainWidth = valueMainWrapper.offsetWidth || valueMainWrapper.clientWidth;
            if (valueMainWidth > 0) {
              netMainWrapper.style.width = `${valueMainWidth}px`;
              netMainWrapper.style.minWidth = `${valueMainWidth}px`;
            }
          }
        }
      }

      // ROOT CAUSE FIX: Use table-layout: fixed to ensure exact column width matching
      // With table-auto, browser can redistribute widths dynamically, causing misalignment
      // For showOnlyTotal, use auto layout for natural sizing
      const valueTable = valueTableRef.current;
      const netTable = netTableRef.current;

      if (!valueTable || !netTable) return;

      // Use showOnlyTotalNow calculated above
      if (showOnlyTotalNow) {
        // For showOnlyTotal, let tables size naturally - don't force widths
        valueTable.style.tableLayout = 'auto';
        netTable.style.tableLayout = 'auto';
        
        // Still sync column widths for alignment, but don't force maxWidth
        const valueHeaderRows = valueTable.querySelectorAll('thead tr');
        const netHeaderRows = netTable.querySelectorAll('thead tr');
        
        if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
          const valueColumnHeaderRow = valueHeaderRows[1];
          const netColumnHeaderRow = netHeaderRows[1];
          
          if (valueColumnHeaderRow && netColumnHeaderRow) {
            const valueHeaderCells = Array.from(valueColumnHeaderRow.querySelectorAll('th'));
            const netHeaderCells = Array.from(netColumnHeaderRow.querySelectorAll('th'));
            const valueBodyRows = valueTable.querySelectorAll('tbody tr');
            
            // Calculate min width for each column (for alignment)
            const columnMinWidths: number[] = [];
            
            valueHeaderCells.forEach((valueCell, index) => {
              const valueEl = valueCell as HTMLElement;
              let minWidth = Math.max(valueEl.scrollWidth, valueEl.offsetWidth);
              
              // Check body cells
              valueBodyRows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells[index]) {
                  const cellEl = cells[index] as HTMLElement;
                  const cellWidth = Math.max(cellEl.scrollWidth, cellEl.offsetWidth);
                  minWidth = Math.max(minWidth, cellWidth);
                }
              });
              
              columnMinWidths[index] = minWidth;
            });
            
            // Apply minWidth only (not fixed width) to allow natural expansion
            valueHeaderCells.forEach((valueCell, index) => {
              const valueEl = valueCell as HTMLElement;
              const minWidth = columnMinWidths[index];
              if (minWidth && minWidth > 0) {
                valueEl.style.minWidth = `${minWidth}px`;
                valueEl.style.width = '';
                valueEl.style.maxWidth = '';
              }
            });
            
            netHeaderCells.forEach((netCell, index) => {
              const netEl = netCell as HTMLElement;
              const minWidth = columnMinWidths[index];
              if (minWidth && minWidth > 0) {
                netEl.style.minWidth = `${minWidth}px`;
                netEl.style.width = '';
                netEl.style.maxWidth = '';
              }
            });
            
            // Apply minWidth to body cells
            const netBodyRows = netTable.querySelectorAll('tbody tr');
            const maxRows = Math.max(valueBodyRows.length, netBodyRows.length);
            
            for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
              const valueRow = valueBodyRows[rowIdx] as HTMLTableRowElement;
              const netRow = netBodyRows[rowIdx] as HTMLTableRowElement;
              
              if (valueRow && netRow) {
                const valueCells = Array.from(valueRow.querySelectorAll('td'));
                const netCells = Array.from(netRow.querySelectorAll('td'));
                
                valueCells.forEach((valueCell, cellIdx) => {
                  if (cellIdx < columnMinWidths.length) {
                    const minWidth = columnMinWidths[cellIdx];
                    if (minWidth && minWidth > 0) {
                      const valueEl = valueCell as HTMLElement;
                      valueEl.style.minWidth = `${minWidth}px`;
                      valueEl.style.width = '';
                      valueEl.style.maxWidth = '';
                      
                      if (netCells[cellIdx]) {
                        const netEl = netCells[cellIdx] as HTMLElement;
                        netEl.style.minWidth = `${minWidth}px`;
                        netEl.style.width = '';
                        netEl.style.maxWidth = '';
                      }
                    }
                  }
                });
              }
            }
          }
        }
      } else {
        // For normal view (with date columns), use fixed layout with exact widths
        // Step 1: Let VALUE table calculate column widths naturally with auto layout first
        valueTable.style.tableLayout = 'auto';
        
        // Step 2: Measure all column widths from VALUE table (header + body cells)
        const valueHeaderRows = valueTable.querySelectorAll('thead tr');
        const netHeaderRows = netTable.querySelectorAll('thead tr');
        
        if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
          const valueColumnHeaderRow = valueHeaderRows[1];
          const netColumnHeaderRow = netHeaderRows[1];
          
          if (valueColumnHeaderRow && netColumnHeaderRow) {
            const valueHeaderCells = Array.from(valueColumnHeaderRow.querySelectorAll('th'));
            const netHeaderCells = Array.from(netColumnHeaderRow.querySelectorAll('th'));
            const valueBodyRows = valueTable.querySelectorAll('tbody tr');
            
            // Calculate exact width for each column from VALUE table
            const columnWidths: number[] = [];
            
            valueHeaderCells.forEach((valueCell, index) => {
              const valueEl = valueCell as HTMLElement;
              // Start with header width
              let maxWidth = Math.max(valueEl.scrollWidth, valueEl.offsetWidth);
              
              // Check all body cells in this column to find maximum width
              valueBodyRows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells[index]) {
                  const cellEl = cells[index] as HTMLElement;
                  const cellWidth = Math.max(cellEl.scrollWidth, cellEl.offsetWidth);
                  maxWidth = Math.max(maxWidth, cellWidth);
                }
              });
              
              columnWidths[index] = maxWidth;
            });
            
            // Step 3: Apply fixed layout to both tables with exact widths
            valueTable.style.tableLayout = 'fixed';
            netTable.style.tableLayout = 'fixed';
            
            // Step 4: Apply exact widths to VALUE table headers (to lock them)
            valueHeaderCells.forEach((valueCell, index) => {
              const valueEl = valueCell as HTMLElement;
              const width = columnWidths[index];
              if (width && width > 0) {
                valueEl.style.width = `${width}px`;
                valueEl.style.minWidth = `${width}px`;
                valueEl.style.maxWidth = `${width}px`;
              }
            });
            
            // Step 5: Apply exact same widths to NET table headers
            netHeaderCells.forEach((netCell, index) => {
              const netEl = netCell as HTMLElement;
              const width = columnWidths[index];
              if (width && width > 0) {
                netEl.style.width = `${width}px`;
                netEl.style.minWidth = `${width}px`;
                netEl.style.maxWidth = `${width}px`;
              }
            });
            
            // Step 6: Apply exact widths to all body cells in both tables
            const netBodyRows = netTable.querySelectorAll('tbody tr');
            const maxRows = Math.max(valueBodyRows.length, netBodyRows.length);
            
            for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
              const valueRow = valueBodyRows[rowIdx] as HTMLTableRowElement;
              const netRow = netBodyRows[rowIdx] as HTMLTableRowElement;
              
              if (valueRow && netRow) {
                const valueCells = Array.from(valueRow.querySelectorAll('td'));
                const netCells = Array.from(netRow.querySelectorAll('td'));
                
                valueCells.forEach((valueCell, cellIdx) => {
                  if (cellIdx < columnWidths.length) {
                    const width = columnWidths[cellIdx];
                    if (width && width > 0) {
                      // Apply to VALUE body cell
                      const valueEl = valueCell as HTMLElement;
                      valueEl.style.width = `${width}px`;
                      valueEl.style.minWidth = `${width}px`;
                      valueEl.style.maxWidth = `${width}px`;
                      
                      // Apply to NET body cell
                      if (netCells[cellIdx]) {
                        const netEl = netCells[cellIdx] as HTMLElement;
                        netEl.style.width = `${width}px`;
                        netEl.style.minWidth = `${width}px`;
                        netEl.style.maxWidth = `${width}px`;
                      }
                    }
                  }
                });
              }
            }
          }
        }
      }
    };

    // OPTIMIZED: Sync column widths after data is visible (non-blocking)
    // Single sync pass after data renders - faster approach
    let dataTimeoutId: NodeJS.Timeout | null = null;
    if (!isLoading && isDataReady) {
      // Single sync after data renders (reduced from 3 passes to 1)
      // Calculate showOnlyTotal here (not from dependency) to avoid effect re-run when dates change
      const showOnlyTotalNow = summaryByDate.size > 0 && Array.from(summaryByDate.keys()).length > 7;
      dataTimeoutId = setTimeout(() => {
        syncTableWidths();
      }, showOnlyTotalNow ? 100 : 50);
    }

    // Optimized: Use ResizeObserver with debouncing for resize events only
    let resizeObserver: ResizeObserver | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    
    const debouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        syncTableWidths();
      }, 200);
    };
    
    if (valueTableRef.current && isDataReady) {
      resizeObserver = new ResizeObserver(() => {
        debouncedSync();
      });
      resizeObserver.observe(valueTableRef.current);
    }

    // Also sync on window resize (with debouncing)
    const handleResize = () => {
      debouncedSync();
    };
    window.addEventListener('resize', handleResize);
      
      return () => {
      if (dataTimeoutId) clearTimeout(dataTimeoutId);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [summaryByDate, isLoading, isDataReady]); // Removed showOnlyTotal - only sync when data changes, not when dates change


  // Synchronize horizontal scroll between Value, Net, and Total tables - optimized for smooth scrolling
  useEffect(() => {
    // Wait for tables to be ready (data loaded and DOM rendered)
    if (isLoading || !isDataReady) return;

    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;
    const totalContainer = totalTableContainerRef.current;

    if (!valueContainer || !netContainer || !totalContainer) return;

    // Track which container is being scrolled to prevent circular updates
    // Use a more robust flag system that resets immediately after sync
    let isValueScrolling = false;
    let isNetScrolling = false;
    let isTotalScrolling = false;

    // Handle Value table scroll - sync to Net and Total tables immediately
    const handleValueScroll = () => {
      // Only sync if other containers are not currently being scrolled
      if (!isNetScrolling && !isTotalScrolling) {
        isValueScrolling = true;
        // Immediate synchronization - no delay for smooth scrolling
        if (netContainer) netContainer.scrollLeft = valueContainer.scrollLeft;
        if (totalContainer) totalContainer.scrollLeft = valueContainer.scrollLeft;
        // Reset flag immediately to allow continuous smooth scrolling
        isValueScrolling = false;
      }
    };

    // Handle Net table scroll - sync to Value and Total tables immediately
    const handleNetScroll = () => {
      // Only sync if other containers are not currently being scrolled
      if (!isValueScrolling && !isTotalScrolling) {
        isNetScrolling = true;
        // Immediate synchronization - no delay for smooth scrolling
        if (valueContainer) valueContainer.scrollLeft = netContainer.scrollLeft;
        if (totalContainer) totalContainer.scrollLeft = netContainer.scrollLeft;
        // Reset flag immediately to allow continuous smooth scrolling
        isNetScrolling = false;
      }
    };

    // Handle Total table scroll - sync to Value and Net tables immediately
    const handleTotalScroll = () => {
      // Only sync if other containers are not currently being scrolled
      if (!isValueScrolling && !isNetScrolling) {
        isTotalScrolling = true;
        // Immediate synchronization - no delay for smooth scrolling
        if (valueContainer) valueContainer.scrollLeft = totalContainer.scrollLeft;
        if (netContainer) netContainer.scrollLeft = totalContainer.scrollLeft;
        // Reset flag immediately to allow continuous smooth scrolling
        isTotalScrolling = false;
      }
    };

    // Add event listeners with passive flag for better performance
    valueContainer.addEventListener('scroll', handleValueScroll, { passive: true });
    netContainer.addEventListener('scroll', handleNetScroll, { passive: true });
    totalContainer.addEventListener('scroll', handleTotalScroll, { passive: true });

    return () => {
      valueContainer.removeEventListener('scroll', handleValueScroll);
      netContainer.removeEventListener('scroll', handleNetScroll);
      totalContainer.removeEventListener('scroll', handleTotalScroll);
    };
  }, [isLoading, isDataReady, summaryByDate]); // Re-setup when data changes

  // clearAllDates removed with Reset button

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (stockSearchTimeout) {
        clearTimeout(stockSearchTimeout);
      }
    };
  }, [stockSearchTimeout]);

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

    // Also check when selectedTickers changes (ticker selection affects menu height)
    const timeoutId = setTimeout(checkMenuHeight, 100);

    return () => {
      window.removeEventListener('resize', checkMenuHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      clearTimeout(timeoutId);
    };
  }, [selectedTickers, selectedDates, startDate, endDate, fdFilter, marketFilter]);

  const handleStockSelect = (stock: string) => {
    // Check if it's a sector (has [SECTOR] prefix)
    if (stock.startsWith('[SECTOR] ')) {
      // Add sector name to selectedTickers (not individual stocks)
      if (!selectedTickers.includes(stock)) {
        const sectorName = stock.replace('[SECTOR] ', '');
        const stocksInSector = sectorMapping[sectorName] || [];
        
        // Remove individual stocks from this sector from selectedTickers (to avoid duplication)
        const updatedTickers = selectedTickers.filter(ticker => 
          !stocksInSector.includes(ticker)
        );
        
        setSelectedTickers([...updatedTickers, stock]);
        console.log(`[BrokerSummary] Added sector: ${sectorName} (${stocksInSector.length} stocks)`);
      }
    } else {
      // Regular stock selection - check if it's not already in a selected sector
      const stockSector = Object.keys(sectorMapping).find(sector => 
        sectorMapping[sector]?.includes(stock)
      );
      
      // Check if this stock's sector is already selected
      const sectorAlreadySelected = stockSector && selectedTickers.includes(`[SECTOR] ${stockSector}`);
      
      if (!sectorAlreadySelected && !selectedTickers.includes(stock)) {
        setSelectedTickers([...selectedTickers, stock]);
      }
    }
    setTickerInput('');
    setShowStockSuggestions(false);
  };

  const handleRemoveTicker = (stock: string) => {
    setSelectedTickers(selectedTickers.filter(t => t !== stock));
  };

  const handleStockInputChange = (value: string) => {
    setTickerInput(value);
    setShowStockSuggestions(true);

    // Clear previous timeout
    if (stockSearchTimeout) {
      clearTimeout(stockSearchTimeout);
      setStockSearchTimeout(null);
    }

    // If stocks not loaded yet, load them (no debounce needed - stocks already loaded on mount)
    // But if for some reason stocks are not loaded, try to load them
    if (availableStocks.length === 0) {
      const timeout = setTimeout(async () => {
        try {
          console.log('[BrokerSummary] Loading stock list on demand...');
          const [stockResult, sectorResult] = await Promise.all([
            api.getStockList(),
            api.getSectorMapping()
          ]);
          
          let stocks: string[] = [];
          let sectors: string[] = [];
          let mapping: { [sector: string]: string[] } = {};
          
          if (stockResult.success && stockResult.data?.stocks && Array.isArray(stockResult.data.stocks)) {
            stocks = stockResult.data.stocks;
          }
          
          if (sectorResult.success && sectorResult.data) {
            sectors = sectorResult.data.sectors || [];
            mapping = sectorResult.data.sectorMapping || {};
            setSectorMapping(mapping);
          }
          
          // Remove IDX from ticker list (IDX is now a sector, not a ticker)
          const stocksWithoutIdx = stocks.filter(stock => stock !== 'IDX');
          
          // Add sectors to the list (with prefix to distinguish from stocks)
          const sectorsWithPrefix = sectors.map(sector => `[SECTOR] ${sector}`);
          
          // Combine stocks and sectors, then sort alphabetically
          const allItems = [...stocksWithoutIdx, ...sectorsWithPrefix].sort((a: string, b: string) => a.localeCompare(b));
          
          setAvailableStocks(allItems);
        } catch (err) {
          console.error('Error loading stocks:', err);
          // Even if API fails, ensure IDX is available as sector
          setAvailableStocks(['[SECTOR] IDX']);
        }
      }, 100); // Short delay only if needed
      setStockSearchTimeout(timeout);
    }

    // If exact match, select it immediately
    const upperValue = value.toUpperCase();
    // Check for exact stock match
    if ((availableStocks || []).includes(upperValue) && !selectedTickers.includes(upperValue)) {
      setSelectedTickers([...selectedTickers, upperValue]);
      setTickerInput('');
      setShowStockSuggestions(false);
      return;
    }
    // Check for exact sector match (case-insensitive)
    const sectorMatch = availableStocks.find(stock => 
      stock.startsWith('[SECTOR] ') && 
      stock.replace('[SECTOR] ', '').toUpperCase() === upperValue &&
      !selectedTickers.includes(stock)
    );
    if (sectorMatch) {
      handleStockSelect(sectorMatch);
      return;
    }
  };

  // Separate stocks and sectors for display
  const filteredStocksList = (availableStocks || []).filter(stock => {
    const searchTerm = tickerInput.toLowerCase();
    // Only include stocks (not sectors)
    if (stock.startsWith('[SECTOR] ')) {
      return false;
    }
    // Check if this stock's sector is already selected
    const stockSector = Object.keys(sectorMapping).find(sector => 
      sectorMapping[sector]?.includes(stock)
    );
    const sectorAlreadySelected = stockSector && selectedTickers.includes(`[SECTOR] ${stockSector}`);
    
    // For regular stocks, search normally and exclude if sector is selected
    return stock.toLowerCase().includes(searchTerm) && !selectedTickers.includes(stock) && !sectorAlreadySelected;
  });

  const filteredSectorsList = (availableStocks || []).filter(stock => {
    const searchTerm = tickerInput.toLowerCase();
    // Only include sectors
    if (stock.startsWith('[SECTOR] ')) {
      const sectorName = stock.replace('[SECTOR] ', '').toLowerCase();
      return sectorName.includes(searchTerm) && !selectedTickers.includes(stock);
    }
    return false;
  });
  
  // For backward compatibility (used in exact match check)
  const filteredStocks = [...filteredStocksList, ...filteredSectorsList];

  // Helper function to format display name (remove [SECTOR] prefix for display)
  const formatStockDisplayName = (stock: string): string => {
    if (stock.startsWith('[SECTOR] ')) {
      const sectorName = stock.replace('[SECTOR] ', '');
      // Replace IDX with IDX Composite for display
      return sectorName === 'IDX' ? 'IDX Composite' : sectorName;
    }
    return stock;
  };

  // Helper function to trigger date picker
  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: string) => {
    return date; // Already in YYYY-MM-DD format
  };

  // Font size fixed to normal (no menu)
  const getFontSizeClass = () => 'text-[12px]';

  // Filter raw data by investor filter (client-side filtering)
  useEffect(() => {
    if (rawSummaryByDate.size === 0) {
      // No raw data, clear filtered data
      setSummaryByDate(new Map());
      return;
    }
    
    // Apply investor filter to raw data
    const filteredMap = new Map<string, BrokerSummaryData[]>();
    
    rawSummaryByDate.forEach((rows, date) => {
      const filteredRows = rows.filter(row => {
        if (displayedFdFilter === 'Foreign') {
          return FOREIGN_BROKERS.includes(row.broker) && !GOVERNMENT_BROKERS.includes(row.broker);
        }
        if (displayedFdFilter === 'Domestic') {
          return (!FOREIGN_BROKERS.includes(row.broker) || GOVERNMENT_BROKERS.includes(row.broker));
        }
        return true; // All
      });
      
      if (filteredRows.length > 0) {
        filteredMap.set(date, filteredRows);
      }
    });
    
    setSummaryByDate(filteredMap);
  }, [rawSummaryByDate, displayedFdFilter]);

  // Helper function to filter brokers by F/D (uses displayedFdFilter - the filter that was applied when Show button was clicked)
  const brokerFDScreen = (broker: string): boolean => {
    if (displayedFdFilter === 'Foreign') {
      return FOREIGN_BROKERS.includes(broker) && !GOVERNMENT_BROKERS.includes(broker);
    }
    if (displayedFdFilter === 'Domestic') {
      return (!FOREIGN_BROKERS.includes(broker) || GOVERNMENT_BROKERS.includes(broker));
    }
    return true; // All
  };
  
  // Helper function to get market/board label for display
  const getMarketLabel = (market: 'RG' | 'TN' | 'NG' | ''): string => {
    if (market === 'RG') return 'RG';
    if (market === 'TN') return 'TN';
    if (market === 'NG') return 'NG';
    return 'All Trade';
  };

  // Memoize availableDates to avoid recalculating on every render
  // CRITICAL: Only depend on summaryByDate, not selectedDates
  // This ensures NO recalculate when user changes dates - only when data changes (after Show button clicked)
  const availableDates = useMemo(() => {
    // Return dates that have data in summaryByDate, sorted by date
    const datesWithData = Array.from(summaryByDate.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return datesWithData;
  }, [summaryByDate]);

  // Measure and store date column widths from VALUE table to apply to Total table
  useEffect(() => {
    if (isLoading || !isDataReady || showOnlyTotal) return;

    const valueTable = valueTableRef.current;
    if (!valueTable) return;

    // Wait for table to render
    const measureWidths = () => {
      const valueHeaderRows = valueTable.querySelectorAll('thead tr');
      if (valueHeaderRows.length < 2) return;

      // Get the second row (column headers) for accurate width measurement
      const columnHeaderRow = valueHeaderRows[1];
      if (!columnHeaderRow) return;
      
      const columnHeaderCells = Array.from(columnHeaderRow.querySelectorAll('th'));

      // Clear previous widths
      dateColumnWidthsRef.current.clear();
      totalColumnWidthRef.current = 0;

      // Measure width of each date column (excluding Total column)
      const datesForHeader = summaryByDate.size === 0 ? selectedDates : availableDates;
      let cellIndex = 0;

      datesForHeader.forEach((date) => {
        // Each date column spans 9 columns, so we need to sum the width of 9 cells
        // Use column header cells for more accurate measurement (they have the actual column widths)
        let totalWidth = 0;
        for (let i = 0; i < 9 && cellIndex < columnHeaderCells.length; i++) {
          const cell = columnHeaderCells[cellIndex] as HTMLElement;
          if (cell) {
            // Use offsetWidth for more accurate measurement
            const cellWidth = cell.offsetWidth || cell.getBoundingClientRect().width || 0;
            totalWidth += cellWidth;
          }
          cellIndex++;
        }
        
        if (totalWidth > 0) {
          dateColumnWidthsRef.current.set(date, totalWidth);
        }
      });

      // Measure width of Total column (also spans 9 columns)
      let totalColumnWidth = 0;
      for (let i = 0; i < 9 && cellIndex < columnHeaderCells.length; i++) {
        const cell = columnHeaderCells[cellIndex] as HTMLElement;
        if (cell) {
          const cellWidth = cell.offsetWidth || cell.getBoundingClientRect().width || 0;
          totalColumnWidth += cellWidth;
        }
        cellIndex++;
      }
      
      if (totalColumnWidth > 0) {
        totalColumnWidthRef.current = totalColumnWidth;
      }
    };

    // Measure after a delay to ensure table is fully rendered and column widths are synced
    // Wait longer to ensure syncTableWidths has finished (which runs after 50-100ms)
    const timeoutId = setTimeout(measureWidths, 300);

    return () => clearTimeout(timeoutId);
  }, [summaryByDate, isLoading, isDataReady, showOnlyTotal, availableDates, selectedDates]);

  // Memoize allBrokerData to avoid recalculating on every render
  const allBrokerData = useMemo(() => {
    return availableDates.map(date => {
      const rows = summaryByDate.get(date) || [];
      return {
        date,
        buyData: rows,
        sellData: rows
      };
    });
  }, [availableDates, summaryByDate]);

  const renderHorizontalView = () => {
    if (selectedTickers.length === 0 || selectedDates.length === 0) return null;

    // Show error state
    if (error) {
      return (
        <div className="w-full px-4 py-8">
          <div className="text-sm text-destructive px-4 py-2 bg-destructive/10 rounded-md">
            {error}
          </div>
        </div>
      );
    }

    // Use selectedDates for header when data is empty (to show table structure like screenshot)
    // Use availableDates when data exists (to show only dates with data)
    const datesForHeader = summaryByDate.size === 0 ? selectedDates : availableDates;

    return (
      <div className="w-full relative">
        {/* Tables */}
        <div className="w-full">
        {/* Combined Buy & Sell Side Table */}
        <div className="w-full max-w-full">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">VALUE - {displayedTickers.map(t => formatStockDisplayName(t)).join(', ')} - {getMarketLabel(displayedMarket)}</h3>
          </div>
           <div className={`${showOnlyTotal ? 'flex justify-center' : 'w-full max-w-full'}`}>
              <div ref={valueTableContainerRef} className={`${showOnlyTotal ? 'w-auto' : 'w-full max-w-full'} ${summaryByDate.size === 0 ? 'overflow-hidden' : 'overflow-x-auto overflow-y-auto'} border-l-2 border-r-2 border-b-2 border-white`} style={{ maxHeight: '490px' }}>
               <table ref={valueTableRef} className={`${showOnlyTotal ? 'min-w-0' : summaryByDate.size === 0 ? 'w-full' : 'min-w-[1000px]'} ${getFontSizeClass()} table-auto`} style={{ tableLayout: summaryByDate.size === 0 ? 'fixed' : (showOnlyTotal ? 'auto' : 'auto'), width: summaryByDate.size === 0 ? '100%' : undefined }}>
                         <thead className="bg-[#3a4252]">
                         <tr className="border-t-2 border-white">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => (
                        <th key={date} className={`text-center py-[1px] px-[7.4px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} colSpan={9} style={{ textAlign: 'center' }}>
                         {formatDisplayDate(date)}
                            </th>
                          ))}
                      <th className={`text-center py-[1px] px-[3.8px] font-bold text-white border-r-2 border-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={9} style={{ textAlign: 'center' }}>
                            Total
                          </th>
                        </tr>
                        <tr className="bg-[#3a4252]">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => (
                      <React.Fragment key={`detail-${date}`}>
                              {/* BY Columns */}
                          <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ textAlign: 'center' }}>BY</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BLot</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BVal</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BAvg</th>
                              {/* SL Columns */}
                              <th className="text-center py-[1px] px-[5.4px] font-bold text-white bg-[#3a4252] w-4" style={{ textAlign: 'center' }}>#</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-4`} style={{ textAlign: 'center' }}>SL</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>SLot</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>SVal</th>
                        <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6 ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ textAlign: 'center' }}>SAvg</th>
                            </React.Fragment>
                          ))}
                    {/* Total Columns - Include BAvg and SAvg */}
                      <th className={`text-center py-[1px] px-[4.5px] font-bold text-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ textAlign: 'center' }}>BY</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>BLot</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>BVal</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>BAvg</th>
                          <th className="text-center py-[1px] px-[5.4px] font-bold text-white bg-[#3a4252]" style={{ textAlign: 'center' }}>#</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>SL</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>SLot</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>SVal</th>
                      <th className={`text-center py-[1px] px-[6.3px] font-bold text-white border-r-2 border-white`} style={{ textAlign: 'center' }}>SAvg</th>
                        </tr>
                      </thead>
                      <tbody className="text-[12px]">
                        {(() => {
                          // Get broker text color class
                          const getBrokerColorClass = (brokerCode: string): string => {
                            if (GOVERNMENT_BROKERS.includes(brokerCode)) {
                              return 'text-green-600 font-semibold';
                            }
                            if (FOREIGN_BROKERS.includes(brokerCode)) {
                              return 'text-red-600 font-semibold';
                            }
                            return 'text-white font-semibold';
                          };
                          
                    // Calculate total data across all dates (SWAPPED: Buy uses SELL fields, Sell uses BUY fields)
                    const totalBuyData: { [broker: string]: { nblot: number; nbval: number; bavg: number; count: number } } = {};
                    const totalSellData: { [broker: string]: { nslot: number; nsval: number; savg: number; count: number } } = {};
                    
                    allBrokerData.forEach(dateData => {
                            // BUY total uses Buyer metrics
                            dateData.buyData.forEach(b => {
                              if (b.buyerValue > 0) {
                          if (!totalBuyData[b.broker]) {
                            totalBuyData[b.broker] = { nblot: 0, nbval: 0, bavg: 0, count: 0 };
                                }
                          const buyEntry = totalBuyData[b.broker];
                                if (buyEntry) {
                                  buyEntry.nblot += b.buyerVol;
                                  buyEntry.nbval += b.buyerValue;
                                  buyEntry.bavg += b.bavg;
                                  buyEntry.count += 1;
                                }
                              }
                            });
                            
                            // SELL total uses Seller metrics
                            dateData.sellData.forEach(s => {
                              if (s.sellerValue > 0) {
                          if (!totalSellData[s.broker]) {
                            totalSellData[s.broker] = { nslot: 0, nsval: 0, savg: 0, count: 0 };
                                }
                          const sellEntry = totalSellData[s.broker];
                                if (sellEntry) {
                                  sellEntry.nslot += s.sellerVol;
                                  sellEntry.nsval += s.sellerValue;
                                  sellEntry.savg += s.savg;
                                  sellEntry.count += 1;
                                }
                              }
                            });
                          });
                          
                    // Sort total data
                    const sortedTotalBuy = Object.entries(totalBuyData)
                            .filter(([broker]) => brokerFDScreen(broker))
                            .map(([broker, data]) => ({ broker, ...data, bavg: data.bavg / data.count }))
                            .sort((a, b) => b.nbval - a.nbval);
                    const sortedTotalSell = Object.entries(totalSellData)
                            .filter(([broker]) => brokerFDScreen(broker))
                            .map(([broker, data]) => ({ broker, ...data, savg: data.savg / data.count }))
                            .sort((a, b) => b.nsval - a.nsval);
                          
                    // Find max row count across all dates AND total columns
                          let maxRows = 0;
                      availableDates.forEach(date => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const buyCount = (dateData?.buyData || []).filter(b => brokerFDScreen(b.broker) && b.buyerValue > 0).length;
                      const sellCount = (dateData?.sellData || []).filter(s => brokerFDScreen(s.broker) && s.sellerValue > 0).length;
                            maxRows = Math.max(maxRows, buyCount, sellCount);
                          });
                    
                    // Also include total broker counts in maxRows (for Total column)
                    const totalBuyCount = sortedTotalBuy.length;
                    const totalSellCount = sortedTotalSell.length;
                    maxRows = Math.max(maxRows, totalBuyCount, totalSellCount);
                    
                    // Ensure minimum 21 rows for consistent display (20 visible + 1 to avoid scrollbar covering row 20)
                    maxRows = Math.max(maxRows, 21);
                    
                    // If no data, show "No Data Available" message
                    if (summaryByDate.size === 0) {
                        const totalCols = datesForHeader.length * 9 + 9; // 9 cols per date + 9 for Total
                      return (
                        <tr className="border-b-2 border-white">
                          <td 
                            colSpan={totalCols} 
                            className="text-center py-[2.06px] text-muted-foreground font-bold"
                            style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
                          >
                            No Data Available
                          </td>
                        </tr>
                      );
                    }
                    
                    // Render all rows (scrollable container handles overflow)
                    return Array.from({ length: maxRows }).map((_, rowIdx) => (
                              <tr key={rowIdx} className={`hover:bg-accent/50 ${rowIdx === maxRows - 1 ? 'border-b-2 border-white' : ''}`}>
                          {!showOnlyTotal && availableDates.map((date, dateIndex) => {
                          const dateData = allBrokerData.find(d => d.date === date);
                          
                                  // Sort brokers for this date: Buy uses BuyerValue, Sell uses SellerValue
                          const sortedByBuyerValue = (dateData?.buyData || [])
                                    .filter(b => brokerFDScreen(b.broker))
                                    .filter(b => b.buyerValue > 0)
                                    .sort((a, b) => b.buyerValue - a.buyerValue);
                          const sortedBySellerValue = (dateData?.sellData || [])
                                    .filter(s => brokerFDScreen(s.broker))
                                    .filter(s => s.sellerValue > 0)
                                    .sort((a, b) => b.sellerValue - a.sellerValue);
                                  
                                  const buyData = sortedByBuyerValue[rowIdx];
                                  const sellData = sortedBySellerValue[rowIdx];
                                  
                                  return (
                            <React.Fragment key={`${date}-${rowIdx}`}>
                                      {/* BY (Buyer) Columns - Using Buyer fields */}
                                <td className={`text-center py-[1px] px-[5.4px] w-4 font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${buyData ? getBrokerColorClass(buyData.broker) : ''}`}>
                                        {buyData?.broker || '-'}
                                      </td>
                              <td className="text-right py-[1px] px-[5.4px] text-green-600 font-bold w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {buyData ? formatLot(buyData.buyerVol / 100) : '-'}
                              </td>
                                      <td className="text-right py-[1px] px-[5.4px] text-green-600 font-bold w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {buyData ? formatNumber(buyData.buyerValue) : '-'}
                                      </td>
                                      <td className="text-right py-[1px] px-[5.4px] text-green-600 font-bold w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {buyData ? formatAverage(buyData.bavg) : '-'}
                                      </td>
                                      {/* SL (Seller) Columns - Keep # column */}
                                      <td className={`text-center py-[1px] px-[5.4px] text-white bg-[#3a4252] font-bold w-4 ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>{sellData ? rowIdx + 1 : '-'}</td>
                                      <td className={`py-[1px] px-[5.4px] font-bold w-4 ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>
                                        {sellData?.broker || '-'}
                                      </td>
                              <td className="text-right py-[1px] px-[5.4px] text-red-600 font-bold w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {sellData ? formatLot(sellData.sellerVol / 100) : '-'}
                              </td>
                                      <td className="text-right py-[1px] px-[5.4px] text-red-600 font-bold w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {sellData ? formatNumber(sellData.sellerValue) : '-'}
                                      </td>
                              <td className={`text-right py-[1px] px-[5.4px] text-red-600 font-bold w-6 ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {sellData ? formatAverage(sellData.savg) : '-'}
                                      </td>
                                    </React.Fragment>
                                  );
                                })}
                        {/* Total Columns - Include BAvg and SAvg */}
                        {(() => {
                          const totalBuy = sortedTotalBuy[rowIdx];
                          const totalSell = sortedTotalSell[rowIdx];
                          // Calculate BAvg: BVal / BLot
                          const totalBuyAvg = totalBuy && totalBuy.nblot > 0 ? totalBuy.nbval / totalBuy.nblot : 0;
                          // Calculate SAvg: SVal / SLot
                          const totalSellAvg = totalSell && totalSell.nslot > 0 ? Math.abs(totalSell.nsval) / totalSell.nslot : 0;
                          return (
                            <React.Fragment>
                                <td className={`text-center py-[1px] px-[4.5px] font-bold ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${totalBuy ? getBrokerColorClass(totalBuy.broker) : ''}`}>
                                  {totalBuy?.broker || '-'}
                                </td>
                              <td className="text-right py-[1px] px-[4.5px] text-green-600 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {totalBuy ? formatLot(totalBuy.nblot / 100) : '-'}
                              </td>
                                <td className="text-right py-[1px] px-[4.5px] text-green-600 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {totalBuy ? formatNumber(totalBuy.nbval) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[4.5px] text-green-600 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {totalBuy && totalBuyAvg > 0 ? formatAverage(totalBuyAvg) : '-'}
                                </td>
                                <td className={`text-center py-[1px] px-[5.4px] text-white bg-[#3a4252] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>{totalSell ? rowIdx + 1 : '-'}</td>
                                <td className={`py-[1px] px-[4.5px] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>
                                  {totalSell?.broker || '-'}
                                </td>
                              <td className="text-right py-[1px] px-[4.5px] text-red-600 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {totalSell ? formatLot(totalSell.nslot / 100) : '-'}
                              </td>
                              <td className="text-right py-[1px] px-[4.5px] text-red-600 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {totalSell ? formatNumber(totalSell.nsval) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[6.3px] text-red-600 font-bold border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {totalSell && totalSellAvg > 0 ? formatAverage(totalSellAvg) : '-'}
                                </td>
                            </React.Fragment>
                            );
                        })()}
                      </tr>
                    ));
                        })()}
                      </tbody>
                    </table>
            </div>
          </div>
        </div>

        {/* Net Table */}
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">NET - {displayedTickers.map(t => formatStockDisplayName(t)).join(', ')} - {getMarketLabel(displayedMarket)}</h3>
          </div>
          <div className={`${showOnlyTotal ? 'flex justify-center' : 'w-full max-w-full'}`}>
              <div ref={netTableContainerRef} className={`${showOnlyTotal ? 'w-auto' : 'w-full max-w-full'} ${summaryByDate.size === 0 ? 'overflow-hidden' : 'overflow-x-auto overflow-y-auto'} border-l-2 border-r-2 border-b-2 border-white`} style={{ maxHeight: '530px' }}>
              <table ref={netTableRef} className={`${showOnlyTotal ? 'min-w-0' : summaryByDate.size === 0 ? 'w-full' : 'min-w-[1000px]'} ${getFontSizeClass()} table-auto`} style={{ tableLayout: summaryByDate.size === 0 ? 'fixed' : (showOnlyTotal ? 'auto' : 'auto'), width: summaryByDate.size === 0 ? '100%' : undefined }}>
                        <thead className="bg-[#3a4252]">
                        <tr className="border-t-2 border-white">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => (
                        <th key={date} className={`text-center py-[1px] px-[7.4px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} colSpan={9} style={{ textAlign: 'center' }}>
                        {formatDisplayDate(date)}
                            </th>
                          ))}
                      <th className={`text-center py-[1px] px-[3.8px] font-bold text-white border-r-2 border-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={9} style={{ textAlign: 'center' }}>
                            Total
                          </th>
                        </tr>
                        <tr className="bg-[#3a4252]">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => (
                      <React.Fragment key={`detail-${date}`}>
                              {/* Net Buy Columns - No # */}
                          <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ textAlign: 'center' }}>BY</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BLot</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BVal</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BAvg</th>
                              {/* Net Sell Columns - Keep # */}
                              <th className="text-center py-[1px] px-[5.4px] font-bold text-white bg-[#3a4252] w-4" style={{ textAlign: 'center' }}>#</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-4`} style={{ textAlign: 'center' }}>SL</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>SLot</th>
                              <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>SVal</th>
                          <th className={`text-center py-[1px] px-[5.4px] font-bold text-white w-6 ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ textAlign: 'center' }}>SAvg</th>
                            </React.Fragment>
                          ))}
                    {/* Total Columns - Include BAvg and SAvg */}
                      <th className={`text-center py-[1px] px-[4.5px] font-bold text-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ textAlign: 'center' }}>BY</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>BLot</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>BVal</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>BAvg</th>
                          <th className="text-center py-[1px] px-[5.4px] font-bold text-white bg-[#3a4252]" style={{ textAlign: 'center' }}>#</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>SL</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>SLot</th>
                          <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center' }}>SVal</th>
                      <th className={`text-center py-[1px] px-[6.3px] font-bold text-white border-r-2 border-white`} style={{ textAlign: 'center' }}>SAvg</th>
                        </tr>
                      </thead>
                      <tbody className="text-[12px]">
                        {(() => {
                          // Get broker text color class
                          const getBrokerColorClass = (brokerCode: string): string => {
                            if (GOVERNMENT_BROKERS.includes(brokerCode)) {
                              return 'text-green-600 font-semibold';
                            }
                            if (FOREIGN_BROKERS.includes(brokerCode)) {
                              return 'text-red-600 font-semibold';
                            }
                            return 'text-white font-semibold';
                          };
                          
                      // Calculate total net data across all dates
                      // NEW LOGIC: Aggregate all NetBuy and NetSell per broker, then determine which side they belong to
                      // A broker can appear in both NetBuy and NetSell across different dates
                      // In Total column, we need to compare total NetBuy vs total NetSell per broker
                      // If NetBuy > NetSell: broker goes to NetBuy side (NetBuy - NetSell)
                      // If NetSell > NetBuy: broker goes to NetSell side (NetSell - NetBuy)
                      // IMPORTANT: Use same aggregation logic as Value table - sum bavg/savg and divide by count
                      const brokerNetBuyTotals: { [broker: string]: { nblot: number; nbval: number; bavg: number; bavgCount: number } } = {};
                      const brokerNetSellTotals: { [broker: string]: { nslot: number; nsval: number; savg: number; savgCount: number } } = {};
                    
                    allBrokerData.forEach(dateData => {
                            dateData.buyData.forEach(b => {
                          // Aggregate NetBuy totals per broker (across all dates)
                          // Use same logic as Value table: sum bavg and count occurrences
                          if (b.netBuyVol > 0 || b.netBuyValue > 0) {
                            if (!brokerNetBuyTotals[b.broker]) {
                              brokerNetBuyTotals[b.broker] = { nblot: 0, nbval: 0, bavg: 0, bavgCount: 0 };
                            }
                            const netBuyEntry = brokerNetBuyTotals[b.broker];
                                if (netBuyEntry) {
                              netBuyEntry.nblot += b.netBuyVol || 0;
                              netBuyEntry.nbval += b.netBuyValue || 0;
                              // Sum bavg and count (same as Value table logic)
                              if (b.bavg && b.bavg !== 0) {
                                netBuyEntry.bavg += b.bavg;
                                netBuyEntry.bavgCount += 1;
                              }
                            }
                          }
                          
                          // Aggregate NetSell totals per broker (across all dates)
                          // Use same logic as Value table: sum savg and count occurrences
                          if (b.netSellVol > 0 || b.netSellValue > 0) {
                            if (!brokerNetSellTotals[b.broker]) {
                              brokerNetSellTotals[b.broker] = { nslot: 0, nsval: 0, savg: 0, savgCount: 0 };
                            }
                            const netSellEntry = brokerNetSellTotals[b.broker];
                                if (netSellEntry) {
                              netSellEntry.nslot += b.netSellVol || 0;
                              netSellEntry.nsval += b.netSellValue || 0;
                              // Sum savg and count (same as Value table logic)
                              if (b.savg && b.savg !== 0) {
                                netSellEntry.savg += b.savg;
                                netSellEntry.savgCount += 1;
                              }
                                }
                              }
                            });
                          });
                          
                      // Determine final side for each broker based on which total is larger
                      const totalNetBuyData: { [broker: string]: { nblot: number; nbval: number; bavg: number } } = {};
                      const totalNetSellData: { [broker: string]: { nslot: number; nsval: number; savg: number } } = {};
                      
                      // Process all brokers that have NetBuy or NetSell totals
                      const allBrokers = new Set([...Object.keys(brokerNetBuyTotals), ...Object.keys(brokerNetSellTotals)]);
                      allBrokers.forEach(broker => {
                        const netBuyTotal = brokerNetBuyTotals[broker] || { nblot: 0, nbval: 0, bavg: 0, bavgCount: 0 };
                        const netSellTotal = brokerNetSellTotals[broker] || { nslot: 0, nsval: 0, savg: 0, savgCount: 0 };
                        
                        // Calculate average bavg and savg (same as Value table: sum / count)
                        // If bavgCount/savgCount is 0 (no valid bavg/savg from CSV), use fallback: value / lot
                        let bavg = netBuyTotal.bavgCount > 0 ? netBuyTotal.bavg / netBuyTotal.bavgCount : 0;
                        let savg = netSellTotal.savgCount > 0 ? netSellTotal.savg / netSellTotal.savgCount : 0;
                        
                        // Fallback: if no valid bavg/savg from aggregation, calculate from value/lot
                        if (bavg === 0 && netBuyTotal.nblot > 0 && netBuyTotal.nbval > 0) {
                          bavg = netBuyTotal.nbval / netBuyTotal.nblot;
                        }
                        if (savg === 0 && netSellTotal.nslot > 0 && netSellTotal.nsval > 0) {
                          savg = Math.abs(netSellTotal.nsval) / netSellTotal.nslot;
                        }
                        
                        // Compare total NetBuy value vs total NetSell value
                        // IMPORTANT: After netting, use bavg/savg that correspond to the side the broker ends up on
                        // For NetBuy side: use bavg (from NetBuy aggregation)
                        // For NetSell side: use savg (from NetSell aggregation)
                        if (netBuyTotal.nbval > netSellTotal.nsval) {
                          // NetBuy is larger: broker goes to NetBuy side, subtract NetSell from NetBuy
                          totalNetBuyData[broker] = {
                            nblot: Math.max(0, netBuyTotal.nblot - netSellTotal.nslot),
                            nbval: Math.max(0, netBuyTotal.nbval - netSellTotal.nsval),
                            bavg: bavg // Use bavg from NetBuy side (same as Value table BAvg)
                          };
                        } else if (netSellTotal.nsval > netBuyTotal.nbval) {
                          // NetSell is larger: broker goes to NetSell side, subtract NetBuy from NetSell
                          totalNetSellData[broker] = {
                            nslot: Math.max(0, netSellTotal.nslot - netBuyTotal.nblot),
                            nsval: Math.max(0, netSellTotal.nsval - netBuyTotal.nbval),
                            savg: savg // Use savg from NetSell side (same as Value table SAvg)
                          };
                        } else {
                          // Equal or both zero: default to NetBuy side (or NetSell if NetBuy is 0)
                          if (netBuyTotal.nbval > 0) {
                            totalNetBuyData[broker] = {
                              nblot: netBuyTotal.nblot,
                              nbval: netBuyTotal.nbval,
                              bavg: bavg
                            };
                          } else if (netSellTotal.nsval > 0) {
                            totalNetSellData[broker] = {
                              nslot: netSellTotal.nslot,
                              nsval: netSellTotal.nsval,
                              savg: savg
                            };
                          }
                        }
                      });
                          
                      // Sort and filter
                    const sortedTotalNetBuy = Object.entries(totalNetBuyData)
                            .filter(([broker]) => brokerFDScreen(broker))
                        .filter(([, data]) => data.nbval > 0) // Only include brokers with positive net value
                        .map(([broker, data]) => ({ 
                          broker, 
                          nblot: data.nblot,
                          nbval: data.nbval,
                          nbavg: data.bavg // Use bavg (same as Value table)
                        }))
                            .sort((a, b) => b.nbval - a.nbval);
                    const sortedTotalNetSell = Object.entries(totalNetSellData)
                            .filter(([broker]) => brokerFDScreen(broker))
                        .filter(([, data]) => data.nsval > 0) // Only include brokers with positive net value
                        .map(([broker, data]) => ({ 
                          broker, 
                          nslot: data.nslot,
                          nsval: data.nsval,
                          nsavg: data.savg // Use savg (same as Value table)
                        }))
                            .sort((a, b) => b.nsval - a.nsval);
                          
                          // Top 5 broker colors: Merah, Kuning, Hijau, Biru, Coklat
                          const bgColors = [
                            'hsl(0, 70%, 50%)',    // Merah (Red)
                            'hsl(50, 100%, 30%)',  // Kuning (Yellow) - further darkened for better contrast with white text
                            'hsl(120, 70%, 30%)',  // Hijau (Green) - further darkened for better contrast with white text
                            'hsl(210, 70%, 50%)',  // Biru (Blue)
                            'hsl(25, 80%, 40%)'    // Coklat (Brown)
                          ];
                          
                    // IMPORTANT: Data is SWAPPED - mapping must be adjusted
                    // Kolom BY (BLot, BVal, BAvg) displays NetSell data → lock top 5 NetSell from Total
                    // Kolom SL (SLot, SVal, SAvg) displays NetBuy data → lock top 5 NetBuy from Total
                    
                    // Map top 5 NetSell brokers (from Total) to background colors for BY columns
                    // These brokers will have background color in BY columns across all dates
                    const netBuyBrokerBgMap = new Map<string, string>();
                    sortedTotalNetSell.slice(0, 5).forEach((item, idx) => {
                      netBuyBrokerBgMap.set(item.broker, bgColors[idx] || '');
                    });
                    
                    // Map top 5 NetBuy brokers (from Total) to underline colors for SL columns
                    // These brokers will have underline in SL columns across all dates
                    const netSellBrokerUnderlineMap = new Map<string, string>();
                    sortedTotalNetBuy.slice(0, 5).forEach((item, idx) => {
                      netSellBrokerUnderlineMap.set(item.broker, bgColors[idx] || '');
                    });
                    
                    // Helper function to get background color style for BY columns
                    // LOCKED: Top 5 NetSell brokers from Total get background color in BY columns across all dates
                    const getNetBuyBgStyle = (broker: string): React.CSSProperties | undefined => {
                      const color = netBuyBrokerBgMap.get(broker);
                      return color ? { backgroundColor: color, color: 'white' } : undefined;
                    };

                    // Helper function to get underline style for BY columns
                    // If broker is in top 5 NetBuy (locked in Total SL), give underline in BY columns if they appear
                    // Double underline: first line (top, 2px) with transparent, second line (below, 3px) with color
                    // Uses border-bottom for transparent line (2px) and background-image for colored line (3px) below
                    const getNetBuyUnderlineStyle = (broker: string): React.CSSProperties | undefined => {
                      const color = netSellBrokerUnderlineMap.get(broker);
                      return color ? { 
                        borderBottom: `2px solid transparent`,
                        paddingBottom: '7px',
                        paddingTop: '1px',
                        lineHeight: '1.1',
                        backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 5px), ${color} calc(100% - 5px), ${color} calc(100% - 2px), transparent calc(100% - 2px))`,
                        backgroundSize: '100% 7px',
                        backgroundPosition: 'bottom',
                        backgroundRepeat: 'no-repeat'
                      } : undefined;
                    };

                    // Helper function to get underline color for SL columns
                    // LOCKED: Top 5 NetBuy brokers from Total get underline in SL columns across all dates
                    // Double underline: first line (top, 2px) with transparent, second line (below, 3px) with color
                    // Uses border-bottom for transparent line (2px) and background-image for colored line (3px) below
                    const getNetSellUnderlineStyle = (broker: string): React.CSSProperties | undefined => {
                      const color = netSellBrokerUnderlineMap.get(broker);
                      return color ? { 
                        borderBottom: `2px solid transparent`,
                        paddingBottom: '7px',
                        paddingTop: '1px',
                        lineHeight: '1.1',
                        backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 5px), ${color} calc(100% - 5px), ${color} calc(100% - 2px), transparent calc(100% - 2px))`,
                        backgroundSize: '100% 7px',
                        backgroundPosition: 'bottom',
                        backgroundRepeat: 'no-repeat'
                      } : undefined;
                    };

                    // Helper function to get background color style for SL columns
                    // If broker is in top 5 NetSell (locked in Total BY), give background color in SL columns if they appear
                    const getNetSellBgStyle = (broker: string): React.CSSProperties | undefined => {
                      const color = netBuyBrokerBgMap.get(broker);
                      return color ? { backgroundColor: color, color: 'white' } : undefined;
                    };

                    // Find max row count across all dates
                      // Backend already separates NetBuy (netBuyVol > 0) and NetSell (netSellVol > 0)
                          let maxRows = 0;
                      availableDates.forEach(date => {
                      const dateData = allBrokerData.find(d => d.date === date);
                        // IMPORTANT: A broker can only be either NetBuy OR NetSell, not both
                        const netBuyCount = (dateData?.buyData || []).filter(b => 
                          brokerFDScreen(b.broker) && 
                          (b.netBuyVol > 0 || b.netBuyValue > 0) && 
                          (b.netBuyValue >= b.netSellValue)
                        ).length;
                        const netSellCount = (dateData?.buyData || []).filter(b => 
                          brokerFDScreen(b.broker) && 
                          (b.netSellVol > 0 || b.netSellValue > 0) && 
                          (b.netSellValue > b.netBuyValue)
                        ).length;
                            maxRows = Math.max(maxRows, netBuyCount, netSellCount);
                          });
                          
                    // Also include total broker counts in maxRows (for Total column)
                    const totalNetBuyCount = sortedTotalNetBuy.length;
                    const totalNetSellCount = sortedTotalNetSell.length;
                    maxRows = Math.max(maxRows, totalNetBuyCount, totalNetSellCount);
                    
                    // Ensure minimum 21 rows for consistent display with VALUE table (20 visible + 1 to avoid scrollbar covering row 20)
                    maxRows = Math.max(maxRows, 21);
                    
                    // If no data, show "No Data Available" message
                    if (summaryByDate.size === 0) {
                        const totalCols = datesForHeader.length * 9 + 9; // 9 cols per date + 9 for Total
                      return (
                        <tr className="border-b-2 border-white">
                          <td 
                            colSpan={totalCols} 
                            className="text-center py-[2.06px] text-muted-foreground font-bold"
                            style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
                          >
                            No Data Available
                          </td>
                        </tr>
                      );
                    }
                          
                    // Render all rows (scrollable container handles overflow)
                          return Array.from({ length: maxRows }).map((_, rowIdx) => {
                            return (
                              <tr key={rowIdx} className={`hover:bg-accent/50 ${rowIdx === maxRows - 1 ? 'border-b-2 border-white' : ''}`}>
                            {!showOnlyTotal && availableDates.map((date, dateIndex) => {
                            const dateData = allBrokerData.find(d => d.date === date);
                              // Sort brokers for this date
                              // Backend already separates: NetBuy (netBuyVol > 0) and NetSell (netSellVol > 0)
                              // IMPORTANT: A broker can only be either NetBuy OR NetSell, not both
                              // Filter: NetBuy brokers (netBuyVol > 0 AND netSellVol === 0, or netBuyValue > netSellValue)
                              // Filter: NetSell brokers (netSellVol > 0 AND netBuyVol === 0, or netSellValue > netBuyValue)
                              // Sort brokers for per-date columns
                            const sortedNetBuy = (dateData?.buyData || [])
                                .filter(b => {
                                  if (!brokerFDScreen(b.broker)) return false;
                                  // NetBuy: netBuyVol > 0 and netBuyValue >= netSellValue (prioritize NetBuy if both > 0)
                                  return (b.netBuyVol > 0 || b.netBuyValue > 0) && (b.netBuyValue >= b.netSellValue);
                                })
                                    .sort((a, b) => (b.netBuyValue || 0) - (a.netBuyValue || 0));
                              const sortedNetSell = (dateData?.buyData || [])
                                .filter(b => {
                                  if (!brokerFDScreen(b.broker)) return false;
                                  // NetSell: netSellVol > 0 and netSellValue > netBuyValue (prioritize NetSell if both > 0)
                                  return (b.netSellVol > 0 || b.netSellValue > 0) && (b.netSellValue > b.netBuyValue);
                                })
                                .sort((a, b) => (b.netSellValue || 0) - (a.netSellValue || 0));
                              
                              // Per-date columns: each side uses its own sorted data
                                  const netBuyData = sortedNetBuy[rowIdx];
                                  const netSellData = sortedNetSell[rowIdx];
                              
                              // IMPORTANT: Data is SWAPPED for display
                              // BLot, BVal, BAvg (Net Buy columns) display NetSell data
                              // SLot, SVal, SAvg (Net Sell columns) display NetBuy data
                              // Get NetSell data for BY columns (BLot, BVal, BAvg)
                              const nbLot = netSellData?.netSellVol || 0;
                              const nbVal = netSellData?.netSellValue || 0;
                              const nbAvg = netSellData?.netSellerAvg || 0;

                              // Get NetBuy data for SL columns (SLot, SVal, SAvg)
                              const nsLot = netBuyData?.netBuyVol || 0;
                              const nsVal = netBuyData?.netBuyValue || 0;
                              const nsAvg = netBuyData?.netBuyerAvg || 0;

                              // Get styling for BY columns (display NetSell data)
                              // Top 5 NetSell brokers → background color
                              // Top 5 NetBuy brokers → underline (if they appear in NetSell side)
                            const netBuyBgStyle = netSellData ? getNetBuyBgStyle(netSellData.broker) : undefined;
                            const netBuyUnderlineStyle = netSellData ? getNetBuyUnderlineStyle(netSellData.broker) : undefined;
                            // Combine styles: background takes priority, but if no background and has underline, use underline
                            const byColumnStyle = netBuyBgStyle || netBuyUnderlineStyle;

                              // Get styling for SL columns (display NetBuy data)
                              // Top 5 NetBuy brokers → underline
                              // Top 5 NetSell brokers → background color (if they appear in NetBuy side)
                              const sellUnderlineStyle = netBuyData ? getNetSellUnderlineStyle(netBuyData.broker) : undefined;
                              const sellBgStyle = netBuyData ? getNetSellBgStyle(netBuyData.broker) : undefined;
                              // Combine styles: background takes priority, but if no background and has underline, use underline
                              const slColumnStyle = sellBgStyle || sellUnderlineStyle;

                                  return (
                              <React.Fragment key={`${date}-${rowIdx}`}>
                                      {/* Net Buy Columns (BY) - Display NetSell Data - No # */}
                                  <td className={`text-center py-[1px] px-[5.4px] w-4 font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`} style={byColumnStyle}>
                                        {netSellData?.broker || '-'}
                                      </td>
                                <td className={`text-right py-[1px] px-[5.4px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={{ ...byColumnStyle, fontVariantNumeric: 'tabular-nums' }}>
                                  {netSellData ? formatLot(nbLot / 100) : '-'}
                                </td>
                                      <td className={`text-right py-[1px] px-[5.4px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={{ ...byColumnStyle, fontVariantNumeric: 'tabular-nums' }}>
                                        {netSellData ? formatNumber(nbVal) : '-'}
                                      </td>
                                      <td className={`text-right py-[1px] px-[5.4px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={{ ...byColumnStyle, fontVariantNumeric: 'tabular-nums' }}>
                                        {netSellData ? formatAverage(nbAvg) : '-'}
                                      </td>
                                      {/* Net Sell Columns (SL) - Display NetBuy Data - Keep # */}
                                      <td className={`text-center py-[1px] px-[5.4px] text-white bg-[#3a4252] font-bold w-4 ${netBuyData ? getBrokerColorClass(netBuyData.broker) : ''}`}>{netBuyData ? rowIdx + 1 : '-'}</td>
                                  <td className={`py-[1px] px-[5.4px] w-4 font-bold ${netBuyData ? getBrokerColorClass(netBuyData.broker) : ''} ${sellBgStyle ? 'text-white' : ''}`} style={slColumnStyle}>
                                        {netBuyData?.broker || '-'}
                                      </td>
                                  <td className={`text-right py-[1px] px-[5.4px] w-6 font-bold ${sellBgStyle ? 'text-white' : 'text-red-600'}`} style={{ ...slColumnStyle, fontVariantNumeric: 'tabular-nums' }}>
                                  {netBuyData ? formatLot(nsLot / 100) : '-'}
                                </td>
                                  <td className={`text-right py-[1px] px-[5.4px] w-6 font-bold ${sellBgStyle ? 'text-white' : 'text-red-600'}`} style={{ ...slColumnStyle, fontVariantNumeric: 'tabular-nums' }}>
                                        {netBuyData ? formatNumber(nsVal) : '-'}
                                      </td>
                                  <td className={`text-right py-[1px] px-[5.4px] w-6 font-bold ${sellBgStyle ? 'text-white' : 'text-red-600'} ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ ...slColumnStyle, fontVariantNumeric: 'tabular-nums' }}>
                                        {netBuyData ? formatAverage(nsAvg) : '-'}
                                      </td>
                                    </React.Fragment>
                                  );
                                })}
                          {/* Total Columns - Include BAvg and SAvg - Data is SWAPPED */}
                          {(() => {
                            const totalNetBuy = sortedTotalNetBuy[rowIdx];
                            const totalNetSell = sortedTotalNetSell[rowIdx];
                            
                            // IMPORTANT: Total columns data is SWAPPED for display
                            // Total BY columns (BLot, BVal, BAvg) display totalNetSell data
                            // Total SL columns (SLot, SVal, SAvg) display totalNetBuy data
                            
                            // Get background colors for total columns using locked functions
                            // LOCKED: Use getNetBuyBgStyle which locks based on top 5 NetSell from Total
                            // This ensures consistent styling across all dates
                            const totalNetBuyBgStyle = totalNetSell ? getNetBuyBgStyle(totalNetSell.broker) : undefined;
                              
                              // Get underline style for Total SL columns (top 5 NetBuy from Total)
                              // LOCKED: Top 5 NetBuy brokers from Total get underline in Total SL columns
                              const totalSellUnderlineStyle = totalNetBuy ? getNetSellUnderlineStyle(totalNetBuy.broker) : undefined;

                              // IMPORTANT: Calculate avg from value/lot for Total columns (not from aggregated avg)
                              // BY column displays NetSell data, so calculate from totalNetSell value/lot
                              // SL column displays NetBuy data, so calculate from totalNetBuy value/lot
                              const totalNetBuyAvg = totalNetSell && totalNetSell.nslot > 0 
                                ? totalNetSell.nsval / totalNetSell.nslot 
                                : 0; // Calculate from value/lot
                              const totalNetSellAvg = totalNetBuy && totalNetBuy.nblot > 0 
                                ? totalNetBuy.nbval / totalNetBuy.nblot 
                                : 0; // Calculate from value/lot
                            
                            return (
                              <React.Fragment>
                                  {/* Total BY columns - Display totalNetSell data */}
                                  <td className={`text-center py-[1px] px-[4.5px] font-bold ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`} style={totalNetBuyBgStyle}>
                                  {totalNetSell?.broker || '-'}
                                </td>
                                <td className={`text-right py-[1px] px-[4.5px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={{ ...totalNetBuyBgStyle, fontVariantNumeric: 'tabular-nums' }}>
                                  {totalNetSell ? formatLot((totalNetSell.nslot || 0) / 100) : '-'}
                                </td>
                                <td className={`text-right py-[1px] px-[4.5px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={{ ...totalNetBuyBgStyle, fontVariantNumeric: 'tabular-nums' }}>
                                  {totalNetSell ? formatNumber(totalNetSell.nsval || 0) : '-'}
                                </td>
                                <td className={`text-right py-[1px] px-[4.5px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={{ ...totalNetBuyBgStyle, fontVariantNumeric: 'tabular-nums' }}>
                                  {totalNetSell && totalNetBuyAvg > 0 ? formatAverage(totalNetBuyAvg) : '-'}
                                </td>
                                {/* Total SL columns - Display totalNetBuy data */}
                                <td className={`text-center py-[1px] px-[5.4px] text-white bg-[#3a4252] font-bold ${totalNetBuy ? getBrokerColorClass(totalNetBuy.broker) : ''}`}>{totalNetBuy ? rowIdx + 1 : '-'}</td>
                                  <td className={`py-[1px] px-[4.5px] font-bold ${totalNetBuy ? getBrokerColorClass(totalNetBuy.broker) : ''}`} style={totalSellUnderlineStyle}>
                                  {totalNetBuy?.broker || '-'}
                                </td>
                                  <td className="text-right py-[1px] px-[4.5px] text-red-600 font-bold" style={{ ...totalSellUnderlineStyle, fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetBuy ? formatLot(totalNetBuy.nblot / 100) : '-'}
                                </td>
                                  <td className="text-right py-[1px] px-[4.5px] text-red-600 font-bold" style={{ ...totalSellUnderlineStyle, fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetBuy ? formatNumber(totalNetBuy.nbval) : '-'}
                                </td>
                                  <td className="text-right py-[1px] px-[6.3px] text-red-600 font-bold border-r-2 border-white" style={{ ...totalSellUnderlineStyle, fontVariantNumeric: 'tabular-nums' }}>
                                  {totalNetBuy && totalNetSellAvg > 0 ? formatAverage(totalNetSellAvg) : '-'}
                                </td>
                              </React.Fragment>
                            );
                          })()}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
              </div>
            </div>
          </div>
        </div>
      {/* Total Table - Per Date Totals with 4 columns */}
      {(() => {
        // Calculate totals per date
        const totalsByDate = new Map<string, {
          totalValue: number;
          foreignNetValue: number;
          totalLot: number;
          avgPrice: number;
        }>();

        // Grand totals across all dates
        let grandTotalValue = 0;
        let grandForeignBuyValue = 0;
        let grandForeignSellValue = 0;
        let grandTotalLotShares = 0;

        availableDates.forEach((date: string) => {
          const rows = summaryByDate.get(date) || [];
          let dateTotalValue = 0;
          let dateTotalLotShares = 0;
          let dateForeignBuyValue = 0;
          let dateForeignSellValue = 0;

          rows.forEach(row => {
            // Filter by F/D
            if (!brokerFDScreen(row.broker)) return;

            const buyVal = Number(row.buyerValue) || 0;
            const sellVal = Number(row.sellerValue) || 0;
            const buyVol = Number(row.buyerVol) || 0;

            // TVal: Only count buyer value (not buyer + seller, that would be double counting)
            // Since every transaction has a buyer and seller with same value
            dateTotalValue += buyVal;
            dateTotalLotShares += buyVol;

            const brokerCode = (row.broker || '').toUpperCase();
            if (brokerCode && FOREIGN_BROKERS.includes(brokerCode)) {
              dateForeignBuyValue += buyVal;
              dateForeignSellValue += sellVal;
            }
          });

          const dateTotalLot = dateTotalLotShares / 100;
          const dateForeignNetValue = dateForeignBuyValue - dateForeignSellValue;
          const dateAvgPrice = (dateTotalLotShares > 0 && dateTotalValue > 0) ? dateTotalValue / dateTotalLotShares : 0;

          totalsByDate.set(date, {
            totalValue: dateTotalValue,
            foreignNetValue: dateForeignNetValue,
            totalLot: dateTotalLot,
            avgPrice: dateAvgPrice
          });

          grandTotalValue += dateTotalValue;
          grandTotalLotShares += dateTotalLotShares;
          grandForeignBuyValue += dateForeignBuyValue;
          grandForeignSellValue += dateForeignSellValue;
        });

        // Calculate grand totals
        const grandTotalLot = grandTotalLotShares / 100;
        const grandForeignNetValue = grandForeignBuyValue - grandForeignSellValue;
        const grandAvgPrice = (grandTotalLotShares > 0 && grandTotalValue > 0) ? grandTotalValue / grandTotalLotShares : 0;

        // Use selectedDates for header when data is empty (to show table structure)
        // Use availableDates when data exists (to show only dates with data)
        const datesForHeader = summaryByDate.size === 0 ? selectedDates : availableDates;

        return (
          <div className="w-full max-w-full mt-2">
            <div className={`${showOnlyTotal ? 'flex justify-center' : 'w-full max-w-full'}`}>
              <div ref={totalTableContainerRef} className={`${showOnlyTotal ? 'w-auto' : 'w-full max-w-full'} ${summaryByDate.size === 0 ? 'overflow-hidden' : 'overflow-x-auto'} border-l-2 border-r-2 border-b-2 border-white`}>
                <table ref={totalTableRef} className={`${showOnlyTotal ? 'min-w-0' : summaryByDate.size === 0 ? 'w-full' : 'min-w-[1000px]'} ${getFontSizeClass()} table-auto`} style={{ tableLayout: summaryByDate.size === 0 ? 'fixed' : (showOnlyTotal ? 'auto' : (dateColumnWidthsRef.current.size > 0 && totalColumnWidthRef.current > 0 ? 'fixed' : 'auto')), width: summaryByDate.size === 0 ? '100%' : undefined }}>
                <thead className="bg-[#3a4252]">
                  <tr className="border-t-2 border-white">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => {
                        const dateWidth = dateColumnWidthsRef.current.get(date);
                        return (
                          <th 
                            key={date} 
                            className={`text-center py-[1px] px-[7.4px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} 
                            colSpan={4} 
                            style={{ 
                              textAlign: 'center', 
                              width: dateWidth ? `${dateWidth}px` : undefined, 
                              minWidth: dateWidth ? `${dateWidth}px` : undefined,
                              maxWidth: dateWidth ? `${dateWidth}px` : undefined
                            }}
                          >
                            {formatDisplayDate(date)}
                          </th>
                        );
                      })}
                      <th 
                        className={`text-center py-[1px] px-[3.8px] font-bold text-white border-r-2 border-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} 
                        colSpan={4} 
                        style={{ 
                          textAlign: 'center', 
                          width: totalColumnWidthRef.current > 0 ? `${totalColumnWidthRef.current}px` : undefined, 
                          minWidth: totalColumnWidthRef.current > 0 ? `${totalColumnWidthRef.current}px` : undefined,
                          maxWidth: totalColumnWidthRef.current > 0 ? `${totalColumnWidthRef.current}px` : undefined
                        }}
                      >
                        Total
                      </th>
                    </tr>
                    <tr className="bg-[#3a4252]">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => {
                        const dateWidth = dateColumnWidthsRef.current.get(date);
                        const colWidth = dateWidth ? dateWidth / 4 : undefined;
                        return (
                          <React.Fragment key={`detail-${date}`}>
                            <th className={`text-center py-[1px] px-[5.4px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ textAlign: 'center', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>TVal</th>
                            <th className={`text-center py-[1px] px-[5.4px] font-bold text-white`} style={{ textAlign: 'center', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>FNVal</th>
                            <th className={`text-center py-[1px] px-[5.4px] font-bold text-white`} style={{ textAlign: 'center', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>TLot</th>
                            <th className={`text-center py-[1px] px-[5.4px] font-bold text-white ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ textAlign: 'center', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>Avg</th>
                          </React.Fragment>
                        );
                      })}
                      {/* Total Columns */}
                      {(() => {
                        const totalColWidth = totalColumnWidthRef.current > 0 ? totalColumnWidthRef.current / 4 : undefined;
                        return (
                          <>
                            <th className={`text-center py-[1px] px-[4.5px] font-bold text-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ textAlign: 'center', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>TVal</th>
                            <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>FNVal</th>
                            <th className={`text-center py-[1px] px-[4.5px] font-bold text-white`} style={{ textAlign: 'center', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>TLot</th>
                            <th className={`text-center py-[1px] px-[6.3px] font-bold text-white border-r-2 border-white`} style={{ textAlign: 'center', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>Avg</th>
                          </>
                        );
                      })()}
                  </tr>
                </thead>
                  <tbody className="text-[12px]">
                    <tr className="bg-[#0f172a] border-b-2 border-white">
                      {!showOnlyTotal && availableDates.map((date, dateIndex) => {
                        const dateTotals = totalsByDate.get(date);
                        const dateWidth = dateColumnWidthsRef.current.get(date);
                        const colWidth = dateWidth ? dateWidth / 4 : undefined;
                        
                        if (!dateTotals) {
                          return (
                            <React.Fragment key={date}>
                              <td className={`text-center py-[1px] px-[5.4px] text-white font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>-</td>
                              <td className="text-center py-[1px] px-[5.4px] text-white font-bold" style={{ width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>-</td>
                              <td className="text-center py-[1px] px-[5.4px] text-white font-bold" style={{ width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>-</td>
                              <td className={`text-center py-[1px] px-[5.4px] text-white font-bold ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>-</td>
                            </React.Fragment>
                          );
                        }

                        const foreignNetClass = dateTotals.foreignNetValue > 0 ? 'text-green-500' : dateTotals.foreignNetValue < 0 ? 'text-red-500' : 'text-white';

                        return (
                          <React.Fragment key={date}>
                            <td className={`text-center py-[1px] px-[5.4px] text-white font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>
                              {formatNumber(dateTotals.totalValue)}
                    </td>
                            <td className={`text-center py-[1px] px-[5.4px] font-bold ${foreignNetClass}`} style={{ fontVariantNumeric: 'tabular-nums', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>
                              {formatNumber(dateTotals.foreignNetValue)}
                    </td>
                            <td className="text-center py-[1px] px-[5.4px] text-white font-bold" style={{ fontVariantNumeric: 'tabular-nums', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>
                              {formatLot(dateTotals.totalLot)}
                    </td>
                            <td className={`text-center py-[1px] px-[5.4px] text-white font-bold ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>
                              {formatAverage(dateTotals.avgPrice)}
                    </td>
                          </React.Fragment>
                        );
                      })}
                      {/* Grand Total Column */}
                      {(() => {
                        const grandForeignNetClass = grandForeignNetValue > 0 ? 'text-green-500' : grandForeignNetValue < 0 ? 'text-red-500' : 'text-white';
                        const totalColWidth = totalColumnWidthRef.current > 0 ? totalColumnWidthRef.current / 4 : undefined;

                        return (
                          <React.Fragment>
                            <td className={`text-center py-[1px] px-[4.5px] text-white font-bold ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ fontVariantNumeric: 'tabular-nums', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>
                              {formatNumber(grandTotalValue)}
                            </td>
                            <td className={`text-center py-[1px] px-[4.5px] font-bold ${grandForeignNetClass}`} style={{ fontVariantNumeric: 'tabular-nums', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>
                              {formatNumber(grandForeignNetValue)}
                            </td>
                            <td className="text-center py-[1px] px-[4.5px] text-white font-bold" style={{ fontVariantNumeric: 'tabular-nums', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>
                              {formatLot(grandTotalLot)}
                            </td>
                            <td className="text-center py-[1px] px-[6.3px] text-white font-bold border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>
                              {formatAverage(grandAvgPrice)}
                            </td>
                          </React.Fragment>
                        );
                      })()}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          </div>
        );
      })()}
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      {/* Pada layar kecil/menengah menu ikut scroll; hanya di layar besar (lg+) yang fixed di top */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1.5 lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
            <div ref={menuContainerRef} className="flex flex-col md:flex-row md:flex-wrap items-center gap-1 md:gap-x-7 md:gap-y-0.5">
              {/* Ticker Selection - Multi-select with chips */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {/* Selected Ticker Chips */}
                  {selectedTickers.map(ticker => (
                    <div
                      key={ticker}
                      className="flex items-center gap-1 px-2 h-9 bg-primary/20 text-primary rounded-md text-sm"
                    >
                      <span>{formatStockDisplayName(ticker)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTicker(ticker)}
                        className="hover:bg-primary/30 rounded px-1"
                        aria-label={`Remove ${formatStockDisplayName(ticker)}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {/* Ticker Input */}
                  <div className="relative flex-1 md:flex-none" ref={dropdownRef}>
                    <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <input
                      type="text"
                      value={tickerInput}
                      onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                      onFocus={() => { setShowStockSuggestions(true); setHighlightedStockIndex(0); }}
                      onKeyDown={(e) => {
                        const suggestions = (tickerInput === '' ? availableStocks.filter(s => !selectedTickers.includes(s)) : filteredStocks).slice(0, 10);
                        if (!suggestions.length) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedStockIndex((prev) => (prev + 1) % suggestions.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedStockIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                        } else if (e.key === 'Enter' && showStockSuggestions) {
                          e.preventDefault();
                          const idx = highlightedStockIndex >= 0 ? highlightedStockIndex : 0;
                          const choice = suggestions[idx];
                          if (choice) handleStockSelect(choice);
                        } else if (e.key === 'Escape') {
                          setShowStockSuggestions(false);
                          setHighlightedStockIndex(-1);
                        }
                      }}
                      placeholder="Add ticker"
                      className="w-full md:w-32 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground"
                    />
                    {showStockSuggestions && (
                      <div className="absolute top-full left-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col w-full sm:w-auto min-w-[280px] sm:min-w-[400px]">
                        {availableStocks.length === 0 ? (
                          <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Loading stocks...
                          </div>
                        ) : (
                          <div className="flex flex-row h-full max-h-96 overflow-hidden">
                            {/* Left column: Stocks */}
                            <div className="flex-1 border-r border-[#3a4252] overflow-y-auto">
                              {tickerInput === '' ? (
                                <>
                                  <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                    Stocks ({availableStocks.filter(s => {
                                      if (s.startsWith('[SECTOR] ')) return false;
                                      // Check if stock's sector is already selected
                                      const stockSector = Object.keys(sectorMapping).find(sector => 
                                        sectorMapping[sector]?.includes(s)
                                      );
                                      const sectorAlreadySelected = stockSector && selectedTickers.includes(`[SECTOR] ${stockSector}`);
                                      return !selectedTickers.includes(s) && !sectorAlreadySelected;
                                    }).length})
                                  </div>
                                  {availableStocks.filter(s => {
                                    if (s.startsWith('[SECTOR] ')) return false;
                                    // Check if stock's sector is already selected
                                    const stockSector = Object.keys(sectorMapping).find(sector => 
                                      sectorMapping[sector]?.includes(s)
                                    );
                                    const sectorAlreadySelected = stockSector && selectedTickers.includes(`[SECTOR] ${stockSector}`);
                                    return !selectedTickers.includes(s) && !sectorAlreadySelected;
                                  }).map(stock => (
                                    <div
                                      key={stock}
                                      onClick={() => handleStockSelect(stock)}
                                      className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                                    >
                                      {stock}
                                    </div>
                                  ))}
                                </>
                              ) : filteredStocksList.length > 0 ? (
                                <>
                                  <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                    Stocks ({filteredStocksList.length})
                                  </div>
                                  {filteredStocksList.map(stock => (
                                    <div
                                      key={stock}
                                      onClick={() => handleStockSelect(stock)}
                                      className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                                    >
                                      {stock}
                                    </div>
                                  ))}
                                </>
                              ) : (
                                <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                  Stocks (0)
                                </div>
                              )}
                            </div>
                            {/* Right column: Sectors */}
                            <div className="flex-1 overflow-y-auto">
                              {tickerInput === '' ? (
                                <>
                                  <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                    Sectors ({availableStocks.filter(s => s.startsWith('[SECTOR] ') && !selectedTickers.includes(s)).length})
                                  </div>
                                  {availableStocks.filter(s => s.startsWith('[SECTOR] ') && !selectedTickers.includes(s)).map(stock => (
                                    <div
                                      key={stock}
                                      onClick={() => handleStockSelect(stock)}
                                      className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                                    >
                                      {formatStockDisplayName(stock)}
                                    </div>
                                  ))}
                                </>
                              ) : filteredSectorsList.length > 0 ? (
                                <>
                                  <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                    Sectors ({filteredSectorsList.length})
                                  </div>
                                  {filteredSectorsList.map(stock => (
                                    <div
                                      key={stock}
                                      onClick={() => handleStockSelect(stock)}
                                      className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                                    >
                                      {formatStockDisplayName(stock)}
                                    </div>
                                  ))}
                                </>
                              ) : (
                                <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                  Sectors (0)
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Date Range */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
                <div className="flex items-center gap-2 w-full md:w-auto">
              <div 
                className="relative h-9 flex-1 md:w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(startDateRef)}
              >
                  <input
                  ref={startDateRef}
                    type="date"
                  value={formatDateForInput(startDate)}
                    onChange={(e) => {
                      const selectedDateStr = e.target.value;
                      const selectedDate = new Date(selectedDateStr);
                      
                      // Check if date is before minimum date
                      if (selectedDateStr < MIN_DATE) {
                        showToast({
                          type: 'warning',
                          title: 'Tanggal Tidak Valid',
                          message: `Tanggal paling awal yang bisa dipilih adalah 19 September 2025. Silakan pilih tanggal setelahnya.`,
                        });
                        return;
                      }
                      
                      // Check if date is after maximum available date - MUST BE FIRST CHECK
                      if (maxAvailableDate && maxAvailableDate.trim() !== '') {
                        // Compare dates properly (YYYY-MM-DD format)
                        if (selectedDateStr > maxAvailableDate) {
                          showToast({
                            type: 'warning',
                            title: 'Tanggal Tidak Valid',
                            message: `Tanggal paling baru yang tersedia adalah ${new Date(maxAvailableDate + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}. Silakan pilih tanggal sebelum atau sama dengan tanggal tersebut.`,
                          });
                          // Reset to previous value - prevent any state changes
                          e.target.value = formatDateForInput(startDate);
                          e.preventDefault();
                          e.stopPropagation();
                          // Force update input value to prevent any changes
                          if (startDateRef.current) {
                            startDateRef.current.value = formatDateForInput(startDate);
                          }
                          return;
                        }
                      }
                      
                      // Check if start date is after end date
                      if (endDate && selectedDateStr > endDate) {
                        showToast({
                          type: 'warning',
                          title: 'Tanggal Tidak Valid',
                          message: 'Tanggal mulai tidak boleh lebih dari tanggal akhir. Silakan pilih tanggal yang valid.',
                        });
                        e.target.value = startDate;
                        if (startDateRef.current) {
                          startDateRef.current.value = startDate;
                        }
                        return;
                      }
                      
                      const dayOfWeek = selectedDate.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) {
                        showToast({
                          type: 'warning',
                          title: 'Hari Tidak Valid',
                          message: 'Tidak bisa memilih hari Sabtu atau Minggu. Silakan pilih hari kerja.',
                        });
                        // Reset input value to prevent any state changes
                        e.target.value = formatDateForInput(startDate);
                        e.preventDefault();
                        e.stopPropagation();
                        if (startDateRef.current) {
                          startDateRef.current.value = formatDateForInput(startDate);
                        }
                        // IMPORTANT: Early return - don't update any state, so reminder toast won't trigger
                        return;
                      }
                    
                    // Calculate trading days in the new range
                    const start = new Date(e.target.value);
                    const end = new Date(endDate || e.target.value);
                    const tradingDays: string[] = [];
                    const current = new Date(start);
                    
                    while (current <= end) {
                      const dayOfWeek = current.getDay();
                      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        const dateString = current.toISOString().split('T')[0];
                        if (dateString && dateString >= MIN_DATE) {
                          // Check if date is within maximum available date
                          if (!maxAvailableDate || maxAvailableDate.trim() === '' || dateString <= maxAvailableDate) {
                            tradingDays.push(dateString);
                          } else {
                            // If any date in range is after maxAvailableDate, show toast and prevent change
                            showToast({
                              type: 'warning',
                              title: 'Tanggal Tidak Valid',
                              message: `Tanggal paling baru yang tersedia adalah ${new Date(maxAvailableDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}. Range tanggal yang dipilih mengandung tanggal setelah batas maksimum.`,
                            });
                            // Reset to previous value - prevent any state changes
                            e.target.value = startDate;
                            e.preventDefault();
                            e.stopPropagation();
                            // Force update input value to prevent any changes
                            if (startDateRef.current) {
                              startDateRef.current.value = startDate;
                            }
                            return;
                          }
                        } else if (dateString && dateString < MIN_DATE) {
                          // If any date in range is before MIN_DATE, show toast and prevent change
                          showToast({
                            type: 'warning',
                            title: 'Tanggal Tidak Valid',
                            message: `Tanggal paling awal yang bisa dipilih adalah 19 September 2025. Range tanggal yang dipilih mengandung tanggal sebelum batas minimum.`,
                          });
                          // Reset to previous value - prevent any state changes
                          e.target.value = startDate;
                          e.preventDefault();
                          e.stopPropagation();
                          // Force update input value to prevent any changes
                          if (startDateRef.current) {
                            startDateRef.current.value = startDate;
                          }
                          return;
                        }
                      }
                      current.setDate(current.getDate() + 1);
                    }
                    
                    // Only update state if all validations passed
                    // CRITICAL: Reset shouldFetchData silently BEFORE updating dates to prevent auto-load
                    // This ensures data only changes when Show button is clicked
                    shouldFetchDataRef.current = false; // CRITICAL: Update ref first (synchronous) - SILENT
                    setShouldFetchData(false); // SILENT
                    setStartDate(e.target.value);
                    // Auto update end date if not set or if start > end
                    if (!endDate || new Date(e.target.value) > new Date(endDate)) {
                      setEndDate(e.target.value);
                    }
                    setSelectedDates(tradingDays);
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  min={MIN_DATE}
                  max={maxAvailableDate && maxAvailableDate.trim() !== '' ? formatDateForInput(maxAvailableDate) : (endDate ? formatDateForInput(endDate) : new Date().toISOString().split('T')[0] || undefined)}
                  disabled={false}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center justify-between h-full px-3">
                  <span className="text-sm text-foreground">
                    {startDate ? new Date(startDate).toLocaleDateString('en-GB', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric' 
                    }) : 'DD/MM/YYYY'}
                  </span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
                  <span className="text-sm text-muted-foreground whitespace-nowrap hidden md:inline">to</span>
              <div 
                className="relative h-9 flex-1 md:w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(endDateRef)}
              >
                <input
                  ref={endDateRef}
                    type="date"
                  value={formatDateForInput(endDate)}
                  onChange={(e) => {
                      const selectedDateStr = e.target.value;
                      const selectedDate = new Date(selectedDateStr);
                      
                      // Check if date is before minimum date
                      if (selectedDateStr < MIN_DATE) {
                        showToast({
                          type: 'warning',
                          title: 'Tanggal Tidak Valid',
                          message: `Tanggal paling awal yang bisa dipilih adalah 19 September 2025. Silakan pilih tanggal setelahnya.`,
                        });
                        return;
                      }
                      
                      // Check if date is after maximum available date - MUST BE FIRST CHECK
                      if (maxAvailableDate && maxAvailableDate.trim() !== '') {
                        // Compare dates properly (YYYY-MM-DD format)
                        if (selectedDateStr > maxAvailableDate) {
                          showToast({
                            type: 'warning',
                            title: 'Tanggal Tidak Valid',
                            message: `Tanggal paling baru yang tersedia adalah ${new Date(maxAvailableDate + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}. Silakan pilih tanggal sebelum atau sama dengan tanggal tersebut.`,
                          });
                          // Reset to previous value - prevent any state changes
                          e.target.value = formatDateForInput(endDate);
                          e.preventDefault();
                          e.stopPropagation();
                          // Force update input value to prevent any changes
                          if (endDateRef.current) {
                            endDateRef.current.value = formatDateForInput(endDate);
                          }
                          return;
                        }
                      }
                      
                      // Check if end date is before start date
                      if (startDate && selectedDateStr < startDate) {
                        showToast({
                          type: 'warning',
                          title: 'Tanggal Tidak Valid',
                          message: 'Tanggal akhir tidak boleh kurang dari tanggal mulai. Silakan pilih tanggal yang valid.',
                        });
                        e.target.value = endDate;
                        if (endDateRef.current) {
                          endDateRef.current.value = endDate;
                        }
                        return;
                      }
                      
                      const dayOfWeek = selectedDate.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) {
                        showToast({
                          type: 'warning',
                          title: 'Hari Tidak Valid',
                          message: 'Tidak bisa memilih hari Sabtu atau Minggu. Silakan pilih hari kerja.',
                        });
                        // Reset input value to prevent any state changes
                        e.target.value = formatDateForInput(endDate);
                        e.preventDefault();
                        e.stopPropagation();
                        if (endDateRef.current) {
                          endDateRef.current.value = formatDateForInput(endDate);
                        }
                        // IMPORTANT: Early return - don't update any state, so reminder toast won't trigger
                        return;
                      }
                    
                    // Calculate trading days in the new range
                    const start = new Date(startDate);
                    const end = new Date(e.target.value);
                    const tradingDays: string[] = [];
                    const current = new Date(start);
                    
                    while (current <= end) {
                      const dayOfWeek = current.getDay();
                      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        const dateString = current.toISOString().split('T')[0];
                        if (dateString && dateString >= MIN_DATE) {
                          // Check if date is within maximum available date
                          if (!maxAvailableDate || maxAvailableDate.trim() === '' || dateString <= maxAvailableDate) {
                            tradingDays.push(dateString);
                          } else {
                            // If any date in range is after maxAvailableDate, show toast and prevent change
                            showToast({
                              type: 'warning',
                              title: 'Tanggal Tidak Valid',
                              message: `Tanggal paling baru yang tersedia adalah ${new Date(maxAvailableDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}. Range tanggal yang dipilih mengandung tanggal setelah batas maksimum.`,
                            });
                            // Reset to previous value - prevent any state changes
                            e.target.value = formatDateForInput(endDate);
                            e.preventDefault();
                            e.stopPropagation();
                            // Force update input value to prevent any changes
                            if (endDateRef.current) {
                              endDateRef.current.value = formatDateForInput(endDate);
                            }
                            return;
                          }
                        } else if (dateString && dateString < MIN_DATE) {
                          // If any date in range is before MIN_DATE, show toast and prevent change
                          showToast({
                            type: 'warning',
                            title: 'Tanggal Tidak Valid',
                            message: `Tanggal paling awal yang bisa dipilih adalah 19 September 2025. Range tanggal yang dipilih mengandung tanggal sebelum batas minimum.`,
                          });
                          // Reset to previous value - prevent any state changes
                          e.target.value = formatDateForInput(endDate);
                          e.preventDefault();
                          e.stopPropagation();
                          // Force update input value to prevent any changes
                          if (endDateRef.current) {
                            endDateRef.current.value = formatDateForInput(endDate);
                          }
                          return;
                        }
                      }
                      current.setDate(current.getDate() + 1);
                    }
                    
                    // Only update state if all validations passed
                    // CRITICAL: Reset shouldFetchData silently BEFORE updating dates to prevent auto-load
                    // This ensures data only changes when Show button is clicked
                    shouldFetchDataRef.current = false; // CRITICAL: Update ref first (synchronous) - SILENT
                    setShouldFetchData(false); // SILENT
                    // Update dates - NO effect will run, completely silent
                    setEndDate(e.target.value);
                    setSelectedDates(tradingDays);
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  min={startDate ? formatDateForInput(startDate) : MIN_DATE}
                  max={maxAvailableDate && maxAvailableDate.trim() !== '' ? formatDateForInput(maxAvailableDate) : new Date().toISOString().split('T')[0] || undefined}
                  disabled={false}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center justify-between h-full px-3">
                  <span className="text-sm text-foreground">
                    {endDate ? new Date(endDate).toLocaleDateString('en-GB', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric' 
                    }) : 'DD/MM/YYYY'}
                  </span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
                </div>
                </div>
              </div>

            {/* F/D Filter */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                <label className="text-sm font-medium whitespace-nowrap">F/D:</label>
                  <select 
                  value={fdFilter}
                  onChange={(e) => {
                    setFdFilter(e.target.value as 'All' | 'Foreign' | 'Domestic');
                    // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
                    // User must click Show button to fetch new data
                  }}
                  className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
                >
                  <option value="All">All</option>
                  <option value="Foreign">Foreign</option>
                  <option value="Domestic">Domestic</option>
                  </select>
              </div>

            {/* Market Filter */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                <label className="text-sm font-medium whitespace-nowrap">Board:</label>
                <select
                  value={marketFilter}
                  onChange={(e) => {
                    setMarketFilter(e.target.value as 'RG' | 'TN' | 'NG' | '');
                    // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
                    // User must click Show button to fetch new data
                  }}
                  className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
                >
                  <option value="">All Trade</option>
                  <option value="RG">RG</option>
                  <option value="TN">TN</option>
                  <option value="NG">NG</option>
                </select>
              </div>

              {/* Show Button - moved to far right */}
              <button
                onClick={() => {
                  if (selectedTickers.length === 0 || selectedDates.length === 0) {
                    showToast({
                      type: 'warning',
                      title: 'Data Tidak Lengkap',
                      message: 'Silakan pilih ticker dan tanggal terlebih dahulu.',
                    });
                    return;
                  }
                  
                  // Validate that all selected dates are within maxAvailableDate
                  if (maxAvailableDate && maxAvailableDate.trim() !== '') {
                    const invalidDates = selectedDates.filter(date => date > maxAvailableDate);
                    if (invalidDates.length > 0) {
                      showToast({
                        type: 'warning',
                        title: 'Tanggal Tidak Valid',
                        message: `Tanggal paling baru yang tersedia adalah ${new Date(maxAvailableDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}. Beberapa tanggal yang dipilih (${invalidDates.join(', ')}) melebihi batas maksimum.`,
                      });
                      return;
                    }
                  }
                  
                  // Update displayed values when Show button is clicked
                  setDisplayedFdFilter(fdFilter);
                  setDisplayedTickers([...selectedTickers]);
                  setDisplayedMarket(marketFilter);
                  
                  // Check if only investor filter changed (ticker, dates, and market are the same)
                  const currentParams = {
                    tickers: [...selectedTickers].sort().join(','),
                    dates: [...selectedDates].sort().join(','),
                    market: marketFilter || ''
                  };
                  const lastParams = lastFetchParams ? {
                    tickers: [...lastFetchParams.tickers].sort().join(','),
                    dates: [...lastFetchParams.dates].sort().join(','),
                    market: lastFetchParams.market || ''
                  } : null;
                  
                  const onlyInvestorChanged = lastParams !== null && 
                    currentParams.tickers === lastParams.tickers &&
                    currentParams.dates === lastParams.dates &&
                    currentParams.market === lastParams.market &&
                    rawSummaryByDate.size > 0;
                  
                  if (onlyInvestorChanged) {
                    // Only investor filter changed - filter existing data without calling API
                    // Data is already in rawSummaryByDate, just apply investor filter
                    // summaryByDate will be updated by the filter effect below
                    // Note: displayedTickers and displayedMarket don't need to update (only investor changed)
                    setIsLoading(false);
                    setIsDataReady(true);
                    // No need to fetch API
                  } else {
                    // Ticker, dates, or market changed - need to fetch new data from API
                    // Update last fetch params
                    setLastFetchParams({
                      tickers: [...selectedTickers],
                      dates: [...selectedDates],
                      market: marketFilter || ''
                    });
                    
                    // Clear existing data and cache before fetching new data
                    setSummaryByDate(new Map());
                    setRawSummaryByDate(new Map());
                    setIsDataReady(false);
                    // Clear cache to force fresh fetch with current filters
                    dataCacheRef.current.clear();
                    // Trigger fetch by setting shouldFetchData (ref and state)
                    // CRITICAL: Set ref first (synchronous), then state (async)
                    shouldFetchDataRef.current = true;
                    setShouldFetchData(true);
                  }
                }}
                disabled={isLoading || selectedTickers.length === 0 || selectedDates.length === 0}
                className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto"
              >
                Show
              </button>
            </div>
            </div>

      {/* Spacer untuk header fixed - hanya diperlukan di layar besar (lg+) */}
      <div className={isMenuTwoRows ? "h-0 lg:h-[60px]" : "h-0 lg:h-[38px]"}></div>

      {/* Loading State - only show when actually loading (isLoading === true) */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 pt-4">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading broker summary...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex items-center justify-center py-8 pt-4">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Main Data Display - only show when not loading, no error, and data is ready */}
      <div className="bg-[#0a0f20] pt-2">
        {!isLoading && !error && isDataReady && renderHorizontalView()}
      </div>
    </div>
  );
}
