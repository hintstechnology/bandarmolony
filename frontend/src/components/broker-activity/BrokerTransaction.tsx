import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Loader2, Calendar, Search } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface BrokerTransactionData {
  Emiten: string;
  BuyerVol: number;
  BuyerValue: number;
  SellerVol: number;
  SellerValue: number;
  NetBuyVol: number;
  NetBuyValue: number;
  BuyerAvg: number;
  SellerAvg: number;
  TotalVolume: number;
  AvgPrice: number;
  TransactionCount: number;
  TotalValue: number;
  // VALUE Table: Buyer and Seller data (from CSV columns 0-15)
  BCode?: string;      // Buyer Code (from CSV column 0)
  BLot?: number;       // Buyer Lot (from CSV column 1)
  BFreq?: number;      // Buyer Frequency (from CSV column 4)
  BLotPerFreq?: number; // Buyer Lot/Frequency (Lot/F from CSV column 5)
  BOrdNum?: number;    // Buyer Order Number (from CSV column 6)
  NewBuyerOrdNum?: number; // New Buyer Order Number (for BOR display)
  BLotPerOrdNum?: number; // Buyer Lot/Order Number (Lot/ON from CSV column 7)
  SCode?: string;      // Seller Code (from CSV column 8)
  SLot?: number;       // Seller Lot (from CSV column 9)
  SFreq?: number;      // Seller Frequency (from CSV column 12)
  SLotPerFreq?: number; // Seller Lot/Frequency (Lot/F from CSV column 13)
  SOrdNum?: number;    // Seller Order Number (from CSV column 14)
  NewSellerOrdNum?: number; // New Seller Order Number (for SOR display)
  SLotPerOrdNum?: number; // Seller Lot/Order Number (Lot/ON from CSV column 15)
  // NET Table: Net Buy and Net Sell data (from CSV columns 16-31)
  NBCode?: string;     // Net Buy Code (from CSV column 16)
  NBLot?: number;      // Net Buy Lot (from CSV column 17)
  NBVal?: number;      // Net Buy Value (from CSV column 18)
  NBAvg?: number;      // Net Buy Average (from CSV column 19)
  NBFreq?: number;     // Net Buy Frequency (from CSV column 20)
  NBLotPerFreq?: number; // Net Buy Lot/Frequency (from CSV column 21)
  NBOrdNum?: number;   // Net Buy Order Number (from CSV column 22)
  NBLotPerOrdNum?: number; // Net Buy Lot/Order Number (NLot/ON) from CSV column 23
  NSCode?: string;     // Net Sell Code (from CSV column 24)
  NSLot?: number;      // Net Sell Lot (from CSV column 25)
  NSVal?: number;      // Net Sell Value (from CSV column 26)
  NSAvg?: number;      // Net Sell Average (from CSV column 27)
  NSFreq?: number;     // Net Sell Frequency (from CSV column 28)
  NSLotPerFreq?: number; // Net Sell Lot/Frequency (from CSV column 29)
  NSOrdNum?: number;   // Net Sell Order Number (from CSV column 30)
  NSLotPerOrdNum?: number; // Net Sell Lot/Order Number (NLot/ON) from CSV column 31
  // Calculated fields
  NetBuyAvg?: number;  // Calculated Net Buy Average
  NetSellVol?: number; // Calculated Net Sell Volume
  NetSellValue?: number; // Calculated Net Sell Value
  NetSellAvg?: number; // Calculated Net Sell Average
}

// Cache expiration time: 30 minutes (increased for better performance)
const CACHE_EXPIRY_MS = 30 * 60 * 1000;

// Fetch broker transaction data from API (with caching)
const fetchBrokerTransactionData = async (
  code: string, 
  date: string, 
  pivot: 'Broker' | 'Stock',
  inv: 'F' | 'D' | '',
  board: 'RG' | 'TN' | 'NG' | '',
  cache: Map<string, { data: BrokerTransactionData[]; timestamp: number }>,
  abortSignal?: AbortSignal
): Promise<BrokerTransactionData[]> => {
  // Check if aborted
  if (abortSignal?.aborted) {
    throw new Error('Fetch aborted');
  }
  
  const cacheKey = `${code}-${date}-${pivot}-${inv}-${board}`;
  const cached = cache.get(cacheKey);
  
  // Check cache first (optimized - no timestamp check needed here, already checked in loadTransactionData)
  if (cached) {
    return cached.data;
  }
  
  // Check if aborted before API call
  if (abortSignal?.aborted) {
    throw new Error('Fetch aborted');
  }
  
  try {
    const response = await api.getBrokerTransactionData(code, date, pivot, inv, board);
    
    // Check if aborted after API call
    if (abortSignal?.aborted) {
      throw new Error('Fetch aborted');
    }
    
    if (response.success && response.data?.transactionData) {
      const data = response.data.transactionData;
      
      // Store in cache
      cache.set(cacheKey, { data, timestamp: Date.now() });
      
      return data;
    }
    return [];
  } catch (error: any) {
    if (error?.message === 'Fetch aborted' || abortSignal?.aborted) {
      throw error;
    }
    // Silently return empty array on error to not slow down with console.error
    return [];
  }
};

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

const formatValue = (value: any): string => {
  // Handle null, undefined, or non-numeric values
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '0';
  }
  return formatNumber(Number(value));
};

const formatLot = (value: number): string => {
  const rounded = Math.round(value);
  const absValue = Math.abs(rounded);
  
  // Format: < 1,000,000 → full number with comma (100,000)
  // Format: >= 1,000,000 → rounded to thousands with 'K' (1,164K)
  if (absValue >= 1000000) {
    // Use 'K' suffix for millions: 1,164,152 → 1,164K
    const thousands = Math.round(rounded / 1000);
    return `${thousands.toLocaleString('en-US')}K`;
  } else {
    // < 1,000,000: Show full number with comma separator
    // Example: 100,000 → 100,000 (not 100K)
  return rounded.toLocaleString('en-US');
  }
};

const formatAverage = (value: number): string => {
  // Format: ribuan pakai ',' (koma), desimal pakai '.' (titik)
  // Pastikan selalu 1 angka di belakang koma
  // Contoh: 1335.0, 10,000.5, -3.0, -197.6
  // Tampilkan nilai minus jika value < 0 (tidak perlu parameter allowNegative karena selalu tampilkan nilai asli)
  const rounded = Math.round(value * 10) / 10; // Round to 1 decimal place
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};

// Note: getFilteredAndSortedStocks function removed - filtering and sorting now handled in useMemo

// Get trading days based on count (start from yesterday, skip today)
// Returns dates sorted from oldest to newest (for display left to right)
const getTradingDays = (count: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to local midnight
  let daysBack = 1; // Start from yesterday, skip today
  
  while (dates.length < count) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const dayOfWeek = date.getDay();
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Format as YYYY-MM-DD in local timezone to avoid timezone issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
        dates.push(dateStr);
    }
    daysBack++;
  }
  
  // Sort from oldest to newest (for display left to right)
  return dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
};

// Helper function to get last 3 trading days (starting from yesterday, sorted oldest first)
const getLastThreeDays = (): string[] => {
  return getTradingDays(3);
};

// Note: Sector filter is now used instead of F/D filter
// Sector mapping is loaded from backend API

