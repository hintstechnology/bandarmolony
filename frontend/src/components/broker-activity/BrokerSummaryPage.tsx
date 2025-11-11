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
  "KZ", "LH", "LG", "LS", "MS", "NI", "RB", "RX", "TX", "YP", "YU", "ZP"
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

// Format Lot: jika >= 1,000,000 gunakan format dengan K (1,000K), jika < 1,000,000 gunakan format koma ribuan biasa (12,000)
const formatLot = (value: number): string => {
  const rounded = Math.round(value);
  if (rounded >= 1000000) {
    // Format dengan K untuk nilai >= 1,000,000 (misal: 1,000,000 -> 1,000K)
    const thousands = rounded / 1000;
    return `${thousands.toLocaleString('en-US', { maximumFractionDigits: 0 })}K`;
  }
  // Format koma ribuan biasa untuk nilai < 1,000,000 (misal: 12,000 -> 12,000)
  return rounded.toLocaleString('en-US');
};

const formatAverage = (value: number): string => {
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
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const [stockSearchTimeout, setStockSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const valueTableRef = useRef<HTMLTableElement>(null);
  const netTableRef = useRef<HTMLTableElement>(null);
  const valueTableContainerRef = useRef<HTMLDivElement>(null);
  const netTableContainerRef = useRef<HTMLDivElement>(null);

  // API-driven broker summary data by date
  const [summaryByDate, setSummaryByDate] = useState<Map<string, BrokerSummaryData[]>>(new Map()); // Filtered data (based on displayedFdFilter)
  const [rawSummaryByDate, setRawSummaryByDate] = useState<Map<string, BrokerSummaryData[]>>(new Map()); // Raw data without investor filter (for client-side filtering)
  const [lastFetchParams, setLastFetchParams] = useState<{ tickers: string[]; dates: string[]; market: string } | null>(null); // Track last fetch parameters
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDataReady, setIsDataReady] = useState<boolean>(false); // Control when to show tables
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false); // Control when to fetch data (only when Show button clicked)
  const [maxAvailableDate, setMaxAvailableDate] = useState<string>(''); // Maximum date available from API (format: YYYY-MM-DD)
  const hasInitialAutoFetchRef = useRef<boolean>(false); // Track if initial auto-fetch has happened
  const initialAutoFetchTriggeredRef = useRef<boolean>(false); // Track if initial auto-fetch has been triggered (to prevent useLayoutEffect from resetting it)
  const shouldFetchDataRef = useRef<boolean>(false); // Ref to track shouldFetchData for async functions (always up-to-date)
  const abortControllerRef = useRef<AbortController | null>(null); // Ref to abort ongoing fetch

  // Cache for API responses to avoid redundant calls
  // Key format: `${ticker}-${date}-${market}`
  const dataCacheRef = useRef<Map<string, { data: BrokerSummaryData[]; timestamp: number }>>(new Map());

  // Cache expiration time: 5 minutes
  const CACHE_EXPIRY_MS = 5 * 60 * 1000;

  // Check if more than 7 days selected - if so, only show Total column
  // CRITICAL: Calculate from summaryByDate (data that exists), not from selectedDates (which changes on date picker)
  // This ensures no re-render when user changes dates - only when data changes (after Show button clicked)
  const showOnlyTotal = summaryByDate.size > 7;

  // Load maximum available date on mount - use this for validation and default dates
  // IMPORTANT: This effect runs ONLY ONCE on mount, not when tickers change
  useEffect(() => {
    const loadMaxDate = async () => {
      // Set loading state saat fetch dates
      setIsLoading(true);
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
          setMaxAvailableDate(formattedDate);
          setSelectedDates(lastThreeDates);
          setStartDate(lastThreeDates[0]);
          setEndDate(lastThreeDates[lastThreeDates.length - 1]);
          
          // Trigger initial auto-fetch AFTER all states are set
          // CRITICAL: Use setTimeout to ensure all state updates are batched and applied
          // Also capture selectedTickers value from closure to avoid reading stale state
          const currentTickers = [...selectedTickers]; // Capture current value (copy array)
          // Capture dates to ensure we use the same dates that were set
          const datesToUse = [...lastThreeDates];
          setTimeout(() => {
            // TRIPLE-CHECK: only trigger if initial fetch hasn't happened AND we have dates and tickers
            // Check that we're still in initial load phase (hasInitialAutoFetchRef is still false)
            // This prevents trigger if user changed dates during setTimeout
            if (!hasInitialAutoFetchRef.current && 
                datesToUse.length > 0 && 
                currentTickers.length > 0) {
              // Mark as triggered IMMEDIATELY (synchronously) before any async operations
              hasInitialAutoFetchRef.current = true;
              initialAutoFetchTriggeredRef.current = true;
              // Set ref first (synchronous), then state (async)
              shouldFetchDataRef.current = true;
              setShouldFetchData(true);
            }
          }, 0);
          
          // Loading akan di-reset oleh fetchAll
        } else {
          console.warn('[BrokerSummary] No dates available from API', result);
          setIsLoading(false);
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
        setIsLoading(false);
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

  // Load available stocks ONCE on mount - use getStockList() which doesn't need date
  // This is faster than getBrokerSummaryStocks() which requires a date
  useEffect(() => {
    const loadStocks = async () => {
      if (availableStocks.length > 0) return; // Already loaded
      
      try {
        console.log('[BrokerSummary] Loading stock list...');
        const result = await api.getStockList();
        if (result.success && result.data?.stocks && Array.isArray(result.data.stocks)) {
          // Add IDX to the stock list if not already present
          const stocksWithIdx = result.data.stocks.includes('IDX') 
            ? result.data.stocks 
            : [...result.data.stocks, 'IDX'];
          // Sort stocks alphabetically for better UX
          const sortedStocks = stocksWithIdx.sort((a: string, b: string) => a.localeCompare(b));
          setAvailableStocks(sortedStocks);
        } else {
          // Even if API fails, ensure IDX is available
          setAvailableStocks(['IDX']);
          console.warn('[BrokerSummary] No stocks found in API response, using IDX only');
        }
      } catch (err) {
        console.error('[BrokerSummary] Error loading stock list:', err);
        // Even if API fails, ensure IDX is available
        setAvailableStocks(['IDX']);
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
  
  // Mark initial auto-fetch as no longer being triggered after fetchAll completes
  // This allows onChange handlers to reset shouldFetchData on subsequent date changes
  useEffect(() => {
    if (initialAutoFetchTriggeredRef.current && !isLoading && isDataReady) {
      // Initial fetch completed, allow onChange handlers to reset shouldFetchData on future changes
      setTimeout(() => {
        initialAutoFetchTriggeredRef.current = false;
      }, 300); // Delay to ensure fetchAll is fully complete and state is stable
    }
  }, [isLoading, isDataReady]);

  // REMOVED: Reminder toast effect
  // User wants NO side effects when changing dates - completely silent
  // Reminder toast removed per user request: "jangan lakukan apa-apa di manapun, biarkan aja begitu"
  
  // REMOVED: Auto-fetch on initial load - user MUST click Show button to fetch data
  // This ensures no data is displayed automatically without user clicking Show

  // Load broker summary data from backend for each selected date and aggregate multiple tickers
  // Only fetch when shouldFetchData is true (triggered by Show button or initial auto-fetch)
  // IMPORTANT: This effect only runs when shouldFetchData changes, NOT when selectedTickers/selectedDates change
  // CRITICAL: This effect should NEVER run after initial load unless user clicks Show button
  useEffect(() => {
    // CRITICAL: Check ref FIRST (before anything else) - ref is always up-to-date
    // This is the most reliable check to prevent unwanted fetches
    if (!shouldFetchDataRef.current) {
      return; // Early return if ref is false - this is the primary guard
    }
    
    // CRITICAL: Also check state for consistency
    if (!shouldFetchData) {
      // Reset ref to match state
      shouldFetchDataRef.current = false;
      return; // Early return if shouldFetchData is false
    }
    
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
          if (!skipCache && cached && (now - cached.timestamp) <= CACHE_EXPIRY_MS) {
            return { ticker, date, data: cached.data };
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
                
            const rows: BrokerSummaryData[] = (res.data.brokerData ?? []).map((r: any) => {
            // Backend already calculates NetSellVol, NetSellValue, NetBuyerAvg, NetSellerAvg
            // Backend also handles the logic: if NetBuy is negative, it becomes NetSell and NetBuy = 0
              return {
                    broker: r.BrokerCode ?? r.broker ?? r.BROKER ?? r.code ?? '',
                    buyerVol: Number(r.BuyerVol ?? 0),
                    buyerValue: Number(r.BuyerValue ?? 0),
                    bavg: Number(r.BuyerAvg ?? r.bavg ?? 0),
                    sellerVol: Number(r.SellerVol ?? 0),
                    sellerValue: Number(r.SellerValue ?? 0),
                    savg: Number(r.SellerAvg ?? r.savg ?? 0),
              // Net Buy fields (already >= 0 from backend)
                    netBuyVol: Number(r.NetBuyVol ?? 0),
                    netBuyValue: Number(r.NetBuyValue ?? 0),
              netBuyerAvg: Number(r.NetBuyerAvg ?? 0),
              // Net Sell fields (already >= 0 from backend)
              netSellVol: Number(r.NetSellVol ?? 0),
              netSellValue: Number(r.NetSellValue ?? 0),
              netSellerAvg: Number(r.NetSellerAvg ?? 0),
              // Legacy fields for backward compatibility
                    nblot: Number(r.NetBuyVol ?? r.nblot ?? 0),
                    nbval: Number(r.NetBuyValue ?? r.nbval ?? 0),
                    sl: Number(r.SellerVol ?? r.sl ?? 0),
              nslot: Number(r.NetSellVol ?? 0), // Use NetSellVol instead of negative sellerVol
              nsval: Number(r.NetSellValue ?? 0) // Use NetSellValue instead of negative sellerValue
                  };
                }) as BrokerSummaryData[];
                
          // Store in cache
          cache.set(cacheKey, { data: rows, timestamp: now });
                
            return { ticker, date, data: rows };
        };

        // OPTIMIZED: Fetch all data in parallel with batching to avoid overwhelming browser
        // Batch size: 10 concurrent requests at a time for better performance and stability
        const BATCH_SIZE = 10;
        
        // Create all fetch task descriptions (NOT promises yet - create promises only when needed)
        const allFetchTasks = selectedDates.flatMap(date =>
          selectedTickers.map(ticker => ({ ticker, date }))
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
          
          // Process in batches to avoid overwhelming browser with too many concurrent requests
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
        
        // Clear abort controller after successful fetch
        abortControllerRef.current = null;
      } catch (e: any) {
        // If aborted, don't show error - just reset state
        // Check abortControllerRef.current instead of local abortController (which might be stale)
        const wasAborted = abortControllerRef.current?.signal.aborted || e?.message === 'Fetch aborted' || !shouldFetchDataRef.current;
        if (wasAborted) {
          setIsLoading(false);
          setIsDataReady(false);
          abortControllerRef.current = null;
          return;
        }
        console.error('[BrokerSummary] Error fetching data:', e);
        setError(e?.message || 'Failed to load broker summary');
        setIsLoading(false);
        setIsDataReady(false);
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

  // Synchronize horizontal scroll between Value and Net tables - optimized for smooth scrolling
  useEffect(() => {
    // Wait for tables to be ready (data loaded and DOM rendered)
    if (isLoading || !isDataReady) return;

    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;

    if (!valueContainer || !netContainer) return;

    // Track which container is being scrolled to prevent circular updates
    // Use a more robust flag system that resets immediately after sync
    let isValueScrolling = false;
    let isNetScrolling = false;

    // Handle Value table scroll - sync to Net table immediately
    const handleValueScroll = () => {
      // Only sync if net container is not currently being scrolled
      if (!isNetScrolling && netContainer) {
        isValueScrolling = true;
        // Immediate synchronization - no delay for smooth scrolling
        netContainer.scrollLeft = valueContainer.scrollLeft;
        // Reset flag immediately to allow continuous smooth scrolling
        isValueScrolling = false;
      }
    };

    // Handle Net table scroll - sync to Value table immediately
    const handleNetScroll = () => {
      // Only sync if value container is not currently being scrolled
      if (!isValueScrolling && valueContainer) {
        isNetScrolling = true;
        // Immediate synchronization - no delay for smooth scrolling
        valueContainer.scrollLeft = netContainer.scrollLeft;
        // Reset flag immediately to allow continuous smooth scrolling
        isNetScrolling = false;
      }
    };

    // Add event listeners with passive flag for better performance
    valueContainer.addEventListener('scroll', handleValueScroll, { passive: true });
    netContainer.addEventListener('scroll', handleNetScroll, { passive: true });

    return () => {
      valueContainer.removeEventListener('scroll', handleValueScroll);
      netContainer.removeEventListener('scroll', handleNetScroll);
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

  const handleStockSelect = (stock: string) => {
    if (!selectedTickers.includes(stock)) {
      setSelectedTickers([...selectedTickers, stock]);
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
          const result = await api.getStockList();
          if (result.success && result.data?.stocks && Array.isArray(result.data.stocks)) {
            // Add IDX to the stock list if not already present
            const stocksWithIdx = result.data.stocks.includes('IDX') 
              ? result.data.stocks 
              : [...result.data.stocks, 'IDX'];
            const sortedStocks = stocksWithIdx.sort((a: string, b: string) => a.localeCompare(b));
            setAvailableStocks(sortedStocks);
          } else {
            // Even if API fails, ensure IDX is available
            setAvailableStocks(['IDX']);
          }
        } catch (err) {
          console.error('Error loading stocks:', err);
          // Even if API fails, ensure IDX is available
          setAvailableStocks(['IDX']);
        }
      }, 100); // Short delay only if needed
      setStockSearchTimeout(timeout);
    }

    // If exact match, select it immediately
    const upperValue = value.toUpperCase();
    if ((availableStocks || []).includes(upperValue) && !selectedTickers.includes(upperValue)) {
      setSelectedTickers([...selectedTickers, upperValue]);
      setTickerInput('');
      setShowStockSuggestions(false);
    }
  };

  const filteredStocks = (availableStocks || []).filter(stock =>
    stock.toLowerCase().includes(tickerInput.toLowerCase()) && !selectedTickers.includes(stock)
  );

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
  const getFontSizeClass = () => 'text-[13px]';

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

    // Show loading state if still loading or data not ready
    // But we'll still render tables in DOM (hidden) to allow pre-calculation
    const showLoading = isLoading || !isDataReady;

    if (showLoading && summaryByDate.size === 0) {
      // No data yet, show loading
    return (
        <div className="w-full flex items-center justify-center py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground text-center">Loading broker summary...</div>
          </div>
        </div>
      );
    }

    // If we have data but still processing, render tables hidden so calculations can complete
    // This allows all frontend calculations to finish before showing tables

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
        {/* Loading overlay - shown when processing */}
        {showLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f20]/80 z-50">
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-sm text-muted-foreground text-center">Loading broker summary...</div>
            </div>
          </div>
        )}

        {/* Tables - rendered in DOM but hidden when processing */}
        {/* Use opacity: 0 instead of visibility: hidden to allow layout calculations */}
        <div className={`w-full transition-opacity duration-0 ${showLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {/* Combined Buy & Sell Side Table */}
        <div className="w-full max-w-full">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">VALUE - {displayedTickers.join(', ')} - {getMarketLabel(displayedMarket)}</h3>
          </div>
           <div className={`${showOnlyTotal ? 'flex justify-center' : 'w-full max-w-full'}`}>
              <div ref={valueTableContainerRef} className={`${showOnlyTotal ? 'w-auto' : 'w-full max-w-full'} ${summaryByDate.size === 0 ? 'overflow-hidden' : 'overflow-x-auto overflow-y-auto'} border-l-2 border-r-2 border-b-2 border-white`} style={{ maxHeight: '494px' }}>
               <table ref={valueTableRef} className={`${showOnlyTotal ? 'min-w-0' : summaryByDate.size === 0 ? 'w-full' : 'min-w-[1000px]'} ${getFontSizeClass()} table-auto`} style={{ tableLayout: summaryByDate.size === 0 ? 'fixed' : (showOnlyTotal ? 'auto' : 'auto'), width: summaryByDate.size === 0 ? '100%' : undefined }}>
                         <thead className="bg-[#3a4252]">
                         <tr className="border-t-2 border-white">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => (
                        <th key={date} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} colSpan={9} style={{ textAlign: 'center' }}>
                         {formatDisplayDate(date)}
                            </th>
                          ))}
                      <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={9} style={{ textAlign: 'center' }}>
                            Total
                          </th>
                        </tr>
                        <tr className="bg-[#3a4252]">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => (
                      <React.Fragment key={`detail-${date}`}>
                              {/* BY Columns */}
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ textAlign: 'center' }}>BY</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BLot</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BVal</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BAvg</th>
                              {/* SL Columns */}
                              <th className="text-center py-[1px] px-[6px] font-bold text-white bg-[#3a4252] w-4" style={{ textAlign: 'center' }}>#</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-4`} style={{ textAlign: 'center' }}>SL</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>SLot</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>SVal</th>
                        <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6 ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ textAlign: 'center' }}>SAvg</th>
                            </React.Fragment>
                          ))}
                    {/* Total Columns - Include BAvg and SAvg */}
                      <th className={`text-center py-[1px] px-[5px] font-bold text-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ textAlign: 'center' }}>BY</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>BLot</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>BVal</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>BAvg</th>
                          <th className="text-center py-[1px] px-[6px] font-bold text-white bg-[#3a4252]" style={{ textAlign: 'center' }}>#</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>SL</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>SLot</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>SVal</th>
                      <th className={`text-center py-[1px] px-[7px] font-bold text-white border-r-2 border-white`} style={{ textAlign: 'center' }}>SAvg</th>
                        </tr>
                      </thead>
                      <tbody>
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
                    
                    // If no data, show "No Data Available" message
                    if (maxRows === 0 || summaryByDate.size === 0) {
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
                                <td className={`text-center py-[1px] px-[6px] w-4 font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${buyData ? getBrokerColorClass(buyData.broker) : ''}`}>
                                        {buyData?.broker || '-'}
                                      </td>
                              <td className="text-right py-[1px] px-[6px] text-green-600 font-bold w-6">
                                {buyData ? formatLot(buyData.buyerVol / 100) : '-'}
                              </td>
                                      <td className="text-right py-[1px] px-[6px] text-green-600 font-bold w-6">
                                        {buyData ? formatNumber(buyData.buyerValue) : '-'}
                                      </td>
                                      <td className="text-right py-[1px] px-[6px] text-green-600 font-bold w-6">
                                        {buyData ? formatAverage(buyData.bavg) : '-'}
                                      </td>
                                      {/* SL (Seller) Columns - Keep # column */}
                                      <td className={`text-center py-[1px] px-[6px] text-white bg-[#3a4252] font-bold w-4 ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>{sellData ? rowIdx + 1 : '-'}</td>
                                      <td className={`py-[1px] px-[6px] font-bold w-4 ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>
                                        {sellData?.broker || '-'}
                                      </td>
                              <td className="text-right py-[1px] px-[6px] text-red-600 font-bold w-6">
                                {sellData ? formatLot(sellData.sellerVol / 100) : '-'}
                              </td>
                                      <td className="text-right py-[1px] px-[6px] text-red-600 font-bold w-6">
                                        {sellData ? formatNumber(sellData.sellerValue) : '-'}
                                      </td>
                              <td className={`text-right py-[1px] px-[6px] text-red-600 font-bold w-6 ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
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
                                <td className={`text-center py-[1px] px-[5px] font-bold ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${totalBuy ? getBrokerColorClass(totalBuy.broker) : ''}`}>
                                  {totalBuy?.broker || '-'}
                                </td>
                              <td className="text-right py-[1px] px-[5px] text-green-600 font-bold">
                                {totalBuy ? formatLot(totalBuy.nblot / 100) : '-'}
                              </td>
                                <td className="text-right py-[1px] px-[5px] text-green-600 font-bold">
                                  {totalBuy ? formatNumber(totalBuy.nbval) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[5px] text-green-600 font-bold">
                                  {totalBuy && totalBuyAvg > 0 ? formatAverage(totalBuyAvg) : '-'}
                                </td>
                                <td className={`text-center py-[1px] px-[6px] text-white bg-[#3a4252] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>{totalSell ? rowIdx + 1 : '-'}</td>
                                <td className={`py-[1px] px-[5px] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>
                                  {totalSell?.broker || '-'}
                                </td>
                              <td className="text-right py-[1px] px-[5px] text-red-600 font-bold">
                                {totalSell ? formatLot(totalSell.nslot / 100) : '-'}
                              </td>
                              <td className="text-right py-[1px] px-[5px] text-red-600 font-bold">
                                  {totalSell ? formatNumber(totalSell.nsval) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[7px] text-red-600 font-bold border-r-2 border-white">
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
            <h3 className="font-semibold text-sm">NET - {displayedTickers.join(', ')} - {getMarketLabel(displayedMarket)}</h3>
          </div>
          <div className={`${showOnlyTotal ? 'flex justify-center' : 'w-full max-w-full'}`}>
              <div ref={netTableContainerRef} className={`${showOnlyTotal ? 'w-auto' : 'w-full max-w-full'} ${summaryByDate.size === 0 ? 'overflow-hidden' : 'overflow-x-auto overflow-y-auto'} border-l-2 border-r-2 border-b-2 border-white`} style={{ maxHeight: '516px' }}>
              <table ref={netTableRef} className={`${showOnlyTotal ? 'min-w-0' : summaryByDate.size === 0 ? 'w-full' : 'min-w-[1000px]'} ${getFontSizeClass()} table-auto`} style={{ tableLayout: summaryByDate.size === 0 ? 'fixed' : (showOnlyTotal ? 'auto' : 'auto'), width: summaryByDate.size === 0 ? '100%' : undefined }}>
                        <thead className="bg-[#3a4252]">
                        <tr className="border-t-2 border-white">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => (
                        <th key={date} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} colSpan={9} style={{ textAlign: 'center' }}>
                        {formatDisplayDate(date)}
                            </th>
                          ))}
                      <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={9} style={{ textAlign: 'center' }}>
                            Total
                          </th>
                        </tr>
                        <tr className="bg-[#3a4252]">
                      {!showOnlyTotal && datesForHeader.map((date, dateIndex) => (
                      <React.Fragment key={`detail-${date}`}>
                              {/* Net Buy Columns - No # */}
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ textAlign: 'center' }}>BY</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BLot</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BVal</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>BAvg</th>
                              {/* Net Sell Columns - Keep # */}
                              <th className="text-center py-[1px] px-[6px] font-bold text-white bg-[#3a4252] w-4" style={{ textAlign: 'center' }}>#</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-4`} style={{ textAlign: 'center' }}>SL</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>SLot</th>
                              <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6`} style={{ textAlign: 'center' }}>SVal</th>
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white w-6 ${dateIndex < datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === datesForHeader.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ textAlign: 'center' }}>SAvg</th>
                            </React.Fragment>
                          ))}
                    {/* Total Columns - Include BAvg and SAvg */}
                      <th className={`text-center py-[1px] px-[5px] font-bold text-white ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ textAlign: 'center' }}>BY</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>BLot</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>BVal</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>BAvg</th>
                          <th className="text-center py-[1px] px-[6px] font-bold text-white bg-[#3a4252]" style={{ textAlign: 'center' }}>#</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>SL</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>SLot</th>
                          <th className={`text-center py-[1px] px-[5px] font-bold text-white`} style={{ textAlign: 'center' }}>SVal</th>
                      <th className={`text-center py-[1px] px-[7px] font-bold text-white border-r-2 border-white`} style={{ textAlign: 'center' }}>SAvg</th>
                        </tr>
                      </thead>
                      <tbody>
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
                            'hsl(50, 100%, 50%)',  // Kuning (Yellow)
                            'hsl(120, 70%, 50%)',  // Hijau (Green)
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
                    
                    // Helper function to get background color style for BY columns
                    // LOCKED: Top 5 NetSell brokers from Total get background color in BY columns across all dates
                    const getNetBuyBgStyle = (broker: string): React.CSSProperties | undefined => {
                      const color = netBuyBrokerBgMap.get(broker);
                      return color ? { backgroundColor: color, color: 'white' } : undefined;
                    };

                    // Map top 5 NetBuy brokers (from Total) to their index (0-4) for getting underline color
                    // These brokers will have underline in SL columns across all dates
                    const netSellBrokerIndexMap = new Map<string, number>();
                    sortedTotalNetBuy.slice(0, 5).forEach((item, idx) => {
                      netSellBrokerIndexMap.set(item.broker, idx);
                    });

                    // Helper function to get underline color for top 5 NetBuy broker (uses same colors as top 5 buy)
                    // LOCKED: Color is locked per broker based on Total ranking (consistent across all dates)
                    const getNetSellUnderlineColor = (broker: string): string | undefined => {
                      const index = netSellBrokerIndexMap.get(broker);
                      return index !== undefined ? bgColors[index] : undefined;
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
                          
                    // If no data, show "No Data Available" message
                    if (maxRows === 0 || summaryByDate.size === 0) {
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
                      // Cek apakah broker pada row adalah top5
                      // (delete unused block: netBuyData/netSellData functions)
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

                              // Get background colors for this row (only for buy)
                              // Use netSellData for BY columns since they display NetSell data
                            const netBuyBgStyle = netSellData ? getNetBuyBgStyle(netSellData.broker) : undefined;

                              // Get underline color for top 5 sell (locked per broker based on Total ranking)
                              // Use netBuyData for SL columns since they display NetBuy data
                              const sellUnderlineColor = netBuyData ? getNetSellUnderlineColor(netBuyData.broker) : undefined;
                              const sellUnderlineStyle = sellUnderlineColor 
                                ? { borderBottom: `4px solid ${sellUnderlineColor}` } 
                                : undefined;
                                  
                                  return (
                              <React.Fragment key={`${date}-${rowIdx}`}>
                                      {/* Net Buy Columns (BY) - Display NetSell Data - No # */}
                                  <td className={`text-center py-[1px] px-[6px] w-4 font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`} style={netBuyBgStyle}>
                                        {netSellData?.broker || '-'}
                                      </td>
                                <td className={`text-right py-[1px] px-[6px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                  {netSellData ? formatLot(nbLot / 100) : '-'}
                                </td>
                                      <td className={`text-right py-[1px] px-[6px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                        {netSellData ? formatNumber(nbVal) : '-'}
                                      </td>
                                      <td className={`text-right py-[1px] px-[6px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                        {netSellData ? formatAverage(nbAvg) : '-'}
                                      </td>
                                      {/* Net Sell Columns (SL) - Display NetBuy Data - Keep # */}
                                      <td className={`text-center py-[1px] px-[6px] text-white bg-[#3a4252] font-bold w-4 ${netBuyData ? getBrokerColorClass(netBuyData.broker) : ''}`}>{netBuyData ? rowIdx + 1 : '-'}</td>
                                  <td className={`py-[1px] px-[6px] w-4 font-bold ${netBuyData ? getBrokerColorClass(netBuyData.broker) : ''}`} style={sellUnderlineStyle}>
                                        {netBuyData?.broker || '-'}
                                      </td>
                                  <td className="text-right py-[1px] px-[6px] w-6 font-bold text-red-600" style={sellUnderlineStyle}>
                                  {netBuyData ? formatLot(nsLot / 100) : '-'}
                                </td>
                                  <td className="text-right py-[1px] px-[6px] w-6 font-bold text-red-600" style={sellUnderlineStyle}>
                                        {netBuyData ? formatNumber(nsVal) : '-'}
                                      </td>
                                  <td className={`text-right py-[1px] px-[6px] w-6 font-bold text-red-600 ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={sellUnderlineStyle}>
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
                              // Note: Sell background color disabled - only buy gets colored

                              // Get underline color for top 5 sell (total column) using locked function
                              // LOCKED: Use getNetSellUnderlineColor which locks based on top 5 NetBuy from Total
                              // This ensures consistent styling across all dates
                              const totalSellUnderlineColor = totalNetBuy ? getNetSellUnderlineColor(totalNetBuy.broker) : undefined;
                              const totalSellUnderlineStyle = totalSellUnderlineColor 
                                ? { borderBottom: `4px solid ${totalSellUnderlineColor}` } 
                                : undefined;

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
                                  <td className={`text-center py-[1px] px-[5px] font-bold ${showOnlyTotal || datesForHeader.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`} style={totalNetBuyBgStyle}>
                                  {totalNetSell?.broker || '-'}
                                </td>
                                <td className={`text-right py-[1px] px-[5px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                  {totalNetSell ? formatLot((totalNetSell.nslot || 0) / 100) : '-'}
                                </td>
                                <td className={`text-right py-[1px] px-[5px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                  {totalNetSell ? formatNumber(totalNetSell.nsval || 0) : '-'}
                                </td>
                                <td className={`text-right py-[1px] px-[5px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                  {totalNetSell && totalNetBuyAvg > 0 ? formatAverage(totalNetBuyAvg) : '-'}
                                </td>
                                {/* Total SL columns - Display totalNetBuy data */}
                                <td className={`text-center py-[1px] px-[6px] text-white bg-[#3a4252] font-bold ${totalNetBuy ? getBrokerColorClass(totalNetBuy.broker) : ''}`}>{totalNetBuy ? rowIdx + 1 : '-'}</td>
                                  <td className={`py-[1px] px-[5px] font-bold ${totalNetBuy ? getBrokerColorClass(totalNetBuy.broker) : ''}`} style={totalSellUnderlineStyle}>
                                  {totalNetBuy?.broker || '-'}
                                </td>
                                  <td className="text-right py-[1px] px-[5px] text-red-600 font-bold" style={totalSellUnderlineStyle}>
                                    {totalNetBuy ? formatLot(totalNetBuy.nblot / 100) : '-'}
                                </td>
                                  <td className="text-right py-[1px] px-[5px] text-red-600 font-bold" style={totalSellUnderlineStyle}>
                                    {totalNetBuy ? formatNumber(totalNetBuy.nbval) : '-'}
                                </td>
                                  <td className="text-right py-[1px] px-[7px] text-red-600 font-bold border-r-2 border-white" style={totalSellUnderlineStyle}>
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
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1.5">
            <div className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3 md:gap-6">
              {/* Ticker Selection - Multi-select with chips */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto md:mr-2">
                <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {/* Selected Ticker Chips */}
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
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                        {availableStocks.length === 0 ? (
                          <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Loading stocks...
                          </div>
                        ) : tickerInput === '' ? (
                          <>
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                              Available Stocks ({availableStocks.filter(s => !selectedTickers.includes(s)).length})
                            </div>
                            {availableStocks.filter(s => !selectedTickers.includes(s)).map(stock => (
                              <div
                                key={stock}
                                onClick={() => handleStockSelect(stock)}
                                className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                              >
                                {stock}
                              </div>
                            ))}
                          </>
                        ) : filteredStocks.length > 0 ? (
                          <>
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                              {filteredStocks.length} stocks found
                            </div>
                            {filteredStocks.map(stock => (
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
                          <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                            No stocks found
                          </div>
                          )}
                        </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Date Range */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto md:mr-2">
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
                    // Update ref first (synchronous) then state - NO LOGS, NO OPERATIONS
                    if (hasInitialAutoFetchRef.current) {
                      shouldFetchDataRef.current = false; // CRITICAL: Update ref first (synchronous) - SILENT
                      setShouldFetchData(false); // SILENT
                    }
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
                    // This must happen synchronously before any state updates - NO LOGS, NO OPERATIONS
                    if (hasInitialAutoFetchRef.current) {
                      shouldFetchDataRef.current = false; // CRITICAL: Update ref first (synchronous) - SILENT
                      setShouldFetchData(false); // SILENT
                    }
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
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto md:mr-2">
                <label className="text-sm font-medium whitespace-nowrap">Investor:</label>
                  <select 
                  value={fdFilter}
                  onChange={(e) => setFdFilter(e.target.value as 'All' | 'Foreign' | 'Domestic')}
                  className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
                >
                  <option value="All">All</option>
                  <option value="Foreign">Foreign</option>
                  <option value="Domestic">Domestic</option>
                  </select>
              </div>

            {/* Market Filter */}
              <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto md:mr-2">
                <label className="text-sm font-medium whitespace-nowrap">Board:</label>
                <select
                  value={marketFilter}
                  onChange={(e) => setMarketFilter(e.target.value as 'RG' | 'TN' | 'NG' | '')}
                  className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
                >
                  <option value="">All Trade</option>
                  <option value="RG">Reguler (RG)</option>
                  <option value="TN">Tunai (TN)</option>
                  <option value="NG">Nego (NG)</option>
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
                    // Force re-trigger fetch by toggling shouldFetchData
                    shouldFetchDataRef.current = false;
                    setShouldFetchData(false);
                    // Use setTimeout to ensure state update completes before triggering fetch
                    setTimeout(() => {
                      shouldFetchDataRef.current = true;
                      setShouldFetchData(true);
                    }, 0);
                  }
                }}
                disabled={isLoading || selectedTickers.length === 0 || selectedDates.length === 0}
                className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto"
              >
                Show
              </button>
            </div>
            </div>

      {/* Main Data Display */}
      <div className="bg-[#0a0f20]">
        {renderHorizontalView()}
      </div>
    </div>
  );
}
