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

// Foreign brokers (red background)
const FOREIGN_BROKERS = [
  "AG", "AH", "AI", "AK", "BK", "BQ", "CG", "CS", "DP", "DR", "DU", "FS", "GW", "HD", "KK", 
  "KZ", "LH", "LG", "LS", "MS", "RB", "RX", "TX", "YP", "YU", "ZP"
];

// Government brokers (green background)
const GOVERNMENT_BROKERS = ['CC', 'NI', 'OD', 'DX'];

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
  const sign = value < 0 ? '-' : '';
  
  // Format: < 1,000,000 → full number with comma (100,000)
  // Format: >= 1,000,000 → format with 'M' (Million) with 1 decimal (1.3M)
  if (absValue >= 1000000) {
    // Convert to millions and format with 1 decimal place
    const millions = absValue / 1000000;
    return `${sign}${millions.toFixed(1)}M`;
  } else {
    // < 1,000,000: Show full number with comma separator
    // Example: 100,000 → 100,000 (not 100K)
  return rounded.toLocaleString('en-US');
  }
};

const formatAverage = (value: number | undefined | null): string => {
  // Handle invalid values
  if (value === undefined || value === null || isNaN(value)) {
    return '-';
  }
  
  // Handle zero
  if (value === 0) {
    return '0.0';
  }
  
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

const formatLotPerFreqOrOrdNum = (value: number): string => {
  // Format: dibulatkan tanpa angka di belakang koma
  // Contoh: 64.6 → 65, 290.3 → 290
  const rounded = Math.round(value);
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
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

// LocalStorage key for user preferences
const PREFERENCES_STORAGE_KEY = 'broker_transaction_user_preferences';

// Interface for user preferences
interface UserPreferences {
  selectedBrokers: string[];
  selectedTickers: string[];
  selectedSectors: string[];
  pivotFilter: 'Broker' | 'Stock';
  invFilter: 'F' | 'D' | '';
  boardFilter: 'RG' | 'TN' | 'NG' | '';
  showFrequency: boolean;
  showOrder: boolean;
  startDate?: string;
  endDate?: string;
}

// Utility functions for saving/loading preferences
const loadPreferences = (): Partial<UserPreferences> | null => {
  try {
    const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as UserPreferences;
    }
  } catch (error) {
    console.warn('Failed to load user preferences:', error);
  }
  return null;
};

const savePreferences = (prefs: Partial<UserPreferences>) => {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn('Failed to save user preferences:', error);
  }
};

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

  // Load preferences from localStorage on mount
  const savedPrefs = loadPreferences();

  const [startDate, setStartDate] = useState(() => {
    // Try to load from preferences first
    if (savedPrefs?.startDate) {
      return savedPrefs.startDate;
    }
    // Fallback to default
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0];
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    // Try to load from preferences first
    if (savedPrefs?.endDate) {
      return savedPrefs.endDate;
    }
    // Fallback to default
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1];
    }
    return '';
  });
  const [brokerInput, setBrokerInput] = useState('');
  const [debouncedBrokerInput, setDebouncedBrokerInput] = useState('');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(() => {
    // Try to load from preferences first
    if (savedPrefs?.selectedBrokers && savedPrefs.selectedBrokers.length > 0) {
      return savedPrefs.selectedBrokers;
    }
    // Fallback to default
    return ['AK'];
  });
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  
  // Optimize highlightedIndex updates with debounce to reduce re-renders
  const highlightedIndexRef = useRef<number>(-1);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const setHighlightedIndexOptimized = useCallback((idx: number) => {
    highlightedIndexRef.current = idx;
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedIndex(highlightedIndexRef.current);
    }, 16); // ~60fps update rate
  }, []);
  // Windowing state for virtual scrolling
  const [brokerScrollOffset, setBrokerScrollOffset] = useState(0);
  const ITEMS_PER_PAGE = 30; // Render 30 items at a time (reduced for better performance)
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const dropdownBrokerRef = useRef<HTMLDivElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  
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
  // Refs for Total table column widths
  const totalTableRef = useRef<HTMLTableElement>(null);
  const totalTableContainerRef = useRef<HTMLDivElement>(null);
  const dateColumnWidthsRef = useRef<Map<string, number>>(new Map()); // Store width of each date column from VALUE table
  const totalColumnWidthRef = useRef<number>(0); // Store width of Total column from VALUE table
  
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
  const [pivotFilter, setPivotFilter] = useState<'Broker' | 'Stock'>(() => {
    // Try to load from preferences first
    if (savedPrefs?.pivotFilter) {
      return savedPrefs.pivotFilter;
    }
    // Fallback to default
    return 'Broker';
  });
  const [invFilter, setInvFilter] = useState<'F' | 'D' | ''>(() => {
    // Try to load from preferences first
    if (savedPrefs?.invFilter !== undefined) {
      return savedPrefs.invFilter;
    }
    // Fallback to default (empty - All)
    return '';
  });
  const [boardFilter, setBoardFilter] = useState<'RG' | 'TN' | 'NG' | ''>(() => {
    // Try to load from preferences first
    if (savedPrefs?.boardFilter !== undefined) {
      return savedPrefs.boardFilter;
    }
    // Fallback to default
    return 'RG';
  });
  const [isMenuTwoRows, setIsMenuTwoRows] = useState<boolean>(false);
  
  // Toggle untuk show/hide kolom Frequency dan Order
  const [showFrequency, setShowFrequency] = useState<boolean>(() => {
    // Try to load from preferences first
    if (savedPrefs?.showFrequency !== undefined) {
      return savedPrefs.showFrequency;
    }
    // Fallback to default
    return true;
  });
  const [showOrder, setShowOrder] = useState<boolean>(() => {
    // Try to load from preferences first
    if (savedPrefs?.showOrder !== undefined) {
      return savedPrefs.showOrder;
    }
    // Fallback to default
    return true;
  });
  
  // Visualisasi label untuk Output dropdown (ditukar untuk display)
  // Logika tetap menggunakan pivotFilter yang asli
  // Tukar label: Broker -> Stock, Stock -> Broker
  const pivotFilterDisplayLabel = pivotFilter === 'Broker' ? 'Stock' : 'Broker';
  
  // Helper untuk mendapatkan value dari display label (untuk onChange)
  const handlePivotFilterChange = (displayLabel: string) => {
    // Tukar kembali: Stock -> Broker, Broker -> Stock
    const actualValue: 'Broker' | 'Stock' = displayLabel === 'Stock' ? 'Broker' : 'Stock';
    setPivotFilter(actualValue);
  };
  
  // Multi-select ticker/sector states (combined)
  const [tickerInput, setTickerInput] = useState('');
  const [debouncedTickerInput, setDebouncedTickerInput] = useState('');
  const [selectedTickers, setSelectedTickers] = useState<string[]>(() => {
    // Try to load from preferences first
    if (savedPrefs?.selectedTickers) {
      return savedPrefs.selectedTickers;
    }
    // Fallback to default (empty - show all tickers)
    return [];
  });
  const [selectedSectors, setSelectedSectors] = useState<string[]>(() => {
    // Try to load from preferences first
    if (savedPrefs?.selectedSectors) {
      return savedPrefs.selectedSectors;
    }
    // Fallback to default (empty)
    return [];
  });
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);
  const [highlightedTickerIndex, setHighlightedTickerIndex] = useState<number>(-1);
  
  // Optimize highlightedTickerIndex updates with debounce to reduce re-renders
  const highlightedTickerIndexRef = useRef<number>(-1);
  const highlightTickerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const setHighlightedTickerIndexOptimized = useCallback((idx: number) => {
    highlightedTickerIndexRef.current = idx;
    if (highlightTickerTimeoutRef.current) {
      clearTimeout(highlightTickerTimeoutRef.current);
    }
    highlightTickerTimeoutRef.current = setTimeout(() => {
      setHighlightedTickerIndex(highlightedTickerIndexRef.current);
    }, 16); // ~60fps update rate
  }, []);
  const dropdownTickerRef = useRef<HTMLDivElement>(null);
  // Windowing state for virtual scrolling
  const [tickerScrollOffset, setTickerScrollOffset] = useState(0);
  const [sectorScrollOffset, setSectorScrollOffset] = useState(0);
  
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

  // Debounce broker input for better performance (increased to 300ms to reduce re-renders)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedBrokerInput(brokerInput);
      // Reset scroll offset when search changes
      setBrokerScrollOffset(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [brokerInput]);

  // Debounce ticker input for better performance (increased to 300ms to reduce re-renders)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedTickerInput(tickerInput);
      // Reset scroll offsets when search changes
      setTickerScrollOffset(0);
      setSectorScrollOffset(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [tickerInput]);

  // Save preferences to localStorage with debounce to reduce write operations
  useEffect(() => {
    const timeout = setTimeout(() => {
      const preferences: Partial<UserPreferences> = {
        selectedBrokers,
        selectedTickers,
        selectedSectors,
        pivotFilter,
        invFilter,
        boardFilter,
        showFrequency,
        showOrder,
      };
      // Only include dates if they have values
      if (startDate) {
        preferences.startDate = startDate;
      }
      if (endDate) {
        preferences.endDate = endDate;
      }
      savePreferences(preferences);
    }, 500); // Debounce 500ms to reduce localStorage writes
    
    return () => clearTimeout(timeout);
  }, [selectedBrokers, selectedTickers, selectedSectors, pivotFilter, invFilter, boardFilter, showFrequency, showOrder, startDate, endDate]);

  // Optimize selectedBrokers lookup with Set for O(1) performance
  const selectedBrokersSet = useMemo(() => new Set(selectedBrokers), [selectedBrokers]);
  
  // Memoized filtered brokers list for better performance
  const filteredBrokersList = useMemo(() => {
    const searchTerm = debouncedBrokerInput.toLowerCase();
    if (searchTerm === '') {
      // Fast path: no search term, just filter selected
      return availableBrokers.filter(broker => !selectedBrokersSet.has(broker));
    }
    // Search path: filter selected and search
    return availableBrokers.filter(broker => {
      if (selectedBrokersSet.has(broker)) return false;
      return broker.toLowerCase().includes(searchTerm);
    });
  }, [availableBrokers, debouncedBrokerInput, selectedBrokersSet]);

  // Windowed filtered brokers list (only show visible items)
  const visibleFilteredBrokers = useMemo(() => {
    const start = brokerScrollOffset;
    const end = start + ITEMS_PER_PAGE;
    return filteredBrokersList.slice(start, end);
  }, [filteredBrokersList, brokerScrollOffset]);

  // Optimize selectedTickers and selectedSectors lookup with Set for O(1) performance
  const selectedTickersSet = useMemo(() => new Set(selectedTickers), [selectedTickers]);
  const selectedSectorsSet = useMemo(() => new Set(selectedSectors), [selectedSectors]);
  
  // Memoized filtered tickers list for better performance
  const filteredTickersList = useMemo(() => {
    const searchTerm = debouncedTickerInput.toLowerCase();
    const availableTickersFiltered = availableTickers.filter(t => !selectedTickersSet.has(t));
    if (searchTerm === '') return availableTickersFiltered;
    return availableTickersFiltered.filter(t => t.toLowerCase().includes(searchTerm));
  }, [availableTickers, debouncedTickerInput, selectedTickersSet]);

  // Memoized filtered sectors list for better performance
  const filteredSectorsList = useMemo(() => {
    const searchTerm = debouncedTickerInput.toLowerCase();
    const availableSectorsFiltered = availableSectors.filter(s => !selectedSectorsSet.has(s));
    if (searchTerm === '') return availableSectorsFiltered;
    return availableSectorsFiltered.filter(s => s.toLowerCase().includes(searchTerm));
  }, [availableSectors, debouncedTickerInput, selectedSectorsSet]);

  // Windowed filtered tickers list (only show visible items)
  const visibleFilteredTickers = useMemo(() => {
    const start = tickerScrollOffset;
    const end = start + ITEMS_PER_PAGE;
    return filteredTickersList.slice(start, end);
  }, [filteredTickersList, tickerScrollOffset]);

  // Windowed filtered sectors list (only show visible items)
  const visibleFilteredSectors = useMemo(() => {
    const start = sectorScrollOffset;
    const end = start + ITEMS_PER_PAGE;
    return filteredSectorsList.slice(start, end);
  }, [filteredSectorsList, sectorScrollOffset]);

  // Request cancellation ref
  const abortControllerRef = useRef<AbortController | null>(null);
  const shouldFetchDataRef = useRef<boolean>(false); // Ref to track shouldFetchData for async functions (always up-to-date)
  
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
  // IMPORTANT: This effect runs ONLY ONCE on mount - load metadata only, NO auto-fetch data
  useEffect(() => {
    const loadInitialData = async () => {
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
              // Ensure IDX is included in cached sectors (for backward compatibility with old cache)
              const cachedSectors = parsed.sectors || [];
              if (!cachedSectors.includes('IDX')) {
                cachedSectors.push('IDX');
              }
              // Sort with IDX always first
              setAvailableSectors(cachedSectors.sort((a: string, b: string) => {
                if (a === 'IDX') return -1;
                if (b === 'IDX') return 1;
                return a.localeCompare(b);
              })); // Exclude 'All' from available sectors
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
          // Ensure IDX is included in sectors (IDX is a special sector for aggregate index data)
          const sectorsWithIdx = sectorResponse.data.sectors || [];
          if (!sectorsWithIdx.includes('IDX')) {
            sectorsWithIdx.push('IDX');
          }
          // Sort with IDX always first
          setAvailableSectors(sectorsWithIdx.sort((a: string, b: string) => {
            if (a === 'IDX') return -1;
            if (b === 'IDX') return 1;
            return a.localeCompare(b);
          })); // Exclude 'All' from available sectors
          // Cache for next time
          try {
            localStorage.setItem(SECTOR_MAPPING_CACHE_KEY, JSON.stringify({
              stockToSector: sectorResponse.data.stockToSector,
              sectors: sectorsWithIdx,
              timestamp: Date.now()
            }));
          } catch (e) {
            // Ignore cache errors
          }
        } else if (cachedSectorMapping) {
          // Update cache to include IDX if not present (for old cache)
          const cachedSectors = cachedSectorMapping.sectors || [];
          if (!cachedSectors.includes('IDX')) {
            cachedSectors.push('IDX');
            // Sort with IDX always first
            setAvailableSectors(cachedSectors.sort((a: string, b: string) => {
              if (a === 'IDX') return -1;
              if (b === 'IDX') return 1;
              return a.localeCompare(b);
            }));
            // Update cache
            try {
              localStorage.setItem(SECTOR_MAPPING_CACHE_KEY, JSON.stringify({
                stockToSector: cachedSectorMapping.stockToSector,
                sectors: cachedSectors,
                timestamp: cachedSectorMapping.timestamp
              }));
            } catch (e) {
              // Ignore cache errors
            }
          }
        } else if (!cachedSectorMapping && (!sectorResponse.success || !sectorResponse.data)) {
          console.warn('[BrokerTransaction] Failed to load sector mapping, sector filter will not work');
          // Fallback: ensure IDX is available even if API fails
          setAvailableSectors(['IDX']);
        }
        
        // Sort by date (oldest first) for display
        const sortedDates = [...initialDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        
        // Set default to last 3 trading days (skip weekends)
        // NO auto-fetch - user must click Show button to fetch data
        setSelectedDates(sortedDates);
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
        
      } catch (error) {
        console.error('Error loading initial data:', error);
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

  // Auto-load data from saved preferences on mount (after initial data is loaded)
  useEffect(() => {
    // Only auto-load if we have saved preferences with dates
    if (!savedPrefs?.startDate || !savedPrefs?.endDate) {
      return; // No saved preferences, don't auto-load
    }
    
    const savedStartDate = savedPrefs.startDate;
    const savedEndDate = savedPrefs.endDate;
    
    // Wait a bit to ensure initial data (brokers, sectors) are loaded
    const timer = setTimeout(() => {
      // Generate date array from saved startDate and endDate (only trading days)
      const startParts = savedStartDate.split('-').map(Number);
      const endParts = savedEndDate.split('-').map(Number);
      
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
            const datesToUse = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
            
            // Update selectedDates
            setSelectedDates(datesToUse);
            
            // Determine active sector filter from saved preferences
            const savedSectors = savedPrefs?.selectedSectors || [];
            const newActiveSectorFilter: string = savedSectors.length > 0 ? (savedSectors[0] ?? 'All') : 'All';
            setActiveSectorFilter(newActiveSectorFilter);
            
            // Trigger auto-load by setting shouldFetchData to true
            // Use ref first (synchronous), then state (async)
            shouldFetchDataRef.current = true;
            setShouldFetchData(true);
          }
        }
      }
    }, 500); // Small delay to ensure initial data is loaded
    
    return () => clearTimeout(timer);
  }, []); // Only run once on mount

  // Load transaction data only when shouldFetchData is true (triggered by Show button or auto-load)
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
      
      // Validation: For Broker pivot, need brokers OR sectors. For Stock pivot, need tickers OR sectors.
      if (pivotFilter === 'Broker') {
        // For Broker pivot:
        // - If sector is selected: valid (will fetch {sector}_ALL.csv or individual broker files)
        // - If specific brokers are selected: valid (will fetch individual broker files)
        // - If "ALL" broker is selected with sector: valid (will fetch {sector}_ALL.csv)
        // - If "ALL" broker is selected without sector: valid (will fetch ALL.csv - aggregate all emitens)
        const hasSpecificBrokers = selectedBrokers.length > 0 && !selectedBrokers.includes('ALL');
        const hasAllBroker = selectedBrokers.includes('ALL');
        const hasSectorOnly = selectedSectors.length > 0 && selectedBrokers.length === 0;
        const isValid = hasSpecificBrokers || hasAllBroker || hasSectorOnly;
        if ((pivotFilter === 'Broker' && !isValid) || selectedDates.length === 0) {
          setTransactionData(new Map());
          setRawTransactionData(new Map()); // Clear raw data too
          setIsDataReady(false);
          setShouldFetchData(false);
          shouldFetchDataRef.current = false;
          return;
        }
      } else if (pivotFilter === 'Stock') {
        // For Stock pivot, either tickers or sectors must be selected
        // Sectors (including IDX) can be used directly as codes
        if ((selectedTickers.length === 0 && selectedSectors.length === 0) || selectedDates.length === 0) {
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
        // For Broker pivot: if sector selected, fetch {sector}_ALL.csv; otherwise use selectedBrokers
        // For Stock pivot: if sector selected, fetch {sector}.csv directly (already aggregated in backend); otherwise use selectedTickers
        // For Stock pivot + sector + broker: fetch sector CSV, then filter by broker in frontend
        const allFetchTasks = pivotFilter === 'Stock'
          ? selectedDates.flatMap(date => {
              // If tickers are selected, use them
              if (selectedTickers.length > 0) {
                return selectedTickers.map((code: string) => ({ code, date, type: 'stock' as const }));
              }
              
              // If sectors are selected, fetch sector CSV directly (already aggregated in backend)
              // This is much faster than fetching all individual stock files
              if (selectedSectors.length > 0) {
                // Fetch sector CSV directly for each selected sector
                // Backend already aggregated all stocks in sector into one CSV file
                return selectedSectors.map((sector: string) => ({ code: sector, date, type: 'stock' as const }));
              }
              
              return [];
            })
          : selectedDates.flatMap(date => {
              // For Broker pivot: 
              // - If broker "ALL" is selected with sector: fetch {sector}_ALL.csv (already aggregated in backend)
              // - If broker "ALL" is selected without sector: skip (don't fetch all broker files - too many)
              // - If specific broker(s) selected with sector: fetch individual broker files, then filter by sector in frontend
              // - If specific broker(s) selected without sector: fetch individual broker files
              // - If sector selected but no broker selected: fetch {sector}_ALL.csv
              const hasSpecificBrokers = selectedBrokers.length > 0 && !selectedBrokers.includes('ALL');
              const hasAllBroker = selectedBrokers.includes('ALL');
              
              if (selectedSectors.length > 0 && hasAllBroker) {
                // Sector + "ALL" broker: fetch {sector}_ALL.csv (already aggregated in backend)
                return selectedSectors.map((sector: string) => ({ code: `${sector}_ALL`, date, type: 'broker' as const }));
              } else if (selectedSectors.length > 0 && hasSpecificBrokers) {
                // Sector + specific broker(s): fetch individual broker files, then filter by sector in frontend
                const brokersToFetch = selectedBrokers.filter(b => b !== 'ALL');
                if (brokersToFetch.length === 0) {
                  return [];
                }
                return brokersToFetch.map((broker: string) => ({ code: broker, date, type: 'broker' as const }));
              } else if (selectedSectors.length > 0) {
                // Sector selected but no broker selected: fetch {sector}_ALL.csv
                return selectedSectors.map((sector: string) => ({ code: `${sector}_ALL`, date, type: 'broker' as const }));
              } else if (hasAllBroker) {
                // Broker "ALL" selected but no sector: fetch ALL.csv (aggregate all emitens from all brokers)
                // This file is generated by broker_transaction_ALL.ts generateALLWithoutSector()
                return [{ code: 'ALL', date, type: 'broker' as const }];
              } else if (hasSpecificBrokers) {
                // Fetch individual broker files (specific brokers selected, no sector)
                const brokersToFetch = selectedBrokers.filter(b => b !== 'ALL');
                if (brokersToFetch.length === 0) {
                  return [];
                }
                return brokersToFetch.map((broker: string) => ({ code: broker, date, type: 'broker' as const }));
              } else {
                // No broker and no sector selected
                return [];
              }
            });
        
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
        
        // OPTIMIZED: Skip date validation - data is already correct from API
        // Use allDataResults directly without filtering
        const filteredDataResults = allDataResults;
        
        // Process data per date - AGGREGATE per Emiten and per section (Buy, Sell, Net Buy, Net Sell)
        // When multiple brokers are selected, sum values for the same Emiten
        // CRITICAL: For Stock pivot, don't aggregate - each row is already complete (broker transaction for a stock)
        // For Broker pivot, aggregate by Emiten (stock) when multiple brokers are selected
        for (const date of selectedDates) {
          // CRITICAL: Check ref during aggregation - user might have changed dates
          if (!shouldFetchDataRef.current) {
            return;
          }
          
          // For Stock pivot: aggregate by stock code (from fetch task) when multiple brokers are selected
          // For Broker pivot: aggregate by Emiten (stock) when multiple brokers are selected
          if (pivotFilter === 'Stock') {
            // Group rows by stock code (from fetch task) and date
            // CRITICAL: For Stock pivot with sector (like IDX), group by Emiten (actual stock) instead of sector code
            // This ensures all brokers for each stock are shown, not just one broker per stock
            const stockDataMap = new Map<string, BrokerTransactionData[]>();
            
            // Track processed stocks to avoid duplicates
            const processedStocks = new Set<string>();
            
            filteredDataResults.forEach(({ date: resultDate, code, data }) => {
              // CRITICAL: Only process data for the current date being processed
              if (resultDate !== date) return;
              
              // CRITICAL: If sector is selected (like IDX), group by Emiten (actual stock) instead of sector code
              // This ensures all brokers for each stock are preserved
              if (selectedSectors.length > 0) {
                // Group by Emiten (actual stock) for sector data
                data.forEach(row => {
                  const emiten = row.Emiten || '';
                  if (!emiten) return;
                  
                  const existing = stockDataMap.get(emiten) || [];
                  stockDataMap.set(emiten, [...existing, row]);
                });
              } else {
                // CRITICAL: For individual tickers, REPLACE data (don't append) to avoid duplicates
                // Each stock should only have 1 data set per date
                const stockCode = code || 'UNKNOWN';
                
                // Skip if already processed this stock for this date (prevent duplicates)
                if (processedStocks.has(stockCode)) {
                  console.log(`[BrokerTransaction] Skipping duplicate data for ${stockCode} on ${date}`);
                  return;
                }
                processedStocks.add(stockCode);
                
                // REPLACE, don't append - each stock should have only 1 data set
                stockDataMap.set(stockCode, data);
              }
            });
            
            // Store raw data (before filtering and aggregation)
            const rawRows: BrokerTransactionData[] = [];
            stockDataMap.forEach((rows) => {
              rawRows.push(...rows);
            });
            
            // Apply filters if needed
            // CRITICAL: For Stock pivot, filter by broker if selectedBrokers is provided
            // For Stock pivot: Emiten, BCode, SCode, NBCode, NSCode are all broker codes
            let filteredStockDataMap = new Map<string, BrokerTransactionData[]>();
            
            stockDataMap.forEach((rows, stockCode) => {
              let filteredRows = rows;
            
            // Priority 1: Filter by broker (if selectedBrokers is provided)
            if (selectedBrokers.length > 0) {
              const normalizedSelectedBrokers = selectedBrokers.map(b => b.toUpperCase());
              filteredRows = filteredRows.filter(row => {
                const emiten = (row.Emiten || '').toUpperCase();
                const bCode = (row.BCode || '').toUpperCase();
                const sCode = (row.SCode || '').toUpperCase();
                const nbCode = (row.NBCode || '').toUpperCase();
                const nsCode = (row.NSCode || '').toUpperCase();
                
                return normalizedSelectedBrokers.includes(emiten) || 
                       normalizedSelectedBrokers.includes(bCode) || 
                       normalizedSelectedBrokers.includes(sCode) || 
                       normalizedSelectedBrokers.includes(nbCode) || 
                       normalizedSelectedBrokers.includes(nsCode);
              });
            }
            
              if (filteredRows.length > 0) {
                filteredStockDataMap.set(stockCode, filteredRows);
              }
            });
            
            // CRITICAL: For Stock pivot with multiple tickers, aggregate GLOBALLY by broker code
            // This ensures brokers from different stocks (e.g., XL from AADI and XL from ADCP) are aggregated together
            const aggregatedRows: BrokerTransactionData[] = [];
            
            // STEP 1: Collect ALL rows from ALL stocks first
            const allRows: BrokerTransactionData[] = [];
            filteredStockDataMap.forEach((rows) => {
              allRows.push(...rows);
            });
            
            // STEP 2: Determine aggregation strategy
            // - For multiple tickers (no sector): aggregate GLOBALLY by broker code across all stocks
            // - For sector data: aggregate by broker code per stock
            // - For single ticker: show all brokers separately
            
            if (selectedTickers.length > 1 && selectedSectors.length === 0) {
              // MULTIPLE TICKERS: Aggregate GLOBALLY by broker code across ALL stocks
              // This is the key fix - XL from AADI and XL from ADCP will be combined
              const globalBrokerMap = new Map<string, BrokerTransactionData[]>();
              
              allRows.forEach(row => {
                if (!row) return;
                // Use BCode as primary broker identifier, fallback to SCode, NBCode, NSCode, Emiten
                // CRITICAL: Normalize to uppercase and ensure string type for consistent comparison
                const brokerCode = String(row.BCode || row.SCode || row.NBCode || row.NSCode || row.Emiten || '').toUpperCase().trim();
                if (!brokerCode) return;
                
                const existing = globalBrokerMap.get(brokerCode) || [];
                globalBrokerMap.set(brokerCode, [...existing, row]);
              });
              
              // Aggregate rows with the same broker code globally
              globalBrokerMap.forEach((brokerRows) => {
                if (brokerRows.length === 0) return;
                
                // If only one row for this broker, no need to aggregate
                if (brokerRows.length === 1) {
                  const row = brokerRows[0];
                  if (row) {
                    // Ensure BuyerAvg and SellerAvg are calculated correctly
                    if ((!row.BuyerAvg || row.BuyerAvg === 0) && row.BuyerVol && row.BuyerVol > 0) {
                      row.BuyerAvg = row.BuyerValue / row.BuyerVol;
                    }
                    if ((!row.SellerAvg || row.SellerAvg === 0) && row.SellerVol && row.SellerVol > 0) {
                      row.SellerAvg = row.SellerValue / row.SellerVol;
                    }
                    aggregatedRows.push(row);
                  }
                  return;
                }
                
                // Get first row as base
                const firstRow = brokerRows[0];
                if (!firstRow) return;
                
                // Aggregate multiple rows (same broker, different stocks)
                // CRITICAL: Initial value must have numeric fields set to 0 to avoid double-counting firstRow
                const initialAcc: BrokerTransactionData = {
                  ...firstRow,
                  // Reset all numeric fields to 0 - they will be summed in the reduce
                  BuyerVol: 0,
                  BuyerValue: 0,
                  BuyerAvg: 0,
                  BFreq: 0,
                  BOrdNum: 0,
                  BLot: 0,
                  SellerVol: 0,
                  SellerValue: 0,
                  SellerAvg: 0,
                  SFreq: 0,
                  SOrdNum: 0,
                  SLot: 0,
                  NetBuyVol: 0,
                  NetBuyValue: 0,
                  NetSellVol: 0,
                  NetSellValue: 0,
                  TotalVolume: 0,
                  TotalValue: 0,
                  TransactionCount: 0,
                  AvgPrice: 0
                };
                
                const aggregatedRow = brokerRows.reduce((acc, row) => {
                  if (!row) return acc;
                  
                  // Preserve broker codes from first row (BCode, SCode, NBCode, NSCode)
                  if (!acc.BCode && row.BCode) acc.BCode = String(row.BCode).toUpperCase().trim();
                  if (!acc.SCode && row.SCode) acc.SCode = String(row.SCode).toUpperCase().trim();
                  if (!acc.NBCode && row.NBCode) acc.NBCode = String(row.NBCode).toUpperCase().trim();
                  if (!acc.NSCode && row.NSCode) acc.NSCode = String(row.NSCode).toUpperCase().trim();
                  
                  // Sum Buyer values
                  acc.BuyerVol = (acc.BuyerVol || 0) + (row.BuyerVol || 0);
                  acc.BuyerValue = (acc.BuyerValue || 0) + (row.BuyerValue || 0);
                  acc.BFreq = (acc.BFreq || 0) + (row.BFreq || 0);
                  acc.BOrdNum = (acc.BOrdNum || 0) + (row.BOrdNum || 0);
                  acc.BLot = (acc.BLot || 0) + (row.BLot || 0);
                  
                  // Sum Seller values
                  acc.SellerVol = (acc.SellerVol || 0) + (row.SellerVol || 0);
                  acc.SellerValue = (acc.SellerValue || 0) + (row.SellerValue || 0);
                  acc.SFreq = (acc.SFreq || 0) + (row.SFreq || 0);
                  acc.SOrdNum = (acc.SOrdNum || 0) + (row.SOrdNum || 0);
                  acc.SLot = (acc.SLot || 0) + (row.SLot || 0);
                  
                  return acc;
                }, initialAcc);
                
                // Ensure broker codes are normalized
                if (aggregatedRow.BCode) aggregatedRow.BCode = String(aggregatedRow.BCode).toUpperCase().trim();
                if (aggregatedRow.SCode) aggregatedRow.SCode = String(aggregatedRow.SCode).toUpperCase().trim();
                if (aggregatedRow.NBCode) aggregatedRow.NBCode = String(aggregatedRow.NBCode).toUpperCase().trim();
                if (aggregatedRow.NSCode) aggregatedRow.NSCode = String(aggregatedRow.NSCode).toUpperCase().trim();
                
                // CRITICAL: Ensure BuyerVol and SellerVol are calculated from BLot/SLot if they are 0
                // This handles cases where CSV has BLot but not BuyerVol
                if ((!aggregatedRow.BuyerVol || aggregatedRow.BuyerVol === 0) && aggregatedRow.BLot && aggregatedRow.BLot > 0) {
                  aggregatedRow.BuyerVol = aggregatedRow.BLot * 100;
                }
                if ((!aggregatedRow.SellerVol || aggregatedRow.SellerVol === 0) && aggregatedRow.SLot && aggregatedRow.SLot > 0) {
                  aggregatedRow.SellerVol = aggregatedRow.SLot * 100;
                }
                
                // Recalculate averages
                aggregatedRow.BuyerAvg = aggregatedRow.BuyerVol > 0 ? aggregatedRow.BuyerValue / aggregatedRow.BuyerVol : 0;
                aggregatedRow.SellerAvg = aggregatedRow.SellerVol > 0 ? aggregatedRow.SellerValue / aggregatedRow.SellerVol : 0;
                
                // CRITICAL: Recalculate net from BuyerVol - SellerVol
                const rawNetBuyVol = aggregatedRow.BuyerVol - aggregatedRow.SellerVol;
                const rawNetBuyValue = aggregatedRow.BuyerValue - aggregatedRow.SellerValue;
                const rawNetBuyFreq = (aggregatedRow.BFreq || 0) - (aggregatedRow.SFreq || 0);
                const rawNetBuyOrdNum = (aggregatedRow.BOrdNum || 0) - (aggregatedRow.SOrdNum || 0);
                
                if (rawNetBuyVol < 0 || rawNetBuyValue < 0) {
                  aggregatedRow.NetSellVol = Math.abs(rawNetBuyVol);
                  aggregatedRow.NetSellValue = Math.abs(rawNetBuyValue);
                  aggregatedRow.NSFreq = Math.abs(rawNetBuyFreq);
                  aggregatedRow.NSOrdNum = Math.abs(rawNetBuyOrdNum);
                  aggregatedRow.NetBuyVol = 0;
                  aggregatedRow.NetBuyValue = 0;
                  aggregatedRow.NBFreq = 0;
                  aggregatedRow.NBOrdNum = 0;
                } else {
                  aggregatedRow.NetBuyVol = rawNetBuyVol;
                  aggregatedRow.NetBuyValue = rawNetBuyValue;
                  aggregatedRow.NBFreq = rawNetBuyFreq;
                  aggregatedRow.NBOrdNum = rawNetBuyOrdNum;
                  aggregatedRow.NetSellVol = 0;
                  aggregatedRow.NetSellValue = 0;
                  aggregatedRow.NSFreq = 0;
                  aggregatedRow.NSOrdNum = 0;
                }
                
                // Recalculate net averages and lots
                aggregatedRow.NBAvg = aggregatedRow.NetBuyVol > 0 ? aggregatedRow.NetBuyValue / aggregatedRow.NetBuyVol : 0;
                aggregatedRow.NSAvg = aggregatedRow.NetSellVol > 0 ? aggregatedRow.NetSellValue / aggregatedRow.NetSellVol : 0;
                aggregatedRow.NBLot = aggregatedRow.NetBuyVol / 100;
                aggregatedRow.NSLot = aggregatedRow.NetSellVol / 100;
                aggregatedRow.NBLotPerFreq = Math.abs(aggregatedRow.NBFreq || 0) > 0 ? aggregatedRow.NBLot / Math.abs(aggregatedRow.NBFreq || 0) : 0;
                aggregatedRow.NBLotPerOrdNum = Math.abs(aggregatedRow.NBOrdNum || 0) > 0 ? aggregatedRow.NBLot / Math.abs(aggregatedRow.NBOrdNum || 0) : 0;
                aggregatedRow.NSLotPerFreq = Math.abs(aggregatedRow.NSFreq || 0) > 0 ? aggregatedRow.NSLot / Math.abs(aggregatedRow.NSFreq || 0) : 0;
                aggregatedRow.NSLotPerOrdNum = Math.abs(aggregatedRow.NSOrdNum || 0) > 0 ? aggregatedRow.NSLot / Math.abs(aggregatedRow.NSOrdNum || 0) : 0;
                
                aggregatedRows.push(aggregatedRow);
              });
            } else if (selectedSectors.length > 0) {
              // SECTOR DATA: Aggregate by broker code per stock (preserve stock grouping)
              filteredStockDataMap.forEach((rows) => {
                if (rows.length === 0) return;
                
                const brokerMap = new Map<string, BrokerTransactionData[]>();
                rows.forEach(row => {
                  if (!row) return;
                  const brokerCode = String(row.BCode || row.Emiten || row.SCode || row.NBCode || row.NSCode || '').toUpperCase().trim();
                  if (!brokerCode) return;
                  
                  const existing = brokerMap.get(brokerCode) || [];
                  brokerMap.set(brokerCode, [...existing, row]);
                });
                
                brokerMap.forEach((brokerRows) => {
                  if (brokerRows.length === 0) return;
                  
                  if (brokerRows.length === 1) {
                    const row = brokerRows[0];
                    if (row) aggregatedRows.push(row);
                    return;
                  }
                  
                  const firstRow = brokerRows[0];
                  if (!firstRow) return;
                  
                  // CRITICAL: Initial value must have numeric fields set to 0 to avoid double-counting
                  const sectorInitialAcc: BrokerTransactionData = {
                    ...firstRow,
                    BuyerVol: 0, BuyerValue: 0, BuyerAvg: 0, BFreq: 0, BOrdNum: 0, BLot: 0,
                    SellerVol: 0, SellerValue: 0, SellerAvg: 0, SFreq: 0, SOrdNum: 0, SLot: 0,
                    NetBuyVol: 0, NetBuyValue: 0, NetSellVol: 0, NetSellValue: 0,
                    TotalVolume: 0, TotalValue: 0, TransactionCount: 0, AvgPrice: 0
                  };
                  
                  const aggregatedRow = brokerRows.reduce((acc, row) => {
                    if (!row) return acc;
                    acc.BuyerVol = (acc.BuyerVol || 0) + (row.BuyerVol || 0);
                    acc.BuyerValue = (acc.BuyerValue || 0) + (row.BuyerValue || 0);
                    acc.BFreq = (acc.BFreq || 0) + (row.BFreq || 0);
                    acc.BOrdNum = (acc.BOrdNum || 0) + (row.BOrdNum || 0);
                    acc.BLot = (acc.BLot || 0) + (row.BLot || 0);
                    acc.SellerVol = (acc.SellerVol || 0) + (row.SellerVol || 0);
                    acc.SellerValue = (acc.SellerValue || 0) + (row.SellerValue || 0);
                    acc.SFreq = (acc.SFreq || 0) + (row.SFreq || 0);
                    acc.SOrdNum = (acc.SOrdNum || 0) + (row.SOrdNum || 0);
                    acc.SLot = (acc.SLot || 0) + (row.SLot || 0);
                    return acc;
                  }, sectorInitialAcc);
                  
                  // Ensure BuyerVol and SellerVol are calculated from BLot/SLot if they are 0
                  if ((!aggregatedRow.BuyerVol || aggregatedRow.BuyerVol === 0) && aggregatedRow.BLot && aggregatedRow.BLot > 0) {
                    aggregatedRow.BuyerVol = aggregatedRow.BLot * 100;
                  }
                  if ((!aggregatedRow.SellerVol || aggregatedRow.SellerVol === 0) && aggregatedRow.SLot && aggregatedRow.SLot > 0) {
                    aggregatedRow.SellerVol = aggregatedRow.SLot * 100;
                  }
                  
                  aggregatedRow.BuyerAvg = aggregatedRow.BuyerVol > 0 ? aggregatedRow.BuyerValue / aggregatedRow.BuyerVol : 0;
                  aggregatedRow.SellerAvg = aggregatedRow.SellerVol > 0 ? aggregatedRow.SellerValue / aggregatedRow.SellerVol : 0;
                  
                  const rawNetBuyVol = aggregatedRow.BuyerVol - aggregatedRow.SellerVol;
                  const rawNetBuyValue = aggregatedRow.BuyerValue - aggregatedRow.SellerValue;
                  const rawNetBuyFreq = (aggregatedRow.BFreq || 0) - (aggregatedRow.SFreq || 0);
                  const rawNetBuyOrdNum = (aggregatedRow.BOrdNum || 0) - (aggregatedRow.SOrdNum || 0);
                  
                  if (rawNetBuyVol < 0 || rawNetBuyValue < 0) {
                    aggregatedRow.NetSellVol = Math.abs(rawNetBuyVol);
                    aggregatedRow.NetSellValue = Math.abs(rawNetBuyValue);
                    aggregatedRow.NSFreq = Math.abs(rawNetBuyFreq);
                    aggregatedRow.NSOrdNum = Math.abs(rawNetBuyOrdNum);
                    aggregatedRow.NetBuyVol = 0;
                    aggregatedRow.NetBuyValue = 0;
                    aggregatedRow.NBFreq = 0;
                    aggregatedRow.NBOrdNum = 0;
                  } else {
                    aggregatedRow.NetBuyVol = rawNetBuyVol;
                    aggregatedRow.NetBuyValue = rawNetBuyValue;
                    aggregatedRow.NBFreq = rawNetBuyFreq;
                    aggregatedRow.NBOrdNum = rawNetBuyOrdNum;
                    aggregatedRow.NetSellVol = 0;
                    aggregatedRow.NetSellValue = 0;
                    aggregatedRow.NSFreq = 0;
                    aggregatedRow.NSOrdNum = 0;
                  }
                  
                  aggregatedRow.NBAvg = aggregatedRow.NetBuyVol > 0 ? aggregatedRow.NetBuyValue / aggregatedRow.NetBuyVol : 0;
                  aggregatedRow.NSAvg = aggregatedRow.NetSellVol > 0 ? aggregatedRow.NetSellValue / aggregatedRow.NetSellVol : 0;
                  aggregatedRow.NBLot = aggregatedRow.NetBuyVol / 100;
                  aggregatedRow.NSLot = aggregatedRow.NetSellVol / 100;
                  aggregatedRow.NBLotPerFreq = Math.abs(aggregatedRow.NBFreq || 0) > 0 ? aggregatedRow.NBLot / Math.abs(aggregatedRow.NBFreq || 0) : 0;
                  aggregatedRow.NBLotPerOrdNum = Math.abs(aggregatedRow.NBOrdNum || 0) > 0 ? aggregatedRow.NBLot / Math.abs(aggregatedRow.NBOrdNum || 0) : 0;
                  aggregatedRow.NSLotPerFreq = Math.abs(aggregatedRow.NSFreq || 0) > 0 ? aggregatedRow.NSLot / Math.abs(aggregatedRow.NSFreq || 0) : 0;
                  aggregatedRow.NSLotPerOrdNum = Math.abs(aggregatedRow.NSOrdNum || 0) > 0 ? aggregatedRow.NSLot / Math.abs(aggregatedRow.NSOrdNum || 0) : 0;
                  
                  aggregatedRows.push(aggregatedRow);
                });
              });
            } else {
              // SINGLE TICKER: Show all brokers separately
              allRows.forEach(row => {
                if (row) {
                  if ((!row.BuyerAvg || row.BuyerAvg === 0) && row.BuyerVol && row.BuyerVol > 0) {
                    row.BuyerAvg = row.BuyerValue / row.BuyerVol;
                  }
                  if ((!row.SellerAvg || row.SellerAvg === 0) && row.SellerVol && row.SellerVol > 0) {
                    row.SellerAvg = row.SellerValue / row.SellerVol;
                  }
                  aggregatedRows.push(row);
                }
              });
            }
            
            // Store data
            newRawTransactionData.set(date, rawRows);
            newTransactionData.set(date, aggregatedRows);
            continue;
          }
          
          // For Broker pivot: aggregate by Emiten (stock)
          // Map to aggregate data per Emiten and per section
          // Key: Emiten, Value: aggregated BrokerTransactionData
          const aggregatedMap = new Map<string, BrokerTransactionData>();
          
          // Process results for this date from all brokers
          // OPTIMIZED: Skip date double-check - data is already correct from API
          filteredDataResults.forEach(({ date: resultDate, data }) => {
            // OPTIMIZED: Skip date validation - only process if date matches (no logging)
            if (resultDate !== date) {
              return;
            }
              
              // Aggregate rows by Emiten
              for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
                const row = data[rowIndex];
                if (!row) continue;
                
                const emiten = row.Emiten || '';
                if (!emiten) continue;
                
                // OPTIMIZED: Removed debug logging to improve performance
                
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
                  
                  // CRITICAL: Don't sum NetBuyVol/NetBuyValue from CSV - will recalculate from BuyerVol - SellerVol after aggregation
                  // Just sum frequency and order number for now
                  existing.NBFreq = (existing.NBFreq || 0) + (row.NBFreq || 0);
                  existing.NBOrdNum = (existing.NBOrdNum || 0) + (row.NBOrdNum || 0);
                  existing.NSFreq = (existing.NSFreq || 0) + (row.NSFreq || 0);
                  existing.NSOrdNum = (existing.NSOrdNum || 0) + (row.NSOrdNum || 0);
                  
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
                  
                  // CRITICAL: Don't use NetBuyVol/NetBuyValue from CSV - will be recalculated after aggregation
                  // Reset net values to 0 so they will be recalculated from BuyerVol - SellerVol
                  firstRow.NetBuyVol = 0;
                  firstRow.NetBuyValue = 0;
                  firstRow.NetSellVol = 0;
                  firstRow.NetSellValue = 0;
                  firstRow.NBFreq = 0;
                  firstRow.NBOrdNum = 0;
                  firstRow.NSFreq = 0;
                  firstRow.NSOrdNum = 0;
                  
                  aggregatedMap.set(emiten, firstRow);
              }
            }
          });
          
          // Convert map to array
          let allRows = Array.from(aggregatedMap.values());
          
          // CRITICAL: Recalculate net from BuyerVol - SellerVol for ALL rows (both single and multiple brokers)
          // This ensures net is ALWAYS calculated correctly from BuyerVol - SellerVol, not from CSV NetBuyVol
          // This is especially important when multiple brokers are selected
          allRows = allRows.map(row => {
            // CRITICAL: Always recalculate net from BuyerVol - SellerVol, never use NetBuyVol from CSV
            // This ensures consistency and correctness, especially when multiple brokers are selected
            const rawNetBuyVol = (row.BuyerVol || 0) - (row.SellerVol || 0);
            const rawNetBuyValue = (row.BuyerValue || 0) - (row.SellerValue || 0);
            const rawNetBuyFreq = (row.BFreq || 0) - (row.SFreq || 0);
            const rawNetBuyOrdNum = (row.BOrdNum || 0) - (row.SOrdNum || 0);
            
            if (rawNetBuyVol < 0 || rawNetBuyValue < 0) {
              // NetBuy is negative, so it becomes NetSell
              row.NetSellVol = Math.abs(rawNetBuyVol);
              row.NetSellValue = Math.abs(rawNetBuyValue);
              row.NSFreq = Math.abs(rawNetBuyFreq);
              row.NSOrdNum = Math.abs(rawNetBuyOrdNum);
              row.NetBuyVol = 0;
              row.NetBuyValue = 0;
              row.NBFreq = 0;
              row.NBOrdNum = 0;
            } else {
              // NetBuy is positive or zero
              row.NetBuyVol = rawNetBuyVol;
              row.NetBuyValue = rawNetBuyValue;
              row.NBFreq = rawNetBuyFreq;
              row.NBOrdNum = rawNetBuyOrdNum;
              row.NetSellVol = 0;
              row.NetSellValue = 0;
              row.NSFreq = 0;
              row.NSOrdNum = 0;
            }
            
            // Recalculate net averages
            row.NBAvg = row.NetBuyVol > 0 ? row.NetBuyValue / row.NetBuyVol : 0;
            row.NSAvg = row.NetSellVol > 0 ? row.NetSellValue / row.NetSellVol : 0;
            
            // Recalculate lots
            row.NBLot = row.NetBuyVol / 100;
            row.NSLot = row.NetSellVol / 100;
            
            // Recalculate lot per frequency and order number
            row.NBLotPerFreq = Math.abs(row.NBFreq || 0) > 0 ? row.NBLot / Math.abs(row.NBFreq || 0) : 0;
            row.NBLotPerOrdNum = Math.abs(row.NBOrdNum || 0) > 0 ? row.NBLot / Math.abs(row.NBOrdNum || 0) : 0;
            row.NSLotPerFreq = Math.abs(row.NSFreq || 0) > 0 ? row.NSLot / Math.abs(row.NSFreq || 0) : 0;
            row.NSLotPerOrdNum = Math.abs(row.NSOrdNum || 0) > 0 ? row.NSLot / Math.abs(row.NSOrdNum || 0) : 0;
            
            return row;
          });
          
          // OPTIMIZED: Removed debug logging to improve performance
          
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
              // For Broker pivot: Emiten is the stock code
              // For Stock pivot: BCode, SCode, NBCode, NSCode are broker codes (not stock codes)
              const emiten = row.Emiten || '';
              const bCode = row.BCode || '';
              const sCode = row.SCode || '';
              const nbCode = row.NBCode || '';
              const nsCode = row.NSCode || '';
              
              // Check Emiten first (for Broker pivot)
              const emitenSector = emiten ? stockToSectorMap[emiten.toUpperCase()] : null;
              if (emitenSector && selectedSectors.includes(emitenSector)) {
                return true;
              }
              
              // Check other codes (for Stock pivot or additional filtering)
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
  const getFontSizeClass = () => 'text-[12px]';

  // Optimize handlers with useCallback to prevent unnecessary re-renders
  const handleBrokerSelect = useCallback((broker: string) => {
    setSelectedBrokers(prev => {
      if (broker === 'ALL') {
        // Select "ALL" only (don't add all individual brokers to avoid cluttering the list)
        if (!prev.includes('ALL')) {
          return ['ALL'];
        }
        return prev;
      } else if (!prev.includes(broker)) {
        // If "ALL" is already selected, replace it with the specific broker
        // Otherwise, add the broker to the list
        if (prev.includes('ALL')) {
          return [broker];
        } else {
          return [...prev, broker];
        }
      }
      return prev;
    });
    setBrokerInput('');
    setShowBrokerSuggestions(false);
  }, []);

  // Handle broker removal
  const handleRemoveBroker = useCallback((broker: string) => {
    setSelectedBrokers(prev => prev.filter(b => b !== broker));
    // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
    // User must click Show button to fetch new data
  }, []);

  const handleClearAllBrokers = useCallback(() => {
    setSelectedBrokers([]);
  }, []);

  // Handle ticker selection
  const handleTickerSelect = useCallback((ticker: string) => {
    setSelectedTickers(prev => {
      if (!prev.includes(ticker)) {
        return [...prev, ticker];
      }
      return prev;
    });
    setTickerInput('');
    setShowTickerSuggestions(false);
  }, []);

  // Handle ticker removal
  const handleRemoveTicker = useCallback((ticker: string) => {
    setSelectedTickers(prev => prev.filter(t => t !== ticker));
    // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
    // User must click Show button to fetch new data
  }, []);

  const handleClearAllTickers = useCallback(() => {
    setSelectedTickers([]);
  }, []);

  // Handle sector selection (from combined dropdown)
  const handleSectorSelect = useCallback((sector: string) => {
    setSelectedSectors(prev => {
      if (!prev.includes(sector)) {
        return [...prev, sector];
      }
      return prev;
    });
    setTickerInput('');
    setShowTickerSuggestions(false);
  }, []);

  // Handle sector removal
  const handleRemoveSector = useCallback((sector: string) => {
    setSelectedSectors(prev => {
      const newSectors = prev.filter(s => s !== sector);
      // When sector is removed, clear selectedTickers to return to normal state
      // This ensures dropdown shows all tickers again
      if (prev.length === 1) {
        // If this is the last sector being removed, clear tickers
        setSelectedTickers([]);
      }
      return newSectors;
    });
    // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
    // User must click Show button to fetch new data
  }, []);

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
  }, [selectedTickers, selectedBrokers, selectedDates, startDate, endDate, invFilter, boardFilter]);

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

  // Measure and store date column widths from VALUE table to apply to Total table
  useEffect(() => {
    if (isLoading || !isDataReady) return;
    
    const showOnlyTotal = selectedDates.length > 7;
    if (showOnlyTotal) return;

    const valueTable = valueTableRef.current;
    if (!valueTable) return;

    // Calculate colsPerDate dynamically based on toggles
    const baseCols = 9;
    const optionalCols = (showFrequency ? 4 : 0) + (showOrder ? 4 : 0);
    const colsPerDate = baseCols + optionalCols;

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
      // Each date column spans colsPerDate columns (dynamic based on toggles)
      let cellIndex = 0;

      selectedDates.forEach((date) => {
        // Each date column spans colsPerDate columns, so we need to sum the width of colsPerDate cells
        let totalWidth = 0;
        for (let i = 0; i < colsPerDate && cellIndex < columnHeaderCells.length; i++) {
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

      // Measure width of Total column (also spans colsPerDate columns)
      let totalColumnWidth = 0;
      for (let i = 0; i < colsPerDate && cellIndex < columnHeaderCells.length; i++) {
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
    // Wait longer to ensure syncTableWidths has finished (which runs after 100ms)
    const timeoutId = setTimeout(measureWidths, 300);

    return () => clearTimeout(timeoutId);
  }, [transactionData, isLoading, isDataReady, selectedDates, showFrequency, showOrder]);

  // Synchronize horizontal scroll between Value, Net, and Total tables
  // FIXED: Don't depend on selectedDates to prevent re-render on input change
  useEffect(() => {
    if (isLoading || !isDataReady) return;

    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;
    const totalContainer = totalTableContainerRef.current;

    if (!valueContainer || !netContainer || !totalContainer) return;

    // Flag to prevent infinite loop
    let isValueScrolling = false;
    let isNetScrolling = false;
    let isTotalScrolling = false;

    // OPTIMIZED: Direct scroll sync without requestAnimationFrame (faster)
    // Handle Value table scroll - sync to Net and Total tables
    const handleValueScroll = () => {
      if (!isNetScrolling && !isTotalScrolling) {
        isValueScrolling = true;
        if (netContainer) netContainer.scrollLeft = valueContainer.scrollLeft;
        if (totalContainer) totalContainer.scrollLeft = valueContainer.scrollLeft;
        setTimeout(() => {
          isValueScrolling = false;
        }, 0);
      }
    };

    // Handle Net table scroll - sync to Value and Total tables
    const handleNetScroll = () => {
      if (!isValueScrolling && !isTotalScrolling) {
        isNetScrolling = true;
        if (valueContainer) valueContainer.scrollLeft = netContainer.scrollLeft;
        if (totalContainer) totalContainer.scrollLeft = netContainer.scrollLeft;
        setTimeout(() => {
          isNetScrolling = false;
        }, 0);
      }
    };

    // Handle Total table scroll - sync to Value and Net tables
    const handleTotalScroll = () => {
      if (!isValueScrolling && !isNetScrolling) {
        isTotalScrolling = true;
        if (valueContainer) valueContainer.scrollLeft = totalContainer.scrollLeft;
        if (netContainer) netContainer.scrollLeft = totalContainer.scrollLeft;
        setTimeout(() => {
          isTotalScrolling = false;
        }, 0);
      }
    };

    // Add event listeners
    valueContainer.addEventListener('scroll', handleValueScroll, { passive: true });
    netContainer.addEventListener('scroll', handleNetScroll, { passive: true });
    totalContainer.addEventListener('scroll', handleTotalScroll, { passive: true });

    return () => {
      valueContainer.removeEventListener('scroll', handleValueScroll);
      netContainer.removeEventListener('scroll', handleNetScroll);
      totalContainer.removeEventListener('scroll', handleTotalScroll);
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
    // CRITICAL: For Output: stock with multiple brokers, calculate net per date from Buy - Sell per stock (Emiten)
    // Each row represents a separate entry in Net Buy section using NBCode (column 17)
    const netBuyStocksByDate = new Map<string, Array<{ stock: string; data: BrokerTransactionData }>>();
    
    // SECTION 4: Net Sell (NSCode) - Filter and sort independently
    // CRITICAL: For Output: stock with multiple brokers, calculate net per date from Buy - Sell per stock (Emiten)
    // Each row represents a separate entry in Net Sell section using NSCode (column 25)
    const netSellStocksByDate = new Map<string, Array<{ stock: string; data: BrokerTransactionData }>>();
    
    datesToProcess.forEach(date => {
      const dateData = transactionData.get(date) || [];
      
      // CRITICAL: For Output: stock, calculate net per date from Buy - Sell per stock (Emiten)
      // Aggregate Buy and Sell per Emiten (stock) for this date
      const buyByStock = new Map<string, { buyerLot: number; buyerValue: number; buyerFreq: number; buyerOrdNum: number; buyerLotPerFreq: number; buyerLotPerOrdNum: number; buyerLotPerFreqSum: number; buyerLotPerFreqWeight: number; buyerLotPerOrdNumSum: number; buyerLotPerOrdNumWeight: number }>();
      const sellByStock = new Map<string, { sellerLot: number; sellerValue: number; sellerFreq: number; sellerOrdNum: number; sellerLotPerFreq: number; sellerLotPerOrdNum: number; sellerLotPerFreqSum: number; sellerLotPerFreqWeight: number; sellerLotPerOrdNumSum: number; sellerLotPerOrdNumWeight: number }>();
      
      dateData.forEach(d => {
        const emiten = d.Emiten || '';
        if (!emiten) return;
        
        // Aggregate Buy data per Emiten (stock)
        const buyerLot = d.BLot !== undefined ? d.BLot : ((d.BuyerVol || 0) / 100);
        const buyerValue = d.BuyerValue || 0;
        const buyerFreq = d.BFreq || 0;
        const buyerOrdNum = d.BOrdNum || 0;
        const buyerLotPerFreq = d.BLotPerFreq;
        const buyerLotPerOrdNum = d.BLotPerOrdNum;
        const newBuyerOrdNum = d.NewBuyerOrdNum !== undefined ? d.NewBuyerOrdNum : buyerOrdNum;
        
        if (!buyByStock.has(emiten)) {
          buyByStock.set(emiten, { buyerLot: 0, buyerValue: 0, buyerFreq: 0, buyerOrdNum: 0, buyerLotPerFreq: 0, buyerLotPerOrdNum: 0, buyerLotPerFreqSum: 0, buyerLotPerFreqWeight: 0, buyerLotPerOrdNumSum: 0, buyerLotPerOrdNumWeight: 0 });
        }
        const buyData = buyByStock.get(emiten)!;
        buyData.buyerLot += buyerLot;
        buyData.buyerValue += buyerValue;
        buyData.buyerFreq += buyerFreq;
        buyData.buyerOrdNum += buyerOrdNum;
        
        // Weighted average for Lot/F (same as B/S)
        if (buyerFreq > 0 && buyerLotPerFreq !== undefined && buyerLotPerFreq !== null) {
          buyData.buyerLotPerFreqSum += buyerLotPerFreq * buyerFreq;
          buyData.buyerLotPerFreqWeight += buyerFreq;
        }
        // Weighted average for Lot/Or (same as B/S)
        if (newBuyerOrdNum !== 0 && buyerLotPerOrdNum !== undefined && buyerLotPerOrdNum !== null) {
          buyData.buyerLotPerOrdNumSum += buyerLotPerOrdNum * Math.abs(newBuyerOrdNum);
          buyData.buyerLotPerOrdNumWeight += Math.abs(newBuyerOrdNum);
        }
        
        // Aggregate Sell data per Emiten (stock)
        const sellerLot = d.SLot !== undefined ? d.SLot : ((d.SellerVol || 0) / 100);
        const sellerValue = d.SellerValue || 0;
        const sellerFreq = d.SFreq || 0;
        const sellerOrdNum = d.SOrdNum || 0;
        const sellerLotPerFreq = d.SLotPerFreq;
        const sellerLotPerOrdNum = d.SLotPerOrdNum;
        const newSellerOrdNum = d.NewSellerOrdNum !== undefined ? d.NewSellerOrdNum : sellerOrdNum;
        
        if (!sellByStock.has(emiten)) {
          sellByStock.set(emiten, { sellerLot: 0, sellerValue: 0, sellerFreq: 0, sellerOrdNum: 0, sellerLotPerFreq: 0, sellerLotPerOrdNum: 0, sellerLotPerFreqSum: 0, sellerLotPerFreqWeight: 0, sellerLotPerOrdNumSum: 0, sellerLotPerOrdNumWeight: 0 });
        }
        const sellData = sellByStock.get(emiten)!;
        sellData.sellerLot += sellerLot;
        sellData.sellerValue += sellerValue;
        sellData.sellerFreq += sellerFreq;
        sellData.sellerOrdNum += sellerOrdNum;
        
        // Weighted average for Lot/F (same as B/S)
        if (sellerFreq > 0 && sellerLotPerFreq !== undefined && sellerLotPerFreq !== null) {
          sellData.sellerLotPerFreqSum += sellerLotPerFreq * sellerFreq;
          sellData.sellerLotPerFreqWeight += sellerFreq;
        }
        // Weighted average for Lot/Or (same as B/S)
        if (newSellerOrdNum !== 0 && sellerLotPerOrdNum !== undefined && sellerLotPerOrdNum !== null) {
          sellData.sellerLotPerOrdNumSum += sellerLotPerOrdNum * Math.abs(newSellerOrdNum);
          sellData.sellerLotPerOrdNumWeight += Math.abs(newSellerOrdNum);
        }
      });
      
      // Calculate Net Buy and Net Sell per stock from Buy - Sell
      const netBuyDataArray: Array<{ stock: string; data: BrokerTransactionData }> = [];
      const netSellDataArray: Array<{ stock: string; data: BrokerTransactionData }> = [];
      
      const allStocks = new Set([...buyByStock.keys(), ...sellByStock.keys()]);
      
      allStocks.forEach(stock => {
        const buyData = buyByStock.get(stock) || { buyerLot: 0, buyerValue: 0, buyerFreq: 0, buyerOrdNum: 0, buyerLotPerFreq: 0, buyerLotPerOrdNum: 0, buyerLotPerFreqSum: 0, buyerLotPerFreqWeight: 0, buyerLotPerOrdNumSum: 0, buyerLotPerOrdNumWeight: 0 };
        const sellData = sellByStock.get(stock) || { sellerLot: 0, sellerValue: 0, sellerFreq: 0, sellerOrdNum: 0, sellerLotPerFreq: 0, sellerLotPerOrdNum: 0, sellerLotPerFreqSum: 0, sellerLotPerFreqWeight: 0, sellerLotPerOrdNumSum: 0, sellerLotPerOrdNumWeight: 0 };
        
        // Calculate Net Buy = Buy - Sell (only if positive)
        const netBuyLot = buyData.buyerLot - sellData.sellerLot;
        const netBuyValue = buyData.buyerValue - sellData.sellerValue;
        const netBuyFreq = buyData.buyerFreq - sellData.sellerFreq;
        const netBuyOrdNum = buyData.buyerOrdNum - sellData.sellerOrdNum;
        
        // Calculate Lot/F and Lot/Or using weighted average from Buy/Sell (same as B/S)
        // For Net Buy: use Buy weighted average (since Net Buy = Buy - Sell, use Buy's Lot/F and Lot/Or)
        const netBuyLotPerFreq = buyData.buyerLotPerFreqWeight > 0 ? buyData.buyerLotPerFreqSum / buyData.buyerLotPerFreqWeight : 0;
        const netBuyLotPerOrdNum = buyData.buyerLotPerOrdNumWeight > 0 ? buyData.buyerLotPerOrdNumSum / buyData.buyerLotPerOrdNumWeight : 0;
        
        if (netBuyLot > 0) {
          const netBuyLotVolume = netBuyLot * 100;
          const netBuyAvg = netBuyLotVolume > 0 ? netBuyValue / netBuyLotVolume : 0;
          
          // Create Net Buy data object
          const netBuyData: BrokerTransactionData = {
            Emiten: stock,
            NBCode: stock,
            NBLot: netBuyLot,
            NBVal: netBuyValue,
            NBAvg: netBuyAvg,
            NBFreq: netBuyFreq,
            NBOrdNum: netBuyOrdNum,
            NBLotPerFreq: netBuyLotPerFreq,
            NBLotPerOrdNum: netBuyLotPerOrdNum,
            NetBuyVol: netBuyLotVolume,
            NetBuyValue: netBuyValue,
            BuyerVol: 0,
            BuyerValue: 0,
            SellerVol: 0,
            SellerValue: 0,
            NetSellVol: 0,
            NetSellValue: 0,
            BuyerAvg: 0,
            SellerAvg: 0,
            TotalVolume: 0,
            AvgPrice: 0,
            TransactionCount: 0,
            TotalValue: 0
          };
          
          netBuyDataArray.push({ stock, data: netBuyData });
        }
        
        // Calculate Net Sell = Sell - Buy (only if positive)
        const netSellLot = sellData.sellerLot - buyData.buyerLot;
        const netSellValue = sellData.sellerValue - buyData.buyerValue;
        const netSellFreq = sellData.sellerFreq - buyData.buyerFreq;
        const netSellOrdNum = sellData.sellerOrdNum - buyData.buyerOrdNum;
        
        // Calculate Lot/F and Lot/Or using weighted average from Buy/Sell (same as B/S)
        // For Net Sell: use Sell weighted average (since Net Sell = Sell - Buy, use Sell's Lot/F and Lot/Or)
        const netSellLotPerFreq = sellData.sellerLotPerFreqWeight > 0 ? sellData.sellerLotPerFreqSum / sellData.sellerLotPerFreqWeight : 0;
        const netSellLotPerOrdNum = sellData.sellerLotPerOrdNumWeight > 0 ? sellData.sellerLotPerOrdNumSum / sellData.sellerLotPerOrdNumWeight : 0;
        
        if (netSellLot > 0) {
          const netSellLotVolume = netSellLot * 100;
          const netSellAvg = netSellLotVolume > 0 ? netSellValue / netSellLotVolume : 0;
          
          // Create Net Sell data object
          const netSellData: BrokerTransactionData = {
            Emiten: stock,
            NSCode: stock,
            NSLot: netSellLot,
            NSVal: netSellValue,
            NSAvg: netSellAvg,
            NSFreq: netSellFreq,
            NSOrdNum: netSellOrdNum,
            NSLotPerFreq: netSellLotPerFreq,
            NSLotPerOrdNum: netSellLotPerOrdNum,
            NetSellVol: netSellLotVolume,
            NetSellValue: netSellValue,
            BuyerVol: 0,
            BuyerValue: 0,
            SellerVol: 0,
            SellerValue: 0,
            NetBuyVol: 0,
            NetBuyValue: 0,
            BuyerAvg: 0,
            SellerAvg: 0,
            TotalVolume: 0,
            AvgPrice: 0,
            TransactionCount: 0,
            TotalValue: 0
          };
          
          netSellDataArray.push({ stock, data: netSellData });
        }
      });
      
      // Sort by value (highest to lowest)
      netBuyDataArray.sort((a, b) => (b.data.NBVal || 0) - (a.data.NBVal || 0));
      netSellDataArray.sort((a, b) => (b.data.NSVal || 0) - (a.data.NSVal || 0));
      
      netBuyStocksByDate.set(date, netBuyDataArray);
      netSellStocksByDate.set(date, netSellDataArray);
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

  // Memoize stock color cache for O(1) lookup (moved outside render for better performance)
  const stockColorCache = useMemo(() => {
    const cache = new Map<string, { color: string; className: string }>();
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
    
    return {
      get: (stockCode: string, stockToSectorMap: { [stock: string]: string }): { color: string; className: string } => {
        if (!stockCode) return { color: '#FFFFFF', className: 'font-semibold' };
        const cacheKey = stockCode.toUpperCase();
        if (cache.has(cacheKey)) {
          return cache.get(cacheKey)!;
        }
        const stockSector = stockToSectorMap[cacheKey];
        if (!stockSector) {
          const result = { color: '#FFFFFF', className: 'font-semibold' };
          cache.set(cacheKey, result);
          return result;
        }
        const color = sectorColors[stockSector] || '#FFFFFF';
        const result = { color, className: 'font-semibold' };
        cache.set(cacheKey, result);
        return result;
      }
    };
  }, []);

  // Memoize sorted stocks for Total column to avoid recalculating on every render
  const sortedTotalBuyStocksMemo = useMemo(() => {
    return Array.from(totalBuyDataByStock.entries())
      .sort((a, b) => b[1].buyerValue - a[1].buyerValue)
      .map(([stock]) => stock);
  }, [totalBuyDataByStock]);

  const sortedTotalSellStocksMemo = useMemo(() => {
    return Array.from(totalSellDataByStock.entries())
      .sort((a, b) => b[1].sellerValue - a[1].sellerValue)
      .map(([stock]) => stock);
  }, [totalSellDataByStock]);

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
      
      // Helper function to get stock color class based on sector (using memoized cache)
      // CRITICAL: This should always work regardless of ticker selection - coloring is independent of filtering
      const getStockColorClass = (stockCode: string): { color: string; className: string } => {
        return stockColorCache.get(stockCode, stockToSectorMap);
      };
      
      // For VALUE table: Get max row count across all dates for Buy and Sell sections separately
      // CRITICAL: Filtering is done in loadTransactionData, so no need to filter here
      // Data is already filtered by ticker or sector at fetch time
      
      // CRITICAL: Total column ALWAYS uses sorted stocks from aggregated data
      // Reuse memoized sorted stocks to avoid recalculation
      const sortedTotalBuyStocks = sortedTotalBuyStocksMemo;
      const sortedTotalSellStocks = sortedTotalSellStocksMemo;
      
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
      // Base columns: BCode/Broker, BVal, BLot, BAvg, #, SCode/Stock, SVal, SLot, SAvg = 9
      // Optional: BFreq, Lot/F (2), BOr, Lot/Or (2), SFreq, Lot/F (2), SOr, Lot/Or (2) = 8
      const baseCols = 9;
      const optionalCols = (showFrequency ? 4 : 0) + (showOrder ? 4 : 0);
      const colsPerDate = baseCols + optionalCols;
      const totalCols = showOnlyTotal ? colsPerDate : (selectedDates.length * colsPerDate + colsPerDate);
      
      return (
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">B/S - {pivotFilter === 'Stock' ? (selectedTickers.length > 0 ? selectedTickers.join(', ') : '') : selectedBrokers.join(', ')}</h3>
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
                        colSpan={colsPerDate}
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={colsPerDate}>
                      Total
                    </th>
                  </tr>
                  {/* Column Header Row */}
                  <tr className="bg-[#3a4252]">
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        {/* Buyer Columns */}
                        <th className={`text-center py-[1px] px-[3px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} title={formatDisplayDate(date)} style={dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>{pivotFilter === 'Broker' ? 'BCode' : 'Broker'}</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BVal</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BLot</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BAvg</th>
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BFreq</th>}
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>}
                        {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BOr</th>}
                        {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-16" title={formatDisplayDate(date)}>Lot/Or</th>}
                        {/* Separator */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-auto min-w-[2.5rem] whitespace-nowrap" title={formatDisplayDate(date)}>#</th>
                        {/* Seller Columns */}
                        <th className="text-center py-[1px] px-[3px] font-bold text-white" title={formatDisplayDate(date)} style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}>{pivotFilter === 'Broker' ? 'SCode' : 'Stock'}</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SVal</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SLot</th>
                        {!showFrequency && !showOrder ? (
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>SAvg</th>
                        ) : (
                          <>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SAvg</th>
                            {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SFreq</th>}
                            {showFrequency && <th className={`text-center py-[1px] px-[6px] font-bold text-white w-8 ${!showOrder && dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrder && dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/F</th>}
                            {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SOr</th>}
                            {showOrder && <th className={`text-center py-[1px] px-[6px] font-bold text-white w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/Or</th>}
                          </>
                        )}
                      </React.Fragment>
                    ))}
                    {/* Total Columns */}
                    <th className={`text-center py-[1px] px-[3px] font-bold text-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={showOnlyTotal || selectedDates.length === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>{pivotFilter === 'Broker' ? 'BCode' : 'Broker'}</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BVal</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BLot</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BAvg</th>
                    {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BFreq</th>}
                    {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-8">Lot/F</th>}
                    {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BOr</th>}
                    {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-16">Lot/Or</th>}
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-auto min-w-[2.5rem] whitespace-nowrap">#</th>
                    <th className="text-center py-[1px] px-[3px] font-bold text-white" style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>{pivotFilter === 'Broker' ? 'SCode' : 'Stock'}</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SVal</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SLot</th>
                    {!showFrequency && !showOrder ? (
                      <th className="text-center py-[1px] px-[6px] font-bold text-white w-6 border-r-2 border-white">SAvg</th>
                    ) : (
                      <>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SAvg</th>
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SFreq</th>}
                        {showFrequency && <th className={`text-center py-[1px] px-[6px] font-bold text-white w-8 ${!showOrder ? 'border-r-2 border-white' : ''}`}>Lot/F</th>}
                        {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SOr</th>}
                        {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-16 border-r-2 border-white">Lot/Or</th>}
                      </>
                    )}
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
                                    // Use BAvg from CSV column 3, or calculate from BLot and BVal if BAvg is 0/missing
                                    const buyerAvg = (dayData.BuyerAvg && dayData.BuyerAvg !== 0) 
                                      ? dayData.BuyerAvg 
                                      : (buyerLot > 0 ? buyerVal / (buyerLot * 100) : 0);

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
                                    // For Stock pivot: BCode is a broker code, use getBrokerColorClass
                                    // For Broker pivot: BCode is a stock code, use getStockColorClass
                                    const bCodeColor = pivotFilter === 'Stock' 
                                      ? getBrokerColorClass(bCode)
                                      : getStockColorClass(bCode);
                                    return (
                                      <>
                            <td className={`text-center py-[1px] px-[3px] font-bold ${bCodeColor.className} ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ ...(dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }), color: bCodeColor.color }}>
                                          {bCode}
                            </td>
                                        <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(buyerVal)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLot(buyerLot)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(buyerAvg ?? 0)}</td>
                            {showFrequency && <td className="text-right py-[1px] px-[6px] font-bold text-lime-400 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{buyerFreq}</td>}
                            {showFrequency && <td className="text-right py-[1px] px-[6px] font-bold text-lime-400 w-8" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLotPerFreqOrOrdNum(buyerLotPerFreq ?? 0)}</td>}
                            {showOrder && <td className="text-right py-[1px] px-[6px] font-bold text-teal-400 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{buyerOrdNum}</td>}
                            {showOrder && <td className="text-right py-[1px] px-[6px] font-bold text-teal-400 w-16" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLotPerFreqOrOrdNum(buyerLotPerOrdNum ?? 0)}</td>}
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
                                  {showFrequency && <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>}
                                  {showFrequency && <td className="text-right py-[1px] px-[6px] text-gray-400 w-8">-</td>}
                                  {showOrder && <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>}
                                  {showOrder && <td className="text-right py-[1px] px-[6px] text-gray-400 w-16">-</td>}
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
                                    // Use SAvg from CSV column 11, or calculate from SLot and SVal if SAvg is 0/missing
                                    const sellerAvg = (dayData.SellerAvg && dayData.SellerAvg !== 0)
                                      ? dayData.SellerAvg
                                      : (sellerLot > 0 ? sellerVal / (sellerLot * 100) : 0);
                                    // Use SFreq from CSV column 12
                                    const sellerFreq = dayData.SFreq || 0;
                                    // Use SLotPerFreq directly from CSV column 13, no fallback
                                    const sellerLotPerFreq = dayData.SLotPerFreq;
                                    // Use NewSellerOrdNum for SOR display, fallback to SOrdNum if not available
                                    const sellerOrdNum = dayData.NewSellerOrdNum !== undefined ? dayData.NewSellerOrdNum : (dayData.SOrdNum || 0);
                                    // CRITICAL: For Broker pivot, use SLotPerOrdNum directly from CSV column 15, not calculated
                                    // This is the Lot/Or value for Sell section
                                    const sellerLotPerOrdNum = dayData.SLotPerOrdNum ?? 0;
                                    
                                    // OPTIMIZED: Removed debug logging to improve performance
                                    
                                    const sCode = String(dayData.SCode || sellRowData.stock || '');
                                    // For Stock pivot: SCode is a broker code, use getBrokerColorClass
                                    // For Broker pivot: SCode is a stock code, use getStockColorClass
                                    const sCodeColor = pivotFilter === 'Stock' 
                                      ? getBrokerColorClass(sCode)
                                      : getStockColorClass(sCode);
                                    return (
                                      <>
                                        <td className={`text-center py-[1px] px-[3px] font-bold ${sCodeColor.className}`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', color: sCodeColor.color }}>{sCode}</td>
                                        <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(sellerVal)}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLot(sellerLot)}</td>
                            {!showFrequency && !showOrder ? (
                              <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-6 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(sellerAvg ?? 0)}</td>
                            ) : (
                              <>
                            <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(sellerAvg ?? 0)}</td>
                                {showFrequency && <td className="text-right py-[1px] px-[6px] font-bold text-pink-400 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{sellerFreq}</td>}
                                {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-pink-400 w-8 ${!showOrder && dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrder && dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLotPerFreqOrOrdNum(sellerLotPerFreq ?? 0)}</td>}
                                {showOrder && <td className="text-right py-[1px] px-[6px] font-bold text-rose-500 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{sellerOrdNum}</td>}
                                {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold text-rose-500 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatLotPerFreqOrOrdNum(sellerLotPerOrdNum ?? 0)}
                                </td>}
                              </>
                            )}
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
                                  {!showFrequency && !showOrder ? (
                                    <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  ) : (
                                    <>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                      {showFrequency && <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>}
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8`}>-</td>}
                                      {showOrder && <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16`}>-</td>}
                                    </>
                                  )}
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
                            <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={baseCols + optionalCols}>
                                -
                            </td>
                          );
                        }
                        
                        // Get color classes for codes based on pivot type
                        // For Stock pivot: BCode/SCode are broker codes, use getBrokerColorClass
                        // For Broker pivot: BCode/SCode are stock codes, use getStockColorClass
                        const buyBCodeColor = totalBuyBCode !== '-' 
                          ? (pivotFilter === 'Stock' 
                              ? getBrokerColorClass(totalBuyBCode)
                              : getStockColorClass(totalBuyBCode))
                          : { color: '#FFFFFF', className: 'font-semibold' };
                        const sellSCodeColor = totalSellSCode !== '-' 
                          ? (pivotFilter === 'Stock' 
                              ? getBrokerColorClass(totalSellSCode)
                              : getStockColorClass(totalSellSCode))
                          : { color: '#FFFFFF', className: 'font-semibold' };
                        
                        return (
                          <React.Fragment>
                              {/* Buyer Total Columns */}
                              {totalBuyBCode !== '-' && Math.abs(totalBuyLot) > 0 ? (
                                <>
                            <td className={`text-center py-[1px] px-[3px] font-bold ${buyBCodeColor.className} ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={showOnlyTotal || selectedDates.length === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none', color: buyBCodeColor.color } : { width: '48px', minWidth: '48px', maxWidth: '48px', color: buyBCodeColor.color }}>
                                    {totalBuyBCode}
                            </td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(totalBuyValue)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLot(totalBuyLot)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-green-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(finalBuyAvg)}</td>
                                  {showFrequency && <td className="text-right py-[1px] px-[6px] font-bold text-lime-400 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalBuyFreq}</td>}
                                  {showFrequency && <td className="text-right py-[1px] px-[6px] font-bold text-lime-400 w-8" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLotPerFreqOrOrdNum(totalBuyLotPerFreq)}</td>}
                                  {showOrder && <td className="text-right py-[1px] px-[6px] font-bold text-teal-400 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalBuyOrdNum}</td>}
                                  {showOrder && <td className="text-right py-[1px] px-[6px] font-bold text-teal-400 w-16" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLotPerFreqOrOrdNum(totalBuyLotPerOrdNum)}</td>}
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={showOnlyTotal || selectedDates.length === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  {!showFrequency && !showOrder ? (
                                    <td className="text-right py-[1px] px-[6px] text-gray-400 w-6 border-r-2 border-white">-</td>
                                  ) : (
                                    <>
                                      <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                      {showFrequency && <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>}
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8 ${!showOrder ? 'border-r-2 border-white' : ''}`}>-</td>}
                                      {showOrder && <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>}
                                      {showOrder && <td className="text-right py-[1px] px-[6px] text-gray-400 w-16 border-r-2 border-white">-</td>}
                                    </>
                                  )}
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
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(totalSellValue)}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLot(totalSellLot)}</td>
                                  {!showFrequency && !showOrder ? (
                                    <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6 border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(finalSellAvg)}</td>
                                  ) : (
                                    <>
                                      <td className="text-right py-[1px] px-[6px] font-bold text-red-600 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAverage(finalSellAvg)}</td>
                                      {showFrequency && <td className="text-right py-[1px] px-[6px] font-bold text-pink-400 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalSellFreq}</td>}
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-pink-400 w-8 ${!showOrder ? 'border-r-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLotPerFreqOrOrdNum(totalSellLotPerFreq)}</td>}
                                      {showOrder && <td className="text-right py-[1px] px-[6px] font-bold text-rose-500 w-6" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalSellOrdNum}</td>}
                                      {showOrder && <td className="text-right py-[1px] px-[6px] font-bold text-rose-500 w-16 border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatLotPerFreqOrOrdNum(totalSellLotPerOrdNum)}
                                      </td>}
                                    </>
                                  )}
                                </>
                              ) : (
                                <>
                                  <td className="text-center py-[1px] px-[3px] text-gray-400" style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                  {!showFrequency && !showOrder ? (
                                    <td className="text-right py-[1px] px-[6px] text-gray-400 w-6 border-r-2 border-white">-</td>
                                  ) : (
                                    <>
                                      <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>
                                      {showFrequency && <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>}
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8 ${!showOrder ? 'border-r-2 border-white' : ''}`}>-</td>}
                                      {showOrder && <td className="text-right py-[1px] px-[6px] text-gray-400 w-6">-</td>}
                                      {showOrder && <td className="text-right py-[1px] px-[6px] text-gray-400 w-16 border-r-2 border-white">-</td>}
                                    </>
                                  )}
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
                    <td colSpan={totalCols} ref={valueTableSentinelRef} className="h-10">
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
      // Use already computed totalNetBuyDataByStock and totalNetSellDataByStock from useMemo
      // Sort Net Buy stocks by value (highest to lowest)
      const sortedTotalNetBuyStocks = Array.from(totalNetBuyDataByStock.entries())
        .filter(([, data]) => Math.abs(data.netBuyLot || 0) > 0)
        .sort((a, b) => (b[1].netBuyValue || 0) - (a[1].netBuyValue || 0))
        .map(([stock]) => stock);
      
      // Sort Net Sell stocks by value (highest to lowest)
      const sortedTotalNetSellStocks = Array.from(totalNetSellDataByStock.entries())
        .filter(([, data]) => Math.abs(data.netSellLot || 0) > 0)
        .sort((a, b) => (b[1].netSellValue || 0) - (a[1].netSellValue || 0))
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
      
      // Calculate total columns for "No Data Available" message (NET table)
      // Base columns: BCode/Broker, BVal, BLot, BAvg, #, SCode/Stock, SVal, SLot, SAvg = 9
      // Optional: BFreq, Lot/F (2), BOr, Lot/Or (2), SFreq, Lot/F (2), SOr, Lot/Or (2) = 8
      const netBaseCols = 9;
      const netOptionalCols = (showFrequency ? 4 : 0) + (showOrder ? 4 : 0);
      const netColsPerDate = netBaseCols + netOptionalCols;
      const netTotalCols = showOnlyTotal ? netColsPerDate : (selectedDates.length * netColsPerDate + netColsPerDate);
    
    return (
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">NET - {pivotFilter === 'Stock' ? (selectedTickers.length > 0 ? selectedTickers.join(', ') : '') : selectedBrokers.join(', ')}</h3>
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
                        colSpan={netColsPerDate}
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={netColsPerDate}>
                      Total
                    </th>
                  </tr>
                  {/* Column Header Row */}
                  <tr className="bg-[#3a4252]">
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        {/* Net Buy Columns (from CSV columns 17-23) */}
                        <th className={`text-center py-[1px] px-[3px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} title={formatDisplayDate(date)} style={dateIndex === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>{pivotFilter === 'Broker' ? 'BCode' : 'Broker'}</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BVal</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BLot</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BAvg</th>
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BFreq</th>}
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>}
                        {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>BOr</th>}
                        {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-16" title={formatDisplayDate(date)}>Lot/Or</th>}
                        {/* Separator */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-auto min-w-[2.5rem] whitespace-nowrap" title={formatDisplayDate(date)}>#</th>
                        {/* Net Sell Columns (from CSV columns 24-30) */}
                        <th className="text-center py-[1px] px-[3px] font-bold text-white" title={formatDisplayDate(date)} style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}>{pivotFilter === 'Broker' ? 'SCode' : 'Stock'}</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SVal</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SLot</th>
                        {!showFrequency && !showOrder ? (
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>SAvg</th>
                        ) : (
                          <>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SAvg</th>
                            {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SFreq</th>}
                            {showFrequency && <th className={`text-center py-[1px] px-[6px] font-bold text-white w-8 ${!showOrder && dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrder && dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/F</th>}
                            {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6" title={formatDisplayDate(date)}>SOr</th>}
                            {showOrder && <th className={`text-center py-[1px] px-[6px] font-bold text-white w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/Or</th>}
                          </>
                        )}
                      </React.Fragment>
                    ))}
                    {/* Total Columns - Net Buy/Net Sell */}
                    <th className={`text-center py-[1px] px-[3px] font-bold text-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={showOnlyTotal || selectedDates.length === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>{pivotFilter === 'Broker' ? 'BCode' : 'Broker'}</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BVal</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BLot</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BAvg</th>
                    {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BFreq</th>}
                    {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-8">Lot/F</th>}
                    {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">BOr</th>}
                    {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-16">Lot/Or</th>}
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-auto min-w-[2.5rem] whitespace-nowrap">#</th>
                    <th className="text-center py-[1px] px-[3px] font-bold text-white" style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>{pivotFilter === 'Broker' ? 'SCode' : 'Stock'}</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SVal</th>
                    <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SLot</th>
                    {!showFrequency && !showOrder ? (
                      <th className="text-center py-[1px] px-[6px] font-bold text-white w-6 border-r-2 border-white">SAvg</th>
                    ) : (
                      <>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SAvg</th>
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SFreq</th>}
                        {showFrequency && <th className={`text-center py-[1px] px-[6px] font-bold text-white w-8 ${!showOrder ? 'border-r-2 border-white' : ''}`}>Lot/F</th>}
                        {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-6">SOr</th>}
                        {showOrder && <th className="text-center py-[1px] px-[6px] font-bold text-white w-16 border-r-2 border-white">Lot/Or</th>}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tableMaxRows === 0 || transactionData.size === 0 ? (
                    // If no data, show "No Data Available" message
                    <tr className="border-b-2 border-white">
                      <td 
                        colSpan={netTotalCols} 
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
                                    // For Stock pivot: NBCode is a broker code, use getBrokerColorClass
                                    // For Broker pivot: NBCode is a stock code, use getStockColorClass
                                    const nbCodeColor = pivotFilter === 'Stock' 
                                      ? getBrokerColorClass(nbCode)
                                      : getStockColorClass(nbCode);
                                    const nbLot = dayData.NBLot || 0;
                                    const nbVal = dayData.NBVal || dayData.NetBuyValue || 0;
                                    // Use NBAvg from data, or calculate from NBLot and NBVal if NBAvg is 0/missing
                                    const nbAvg = (dayData.NBAvg && dayData.NBAvg !== 0)
                                      ? dayData.NBAvg
                                      : (nbLot > 0 ? nbVal / (nbLot * 100) : 0);
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
                                        {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-lime-400 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {nbFreq}
                                        </td>}
                                        {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-lime-400 w-8`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatLotPerFreqOrOrdNum(nbLotPerFreq ?? 0)}
                                        </td>}
                                        {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold text-teal-400 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {nbOrdNum}
                                        </td>}
                                        {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold text-teal-400 w-16`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatLotPerFreqOrOrdNum(nbLotPerOrdNum ?? 0)}
                                        </td>}
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
                                  {!showFrequency && !showOrder ? (
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  ) : (
                                    <>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>}
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8`}>-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16`}>-</td>}
                                    </>
                                  )}
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
                                    // For Stock pivot: NSCode is a broker code, use getBrokerColorClass
                                    // For Broker pivot: NSCode is a stock code, use getStockColorClass
                                    const nsCodeColor = pivotFilter === 'Stock' 
                                      ? getBrokerColorClass(nsCode)
                                      : getStockColorClass(nsCode);
                                    const nsLot = dayData.NSLot || 0;
                                    const nsVal = dayData.NSVal || dayData.NetSellValue || 0;
                                    // Use NSAvg from data, or calculate from NSLot and NSVal if NSAvg is 0/missing
                                    const nsAvg = (dayData.NSAvg && dayData.NSAvg !== 0)
                                      ? dayData.NSAvg
                                      : (nsLot > 0 ? nsVal / (nsLot * 100) : 0);
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
                                        {!showFrequency && !showOrder ? (
                                          <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-6 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {formatAverage(nsAvg ?? 0)}
                            </td>
                                        ) : (
                                          <>
                                        <td className={`text-right py-[1px] px-[6px] font-bold text-red-600 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                              {formatAverage(nsAvg ?? 0)}
                            </td>
                                            {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-pink-400 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                              {nsFreq}
                                            </td>}
                                            {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-pink-400 w-8 ${!showOrder && dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrder && dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                              {formatLotPerFreqOrOrdNum(nsLotPerFreq ?? 0)}
                                            </td>}
                                            {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold text-rose-500 w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                          {nsOrdNum}
                                            </td>}
                                            {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold text-rose-500 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                              {formatLotPerFreqOrOrdNum(nsLotPerOrdNum ?? 0)}
                                            </td>}
                                          </>
                                        )}
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
                                  {!showFrequency && !showOrder ? (
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  ) : (
                                    <>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>}
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8`}>-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16`}>-</td>}
                                    </>
                                  )}
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
                          const netBuyData = netBuyStockCode ? totalNetBuyDataByStock.get(netBuyStockCode) : null;
                          
                          // Get Net Sell stock at this row index (from sorted stocks calculated above)
                          const netSellStockCode = sortedTotalNetSellStocks[rowIdx] || '';
                          const netSellData = netSellStockCode ? totalNetSellDataByStock.get(netSellStockCode) : null;
                          
                          // If both are empty, hide row
                          if (!netBuyData && !netSellData) {
                            return (
                              <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={netColsPerDate}>
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
                              <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={netColsPerDate}>
                                -
                              </td>
                            );
                          }
                          
                          // Get color classes for codes based on pivot type
                          // For Stock pivot: NBCode/NSCode are broker codes, use getBrokerColorClass
                          // For Broker pivot: NBCode/NSCode are stock codes, use getStockColorClass
                          const netBuyNBCodeColor = totalNetBuyNBCode !== '-' 
                            ? (pivotFilter === 'Stock' 
                                ? getBrokerColorClass(totalNetBuyNBCode)
                                : getStockColorClass(totalNetBuyNBCode))
                            : { color: '#FFFFFF', className: 'font-semibold' };
                          const netSellNSCodeColor = totalNetSellNSCode !== '-' 
                            ? (pivotFilter === 'Stock' 
                                ? getBrokerColorClass(totalNetSellNSCode)
                                : getStockColorClass(totalNetSellNSCode))
                            : { color: '#FFFFFF', className: 'font-semibold' };
                          
                          // Color for values: Net Buy values are green, Net Sell values are red
                          const totalNetBuyColor = 'text-green-600';
                          const totalNetSellColor = 'text-red-600';
                          // Color for frequency columns: Net Buy frequency is neon green, Net Sell frequency is bright pink
                          const totalNetBuyFreqColor = 'text-lime-400';
                          const totalNetSellFreqColor = 'text-pink-400';
                          // Color for order columns: Net Buy order is teal (more contrast than green-600), Net Sell order is rose (more contrast than red-600)
                          const totalNetBuyOrderColor = 'text-teal-400';
                          const totalNetSellOrderColor = 'text-rose-500';
                        
                        return (
                          <React.Fragment>
                              {/* Net Buy Total Columns */}
                              {netBuyData && Math.abs(totalNetBuyLot) > 0 ? (
                                <>
                            <td className={`text-center py-[1px] px-[3px] font-bold ${netBuyNBCodeColor.className} ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={showOnlyTotal || selectedDates.length === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none', color: netBuyNBCodeColor.color } : { width: '48px', minWidth: '48px', maxWidth: '48px', color: netBuyNBCodeColor.color }}>
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
                            {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyFreqColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetBuyFreq}
                            </td>}
                            {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyFreqColor} w-8`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatLotPerFreqOrOrdNum(totalNetBuyLotPerFreq)}
                                  </td>}
                            {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyOrderColor}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetBuyOrdNum}
                                  </td>}
                            {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetBuyOrderColor} w-16`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatLotPerFreqOrOrdNum(totalNetBuyLotPerOrdNum)}
                                  </td>}
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400 ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={showOnlyTotal || selectedDates.length === 0 ? { width: 'auto', minWidth: 'fit-content', maxWidth: 'none' } : { width: '48px', minWidth: '48px', maxWidth: '48px' }}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                  {!showFrequency && !showOrder ? (
                                    <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6 border-r-2 border-white`}>-</td>
                                  ) : (
                                    <>
                                      <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>}
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8 ${!showOrder ? 'border-r-2 border-white' : ''}`}>-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-6`}>-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16 border-r-2 border-white`}>-</td>}
                                    </>
                                  )}
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
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor} w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatValue(totalNetSellValue)}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor} w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatLot(totalNetSellLot)}
                            </td>
                            {!showFrequency && !showOrder ? (
                              <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor} w-6 border-r-2 border-white`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatAverage(finalNetSellAvg)}
                            </td>
                            ) : (
                              <>
                                <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor} w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {formatAverage(finalNetSellAvg)}
                            </td>
                                {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellFreqColor} w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {totalNetSellFreq}
                                </td>}
                                {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellFreqColor} w-8 ${!showOrder ? 'border-r-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {formatLotPerFreqOrOrdNum(totalNetSellLotPerFreq)}
                                  </td>}
                                {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellOrderColor} w-6`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {totalNetSellOrdNum}
                                  </td>}
                                {showOrder && <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellOrderColor} w-16 border-r-2 border-white`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {formatLotPerFreqOrOrdNum(totalNetSellLotPerOrdNum)}
                                  </td>}
                              </>
                            )}
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[3px] text-gray-400`} style={{ width: '48px', minWidth: '48px', maxWidth: '48px', boxSizing: 'border-box' }}>-</td>
                                  {!showFrequency && !showOrder ? (
                                    <td className={`text-right py-[1px] px-[6px] text-gray-400 border-r-2 border-white`}>-</td>
                                  ) : (
                                    <>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>}
                                      {showFrequency && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-8 ${!showOrder ? 'border-r-2 border-white' : ''}`}>-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400`}>-</td>}
                                      {showOrder && <td className={`text-right py-[1px] px-[6px] text-gray-400 w-16 border-r-2 border-white`}>-</td>}
                                    </>
                                  )}
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
                    <td colSpan={showOnlyTotal ? netColsPerDate : (selectedDates.length * netColsPerDate + netColsPerDate)} ref={netTableSentinelRef} className="h-10">
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

    // Total Table - Per Date Totals with 4 columns
    const renderAggregateSummaryTable = () => {
      const showOnlyTotal = selectedDates.length > 7;
      
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
      let grandTotalLot = 0;

      selectedDates.forEach((date: string) => {
        const dateData = transactionData.get(date) || [];
        let dateTotalValue = 0;
        let dateTotalLot = 0;
        let dateForeignBuyValue = 0;
        let dateForeignSellValue = 0;

        dateData.forEach(item => {
          const buyVal = Number(item.BuyerValue) || 0;
          const sellVal = Number(item.SellerValue) || 0;
          
          // TVal: Only count buyer value (not buyer + seller, that would be double counting)
          // Since every transaction has a buyer and seller with same value
          dateTotalValue += buyVal;

          const buyLot = Number(item.BLot) || 0;
          dateTotalLot += buyLot;

          const bCode = (item.BCode || '').toUpperCase();
          const sCode = (item.SCode || '').toUpperCase();
          if (bCode && FOREIGN_BROKERS.includes(bCode)) {
            dateForeignBuyValue += buyVal;
          }
          if (sCode && FOREIGN_BROKERS.includes(sCode)) {
            dateForeignSellValue += sellVal;
          }
        });

        const dateForeignNetValue = dateForeignBuyValue - dateForeignSellValue;
        const dateAvgPrice = dateTotalLot > 0 ? dateTotalValue / (dateTotalLot * 100) : 0;

        totalsByDate.set(date, {
          totalValue: dateTotalValue,
          foreignNetValue: dateForeignNetValue,
          totalLot: dateTotalLot,
          avgPrice: dateAvgPrice
        });

        grandTotalValue += dateTotalValue;
        grandTotalLot += dateTotalLot;
        grandForeignBuyValue += dateForeignBuyValue;
        grandForeignSellValue += dateForeignSellValue;
      });

      // Calculate grand totals
      const grandForeignNetValue = grandForeignBuyValue - grandForeignSellValue;
      const grandAvgPrice = grandTotalLot > 0 ? grandTotalValue / (grandTotalLot * 100) : 0;

      return (
        <div className="w-full max-w-full mt-2">
          <div className={`${showOnlyTotal ? 'flex justify-center' : 'w-full max-w-full'}`}>
            <div ref={totalTableContainerRef} className={`${showOnlyTotal ? 'w-auto' : 'w-full max-w-full'} overflow-x-auto border-l-2 border-r-2 border-b-2 border-white`}>
              <table ref={totalTableRef} className={`${showOnlyTotal ? 'min-w-0' : 'min-w-[1000px]'} ${getFontSizeClass()} table-auto`} style={{ tableLayout: showOnlyTotal ? 'auto' : (dateColumnWidthsRef.current.size > 0 && totalColumnWidthRef.current > 0 ? 'fixed' : 'auto') }}>
                <thead className="bg-[#3a4252]">
                  <tr className="border-t-2 border-white">
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => {
                      const dateWidth = dateColumnWidthsRef.current.get(date);
                      return (
                        <th 
                          key={date} 
                          className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} 
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
                      className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} 
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
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => {
                      const dateWidth = dateColumnWidthsRef.current.get(date);
                      const colWidth = dateWidth ? dateWidth / 4 : undefined;
                      return (
                        <React.Fragment key={`detail-${date}`}>
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ textAlign: 'center', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>TVal</th>
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white`} style={{ textAlign: 'center', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>FNVal</th>
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white`} style={{ textAlign: 'center', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>TLot</th>
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ textAlign: 'center', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>Avg</th>
                        </React.Fragment>
                      );
                    })}
                    {/* Total Columns */}
                    {(() => {
                      const totalColWidth = totalColumnWidthRef.current > 0 ? totalColumnWidthRef.current / 4 : undefined;
                      return (
                        <>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ textAlign: 'center', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>TVal</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>FNVal</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>TLot</th>
                          <th className={`text-center py-[1px] px-[7px] font-bold text-white border-r-2 border-white`} style={{ textAlign: 'center', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>Avg</th>
                        </>
                      );
                    })()}
                  </tr>
                </thead>
                <tbody className="text-[12px]">
                  <tr className="bg-[#0f172a] border-b-2 border-white">
                    {!showOnlyTotal && selectedDates.map((date, dateIndex) => {
                      const dateTotals = totalsByDate.get(date);
                      const dateWidth = dateColumnWidthsRef.current.get(date);
                      const colWidth = dateWidth ? dateWidth / 4 : undefined;
                      
                      if (!dateTotals) {
                        return (
                          <React.Fragment key={date}>
                            <td className={`text-center py-[1px] px-[6px] text-white font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>-</td>
                            <td className="text-center py-[1px] px-[6px] text-white font-bold" style={{ width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>-</td>
                            <td className="text-center py-[1px] px-[6px] text-white font-bold" style={{ width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>-</td>
                            <td className={`text-center py-[1px] px-[6px] text-white font-bold ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>-</td>
                          </React.Fragment>
                        );
                      }

                      const foreignNetClass = dateTotals.foreignNetValue > 0 ? 'text-green-500' : dateTotals.foreignNetValue < 0 ? 'text-red-500' : 'text-white';

                      return (
                        <React.Fragment key={date}>
                          <td className={`text-center py-[1px] px-[6px] text-white font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>
                            {formatValue(dateTotals.totalValue)}
                          </td>
                          <td className={`text-center py-[1px] px-[6px] font-bold ${foreignNetClass}`} style={{ fontVariantNumeric: 'tabular-nums', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>
                            {formatValue(dateTotals.foreignNetValue)}
                          </td>
                          <td className="text-center py-[1px] px-[6px] text-white font-bold" style={{ fontVariantNumeric: 'tabular-nums', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>
                            {formatLot(dateTotals.totalLot)}
                          </td>
                          <td className={`text-center py-[1px] px-[6px] text-white font-bold ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums', width: colWidth ? `${colWidth}px` : undefined, minWidth: colWidth ? `${colWidth}px` : undefined, maxWidth: colWidth ? `${colWidth}px` : undefined }}>
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
                          <td className={`text-center py-[1px] px-[5px] text-white font-bold ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ fontVariantNumeric: 'tabular-nums', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>
                            {formatValue(grandTotalValue)}
                          </td>
                          <td className={`text-center py-[1px] px-[5px] font-bold ${grandForeignNetClass}`} style={{ fontVariantNumeric: 'tabular-nums', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>
                            {formatValue(grandForeignNetValue)}
                          </td>
                          <td className="text-center py-[1px] px-[5px] text-white font-bold" style={{ fontVariantNumeric: 'tabular-nums', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>
                            {formatLot(grandTotalLot)}
                          </td>
                          <td className="text-center py-[1px] px-[7px] text-white font-bold border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums', width: totalColWidth ? `${totalColWidth}px` : undefined, minWidth: totalColWidth ? `${totalColWidth}px` : undefined, maxWidth: totalColWidth ? `${totalColWidth}px` : undefined }}>
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
    };
    
    return (
      <div className="w-full">
        {renderValueTable()}
        {renderNetTable()}
        {renderAggregateSummaryTable()}
      </div>
    );
    }, [filteredStocks, uniqueStocks, sortedStocksByDate, sortedNetStocksByDate, totalDataByStock, totalNetDataByStock, sortedTotalStocks, sortedTotalNetStocks, transactionData, visibleRowIndices, buyStocksByDate, sellStocksByDate, netBuyStocksByDate, netSellStocksByDate, totalNetBuyDataByStock, totalNetSellDataByStock, isDataReady, selectedDates, activeSectorFilter, selectedSectors, stockToSectorMap, pivotFilter, selectedTickers, selectedBrokers]); // CRITICAL: Added selectedDates, activeSectorFilter, selectedSectors, stockToSectorMap, pivotFilter, selectedTickers, and selectedBrokers to dependencies to react to showOnlyTotal, sector filter changes, pivot type changes, and header text updates

  // Helper function to get broker color class based on type
  // Memoize broker color cache for O(1) lookup
  const brokerColorCache = useMemo(() => {
    const cache = new Map<string, { color: string; className: string }>();
    const govSet = new Set(GOVERNMENT_BROKERS);
    const foreignSet = new Set(FOREIGN_BROKERS);
    
    return {
      get: (brokerCode: string): { color: string; className: string } => {
        if (cache.has(brokerCode)) {
          return cache.get(brokerCode)!;
        }
        let result: { color: string; className: string };
        if (govSet.has(brokerCode)) {
          result = { color: '#10B981', className: 'font-semibold' }; // Green-600
        } else if (foreignSet.has(brokerCode)) {
          result = { color: '#EF4444', className: 'font-semibold' }; // Red-600
        } else {
          result = { color: '#FFFFFF', className: 'font-semibold' }; // White
        }
        cache.set(brokerCode, result);
        return result;
      }
    };
  }, []);
  
  const getBrokerColorClass = useCallback((brokerCode: string): { color: string; className: string } => {
    return brokerColorCache.get(brokerCode);
  }, [brokerColorCache]);

  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      {/* Pada layar kecil/menengah menu ikut scroll; hanya di layar besar (lg+) yang fixed di top */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1 lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
        <div ref={menuContainerRef} className="flex flex-col md:flex-row md:flex-wrap items-center gap-2 md:gap-x-7 md:gap-y-0.2">
          {/* Broker Selection - Dropdown only */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Broker:</label>
            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Broker Input with selected count */}
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
                    const suggestions = filteredBrokersList.slice(0, 10);
                    
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
                  placeholder={selectedBrokers.length > 0 ? `${selectedBrokers.length} selected` : "Add broker"}
                  className="w-full md:w-32 h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
                    role="combobox"
                    aria-expanded={showBrokerSuggestions}
                    aria-controls="broker-suggestions"
                    aria-autocomplete="list"
                  />
                  {showBrokerSuggestions && (
                  <div id="broker-suggestions" role="listbox" className="absolute top-full left-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-y-auto w-40"
                    onScroll={(e) => {
                      const target = e.target as HTMLElement;
                      const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
                      if (scrollBottom < 100 && brokerScrollOffset + ITEMS_PER_PAGE < filteredBrokersList.length) {
                        setBrokerScrollOffset(prev => prev + ITEMS_PER_PAGE);
                      }
                    }}
                  >
                      {availableBrokers.length === 0 ? (
                        <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading brokers...
                        </div>
                    ) : (
                      <>
                        {/* Selected Brokers Section */}
                        {selectedBrokers.length > 0 && (
                          <>
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover flex items-center justify-between">
                              <span>Selected ({selectedBrokers.length})</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearAllBrokers();
                                }}
                                className="text-xs text-destructive hover:text-destructive/80 font-medium"
                              >
                                Clear
                              </button>
                        </div>
                            {selectedBrokers.map(broker => {
                              const brokerColor = broker !== 'ALL' ? getBrokerColorClass(broker) : null;
                              return (
                                <div
                                  key={broker}
                                  className="px-3 py-[2.06px] hover:bg-muted flex items-center justify-between"
                                >
                                  <span className={`text-sm ${brokerColor?.className || ''}`} style={brokerColor ? { color: brokerColor.color } : {}}>
                                    {broker}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveBroker(broker);
                                    }}
                                    className="text-muted-foreground hover:text-destructive text-sm"
                                    aria-label={`Remove ${broker}`}
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                              {debouncedBrokerInput === '' ? `Available (${filteredBrokersList.length})` : 'Search Results'}
                            </div>
                          </>
                        )}
                        {/* Available Brokers Section */}
                        {debouncedBrokerInput === '' ? (
                          <>
                            {!selectedBrokers.includes('ALL') && (
                              <div
                                onClick={() => handleBrokerSelect('ALL')}
                                className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm font-semibold text-primary"
                              >
                                ALL
                              </div>
                            )}
                            {visibleFilteredBrokers.map((broker, idx) => (
                          <div
                            key={broker}
                            onClick={() => handleBrokerSelect(broker)}
                                className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedIndex ? 'bg-accent' : ''}`}
                                onMouseEnter={() => setHighlightedIndexOptimized(idx)}
                          >
                            {broker}
                          </div>
                        ))}
                            {brokerScrollOffset + ITEMS_PER_PAGE < filteredBrokersList.length && (
                              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                Loading more... ({Math.min(brokerScrollOffset + ITEMS_PER_PAGE, filteredBrokersList.length)} / {filteredBrokersList.length})
                              </div>
                            )}
                      </>
                    ) : (() => {
                          const searchLower = debouncedBrokerInput.toLowerCase();
                          const isAllMatch = 'all'.includes(searchLower) && !selectedBrokers.includes('ALL');
                      return (
                            <>
                              {isAllMatch && (
                                <div
                                  onClick={() => handleBrokerSelect('ALL')}
                                  className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm font-semibold text-primary"
                                >
                                  ALL
                          </div>
                              )}
                              {visibleFilteredBrokers.length > 0 ? (
                                visibleFilteredBrokers.map((broker, idx) => (
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
                              {brokerScrollOffset + ITEMS_PER_PAGE < filteredBrokersList.length && (
                                <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                  Loading more... ({Math.min(brokerScrollOffset + ITEMS_PER_PAGE, filteredBrokersList.length)} / {filteredBrokersList.length})
                            </div>
                          )}
                            </>
                      );
                    })()}
                      </>
                    )}
                    </div>
                  )}
              </div>
            </div>
          </div>

              {/* Ticker Multi-Select (Combined) - Dropdown only */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none" ref={dropdownTickerRef}>
                <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type="text"
                  placeholder={selectedTickers.length > 0 ? `${selectedTickers.length} selected` : "Add ticker"}
                  value={tickerInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTickerInput(v);
                    setShowTickerSuggestions(true);
                    setHighlightedTickerIndex(0);
                  }}
                  onFocus={() => setShowTickerSuggestions(true)}
                  onKeyDown={(e) => {
                    // Combine suggestions: tickers first, then sectors
                    const allSuggestions: Array<{ type: 'ticker' | 'sector'; value: string }> = [
                      ...filteredTickersList.map(t => ({ type: 'ticker' as const, value: t })),
                      ...filteredSectorsList.map(s => ({ type: 'sector' as const, value: s }))
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
                <div id="ticker-suggestions" role="listbox" className="absolute top-full left-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col w-64">
                  {isLoadingStocks || (availableTickers.length === 0 && availableStocksFromAPI.length === 0) ? (
                    <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading stocks...
                    </div>
                  ) : (
                    <>
                        {/* Selected Items Section */}
                        {(selectedTickers.length > 0 || selectedSectors.length > 0) && (
                          <div className="border-b border-[#3a4252] overflow-y-auto" style={{ minHeight: '120px', maxHeight: `${Math.min((selectedTickers.length + selectedSectors.length) * 24 + 30, 250)}px` }}>
                            <div className="px-3 py-1 text-xs text-muted-foreground sticky top-0 bg-popover flex items-center justify-between">
                              <span>Selected ({selectedTickers.length + selectedSectors.length})</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearAllTickers();
                                  setSelectedSectors([]);
                                }}
                                className="text-xs text-destructive hover:text-destructive/80 font-medium"
                              >
                                Clear
                              </button>
                            </div>
                            {selectedTickers.map(ticker => (
                              <div
                                key={`selected-ticker-${ticker}`}
                                className="px-3 py-1 hover:bg-muted flex items-center justify-between min-h-[24px]"
                              >
                                <span className="text-sm text-primary">{ticker}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveTicker(ticker);
                                  }}
                                  className="text-muted-foreground hover:text-destructive text-sm"
                                  aria-label={`Remove ${ticker}`}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {selectedSectors.map(sector => (
                              <div
                                key={`selected-sector-${sector}`}
                                className="px-3 py-1 hover:bg-muted flex items-center justify-between min-h-[24px]"
                              >
                                <span className="text-sm text-blue-400">{sector === 'IDX' ? 'IDX Composite' : sector}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveSector(sector);
                                  }}
                                  className="text-muted-foreground hover:text-destructive text-sm"
                                  aria-label={`Remove ${sector === 'IDX' ? 'IDX Composite' : sector}`}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      {/* Search Results Section */}
                      <div className="flex flex-row flex-1 overflow-hidden">
                        {/* Left column: Tickers */}
                          <div 
                            className="flex-1 border-r border-[#3a4252] overflow-y-auto"
                            onScroll={(e) => {
                              const target = e.target as HTMLElement;
                              const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
                              if (scrollBottom < 100 && tickerScrollOffset + ITEMS_PER_PAGE < filteredTickersList.length) {
                                setTickerScrollOffset(prev => prev + ITEMS_PER_PAGE);
                              }
                            }}
                          >
                            {debouncedTickerInput === '' ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                  Stocks ({filteredTickersList.length})
                              </div>
                              {visibleFilteredTickers.map((ticker, idx) => {
                                return (
                                  <div
                                    key={`ticker-${ticker}`}
                                    onClick={() => handleTickerSelect(ticker)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedTickerIndexOptimized(idx)}
                                  >
                                    {ticker}
                                  </div>
                                );
                              })}
                              {tickerScrollOffset + ITEMS_PER_PAGE < filteredTickersList.length && (
                                <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                  Loading more... ({Math.min(tickerScrollOffset + ITEMS_PER_PAGE, filteredTickersList.length)} / {filteredTickersList.length})
                                </div>
                              )}
                            </>
                          ) : filteredTickersList.length > 0 ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                Stocks ({filteredTickersList.length})
                              </div>
                              {visibleFilteredTickers.map((ticker, idx) => {
                                return (
                                  <div
                                    key={`ticker-${ticker}`}
                                    onClick={() => handleTickerSelect(ticker)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedTickerIndexOptimized(idx)}
                                  >
                                    {ticker}
                                  </div>
                                );
                              })}
                              {tickerScrollOffset + ITEMS_PER_PAGE < filteredTickersList.length && (
                                <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                  Loading more... ({Math.min(tickerScrollOffset + ITEMS_PER_PAGE, filteredTickersList.length)} / {filteredTickersList.length})
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                              Stocks (0)
                            </div>
                          )}
                        </div>
                        {/* Right column: Sectors */}
                        <div 
                          className="flex-1 overflow-y-auto"
                          onScroll={(e) => {
                            const target = e.target as HTMLElement;
                            const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
                            if (scrollBottom < 100 && sectorScrollOffset + ITEMS_PER_PAGE < filteredSectorsList.length) {
                              setSectorScrollOffset(prev => prev + ITEMS_PER_PAGE);
                            }
                          }}
                        >
                          {debouncedTickerInput === '' ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                Sectors ({filteredSectorsList.length})
                              </div>
                              {visibleFilteredSectors.map((sector, idx) => {
                                const itemIndex = filteredTickersList.length + idx;
                                return (
                                  <div
                                    key={`sector-${sector}`}
                                    onClick={() => handleSectorSelect(sector)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${itemIndex === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedTickerIndexOptimized(itemIndex)}
                                  >
                                    {sector === 'IDX' ? 'IDX Composite' : sector}
                                  </div>
                                );
                              })}
                              {sectorScrollOffset + ITEMS_PER_PAGE < filteredSectorsList.length && (
                                <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                  Loading more... ({Math.min(sectorScrollOffset + ITEMS_PER_PAGE, filteredSectorsList.length)} / {filteredSectorsList.length})
                                </div>
                              )}
                            </>
                          ) : filteredSectorsList.length > 0 ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                Sectors ({filteredSectorsList.length})
                              </div>
                              {visibleFilteredSectors.map((sector, idx) => {
                                const itemIndex = filteredTickersList.length + idx;
                                return (
                                  <div
                                    key={`sector-${sector}`}
                                    onClick={() => handleSectorSelect(sector)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${itemIndex === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedTickerIndexOptimized(itemIndex)}
                                  >
                                    {sector === 'IDX' ? 'IDX Composite' : sector}
                                  </div>
                                );
                              })}
                              {sectorScrollOffset + ITEMS_PER_PAGE < filteredSectorsList.length && (
                                <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                  Loading more... ({Math.min(sectorScrollOffset + ITEMS_PER_PAGE, filteredSectorsList.length)} / {filteredSectorsList.length})
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                              Sectors (0)
                            </div>
                          )}
                        </div>
                      </div>
                    </>
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
                  
                  // CRITICAL: Reset shouldFetchData silently BEFORE updating dates to prevent auto-load
                  // This ensures data only changes when Show button is clicked
                    shouldFetchDataRef.current = false; // CRITICAL: Update ref first (synchronous) - SILENT
                    setShouldFetchData(false); // SILENT
                  
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
                  
                  // CRITICAL: Reset shouldFetchData silently BEFORE updating dates to prevent auto-load
                  // This ensures data only changes when Show button is clicked
                    shouldFetchDataRef.current = false; // CRITICAL: Update ref first (synchronous) - SILENT
                    setShouldFetchData(false); // SILENT
                  
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
              value={pivotFilterDisplayLabel}
              onChange={(e) => {
                handlePivotFilterChange(e.target.value);
                // CRITICAL: Keep existing data visible - no auto-fetch, no hide tables
                // User must click Show button to fetch new data
              }}
              className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
            >
              <option value="Stock">Stock</option>
              <option value="Broker">Broker</option>
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
              <option value="">All</option>
              <option value="RG">RG</option>
              <option value="TN">TN</option>
              <option value="NG">NG</option>
            </select>
          </div>

          {/* Toggle untuk Frequency dan Order */}
          <div className="flex flex-col gap-1 items-start">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showFrequency}
                onChange={(e) => setShowFrequency(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#3a4252] text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs text-foreground whitespace-nowrap">Freq</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showOrder}
                onChange={(e) => setShowOrder(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#3a4252] text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs text-foreground whitespace-nowrap">Or</span>
            </label>
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
              (pivotFilter === 'Broker' && selectedBrokers.length === 0 && selectedSectors.length === 0) || 
              (pivotFilter === 'Stock' && selectedTickers.length === 0 && selectedSectors.length === 0) || 
              !startDate || !endDate}
            // NOTE: For Stock pivot, either selectedTickers or selectedSectors must be selected
            // selectedTickers can be empty if selectedSectors is selected (for sector/IDX data)
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto"
          >
            Show
          </button>
        </div>
      </div>

      {/* Spacer untuk header fixed - hanya diperlukan di layar besar (lg+) */}
      <div className={isMenuTwoRows ? "h-0 lg:h-[60px]" : "h-0 lg:h-[38px]"}></div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 pt-4">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading transaction data...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex items-center justify-center py-8 pt-4">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Main Data Display */}
      <div className="pt-2">
      {!isLoading && !error && isDataReady && renderHorizontalView()}
      </div>
    </div>
  );
}