export function BrokerTransaction() {
  const { showToast } = useToast();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

// Get available dates from backend and return recent trading days (oldest first for display)
const getAvailableTradingDays = async (count: number): Promise<string[]> => {
  try {
    // Get available dates from backend
    const response = await api.getBrokerTransactionDates();
    if (response.success && response.data?.dates) {
      // Backend returns dates in YYYYMMDD format, convert to YYYY-MM-DD for frontend
      const convertedDates = response.data.dates.map(dateStr => {
        // If date is in YYYYMMDD format, convert to YYYY-MM-DD
        if (dateStr.length === 8 && !dateStr.includes('-')) {
          return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }
        return dateStr; // Already in YYYY-MM-DD format
      });
      
      // Sort from newest to oldest, then take first count, then reverse for display (oldest first)
      const availableDates = convertedDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      return availableDates.slice(0, count).reverse(); // Reverse to get oldest first
    }
  } catch (error) {
    console.error('Error fetching available dates:', error);
  }
  
  // Fallback to local calculation if backend fails (already sorted oldest first)
  return getTradingDays(count);
};

  const [startDate, setStartDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0];
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1];
    }
    return '';
  });
  const [brokerInput, setBrokerInput] = useState('');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(['AK']); // Default to AK for testing with CSV
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const dropdownBrokerRef = useRef<HTMLDivElement>(null);
  
  // Refs for table synchronization
  const valueTableRef = useRef<HTMLTableElement>(null);
  const netTableRef = useRef<HTMLTableElement>(null);
  const valueTableContainerRef = useRef<HTMLDivElement>(null);
  const netTableContainerRef = useRef<HTMLDivElement>(null);
  
  // Refs for lazy loading intersection observer
  const valueTableSentinelRef = useRef<HTMLTableCellElement>(null);
  const netTableSentinelRef = useRef<HTMLTableCellElement>(null);
  
  // Ref to track if column width sync has been done (prevent infinite loop)
  const hasSyncedColumnWidthsRef = useRef<boolean>(false);
  // Store column widths to maintain consistency after lazy loading
  const columnWidthsRef = useRef<number[]>([]);
  
  // API data states
  const [transactionData, setTransactionData] = useState<Map<string, BrokerTransactionData[]>>(new Map());
  // Store raw data (before ticker filtering) for availableTickers extraction
  const [rawTransactionData, setRawTransactionData] = useState<Map<string, BrokerTransactionData[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableBrokers, setAvailableBrokers] = useState<string[]>([]);
  const [isDataReady, setIsDataReady] = useState<boolean>(false); // Control when to show tables
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false); // Control when to fetch data (only when Show button clicked)
  
  // Track last fetch parameters to detect if only sector filter changed
  const lastFetchParamsRef = useRef<{
    brokers: string[];
    dates: string[];
    pivot: 'Broker' | 'Stock'; // Track pivotFilter
    inv: string; // Track invFilter
    board: string; // Track boardFilter
    tickers: string[]; // Track selectedTickers to detect changes
    sectors: string[]; // Track selectedSectors to detect changes
  } | null>(null);
  
  // Sector Filter states (changed from F/D filter)
  const [activeSectorFilter, setActiveSectorFilter] = useState<string>('All'); // 'All' or sector name (active filter - used for filtering displayed data)
  const [availableSectors, setAvailableSectors] = useState<string[]>([]); // List of available sectors (excluding 'All')
  const [stockToSectorMap, setStockToSectorMap] = useState<{ [stock: string]: string }>({}); // Stock code -> sector name mapping
  const [pivotFilter, setPivotFilter] = useState<'Broker' | 'Stock'>('Broker'); // Default to Broker
  const [invFilter, setInvFilter] = useState<'F' | 'D' | ''>(''); // Default to All (F = Foreign, D = Domestic) - Investor Type
  const [boardFilter, setBoardFilter] = useState<'RG' | 'TN' | 'NG' | ''>('RG'); // Default to RG - Board Type
  
  // Multi-select ticker/sector states (combined)
  const [tickerInput, setTickerInput] = useState('');
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]); // Empty by default - show all tickers
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]); // Selected sectors (for filtering)
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);
  const [highlightedTickerIndex, setHighlightedTickerIndex] = useState<number>(-1);
  const dropdownTickerRef = useRef<HTMLDivElement>(null);
  
  // Stock list from API (loaded once on mount for fast dropdown)
  const [availableStocksFromAPI, setAvailableStocksFromAPI] = useState<string[]>([]);
  const [isLoadingStocks, setIsLoadingStocks] = useState<boolean>(false);
  
  // OPTIMIZED: Use stock list from API as primary source (fast), fallback to extraction from rawTransactionData
  // FIXED: Use rawTransactionData (before ticker filtering) to show all available tickers for selected broker(s)
  // CRITICAL: If sector is selected, only show tickers from that sector
  const availableTickers = useMemo(() => {
    // Primary source: Use stock list from API (fast, loaded once on mount)
    if (availableStocksFromAPI.length > 0) {
      // If sector is selected, filter tickers by sector
      if (selectedSectors.length > 0) {
        const tickersFromSectors = availableStocksFromAPI.filter(ticker => {
          const tickerSector = stockToSectorMap[ticker.toUpperCase()];
          return tickerSector && selectedSectors.includes(tickerSector);
        });
        return tickersFromSectors.sort();
      }
      return [...availableStocksFromAPI].sort();
    }
    
    // Fallback: Extract from rawTransactionData (slower, but works if API not loaded yet)
    const allTickers = new Set<string>();
    if (isDataReady && rawTransactionData.size > 0) {
      // Extract from all dates in rawTransactionData (before filtering) to show all available tickers
      rawTransactionData.forEach((dateData) => {
        dateData.forEach(item => {
          if (item.BCode) allTickers.add(item.BCode);
          if (item.SCode) allTickers.add(item.SCode);
          if (item.NBCode) allTickers.add(item.NBCode);
          if (item.NSCode) allTickers.add(item.NSCode);
        });
      });
    }
    
    // If sector is selected, filter tickers by sector
    if (selectedSectors.length > 0) {
      const tickersFromSectors = Array.from(allTickers).filter(ticker => {
        const tickerSector = stockToSectorMap[ticker.toUpperCase()];
        return tickerSector && selectedSectors.includes(tickerSector);
      });
      return tickersFromSectors.sort();
    }
    
    return Array.from(allTickers).sort();
  }, [availableStocksFromAPI, rawTransactionData, isDataReady, selectedSectors, stockToSectorMap]); // Include availableStocksFromAPI as primary source

  // Request cancellation ref
  const abortControllerRef = useRef<AbortController | null>(null);
  const shouldFetchDataRef = useRef<boolean>(false); // Ref to track shouldFetchData for async functions (always up-to-date)
  const hasInitialAutoFetchRef = useRef<boolean>(false); // Track if initial auto-fetch has been triggered (only once on mount)
  
  // Cache for API responses to avoid redundant calls
  // Key format: `${broker}-${date}-${market}`
  const dataCacheRef = useRef<Map<string, { data: BrokerTransactionData[]; timestamp: number }>>(new Map());
  
  // Virtual scrolling states for performance
  // FIXED: Always start with exactly 20 rows (like BrokerSummary MAX_DISPLAY_ROWS)
  const MAX_DISPLAY_ROWS = 20;
  const [visibleRowCount, setVisibleRowCount] = useState<number>(MAX_DISPLAY_ROWS); // Start with 20 visible rows
  
  // FIXED: Don't reset visible rows on input change - only reset when data actually changes
  // This prevents unnecessary re-renders when user changes input
  // Visible rows will reset automatically when new data is loaded (via transactionData change)

  // Load available brokers, tickers, and initial dates on component mount
  // IMPORTANT: This effect runs ONLY ONCE on mount - auto-load default data (1x only)
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        // OPTIMIZED: Try to load sector mapping from localStorage first for instant colors
        const SECTOR_MAPPING_CACHE_KEY = 'broker_transaction_sector_mapping';
        const SECTOR_MAPPING_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
        
        let cachedSectorMapping: { stockToSector: { [stock: string]: string }; sectors: string[]; timestamp: number } | null = null;
        try {
          const cached = localStorage.getItem(SECTOR_MAPPING_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.timestamp && (Date.now() - parsed.timestamp) < SECTOR_MAPPING_CACHE_TTL) {
              cachedSectorMapping = parsed;
              // Set cached sector mapping immediately for instant colors
              setStockToSectorMap(parsed.stockToSector);
              setAvailableSectors(parsed.sectors); // Exclude 'All' from available sectors
            }
          }
        } catch (e) {
          // Ignore cache errors
        }
        
        // OPTIMIZED: Load broker list, dates, stock list, and sector mapping in parallel for faster initial load
        // Stock list is needed for fast dropdown, sector mapping is needed for stock coloring
        setIsLoadingStocks(true);
        const [brokerResponse, initialDates, stockResponse, sectorResponse] = await Promise.all([
          api.getBrokerList(),
          getAvailableTradingDays(3),
          api.getStockList(), // Load stock list for fast dropdown
          cachedSectorMapping ? Promise.resolve({ success: true, data: cachedSectorMapping }) : api.getSectorMapping()
        ]);
        
        if (brokerResponse.success && brokerResponse.data?.brokers) {
          setAvailableBrokers(brokerResponse.data.brokers);
        } else {
          throw new Error('Failed to load broker list');
        }
        
        // Load stock list from API for fast dropdown (like BrokerSummaryPage)
        if (stockResponse.success && stockResponse.data?.stocks && Array.isArray(stockResponse.data.stocks)) {
          setAvailableStocksFromAPI(stockResponse.data.stocks);
          console.log(`[BrokerTransaction] Loaded ${stockResponse.data.stocks.length} stocks from API for dropdown`);
        } else {
          console.warn('[BrokerTransaction] Failed to load stock list from API, will use extraction from transaction data');
        }
        setIsLoadingStocks(false);
        
        // Update sector mapping if we got fresh data (not from cache)
        if (sectorResponse.success && sectorResponse.data && !cachedSectorMapping) {
          setStockToSectorMap(sectorResponse.data.stockToSector);
          setAvailableSectors(sectorResponse.data.sectors); // Exclude 'All' from available sectors
          // Cache for next time
          try {
            localStorage.setItem(SECTOR_MAPPING_CACHE_KEY, JSON.stringify({
              stockToSector: sectorResponse.data.stockToSector,
              sectors: sectorResponse.data.sectors,
              timestamp: Date.now()
            }));
          } catch (e) {
            // Ignore cache errors
          }
        } else if (!cachedSectorMapping && (!sectorResponse.success || !sectorResponse.data)) {
          console.warn('[BrokerTransaction] Failed to load sector mapping, sector filter will not work');
        }
        // Sort by date (oldest first) for display
        const sortedDates = [...initialDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        
        // Set default to last 3 trading days (skip weekends)
        // CRITICAL: Set hasInitialAutoFetchRef BEFORE setting dates to prevent useEffect from triggering
        // This ensures useEffect update selectedDates knows that initial load is in progress
        hasInitialAutoFetchRef.current = false; // Mark as not yet completed
        
        setSelectedDates(sortedDates);
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
        
        // Capture current values for initial auto-fetch (default menu)
        const currentBrokers = ['AK']; // Default broker
        const datesToUse = [...sortedDates];
        
        // Trigger initial auto-fetch AFTER all states are set (only once on mount)
        // CRITICAL: Use setTimeout to ensure all state updates are batched and applied
        setTimeout(() => {
          // Only trigger if initial fetch hasn't happened AND we have dates and brokers
          // Note: tickers and sectors can be empty (show all) - so we don't require them
          if (!hasInitialAutoFetchRef.current && 
              datesToUse.length > 0 && 
              currentBrokers.length > 0) {
            // Mark as triggered IMMEDIATELY (synchronously) before any async operations
            hasInitialAutoFetchRef.current = true;
            // Set ref first (synchronous), then state (async)
            shouldFetchDataRef.current = true;
            setShouldFetchData(true);
          } else {
            setIsLoading(false);
          }
        }, 0);
        
        // Loading akan di-reset oleh loadTransactionData jika fetch dilakukan
        
      } catch (error) {
        console.error('Error loading initial data:', error);
        setIsLoading(false);
        setIsLoadingStocks(false);
        
        // Fallback to hardcoded broker list and local date calculation
        const brokers = ['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA','AK'];
        setAvailableBrokers(brokers);
        
        // Default to last 3 trading days (skip weekends)
        const fallbackDates = getTradingDays(3);
        // Sort by date (oldest first) for display
          const sortedDates = [...fallbackDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        setSelectedDates(sortedDates);
        
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
      }
    };

    loadInitialData();
  }, []); // IMPORTANT: Empty dependency array - only run once on mount

  // Load transaction data only when shouldFetchData is true (triggered by Show button)
  useEffect(() => {
    // Only fetch if shouldFetchData is true
    if (!shouldFetchData) {
      return;
    }
    
    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    const loadTransactionData = async () => {
      // CRITICAL: Check ref instead of state - ref is always up-to-date even in async context
      if (!shouldFetchDataRef.current) {
        setIsLoading(false);
        setIsDataReady(false);
        return;
      }
      
      // Validation: For Broker pivot, need brokers. For Stock pivot, need tickers.
      if (pivotFilter === 'Broker') {
        if (selectedBrokers.length === 0 || selectedDates.length === 0) {
          setTransactionData(new Map());
          setRawTransactionData(new Map()); // Clear raw data too
          setIsDataReady(false);
          setShouldFetchData(false);
          shouldFetchDataRef.current = false;
          return;
        }
      } else if (pivotFilter === 'Stock') {
        // For Stock pivot, tickers are required (brokers are optional)
        if (selectedTickers.length === 0 || selectedDates.length === 0) {
          setTransactionData(new Map());
          setRawTransactionData(new Map()); // Clear raw data too
          setIsDataReady(false);
          setShouldFetchData(false);
          shouldFetchDataRef.current = false;
          return;
        }
      }
      
      // CRITICAL: Check ref again after validation
      if (!shouldFetchDataRef.current || abortController.signal.aborted) {
        setIsLoading(false);
        setIsDataReady(false);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        const newTransactionData = new Map<string, BrokerTransactionData[]>();
        const newRawTransactionData = new Map<string, BrokerTransactionData[]>(); // Store raw data before filtering
        const cache = dataCacheRef.current;
        const now = Date.now();
        
        // Clear expired cache entries
        for (const [key, value] of cache.entries()) {
          if (now - value.timestamp > CACHE_EXPIRY_MS) {
            cache.delete(key);
          }
        }
        
        // OPTIMIZED: Fetch all data in parallel with smart batching
        // Separate cached and uncached requests for optimal performance
        // For Broker pivot: use selectedBrokers as code
        // For Stock pivot: use selectedTickers as code
        const allFetchTasks = pivotFilter === 'Stock'
          ? selectedDates.flatMap(date =>
              selectedTickers.map((ticker: string) => ({ code: ticker, date, type: 'stock' as const }))
            )
          : selectedDates.flatMap(date =>
              selectedBrokers.map((broker: string) => ({ code: broker, date, type: 'broker' as const }))
            );
        
        // Check cache first and separate cached vs uncached requests
        const cachedResults: Array<{ date: string; code: string; data: BrokerTransactionData[] }> = [];
        const uncachedTasks: Array<{ code: string; date: string }> = [];
        
        allFetchTasks.forEach(({ code, date }) => {
          const cacheKey = `${code}-${date}-${pivotFilter}-${invFilter}-${boardFilter}`;
          const cached = cache.get(cacheKey);
          if (cached && (now - cached.timestamp) <= CACHE_EXPIRY_MS) {
            cachedResults.push({ date, code, data: cached.data });
          } else {
            uncachedTasks.push({ code, date });
          }
        });
        
        // Use cached data immediately
        const allDataResults: Array<{ date: string; code: string; data: BrokerTransactionData[] }> = [...cachedResults];
        
        // OPTIMIZED: Fetch all uncached data in parallel with concurrency limit for maximum speed
        // Using concurrency limit prevents browser from being overwhelmed while still being fast
        // Increased to 50 for faster loading (browser can handle this easily)
        const CONCURRENCY_LIMIT = 50;
        
        if (uncachedTasks.length > 0) {
          // Show cached data immediately if available
          if (cachedResults.length > 0) {
            const cachedDataMap = new Map<string, BrokerTransactionData[]>();
            const cachedRawDataMap = new Map<string, BrokerTransactionData[]>();
            cachedResults.forEach(({ date, data }) => {
              const existing = cachedDataMap.get(date) || [];
              cachedDataMap.set(date, [...existing, ...data]);
              const existingRaw = cachedRawDataMap.get(date) || [];
              cachedRawDataMap.set(date, [...existingRaw, ...data]);
            });
            setTransactionData(cachedDataMap);
            setRawTransactionData(cachedRawDataMap);
            setIsDataReady(true);
          }
          
          // Process all uncached tasks with concurrency limit
          const processWithConcurrency = async () => {
            let completedCount = 0;
            let hasShownFirstData = cachedResults.length > 0;
            
            // Process in chunks with concurrency limit
            for (let i = 0; i < uncachedTasks.length; i += CONCURRENCY_LIMIT) {
              // CRITICAL: Check ref before each chunk
          if (!shouldFetchDataRef.current || abortController.signal.aborted) {
            return;
          }
          
              const chunk = uncachedTasks.slice(i, i + CONCURRENCY_LIMIT);
              
              // Fetch all in this chunk in parallel
              const chunkPromises = chunk.map(({ code, date }) => 
              fetchBrokerTransactionData(code, date, pivotFilter, invFilter, boardFilter, cache, abortController.signal)
                  .then(data => ({ success: true, code, date, data }))
                  .catch(error => ({ success: false, code, date, error }))
            );
            
              // Wait for chunk to complete
              const chunkResults = await Promise.all(chunkPromises);
            
              // CRITICAL: Check ref after chunk
            if (!shouldFetchDataRef.current || abortController.signal.aborted) {
          return;
        }
        
              // Process chunk results
              chunkResults.forEach((result) => {
                if (result.success && 'data' in result && result.data && result.data.length > 0) {
                  allDataResults.push({ date: result.date, code: result.code, data: result.data });
                  completedCount++;
                } else if (!result.success && 'error' in result) {
                  console.warn(`[BrokerTransaction] Failed to fetch data for ${result.code}-${result.date}:`, result.error);
                }
              });
              
              // OPTIMIZED: Update UI incrementally every chunk for faster perceived performance
              // This makes the UI feel much faster - user sees data updating progressively
              if (allDataResults.length > 0) {
                const currentDataMap = new Map<string, BrokerTransactionData[]>();
                const currentRawDataMap = new Map<string, BrokerTransactionData[]>();
                
                allDataResults.forEach(({ date, data }) => {
                  const existing = currentDataMap.get(date) || [];
                  currentDataMap.set(date, [...existing, ...data]);
                  const existingRaw = currentRawDataMap.get(date) || [];
                  currentRawDataMap.set(date, [...existingRaw, ...data]);
                });
                
                // Update state incrementally
                setTransactionData(currentDataMap);
                setRawTransactionData(currentRawDataMap);
                
                // Show data immediately on first chunk if not shown yet
                if (!hasShownFirstData) {
                  setIsDataReady(true);
                  hasShownFirstData = true;
                }
              }
            }
          };
          
          try {
            await processWithConcurrency();
          } catch (error: any) {
            // If aborted, silently abort
            if (error?.message === 'Fetch aborted' || !shouldFetchDataRef.current || abortController.signal.aborted) {
              return;
            }
            // For other errors, log but continue
            console.error('[BrokerTransaction] Error in parallel fetch:', error);
          }
        }
        
        // CRITICAL: Final check after all batches - user might have changed dates during fetch
        if (!shouldFetchDataRef.current || abortController.signal.aborted) {
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }
        
        // CRITICAL: Validate that we only process data for selected dates
        // Filter allDataResults to only include dates that are in selectedDates
        const validDates = new Set(selectedDates);
        const filteredDataResults = allDataResults.filter(({ date }) => {
          const isValid = validDates.has(date);
          if (!isValid) {
            console.warn(`[BrokerTransaction] WARNING: Data with date ${date} found but not in selectedDates [${selectedDates.join(', ')}]. Skipping.`);
          }
          return isValid;
        });
        
        // DEBUG: Log date validation
        if (selectedDates.length > 0) {
          console.log('[BrokerTransaction] DEBUG - Date validation:', {
            selectedDates,
            fetchedDates: [...new Set(allDataResults.map(r => r.date))],
            validDataResults: filteredDataResults.length,
            totalDataResults: allDataResults.length,
          });
        }
        
        // Process data per date - AGGREGATE per Emiten and per section (Buy, Sell, Net Buy, Net Sell)
        // When multiple brokers are selected, sum values for the same Emiten
        // CRITICAL: For Stock pivot, don't aggregate - each row is already complete (broker transaction for a stock)
        // For Broker pivot, aggregate by Emiten (stock) when multiple brokers are selected
        for (const date of selectedDates) {
          // CRITICAL: Check ref during aggregation - user might have changed dates
          if (!shouldFetchDataRef.current) {
            return;
          }
          
          // For Stock pivot: don't aggregate, just collect all rows
          // For Broker pivot: aggregate by Emiten (stock) when multiple brokers are selected
          if (pivotFilter === 'Stock') {
            // For Stock pivot, each row is already complete - no aggregation needed
            const allRows: BrokerTransactionData[] = [];
            filteredDataResults.forEach(({ date: resultDate, data }) => {
              // CRITICAL: Only process data for the current date being processed
              if (resultDate !== date) return;
              allRows.push(...data);
            });
            
            // Store raw data (before filtering)
            const rawRows = [...allRows];
            
            // Apply filters if needed
            // CRITICAL: For Stock pivot, filter by broker if selectedBrokers is provided
            // For Stock pivot: Emiten, BCode, SCode, NBCode, NSCode are all broker codes
            let filteredRows = allRows;
            
            // Priority 1: Filter by broker (if selectedBrokers is provided)
            if (selectedBrokers.length > 0) {
              // Normalize selected brokers to uppercase for case-insensitive comparison
              const normalizedSelectedBrokers = selectedBrokers.map(b => b.toUpperCase());
              
              filteredRows = filteredRows.filter(row => {
                const emiten = (row.Emiten || '').toUpperCase();
                const bCode = (row.BCode || '').toUpperCase();
                const sCode = (row.SCode || '').toUpperCase();
                const nbCode = (row.NBCode || '').toUpperCase();
                const nsCode = (row.NSCode || '').toUpperCase();
                
                // Check if any broker code in row matches selected brokers (case-insensitive)
                return normalizedSelectedBrokers.includes(emiten) || 
                       normalizedSelectedBrokers.includes(bCode) || 
                       normalizedSelectedBrokers.includes(sCode) || 
                       normalizedSelectedBrokers.includes(nbCode) || 
                       normalizedSelectedBrokers.includes(nsCode);
              });
            }
            
            // Priority 2: Filter by ticker (if selectedTickers is provided and no broker filter)
            // Note: For Stock pivot, selectedTickers are the stocks we're viewing
            // We already filtered at fetch time, but can apply additional filtering here if needed
            if (selectedTickers.length > 0 && selectedBrokers.length === 0) {
              // For Stock pivot, we already filtered by ticker at fetch time
              // But we can keep this for consistency
              filteredRows = filteredRows;
            }
            
            // Priority 3: Filter by sector (if selectedSectors is provided)
            if (selectedSectors.length > 0 && selectedBrokers.length === 0 && selectedTickers.length === 0) {
              // For Stock pivot, broker codes don't have sectors, so this won't filter anything
              filteredRows = filteredRows;
            }
            
            // Store data
            newRawTransactionData.set(date, rawRows);
            newTransactionData.set(date, filteredRows);
            continue;
          }
          
          // For Broker pivot: aggregate by Emiten (stock)
          // Map to aggregate data per Emiten and per section
          // Key: Emiten, Value: aggregated BrokerTransactionData
          const aggregatedMap = new Map<string, BrokerTransactionData>();
          
          // CRITICAL: Check if only 1 broker is selected - if yes, use CSV values directly without recalculation
          const isSingleBroker = selectedBrokers.length === 1;
          
          // Process results for this date from all brokers
          // CRITICAL: Only process data from filteredDataResults (which only contains selectedDates)
          filteredDataResults.forEach(({ date: resultDate, code, data }) => {
            // CRITICAL: Double-check that we only process data for the current date
            if (resultDate !== date) {
              console.warn(`[BrokerTransaction] WARNING: Trying to process data with date ${resultDate} but current date is ${date}. Skipping.`);
              return;
            }
              
              // Aggregate rows by Emiten
              for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
                const row = data[rowIndex];
                if (!row) continue;
                
                const emiten = row.Emiten || '';
                if (!emiten) continue;
                
                // DEBUG: Print CSV values for first row only
                if (rowIndex === 0 && date === selectedDates[0]) {
                  console.log('[BrokerTransaction] DEBUG - First row CSV values:', {
                    date,
                    emiten,
                    selectedBrokers,
                    isSingleBroker,
                    CSV_BLot: row.BLot,
                    CSV_BLotPerOrdNum: row.BLotPerOrdNum,
                    CSV_NewBuyerOrdNum: row.NewBuyerOrdNum,
                    CSV_BOrdNum: row.BOrdNum,
                    CSV_SLot: row.SLot,
                    CSV_SLotPerOrdNum: row.SLotPerOrdNum,
                    CSV_NewSellerOrdNum: row.NewSellerOrdNum,
                    CSV_SOrdNum: row.SOrdNum,
                  });
                }
                
                // DEBUG: Special logging for BUMI stock in broker AK on Nov 13
                const isBUMI = emiten.toUpperCase() === 'BUMI';
                const isNov13 = date.includes('2024-11-13') || date.includes('2025-11-13') || date.includes('20241113') || date.includes('20251113') || date.includes('-11-13');
                const isBrokerAK = selectedBrokers.includes('AK') || selectedBrokers.includes('ak') || code === 'AK' || code === 'ak';
                if (isBUMI && isNov13 && isBrokerAK) {
                  console.log('[BrokerTransaction] DEBUG - BUMI data for AK on Nov 13:', {
                    date,
                    emiten,
                    brokerCode: code,
                    selectedBrokers,
                    isSingleBroker,
                    '=== RAW CSV DATA ===': {
                      BCode: row.BCode,
                      BLot: row.BLot,
                      BVal: row.BuyerValue,
                      BAvg: row.BuyerAvg,
                      BFreq: row.BFreq,
                      BLotPerFreq: row.BLotPerFreq,
                      BOrdNum: row.BOrdNum,
                      NewBuyerOrdNum: row.NewBuyerOrdNum,
                      BLotPerOrdNum: row.BLotPerOrdNum,
                      '---Calculated BLotPerOrdNum---': {
                        from_NewBuyerOrdNum: row.BLot && row.NewBuyerOrdNum ? row.BLot / row.NewBuyerOrdNum : null,
                        from_BOrdNum: row.BLot && row.BOrdNum ? row.BLot / row.BOrdNum : null,
                      },
                      SCode: row.SCode,
                      SLot: row.SLot,
                      SVal: row.SellerValue,
                      SAvg: row.SellerAvg,
                      SFreq: row.SFreq,
                      SLotPerFreq: row.SLotPerFreq,
                      SOrdNum: row.SOrdNum,
                      NewSellerOrdNum: row.NewSellerOrdNum,
                      SLotPerOrdNum: row.SLotPerOrdNum,
                      '---Calculated SLotPerOrdNum---': {
                        from_NewSellerOrdNum: row.SLot && row.NewSellerOrdNum ? row.SLot / row.NewSellerOrdNum : null,
                        from_SOrdNum: row.SLot && row.SOrdNum ? row.SLot / row.SOrdNum : null,
                      },
                    },
                  });
                }
                
                const existing = aggregatedMap.get(emiten);
                if (existing) {
                  // Sum values for the same Emiten from different brokers
                  // Buyer section
                  existing.BuyerVol = (existing.BuyerVol || 0) + (row.BuyerVol || 0);
                  existing.BuyerValue = (existing.BuyerValue || 0) + (row.BuyerValue || 0);
                  existing.BFreq = (existing.BFreq || 0) + (row.BFreq || 0);
                  existing.BOrdNum = (existing.BOrdNum || 0) + (row.BOrdNum || 0);
                  existing.BLot = (existing.BLot || 0) + (row.BLot || 0);
                  // Track NewBuyerOrdNum for accurate BLotPerOrdNum calculation
                  const existingNewBuyerOrdNum = existing.NewBuyerOrdNum !== undefined ? existing.NewBuyerOrdNum : (existing.BOrdNum || 0);
                  const rowNewBuyerOrdNum = row.NewBuyerOrdNum !== undefined ? row.NewBuyerOrdNum : (row.BOrdNum || 0);
                  existing.NewBuyerOrdNum = existingNewBuyerOrdNum + rowNewBuyerOrdNum;
                  
                  // Use Lot/F and Lot/ON from CSV only - no manual calculation
                  // Use weighted average when both values exist, otherwise use the one that exists
                  if (row.BLotPerFreq !== undefined && row.BLotPerFreq !== null) {
                    if (existing.BLotPerFreq !== undefined && existing.BLotPerFreq !== null) {
                      // Weighted average based on frequency (both values from CSV)
                      const totalFreq = (existing.BFreq || 0) + (row.BFreq || 0);
                      if (totalFreq > 0) {
                        existing.BLotPerFreq = ((existing.BLotPerFreq * (existing.BFreq || 0)) + (row.BLotPerFreq * (row.BFreq || 0))) / totalFreq;
                      }
                    } else {
                      existing.BLotPerFreq = row.BLotPerFreq;
                    }
                  }
                  
                  // CRITICAL: For BLotPerOrdNum, ALWAYS recalculate from aggregated BLot and NewBuyerOrdNum
                  // Formula: BLotPerOrdNum = BLot / NewBuyerOrdNum (when NewBuyerOrdNum != 0)
                  // Use NewBuyerOrdNum (not BOrdNum) as denominator for accurate calculation
                  // This applies to both single and multiple brokers
                  const totalNewBuyerOrdNum = existing.NewBuyerOrdNum || 0;
                  if (totalNewBuyerOrdNum !== 0) {
                    existing.BLotPerOrdNum = Math.abs(existing.BLot || 0) / Math.abs(totalNewBuyerOrdNum);
                  } else {
                    // Fallback: if NewBuyerOrdNum is 0, set to 0
                    existing.BLotPerOrdNum = 0;
                  }
                  // Recalculate BuyerAvg from aggregated values
                  existing.BuyerAvg = (existing.BuyerVol || 0) > 0 ? (existing.BuyerValue || 0) / (existing.BuyerVol || 0) : 0;
                  
                  // Seller section
                  existing.SellerVol = (existing.SellerVol || 0) + (row.SellerVol || 0);
                  existing.SellerValue = (existing.SellerValue || 0) + (row.SellerValue || 0);
                  existing.SFreq = (existing.SFreq || 0) + (row.SFreq || 0);
                  existing.SOrdNum = (existing.SOrdNum || 0) + (row.SOrdNum || 0);
                  existing.SLot = (existing.SLot || 0) + (row.SLot || 0);
                  // Track NewSellerOrdNum for accurate SLotPerOrdNum calculation
                  const existingNewSellerOrdNum = existing.NewSellerOrdNum !== undefined ? existing.NewSellerOrdNum : (existing.SOrdNum || 0);
                  const rowNewSellerOrdNum = row.NewSellerOrdNum !== undefined ? row.NewSellerOrdNum : (row.SOrdNum || 0);
                  existing.NewSellerOrdNum = existingNewSellerOrdNum + rowNewSellerOrdNum;
                  
                  // Use Lot/F and Lot/ON from CSV only - no manual calculation
                  if (row.SLotPerFreq !== undefined && row.SLotPerFreq !== null) {
                    if (existing.SLotPerFreq !== undefined && existing.SLotPerFreq !== null) {
                      // Weighted average based on frequency (both values from CSV)
                      const totalFreq = (existing.SFreq || 0) + (row.SFreq || 0);
                      if (totalFreq > 0) {
                        existing.SLotPerFreq = ((existing.SLotPerFreq * (existing.SFreq || 0)) + (row.SLotPerFreq * (row.SFreq || 0))) / totalFreq;
                      }
                    } else {
                      existing.SLotPerFreq = row.SLotPerFreq;
                    }
                  }
                  
                  // CRITICAL: For SLotPerOrdNum, ALWAYS recalculate from aggregated SLot and NewSellerOrdNum
                  // Formula: SLotPerOrdNum = SLot / NewSellerOrdNum (when NewSellerOrdNum != 0)
                  // Use NewSellerOrdNum (not SOrdNum) as denominator for accurate calculation
                  // This applies to both single and multiple brokers
                  const totalNewSellerOrdNum = existing.NewSellerOrdNum || 0;
                  if (totalNewSellerOrdNum !== 0) {
                    existing.SLotPerOrdNum = Math.abs(existing.SLot || 0) / Math.abs(totalNewSellerOrdNum);
                  } else {
                    // Fallback: if NewSellerOrdNum is 0, set to 0
                    existing.SLotPerOrdNum = 0;
                  }
                  existing.SellerAvg = (existing.SellerVol || 0) > 0 ? (existing.SellerValue || 0) / (existing.SellerVol || 0) : 0;
                  
                  // Net Buy section
                  existing.NetBuyVol = (existing.NetBuyVol || 0) + (row.NetBuyVol || 0);
                  existing.NetBuyValue = (existing.NetBuyValue || 0) + (row.NetBuyValue || 0);
                  existing.NBFreq = (existing.NBFreq || 0) + (row.NBFreq || 0);
                  existing.NBOrdNum = (existing.NBOrdNum || 0) + (row.NBOrdNum || 0);
                  // Use Lot/F and Lot/ON from CSV only - no manual calculation
                  if (row.NBLotPerFreq !== undefined && row.NBLotPerFreq !== null) {
                    if (existing.NBLotPerFreq !== undefined && existing.NBLotPerFreq !== null) {
                      // Weighted average based on frequency (both values from CSV)
                      const totalFreq = (existing.NBFreq || 0) + (row.NBFreq || 0);
                      if (totalFreq !== 0) {
                        existing.NBLotPerFreq = ((existing.NBLotPerFreq * Math.abs(existing.NBFreq || 0)) + (row.NBLotPerFreq * Math.abs(row.NBFreq || 0))) / Math.abs(totalFreq);
                      }
                    } else {
                      existing.NBLotPerFreq = row.NBLotPerFreq;
                    }
                  }
                  if (row.NBLotPerOrdNum !== undefined && row.NBLotPerOrdNum !== null) {
                    if (existing.NBLotPerOrdNum !== undefined && existing.NBLotPerOrdNum !== null) {
                      // Weighted average based on order number (both values from CSV)
                      const totalOrdNum = (existing.NBOrdNum || 0) + (row.NBOrdNum || 0);
                      if (totalOrdNum !== 0) {
                        existing.NBLotPerOrdNum = ((existing.NBLotPerOrdNum * Math.abs(existing.NBOrdNum || 0)) + (row.NBLotPerOrdNum * Math.abs(row.NBOrdNum || 0))) / Math.abs(totalOrdNum);
                      }
                    } else {
                      existing.NBLotPerOrdNum = row.NBLotPerOrdNum;
                    }
                  }
                  existing.NBLot = (existing.NBLot || 0) + (row.NBLot || 0);
                  existing.NBAvg = (existing.NetBuyVol || 0) > 0 ? (existing.NetBuyValue || 0) / (existing.NetBuyVol || 0) : 0;
                  
                  // Net Sell section
                  existing.NetSellVol = (existing.NetSellVol || 0) + (row.NetSellVol || 0);
                  existing.NetSellValue = (existing.NetSellValue || 0) + (row.NetSellValue || 0);
                  existing.NSFreq = (existing.NSFreq || 0) + (row.NSFreq || 0);
                  existing.NSOrdNum = (existing.NSOrdNum || 0) + (row.NSOrdNum || 0);
                  // Use Lot/F and Lot/ON from CSV only - no manual calculation
                  if (row.NSLotPerFreq !== undefined && row.NSLotPerFreq !== null) {
                    if (existing.NSLotPerFreq !== undefined && existing.NSLotPerFreq !== null) {
                      // Weighted average based on frequency (both values from CSV)
                      const totalFreq = (existing.NSFreq || 0) + (row.NSFreq || 0);
                      if (totalFreq !== 0) {
                        existing.NSLotPerFreq = ((existing.NSLotPerFreq * Math.abs(existing.NSFreq || 0)) + (row.NSLotPerFreq * Math.abs(row.NSFreq || 0))) / Math.abs(totalFreq);
                      }
                    } else {
                      existing.NSLotPerFreq = row.NSLotPerFreq;
                    }
                  }
                  if (row.NSLotPerOrdNum !== undefined && row.NSLotPerOrdNum !== null) {
                    if (existing.NSLotPerOrdNum !== undefined && existing.NSLotPerOrdNum !== null) {
                      // Weighted average based on order number (both values from CSV)
                      const totalOrdNum = (existing.NSOrdNum || 0) + (row.NSOrdNum || 0);
                      if (totalOrdNum !== 0) {
                        existing.NSLotPerOrdNum = ((existing.NSLotPerOrdNum * Math.abs(existing.NSOrdNum || 0)) + (row.NSLotPerOrdNum * Math.abs(row.NSOrdNum || 0))) / Math.abs(totalOrdNum);
                      }
                    } else {
                      existing.NSLotPerOrdNum = row.NSLotPerOrdNum;
                    }
                  }
                  existing.NSLot = (existing.NSLot || 0) + (row.NSLot || 0);
                  existing.NSAvg = (existing.NetSellVol || 0) > 0 ? (existing.NetSellValue || 0) / (existing.NetSellVol || 0) : 0;
                  
                  // Total fields
                  existing.TotalVolume = (existing.TotalVolume || 0) + (row.TotalVolume || 0);
                  existing.TotalValue = (existing.TotalValue || 0) + (row.TotalValue || 0);
                  existing.TransactionCount = (existing.TransactionCount || 0) + (row.TransactionCount || 0);
                  existing.AvgPrice = (existing.TotalVolume || 0) > 0 ? (existing.TotalValue || 0) / (existing.TotalVolume || 0) : 0;
                } else {
                  // First occurrence of this Emiten - clone row and recalculate BLotPerOrdNum/SLotPerOrdNum
                  const firstRow = { ...row } as BrokerTransactionData;
                  
                  // CRITICAL: Recalculate BLotPerOrdNum using NewBuyerOrdNum (not BOrdNum)
                  const firstNewBuyerOrdNum = firstRow.NewBuyerOrdNum !== undefined ? firstRow.NewBuyerOrdNum : (firstRow.BOrdNum || 0);
                  if (firstNewBuyerOrdNum !== 0 && firstRow.BLot !== undefined) {
                    firstRow.BLotPerOrdNum = Math.abs(firstRow.BLot) / Math.abs(firstNewBuyerOrdNum);
                  } else {
                    firstRow.BLotPerOrdNum = 0;
                  }
                  
                  // CRITICAL: Recalculate SLotPerOrdNum using NewSellerOrdNum (not SOrdNum)
                  const firstNewSellerOrdNum = firstRow.NewSellerOrdNum !== undefined ? firstRow.NewSellerOrdNum : (firstRow.SOrdNum || 0);
                  if (firstNewSellerOrdNum !== 0 && firstRow.SLot !== undefined) {
                    firstRow.SLotPerOrdNum = Math.abs(firstRow.SLot) / Math.abs(firstNewSellerOrdNum);
                  } else {
                    firstRow.SLotPerOrdNum = 0;
                  }
                  
                  aggregatedMap.set(emiten, firstRow);
              }
            }
          });
          
          // Convert map to array
          let allRows = Array.from(aggregatedMap.values());
          
          // DEBUG: Log final aggregated data for BUMI on Nov 13 with broker AK
          const isNov13Date = date.includes('2024-11-13') || date.includes('2025-11-13') || date.includes('20241113') || date.includes('20251113') || date.includes('-11-13');
          const isBrokerAKForDate = selectedBrokers.includes('AK') || selectedBrokers.includes('ak');
          if (isNov13Date && isBrokerAKForDate) {
            const bumiRow = allRows.find(row => (row.Emiten || '').toUpperCase() === 'BUMI');
            if (bumiRow) {
              console.log('[BrokerTransaction] DEBUG - Final aggregated BUMI data for AK on Nov 13:', {
                date,
                emiten: bumiRow.Emiten,
                selectedBrokers,
                isSingleBroker,
                '=== FINAL AGGREGATED DATA ===': {
                  BCode: bumiRow.BCode,
                  BLot: bumiRow.BLot,
                  BVal: bumiRow.BuyerValue,
                  BAvg: bumiRow.BuyerAvg,
                  BFreq: bumiRow.BFreq,
                  BLotPerFreq: bumiRow.BLotPerFreq,
                  BOrdNum: bumiRow.BOrdNum,
                  NewBuyerOrdNum: bumiRow.NewBuyerOrdNum,
                  BLotPerOrdNum: bumiRow.BLotPerOrdNum,
                  '---Calculated BLotPerOrdNum from aggregated---': {
                    calculated_from_NewBuyerOrdNum: bumiRow.BLot && bumiRow.NewBuyerOrdNum ? bumiRow.BLot / bumiRow.NewBuyerOrdNum : null,
                    calculated_from_BOrdNum: bumiRow.BLot && bumiRow.BOrdNum ? bumiRow.BLot / bumiRow.BOrdNum : null,
                  },
                  SCode: bumiRow.SCode,
                  SLot: bumiRow.SLot,
                  SVal: bumiRow.SellerValue,
                  SAvg: bumiRow.SellerAvg,
                  SFreq: bumiRow.SFreq,
                  SLotPerFreq: bumiRow.SLotPerFreq,
                  SOrdNum: bumiRow.SOrdNum,
                  NewSellerOrdNum: bumiRow.NewSellerOrdNum,
                  SLotPerOrdNum: bumiRow.SLotPerOrdNum,
                  '---Calculated SLotPerOrdNum from aggregated---': {
                    calculated_from_NewSellerOrdNum: bumiRow.SLot && bumiRow.NewSellerOrdNum ? bumiRow.SLot / bumiRow.NewSellerOrdNum : null,
                    calculated_from_SOrdNum: bumiRow.SLot && bumiRow.SOrdNum ? bumiRow.SLot / bumiRow.SOrdNum : null,
                  },
                },
              });
            }
          }
          
          // FIXED: Store raw data (before filtering) for availableTickers extraction
          // This ensures dropdown always shows all available tickers for selected broker(s)
          const rawRows = [...allRows]; // Copy before filtering
          
          // CRITICAL: Filter logic priority:
          // 1. If selectedTickers is provided (even if sector is selected), filter by ticker
          // 2. If selectedSectors is provided (and no ticker), filter by sector
          // 3. If both empty, show all
          
          if (selectedTickers.length > 0) {
            // Priority 1: Filter by ticker (even if sector is selected)
            allRows = allRows.filter(row => {
              // Check if row matches any selected ticker in any section (BCode, SCode, NBCode, NSCode)
              const bCode = row.BCode || '';
              const sCode = row.SCode || '';
              const nbCode = row.NBCode || '';
              const nsCode = row.NSCode || '';
              const emiten = row.Emiten || '';
              
              return selectedTickers.includes(bCode) || 
                     selectedTickers.includes(sCode) || 
                     selectedTickers.includes(nbCode) || 
                     selectedTickers.includes(nsCode) ||
                     selectedTickers.includes(emiten);
            });
          } else if (selectedSectors.length > 0) {
            // Priority 2: Filter by sector (only if no ticker selected)
            allRows = allRows.filter(row => {
              // Check if any stock code in row belongs to selected sectors
              const bCode = row.BCode || '';
              const sCode = row.SCode || '';
              const nbCode = row.NBCode || '';
              const nsCode = row.NSCode || '';
              
              const bCodeSector = bCode ? stockToSectorMap[bCode.toUpperCase()] : null;
              const sCodeSector = sCode ? stockToSectorMap[sCode.toUpperCase()] : null;
              const nbCodeSector = nbCode ? stockToSectorMap[nbCode.toUpperCase()] : null;
              const nsCodeSector = nsCode ? stockToSectorMap[nsCode.toUpperCase()] : null;
              
              return (bCodeSector && selectedSectors.includes(bCodeSector)) ||
                     (sCodeSector && selectedSectors.includes(sCodeSector)) ||
                     (nbCodeSector && selectedSectors.includes(nbCodeSector)) ||
                     (nsCodeSector && selectedSectors.includes(nsCodeSector));
            });
          }
          
          // Store raw data (before filtering) for availableTickers
          newRawTransactionData.set(date, rawRows);
          // Store filtered data for display
          newTransactionData.set(date, allRows);
        }
        
        // CRITICAL: Check ref again before setting data - user might have changed dates during aggregation
        if (!shouldFetchDataRef.current || abortController.signal.aborted) {
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }
        
        // Store data first (but tables won't show yet because isDataReady is still false)
        // FIXED: Store both raw data (for availableTickers) and filtered data (for display)
        setRawTransactionData(newRawTransactionData);
        setTransactionData(newTransactionData);
        
        // CRITICAL: Reset column width sync flag when new data is loaded
        // This ensures sync happens for new data (not just first time)
        hasSyncedColumnWidthsRef.current = false;
        columnWidthsRef.current = [];
        
        // CRITICAL: Final check before marking data ready
        if (!shouldFetchDataRef.current || abortController.signal.aborted) {
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }
        
        // Mark loading as complete and show data immediately
        setIsLoading(false);
        
        // OPTIMIZED: Show data immediately after state update
        // Column width sync will happen after data is visible (non-blocking)
        // CRITICAL: Update both transactionData and rawTransactionData
        setTransactionData(newTransactionData);
        setRawTransactionData(newRawTransactionData);
        
        // Update last fetch params after successful fetch
        lastFetchParamsRef.current = {
          brokers: [...selectedBrokers],
          dates: [...selectedDates],
          pivot: pivotFilter, // Track pivotFilter
          inv: invFilter || '', // Track invFilter
          board: boardFilter || '', // Track boardFilter
          tickers: [...selectedTickers], // Track selectedTickers
          sectors: [...selectedSectors] // Track selectedSectors
        };
        
          setIsDataReady(true);
          setShouldFetchData(false);
        shouldFetchDataRef.current = false;
        
        // Clear abort controller after successful fetch
        abortControllerRef.current = null;
      } catch (err: any) {
        // If aborted, don't show error - just reset state
        // Check abortControllerRef.current instead of local abortController (which might be stale)
        const wasAborted = abortControllerRef.current?.signal.aborted || err?.message === 'Fetch aborted' || !shouldFetchDataRef.current;
        if (wasAborted) {
          setIsLoading(false);
          setIsDataReady(false);
          setShouldFetchData(false);
          shouldFetchDataRef.current = false;
          abortControllerRef.current = null;
          return;
        }
        console.error('[BrokerTransaction] Error loading transaction data:', err);
        setError(err?.message || 'Failed to load transaction data');
        setIsLoading(false);
        setIsDataReady(false);
        setShouldFetchData(false);
        shouldFetchDataRef.current = false;
        abortControllerRef.current = null;
      }
    };

    loadTransactionData();
    
    // Cleanup: abort fetch if component unmounts or effect re-runs
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
    // CRITICAL: Only depend on shouldFetchData - selectedBrokers, selectedDates, marketFilter, sectorFilter are already accessed inside
    // This prevents auto-fetch when dates/brokers/filters change - only fetch when Show button is clicked
    // sectorFilter and marketFilter are accessed inside the function, but should NOT trigger auto-fetch
  }, [shouldFetchData]);

  // CRITICAL: REMOVED useEffect that updates selectedDates when startDate/endDate changes
  // selectedDates will ONLY be updated when user clicks Show button
  // This ensures NO side effects when user changes date input - table and data remain unchanged

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Helper function to trigger date picker
  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: string | undefined) => {
    return date || ''; // Already in YYYY-MM-DD format
  };

  // Font size fixed to normal
  const getFontSizeClass = () => 'text-[13px]';

  // Handle broker selection
  const handleBrokerSelect = (broker: string) => {
    if (!selectedBrokers.includes(broker)) {
      setSelectedBrokers([...selectedBrokers, broker]);
      // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
      // User must click Show button to fetch new data
    }
    setBrokerInput('');
    setShowBrokerSuggestions(false);
  };

  // Handle broker removal
  const handleRemoveBroker = (broker: string) => {
    setSelectedBrokers(selectedBrokers.filter(b => b !== broker));
    // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
    // User must click Show button to fetch new data
  };

  // Handle ticker selection
  const handleTickerSelect = (ticker: string) => {
    if (!selectedTickers.includes(ticker)) {
      setSelectedTickers([...selectedTickers, ticker]);
      // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
      // User must click Show button to fetch new data
    }
    setTickerInput('');
    setShowTickerSuggestions(false);
  };

  // Handle ticker removal
  const handleRemoveTicker = (ticker: string) => {
    setSelectedTickers(selectedTickers.filter(t => t !== ticker));
    // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
    // User must click Show button to fetch new data
  };

  // Handle sector selection (from combined dropdown)
  const handleSectorSelect = (sector: string) => {
    if (!selectedSectors.includes(sector)) {
      setSelectedSectors([...selectedSectors, sector]);
      // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
      // User must click Show button to fetch new data
    }
    setTickerInput('');
    setShowTickerSuggestions(false);
  };

  // Handle sector removal
  const handleRemoveSector = (sector: string) => {
    setSelectedSectors(selectedSectors.filter(s => s !== sector));
    // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
    // User must click Show button to fetch new data
    // When sector is removed, clear selectedTickers to return to normal state
    // This ensures dropdown shows all tickers again
    if (selectedSectors.length === 1) {
      // If this is the last sector being removed, clear tickers
      setSelectedTickers([]);
    }
  };

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownBrokerRef.current && !dropdownBrokerRef.current.contains(event.target as Node)) {
        setShowBrokerSuggestions(false);
      }
      if (dropdownTickerRef.current && !dropdownTickerRef.current.contains(event.target as Node)) {
        setShowTickerSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // OPTIMIZED: Sync table widths between Value and Net tables - Simplified and more efficient
  useEffect(() => {
    // Wait for tables to be ready (data loaded and DOM rendered)
    if (isLoading || !isDataReady) return;
    
    // FIXED: Flag to prevent infinite loop from ResizeObserver
    let isSyncing = false;

    const syncTableWidths = () => {
      // GUARD: Prevent recursive calls
      if (isSyncing) return;
      
      const valueContainer = valueTableContainerRef.current;
      const netContainer = netTableContainerRef.current;
      const valueTable = valueTableRef.current;
      const netTable = netTableRef.current;

      if (!valueContainer || !netContainer || !valueTable || !netTable) return;
      
      // Set flag to prevent recursive calls
      isSyncing = true;

      // Step 1: Sync container widths first - ensure both use full available width
      // Get the actual available width from parent container
      const valueParentWrapper = valueContainer.parentElement;
      const netParentWrapper = netContainer.parentElement;
      const valueTableWrapper = valueParentWrapper?.parentElement;
      const netTableWrapper = netParentWrapper?.parentElement;
      
      // Ensure all wrappers use full width
      if (valueParentWrapper && netParentWrapper) {
        valueParentWrapper.style.width = '100%';
        valueParentWrapper.style.minWidth = '100%';
        valueParentWrapper.style.maxWidth = '100%';
        netParentWrapper.style.width = '100%';
        netParentWrapper.style.minWidth = '100%';
        netParentWrapper.style.maxWidth = '100%';
      }
      
      if (valueTableWrapper && netTableWrapper) {
        valueTableWrapper.style.width = '100%';
        valueTableWrapper.style.minWidth = '100%';
        valueTableWrapper.style.maxWidth = '100%';
        netTableWrapper.style.width = '100%';
        netTableWrapper.style.minWidth = '100%';
        netTableWrapper.style.maxWidth = '100%';
      }
      
      // Sync container widths - use full width
      valueContainer.style.width = '100%';
      valueContainer.style.minWidth = '100%';
      valueContainer.style.maxWidth = '100%';
      netContainer.style.width = '100%';
      netContainer.style.minWidth = '100%';
      netContainer.style.maxWidth = '100%';
      
      // Sync widths between containers to ensure they match
      const valueContainerWidth = valueContainer.offsetWidth || valueContainer.clientWidth;
      if (valueContainerWidth > 0) {
        netContainer.style.width = `${valueContainerWidth}px`;
        netContainer.style.minWidth = `${valueContainerWidth}px`;
        
        // CRITICAL: Sync parent wrappers to ensure same width (fixes width mismatch between tables)
        // Parent wrapper is the div with "w-full max-w-full" that wraps the container
        if (valueParentWrapper && netParentWrapper) {
          const valueParentWidth = valueParentWrapper.offsetWidth || valueParentWrapper.clientWidth;
          if (valueParentWidth > 0) {
            netParentWrapper.style.width = `${valueParentWidth}px`;
            netParentWrapper.style.minWidth = `${valueParentWidth}px`;
            netParentWrapper.style.maxWidth = `${valueParentWidth}px`;
          }
        }
        
        // CRITICAL: Sync main wrappers to ensure same width (fixes width mismatch between tables)
        // Main wrapper is the outermost div with "w-full max-w-full mt-1"
        if (valueTableWrapper && netTableWrapper) {
          const valueMainWidth = valueTableWrapper.offsetWidth || valueTableWrapper.clientWidth;
          if (valueMainWidth > 0) {
            netTableWrapper.style.width = `${valueMainWidth}px`;
            netTableWrapper.style.minWidth = `${valueMainWidth}px`;
            netTableWrapper.style.maxWidth = `${valueMainWidth}px`;
          }
        }
      }

      // Step 2: Let VALUE table calculate column widths naturally with auto layout first
      valueTable.style.tableLayout = 'auto';
      netTable.style.tableLayout = 'auto';
      
      // Force a reflow to ensure layout is stable before measuring
      void valueTable.offsetWidth;
      void netTable.offsetWidth;
      
      // Step 3: Measure column widths from VALUE table after it stabilizes
      const valueHeaderRows = valueTable.querySelectorAll('thead tr');
      const netHeaderRows = netTable.querySelectorAll('thead tr');
      
      if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
        const valueColumnHeaderRow = valueHeaderRows[1];
        const netColumnHeaderRow = netHeaderRows[1];

        if (valueColumnHeaderRow && netColumnHeaderRow) {
          const valueHeaderCells = Array.from(valueColumnHeaderRow.querySelectorAll('th'));
          const netHeaderCells = Array.from(netColumnHeaderRow.querySelectorAll('th'));
          const valueBodyRows = valueTable.querySelectorAll('tbody tr');

          // Ensure both tables have same number of columns
          if (valueHeaderCells.length === netHeaderCells.length) {
            // Calculate column widths from VALUE table
          const columnWidths: number[] = [];

          valueHeaderCells.forEach((valueCell, index) => {
            const valueEl = valueCell as HTMLElement;
              
              // CRITICAL: For accurate measurement, prioritize body cells over header cells
              // Body cells have actual data and more accurate widths, especially for first column
              let maxWidth = 0;
              let minWidth = Infinity;
              let widthsWithBorder: number[] = [];
              let widthsWithoutBorder: number[] = [];
              
              // First, measure from body cells (more accurate, especially for first column with border-l-2)
              valueBodyRows.forEach((row) => {
              const cells = row.querySelectorAll('td');
              if (cells[index]) {
                const cellEl = cells[index] as HTMLElement;
                  // Use getBoundingClientRect().width for more accurate measurement
                  // This gives the actual rendered width including all borders and padding
                  const cellRect = cellEl.getBoundingClientRect();
                  const cellWidth = cellRect.width;
                maxWidth = Math.max(maxWidth, cellWidth);
                  minWidth = Math.min(minWidth, cellWidth);
                  
                  // For first column, check if this cell has border-l-2
                  if (index === 0) {
                    const computedStyle = window.getComputedStyle(cellEl);
                    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
                    if (borderLeft >= 2) {
                      widthsWithBorder.push(cellWidth);
                    } else {
                      widthsWithoutBorder.push(cellWidth);
                    }
                  }
                }
              });
              
              // If no body cells found, fallback to header cell
              if (maxWidth === 0) {
                const headerRect = valueEl.getBoundingClientRect();
                maxWidth = headerRect.width;
              } else {
                // Ensure header cell matches the body cell width
                // This is especially important for first column with border-l-2
                const headerRect = valueEl.getBoundingClientRect();
                // Use the larger of body width or header width to ensure consistency
                maxWidth = Math.max(maxWidth, headerRect.width);
              }
              
              // CRITICAL: For first column (index 0), use the width from cells WITH border-l-2
              // This ensures consistent width and eliminates the "space kosong" issue
              if (index === 0 && widthsWithBorder.length > 0) {
                // Use the average width of cells with border-l-2 (more accurate)
                const avgWidthWithBorder = widthsWithBorder.reduce((sum, w) => sum + w, 0) / widthsWithBorder.length;
                maxWidth = avgWidthWithBorder;
              } else if (index === 0 && widthsWithoutBorder.length > 0 && widthsWithBorder.length === 0) {
                // If no cells with border found, use cells without border and add border width
                const avgWidthWithoutBorder = widthsWithoutBorder.reduce((sum, w) => sum + w, 0) / widthsWithoutBorder.length;
                const computedStyle = window.getComputedStyle(valueEl);
                const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
                maxWidth = avgWidthWithoutBorder + borderLeft;
            }

            columnWidths[index] = maxWidth;
          });

            // Store column widths in ref for later use
            columnWidthsRef.current = columnWidths;
            
            // Step 4: Apply fixed layout and sync widths to both tables
            // CRITICAL: Set fixed layout FIRST before applying widths
          valueTable.style.tableLayout = 'fixed';
          netTable.style.tableLayout = 'fixed';

            // Force a reflow after setting fixed layout
            void valueTable.offsetWidth;
            void netTable.offsetWidth;
            
            // Apply widths to VALUE table headers (lock widths to prevent reflow changes)
          valueHeaderCells.forEach((valueCell, index) => {
            const valueEl = valueCell as HTMLElement;
            const width = columnWidths[index];
            // CRITICAL: Skip width sync for first column of first date (index % 17 === 0 and has border-l-2)
            // This column should use auto width to fit content
            const isFirstColOfDateGroup = index % 17 === 0;
            const hasBorderLeft2 = valueEl.classList.contains('border-l-2') || 
                                   window.getComputedStyle(valueEl).borderLeftWidth === '2px' ||
                                   valueEl.style.borderLeftWidth === '2px';
            
            if (width && width > 0 && !(isFirstColOfDateGroup && hasBorderLeft2 && index === 0)) {
                // Lock width with all three properties to prevent browser from changing it
              valueEl.style.width = `${width}px`;
              valueEl.style.minWidth = `${width}px`;
              valueEl.style.maxWidth = `${width}px`;
                // Also set box-sizing to ensure border is included correctly
              valueEl.style.boxSizing = 'border-box';
            } else if (isFirstColOfDateGroup && hasBorderLeft2 && index === 0) {
              // For first column of first date, ensure auto width is maintained
              valueEl.style.width = 'auto';
              valueEl.style.minWidth = 'fit-content';
              valueEl.style.maxWidth = 'none';
            }
          });

            // Apply same widths to NET table headers (to match VALUE table)
          netHeaderCells.forEach((netCell, index) => {
            const netEl = netCell as HTMLElement;
            const width = columnWidths[index];
            // CRITICAL: Skip width sync for first column of first date (index % 17 === 0 and has border-l-2)
            // This column should use auto width to fit content
            const isFirstColOfDateGroup = index % 17 === 0;
            const hasBorderLeft2 = netEl.classList.contains('border-l-2') || 
                                   window.getComputedStyle(netEl).borderLeftWidth === '2px' ||
                                   netEl.style.borderLeftWidth === '2px';
            
            if (width && width > 0 && !(isFirstColOfDateGroup && hasBorderLeft2 && index === 0)) {
                // Lock width with all three properties to prevent browser from changing it
              netEl.style.width = `${width}px`;
              netEl.style.minWidth = `${width}px`;
              netEl.style.maxWidth = `${width}px`;
                // Also set box-sizing to ensure border is included correctly
              netEl.style.boxSizing = 'border-box';
            } else if (isFirstColOfDateGroup && hasBorderLeft2 && index === 0) {
              // For first column of first date, ensure auto width is maintained
              netEl.style.width = 'auto';
              netEl.style.minWidth = 'fit-content';
              netEl.style.maxWidth = 'none';
            }
          });

            // Apply widths to body cells in both tables (lock to prevent reflow changes)
          const netBodyRows = netTable.querySelectorAll('tbody tr');
            
            valueBodyRows.forEach((row) => {
              const cells = row.querySelectorAll('td');
              cells.forEach((cell, index) => {
                const cellEl = cell as HTMLElement;
                const width = columnWidths[index];
                // CRITICAL: Skip width sync for first column of first date (index === 0 and has border-l-2)
                // This column should use auto width to fit content
                const isFirstColOfDateGroup = index % 17 === 0;
                const hasBorderLeft2 = cellEl.classList.contains('border-l-2') || 
                                       window.getComputedStyle(cellEl).borderLeftWidth === '2px' ||
                                       cellEl.style.borderLeftWidth === '2px';
                
                if (width && width > 0 && !(isFirstColOfDateGroup && hasBorderLeft2 && index === 0)) {
                  // Lock width to prevent browser from changing it during reflow
                  cellEl.style.width = `${width}px`;
                  cellEl.style.minWidth = `${width}px`;
                  cellEl.style.maxWidth = `${width}px`;
                  cellEl.style.boxSizing = 'border-box';
                } else if (isFirstColOfDateGroup && hasBorderLeft2 && index === 0) {
                  // For first column of first date, ensure auto width is maintained
                  cellEl.style.width = 'auto';
                  cellEl.style.minWidth = 'fit-content';
                  cellEl.style.maxWidth = 'none';
                }
              });
            });
            
            netBodyRows.forEach((row) => {
              const cells = row.querySelectorAll('td');
              cells.forEach((cell, index) => {
                const cellEl = cell as HTMLElement;
                const width = columnWidths[index];
                // CRITICAL: Skip width sync for first column of first date (index === 0 and has border-l-2)
                // This column should use auto width to fit content
                const isFirstColOfDateGroup = index % 17 === 0;
                const hasBorderLeft2 = cellEl.classList.contains('border-l-2') || 
                                       window.getComputedStyle(cellEl).borderLeftWidth === '2px' ||
                                       cellEl.style.borderLeftWidth === '2px';
                
                if (width && width > 0 && !(isFirstColOfDateGroup && hasBorderLeft2 && index === 0)) {
                  // Lock width to prevent browser from changing it during reflow
                  cellEl.style.width = `${width}px`;
                  cellEl.style.minWidth = `${width}px`;
                  cellEl.style.maxWidth = `${width}px`;
                  cellEl.style.boxSizing = 'border-box';
                } else if (isFirstColOfDateGroup && hasBorderLeft2 && index === 0) {
                  // For first column of first date, ensure auto width is maintained
                  cellEl.style.width = 'auto';
                  cellEl.style.minWidth = 'fit-content';
                  cellEl.style.maxWidth = 'none';
                }
              });
            });
            
            // Force a final reflow to ensure all widths are applied and locked
            void valueTable.offsetWidth;
            void netTable.offsetWidth;
            
            // CRITICAL: Re-apply fixed layout after setting widths to ensure it sticks
            // This prevents React re-render from overriding the layout
            valueTable.style.tableLayout = 'fixed';
            netTable.style.tableLayout = 'fixed';
          }
        }
      }
      
      // Reset flag after sync completes
      isSyncing = false;
    };

    // CRITICAL: Reset sync flag when data changes or when loading starts
    // This ensures sync happens every time new data is loaded (not just first time)
    if (transactionData.size === 0 || isLoading) {
      hasSyncedColumnWidthsRef.current = false;
      columnWidthsRef.current = [];
    }
    
    // FIXED: Sync container widths once when data is ready
    // This ensures tables align without breaking column rendering
    // CRITICAL: Only sync once per data load, not when visibleRowCount changes (lazy loading)
    // IMPORTANT: Sync every time data is ready (not just first time) to handle data changes
    if (isDataReady && visibleRowCount > 0 && maxRows > 0 && !hasSyncedColumnWidthsRef.current) {
      // Use multiple RAF + timeout to ensure DOM is fully ready and all styles are applied
      // This is critical for accurate column width measurement, especially for first column with border-l-2
      let rafId1: number | null = null;
      let rafId2: number | null = null;
      let rafId3: number | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      
      let doubleCheckTimeoutId: NodeJS.Timeout | null = null;
      
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          rafId3 = requestAnimationFrame(() => {
            timeoutId = setTimeout(() => {
              // Double check ref hasn't changed (prevent race condition)
              if (!hasSyncedColumnWidthsRef.current) {
                syncTableWidths(); // Sync container widths and column widths
                hasSyncedColumnWidthsRef.current = true;
                
                // CRITICAL: Double-check and re-apply after a short delay to ensure widths stick
                // This prevents browser from changing widths during subsequent reflows
                doubleCheckTimeoutId = setTimeout(() => {
                  const valueTable = valueTableRef.current;
                  const netTable = netTableRef.current;
                  if (valueTable && netTable && columnWidthsRef.current.length > 0) {
                    // Ensure fixed layout is still set
                    valueTable.style.tableLayout = 'fixed';
                    netTable.style.tableLayout = 'fixed';
                    
                    // Re-apply widths to ensure they stick
                    const valueHeaderRows = valueTable.querySelectorAll('thead tr');
                    const netHeaderRows = netTable.querySelectorAll('thead tr');
                    if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
        const valueColumnHeaderRow = valueHeaderRows[1];
        const netColumnHeaderRow = netHeaderRows[1];
        if (valueColumnHeaderRow && netColumnHeaderRow) {
                        const valueHeaderCells = Array.from(valueColumnHeaderRow.querySelectorAll('th'));
                        const netHeaderCells = Array.from(netColumnHeaderRow.querySelectorAll('th'));
                        const columnWidths = columnWidthsRef.current;
                        
                        valueHeaderCells.forEach((cell, index) => {
                          const el = cell as HTMLElement;
                          const width = columnWidths[index];
                          // CRITICAL: Skip width sync for first column of first date (index % 17 === 0 and has border-l-2)
                          const isFirstColOfDateGroup = index % 17 === 0;
                          const hasBorderLeft2 = el.classList.contains('border-l-2') || 
                                                 window.getComputedStyle(el).borderLeftWidth === '2px' ||
                                                 el.style.borderLeftWidth === '2px';
                          
                          if (width && width > 0 && !(isFirstColOfDateGroup && hasBorderLeft2 && index === 0)) {
                            el.style.width = `${width}px`;
                            el.style.minWidth = `${width}px`;
                            el.style.maxWidth = `${width}px`;
                            el.style.boxSizing = 'border-box';
                          } else if (isFirstColOfDateGroup && hasBorderLeft2 && index === 0) {
                            // For first column of first date, ensure auto width is maintained
                            el.style.width = 'auto';
                            el.style.minWidth = 'fit-content';
                            el.style.maxWidth = 'none';
                          }
                        });
                        
                        netHeaderCells.forEach((cell, index) => {
                          const el = cell as HTMLElement;
                          const width = columnWidths[index];
                          // CRITICAL: Skip width sync for first column of first date (index % 17 === 0 and has border-l-2)
                          const isFirstColOfDateGroup = index % 17 === 0;
                          const hasBorderLeft2 = el.classList.contains('border-l-2') || 
                                                 window.getComputedStyle(el).borderLeftWidth === '2px' ||
                                                 el.style.borderLeftWidth === '2px';
                          
                          if (width && width > 0 && !(isFirstColOfDateGroup && hasBorderLeft2 && index === 0)) {
                            el.style.width = `${width}px`;
                            el.style.minWidth = `${width}px`;
                            el.style.maxWidth = `${width}px`;
                            el.style.boxSizing = 'border-box';
                          } else if (isFirstColOfDateGroup && hasBorderLeft2 && index === 0) {
                            // For first column of first date, ensure auto width is maintained
                            el.style.width = 'auto';
                            el.style.minWidth = 'fit-content';
                            el.style.maxWidth = 'none';
                          }
                        });
                      }
                    }
                  }
                }, 100); // Small delay to catch any reflows
              }
            }, 200); // Increased timeout to ensure all styles (including borders) are fully applied
          });
        });
      });
      
      return () => {
        if (rafId1 !== null) cancelAnimationFrame(rafId1);
        if (rafId2 !== null) cancelAnimationFrame(rafId2);
        if (rafId3 !== null) cancelAnimationFrame(rafId3);
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (doubleCheckTimeoutId !== null) clearTimeout(doubleCheckTimeoutId);
      };
    }
    
    // No cleanup needed if condition not met
    return undefined;
  }, [transactionData, isLoading, isDataReady]); // FIXED: Removed visibleRowCount - only sync when data changes, not when lazy loading adds more rows

  // CRITICAL: Maintain column widths after lazy loading adds new rows
  // This ensures widths don't change when visibleRowCount increases
  useEffect(() => {
    // Only maintain widths if sync has been done and we have data
    if (!hasSyncedColumnWidthsRef.current || !isDataReady || isLoading) return;
    
    const valueTable = valueTableRef.current;
    const netTable = netTableRef.current;
    
    if (!valueTable || !netTable) return;
    
    // Ensure fixed layout is maintained
    if (valueTable.style.tableLayout !== 'fixed') {
      valueTable.style.tableLayout = 'fixed';
    }
    if (netTable.style.tableLayout !== 'fixed') {
      netTable.style.tableLayout = 'fixed';
    }
    
    // Re-apply widths to new rows that were added by lazy loading
    // Get stored column widths from existing cells
    const valueHeaderRows = valueTable.querySelectorAll('thead tr');
    const netHeaderRows = netTable.querySelectorAll('thead tr');
    
    if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
      const valueColumnHeaderRow = valueHeaderRows[1];
      const netColumnHeaderRow = netHeaderRows[1];
      
      if (valueColumnHeaderRow && netColumnHeaderRow) {
        const valueHeaderCells = Array.from(valueColumnHeaderRow.querySelectorAll('th'));
        
        // Get widths from stored ref first, fallback to reading from DOM
        let columnWidths: number[] = [];
        if (columnWidthsRef.current.length > 0) {
          // Use stored widths from initial sync
          columnWidths = [...columnWidthsRef.current];
        } else {
          // Fallback: read from header cells
          valueHeaderCells.forEach((cell) => {
            const el = cell as HTMLElement;
            const width = parseFloat(el.style.width) || el.offsetWidth;
            columnWidths.push(width);
          });
        }
        
        // Apply widths to all body cells (including newly added ones from lazy loading)
        const valueBodyRows = valueTable.querySelectorAll('tbody tr');
        const netBodyRows = netTable.querySelectorAll('tbody tr');
        
        valueBodyRows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          cells.forEach((cell, index) => {
            const cellEl = cell as HTMLElement;
            const width = columnWidths[index];
            // CRITICAL: Skip width sync for first column of first date (index === 0 and has border-l-2)
            // This column should use auto width to fit content
            const isFirstColOfDateGroup = index % 17 === 0;
            const hasBorderLeft2 = cellEl.classList.contains('border-l-2') || 
                                   window.getComputedStyle(cellEl).borderLeftWidth === '2px' ||
                                   cellEl.style.borderLeftWidth === '2px';
            
            if (width && width > 0 && !(isFirstColOfDateGroup && hasBorderLeft2 && index === 0)) {
              cellEl.style.width = `${width}px`;
              cellEl.style.minWidth = `${width}px`;
              cellEl.style.maxWidth = `${width}px`;
              cellEl.style.boxSizing = 'border-box';
            } else if (isFirstColOfDateGroup && hasBorderLeft2 && index === 0) {
              // For first column of first date, ensure auto width is maintained
              cellEl.style.width = 'auto';
              cellEl.style.minWidth = 'fit-content';
              cellEl.style.maxWidth = 'none';
            }
          });
        });
        
        netBodyRows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          cells.forEach((cell, index) => {
            const cellEl = cell as HTMLElement;
            const width = columnWidths[index];
            // CRITICAL: Skip width sync for first column of first date (index === 0 and has border-l-2)
            // This column should use auto width to fit content
            const isFirstColOfDateGroup = index % 17 === 0;
            const hasBorderLeft2 = cellEl.classList.contains('border-l-2') || 
                                   window.getComputedStyle(cellEl).borderLeftWidth === '2px' ||
                                   cellEl.style.borderLeftWidth === '2px';
            
            if (width && width > 0 && !(isFirstColOfDateGroup && hasBorderLeft2 && index === 0)) {
              cellEl.style.width = `${width}px`;
              cellEl.style.minWidth = `${width}px`;
              cellEl.style.maxWidth = `${width}px`;
              cellEl.style.boxSizing = 'border-box';
            } else if (isFirstColOfDateGroup && hasBorderLeft2 && index === 0) {
              // For first column of first date, ensure auto width is maintained
              cellEl.style.width = 'auto';
              cellEl.style.minWidth = 'fit-content';
              cellEl.style.maxWidth = 'none';
            }
          });
        });
      }
    }
  }, [visibleRowCount, isDataReady, isLoading]); // Re-apply widths when lazy loading adds rows

  // CRITICAL: Sync container widths on window resize to ensure full width
  useEffect(() => {
    if (isLoading || !isDataReady) return;

    const syncContainerWidths = () => {
      const valueContainer = valueTableContainerRef.current;
      const netContainer = netTableContainerRef.current;
      
      if (!valueContainer || !netContainer) return;
      
      // Get all parent wrappers to ensure full width
      const valueParentWrapper = valueContainer.parentElement;
      const netParentWrapper = netContainer.parentElement;
      const valueTableWrapper = valueParentWrapper?.parentElement;
      const netTableWrapper = netParentWrapper?.parentElement;
      
      // Ensure all wrappers use full width
      if (valueParentWrapper && netParentWrapper) {
        valueParentWrapper.style.width = '100%';
        valueParentWrapper.style.minWidth = '100%';
        valueParentWrapper.style.maxWidth = '100%';
        netParentWrapper.style.width = '100%';
        netParentWrapper.style.minWidth = '100%';
        netParentWrapper.style.maxWidth = '100%';
      }
      
      if (valueTableWrapper && netTableWrapper) {
        valueTableWrapper.style.width = '100%';
        valueTableWrapper.style.minWidth = '100%';
        valueTableWrapper.style.maxWidth = '100%';
        netTableWrapper.style.width = '100%';
        netTableWrapper.style.minWidth = '100%';
        netTableWrapper.style.maxWidth = '100%';
      }
      
      // Ensure both containers use full width
      valueContainer.style.width = '100%';
      valueContainer.style.minWidth = '100%';
      valueContainer.style.maxWidth = '100%';
      netContainer.style.width = '100%';
      netContainer.style.minWidth = '100%';
      netContainer.style.maxWidth = '100%';
      
      // Sync widths between containers to ensure they match
      const valueWidth = valueContainer.offsetWidth || valueContainer.clientWidth;
      if (valueWidth > 0) {
        netContainer.style.width = `${valueWidth}px`;
        netContainer.style.minWidth = `${valueWidth}px`;
        
        // CRITICAL: Sync parent wrappers to ensure same width (fixes width mismatch between tables)
        if (valueParentWrapper && netParentWrapper) {
          const valueParentWidth = valueParentWrapper.offsetWidth || valueParentWrapper.clientWidth;
          if (valueParentWidth > 0) {
            netParentWrapper.style.width = `${valueParentWidth}px`;
            netParentWrapper.style.minWidth = `${valueParentWidth}px`;
            netParentWrapper.style.maxWidth = `${valueParentWidth}px`;
          }
        }
        
        // CRITICAL: Sync main wrappers to ensure same width (fixes width mismatch between tables)
        if (valueTableWrapper && netTableWrapper) {
          const valueMainWidth = valueTableWrapper.offsetWidth || valueTableWrapper.clientWidth;
          if (valueMainWidth > 0) {
            netTableWrapper.style.width = `${valueMainWidth}px`;
            netTableWrapper.style.minWidth = `${valueMainWidth}px`;
            netTableWrapper.style.maxWidth = `${valueMainWidth}px`;
          }
        }
      }
    };
    
    // Sync on mount and window resize with debounce
    let timeoutId: NodeJS.Timeout | null = null;
    const debouncedSync = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        syncContainerWidths();
      }, 100);
    };
    
    syncContainerWidths();
    window.addEventListener('resize', debouncedSync);
      
    return () => {
      window.removeEventListener('resize', debouncedSync);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoading, isDataReady]);

  // Synchronize horizontal scroll between Value and Net tables
  // FIXED: Don't depend on selectedDates to prevent re-render on input change
  useEffect(() => {
    if (isLoading || !isDataReady) return;

    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;

    if (!valueContainer || !netContainer) return;

    // Flag to prevent infinite loop
    let isSyncing = false;

    // OPTIMIZED: Direct scroll sync without requestAnimationFrame (faster)
    // Handle Value table scroll - sync to Net table
    const handleValueScroll = () => {
      if (!isSyncing && netContainer) {
        isSyncing = true;
        netContainer.scrollLeft = valueContainer.scrollLeft;
        // Use setTimeout with 0ms instead of requestAnimationFrame for faster sync
        setTimeout(() => {
          isSyncing = false;
        }, 0);
      }
    };

    // Handle Net table scroll - sync to Value table
    const handleNetScroll = () => {
      if (!isSyncing && valueContainer) {
        isSyncing = true;
        valueContainer.scrollLeft = netContainer.scrollLeft;
        // Use setTimeout with 0ms instead of requestAnimationFrame for faster sync
        setTimeout(() => {
          isSyncing = false;
        }, 0);
      }
    };

    // Add event listeners
    valueContainer.addEventListener('scroll', handleValueScroll, { passive: true });
    netContainer.addEventListener('scroll', handleNetScroll, { passive: true });

    return () => {
      valueContainer.removeEventListener('scroll', handleValueScroll);
      netContainer.removeEventListener('scroll', handleNetScroll);
    };
  }, [isLoading, isDataReady, transactionData]); // FIXED: Removed selectedDates dependency to prevent re-render on input change

  // Memoize expensive calculations
  const { uniqueStocks, filteredStocks, sortedStocksByDate, sortedNetStocksByDate, totalDataByStock, totalNetDataByStock, sortedTotalStocks, sortedTotalNetStocks, buyStocksByDate, sellStocksByDate, netBuyStocksByDate, netSellStocksByDate, totalBuyDataByStock, totalSellDataByStock, totalNetBuyDataByStock, totalNetSellDataByStock } = useMemo<{
    uniqueStocks: string[];
    filteredStocks: string[];
    sortedStocksByDate: Map<string, string[]>;
    sortedNetStocksByDate: Map<string, string[]>;
    totalDataByStock: Map<string, {
      buyerVol: number;
      buyerValue: number;
      buyerAvg: number;
      buyerFreq: number;
      buyerOrdNum: number;
      sellerVol: number;
      sellerValue: number;
      sellerAvg: number;
      sellerFreq: number;
      sellerOrdNum: number;
      buyerAvgCount: number;
      sellerAvgCount: number;
    }>;
    totalNetDataByStock: Map<string, {
      netBuyVol: number;
      netBuyValue: number;
      netBuyAvg: number;
      netBuyFreq: number;
      netBuyOrdNum: number;
      netSellVol: number;
      netSellValue: number;
      netSellAvg: number;
      netSellFreq: number;
      netSellOrdNum: number;
      netBuyAvgCount: number;
      netSellAvgCount: number;
    }>;
    sortedTotalStocks: string[];
    sortedTotalNetStocks: string[];
    buyStocksByDate: Map<string, Array<{ stock: string; data: BrokerTransactionData }>>;
    sellStocksByDate: Map<string, Array<{ stock: string; data: BrokerTransactionData }>>;
    netBuyStocksByDate: Map<string, Array<{ stock: string; data: BrokerTransactionData }>>;
    netSellStocksByDate: Map<string, Array<{ stock: string; data: BrokerTransactionData }>>;
    totalBuyDataByStock: Map<string, { buyerVol: number; buyerValue: number; buyerAvg: number; buyerFreq: number; buyerOrdNum: number; buyerLot: number; buyerLotPerFreq: number; buyerLotPerOrdNum: number; buyerAvgCount: number; }>;
    totalSellDataByStock: Map<string, { sellerVol: number; sellerValue: number; sellerAvg: number; sellerFreq: number; sellerOrdNum: number; sellerLot: number; sellerLotPerFreq: number; sellerLotPerOrdNum: number; sellerAvgCount: number; }>;
    totalNetBuyDataByStock: Map<string, { netBuyVol: number; netBuyValue: number; netBuyAvg: number; netBuyFreq: number; netBuyOrdNum: number; netBuyLot: number; netBuyLotPerFreq: number; netBuyLotPerOrdNum: number; netBuyAvgCount: number; }>;
    totalNetSellDataByStock: Map<string, { netSellVol: number; netSellValue: number; netSellAvg: number; netSellFreq: number; netSellOrdNum: number; netSellLot: number; netSellLotPerFreq: number; netSellLotPerOrdNum: number; netSellAvgCount: number; }>;
  }>(() => {
    // FIXED: Only check transactionData - don't depend on selectedBrokers/selectedDates to prevent re-calculation on input change
    if (transactionData.size === 0) {
      return {
        uniqueStocks: [],
        filteredStocks: [],
        sortedStocksByDate: new Map(),
        sortedNetStocksByDate: new Map(),
        totalDataByStock: new Map(),
        totalNetDataByStock: new Map(),
        sortedTotalStocks: [],
        sortedTotalNetStocks: [],
        buyStocksByDate: new Map(),
        sellStocksByDate: new Map(),
        netBuyStocksByDate: new Map(),
        netSellStocksByDate: new Map(),
        totalBuyDataByStock: new Map(),
        totalSellDataByStock: new Map(),
        totalNetBuyDataByStock: new Map(),
        totalNetSellDataByStock: new Map()
      };
    }
    
    // Treat 4 sections independently: Buy (BCode), Sell (SCode), Net Buy (NBCode), Net Sell (NSCode)
    // Each section filters and sorts separately
    // FIXED: Don't filter by selectedTickers here - filtering will be done at render time to prevent re-calculation on ticker change
    // FIXED: Use all dates from transactionData, not selectedDates (to prevent re-calculation on input change)
    const datesToProcess = Array.from(transactionData.keys());
    
    // CRITICAL: Don't filter by sector here - filter will be applied at render time
    // This prevents re-computation when sector filter changes
    // SECTION 1: Buy (BCode) - Filter and sort independently
    // Each row represents a separate entry in Value Buy section using BCode (column 1)
    const buyStocksByDate = new Map<string, Array<{ stock: string; data: BrokerTransactionData }>>();
    datesToProcess.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const buyData = dateData
        .filter(d => {
          // Filter out rows where BCode is empty
          const bCode = d.BCode || '';
          if (!bCode) return false;
          
          // FIXED: Don't filter by selectedTickers or sector here - will be filtered at render time
          
          return true;
        })
        .filter(d => {
          // Filter out rows where all Buy section values are 0
          // Use BLot directly from CSV (column 1), not calculated from BuyerVol
          const buyerLot = d.BLot !== undefined ? d.BLot : ((d.BuyerVol || 0) / 100);
          const buyerVal = d.BuyerValue || 0;
          const buyerFreq = d.BFreq || 0;
          const buyerOrdNum = d.BOrdNum || 0;
          return Math.abs(buyerLot) > 0 || Math.abs(buyerVal) > 0 || Math.abs(buyerFreq) > 0 || Math.abs(buyerOrdNum) > 0;
        })
        .sort((a, b) => (b.BuyerValue || 0) - (a.BuyerValue || 0))
        .map(d => ({ stock: d.BCode || '', data: d })); // Use BCode as stock identifier for this section
      buyStocksByDate.set(date, buyData);
    });
    
    // SECTION 2: Sell (SCode) - Filter and sort independently
    // Each row represents a separate entry in Value Sell section using SCode (column 9)
    const sellStocksByDate = new Map<string, Array<{ stock: string; data: BrokerTransactionData }>>();
    datesToProcess.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const sellData = dateData
        .filter(d => {
          // Filter out rows where SCode is empty
          const sCode = d.SCode || '';
          if (!sCode) return false;
          
          // FIXED: Don't filter by selectedTickers or sector here - will be filtered at render time
          
          return true;
        })
        .filter(d => {
          // Filter out rows where all Sell section values are 0
          // Use SLot directly from CSV (column 9), not calculated from SellerVol
          const sellerLot = d.SLot !== undefined ? d.SLot : ((d.SellerVol || 0) / 100);
          const sellerVal = d.SellerValue || 0;
          const sellerFreq = d.SFreq || 0;
          const sellerOrdNum = d.SOrdNum || 0;
          return Math.abs(sellerLot) > 0 || Math.abs(sellerVal) > 0 || Math.abs(sellerFreq) > 0 || Math.abs(sellerOrdNum) > 0;
        })
        .sort((a, b) => (b.SellerValue || 0) - (a.SellerValue || 0))
        .map(d => ({ stock: d.SCode || '', data: d })); // Use SCode as stock identifier for this section
      sellStocksByDate.set(date, sellData);
    });
    
    // SECTION 3: Net Buy (NBCode) - Filter and sort independently
    // Each row represents a separate entry in Net Buy section using NBCode (column 17)
    const netBuyStocksByDate = new Map<string, Array<{ stock: string; data: BrokerTransactionData }>>();
    datesToProcess.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const netBuyData = dateData
        .filter(d => {
          // Filter out rows where NBCode is empty
          const nbCode = d.NBCode || '';
          if (!nbCode) return false;
          
          // FIXED: Don't filter by selectedTickers or sector here - will be filtered at render time
          
          return true;
        })
        .filter(d => {
          // Filter out rows where NBLot is 0
          const nbLot = d.NBLot || 0;
          return Math.abs(nbLot) > 0;
        })
        .sort((a, b) => (b.NBVal || 0) - (a.NBVal || 0))
        .map(d => ({ stock: d.NBCode || '', data: d })); // Use NBCode as stock identifier for this section
      netBuyStocksByDate.set(date, netBuyData);
    });
    
    // SECTION 4: Net Sell (NSCode) - Filter and sort independently
    // Each row represents a separate entry in Net Sell section using NSCode (column 25)
    const netSellStocksByDate = new Map<string, Array<{ stock: string; data: BrokerTransactionData }>>();
    datesToProcess.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const netSellData = dateData
        .filter(d => {
          // Filter out rows where NSCode is empty
          const nsCode = d.NSCode || '';
          if (!nsCode) return false;
          
          // FIXED: Don't filter by selectedTickers or sector here - will be filtered at render time
          
          return true;
        })
        .filter(d => {
          // Filter out rows where NSLot is 0
          const nsLot = d.NSLot || 0;
          return Math.abs(nsLot) > 0;
        })
        .sort((a, b) => (b.NSVal || 0) - (a.NSVal || 0))
        .map(d => ({ stock: d.NSCode || '', data: d })); // Use NSCode as stock identifier for this section
      netSellStocksByDate.set(date, netSellData);
    });
    
    // Get all unique stocks for each section separately (for Total column)
    const allBuyStocks = new Set<string>();
    const allSellStocks = new Set<string>();
    const allNetBuyStocks = new Set<string>();
    const allNetSellStocks = new Set<string>();
    
    datesToProcess.forEach(date => {
      const dateData = transactionData.get(date) || [];
      dateData.forEach(item => {
        if (item.BCode) allBuyStocks.add(item.BCode);
        if (item.SCode) allSellStocks.add(item.SCode);
        if (item.NBCode) allNetBuyStocks.add(item.NBCode);
        if (item.NSCode) allNetSellStocks.add(item.NSCode);
      });
    });
    
    // For backward compatibility
    const uniqueStocks = Array.from(new Set([...allBuyStocks, ...allSellStocks, ...allNetBuyStocks, ...allNetSellStocks]));
    const filteredStocks = uniqueStocks;
    
    // For backward compatibility, create sortedStocksByDate and sortedNetStocksByDate
    const sortedStocksByDate = new Map<string, string[]>();
    datesToProcess.forEach(date => {
      const buyData = buyStocksByDate.get(date) || [];
      sortedStocksByDate.set(date, buyData.map(d => d.stock));
    });
    
    const sortedNetStocksByDate = new Map<string, string[]>();
    datesToProcess.forEach(date => {
      const sellData = sellStocksByDate.get(date) || [];
      sortedNetStocksByDate.set(date, sellData.map(d => d.stock));
    });
    
    // Calculate total data aggregated across all dates for each stock - for VALUE table
    // Aggregate per section separately: Buy section by BCode, Sell section by SCode
    const totalBuyDataByStock = new Map<string, {
        buyerVol: number;
        buyerValue: number;
        buyerAvg: number;
        buyerFreq: number;
        buyerOrdNum: number;
        buyerLot: number;
        buyerLotPerFreq: number;
        buyerLotPerOrdNum: number;
      buyerAvgCount: number;
        buyerLotPerFreqSum: number; // For weighted average calculation
        buyerLotPerFreqWeight: number; // For weighted average calculation
        buyerLotPerOrdNumSum: number; // For weighted average calculation
        buyerLotPerOrdNumWeight: number; // For weighted average calculation
    }>();
    
    const totalSellDataByStock = new Map<string, {
        sellerVol: number;
        sellerValue: number;
        sellerAvg: number;
        sellerFreq: number;
        sellerOrdNum: number;
        sellerLot: number;
        sellerLotPerFreq: number;
        sellerLotPerOrdNum: number;
        sellerAvgCount: number;
        sellerLotPerFreqSum: number; // For weighted average calculation
        sellerLotPerFreqWeight: number; // For weighted average calculation
        sellerLotPerOrdNumSum: number; // For weighted average calculation
        sellerLotPerOrdNumWeight: number; // For weighted average calculation
      }>();
      
      datesToProcess.forEach(date => {
        const dateData = transactionData.get(date) || [];
        dateData.forEach(dayData => {
        // Aggregate Buy section by BCode
        const buyStock = dayData.BCode || '';
        if (buyStock) {
          if (!totalBuyDataByStock.has(buyStock)) {
            totalBuyDataByStock.set(buyStock, {
              buyerVol: 0,
              buyerValue: 0,
              buyerAvg: 0,
              buyerFreq: 0,
              buyerOrdNum: 0,
              buyerLot: 0,
              buyerLotPerFreq: 0,
              buyerLotPerOrdNum: 0,
              buyerAvgCount: 0,
              buyerLotPerFreqSum: 0,
              buyerLotPerFreqWeight: 0,
              buyerLotPerOrdNumSum: 0,
              buyerLotPerOrdNumWeight: 0,
            });
          }
          const total = totalBuyDataByStock.get(buyStock)!;
          const dayFreq = Number(dayData.BFreq) || Number(dayData.TransactionCount) || 0;
          // Use NewBuyerOrdNum for aggregation, fallback to BOrdNum if not available
          const dayOrdNum = Number(dayData.NewBuyerOrdNum !== undefined ? dayData.NewBuyerOrdNum : dayData.BOrdNum) || 0;
          const dayLot = Number(dayData.BLot) || 0;
          // Use Lot/F and Lot/ON from CSV only - no manual calculation
          const dayLotPerFreq = dayData.BLotPerFreq;
          const dayLotPerOrdNum = dayData.BLotPerOrdNum;
          
          total.buyerVol += Number(dayData.BuyerVol) || 0;
          total.buyerValue += Number(dayData.BuyerValue) || 0;
          total.buyerFreq += dayFreq;
          total.buyerOrdNum += dayOrdNum; // This now uses NewBuyerOrdNum
          total.buyerLot += dayLot;
          
          // Weighted average for Lot/F and Lot/ON
          if (dayFreq > 0 && dayLotPerFreq !== undefined && dayLotPerFreq !== null) {
            total.buyerLotPerFreqSum += dayLotPerFreq * dayFreq;
            total.buyerLotPerFreqWeight += dayFreq;
          }
          if (dayOrdNum !== 0 && dayLotPerOrdNum !== undefined && dayLotPerOrdNum !== null) {
            total.buyerLotPerOrdNumSum += dayLotPerOrdNum * Math.abs(dayOrdNum);
            total.buyerLotPerOrdNumWeight += Math.abs(dayOrdNum);
          }
          
          if (dayData.BuyerAvg || (dayData.BuyerVol && dayData.BuyerVol > 0)) {
            total.buyerAvg += dayData.BuyerAvg || ((dayData.BuyerValue || 0) / (dayData.BuyerVol || 1));
            total.buyerAvgCount += 1;
          }
        }
        
        // Aggregate Sell section by SCode
        const sellStock = dayData.SCode || '';
        if (sellStock) {
          if (!totalSellDataByStock.has(sellStock)) {
            totalSellDataByStock.set(sellStock, {
              sellerVol: 0,
              sellerValue: 0,
              sellerAvg: 0,
              sellerFreq: 0,
              sellerOrdNum: 0,
              sellerLot: 0,
              sellerLotPerFreq: 0,
              sellerLotPerOrdNum: 0,
              sellerAvgCount: 0,
              sellerLotPerFreqSum: 0,
              sellerLotPerFreqWeight: 0,
              sellerLotPerOrdNumSum: 0,
              sellerLotPerOrdNumWeight: 0,
            });
          }
          const total = totalSellDataByStock.get(sellStock)!;
          const dayFreq = Number(dayData.SFreq) || Number(dayData.TransactionCount) || 0;
          // Use NewSellerOrdNum for aggregation, fallback to SOrdNum if not available
          const dayOrdNum = Number(dayData.NewSellerOrdNum !== undefined ? dayData.NewSellerOrdNum : dayData.SOrdNum) || 0;
          const dayLot = Number(dayData.SLot) || 0;
          // Use Lot/F and Lot/ON from CSV only - no manual calculation
          const dayLotPerFreq = dayData.SLotPerFreq;
          const dayLotPerOrdNum = dayData.SLotPerOrdNum;
          
          total.sellerVol += Number(dayData.SellerVol) || 0;
          total.sellerValue += Number(dayData.SellerValue) || 0;
          total.sellerFreq += dayFreq;
          total.sellerOrdNum += dayOrdNum; // This now uses NewSellerOrdNum
          total.sellerLot += dayLot;
          
          // Weighted average for Lot/F and Lot/ON
          if (dayFreq > 0 && dayLotPerFreq !== undefined && dayLotPerFreq !== null) {
            total.sellerLotPerFreqSum += dayLotPerFreq * dayFreq;
            total.sellerLotPerFreqWeight += dayFreq;
          }
          if (dayOrdNum !== 0 && dayLotPerOrdNum !== undefined && dayLotPerOrdNum !== null) {
            total.sellerLotPerOrdNumSum += dayLotPerOrdNum * Math.abs(dayOrdNum);
            total.sellerLotPerOrdNumWeight += Math.abs(dayOrdNum);
          }
          
          if (dayData.SellerAvg || (dayData.SellerVol && dayData.SellerVol > 0)) {
            total.sellerAvg += dayData.SellerAvg || ((dayData.SellerValue || 0) / (dayData.SellerVol || 1));
            total.sellerAvgCount += 1;
          }
        }
      });
    });
    
      // Calculate final averages and Lot/F, Lot/ON
    totalBuyDataByStock.forEach((total) => {
        total.buyerAvg = total.buyerAvgCount > 0 ? total.buyerAvg / total.buyerAvgCount : (total.buyerVol > 0 ? total.buyerValue / total.buyerVol : 0);
        total.buyerLotPerFreq = total.buyerLotPerFreqWeight > 0 ? total.buyerLotPerFreqSum / total.buyerLotPerFreqWeight : 0;
        total.buyerLotPerOrdNum = total.buyerLotPerOrdNumWeight > 0 ? total.buyerLotPerOrdNumSum / total.buyerLotPerOrdNumWeight : 0;
    });
    totalSellDataByStock.forEach((total) => {
        total.sellerAvg = total.sellerAvgCount > 0 ? total.sellerAvg / total.sellerAvgCount : (total.sellerVol > 0 ? total.sellerValue / total.sellerVol : 0);
        total.sellerLotPerFreq = total.sellerLotPerFreqWeight > 0 ? total.sellerLotPerFreqSum / total.sellerLotPerFreqWeight : 0;
        total.sellerLotPerOrdNum = total.sellerLotPerOrdNumWeight > 0 ? total.sellerLotPerOrdNumSum / total.sellerLotPerOrdNumWeight : 0;
      });
      
      // Sort stocks by total buyer value (highest to lowest) for Total column
    const sortedTotalBuyStocks = Array.from(totalBuyDataByStock.entries())
        .sort((a, b) => b[1].buyerValue - a[1].buyerValue)
        .map(([stock]) => stock);
    
    // For backward compatibility, create combined totalDataByStock
    const totalDataByStock = new Map<string, {
      buyerVol: number;
      buyerValue: number;
      buyerAvg: number;
      buyerFreq: number;
      buyerOrdNum: number;
      buyerLot: number;
      buyerLotPerFreq: number;
      buyerLotPerOrdNum: number;
      sellerVol: number;
      sellerValue: number;
      sellerAvg: number;
      sellerFreq: number;
      sellerOrdNum: number;
      sellerLot: number;
      sellerLotPerFreq: number;
      sellerLotPerOrdNum: number;
      buyerAvgCount: number;
      sellerAvgCount: number;
    }>();
    
    // Combine Buy and Sell data (for backward compatibility with rendering code)
    Array.from(totalBuyDataByStock.entries()).forEach(([stock, buyData]) => {
      totalDataByStock.set(stock, {
        buyerVol: buyData.buyerVol,
        buyerValue: buyData.buyerValue,
        buyerAvg: buyData.buyerAvg,
        buyerFreq: buyData.buyerFreq,
        buyerOrdNum: buyData.buyerOrdNum,
        buyerLot: buyData.buyerLot,
        buyerLotPerFreq: buyData.buyerLotPerFreq,
        buyerLotPerOrdNum: buyData.buyerLotPerOrdNum,
        sellerVol: 0,
        sellerValue: 0,
        sellerAvg: 0,
        sellerFreq: 0,
        sellerOrdNum: 0,
        sellerLot: 0,
        sellerLotPerFreq: 0,
        sellerLotPerOrdNum: 0,
        buyerAvgCount: buyData.buyerAvgCount,
        sellerAvgCount: 0,
      });
    });
    
    Array.from(totalSellDataByStock.entries()).forEach(([stock, sellData]) => {
      const existing = totalDataByStock.get(stock);
      if (existing) {
        existing.sellerVol = sellData.sellerVol;
        existing.sellerValue = sellData.sellerValue;
        existing.sellerAvg = sellData.sellerAvg;
        existing.sellerFreq = sellData.sellerFreq;
        existing.sellerOrdNum = sellData.sellerOrdNum;
        existing.sellerLot = sellData.sellerLot;
        existing.sellerLotPerFreq = sellData.sellerLotPerFreq;
        existing.sellerLotPerOrdNum = sellData.sellerLotPerOrdNum;
        existing.sellerAvgCount = sellData.sellerAvgCount;
      } else {
        totalDataByStock.set(stock, {
          buyerVol: 0,
          buyerValue: 0,
          buyerAvg: 0,
          buyerFreq: 0,
          buyerOrdNum: 0,
          buyerLot: 0,
          buyerLotPerFreq: 0,
          buyerLotPerOrdNum: 0,
          sellerVol: sellData.sellerVol,
          sellerValue: sellData.sellerValue,
          sellerAvg: sellData.sellerAvg,
          sellerFreq: sellData.sellerFreq,
          sellerOrdNum: sellData.sellerOrdNum,
          sellerLot: sellData.sellerLot,
          sellerLotPerFreq: sellData.sellerLotPerFreq,
          sellerLotPerOrdNum: sellData.sellerLotPerOrdNum,
          buyerAvgCount: 0,
          sellerAvgCount: sellData.sellerAvgCount,
        });
      }
    });
    
    const sortedTotalStocks = sortedTotalBuyStocks; // Use Buy stocks for backward compatibility
    
    // Calculate total Net data aggregated across all dates for each stock - for NET table
    // Aggregate per section separately: Net Buy section by NBCode, Net Sell section by NSCode
    const totalNetBuyDataByStock = new Map<string, {
      netBuyVol: number;
      netBuyValue: number;
      netBuyAvg: number;
      netBuyFreq: number;
      netBuyOrdNum: number;
      netBuyLot: number;
      netBuyLotPerFreq: number;
      netBuyLotPerOrdNum: number;
      netBuyAvgCount: number;
      netBuyLotPerFreqSum: number; // For weighted average calculation
      netBuyLotPerFreqWeight: number; // For weighted average calculation
      netBuyLotPerOrdNumSum: number; // For weighted average calculation
      netBuyLotPerOrdNumWeight: number; // For weighted average calculation
    }>();
    
    const totalNetSellDataByStock = new Map<string, {
      netSellVol: number;
      netSellValue: number;
      netSellAvg: number;
      netSellFreq: number;
      netSellOrdNum: number;
      netSellLot: number;
      netSellLotPerFreq: number;
      netSellLotPerOrdNum: number;
      netSellAvgCount: number;
      netSellLotPerFreqSum: number; // For weighted average calculation
      netSellLotPerFreqWeight: number; // For weighted average calculation
      netSellLotPerOrdNumSum: number; // For weighted average calculation
      netSellLotPerOrdNumWeight: number; // For weighted average calculation
    }>();
    
    datesToProcess.forEach(date => {
      const dateData = transactionData.get(date) || [];
      dateData.forEach(dayData => {
        // Aggregate Net Buy section by NBCode
        const netBuyStock = dayData.NBCode || '';
        if (netBuyStock) {
          if (!totalNetBuyDataByStock.has(netBuyStock)) {
            totalNetBuyDataByStock.set(netBuyStock, {
              netBuyVol: 0,
              netBuyValue: 0,
              netBuyAvg: 0,
              netBuyFreq: 0,
              netBuyOrdNum: 0,
              netBuyLot: 0,
              netBuyLotPerFreq: 0,
              netBuyLotPerOrdNum: 0,
              netBuyAvgCount: 0,
              netBuyLotPerFreqSum: 0,
              netBuyLotPerFreqWeight: 0,
              netBuyLotPerOrdNumSum: 0,
              netBuyLotPerOrdNumWeight: 0,
            });
          }
          const total = totalNetBuyDataByStock.get(netBuyStock)!;
          const nbVol = dayData.NetBuyVol || 0;
          const nbVal = dayData.NBVal || 0;
          const nbFreq = dayData.NBFreq || 0;
          const nbOrdNum = dayData.NBOrdNum || 0;
          const nbLot = Number(dayData.NBLot) || 0;
          // Use Lot/F and Lot/ON from CSV only - no manual calculation
          const nbLotPerFreq = dayData.NBLotPerFreq;
          const nbLotPerOrdNum = dayData.NBLotPerOrdNum;
          
          total.netBuyVol += nbVol;
          total.netBuyValue += nbVal;
          total.netBuyFreq += nbFreq;
          total.netBuyOrdNum += nbOrdNum;
          total.netBuyLot += nbLot;
          
          // Weighted average for Lot/F and Lot/ON (using absolute values for Net)
          if (nbFreq !== 0 && nbLotPerFreq !== undefined && nbLotPerFreq !== null) {
            total.netBuyLotPerFreqSum += nbLotPerFreq * Math.abs(nbFreq);
            total.netBuyLotPerFreqWeight += Math.abs(nbFreq);
          }
          if (nbOrdNum !== 0 && nbLotPerOrdNum !== undefined && nbLotPerOrdNum !== null) {
            total.netBuyLotPerOrdNumSum += nbLotPerOrdNum * Math.abs(nbOrdNum);
            total.netBuyLotPerOrdNumWeight += Math.abs(nbOrdNum);
          }
          
          if (nbVol > 0) {
            total.netBuyAvg += nbVal / nbVol;
            total.netBuyAvgCount += 1;
          }
        }
        
        // Aggregate Net Sell section by NSCode
        const netSellStock = dayData.NSCode || '';
        if (netSellStock) {
          if (!totalNetSellDataByStock.has(netSellStock)) {
            totalNetSellDataByStock.set(netSellStock, {
              netSellVol: 0,
              netSellValue: 0,
              netSellAvg: 0,
              netSellFreq: 0,
              netSellOrdNum: 0,
              netSellLot: 0,
              netSellLotPerFreq: 0,
              netSellLotPerOrdNum: 0,
              netSellAvgCount: 0,
              netSellLotPerFreqSum: 0,
              netSellLotPerFreqWeight: 0,
              netSellLotPerOrdNumSum: 0,
              netSellLotPerOrdNumWeight: 0,
            });
          }
          const total = totalNetSellDataByStock.get(netSellStock)!;
          const nsVol = dayData.NetSellVol || 0;
          const nsVal = dayData.NSVal || 0;
          const nsFreq = dayData.NSFreq || 0;
          const nsOrdNum = dayData.NSOrdNum || 0;
          const nsLot = Number(dayData.NSLot) || 0;
          // Use Lot/F and Lot/ON from CSV only - no manual calculation
          const nsLotPerFreq = dayData.NSLotPerFreq;
          const nsLotPerOrdNum = dayData.NSLotPerOrdNum;
          
          total.netSellVol += nsVol;
          total.netSellValue += nsVal;
          total.netSellFreq += nsFreq;
          total.netSellOrdNum += nsOrdNum;
          total.netSellLot += nsLot;
          
          // Weighted average for Lot/F and Lot/ON (using absolute values for Net)
          if (nsFreq !== 0 && nsLotPerFreq !== undefined && nsLotPerFreq !== null) {
            total.netSellLotPerFreqSum += nsLotPerFreq * Math.abs(nsFreq);
            total.netSellLotPerFreqWeight += Math.abs(nsFreq);
          }
          if (nsOrdNum !== 0 && nsLotPerOrdNum !== undefined && nsLotPerOrdNum !== null) {
            total.netSellLotPerOrdNumSum += nsLotPerOrdNum * Math.abs(nsOrdNum);
            total.netSellLotPerOrdNumWeight += Math.abs(nsOrdNum);
          }
          
          if (nsVol > 0) {
            total.netSellAvg += nsVal / nsVol;
            total.netSellAvgCount += 1;
          }
        }
      });
    });
    
    // Calculate final averages and Lot/F, Lot/ON
    totalNetBuyDataByStock.forEach((total) => {
      total.netBuyAvg = total.netBuyAvgCount > 0 ? total.netBuyAvg / total.netBuyAvgCount : (total.netBuyVol > 0 ? total.netBuyValue / total.netBuyVol : 0);
      total.netBuyLotPerFreq = total.netBuyLotPerFreqWeight > 0 ? total.netBuyLotPerFreqSum / total.netBuyLotPerFreqWeight : 0;
      total.netBuyLotPerOrdNum = total.netBuyLotPerOrdNumWeight > 0 ? total.netBuyLotPerOrdNumSum / total.netBuyLotPerOrdNumWeight : 0;
    });
    totalNetSellDataByStock.forEach((total) => {
      total.netSellAvg = total.netSellAvgCount > 0 ? total.netSellAvg / total.netSellAvgCount : (total.netSellVol > 0 ? total.netSellValue / total.netSellVol : 0);
      total.netSellLotPerFreq = total.netSellLotPerFreqWeight > 0 ? total.netSellLotPerFreqSum / total.netSellLotPerFreqWeight : 0;
      total.netSellLotPerOrdNum = total.netSellLotPerOrdNumWeight > 0 ? total.netSellLotPerOrdNumSum / total.netSellLotPerOrdNumWeight : 0;
    });
    
    // Sort stocks by total net sell value (highest to lowest) for Total column
    const sortedTotalNetSellStocks = Array.from(totalNetSellDataByStock.entries())
      .sort((a, b) => b[1].netSellValue - a[1].netSellValue)
      .map(([stock]) => stock);
    
    // For backward compatibility, create combined totalNetDataByStock
    const totalNetDataByStock = new Map<string, {
      netBuyVol: number;
      netBuyValue: number;
      netBuyAvg: number;
      netBuyFreq: number;
      netBuyOrdNum: number;
      netBuyLot: number;
      netBuyLotPerFreq: number;
      netBuyLotPerOrdNum: number;
      netSellVol: number;
      netSellValue: number;
      netSellAvg: number;
      netSellFreq: number;
      netSellOrdNum: number;
      netSellLot: number;
      netSellLotPerFreq: number;
      netSellLotPerOrdNum: number;
      netBuyAvgCount: number;
      netSellAvgCount: number;
    }>();
    
    // Combine Net Buy and Net Sell data (for backward compatibility with rendering code)
    Array.from(totalNetBuyDataByStock.entries()).forEach(([stock, netBuyData]) => {
      totalNetDataByStock.set(stock, {
        netBuyVol: netBuyData.netBuyVol,
        netBuyValue: netBuyData.netBuyValue,
        netBuyAvg: netBuyData.netBuyAvg,
        netBuyFreq: netBuyData.netBuyFreq,
        netBuyOrdNum: netBuyData.netBuyOrdNum,
        netBuyLot: netBuyData.netBuyLot,
        netBuyLotPerFreq: netBuyData.netBuyLotPerFreq,
        netBuyLotPerOrdNum: netBuyData.netBuyLotPerOrdNum,
        netSellVol: 0,
        netSellValue: 0,
        netSellAvg: 0,
        netSellFreq: 0,
        netSellOrdNum: 0,
        netSellLot: 0,
        netSellLotPerFreq: 0,
        netSellLotPerOrdNum: 0,
        netBuyAvgCount: netBuyData.netBuyAvgCount,
        netSellAvgCount: 0,
      });
    });
    
    Array.from(totalNetSellDataByStock.entries()).forEach(([stock, netSellData]) => {
      const existing = totalNetDataByStock.get(stock);
      if (existing) {
        existing.netSellVol = netSellData.netSellVol;
        existing.netSellValue = netSellData.netSellValue;
        existing.netSellAvg = netSellData.netSellAvg;
        existing.netSellFreq = netSellData.netSellFreq;
        existing.netSellOrdNum = netSellData.netSellOrdNum;
        existing.netSellLot = netSellData.netSellLot;
        existing.netSellLotPerFreq = netSellData.netSellLotPerFreq;
        existing.netSellLotPerOrdNum = netSellData.netSellLotPerOrdNum;
        existing.netSellAvgCount = netSellData.netSellAvgCount;
      } else {
        totalNetDataByStock.set(stock, {
          netBuyVol: 0,
          netBuyValue: 0,
          netBuyAvg: 0,
          netBuyFreq: 0,
          netBuyOrdNum: 0,
          netBuyLot: 0,
          netBuyLotPerFreq: 0,
          netBuyLotPerOrdNum: 0,
          netSellVol: netSellData.netSellVol,
          netSellValue: netSellData.netSellValue,
          netSellAvg: netSellData.netSellAvg,
          netSellFreq: netSellData.netSellFreq,
          netSellOrdNum: netSellData.netSellOrdNum,
          netSellLot: netSellData.netSellLot,
          netSellLotPerFreq: netSellData.netSellLotPerFreq,
          netSellLotPerOrdNum: netSellData.netSellLotPerOrdNum,
          netBuyAvgCount: 0,
          netSellAvgCount: netSellData.netSellAvgCount,
        });
      }
    });
    
    const sortedTotalNetStocks = sortedTotalNetSellStocks; // Use Net Sell stocks for backward compatibility
    
    return {
      uniqueStocks,
      filteredStocks,
      sortedStocksByDate,
      sortedNetStocksByDate,
      totalDataByStock,
      totalNetDataByStock,
      sortedTotalStocks,
      sortedTotalNetStocks,
      // Section-specific data (4 sections independent)
      buyStocksByDate,
      sellStocksByDate,
      netBuyStocksByDate,
      netSellStocksByDate,
      totalBuyDataByStock,
      totalSellDataByStock,
      totalNetBuyDataByStock,
      totalNetSellDataByStock
    };
  }, [transactionData]); // CRITICAL: Only depend on transactionData - sector filtering will be applied at render time, not during computation

    // Calculate max rows for virtual scrolling - use max rows from all sections (Buy, Sell, Net Buy, Net Sell)
  // FIXED: Use all dates from buyStocksByDate/sellStocksByDate/etc, not selectedDates to prevent re-calculation on input change
  const maxRows = useMemo(() => {
    let maxBuyRows = 0;
    let maxSellRows = 0;
    let maxNetBuyRows = 0;
    let maxNetSellRows = 0;
    // Use all dates from the Maps, not selectedDates (to prevent re-calculation on input change)
    const allDates = new Set([
      ...Array.from(buyStocksByDate.keys()),
      ...Array.from(sellStocksByDate.keys()),
      ...Array.from(netBuyStocksByDate.keys()),
      ...Array.from(netSellStocksByDate.keys())
    ]);
    allDates.forEach(date => {
      const buyData = buyStocksByDate.get(date) || [];
      const sellData = sellStocksByDate.get(date) || [];
      const netBuyData = netBuyStocksByDate.get(date) || [];
      const netSellData = netSellStocksByDate.get(date) || [];
      maxBuyRows = Math.max(maxBuyRows, buyData.length);
      maxSellRows = Math.max(maxSellRows, sellData.length);
      maxNetBuyRows = Math.max(maxNetBuyRows, netBuyData.length);
      maxNetSellRows = Math.max(maxNetSellRows, netSellData.length);
    });
    const result = Math.max(maxBuyRows, maxSellRows, maxNetBuyRows, maxNetSellRows);
    return result;
  }, [buyStocksByDate, sellStocksByDate, netBuyStocksByDate, netSellStocksByDate]); // FIXED: Removed selectedDates - only recalculate when data changes, not when input changes

  // Calculate visible row indices for virtual scrolling
  // OPTIMIZED: Simplify - always calculate if maxRows > 0
  const visibleRowIndices = useMemo(() => {
    if (maxRows === 0) return [];
    
    const maxVisible = Math.min(visibleRowCount, maxRows);
    const indices: number[] = [];
    for (let i = 0; i < maxVisible; i++) {
      indices.push(i);
    }
    return indices;
  }, [visibleRowCount, maxRows]);

  // Lazy loading with Intersection Observer - load more rows when scrolling near bottom
  // FIXED: Separate observers for Value and Net tables so they work independently
  useEffect(() => {
    if (!isDataReady || maxRows === 0) return;

    // Only set up observer if we haven't reached max rows yet
    if (visibleRowCount >= maxRows) return;

    const valueSentinel = valueTableSentinelRef.current;
    const netSentinel = netTableSentinelRef.current;
    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;

    if (!valueSentinel || !netSentinel || !valueContainer || !netContainer) return;

    // Handler for loading more rows
    const loadMoreRows = () => {
      setVisibleRowCount((prev) => {
        // Use functional update to get latest maxRows value
        const currentMaxRows = maxRows;
        if (currentMaxRows === 0 || prev >= currentMaxRows) return prev;
        const newCount = Math.min(prev + MAX_DISPLAY_ROWS, currentMaxRows);
        return newCount;
      });
    };

    // Create separate intersection observer for Value table
    const valueObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadMoreRows();
          }
        });
      },
      {
        root: valueContainer, // Use Value table container as root
        rootMargin: '200px', // Trigger 200px before sentinel comes into view
        threshold: 0.1
      }
    );

    // Create separate intersection observer for Net table
    const netObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadMoreRows();
          }
        });
      },
      {
        root: netContainer, // Use Net table container as root
        rootMargin: '200px', // Trigger 200px before sentinel comes into view
        threshold: 0.1
      }
    );

    // Observe sentinels with their respective observers
    valueObserver.observe(valueSentinel);
    netObserver.observe(netSentinel);

    return () => {
      valueObserver.disconnect();
      netObserver.disconnect();
    };
  }, [isDataReady, maxRows, visibleRowCount]);

  const renderHorizontalView = useCallback(() => {
    // FIXED: Don't hide data when input changes - only check isDataReady
    // Keep showing existing data even if user changes input (until Show button is clicked)
    if (!isDataReady) {
      return null;
    }
    
    // FIXED: Removed input validation check - we don't need to check selectedBrokers/selectedDates here
    // Data is already filtered when fetched, so we just render what's available
    // Even if there's no data, we should still render the tables to show "No Data Available" message inside the table
    // (This matches BrokerSummaryPage.tsx behavior)
    
    // VALUE Table - Shows Buyer and Seller data
    const renderValueTable = () => {
      // Determine if we should show only Total column (when > 7 days selected)
      const showOnlyTotal = selectedDates.length > 7;
      
      // Helper function to get stock color class based on sector
      // CRITICAL: This should always work regardless of ticker selection - coloring is independent of filtering
      const getStockColorClass = (stockCode: string): { color: string; className: string } => {
        if (!stockCode) return { color: '#FFFFFF', className: 'font-semibold' };
        const stockSector = stockToSectorMap[stockCode.toUpperCase()];
        if (!stockSector) return { color: '#FFFFFF', className: 'font-semibold' };
        
        // Color mapping based on sector - Using 11 distinct colors from provided palette
        // NO GREEN/RED to avoid conflict with Buy/Sell colors
        // Colors: Royal Blue, Sky Blue, Deep Purple, Gold, Orange, Cyan, Brown, Slate Gray, Hot Pink, Khaki, White
        const sectorColors: { [sector: string]: string } = {
          'Financials': '#FFFFFF', // White
          'Energy': '#4169E1', // Royal Blue
          'Basic Materials': '#00BFFF', // Sky Blue
          'Consumer Cyclicals': '#800080', // Deep Purple
          'Consumer Non-Cyclicals': '#FFD700', // Gold
          'Healthcare': '#FF8C00', // Orange
          'Industrials': '#00FFFF', // Cyan
          'Infrastructures': '#8B4513', // Brown
          'Properties & Real Estate': '#708090', // Slate Gray
          'Technology': '#FF69B4', // Hot Pink
          'Transportation & Logistic': '#C3B091' // Khaki
        };
        
        const color = sectorColors[stockSector] || '#FFFFFF';
        return { color, className: 'font-semibold' };
      };
      
      // For VALUE table: Get max row count across all dates for Buy and Sell sections separately
      // CRITICAL: Filtering is done in loadTransactionData, so no need to filter here
      // Data is already filtered by ticker or sector at fetch time
      
      // CRITICAL: Total column ALWAYS uses sorted stocks from aggregated data
      // Sort by buyerValue (highest to lowest) for Buy section
      const sortedTotalBuyStocks = Array.from(totalBuyDataByStock.entries())
        .sort((a, b) => b[1].buyerValue - a[1].buyerValue)
        .map(([stock]) => stock);
      
      // Sort by sellerValue (highest to lowest) for Sell section
      const sortedTotalSellStocks = Array.from(totalSellDataByStock.entries())
        .sort((a, b) => b[1].sellerValue - a[1].sellerValue)
        .map(([stock]) => stock);
      
      let maxBuyRows = sortedTotalBuyStocks.length;
      let maxSellRows = sortedTotalSellStocks.length;
      
      if (!showOnlyTotal) {
        // When showing per-date, also check per-date rows to ensure we show all data
      selectedDates.forEach(date => {
          const buyData = buyStocksByDate.get(date) || [];
          const sellData = sellStocksByDate.get(date) || [];
        maxBuyRows = Math.max(maxBuyRows, buyData.length);
        maxSellRows = Math.max(maxSellRows, sellData.length);
      });
      }
      const tableMaxRows = Math.max(maxBuyRows, maxSellRows);
      
      // Use visible row indices for virtual scrolling
      // FIXED: Simplify logic - always show data if available, limit to 20 rows initially
      // CRITICAL: Ensure rowIndices is never empty if tableMaxRows > 0
      const displayRows = Math.min(tableMaxRows, Math.max(visibleRowCount, MAX_DISPLAY_ROWS));
      
      // ALWAYS use fallback if we have data - simpler and more reliable
      const rowIndices = tableMaxRows > 0 
        ? Array.from({ length: Math.min(displayRows, tableMaxRows) }, (_, i) => i)
        : [];
      
      // Calculate total columns for "No Data Available" message
      const totalCols = showOnlyTotal ? 17 : (selectedDates.length * 17 + 17);
      
      return (
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">B/S - {selectedBrokers.join(', ')}</h3>
          </div>
          <div className="w-full max-w-full">
            <div ref={valueTableContainerRef} className="w-full max-w-full overflow-x-auto max-h-[494px] overflow-y-auto border-l-2 border-r-2 border-b-2 border-white">
              <table ref={valueTableRef} className={`min-w-[1000px] ${getFontSizeClass()} border-collapse`} style={{ borderSpacing: 0 }}>
                <thead className="bg-[#3a4252]">
                  {/* Date Header Row */}
                  <tr className="border-t-2 border-white">
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => (
                      <th 
                        key={date} 
                        className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} 
                        colSpan={17}
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                      Total
                    </th>
                  </tr>
                  {/* Column Header Row */}
                  <tr className="bg-[#3a4252]">
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        {/* Buyer Columns */}
                        <th className={`text-center py-[1px] px-[3px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} title={formatDisplayDate(date)} style={dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>BCode</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BVal</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BLot</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BAvg</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BFreq</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BOr</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-16" title={formatDisplayDate(date)}>Lot/Or</th>
                        {/* Separator */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-auto min-w-[2.5rem] whitespace-nowrap" title={formatDisplayDate(date)}>#</th>
                        {/* Seller Columns */}
                        <th className="text-center py-[1px] px-[3px] font-bold text-white" title={formatDisplayDate(date)} style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}>SCode</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SVal</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SLot</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SAvg</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SFreq</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SOr</th>
                        <th className={`text-center py-[1px] px-[6px] font-bold text-white w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/Or</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns */}
                    <th className={`text-center py-[1px] px-[3px] font-bold text-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>BCode</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BVal</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BLot</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BAvg</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BFreq</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BOr</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">Lot/Or</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-auto min-w-[2.5rem] whitespace-nowrap">#</th>
                    <th className="text-center py-[1px] px-[3px] font-bold text-white" style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>SCode</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SVal</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SLot</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SAvg</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SFreq</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SOr</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white">Lot/Or</th>
                  </tr>
                </thead>
                <tbody>
                  {tableMaxRows === 0 || transactionData.size === 0 ? (
                    // If no data, show "No Data Available" message
                    <tr className="border-b-2 border-white">
                      <td 
                        colSpan={totalCols} 
                        className="text-center py-[2.06px] text-muted-foreground font-bold"
                        style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
                      >
                        No Data Available
                      </td>
                    </tr>
                  ) : rowIndices.length > 0 ? rowIndices.map((rowIdx: number) => {
                          return (
                      <tr key={rowIdx}>
                        {!showOnlyTotal && selectedDates.map((date: string, dateIndex: number) => {
                          // Get Buy data at this row index for this date
                          // CRITICAL: Data is already filtered in loadTransactionData
                          const buyDataForDate = buyStocksByDate.get(date) || [];
                          const buyRowData = buyDataForDate[rowIdx];
                          
                          // Get Sell data at this row index for this date
                          // CRITICAL: Data is already filtered in loadTransactionData
                          const sellDataForDate = sellStocksByDate.get(date) || [];
                          const sellRowData = sellDataForDate[rowIdx];
                        
                        return (
                          <React.Fragment key={date}>
                              {/* Buyer Columns - from buyStocksByDate */}
                              {buyRowData ? (
                                <>
                                  {(() => {
                                    const dayData = buyRowData.data;
                                    // Use BLot directly from CSV (column 1), no fallback
                                    const buyerLot = dayData.BLot ?? 0;
                                    // Use BVal (BuyerValue) from CSV column 2
                                    const buyerVal = dayData.BuyerValue || 0;
                                    // Use BAvg from CSV column 3, or calculate from BLot and BVal
                                    // const buyerAvg = dayData.BuyerAvg || (buyerLot > 0 ? buyerVal / (buyerLot * 100) : 0);
                                    const buyerAvg = dayData.BuyerAvg;

                                    // Use BFreq from CSV column 4
                                    const buyerFreq = dayData.BFreq || 0;
                                    // Use BLotPerFreq directly from CSV column 5, not calculated
                                    // const buyerLotPerFreq = dayData.BLotPerFreq !== undefined ? dayData.BLotPerFreq : (buyerFreq > 0 ? buyerLot / buyerFreq : 0);
                                    const buyerLotPerFreq = dayData.BLotPerFreq;
                                    // Use NewBuyerOrdNum for BOR display, fallback to BOrdNum if not available
                                    const buyerOrdNum = dayData.NewBuyerOrdNum !== undefined ? dayData.NewBuyerOrdNum : (dayData.BOrdNum || 0);
                                    // CRITICAL: For Broker pivot, use BLotPerOrdNum directly from CSV column 7, not calculated
                                    // This is the Lot/Or value for Buy section
                                    const buyerLotPerOrdNum = dayData.BLotPerOrdNum ?? 0;
                                    
                                    const bCode = dayData.BCode || buyRowData.stock;
                                    const bCodeColor = getStockColorClass(bCode);
                                    return (
                                      <>
                            <td className={`text-center py-[1px] px-[3px] font-bold ${bCodeColor.className} ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ ...(dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }), color: bCodeColor.color }}>
                                          {bCode}
                            </td>
                                        <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(buyerVal)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLot(buyerLot)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(buyerAvg ?? 0)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{buyerFreq}</td>
                                        <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-8" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(buyerLotPerFreq ?? 0)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{buyerOrdNum}</td>
                                        <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-16" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(buyerLotPerOrdNum ?? 0)}</td>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                // Show empty cells if no Buy data at this row index
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-8">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-16">-</td>
                                </>
                              )}
                            {/* Separator */}
                              <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-auto min-w-[2.5rem] whitespace-nowrap">{rowIdx + 1}</td>
                              {/* Seller Columns - from sellStocksByDate */}
                              {sellRowData ? (
                                <>
                                  {(() => {
                                    const dayData = sellRowData.data;
                                    // Use SLot directly from CSV (column 9), no fallback
                                    const sellerLot = dayData.SLot ?? 0;
                                    // Use SVal (SellerValue) from CSV column 10
                                    const sellerVal = dayData.SellerValue || 0;
                                    // Use SAvg from CSV column 11, no fallback
                                    const sellerAvg = dayData.SellerAvg;
                                    // Use SFreq from CSV column 12
                                    const sellerFreq = dayData.SFreq || 0;
                                    // Use SLotPerFreq directly from CSV column 13, no fallback
                                    const sellerLotPerFreq = dayData.SLotPerFreq;
                                    // Use NewSellerOrdNum for SOR display, fallback to SOrdNum if not available
                                    const sellerOrdNum = dayData.NewSellerOrdNum !== undefined ? dayData.NewSellerOrdNum : (dayData.SOrdNum || 0);
                                    // CRITICAL: For Broker pivot, use SLotPerOrdNum directly from CSV column 15, not calculated
                                    // This is the Lot/Or value for Sell section
                                    const sellerLotPerOrdNum = dayData.SLotPerOrdNum ?? 0;
                                    
                                    // Debug: log SCode to verify it's correct
                                    if (rowIdx <= 2 && dateIndex === 0) {
                                      console.log(`[BrokerTransaction] Sell section - Row ${rowIdx}: SCode="${dayData.SCode}" (type: ${typeof dayData.SCode}), SLot=${sellerLot}, SVal=${sellerVal}`);
                                    }
                                    
                                    const sCode = String(dayData.SCode || sellRowData.stock || '');
                                    const sCodeColor = getStockColorClass(sCode);
                                    return (
                                      <>
                                        <td className={`text-center py-[1px] px-[3px] font-bold ${sCodeColor.className}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', color: sCodeColor.color }}>{sCode}</td>
                                        <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(sellerVal)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLot(sellerLot)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(sellerAvg ?? 0)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{sellerFreq}</td>
                                        <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-8" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(sellerLotPerFreq ?? 0)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{sellerOrdNum}</td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatAverage(sellerLotPerOrdNum ?? 0)}
                            </td>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                // Show empty cells if no Sell data at this row index
                                <>
                                  <td className="text-center py-[1px] px-[3px] text-gray-400" style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}>-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-8">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>-</td>
                                </>
                              )}
                          </React.Fragment>
                        );
                      })}
                        {/* Total Column - aggregate Buy and Sell data separately by stock code */}
                      {(() => {
                          // CRITICAL: Total column ALWAYS uses sorted stocks from aggregated data
                          // Sort by buyerValue (highest to lowest) for Buy section
                          const sortedBuyStocks = Array.from(totalBuyDataByStock.entries())
                            .sort((a, b) => b[1].buyerValue - a[1].buyerValue)
                            .map(([stock]) => stock);
                          
                          // Sort by sellerValue (highest to lowest) for Sell section
                          const sortedSellStocks = Array.from(totalSellDataByStock.entries())
                            .sort((a, b) => b[1].sellerValue - a[1].sellerValue)
                            .map(([stock]) => stock);
                          
                          // Get Buy stock code at this row index (always from sorted stocks)
                          const buyStockCode = sortedBuyStocks[rowIdx] || '';
                          const totalBuyBCode = buyStockCode || '-';
                          
                          // Get Sell stock code at this row index (always from sorted stocks)
                          const sellStockCode = sortedSellStocks[rowIdx] || '';
                          const totalSellSCode = sellStockCode || '-';
                          
                          // Get aggregated data for Buy and Sell
                          // Use Lot/F and Lot/ON from aggregated data (calculated from CSV values)
                          const buyTotalData = buyStockCode ? totalBuyDataByStock.get(buyStockCode) : null;
                          const sellTotalData = sellStockCode ? totalSellDataByStock.get(sellStockCode) : null;
                          
                          // Get aggregated values (always use from totalBuyDataByStock and totalSellDataByStock for consistency)
                          const totalBuyValue = buyTotalData ? buyTotalData.buyerValue : 0;
                          const totalBuyFreq = buyTotalData ? buyTotalData.buyerFreq : 0;
                          const totalBuyOrdNum = buyTotalData ? buyTotalData.buyerOrdNum : 0;
                          const totalSellValue = sellTotalData ? sellTotalData.sellerValue : 0;
                          const totalSellFreq = sellTotalData ? sellTotalData.sellerFreq : 0;
                          const totalSellOrdNum = sellTotalData ? sellTotalData.sellerOrdNum : 0;
                          
                          const totalBuyLot = buyTotalData?.buyerLot || 0;
                          const totalSellLot = sellTotalData?.sellerLot || 0;
                          const totalBuyLotPerFreq = buyTotalData?.buyerLotPerFreq || 0;
                          const totalSellLotPerFreq = sellTotalData?.sellerLotPerFreq || 0;
                          const totalBuyLotPerOrdNum = buyTotalData?.buyerLotPerOrdNum || 0;
                          const totalSellLotPerOrdNum = sellTotalData?.sellerLotPerOrdNum || 0;
                          
                          // Calculate final averages (use from aggregated data)
                          const finalBuyAvg = buyTotalData ? buyTotalData.buyerAvg : 0;
                          const finalSellAvg = sellTotalData ? sellTotalData.sellerAvg : 0;
                          
                          // Hide Total row if both Buy and Sell are empty
                          if (totalBuyBCode === '-' && totalSellSCode === '-') {
                          return (
                            <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                                -
                            </td>
                          );
                        }
                        
                        // Get color classes for stock codes based on sector
                        const buyBCodeColor = totalBuyBCode !== '-' ? getStockColorClass(totalBuyBCode) : { color: '#FFFFFF', className: 'font-semibold' };
                        const sellSCodeColor = totalSellSCode !== '-' ? getStockColorClass(totalSellSCode) : { color: '#FFFFFF', className: 'font-semibold' };
                        
                        return (
                          <React.Fragment>
                              {/* Buyer Total Columns */}
                              {totalBuyBCode !== '-' && Math.abs(totalBuyLot) > 0 ? (
                                <>
                            <td className={`text-center py-[1px] px-[3px] font-bold ${buyBCodeColor.className} ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box', color: buyBCodeColor.color }}>
                                    {totalBuyBCode}
                            </td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(totalBuyValue)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLot(totalBuyLot)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(finalBuyAvg)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalBuyFreq}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-8" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(totalBuyLotPerFreq)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalBuyOrdNum}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-16" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(totalBuyLotPerOrdNum)}</td>
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-8">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-16">-</td>
                                </>
                              )}
                            {/* Separator */}
                              <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-auto min-w-[2.5rem] whitespace-nowrap">{rowIdx + 1}</td>
                              {/* Seller Total Columns */}
                              {totalSellSCode !== '-' && Math.abs(totalSellLot) > 0 ? (
                                <>
                            <td className={`text-center py-[1px] px-[3px] font-bold ${sellSCodeColor.className}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box', color: sellSCodeColor.color }}>
                                    {totalSellSCode}
                            </td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(totalSellValue)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLot(totalSellLot)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(finalSellAvg)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalSellFreq}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-8" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(totalSellLotPerFreq)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalSellOrdNum}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600 border-r-2 border-white w-16" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAverage(totalSellLotPerOrdNum)}
                            </td>
                                </>
                              ) : (
                                <>
                                  <td className="text-center py-[1px] px-[3px] text-gray-400" style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-8">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 border-r-2 border-white w-16">-</td>
                                </>
                              )}
                          </React.Fragment>
                        );
                      })()}
                    </tr>
                  );
                }) : null}
                {/* Lazy loading sentinel - triggers load more when scrolled into view */}
                {visibleRowCount < maxRows && rowIndices.length > 0 && (
                  <tr>
                    <td colSpan={showOnlyTotal ? 17 : (selectedDates.length * 17 + 17)} ref={valueTableSentinelRef} className="h-10">
                      {/* Invisible sentinel for intersection observer */}
                    </td>
                  </tr>
                )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    };
    
    // NET Table - Shows Net Buy/Sell data
    const renderNetTable = () => {
      // Determine if we should show only Total column (when > 7 days selected)
      const showOnlyTotal = selectedDates.length > 7;
      
      // Helper function to get stock color class based on sector (same as Value table)
      // CRITICAL: This should always work regardless of ticker selection - coloring is independent of filtering
      const getStockColorClass = (stockCode: string): { color: string; className: string } => {
        if (!stockCode) return { color: '#FFFFFF', className: 'font-semibold' };
        const stockSector = stockToSectorMap[stockCode.toUpperCase()];
        if (!stockSector) return { color: '#FFFFFF', className: 'font-semibold' };
        
        // Color mapping based on sector - Using 11 distinct colors from provided palette
        // NO GREEN/RED to avoid conflict with Buy/Sell colors (same as Value table)
        // Colors: Royal Blue, Sky Blue, Deep Purple, Gold, Orange, Cyan, Brown, Slate Gray, Hot Pink, Khaki, White
        const sectorColors: { [sector: string]: string } = {
          'Financials': '#FFFFFF', // White
          'Energy': '#4169E1', // Royal Blue
          'Basic Materials': '#00BFFF', // Sky Blue
          'Consumer Cyclicals': '#800080', // Deep Purple
          'Consumer Non-Cyclicals': '#FFD700', // Gold
          'Healthcare': '#FF8C00', // Orange
          'Industrials': '#00FFFF', // Cyan
          'Infrastructures': '#8B4513', // Brown
          'Properties & Real Estate': '#708090', // Slate Gray
          'Technology': '#FF69B4', // Hot Pink
          'Transportation & Logistic': '#C3B091' // Khaki
        };
        
        const color = sectorColors[stockSector] || '#FFFFFF';
        return { color, className: 'font-semibold' };
      };
      
      // For NET table: Get max row count across all dates for Net Buy and Net Sell sections separately
      // CRITICAL: Filtering is done in loadTransactionData, so no need to filter here
      // Data is already filtered by ticker or sector at fetch time
      
      // CRITICAL: Total column ALWAYS uses sorted stocks from aggregated NET data
      // Calculate NET from B/S Total data first
      const allStocksFromBS = new Set<string>();
      Array.from(totalBuyDataByStock.keys()).forEach(stock => allStocksFromBS.add(stock));
      Array.from(totalSellDataByStock.keys()).forEach(stock => allStocksFromBS.add(stock));
      
      const netBuyFromBS = new Map<string, {
        stock: string;
        netBuyLot: number;
        netBuyValue: number;
        netBuyAvg: number;
        netBuyFreq: number;
        netBuyOrdNum: number;
        netBuyLotPerFreq: number;
        netBuyLotPerOrdNum: number;
      }>();
      
      const netSellFromBS = new Map<string, {
        stock: string;
        netSellLot: number;
        netSellValue: number;
        netSellAvg: number;
        netSellFreq: number;
        netSellOrdNum: number;
        netSellLotPerFreq: number;
        netSellLotPerOrdNum: number;
      }>();
      
      // Calculate Net Buy and Net Sell for each stock from B/S Total
      allStocksFromBS.forEach(stock => {
        const buyData = totalBuyDataByStock.get(stock);
        const sellData = totalSellDataByStock.get(stock);
        
        const buyLot = buyData?.buyerLot || 0;
        const buyValue = buyData?.buyerValue || 0;
        const buyFreq = buyData?.buyerFreq || 0;
        const buyOrdNum = buyData?.buyerOrdNum || 0;
        
        const sellLot = sellData?.sellerLot || 0;
        const sellValue = sellData?.sellerValue || 0;
        const sellFreq = sellData?.sellerFreq || 0;
        const sellOrdNum = sellData?.sellerOrdNum || 0;
        
        // Calculate Net Buy = Buy - Sell (only if positive)
        const netBuyLot = buyLot - sellLot;
        const netBuyValue = buyValue - sellValue;
        
        if (netBuyLot > 0) {
          const netBuyLotVolume = netBuyLot * 100;
          const netBuyAvg = netBuyLotVolume > 0 ? netBuyValue / netBuyLotVolume : 0;
          const netBuyFreq = buyFreq - sellFreq;
          const netBuyOrdNum = buyOrdNum - sellOrdNum;
          const netBuyLotPerFreq = netBuyFreq !== 0 ? netBuyLot / netBuyFreq : 0;
          const netBuyLotPerOrdNum = netBuyOrdNum !== 0 ? netBuyLot / netBuyOrdNum : 0;
          
          netBuyFromBS.set(stock, {
            stock,
            netBuyLot,
            netBuyValue,
            netBuyAvg,
            netBuyFreq,
            netBuyOrdNum,
            netBuyLotPerFreq,
            netBuyLotPerOrdNum
          });
        }
        
        // Calculate Net Sell = Sell - Buy (only if positive)
        const netSellLot = sellLot - buyLot;
        const netSellValue = sellValue - buyValue;
        
        if (netSellLot > 0) {
          const netSellLotVolume = netSellLot * 100;
          const netSellAvg = netSellLotVolume > 0 ? netSellValue / netSellLotVolume : 0;
          const netSellFreq = sellFreq - buyFreq;
          const netSellOrdNum = sellOrdNum - buyOrdNum;
          const netSellLotPerFreq = netSellFreq !== 0 ? netSellLot / netSellFreq : 0;
          const netSellLotPerOrdNum = netSellOrdNum !== 0 ? netSellLot / netSellOrdNum : 0;
          
          netSellFromBS.set(stock, {
            stock,
            netSellLot,
            netSellValue,
            netSellAvg,
            netSellFreq,
            netSellOrdNum,
            netSellLotPerFreq,
            netSellLotPerOrdNum
          });
        }
      });
      
      // Sort Net Buy stocks by value (highest to lowest)
      const sortedTotalNetBuyStocks = Array.from(netBuyFromBS.entries())
        .filter(([, data]) => Math.abs(data.netBuyLot) > 0)
        .sort((a, b) => b[1].netBuyValue - a[1].netBuyValue)
        .map(([stock]) => stock);
      
      // Sort Net Sell stocks by value (highest to lowest)
      const sortedTotalNetSellStocks = Array.from(netSellFromBS.entries())
        .filter(([, data]) => Math.abs(data.netSellLot) > 0)
        .sort((a, b) => b[1].netSellValue - a[1].netSellValue)
        .map(([stock]) => stock);
      
      let maxNetBuyRows = sortedTotalNetBuyStocks.length;
      let maxNetSellRows = sortedTotalNetSellStocks.length;
      
      if (!showOnlyTotal) {
        // When showing per-date, also check per-date rows to ensure we show all data
      selectedDates.forEach(date => {
          const netBuyData = netBuyStocksByDate.get(date) || [];
          const netSellData = netSellStocksByDate.get(date) || [];
        maxNetBuyRows = Math.max(maxNetBuyRows, netBuyData.length);
        maxNetSellRows = Math.max(maxNetSellRows, netSellData.length);
      });
      }
      const tableMaxRows = Math.max(maxNetBuyRows, maxNetSellRows);
      
      // Use visible row indices for virtual scrolling
      // FIXED: Simplify logic - always show data if available, limit to 20 rows initially
      // CRITICAL: Ensure rowIndices is never empty if tableMaxRows > 0
      const displayRows = Math.min(tableMaxRows, Math.max(visibleRowCount, MAX_DISPLAY_ROWS));
      
      // ALWAYS use fallback if we have data - simpler and more reliable
      const rowIndices = tableMaxRows > 0 
        ? Array.from({ length: Math.min(displayRows, tableMaxRows) }, (_, i) => i)
        : [];
      
      // Calculate total columns for "No Data Available" message
      const totalCols = showOnlyTotal ? 17 : (selectedDates.length * 17 + 17);
    
    return (
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">NET - {selectedBrokers.join(', ')}</h3>
          </div>
          <div className="w-full max-w-full">
            <div ref={netTableContainerRef} className="w-full max-w-full overflow-x-auto max-h-[494px] overflow-y-auto border-l-2 border-r-2 border-b-2 border-white">
              <table ref={netTableRef} className={`min-w-[1000px] ${getFontSizeClass()} border-collapse`} style={{ borderSpacing: 0 }}>
                <thead className="bg-[#3a4252]">
                  {/* Date Header Row */}
                  <tr className="border-t-2 border-white">
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => (
                      <th 
                        key={date} 
                        className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} 
                        colSpan={17}
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                      Total
                    </th>
                  </tr>
                  {/* Column Header Row */}
                  <tr className="bg-[#3a4252]">
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        {/* Net Buy Columns (from CSV columns 17-23) */}
                        <th className={`text-center py-[1px] px-[3px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} title={formatDisplayDate(date)} style={dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>BCode</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BVal</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BLot</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BAvg</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BFreq</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BOr</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-16" title={formatDisplayDate(date)}>Lot/Or</th>
                        {/* Separator */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-auto min-w-[2.5rem] whitespace-nowrap" title={formatDisplayDate(date)}>#</th>
                        {/* Net Sell Columns (from CSV columns 24-30) */}
                        <th className="text-center py-[1px] px-[3px] font-bold text-white" title={formatDisplayDate(date)} style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}>SCode</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SVal</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SLot</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SAvg</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SFreq</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SOr</th>
                        <th className={`text-center py-[1px] px-[6px] font-bold text-white w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/Or</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns - Net Buy/Net Sell */}
                    <th className={`text-center py-[1px] px-[3px] font-bold text-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>BCode</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BVal</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BLot</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BAvg</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BFreq</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">BOr</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">Lot/Or</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-auto min-w-[2.5rem] whitespace-nowrap">#</th>
                    <th className="text-center py-[1px] px-[3px] font-bold text-white" style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>SCode</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SVal</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SLot</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SAvg</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SFreq</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SOr</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white">Lot/Or</th>
                  </tr>
                </thead>
                <tbody>
                  {tableMaxRows === 0 || transactionData.size === 0 ? (
                    // If no data, show "No Data Available" message
                    <tr className="border-b-2 border-white">
                      <td 
                        colSpan={totalCols} 
                        className="text-center py-[2.06px] text-muted-foreground font-bold"
                        style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
                      >
                        No Data Available
                      </td>
                    </tr>
                  ) : rowIndices.length > 0 ? rowIndices.map((rowIdx: number) => {
                          return (
                      <tr key={rowIdx}>
                        {!showOnlyTotal && selectedDates.map((date: string, dateIndex: number) => {
                          // Get Net Buy data at this row index for this date
                          // CRITICAL: Data is already filtered in loadTransactionData
                          const netBuyDataForDate = netBuyStocksByDate.get(date) || [];
                          const netBuyRowData = netBuyDataForDate[rowIdx];
                          
                          // Get Net Sell data at this row index for this date
                          // CRITICAL: Data is already filtered in loadTransactionData
                          const netSellDataForDate = netSellStocksByDate.get(date) || [];
                          const netSellRowData = netSellDataForDate[rowIdx];
                        
                        return (
                          <React.Fragment key={date}>
                              {/* Net Buy Columns - from netBuyStocksByDate */}
                              {netBuyRowData ? (
                                <>
                                  {(() => {
                                    const dayData = netBuyRowData.data;
                                    const nbCode = dayData.NBCode || netBuyRowData.stock;
                                    const nbCodeColor = getStockColorClass(nbCode);
                                    const nbLot = dayData.NBLot || 0;
                                    const nbVal = dayData.NBVal || 0;
                                    const nbAvg = dayData.NBAvg;
                                    const nbFreq = dayData.NBFreq || 0;
                                    // Use value from CSV, no fallback
                                    const nbLotPerFreq = dayData.NBLotPerFreq;
                                    const nbOrdNum = dayData.NBOrdNum || 0;
                                    // Use value from CSV, no fallback
                                    const nbLotPerOrdNum = dayData.NBLotPerOrdNum;
                                    
                                    return (
                                      <>
                                        <td className={`text-center py-[1px] px-[3px] font-bold ${nbCodeColor.className} ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ ...(dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }), color: nbCodeColor.color }}>
                                          {nbCode}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-green-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatValue(nbVal)}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-green-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatLot(nbLot)}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-green-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatAverage(nbAvg ?? 0)}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-green-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {nbFreq}
                                        </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-green-600 w-8`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatAverage(nbLotPerFreq ?? 0)}
                                        </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-green-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {nbOrdNum}
                                        </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-green-600 w-16`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatAverage(nbLotPerOrdNum ?? 0)}
                                        </td>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                // Show empty cells if no Net Buy data at this row index
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16`}>-</td>
                                </>
                              )}
                            {/* Separator */}
                              <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-auto min-w-[2.5rem] whitespace-nowrap">{rowIdx + 1}</td>
                              {/* Net Sell Columns - from netSellStocksByDate */}
                              {netSellRowData ? (
                                <>
                                  {(() => {
                                    const dayData = netSellRowData.data;
                                    const nsCode = dayData.NSCode || netSellRowData.stock;
                                    const nsCodeColor = getStockColorClass(nsCode);
                                    const nsLot = dayData.NSLot || 0;
                                    const nsVal = dayData.NSVal || 0;
                                    const nsAvg = dayData.NSAvg;
                                    const nsFreq = dayData.NSFreq || 0;
                                    // Use value from CSV, no fallback
                                    const nsLotPerFreq = dayData.NSLotPerFreq;
                                    const nsOrdNum = dayData.NSOrdNum || 0;
                                    // Use value from CSV, no fallback
                                    const nsLotPerOrdNum = dayData.NSLotPerOrdNum;
                                    
                                    return (
                                      <>
                                        <td className={`text-center py-[1px] px-[3px] font-bold ${nsCodeColor.className}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', color: nsCodeColor.color }}>
                                          {nsCode}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatValue(nsVal)}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatLot(nsLot)}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatAverage(nsAvg ?? 0)}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {nsFreq}
                            </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-8`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatAverage(nsLotPerFreq ?? 0)}
                                        </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {nsOrdNum}
                                        </td>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatAverage(nsLotPerOrdNum ?? 0)}
                                        </td>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                // Show empty cells if no Net Sell data at this row index
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>-</td>
                                </>
                              )}
                          </React.Fragment>
                        );
                      })}
                        {/* Total Column - Calculate NET from B/S Total (Buy - Sell) */}
                      {(() => {
                          // CRITICAL: Use sorted stocks already calculated above (sortedTotalNetBuyStocks and sortedTotalNetSellStocks)
                          // These are already sorted by netBuyValue and netSellValue (highest to lowest)
                          
                          // Get Net Buy stock at this row index (from sorted stocks calculated above)
                          const netBuyStockCode = sortedTotalNetBuyStocks[rowIdx] || '';
                          const netBuyData = netBuyStockCode ? netBuyFromBS.get(netBuyStockCode) : null;
                          
                          // Get Net Sell stock at this row index (from sorted stocks calculated above)
                          const netSellStockCode = sortedTotalNetSellStocks[rowIdx] || '';
                          const netSellData = netSellStockCode ? netSellFromBS.get(netSellStockCode) : null;
                          
                          // If both are empty, hide row
                          if (!netBuyData && !netSellData) {
                            return (
                              <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                                -
                              </td>
                            );
                          }
                          
                          // Calculate values from NET calculated from B/S Total
                          const totalNetBuyNBCode = netBuyStockCode || '-';
                          const totalNetBuyLot = netBuyData ? netBuyData.netBuyLot : 0;
                          const totalNetBuyValue = netBuyData ? netBuyData.netBuyValue : 0;
                          const finalNetBuyAvg = netBuyData ? netBuyData.netBuyAvg : 0;
                          const totalNetBuyFreq = netBuyData ? netBuyData.netBuyFreq : 0;
                          const totalNetBuyOrdNum = netBuyData ? netBuyData.netBuyOrdNum : 0;
                          const totalNetBuyLotPerFreq = netBuyData ? netBuyData.netBuyLotPerFreq : 0;
                          const totalNetBuyLotPerOrdNum = netBuyData ? netBuyData.netBuyLotPerOrdNum : 0;
                          
                          const totalNetSellNSCode = netSellStockCode || '-';
                          const totalNetSellLot = netSellData ? netSellData.netSellLot : 0;
                          const totalNetSellValue = netSellData ? netSellData.netSellValue : 0;
                          const finalNetSellAvg = netSellData ? netSellData.netSellAvg : 0;
                          const totalNetSellFreq = netSellData ? netSellData.netSellFreq : 0;
                          const totalNetSellOrdNum = netSellData ? netSellData.netSellOrdNum : 0;
                          const totalNetSellLotPerFreq = netSellData ? netSellData.netSellLotPerFreq : 0;
                          const totalNetSellLotPerOrdNum = netSellData ? netSellData.netSellLotPerOrdNum : 0;
                          
                          // Hide Total row if both Net Buy and Net Sell are empty, or if both NBLot and NSLot are 0
                          if ((totalNetBuyNBCode === '-' || Math.abs(totalNetBuyLot) === 0) && 
                              (totalNetSellNSCode === '-' || Math.abs(totalNetSellLot) === 0)) {
                            return (
                              <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                                -
                              </td>
                            );
                          }
                          
                          // Get color classes for stock codes based on sector
                          const netBuyNBCodeColor = totalNetBuyNBCode !== '-' ? getStockColorClass(totalNetBuyNBCode) : { color: '#FFFFFF', className: 'font-semibold' };
                          const netSellNSCodeColor = totalNetSellNSCode !== '-' ? getStockColorClass(totalNetSellNSCode) : { color: '#FFFFFF', className: 'font-semibold' };
                          
                          // Color for values: Net Buy values are green, Net Sell values are red
                          const totalNetBuyColor = 'text-green-600';
                          const totalNetSellColor = 'text-red-600';
                        
                        return (
                          <React.Fragment>
                              {/* Net Buy Total Columns */}
                              {netBuyData && Math.abs(totalNetBuyLot) > 0 ? (
                                <>
                            <td className={`text-center py-[1px] px-[3px] font-bold ${netBuyNBCodeColor.className} ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box', color: netBuyNBCodeColor.color }}>
                                    {totalNetBuyNBCode}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatValue(totalNetBuyValue)}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatLot(totalNetBuyLot)}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAverage(finalNetBuyAvg)}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetBuyFreq}
                            </td>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyColor} w-8`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAverage(totalNetBuyLotPerFreq)}
                                  </td>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetBuyOrdNum}
                                  </td>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyColor} w-16`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAverage(totalNetBuyLotPerOrdNum)}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16`}>-</td>
                                </>
                              )}
                            {/* Separator */}
                              <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold">{rowIdx + 1}</td>
                              {/* Net Sell Total Columns */}
                              {netSellData && Math.abs(totalNetSellLot) > 0 ? (
                                <>
                            <td className={`text-center py-[1px] px-[3px] font-bold ${netSellNSCodeColor.className}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box', color: netSellNSCodeColor.color }}>
                                    {totalNetSellNSCode}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatValue(totalNetSellValue)}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatLot(totalNetSellLot)}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAverage(finalNetSellAvg)}
                            </td>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetSellFreq}
                            </td>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor} w-8`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAverage(totalNetSellLotPerFreq)}
                                  </td>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetSellOrdNum}
                                  </td>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor} w-16 border-r-2 border-white`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAverage(totalNetSellLotPerOrdNum)}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16 border-r-2 border-white`}>-</td>
                                </>
                              )}
                          </React.Fragment>
                        );
                      })()}
                    </tr>
                  );
                }) : null}
                {/* Lazy loading sentinel - triggers load more when scrolled into view */}
                {visibleRowCount < maxRows && rowIndices.length > 0 && (
                  <tr>
                    <td colSpan={showOnlyTotal ? 17 : (selectedDates.length * 17 + 17)} ref={netTableSentinelRef} className="h-10">
                      {/* Invisible sentinel for intersection observer */}
                    </td>
                  </tr>
                )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    };
    
    return (
      <div className="w-full">
        {renderValueTable()}
        {renderNetTable()}
      </div>
    );
    }, [filteredStocks, uniqueStocks, sortedStocksByDate, sortedNetStocksByDate, totalDataByStock, totalNetDataByStock, sortedTotalStocks, sortedTotalNetStocks, transactionData, visibleRowIndices, buyStocksByDate, sellStocksByDate, netBuyStocksByDate, netSellStocksByDate, totalNetBuyDataByStock, totalNetSellDataByStock, isDataReady, selectedDates, activeSectorFilter, selectedSectors, stockToSectorMap]); // CRITICAL: Added selectedDates, activeSectorFilter, selectedSectors, and stockToSectorMap to dependencies to react to showOnlyTotal and sector filter changes


  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1.5">
        <div className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3 md:gap-6">
          {/* Broker Selection - Multi-select with chips */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Broker:</label>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Selected Broker Chips */}
              {selectedBrokers.map(broker => (
                <div
                  key={broker}
                  className="flex items-center gap-1 px-2 h-9 bg-primary/20 text-primary rounded-md text-sm"
                >
                  <span>{broker}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveBroker(broker)}
                    className="hover:bg-primary/30 rounded px-1"
                    aria-label={`Remove ${broker}`}
                  >
                    ×
                  </button>
              </div>
              ))}
              {/* Broker Input */}
              <div className="relative flex-1 md:flex-none" ref={dropdownBrokerRef}>
                  <input
                    type="text"
                    value={brokerInput}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setBrokerInput(v);
                      setShowBrokerSuggestions(true);
                      setHighlightedIndex(0);
                    }}
                    onFocus={() => setShowBrokerSuggestions(true)}
                    onKeyDown={(e) => {
                    const filteredBrokers = brokerInput === '' 
                      ? availableBrokers.filter(b => !selectedBrokers.includes(b))
                      : availableBrokers.filter(b => 
                          b.toLowerCase().includes(brokerInput.toLowerCase()) && 
                          !selectedBrokers.includes(b)
                        );
                    const suggestions = filteredBrokers.slice(0, 10);
                    
                      if (e.key === 'ArrowDown' && suggestions.length) {
                        e.preventDefault();
                      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
                      } else if (e.key === 'ArrowUp' && suggestions.length) {
                        e.preventDefault();
                      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                      } else if (e.key === 'Enter' && showBrokerSuggestions) {
                        e.preventDefault();
                        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
                        const choice = suggestions[idx];
                      if (choice) handleBrokerSelect(choice);
                      } else if (e.key === 'Escape') {
                        setShowBrokerSuggestions(false);
                        setHighlightedIndex(-1);
                      }
                    }}
                  placeholder="Add broker"
                  className="w-full md:w-32 h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
                    role="combobox"
                    aria-expanded={showBrokerSuggestions}
                    aria-controls="broker-suggestions"
                    aria-autocomplete="list"
                  />
                  {showBrokerSuggestions && (
                  <div id="broker-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {availableBrokers.length === 0 ? (
                        <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading brokers...
                        </div>
                    ) : brokerInput === '' ? (
                      <>
                        <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                          Available Brokers ({availableBrokers.filter(b => !selectedBrokers.includes(b)).length})
                        </div>
                        {availableBrokers.filter(b => !selectedBrokers.includes(b)).map(broker => (
                          <div
                            key={broker}
                            onClick={() => handleBrokerSelect(broker)}
                            className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                          >
                            {broker}
                          </div>
                        ))}
                      </>
                    ) : (() => {
                      const filteredBrokers = availableBrokers.filter(b => 
                        b.toLowerCase().includes(brokerInput.toLowerCase()) && 
                        !selectedBrokers.includes(b)
                      );
                      return (
                            <>
                          <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                            {filteredBrokers.length} broker(s) found
                          </div>
                          {filteredBrokers.length > 0 ? (
                            filteredBrokers.map((broker, idx) => (
                              <div
                                key={broker}
                                onClick={() => handleBrokerSelect(broker)}
                                className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedIndex ? 'bg-accent' : ''}`}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                              >
                                {broker}
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                              No brokers found
                            </div>
                          )}
                            </>
                      );
                    })()}
                    </div>
                  )}
              </div>
            </div>
          </div>

              {/* Ticker/Sector Multi-Select (Combined) */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Ticker/Sector:</label>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Selected Tickers */}
              {selectedTickers.map(ticker => (
                <div
                  key={ticker}
                  className="flex items-center gap-1 px-2 h-9 bg-primary/20 text-primary rounded-md text-sm"
                >
                  <span>{ticker}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTicker(ticker)}
                    className="hover:bg-primary/30 rounded px-1"
                    aria-label={`Remove ${ticker}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Selected Sectors */}
              {selectedSectors.map(sector => (
                <div
                  key={sector}
                  className="flex items-center gap-1 px-2 h-9 bg-blue-500/20 text-blue-400 rounded-md text-sm"
                >
                  <span>{sector}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSector(sector)}
                    className="hover:bg-blue-500/30 rounded px-1"
                    aria-label={`Remove ${sector}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="relative flex-1 md:flex-none" ref={dropdownTickerRef}>
                <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Add ticker"
                  value={tickerInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTickerInput(v);
                    setShowTickerSuggestions(true);
                    setHighlightedTickerIndex(0);
                  }}
                  onFocus={() => setShowTickerSuggestions(true)}
                  onKeyDown={(e) => {
                    // Get filtered suggestions (tickers + sectors)
                    const availableTickersFiltered = availableTickers.filter(t => !selectedTickers.includes(t));
                    const availableSectorsFiltered = availableSectors.filter(s => !selectedSectors.includes(s));
                    
                    const inputLower = tickerInput.toLowerCase();
                    const filteredTickers = tickerInput === '' 
                      ? availableTickersFiltered
                      : availableTickersFiltered.filter(t => 
                          t.toLowerCase().includes(inputLower)
                        );
                    const filteredSectors = tickerInput === '' 
                      ? availableSectorsFiltered
                      : availableSectorsFiltered.filter(s => 
                          s.toLowerCase().includes(inputLower)
                        );
                    
                    // Combine suggestions: tickers first, then sectors
                    const allSuggestions: Array<{ type: 'ticker' | 'sector'; value: string }> = [
                      ...filteredTickers.map(t => ({ type: 'ticker' as const, value: t })),
                      ...filteredSectors.map(s => ({ type: 'sector' as const, value: s }))
                    ];
                    const suggestions = allSuggestions.slice(0, 20);
                    
                    if (e.key === 'ArrowDown' && suggestions.length) {
                      e.preventDefault();
                      setHighlightedTickerIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
                    } else if (e.key === 'ArrowUp' && highlightedTickerIndex > 0) {
                      e.preventDefault();
                      setHighlightedTickerIndex(prev => prev - 1);
                    } else if (e.key === 'Enter' && highlightedTickerIndex >= 0 && highlightedTickerIndex < suggestions.length) {
                      e.preventDefault();
                      const choice = suggestions[highlightedTickerIndex];
                      if (choice) {
                        if (choice.type === 'ticker') {
                          handleTickerSelect(choice.value);
                        } else {
                          handleSectorSelect(choice.value);
                        }
                      }
                    } else if (e.key === 'Escape') {
                      setShowTickerSuggestions(false);
                      setHighlightedTickerIndex(-1);
                    }
                  }}
                  className="w-full md:w-32 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground"
                />
              {showTickerSuggestions && (
                <div id="ticker-suggestions" role="listbox" className="absolute top-full left-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col min-w-[400px]">
                  {isLoadingStocks || (availableTickers.length === 0 && availableStocksFromAPI.length === 0) ? (
                    <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading stocks...
                    </div>
                  ) : (() => {
                    // Calculate filtered lists once for both columns
                    const availableTickersFiltered = availableTickers.filter(t => !selectedTickers.includes(t));
                    const availableSectorsFiltered = availableSectors.filter(s => !selectedSectors.includes(s));
                    const inputLower = tickerInput.toLowerCase();
                    const filteredTickers = tickerInput === '' 
                      ? availableTickersFiltered
                      : availableTickersFiltered.filter(t => 
                          t.toLowerCase().includes(inputLower)
                        );
                    const filteredSectors = tickerInput === '' 
                      ? availableSectorsFiltered
                      : availableSectorsFiltered.filter(s => 
                          s.toLowerCase().includes(inputLower)
                        );
                    
                    return (
                      <div className="flex flex-row h-full max-h-96 overflow-hidden">
                        {/* Left column: Tickers */}
                        <div className="flex-1 border-r border-[#3a4252] overflow-y-auto">
                          {tickerInput === '' ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                Stocks ({availableTickersFiltered.length})
                              </div>
                              {availableTickersFiltered.map((ticker, idx) => {
                                return (
                                  <div
                                    key={`ticker-${ticker}`}
                                    onClick={() => handleTickerSelect(ticker)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedTickerIndex(idx)}
                                  >
                                    {ticker}
                                  </div>
                                );
                              })}
                            </>
                          ) : filteredTickers.length > 0 ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                Stocks ({filteredTickers.length})
                              </div>
                              {filteredTickers.map((ticker, idx) => {
                                return (
                                  <div
                                    key={`ticker-${ticker}`}
                                    onClick={() => handleTickerSelect(ticker)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedTickerIndex(idx)}
                                  >
                                    {ticker}
                                  </div>
                                );
                              })}
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
                                Sectors ({availableSectorsFiltered.length})
                              </div>
                              {availableSectorsFiltered.map((sector, idx) => {
                                const itemIndex = availableTickersFiltered.length + idx;
                                return (
                                  <div
                                    key={`sector-${sector}`}
                                    onClick={() => handleSectorSelect(sector)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${itemIndex === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedTickerIndex(itemIndex)}
                                  >
                                    {sector}
                                  </div>
                                );
                              })}
                            </>
                          ) : filteredSectors.length > 0 ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                Sectors ({filteredSectors.length})
                              </div>
                              {filteredSectors.map((sector, idx) => {
                                const itemIndex = filteredTickers.length + idx;
                                return (
                                  <div
                                    key={`sector-${sector}`}
                                    onClick={() => handleSectorSelect(sector)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${itemIndex === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedTickerIndex(itemIndex)}
                                  >
                                    {sector}
                                  </div>
                                );
                              })}
                            </>
                          ) : (
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                              Sectors (0)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
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
                  const selectedDate = new Date(e.target.value);
                  const dayOfWeek = selectedDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    showToast({
                      type: 'warning',
                      title: 'Peringatan',
                      message: 'Tidak bisa memilih hari Sabtu atau Minggu'
                    });
                    return;
                  }
                  
                  setStartDate(e.target.value);
                  if (!endDate || new Date(e.target.value) > new Date(endDate)) {
                    setEndDate(e.target.value);
                  }
                }}
                onKeyDown={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                onInput={(e) => e.preventDefault()}
                max={formatDateForInput(endDate)}
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
                  const selectedDate = new Date(e.target.value);
                  const dayOfWeek = selectedDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    showToast({
                      type: 'warning',
                      title: 'Peringatan',
                      message: 'Tidak bisa memilih hari Sabtu atau Minggu'
                    });
                    return;
                  }
                  
                  const newEndDate = e.target.value;
                  setEndDate(newEndDate);
                  
                  // If endDate is before startDate, update startDate
                  if (startDate && new Date(newEndDate) < new Date(startDate)) {
                    setStartDate(newEndDate);
                  }
                }}
                onKeyDown={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                onInput={(e) => e.preventDefault()}
                min={formatDateForInput(startDate)}
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

          {/* Pivot Filter */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Output:</label>
            <select
              value={pivotFilter}
              onChange={(e) => {
                setPivotFilter(e.target.value as 'Broker' | 'Stock');
                // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
                // User must click Show button to fetch new data
              }}
              className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
            >
              <option value="Broker">Broker</option>
              <option value="Stock">Stock</option>
            </select>
          </div>

          {/* F/D Filter (Foreign/Domestic) - Investor Type */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">F/D:</label>
            <select
              value={invFilter}
              onChange={(e) => {
                setInvFilter(e.target.value as 'F' | 'D' | '');
                // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
                // User must click Show button to fetch new data
              }}
              className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
            >
              <option value="">All</option>
              <option value="F">Foreign</option>
              <option value="D">Domestic</option>
            </select>
          </div>

          {/* Board Filter (RG/TN/NG) - Board Type */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Board:</label>
            <select
              value={boardFilter}
              onChange={(e) => {
                setBoardFilter(e.target.value as 'RG' | 'TN' | 'NG' | '');
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

          {/* Show Button */}
          <button
            onClick={() => {
              // CRITICAL: Update selectedDates from startDate and endDate when Show button is clicked
              // This is the ONLY place where selectedDates should be updated
              let datesToUse: string[] = [];
              if (startDate && endDate) {
                // Parse dates as local dates (YYYY-MM-DD format) to avoid timezone issues
                const startParts = startDate.split('-').map(Number);
                const endParts = endDate.split('-').map(Number);
                
                if (startParts.length === 3 && endParts.length === 3) {
                  const startYear = startParts[0];
                  const startMonth = startParts[1];
                  const startDay = startParts[2];
                  const endYear = endParts[0];
                  const endMonth = endParts[1];
                  const endDay = endParts[2];
                  
                  if (startYear !== undefined && startMonth !== undefined && startDay !== undefined &&
                      endYear !== undefined && endMonth !== undefined && endDay !== undefined) {
                    const start = new Date(startYear, startMonth - 1, startDay);
                    const end = new Date(endYear, endMonth - 1, endDay);
                    
                    // Check if range is valid
                    if (start <= end) {
                      // Generate date array (only trading days)
                      const dateArray: string[] = [];
                      const currentDate = new Date(start);
                      
                      while (currentDate <= end) {
                        const dayOfWeek = currentDate.getDay();
                        // Skip weekends (Saturday = 6, Sunday = 0)
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                          // Format as YYYY-MM-DD in local timezone
                          const year = currentDate.getFullYear();
                          const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                          const day = String(currentDate.getDate()).padStart(2, '0');
                          const dateString = `${year}-${month}-${day}`;
                          dateArray.push(dateString);
                        }
                        // Move to next day
                        currentDate.setDate(currentDate.getDate() + 1);
                      }
                      
                      // Sort by date (oldest first) for display
                      datesToUse = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
                    }
                  }
                }
              }
              
              // Determine active sector filter from selectedSectors
              // If multiple sectors selected, use first one (or could combine logic)
              // For now, if any sector selected, use first one; otherwise 'All'
              const newActiveSectorFilter: string = selectedSectors.length > 0 ? (selectedSectors[0] ?? 'All') : 'All';
              
              // CRITICAL: Always update activeSectorFilter first - sector filter should always work
              // Update activeSectorFilter from selectedSectors BEFORE checking for changes
              setActiveSectorFilter(newActiveSectorFilter);
              
              // Check if only sector filter changed (and data already exists)
              // CRITICAL: Also check if tickers changed - if tickers changed, need to refetch data
              const lastParams = lastFetchParamsRef.current;
              const previousTickers = lastParams?.tickers || [];
              const previousSectors = lastParams?.sectors || [];
              const tickersChanged = !lastParams || 
                JSON.stringify(previousTickers.sort()) !== JSON.stringify(selectedTickers.sort());
              const sectorsChanged = !lastParams ||
                JSON.stringify(previousSectors.sort()) !== JSON.stringify(selectedSectors.sort());
              
              // IMPORTANT: selectedTickers can be empty (length === 0) which means "show all tickers"
              // This is handled in loadTransactionData where filtering only happens if selectedTickers.length > 0
              
              // CRITICAL: Update selectedDates FIRST before checking for changes
              // This ensures that date comparison works correctly
              setSelectedDates(datesToUse);
              
              // CRITICAL: Check if only sector filter changed (and data already exists)
              // This allows sector filter to work without re-fetching data
              // Compare dates using datesToUse (what user selected) - now that selectedDates is updated
              const datesUnchanged = lastParams && 
                JSON.stringify(lastParams.dates.sort()) === JSON.stringify([...datesToUse].sort());
              
              const brokersUnchanged = lastParams &&
                JSON.stringify(lastParams.brokers.sort()) === JSON.stringify([...selectedBrokers].sort());
              
              const pivotUnchanged = lastParams && lastParams.pivot === pivotFilter;
              const invUnchanged = lastParams && lastParams.inv === invFilter;
              const boardUnchanged = lastParams && lastParams.board === boardFilter;
              
              const onlySectorChanged = lastParams &&
                isDataReady &&
                !tickersChanged && // Tickers must not have changed
                sectorsChanged && // Sectors must have changed
                brokersUnchanged && // Brokers must not have changed
                datesUnchanged && // Dates must not have changed (compare with datesToUse)
                pivotUnchanged && // Pivot must not have changed
                invUnchanged && // Inv must not have changed
                boardUnchanged; // Board must not have changed
              
              if (onlySectorChanged) {
                // Only sector filter changed (and tickers didn't change) - filter existing data without re-fetching
                // CRITICAL: We need to re-filter rawTransactionData based on new selectedSectors
                
                // Re-filter rawTransactionData based on new selectedSectors
                const newFilteredData = new Map<string, BrokerTransactionData[]>();
                rawTransactionData.forEach((rawRows, date) => {
                  let filteredRows = [...rawRows];
                  
                  // Apply sector filter (same logic as in loadTransactionData)
                  if (selectedSectors.length > 0) {
                    filteredRows = filteredRows.filter(row => {
                      const bCode = row.BCode || '';
                      const sCode = row.SCode || '';
                      const nbCode = row.NBCode || '';
                      const nsCode = row.NSCode || '';
                      
                      const bCodeSector = bCode ? stockToSectorMap[bCode.toUpperCase()] : null;
                      const sCodeSector = sCode ? stockToSectorMap[sCode.toUpperCase()] : null;
                      const nbCodeSector = nbCode ? stockToSectorMap[nbCode.toUpperCase()] : null;
                      const nsCodeSector = nsCode ? stockToSectorMap[nsCode.toUpperCase()] : null;
                      
                      return (bCodeSector && selectedSectors.includes(bCodeSector)) ||
                             (sCodeSector && selectedSectors.includes(sCodeSector)) ||
                             (nbCodeSector && selectedSectors.includes(nbCodeSector)) ||
                             (nsCodeSector && selectedSectors.includes(nsCodeSector));
                    });
                  }
                  
                  newFilteredData.set(date, filteredRows);
                });
                
                // Update transactionData with filtered data
                setTransactionData(newFilteredData);
                
                // Update last fetch params to track sector change
                lastFetchParamsRef.current = {
                  ...lastParams,
                  sectors: [...selectedSectors],
                  dates: [...datesToUse] // Update dates in case they changed
                };
                // CRITICAL: Ensure data is ready and visible after sector filter change
                setIsDataReady(true);
                return;
              }
              
              // Brokers, dates, market, tickers, or sectors changed - need to fetch new data from API
              // NOTE: If selectedTickers is empty, it will show all tickers (no filtering)
              
              // Update last fetch params
              lastFetchParamsRef.current = {
                brokers: [...selectedBrokers],
                dates: [...datesToUse],
                pivot: pivotFilter, // Track pivotFilter
                inv: invFilter || '', // Track invFilter
                board: boardFilter || '', // Track boardFilter
                tickers: [...selectedTickers], // Track selectedTickers
                sectors: [...selectedSectors] // Track selectedSectors
              };
              
              // Clear existing data before fetching new data
              setTransactionData(new Map());
              setRawTransactionData(new Map()); // Clear raw data too
              setIsDataReady(false);
              
              // CRITICAL: Reset column width sync flag when clearing data
              hasSyncedColumnWidthsRef.current = false;
              columnWidthsRef.current = [];
              // Set ref first (synchronous), then state (async)
              shouldFetchDataRef.current = true;
              setShouldFetchData(true);
            }}
            disabled={isLoading || 
              (pivotFilter === 'Broker' && selectedBrokers.length === 0) || 
              (pivotFilter === 'Stock' && selectedTickers.length === 0) || 
              !startDate || !endDate}
            // NOTE: selectedTickers can be empty (show all tickers) - it's not required for Show button
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto"
          >
            Show
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading transaction data...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Main Data Display */}
      {!isLoading && !error && isDataReady && renderHorizontalView()}
    </div>
  );
}