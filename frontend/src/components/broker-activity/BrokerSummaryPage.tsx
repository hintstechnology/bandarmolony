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
  const [fdFilter, setFdFilter] = useState<'All' | 'Foreign' | 'Domestic'>('All');
  const [marketFilter, setMarketFilter] = useState<'RG' | 'TN' | 'NG' | ''>('RG'); // Default to RG
  
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
  const [summaryByDate, setSummaryByDate] = useState<Map<string, BrokerSummaryData[]>>(new Map());
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
        console.log('[BrokerSummary] getBrokerSummaryDates result:', result);
        
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
          console.log('[BrokerSummary] Max available date:', formattedDate);
          console.log('[BrokerSummary] 3 latest dates:', lastThreeDates);
          
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
              console.log('[BrokerSummary] Initial auto-fetch triggered from loadMaxDate', {
                dates: datesToUse,
                tickers: currentTickers
              });
              // Set ref first (synchronous), then state (async)
              shouldFetchDataRef.current = true;
              setShouldFetchData(true);
            } else {
              console.log('[BrokerSummary] Initial auto-fetch skipped', {
                hasInitialAutoFetchRef: hasInitialAutoFetchRef.current,
                datesLength: datesToUse.length,
                tickersLength: currentTickers.length
              });
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

  // Load available stocks ONLY on initial load or when marketFilter changes
  // CRITICAL: Do NOT load stocks when user changes dates - let user click Show first
  // REMOVED: loadAvailableStocks effect
  // This was causing API calls when dates change
  // Stocks will be loaded only when needed (e.g., when user types in stock input)
  // No automatic stock loading to prevent any side effects when dates change

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
      console.log('[BrokerSummary] fetchAll effect: shouldFetchDataRef is false, aborting immediately');
      return; // Early return if ref is false - this is the primary guard
    }
    
    // CRITICAL: Also check state for consistency
    if (!shouldFetchData) {
      console.log('[BrokerSummary] fetchAll effect: shouldFetchData state is false, aborting');
      // Reset ref to match state
      shouldFetchDataRef.current = false;
      return; // Early return if shouldFetchData is false
    }
    
    // CRITICAL: Cancel any ongoing fetch before starting new one
    if (abortControllerRef.current) {
      console.log('[BrokerSummary] Cancelling previous fetch before starting new one');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Final check: make sure ref is still true after cleanup
    if (!shouldFetchDataRef.current) {
      console.log('[BrokerSummary] fetchAll effect: shouldFetchDataRef became false after cleanup, aborting');
      return;
    }
    
    // Create new AbortController for this fetch
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    const fetchAll = async () => {
      // CRITICAL: Check ref instead of state - ref is always up-to-date even in async context
      // This is especially important if user changes dates while fetch is queued
      if (!shouldFetchDataRef.current) {
        console.log('[BrokerSummary] fetchAll function: shouldFetchDataRef is false, aborting fetch');
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
        console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false after validation, aborting');
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
        console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false before starting fetch, aborting');
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
        const now = Date.now();
        const cache = dataCacheRef.current;

        // Clear expired cache entries
        for (const [key, value] of cache.entries()) {
          if (now - value.timestamp > CACHE_EXPIRY_MS) {
            cache.delete(key);
          }
        }

        // Helper function to fetch data for a single ticker-date combination (with cache)
        const fetchSingleData = async (ticker: string, date: string): Promise<{ ticker: string; date: string; data: BrokerSummaryData[] }> => {
          // CRITICAL: Check if fetch was aborted
          if (abortController.signal.aborted || !shouldFetchDataRef.current) {
            console.log(`[BrokerSummary] Fetch aborted for ${ticker} on ${date}`);
            throw new Error('Fetch aborted');
          }
          
          const cacheKey = `${ticker}-${date}-${market}`;
          const cached = cache.get(cacheKey);

          // Check cache first
          if (cached && (now - cached.timestamp) <= CACHE_EXPIRY_MS) {
            console.log(`[BrokerSummary] Using cached data for ${ticker} on ${date}`);
            return { ticker, date, data: cached.data };
          }

          // CRITICAL: Check again before API call
          if (abortController.signal.aborted || !shouldFetchDataRef.current) {
            console.log(`[BrokerSummary] Fetch aborted before API call for ${ticker} on ${date}`);
            throw new Error('Fetch aborted');
          }

          // Fetch from API
                console.log(`[BrokerSummary] Fetching data for ${ticker} on ${date} with market: ${market || 'All Trade'}`);
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
          console.log(`[BrokerSummary] Cached data for ${ticker} on ${date}`);

            return { ticker, date, data: rows };
        };

        // OPTIMIZED: Fetch all data in parallel without batching delays
        // Modern browsers can handle parallel requests efficiently
        const allDataResults: Array<{ ticker: string; date: string; data: BrokerSummaryData[] }> = [];
        
        // Fetch all ticker-date combinations in parallel (no batching)
        const allPromises = selectedDates.flatMap(date =>
          selectedTickers.map(ticker => fetchSingleData(ticker, date))
        );
        
        // Wait for all requests to complete (with abort support)
        // If aborted, Promise.all will reject - catch it and return early
        let batchResults: Array<{ ticker: string; date: string; data: BrokerSummaryData[] }>;
        try {
          batchResults = await Promise.all(allPromises);
        } catch (error: any) {
          // If aborted or shouldFetchDataRef is false, silently abort
          if (error?.message === 'Fetch aborted' || !shouldFetchDataRef.current || abortController.signal.aborted) {
            console.log('[BrokerSummary] Promise.all aborted');
            setIsLoading(false);
            setIsDataReady(false);
            return;
          }
          throw error; // Re-throw other errors
        }
        
        // CRITICAL: Check ref again after Promise.all - user might have changed dates during fetch
        if (!shouldFetchDataRef.current) {
          console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false after Promise.all, aborting aggregation');
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }
        
        allDataResults.push(...batchResults);
        
        // Aggregate data per date and per broker (sum all tickers)
        const aggregatedMap = new Map<string, Map<string, BrokerSummaryData>>();
        
        selectedDates.forEach(date => {
          aggregatedMap.set(date, new Map<string, BrokerSummaryData>());
        });
        
        allDataResults.forEach(({ date, data }) => {
          // CRITICAL: Check ref during aggregation - user might have changed dates
          if (!shouldFetchDataRef.current) {
            console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false during aggregation, aborting');
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
        if (!shouldFetchDataRef.current) {
          console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false before setting data, aborting');
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }
        
        // Convert aggregated map to the format expected by the component
        const finalMap = new Map<string, BrokerSummaryData[]>();
        aggregatedMap.forEach((brokerMap, date) => {
          const rows = Array.from(brokerMap.values());
          finalMap.set(date, rows);
          console.log(`[BrokerSummary] Aggregated ${rows.length} brokers for date ${date} from ${selectedTickers.length} ticker(s)`);
        });
        
        // CRITICAL: Final check before storing data - user might have changed dates
        if (!shouldFetchDataRef.current) {
          console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false before storing data, aborting');
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }
        
        // Store data first (but tables won't show yet because isDataReady is still false)
        setSummaryByDate(finalMap);
        
        const totalRows = Array.from(finalMap.values()).reduce((sum, rows) => sum + rows.length, 0);
        console.log(`[BrokerSummary] Total aggregated rows: ${totalRows} across ${finalMap.size} dates from ${selectedTickers.join(', ')}`);

        // CRITICAL: Check ref again before showing toast and setting data ready
        // User might have changed dates during aggregation
        if (!shouldFetchDataRef.current) {
          console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false before marking data ready, aborting');
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
        if (!shouldFetchDataRef.current) {
          console.log('[BrokerSummary] fetchAll: shouldFetchDataRef became false before final data ready, aborting');
          setIsLoading(false);
          setIsDataReady(false);
          return;
        }

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
          console.log('[BrokerSummary] Fetch aborted, cleaning up');
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

  // Synchronize horizontal scroll between Value and Net tables and re-sync column widths on scroll
  useEffect(() => {
    // Wait for tables to be ready (data loaded and DOM rendered)
    if (isLoading || !isDataReady) return;

    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;
    const valueTable = valueTableRef.current;
    const netTable = netTableRef.current;

    if (!valueContainer || !netContainer || !valueTable || !netTable) return;

    // Flag to prevent infinite loop when programmatically updating scroll
    let isSyncing = false;

    // Handle Value table scroll - sync to Net table and re-sync column widths
    const handleValueScroll = () => {
      if (!isSyncing && netContainer) {
        isSyncing = true;
        netContainer.scrollLeft = valueContainer.scrollLeft;
        // Re-sync column widths after scroll to ensure alignment
        requestAnimationFrame(() => {
          // Sync column widths after scroll - use minWidth to allow expansion
          const valueHeaderRows = valueTable.querySelectorAll('thead tr');
          const netHeaderRows = netTable.querySelectorAll('thead tr');
          
          if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
            const valueColumnHeaderRow = valueHeaderRows[1];
            const netColumnHeaderRow = netHeaderRows[1];
            
            if (valueColumnHeaderRow && netColumnHeaderRow) {
              const valueHeaderCells = valueColumnHeaderRow.querySelectorAll('th');
              const netHeaderCells = netColumnHeaderRow.querySelectorAll('th');
              
              valueHeaderCells.forEach((valueCell, index) => {
                const netCell = netHeaderCells[index];
                if (netCell && valueCell) {
                  const valueEl = valueCell as HTMLElement;
                  const netEl = netCell as HTMLElement;
                  const width = Math.max(valueEl.scrollWidth, valueEl.offsetWidth);
                  if (width > 0) {
                    // Apply exact width for alignment
                    netEl.style.width = `${width}px`;
                    netEl.style.minWidth = `${width}px`;
                  }
                }
              });
            }
          }
          isSyncing = false;
        });
      }
    };

    // Handle Net table scroll - sync to Value table
    const handleNetScroll = () => {
      if (!isSyncing && valueContainer) {
        isSyncing = true;
        valueContainer.scrollLeft = netContainer.scrollLeft;
        requestAnimationFrame(() => {
          isSyncing = false;
        });
      }
    };

    // Add event listeners
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
    }

    // Set new timeout for debounced stock loading
    const timeout = setTimeout(async () => {
      // Load stocks if not already loaded and user is typing
      // Use availableDates (from summaryByDate) instead of selectedDates to avoid dependency on date picker
      const firstDate = availableDates.length > 0 ? availableDates[0] : null;
      if (availableStocks.length === 0 && firstDate) {
        try {
          const stocksResult = await api.getBrokerSummaryStocks(firstDate);
          if (stocksResult.success && stocksResult.data?.stocks) {
            setAvailableStocks(stocksResult.data.stocks);
          }
        } catch (err) {
          console.error('Error loading stocks:', err);
        }
      }
    }, 300); // 300ms debounce

    setStockSearchTimeout(timeout);

    // If exact match, select it
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

  // Helper function to filter brokers by F/D
  const brokerFDScreen = (broker: string): boolean => {
    if (fdFilter === 'Foreign') {
      return FOREIGN_BROKERS.includes(broker) && !GOVERNMENT_BROKERS.includes(broker);
    }
    if (fdFilter === 'Domestic') {
      return (!FOREIGN_BROKERS.includes(broker) || GOVERNMENT_BROKERS.includes(broker));
    }
    return true; // All
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
            <h3 className="font-semibold text-sm">VALUE - {selectedTickers.join(', ')}</h3>
          </div>
           <div className={`${showOnlyTotal ? 'flex justify-center' : 'w-full max-w-full'}`}>
              <div ref={valueTableContainerRef} className={`${showOnlyTotal ? 'w-auto' : 'w-full max-w-full'} overflow-x-auto overflow-y-auto border-l-2 border-r-2 border-b-2 border-white`} style={{ maxHeight: 'calc(2 * 28px + 20 * 24px)' }}>
               <table ref={valueTableRef} className={`${showOnlyTotal ? 'min-w-0' : 'min-w-[1000px]'} ${getFontSizeClass()} table-auto`} style={{ tableLayout: showOnlyTotal ? 'auto' : 'auto' }}>
                         <thead className="bg-[#3a4252]">
                         <tr className="border-t-2 border-white">
                      {!showOnlyTotal && availableDates.map((date, dateIndex) => (
                        <th key={date} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} colSpan={9}>
                         {formatDisplayDate(date)}
                            </th>
                          ))}
                      <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={9}>
                            Total
                          </th>
                        </tr>
                        <tr className="bg-[#3a4252]">
                      {!showOnlyTotal && availableDates.map((date, dateIndex) => (
                      <React.Fragment key={`detail-${date}`}>
                              {/* BY Columns */}
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>BY</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>BLot</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>BVal</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>BAvg</th>
                              {/* SL Columns */}
                              <th className="text-center py-[1px] px-[6px] font-bold text-white bg-[#3a4252] w-4">#</th>
                              <th className={`text-left py-[1px] px-[6px] font-bold text-white w-4`}>SL</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>SLot</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>SVal</th>
                        <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>SAvg</th>
                            </React.Fragment>
                          ))}
                    {/* Total Columns - Include BAvg and SAvg */}
                      <th className={`text-center py-[1px] px-[5px] font-bold text-white ${showOnlyTotal || selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>BY</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>BLot</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>BVal</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>BAvg</th>
                          <th className="text-center py-[1px] px-[6px] font-bold text-white bg-[#3a4252]">#</th>
                          <th className={`text-left py-[1px] px-[5px] font-bold text-white`}>SL</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>SLot</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>SVal</th>
                      <th className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white`}>SAvg</th>
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
                    
                    // If no data, show "No Data" message
                    if (maxRows === 0) {
                        const totalCols = availableDates.length * 9 + 9; // 9 cols per date + 9 for Total
                      return (
                        <tr className="border-b-2 border-white">
                          <td colSpan={totalCols} className="text-center py-[2.06px] text-muted-foreground font-bold">
                            No Data
                          </td>
                        </tr>
                      );
                    }
                    
                    // Limit display to 20 rows (rest will be scrollable)
                    const MAX_DISPLAY_ROWS = 20;
                    const displayRows = Math.min(maxRows, MAX_DISPLAY_ROWS);
                    
                    // Render rows (limited to 20)
                    return Array.from({ length: displayRows }).map((_, rowIdx) => (
                              <tr key={rowIdx} className={`hover:bg-accent/50 ${rowIdx === displayRows - 1 ? 'border-b-2 border-white' : ''}`}>
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
                              <td className={`text-right py-[1px] px-[6px] text-red-600 font-bold w-6 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
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
                                <td className={`text-center py-[1px] px-[5px] font-bold ${showOnlyTotal || availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${totalBuy ? getBrokerColorClass(totalBuy.broker) : ''}`}>
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
            <h3 className="font-semibold text-sm">NET - {selectedTickers.join(', ')}</h3>
          </div>
          <div className={`${showOnlyTotal ? 'flex justify-center' : 'w-full max-w-full'}`}>
              <div ref={netTableContainerRef} className={`${showOnlyTotal ? 'w-auto' : 'w-full max-w-full'} overflow-x-auto overflow-y-auto border-l-2 border-r-2 border-b-2 border-white`} style={{ maxHeight: 'calc(2 * 28px + 20 * 24px)' }}>
              <table ref={netTableRef} className={`${showOnlyTotal ? 'min-w-0' : 'min-w-[1000px]'} ${getFontSizeClass()} table-auto`} style={{ tableLayout: showOnlyTotal ? 'auto' : 'auto' }}>
                        <thead className="bg-[#3a4252]">
                        <tr className="border-t-2 border-white">
                      {!showOnlyTotal && availableDates.map((date, dateIndex) => (
                        <th key={date} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} colSpan={9}>
                        {formatDisplayDate(date)}
                            </th>
                          ))}
                      <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${showOnlyTotal || availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={9}>
                            Total
                          </th>
                        </tr>
                        <tr className="bg-[#3a4252]">
                      {!showOnlyTotal && availableDates.map((date, dateIndex) => (
                      <React.Fragment key={`detail-${date}`}>
                              {/* Net Buy Columns - No # */}
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>BY</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>BLot</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>BVal</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>BAvg</th>
                              {/* Net Sell Columns - Keep # */}
                              <th className="text-center py-[1px] px-[6px] font-bold text-white bg-[#3a4252] w-4">#</th>
                              <th className={`text-left py-[1px] px-[6px] font-bold text-white w-4`}>SL</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>SLot</th>
                              <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6`}>SVal</th>
                          <th className={`text-right py-[1px] px-[6px] font-bold text-white w-6 ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>SAvg</th>
                            </React.Fragment>
                          ))}
                    {/* Total Columns - Include BAvg and SAvg */}
                      <th className={`text-center py-[1px] px-[5px] font-bold text-white ${showOnlyTotal || availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>BY</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>BLot</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>BVal</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>BAvg</th>
                          <th className="text-center py-[1px] px-[6px] font-bold text-white bg-[#3a4252]">#</th>
                          <th className={`text-left py-[1px] px-[5px] font-bold text-white`}>SL</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>SLot</th>
                          <th className={`text-right py-[1px] px-[5px] font-bold text-white`}>SVal</th>
                      <th className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white`}>SAvg</th>
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
                      // Backend already handles: NetBuy is always >= 0, NetSell is always >= 0
                      const totalNetBuyData: { [broker: string]: { nblot: number; nbval: number; nbavg: number } } = {};
                      const totalNetSellData: { [broker: string]: { nslot: number; nsval: number; nsavg: number } } = {};
                    
                    allBrokerData.forEach(dateData => {
                            dateData.buyData.forEach(b => {
                          // IMPORTANT: A broker can only be either NetBuy OR NetSell, not both
                          // Determine if broker is NetBuy or NetSell based on which value is larger
                          // If both are > 0, prioritize based on which value is larger
                          const isNetBuy = (b.netBuyVol > 0 || b.netBuyValue > 0) && (b.netBuyValue >= b.netSellValue);
                          const isNetSell = (b.netSellVol > 0 || b.netSellValue > 0) && (b.netSellValue > b.netBuyValue);
                          
                          // Use netBuyVol > 0 for NetBuy (backend already handles negative conversion)
                          if (isNetBuy) {
                          if (!totalNetBuyData[b.broker]) {
                              totalNetBuyData[b.broker] = { nblot: 0, nbval: 0, nbavg: 0 };
                                }
                          const netBuyEntry = totalNetBuyData[b.broker];
                                if (netBuyEntry) {
                              netBuyEntry.nblot += b.netBuyVol || 0;
                              netBuyEntry.nbval += b.netBuyValue || 0;
                            }
                          }
                          
                          // Use netSellVol > 0 for NetSell (backend already handles conversion)
                          if (isNetSell) {
                          if (!totalNetSellData[b.broker]) {
                              totalNetSellData[b.broker] = { nslot: 0, nsval: 0, nsavg: 0 };
                                }
                          const netSellEntry = totalNetSellData[b.broker];
                                if (netSellEntry) {
                              netSellEntry.nslot += b.netSellVol || 0;
                              netSellEntry.nsval += b.netSellValue || 0;
                                }
                              }
                            });
                          });
                          
                      // Calculate averages from aggregated totals and sort
                    const sortedTotalNetBuy = Object.entries(totalNetBuyData)
                            .filter(([broker]) => brokerFDScreen(broker))
                        .map(([broker, data]) => ({ 
                          broker, 
                          ...data, 
                          nbavg: data.nblot > 0 ? data.nbval / data.nblot : 0 
                        }))
                            .sort((a, b) => b.nbval - a.nbval);
                    const sortedTotalNetSell = Object.entries(totalNetSellData)
                            .filter(([broker]) => brokerFDScreen(broker))
                        .map(([broker, data]) => ({ 
                          broker, 
                          ...data, 
                          nsavg: data.nslot > 0 ? data.nsval / data.nslot : 0 
                        }))
                            .sort((a, b) => b.nsval - a.nsval);
                          
                          // Generate contrast colors like BrokerInventoryPage (HSL with high saturation)
                          const generateContrastColor = (index: number): string => {
                            const baseHues = [150, 270, 50, 200, 330]; // dark green, violet, yellow, cyan, fuchsia
                            const hue = baseHues[index % baseHues.length];
                            const saturation = 60 + (index * 3) % 20; // 60-80% saturation
                            const lightness = 40 + (index * 2) % 15; // 40-55% lightness (darker for contrast)
                            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                          };
                          
                          // Generate contrast colors array for top 5
                          const bgColors = Array.from({ length: 5 }, (_, idx) => generateContrastColor(idx));
                          
                          // Helper function to shift color slightly for sell (shift hue and adjust lightness)
                          const shiftColorForSell = (color: string): string => {
                            // Parse HSL color: hsl(hue, saturation%, lightness%)
                            const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
                            if (!match || !match[1] || !match[2] || !match[3]) return color;
                            
                            const hue = parseInt(match[1], 10);
                            const saturation = parseInt(match[2], 10);
                            const lightness = parseInt(match[3], 10);
                            
                            // Shift hue by 15 degrees (subtle difference)
                            const shiftedHue = (hue + 15) % 360;
                            
                            // For yellow colors (original hue around 50, shifted to ~65), darken instead of lighten
                            // Also check for yellow range (45-70 degrees)
                            const isYellow = (hue >= 45 && hue <= 70) || (shiftedHue >= 45 && shiftedHue <= 70);
                            
                            let shiftedLightness: number;
                            if (isYellow) {
                              // Darken yellow colors - reduce lightness by 5-10% instead of increasing
                              shiftedLightness = Math.max(35, lightness - 8); // Darker for yellow
                            } else {
                              // Slightly lighter for other colors
                              shiftedLightness = Math.min(95, Math.max(35, lightness + 8));
                            }
                            
                            return `hsl(${shiftedHue}, ${saturation}%, ${shiftedLightness}%)`;
                          };
                          
                    // IMPORTANT: Data is SWAPPED - mapping must be adjusted
                    // Kolom BY (BLot, BVal, BAvg) displays NetSell data → lock top 5 NetSell from Total
                    // Kolom SL (SLot, SVal, SAvg) displays NetBuy data → lock top 5 NetBuy from Total
                    
                    // Map top 5 NetSell brokers (from Total) to background colors for BY columns
                    // These brokers will have background color in BY columns across all dates
                    const netBuyBrokerBgMap = new Map<string, string>();
                    sortedTotalNetSell.slice(0, 5).forEach((item, idx) => {
                      netBuyBrokerBgMap.set(item.broker, bgColors[idx] || '');
                    });
                          
                    // Map top 5 NetSell brokers (not used for background, but kept for consistency)
                    const netSellBrokerBgMap = new Map<string, string>();
                    sortedTotalNetSell.slice(0, 5).forEach((item, idx) => {
                      netSellBrokerBgMap.set(item.broker, shiftColorForSell(bgColors[idx] || ''));
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
                          
                    // If no data, show "No Data" message
                    if (maxRows === 0) {
                        const totalCols = availableDates.length * 9 + 9; // 9 cols per date + 9 for Total
                      return (
                        <tr className="border-b-2 border-white">
                          <td colSpan={totalCols} className="text-center py-[2.06px] text-muted-foreground font-bold">
                            No Data
                          </td>
                        </tr>
                      );
                    }
                          
                    // Limit display to 20 rows (rest will be scrollable)
                    const MAX_DISPLAY_ROWS = 20;
                    const displayRows = Math.min(maxRows, MAX_DISPLAY_ROWS);
                          
                    // Render rows (limited to 20)
                          return Array.from({ length: displayRows }).map((_, rowIdx) => {
                      // Cek apakah broker pada row adalah top5
                      // (delete unused block: netBuyData/netSellData functions)
                            return (
                              <tr key={rowIdx} className={`hover:bg-accent/50 ${rowIdx === displayRows - 1 ? 'border-b-2 border-white' : ''}`}>
                            {!showOnlyTotal && availableDates.map((date, dateIndex) => {
                            const dateData = allBrokerData.find(d => d.date === date);
                              // Sort brokers for this date
                              // Backend already separates: NetBuy (netBuyVol > 0) and NetSell (netSellVol > 0)
                              // IMPORTANT: A broker can only be either NetBuy OR NetSell, not both
                              // Filter: NetBuy brokers (netBuyVol > 0 AND netSellVol === 0, or netBuyValue > netSellValue)
                              // Filter: NetSell brokers (netSellVol > 0 AND netBuyVol === 0, or netSellValue > netBuyValue)
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
                              // Note: Sell background color disabled - only buy gets colored

                              // Get underline color for top 5 sell (locked per broker based on Total ranking)
                              // Use netBuyData for SL columns since they display NetBuy data
                              // Same broker will have same underline color across all dates
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
                                  <td className={`text-right py-[1px] px-[6px] w-6 font-bold text-red-600 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={sellUnderlineStyle}>
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

                              // Use swapped data for averages
                              const totalNetBuyAvg = totalNetSell?.nsavg || 0; // Use NetSell avg for BY column
                              const totalNetSellAvg = totalNetBuy?.nbavg || 0; // Use NetBuy avg for SL column
                            
                            return (
                              <React.Fragment>
                                  {/* Total BY columns - Display totalNetSell data */}
                                  <td className={`text-center py-[1px] px-[5px] font-bold ${showOnlyTotal || availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`} style={totalNetBuyBgStyle}>
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
            <div className="flex flex-wrap items-center gap-8">
              {/* Ticker Selection - Multi-select with chips */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Selected Ticker Chips */}
                  {selectedTickers.map(ticker => (
                    <div
                      key={ticker}
                      className="flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary rounded-md text-sm"
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
                  <div className="relative" ref={dropdownRef}>
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
                      className="w-24 pl-10 pr-3 py-[2.06px] text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
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
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
              <div 
                className="relative h-9 w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
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
                <div className="flex items-center justify-between h-full px-3 py-[2.06px]">
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
                  <span className="text-sm text-muted-foreground">to</span>
              <div 
                className="relative h-9 w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
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
                <div className="flex items-center justify-between h-full px-3 py-[2.06px]">
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

              {/* Show Button */}
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
                  
                  // Clear existing data before fetching new data
                  setSummaryByDate(new Map());
                  setIsDataReady(false);
                  shouldFetchDataRef.current = true; // Update ref first (synchronous)
                  setShouldFetchData(true);
                }}
                disabled={isLoading || selectedTickers.length === 0 || selectedDates.length === 0}
                className="px-4 py-1.5 h-9 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap"
              >
                Show
              </button>

            {/* F/D Filter */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">F/D:</label>
                  <select 
                  value={fdFilter}
                  onChange={(e) => setFdFilter(e.target.value as 'All' | 'Foreign' | 'Domestic')}
                  className="px-3 py-1.5 border border-[#3a4252] rounded-md bg-background text-foreground text-sm"
                >
                  <option value="All">All</option>
                  <option value="Foreign">Foreign</option>
                  <option value="Domestic">Domestic</option>
                  </select>
              </div>

            {/* Market Filter */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Board:</label>
                <select
                  value={marketFilter}
                  onChange={(e) => setMarketFilter(e.target.value as 'RG' | 'TN' | 'NG' | '')}
                  className="px-3 py-1.5 border border-[#3a4252] rounded-md bg-background text-foreground text-sm"
                >
                  <option value="">All Trade</option>
                  <option value="RG">RG</option>
                  <option value="TN">TN</option>
                  <option value="NG">NG</option>
                </select>
              </div>
              </div>
            </div>

      {/* Main Data Display */}
      <div className="bg-[#0a0f20]">
        {renderHorizontalView()}
      </div>
    </div>
  );
}
