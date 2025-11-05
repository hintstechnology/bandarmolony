import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Loader2, Calendar } from 'lucide-react';
import { api } from '../../services/api';

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
  BLotPerOrdNum?: number; // Buyer Lot/Order Number (Lot/ON from CSV column 7)
  SCode?: string;      // Seller Code (from CSV column 8)
  SLot?: number;       // Seller Lot (from CSV column 9)
  SFreq?: number;      // Seller Frequency (from CSV column 12)
  SLotPerFreq?: number; // Seller Lot/Frequency (Lot/F from CSV column 13)
  SOrdNum?: number;    // Seller Order Number (from CSV column 14)
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


// Fetch broker transaction data from API
const fetchBrokerTransactionData = async (brokerCode: string, date: string, market?: 'RG' | 'TN' | 'NG' | ''): Promise<BrokerTransactionData[]> => {
  try {
    console.log(`[BrokerTransaction] Fetching data for broker: ${brokerCode}, date: ${date}, market: ${market || 'All'}`);
    const response = await api.getBrokerTransactionData(brokerCode, date, market);
    if (response.success && response.data?.transactionData) {
      const data = response.data.transactionData;
      console.log(`[BrokerTransaction] Received ${data.length} rows for ${brokerCode} on ${date}`);
      return data;
    }
    console.warn(`[BrokerTransaction] No data received for ${brokerCode} on ${date}`);
    return [];
  } catch (error) {
    console.error(`[BrokerTransaction] Error fetching data for ${brokerCode} on ${date}:`, error);
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
  // Format: >= 1,000,000 → rounded to thousands with 'k' (1,164k)
  if (absValue >= 1000000) {
    // Use 'k' suffix for millions: 1,164,152 → 1,164k
    const thousands = Math.round(rounded / 1000);
    return `${thousands.toLocaleString('en-US')}k`;
  } else {
    // < 1,000,000: Show full number with comma separator
    // Example: 100,000 → 100,000 (not 100k)
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

export function BrokerTransaction() {
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
  
  // Store date column widths from Value table
  const dateColumnWidthsRef = useRef<Map<string, number>>(new Map());
  
  // API data states
  const [transactionData, setTransactionData] = useState<Map<string, BrokerTransactionData[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableBrokers, setAvailableBrokers] = useState<string[]>([]);
  const [isDataReady, setIsDataReady] = useState<boolean>(false); // Control when to show tables
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false); // Control when to fetch data (only when Show button clicked)
  
  // Search states
  const [tickerSearch, setTickerSearch] = useState<string>('');
  const [debouncedTickerSearch, setDebouncedTickerSearch] = useState<string>('');
  const [marketFilter, setMarketFilter] = useState<'RG' | 'TN' | 'NG' | ''>('RG'); // Default to RG
  
  // Multi-select ticker states
  const [tickerInput, setTickerInput] = useState('');
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]); // Empty by default - show all tickers
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);
  const [highlightedTickerIndex, setHighlightedTickerIndex] = useState<number>(-1);
  const dropdownTickerRef = useRef<HTMLDivElement>(null);

  // Request cancellation ref
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Pagination states for performance
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(50); // Limit to 50 rows per page

  // Debounce ticker search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTickerSearch(tickerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [tickerSearch]);
  
  // Reset to first page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedTickerSearch, selectedBrokers, selectedDates]);

  // Load available brokers and initial dates on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load broker list from csv_input/broker_list.csv
        const brokerResponse = await api.getBrokerList();
        if (brokerResponse.success && brokerResponse.data?.brokers) {
          setAvailableBrokers(brokerResponse.data.brokers);
        } else {
          throw new Error('Failed to load broker list');
        }
        
        // Load initial dates based on available data - default to last 3 trading days
        const initialDates = await getAvailableTradingDays(3);
        // Sort by date (oldest first) for display
        const sortedDates = [...initialDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        
        // Set default to last 3 trading days (skip weekends)
        setSelectedDates(sortedDates);
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
        
      } catch (error) {
        console.error('Error loading initial data:', error);
        
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
  }, []);

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
    
    const loadTransactionData = async () => {
      if (selectedBrokers.length === 0 || selectedDates.length === 0) {
        setTransactionData(new Map());
        setIsDataReady(false);
        setShouldFetchData(false);
        return;
      }
      
      // Create new AbortController for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const newTransactionData = new Map<string, BrokerTransactionData[]>();
        
        // Create all API call promises in parallel
        const apiPromises: Array<{ date: string; broker: string; promise: Promise<BrokerTransactionData[]> }> = [];
        
        for (const date of selectedDates) {
          for (const broker of selectedBrokers) {
            // Use marketFilter when fetching data
            apiPromises.push({
              date,
              broker,
              promise: fetchBrokerTransactionData(broker, date, marketFilter)
            });
          }
        }
        
        console.log(`[BrokerTransaction] Fetching data for ${apiPromises.length} combinations:`, {
          dates: selectedDates,
          brokers: selectedBrokers,
          market: marketFilter
        });
        
        // Execute all API calls in parallel with error handling
        const results = await Promise.allSettled(
          apiPromises.map(({ promise }) => promise)
        );
        
        // Check if request was aborted
        if (abortController.signal.aborted) {
          return;
        }
        
        // Log results for debugging
        let successCount = 0;
        let errorCount = 0;
        results.forEach((result, index) => {
          const promise = apiPromises[index];
          if (!promise) return;
          
          if (result.status === 'fulfilled') {
            successCount++;
            const data = result.value;
            if (data && data.length > 0) {
              console.log(`[BrokerTransaction] Success for ${promise.broker} on ${promise.date}: ${data.length} rows`);
            }
          } else {
            errorCount++;
            console.error(`[BrokerTransaction] Error for ${promise.broker} on ${promise.date}:`, result.status === 'rejected' ? result.reason : 'Unknown error');
          }
        });
        console.log(`[BrokerTransaction] Results: ${successCount} success, ${errorCount} errors`);
        
        // Process data per date - AGGREGATE per Emiten and per section (Buy, Sell, Net Buy, Net Sell)
        // When multiple brokers are selected, sum values for the same Emiten
        for (const date of selectedDates) {
          // Map to aggregate data per Emiten and per section
          // Key: Emiten, Value: aggregated BrokerTransactionData
          const aggregatedMap = new Map<string, BrokerTransactionData>();
          
          // Process results for this date from all brokers
          apiPromises.forEach(({ date: promiseDate }, index) => {
            if (promiseDate !== date) return;
            
            const result = results[index];
            if (result && result.status === 'fulfilled' && 'value' in result && result.value) {
              const data = result.value;
              
              // Aggregate rows by Emiten
              for (const row of data) {
                const emiten = row.Emiten || '';
                if (!emiten) continue;
                
                const existing = aggregatedMap.get(emiten);
                if (existing) {
                  // Sum values for the same Emiten from different brokers
                  // Buyer section
                  existing.BuyerVol = (existing.BuyerVol || 0) + (row.BuyerVol || 0);
                  existing.BuyerValue = (existing.BuyerValue || 0) + (row.BuyerValue || 0);
                  existing.BFreq = (existing.BFreq || 0) + (row.BFreq || 0);
                  existing.BOrdNum = (existing.BOrdNum || 0) + (row.BOrdNum || 0);
                  // Preserve Lot/F and Lot/ON from CSV if available, otherwise calculate
                  if (row.BLotPerFreq !== undefined && row.BLotPerFreq !== null) {
                    // If both have values, use weighted average, otherwise use the one that exists
                    if (existing.BLotPerFreq !== undefined && existing.BLotPerFreq !== null) {
                      // Weighted average based on frequency
                      const totalFreq = (existing.BFreq || 0) + (row.BFreq || 0);
                      if (totalFreq > 0) {
                        existing.BLotPerFreq = ((existing.BLotPerFreq * (existing.BFreq || 0)) + (row.BLotPerFreq * (row.BFreq || 0))) / totalFreq;
                      }
                    } else {
                      existing.BLotPerFreq = row.BLotPerFreq;
                    }
                  } else if (existing.BLotPerFreq === undefined || existing.BLotPerFreq === null) {
                    existing.BLotPerFreq = (existing.BFreq || 0) > 0 ? (existing.BLot || 0) / (existing.BFreq || 0) : 0;
                  }
                  if (row.BLotPerOrdNum !== undefined && row.BLotPerOrdNum !== null) {
                    if (existing.BLotPerOrdNum !== undefined && existing.BLotPerOrdNum !== null) {
                      // Weighted average based on order number
                      const totalOrdNum = (existing.BOrdNum || 0) + (row.BOrdNum || 0);
                      if (totalOrdNum !== 0) {
                        existing.BLotPerOrdNum = ((existing.BLotPerOrdNum * Math.abs(existing.BOrdNum || 0)) + (row.BLotPerOrdNum * Math.abs(row.BOrdNum || 0))) / Math.abs(totalOrdNum);
                      }
                    } else {
                      existing.BLotPerOrdNum = row.BLotPerOrdNum;
                    }
                  } else if (existing.BLotPerOrdNum === undefined || existing.BLotPerOrdNum === null) {
                    existing.BLotPerOrdNum = (existing.BOrdNum || 0) !== 0 ? (existing.BLot || 0) / (existing.BOrdNum || 0) : 0;
                  }
                  existing.BLot = (existing.BLot || 0) + (row.BLot || 0);
                  // Recalculate BuyerAvg from aggregated values
                  existing.BuyerAvg = (existing.BuyerVol || 0) > 0 ? (existing.BuyerValue || 0) / (existing.BuyerVol || 0) : 0;
                  
                  // Seller section
                  existing.SellerVol = (existing.SellerVol || 0) + (row.SellerVol || 0);
                  existing.SellerValue = (existing.SellerValue || 0) + (row.SellerValue || 0);
                  existing.SFreq = (existing.SFreq || 0) + (row.SFreq || 0);
                  existing.SOrdNum = (existing.SOrdNum || 0) + (row.SOrdNum || 0);
                  if (row.SLotPerFreq !== undefined && row.SLotPerFreq !== null) {
                    if (existing.SLotPerFreq !== undefined && existing.SLotPerFreq !== null) {
                      const totalFreq = (existing.SFreq || 0) + (row.SFreq || 0);
                      if (totalFreq > 0) {
                        existing.SLotPerFreq = ((existing.SLotPerFreq * (existing.SFreq || 0)) + (row.SLotPerFreq * (row.SFreq || 0))) / totalFreq;
                      }
                    } else {
                      existing.SLotPerFreq = row.SLotPerFreq;
                    }
                  } else if (existing.SLotPerFreq === undefined || existing.SLotPerFreq === null) {
                    existing.SLotPerFreq = (existing.SFreq || 0) > 0 ? (existing.SLot || 0) / (existing.SFreq || 0) : 0;
                  }
                  if (row.SLotPerOrdNum !== undefined && row.SLotPerOrdNum !== null) {
                    if (existing.SLotPerOrdNum !== undefined && existing.SLotPerOrdNum !== null) {
                      const totalOrdNum = (existing.SOrdNum || 0) + (row.SOrdNum || 0);
                      if (totalOrdNum !== 0) {
                        existing.SLotPerOrdNum = ((existing.SLotPerOrdNum * Math.abs(existing.SOrdNum || 0)) + (row.SLotPerOrdNum * Math.abs(row.SOrdNum || 0))) / Math.abs(totalOrdNum);
                      }
                    } else {
                      existing.SLotPerOrdNum = row.SLotPerOrdNum;
                    }
                  } else if (existing.SLotPerOrdNum === undefined || existing.SLotPerOrdNum === null) {
                    existing.SLotPerOrdNum = (existing.SOrdNum || 0) !== 0 ? (existing.SLot || 0) / (existing.SOrdNum || 0) : 0;
                  }
                  existing.SLot = (existing.SLot || 0) + (row.SLot || 0);
                  existing.SellerAvg = (existing.SellerVol || 0) > 0 ? (existing.SellerValue || 0) / (existing.SellerVol || 0) : 0;
                  
                  // Net Buy section
                  existing.NetBuyVol = (existing.NetBuyVol || 0) + (row.NetBuyVol || 0);
                  existing.NetBuyValue = (existing.NetBuyValue || 0) + (row.NetBuyValue || 0);
                  existing.NBFreq = (existing.NBFreq || 0) + (row.NBFreq || 0);
                  existing.NBOrdNum = (existing.NBOrdNum || 0) + (row.NBOrdNum || 0);
                  if (row.NBLotPerFreq !== undefined && row.NBLotPerFreq !== null) {
                    if (existing.NBLotPerFreq !== undefined && existing.NBLotPerFreq !== null) {
                      const totalFreq = (existing.NBFreq || 0) + (row.NBFreq || 0);
                      if (totalFreq > 0) {
                        existing.NBLotPerFreq = ((existing.NBLotPerFreq * (existing.NBFreq || 0)) + (row.NBLotPerFreq * (row.NBFreq || 0))) / totalFreq;
                      }
                    } else {
                      existing.NBLotPerFreq = row.NBLotPerFreq;
                    }
                  } else if (existing.NBLotPerFreq === undefined || existing.NBLotPerFreq === null) {
                    existing.NBLotPerFreq = (existing.NBFreq || 0) > 0 ? (existing.NBLot || 0) / (existing.NBFreq || 0) : 0;
                  }
                  if (row.NBLotPerOrdNum !== undefined && row.NBLotPerOrdNum !== null) {
                    if (existing.NBLotPerOrdNum !== undefined && existing.NBLotPerOrdNum !== null) {
                      const totalOrdNum = (existing.NBOrdNum || 0) + (row.NBOrdNum || 0);
                      if (totalOrdNum !== 0) {
                        existing.NBLotPerOrdNum = ((existing.NBLotPerOrdNum * Math.abs(existing.NBOrdNum || 0)) + (row.NBLotPerOrdNum * Math.abs(row.NBOrdNum || 0))) / Math.abs(totalOrdNum);
                      }
                    } else {
                      existing.NBLotPerOrdNum = row.NBLotPerOrdNum;
                    }
                  } else if (existing.NBLotPerOrdNum === undefined || existing.NBLotPerOrdNum === null) {
                    existing.NBLotPerOrdNum = (existing.NBOrdNum || 0) !== 0 ? (existing.NBLot || 0) / (existing.NBOrdNum || 0) : 0;
                  }
                  existing.NBLot = (existing.NBLot || 0) + (row.NBLot || 0);
                  existing.NBAvg = (existing.NetBuyVol || 0) > 0 ? (existing.NetBuyValue || 0) / (existing.NetBuyVol || 0) : 0;
                  
                  // Net Sell section
                  existing.NetSellVol = (existing.NetSellVol || 0) + (row.NetSellVol || 0);
                  existing.NetSellValue = (existing.NetSellValue || 0) + (row.NetSellValue || 0);
                  existing.NSFreq = (existing.NSFreq || 0) + (row.NSFreq || 0);
                  existing.NSOrdNum = (existing.NSOrdNum || 0) + (row.NSOrdNum || 0);
                  if (row.NSLotPerFreq !== undefined && row.NSLotPerFreq !== null) {
                    if (existing.NSLotPerFreq !== undefined && existing.NSLotPerFreq !== null) {
                      const totalFreq = (existing.NSFreq || 0) + (row.NSFreq || 0);
                      if (totalFreq > 0) {
                        existing.NSLotPerFreq = ((existing.NSLotPerFreq * (existing.NSFreq || 0)) + (row.NSLotPerFreq * (row.NSFreq || 0))) / totalFreq;
                      }
                    } else {
                      existing.NSLotPerFreq = row.NSLotPerFreq;
                    }
                  } else if (existing.NSLotPerFreq === undefined || existing.NSLotPerFreq === null) {
                    existing.NSLotPerFreq = (existing.NSFreq || 0) > 0 ? (existing.NSLot || 0) / (existing.NSFreq || 0) : 0;
                  }
                  if (row.NSLotPerOrdNum !== undefined && row.NSLotPerOrdNum !== null) {
                    if (existing.NSLotPerOrdNum !== undefined && existing.NSLotPerOrdNum !== null) {
                      const totalOrdNum = (existing.NSOrdNum || 0) + (row.NSOrdNum || 0);
                      if (totalOrdNum !== 0) {
                        existing.NSLotPerOrdNum = ((existing.NSLotPerOrdNum * Math.abs(existing.NSOrdNum || 0)) + (row.NSLotPerOrdNum * Math.abs(row.NSOrdNum || 0))) / Math.abs(totalOrdNum);
                      }
                    } else {
                      existing.NSLotPerOrdNum = row.NSLotPerOrdNum;
                    }
                  } else if (existing.NSLotPerOrdNum === undefined || existing.NSLotPerOrdNum === null) {
                    existing.NSLotPerOrdNum = (existing.NSOrdNum || 0) !== 0 ? (existing.NSLot || 0) / (existing.NSOrdNum || 0) : 0;
                  }
                  existing.NSLot = (existing.NSLot || 0) + (row.NSLot || 0);
                  existing.NSAvg = (existing.NetSellVol || 0) > 0 ? (existing.NetSellValue || 0) / (existing.NetSellVol || 0) : 0;
                  
                  // Total fields
                  existing.TotalVolume = (existing.TotalVolume || 0) + (row.TotalVolume || 0);
                  existing.TotalValue = (existing.TotalValue || 0) + (row.TotalValue || 0);
                  existing.TransactionCount = (existing.TransactionCount || 0) + (row.TransactionCount || 0);
                  existing.AvgPrice = (existing.TotalVolume || 0) > 0 ? (existing.TotalValue || 0) / (existing.TotalVolume || 0) : 0;
                } else {
                  // First occurrence of this Emiten - clone row
                  aggregatedMap.set(emiten, { ...row });
                }
              }
            }
          });
          
          // Convert map to array
          const allRows = Array.from(aggregatedMap.values());
          newTransactionData.set(date, allRows);
          console.log(`[BrokerTransaction] Aggregated data for ${date}: ${allRows.length} unique Emiten(s) from ${selectedBrokers.length} broker(s)`);
        }
        
        // Check if request was aborted before setting state
        if (!abortController.signal.aborted) {
          console.log(`[BrokerTransaction] Setting transaction data:`, {
            datesCount: newTransactionData.size,
            totalRows: Array.from(newTransactionData.values()).reduce((sum, arr) => sum + arr.length, 0)
          });
        setTransactionData(newTransactionData);
          setIsDataReady(true);
          setShouldFetchData(false);
        }
        
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return; // Request was cancelled, don't update state
        }
        if (!abortController.signal.aborted) {
        setError('Failed to load transaction data');
        console.error('Error loading transaction data:', err);
          setIsDataReady(false);
          setShouldFetchData(false);
        }
      } finally {
        if (!abortController.signal.aborted) {
        setIsLoading(false);
        }
      }
    };

    loadTransactionData();
    
    // Cleanup: abort request on unmount or dependency change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [shouldFetchData, selectedBrokers, selectedDates, marketFilter]);

  // Update date range when startDate or endDate changes
  useEffect(() => {
    if (startDate && endDate) {
      // Parse dates as local dates (YYYY-MM-DD format) to avoid timezone issues
      // Split YYYY-MM-DD and create date in local timezone
      const startParts = startDate.split('-').map(Number);
      const endParts = endDate.split('-').map(Number);
      
      if (startParts.length !== 3 || endParts.length !== 3) {
        console.warn('Invalid date format');
        return;
      }
      
      const startYear = startParts[0];
      const startMonth = startParts[1];
      const startDay = startParts[2];
      const endYear = endParts[0];
      const endMonth = endParts[1];
      const endDay = endParts[2];
      
      if (startYear === undefined || startMonth === undefined || startDay === undefined ||
          endYear === undefined || endMonth === undefined || endDay === undefined) {
        console.warn('Invalid date format');
        return;
      }
      
      const start = new Date(startYear, startMonth - 1, startDay);
      const end = new Date(endYear, endMonth - 1, endDay);
      
      // Check if range is valid
      if (start > end) {
        console.warn('Tanggal mulai harus sebelum tanggal akhir');
        return;
      }
      
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
      
      // Check if trading days exceed 7
      if (dateArray.length > 7) {
        alert('Maksimal 7 hari kerja yang bisa dipilih');
        // Still limit to 7 days but keep the selected range
        const limitedDates = dateArray.slice(0, 7);
        const sortedDates = limitedDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        setSelectedDates(sortedDates);
        return;
      }
      
      // Sort by date (oldest first) for display
      const sortedDates = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setSelectedDates(sortedDates);
    }
  }, [startDate, endDate]);

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
    }
    setBrokerInput('');
    setShowBrokerSuggestions(false);
  };

  // Handle broker removal
  const handleRemoveBroker = (broker: string) => {
    setSelectedBrokers(selectedBrokers.filter(b => b !== broker));
  };

  // Handle ticker selection
  const handleTickerSelect = (ticker: string) => {
    if (!selectedTickers.includes(ticker)) {
      setSelectedTickers([...selectedTickers, ticker]);
    }
    setTickerInput('');
    setShowTickerSuggestions(false);
  };

  // Handle ticker removal
  const handleRemoveTicker = (ticker: string) => {
    setSelectedTickers(selectedTickers.filter(t => t !== ticker));
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

  // Synchronize table widths between Value and Net tables - Optimized with throttling
  useEffect(() => {
    if (isLoading || selectedDates.length === 0) return;
    
    // Clear stored widths when dates change
    dateColumnWidthsRef.current.clear();

    let rafId: number | null = null;
    const syncTableWidths = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
      const valueTable = valueTableRef.current;
      const netTable = netTableRef.current;

        if (!valueTable || !netTable) {
          rafId = null;
          return;
        }

      // Sync overall table width
      const valueTableWidth = valueTable.scrollWidth || valueTable.offsetWidth;
      
      if (valueTableWidth > 0) {
        netTable.style.width = `${valueTableWidth}px`;
        netTable.style.minWidth = `${valueTableWidth}px`;
        netTable.style.maxWidth = `${valueTableWidth}px`;
      }

      // Sync date column group widths (colspan=17 headers)
      const valueHeaderRows = valueTable.querySelectorAll('thead tr');
      const netHeaderRows = netTable.querySelectorAll('thead tr');
      
      if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
        // Get first header row (date headers with colspan=17)
        const valueDateHeaderRow = valueHeaderRows[0];
        const netDateHeaderRow = netHeaderRows[0];
        
        if (valueDateHeaderRow && netDateHeaderRow) {
          const valueDateHeaderCells = valueDateHeaderRow.querySelectorAll('th[colspan="17"]');
          const netDateHeaderCells = netDateHeaderRow.querySelectorAll('th[colspan="17"]');
          
            // Store widths from Value table and apply to Net table - only sync visible headers
          valueDateHeaderCells.forEach((valueCell, index) => {
            const netCell = netDateHeaderCells[index] as HTMLElement;
            if (netCell && valueCell) {
              const valueWidth = (valueCell as HTMLElement).offsetWidth;
              
              // Store width by date index (excluding Total column)
              if (index < selectedDates.length) {
                const date = selectedDates[index];
                if (date) {
                  dateColumnWidthsRef.current.set(date, valueWidth);
                }
              }
              
              // Apply width to Net table
              const width = `${valueWidth}px`;
              netCell.style.width = width;
              netCell.style.minWidth = width;
              netCell.style.maxWidth = width;
            }
          });
          
            // Only sync visible rows (paginated) to improve performance
          const valueBodyRows = valueTable.querySelectorAll('tbody tr');
          const netBodyRows = netTable.querySelectorAll('tbody tr');
            const maxRowsToSync = Math.min(valueBodyRows.length, itemsPerPage + 10); // Sync a bit more than visible for smooth scrolling
          
            for (let rowIndex = 0; rowIndex < Math.min(valueBodyRows.length, maxRowsToSync); rowIndex++) {
              const valueRow = valueBodyRows[rowIndex];
            const netRow = netBodyRows[rowIndex] as HTMLTableRowElement;
              if (!valueRow || !netRow) continue;
            
            // For each date column group (17 cells), sync all cells
            selectedDates.forEach((date, dateIndex) => {
              const startCellIndex = dateIndex * 17;
              const storedWidth = dateColumnWidthsRef.current.get(date);
              
              if (storedWidth) {
                // Sync each cell in this date column group
                for (let i = 0; i < 17; i++) {
                  const valueCell = valueRow.children[startCellIndex + i] as HTMLElement;
                  const netCell = netRow.children[startCellIndex + i] as HTMLElement;
                  
                  if (valueCell && netCell) {
                    const cellWidth = valueCell.offsetWidth;
                    const width = `${cellWidth}px`;
                    netCell.style.width = width;
                    netCell.style.minWidth = width;
                    netCell.style.maxWidth = width;
                  }
                }
              }
            });
            
            // Also sync Total column if exists
            const totalStartIndex = selectedDates.length * 17;
            const valueTotalCells = Array.from(valueRow.children).slice(totalStartIndex);
            const netTotalCells = Array.from(netRow.children).slice(totalStartIndex);
            
            valueTotalCells.forEach((valueCell, idx) => {
              const netCell = netTotalCells[idx] as HTMLElement;
              if (netCell && valueCell) {
                const cellWidth = (valueCell as HTMLElement).offsetWidth;
                const width = `${cellWidth}px`;
                netCell.style.width = width;
                netCell.style.minWidth = width;
                netCell.style.maxWidth = width;
              }
          });
            }
        }

        // Sync individual column header widths
        const valueColumnHeaderRow = valueHeaderRows[1];
        const netColumnHeaderRow = netHeaderRows[1];
        
        if (valueColumnHeaderRow && netColumnHeaderRow) {
          const valueHeaderCells = valueColumnHeaderRow.querySelectorAll('th');
          const netHeaderCells = netColumnHeaderRow.querySelectorAll('th');
          
          valueHeaderCells.forEach((valueCell, index) => {
            const netCell = netHeaderCells[index] as HTMLElement;
            if (netCell && valueCell) {
              const width = `${(valueCell as HTMLElement).offsetWidth}px`;
              netCell.style.width = width;
              netCell.style.minWidth = width;
              netCell.style.maxWidth = width;
            }
          });
        }
      }
        rafId = null;
      });
    };

    // Debounce function to avoid too frequent syncs - increased delay for better performance
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        syncTableWidths();
      }, 200); // Increased from 100ms to 200ms
    };
    
    // Initial sync with delay - only sync if table exists
    let initialTimeoutId: NodeJS.Timeout | null = null;
    if (valueTableRef.current && netTableRef.current) {
      initialTimeoutId = setTimeout(() => {
      syncTableWidths();
      }, 500); // Increased from 400ms to 500ms
    }
    
    // Sync after data finishes loading - only if tables exist
    let dataTimeoutId: NodeJS.Timeout | null = null;
    if (!isLoading && valueTableRef.current && netTableRef.current) {
      dataTimeoutId = setTimeout(() => {
        syncTableWidths();
      }, 800); // Increased from 700ms to 800ms
    }

    // Use ResizeObserver to watch for changes
    let resizeObserver: ResizeObserver | null = null;
    
    if (valueTableRef.current) {
      resizeObserver = new ResizeObserver(() => {
        debouncedSync();
      });
      resizeObserver.observe(valueTableRef.current);
    }

    if (valueTableContainerRef.current) {
      if (!resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          debouncedSync();
        });
      }
      resizeObserver.observe(valueTableContainerRef.current);
    }

    // Also sync on window resize
    const handleResize = () => {
      debouncedSync();
    };
    window.addEventListener('resize', handleResize);
      
    return () => {
      if (initialTimeoutId) clearTimeout(initialTimeoutId);
      if (dataTimeoutId) clearTimeout(dataTimeoutId);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [selectedDates, isLoading, transactionData, itemsPerPage]);

  // Synchronize horizontal scroll between Value and Net tables
  useEffect(() => {
    if (isLoading || selectedDates.length === 0) return;

    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;

    if (!valueContainer || !netContainer) return;

    // Flag to prevent infinite loop
    let isSyncing = false;

    // Handle Value table scroll - sync to Net table
    const handleValueScroll = () => {
      if (!isSyncing && netContainer) {
        isSyncing = true;
        netContainer.scrollLeft = valueContainer.scrollLeft;
        requestAnimationFrame(() => {
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
  }, [isLoading, selectedDates, transactionData]);

  // Memoize expensive calculations
  const { uniqueStocks, filteredStocks, sortedStocksByDate, sortedNetStocksByDate, totalDataByStock, totalNetDataByStock, sortedTotalStocks, sortedTotalNetStocks, buyStocksByDate, sellStocksByDate, netBuyStocksByDate, netSellStocksByDate } = useMemo<{
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
  }>(() => {
    if (selectedBrokers.length === 0 || selectedDates.length === 0 || transactionData.size === 0) {
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
        netSellStocksByDate: new Map()
      };
    }
    
    // Treat 4 sections independently: Buy (BCode), Sell (SCode), Net Buy (NBCode), Net Sell (NSCode)
    // Each section filters and sorts separately
    const searchTerm = debouncedTickerSearch.trim().toLowerCase();
    // Support multi-select tickers: if selectedTickers is not empty, filter by those tickers
    const shouldFilterBySelectedTickers = selectedTickers.length > 0;
    
    // SECTION 1: Buy (BCode) - Filter and sort independently
    // Each row represents a separate entry in Value Buy section using BCode (column 1)
    const buyStocksByDate = new Map<string, Array<{ stock: string; data: BrokerTransactionData }>>();
    selectedDates.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const buyData = dateData
        .filter(d => {
          // Filter out rows where BCode is empty
          const bCode = d.BCode || '';
          if (!bCode) return false;
          
          // Filter by selected tickers if provided
          if (shouldFilterBySelectedTickers) {
            if (!selectedTickers.includes(bCode)) return false;
          }
          
          // Filter by search term if provided
          if (searchTerm) {
            return bCode.toLowerCase() === searchTerm;
          }
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
    selectedDates.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const sellData = dateData
        .filter(d => {
          // Filter out rows where SCode is empty
          const sCode = d.SCode || '';
          if (!sCode) return false;
          
          // Filter by selected tickers if provided
          if (shouldFilterBySelectedTickers) {
            if (!selectedTickers.includes(sCode)) return false;
          }
          
          // Filter by search term if provided
          if (searchTerm) {
            return sCode.toLowerCase() === searchTerm;
          }
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
    selectedDates.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const netBuyData = dateData
        .filter(d => {
          // Filter out rows where NBCode is empty
          const nbCode = d.NBCode || '';
          if (!nbCode) return false;
          
          // Filter by selected tickers if provided
          if (shouldFilterBySelectedTickers) {
            if (!selectedTickers.includes(nbCode)) return false;
          }
          
          // Filter by search term if provided
          if (searchTerm) {
            return nbCode.toLowerCase() === searchTerm;
          }
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
    selectedDates.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const netSellData = dateData
        .filter(d => {
          // Filter out rows where NSCode is empty
          const nsCode = d.NSCode || '';
          if (!nsCode) return false;
          
          // Filter by selected tickers if provided
          if (shouldFilterBySelectedTickers) {
            if (!selectedTickers.includes(nsCode)) return false;
          }
          
          // Filter by search term if provided
          if (searchTerm) {
            return nsCode.toLowerCase() === searchTerm;
          }
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
    
    selectedDates.forEach(date => {
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
    selectedDates.forEach(date => {
      const buyData = buyStocksByDate.get(date) || [];
      sortedStocksByDate.set(date, buyData.map(d => d.stock));
    });
    
    const sortedNetStocksByDate = new Map<string, string[]>();
    selectedDates.forEach(date => {
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
      buyerAvgCount: number;
    }>();
    
    const totalSellDataByStock = new Map<string, {
        sellerVol: number;
        sellerValue: number;
        sellerAvg: number;
        sellerFreq: number;
        sellerOrdNum: number;
        sellerAvgCount: number;
      }>();
      
      selectedDates.forEach(date => {
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
              buyerAvgCount: 0,
            });
          }
          const total = totalBuyDataByStock.get(buyStock)!;
          total.buyerVol += Number(dayData.BuyerVol) || 0;
          total.buyerValue += Number(dayData.BuyerValue) || 0;
          total.buyerFreq += Number(dayData.BFreq) || Number(dayData.TransactionCount) || 0;
          total.buyerOrdNum += Number(dayData.BOrdNum) || 0;
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
              sellerAvgCount: 0,
            });
          }
          const total = totalSellDataByStock.get(sellStock)!;
          total.sellerVol += Number(dayData.SellerVol) || 0;
          total.sellerValue += Number(dayData.SellerValue) || 0;
          total.sellerFreq += Number(dayData.SFreq) || Number(dayData.TransactionCount) || 0;
          total.sellerOrdNum += Number(dayData.SOrdNum) || 0;
          if (dayData.SellerAvg || (dayData.SellerVol && dayData.SellerVol > 0)) {
            total.sellerAvg += dayData.SellerAvg || ((dayData.SellerValue || 0) / (dayData.SellerVol || 1));
            total.sellerAvgCount += 1;
          }
        }
      });
    });
    
      // Calculate final averages
    totalBuyDataByStock.forEach((total) => {
        total.buyerAvg = total.buyerAvgCount > 0 ? total.buyerAvg / total.buyerAvgCount : (total.buyerVol > 0 ? total.buyerValue / total.buyerVol : 0);
    });
    totalSellDataByStock.forEach((total) => {
        total.sellerAvg = total.sellerAvgCount > 0 ? total.sellerAvg / total.sellerAvgCount : (total.sellerVol > 0 ? total.sellerValue / total.sellerVol : 0);
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
      sellerVol: number;
      sellerValue: number;
      sellerAvg: number;
      sellerFreq: number;
      sellerOrdNum: number;
      buyerAvgCount: number;
      sellerAvgCount: number;
    }>();
    
    // Combine Buy and Sell data (for backward compatibility with rendering code)
    Array.from(totalBuyDataByStock.entries()).forEach(([stock, buyData]) => {
      totalDataByStock.set(stock, {
        ...buyData,
        sellerVol: 0,
        sellerValue: 0,
        sellerAvg: 0,
        sellerFreq: 0,
        sellerOrdNum: 0,
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
        existing.sellerAvgCount = sellData.sellerAvgCount;
      } else {
        totalDataByStock.set(stock, {
          buyerVol: 0,
          buyerValue: 0,
          buyerAvg: 0,
          buyerFreq: 0,
          buyerOrdNum: 0,
          buyerAvgCount: 0,
          ...sellData,
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
      netBuyAvgCount: number;
    }>();
    
    const totalNetSellDataByStock = new Map<string, {
      netSellVol: number;
      netSellValue: number;
      netSellAvg: number;
      netSellFreq: number;
      netSellOrdNum: number;
      netSellAvgCount: number;
    }>();
    
    selectedDates.forEach(date => {
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
              netBuyAvgCount: 0,
            });
          }
          const total = totalNetBuyDataByStock.get(netBuyStock)!;
          const nbLot = (dayData.NBLot || 0) * 100; // Convert lot to volume
          const nbVal = dayData.NBVal || 0;
          const nbFreq = dayData.NBFreq || 0;
          const nbOrdNum = dayData.NBOrdNum || 0;
          
          total.netBuyVol += nbLot;
          total.netBuyValue += nbVal;
          total.netBuyFreq += nbFreq;
          total.netBuyOrdNum += nbOrdNum;
          
          if (nbLot > 0) {
            total.netBuyAvg += nbVal / nbLot;
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
              netSellAvgCount: 0,
            });
          }
          const total = totalNetSellDataByStock.get(netSellStock)!;
          const nsLot = (dayData.NSLot || 0) * 100; // Convert lot to volume
          const nsVal = dayData.NSVal || 0;
          const nsFreq = dayData.NSFreq || 0;
          const nsOrdNum = dayData.NSOrdNum || 0;
          
          total.netSellVol += nsLot;
          total.netSellValue += nsVal;
          total.netSellFreq += nsFreq;
          total.netSellOrdNum += nsOrdNum;
          
          if (nsLot > 0) {
            total.netSellAvg += nsVal / nsLot;
            total.netSellAvgCount += 1;
          }
        }
      });
    });
    
    // Calculate final averages
    totalNetBuyDataByStock.forEach((total) => {
      total.netBuyAvg = total.netBuyAvgCount > 0 ? total.netBuyAvg / total.netBuyAvgCount : (total.netBuyVol > 0 ? total.netBuyValue / total.netBuyVol : 0);
    });
    totalNetSellDataByStock.forEach((total) => {
      total.netSellAvg = total.netSellAvgCount > 0 ? total.netSellAvg / total.netSellAvgCount : (total.netSellVol > 0 ? total.netSellValue / total.netSellVol : 0);
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
      netSellVol: number;
      netSellValue: number;
      netSellAvg: number;
      netSellFreq: number;
      netSellOrdNum: number;
      netBuyAvgCount: number;
      netSellAvgCount: number;
    }>();
    
    // Combine Net Buy and Net Sell data (for backward compatibility with rendering code)
    Array.from(totalNetBuyDataByStock.entries()).forEach(([stock, netBuyData]) => {
      totalNetDataByStock.set(stock, {
        ...netBuyData,
        netSellVol: 0,
        netSellValue: 0,
        netSellAvg: 0,
        netSellFreq: 0,
        netSellOrdNum: 0,
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
        existing.netSellAvgCount = netSellData.netSellAvgCount;
      } else {
        totalNetDataByStock.set(stock, {
          netBuyVol: 0,
          netBuyValue: 0,
          netBuyAvg: 0,
          netBuyFreq: 0,
          netBuyOrdNum: 0,
          netBuyAvgCount: 0,
          ...netSellData,
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
      netSellStocksByDate
    };
  }, [selectedBrokers, selectedDates, transactionData, debouncedTickerSearch, selectedTickers]);

  // Calculate total pages for pagination - use max rows from all sections (Buy, Sell, Net Buy, Net Sell)
  const totalPages = useMemo(() => {
    let maxBuyRows = 0;
    let maxSellRows = 0;
    let maxNetBuyRows = 0;
    let maxNetSellRows = 0;
    selectedDates.forEach(date => {
      const buyData = buyStocksByDate.get(date) || [];
      const sellData = sellStocksByDate.get(date) || [];
      const netBuyData = netBuyStocksByDate.get(date) || [];
      const netSellData = netSellStocksByDate.get(date) || [];
      maxBuyRows = Math.max(maxBuyRows, buyData.length);
      maxSellRows = Math.max(maxSellRows, sellData.length);
      maxNetBuyRows = Math.max(maxNetBuyRows, netBuyData.length);
      maxNetSellRows = Math.max(maxNetSellRows, netSellData.length);
    });
    const maxRows = Math.max(maxBuyRows, maxSellRows, maxNetBuyRows, maxNetSellRows);
    if (maxRows === 0) return 1;
    return Math.ceil(maxRows / itemsPerPage);
  }, [buyStocksByDate, sellStocksByDate, netBuyStocksByDate, netSellStocksByDate, selectedDates, itemsPerPage]);

  const renderHorizontalView = useCallback(() => {
    console.log('[BrokerTransaction] renderHorizontalView called:', {
      selectedBrokers: selectedBrokers.length,
      selectedDates: selectedDates.length,
      isDataReady,
      uniqueStocks: uniqueStocks.length,
      transactionDataSize: transactionData.size
    });
    
    if (selectedBrokers.length === 0 || selectedDates.length === 0 || !isDataReady) {
      console.log('[BrokerTransaction] renderHorizontalView: Conditions not met, returning null');
      return null;
    }
    
    if (uniqueStocks.length === 0) {
      console.log('[BrokerTransaction] renderHorizontalView: No unique stocks found');
      return (
        <div className="text-center py-16">
          <div className="text-gray-400 text-sm">
            No data available for {selectedBrokers.join(', ')} on selected dates
          </div>
        </div>
      );
    }
    
    if (filteredStocks.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="text-gray-400 text-sm">
            No stocks found matching "{debouncedTickerSearch}"
          </div>
        </div>
      );
    }
    
    // VALUE Table - Shows Buyer and Seller data
    const renderValueTable = () => {
      // For VALUE table: Get max row count across all dates for Buy and Sell sections separately
      let maxBuyRows = 0;
      let maxSellRows = 0;
      selectedDates.forEach(date => {
        const buyData = buyStocksByDate.get(date) || [];
        const sellData = sellStocksByDate.get(date) || [];
        maxBuyRows = Math.max(maxBuyRows, buyData.length);
        maxSellRows = Math.max(maxSellRows, sellData.length);
      });
      const maxRows = Math.max(maxBuyRows, maxSellRows);
      
      // Get paginated rows for this table
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const rowIndices = Array.from({ length: Math.min(endIndex - startIndex, maxRows - startIndex) }, (_, i) => startIndex + i);
      
      return (
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">VALUE - {selectedBrokers.join(', ')} ({maxRows} total, showing {rowIndices.length})</h3>
            {totalPages > 1 && (
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
            )}
          </div>
          <div className="w-full max-w-full">
            <div ref={valueTableContainerRef} className="w-full max-w-full overflow-x-auto max-h-[494px] overflow-y-auto border-l-2 border-r-2 border-b-2 border-white">
              <table ref={valueTableRef} className={`min-w-[1000px] ${getFontSizeClass()} table-auto border-collapse`} style={{ borderSpacing: 0 }}>
                <thead className="bg-[#3a4252]">
                  {/* Date Header Row */}
                  <tr className="border-t-2 border-white">
                    {selectedDates.map((date, dateIndex) => (
                      <th 
                        key={date} 
                        className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} 
                        colSpan={17}
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                      Total
                    </th>
                  </tr>
                  {/* Column Header Row */}
                  <tr className="bg-[#3a4252]">
                    {selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        {/* Buyer Columns */}
                        <th className={`text-center py-[1px] px-[4.2px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} title={formatDisplayDate(date)}>BCode</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BLot</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BVal</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BAvg</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BFreq</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BOrdNum</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-16" title={formatDisplayDate(date)}>Lot/ON</th>
                        {/* Separator */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-4" title={formatDisplayDate(date)}>#</th>
                        {/* Seller Columns */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white w-4" title={formatDisplayDate(date)}>SCode</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SLot</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SVal</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SAvg</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SFreq</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SOrdNum</th>
                        <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/ON</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns */}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>BCode</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BLot</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BVal</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BAvg</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BFreq</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BOrdNum</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-16">Lot/ON</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252]">#</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SCode</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SLot</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SVal</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SAvg</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SFreq</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-8">Lot/F</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SOrdNum</th>
                    <th className="text-right py-[1px] px-[6px] font-bold text-white border-r-2 border-white w-16">Lot/ON</th>
                  </tr>
                </thead>
                <tbody>
                  {rowIndices.map((rowIdx: number) => {
                          return (
                      <tr key={rowIdx}>
                        {selectedDates.map((date: string, dateIndex: number) => {
                          // Get Buy data at this row index for this date
                          const buyDataForDate = buyStocksByDate.get(date) || [];
                          const buyRowData = buyDataForDate[rowIdx];
                          
                          // Get Sell data at this row index for this date
                          const sellDataForDate = sellStocksByDate.get(date) || [];
                          const sellRowData = sellDataForDate[rowIdx];
                        
                        return (
                          <React.Fragment key={date}>
                              {/* Buyer Columns - from buyStocksByDate */}
                              {buyRowData ? (
                                <>
                                  {(() => {
                                    const dayData = buyRowData.data;
                                    // Use BLot directly from CSV (column 1), not calculated from BuyerVol
                                    const buyerLot = dayData.BLot !== undefined ? dayData.BLot : ((dayData.BuyerVol || 0) / 100);
                                    // Use BVal (BuyerValue) from CSV column 2
                                    const buyerVal = dayData.BuyerValue || 0;
                                    // Use BAvg from CSV column 3, or calculate from BLot and BVal
                                    const buyerAvg = dayData.BuyerAvg || (buyerLot > 0 ? buyerVal / (buyerLot * 100) : 0);
                                    // Use BFreq from CSV column 4
                                    const buyerFreq = dayData.BFreq || 0;
                                    // Use BLotPerFreq directly from CSV column 5, not calculated
                                    const buyerLotPerFreq = dayData.BLotPerFreq !== undefined ? dayData.BLotPerFreq : (buyerFreq > 0 ? buyerLot / buyerFreq : 0);
                                    // Use BOrdNum from CSV column 6
                                    const buyerOrdNum = dayData.BOrdNum || 0;
                                    // Use BLotPerOrdNum directly from CSV column 7, not calculated
                                    const buyerLotPerOrdNum = dayData.BLotPerOrdNum !== undefined ? dayData.BLotPerOrdNum : (buyerOrdNum > 0 ? buyerLot / buyerOrdNum : 0);
                                    
                                    return (
                                      <>
                            <td className={`text-center py-[1px] px-[4.2px] font-bold text-green-600 w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>
                                          {dayData.BCode || buyRowData.stock}
                            </td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{formatLot(buyerLot)}</td>
                                        <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{formatValue(buyerVal)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{formatAverage(buyerAvg)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{buyerFreq}</td>
                                        <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-8">{formatAverage(buyerLotPerFreq)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{buyerOrdNum}</td>
                                        <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-16">{formatAverage(buyerLotPerOrdNum)}</td>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                // Show empty cells if no Buy data at this row index
                                <>
                                  <td className={`text-center py-[1px] px-[4.2px] text-gray-400 w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-8">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-16">-</td>
                                </>
                              )}
                            {/* Separator */}
                              <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-4">{rowIdx + 1}</td>
                              {/* Seller Columns - from sellStocksByDate */}
                              {sellRowData ? (
                                <>
                                  {(() => {
                                    const dayData = sellRowData.data;
                                    // Use SLot directly from CSV (column 9), not calculated from SellerVol
                                    const sellerLot = dayData.SLot !== undefined ? dayData.SLot : ((dayData.SellerVol || 0) / 100);
                                    // Use SVal (SellerValue) from CSV column 10
                                    const sellerVal = dayData.SellerValue || 0;
                                    // Use SAvg from CSV column 11, or calculate from SLot and SVal
                                    const sellerAvg = dayData.SellerAvg || (sellerLot > 0 ? sellerVal / (sellerLot * 100) : 0);
                                    // Use SFreq from CSV column 12
                                    const sellerFreq = dayData.SFreq || 0;
                                    // Use SLotPerFreq directly from CSV column 13, not calculated
                                    const sellerLotPerFreq = dayData.SLotPerFreq !== undefined ? dayData.SLotPerFreq : (sellerFreq > 0 ? sellerLot / sellerFreq : 0);
                                    // Use SOrdNum from CSV column 14
                                    const sellerOrdNum = dayData.SOrdNum || 0;
                                    // Use SLotPerOrdNum directly from CSV column 15, not calculated
                                    const sellerLotPerOrdNum = dayData.SLotPerOrdNum !== undefined ? dayData.SLotPerOrdNum : (sellerOrdNum > 0 ? sellerLot / sellerOrdNum : 0);
                                    
                                    // Debug: log SCode to verify it's correct
                                    if (rowIdx <= 2 && dateIndex === 0) {
                                      console.log(`[BrokerTransaction] Sell section - Row ${rowIdx}: SCode="${dayData.SCode}" (type: ${typeof dayData.SCode}), SLot=${sellerLot}, SVal=${sellerVal}`);
                                    }
                                    
                                    return (
                                      <>
                                        <td className="text-center py-[1px] px-[4.2px] font-bold text-red-600 w-4">{String(dayData.SCode || sellRowData.stock || '')}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{formatLot(sellerLot)}</td>
                                        <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{formatValue(sellerVal)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{formatAverage(sellerAvg)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{sellerFreq}</td>
                                        <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-8">{formatAverage(sellerLotPerFreq)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{sellerOrdNum}</td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                                          {formatAverage(sellerLotPerOrdNum)}
                            </td>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                // Show empty cells if no Sell data at this row index
                                <>
                                  <td className="text-center py-[1px] px-[4.2px] text-gray-400 w-4">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-8">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-6">-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>-</td>
                                </>
                              )}
                          </React.Fragment>
                        );
                      })}
                        {/* Total Column - aggregate Buy and Sell data separately by stock code */}
                      {(() => {
                          // Get Buy stock code at this row index (from first date that has data)
                          let totalBuyBCode = '-';
                          let buyStockCode = '';
                          for (const date of selectedDates) {
                            const buyDataForDate = buyStocksByDate.get(date) || [];
                            const buyRowData = buyDataForDate[rowIdx];
                            if (buyRowData) {
                              buyStockCode = buyRowData.stock; // This is BCode
                              totalBuyBCode = buyRowData.stock;
                              break;
                            }
                          }
                          
                          // Get Sell stock code at this row index (from first date that has data)
                          let totalSellSCode = '-';
                          let sellStockCode = '';
                          for (const date of selectedDates) {
                            const sellDataForDate = sellStocksByDate.get(date) || [];
                            const sellRowData = sellDataForDate[rowIdx];
                            if (sellRowData) {
                              sellStockCode = sellRowData.stock; // This is SCode
                              totalSellSCode = sellRowData.stock;
                              break;
                            }
                          }
                          
                          // Aggregate Buy data from all dates for this stock code (BCode)
                          let totalBuyVol = 0;
                          let totalBuyValue = 0;
                          let totalBuyAvg = 0;
                          let totalBuyAvgCount = 0;
                          let totalBuyFreq = 0;
                          let totalBuyOrdNum = 0;
                          
                          // Aggregate Sell data from all dates for this stock code (SCode)
                          let totalSellVol = 0;
                          let totalSellValue = 0;
                          let totalSellAvg = 0;
                          let totalSellAvgCount = 0;
                          let totalSellFreq = 0;
                          let totalSellOrdNum = 0;
                          
                          selectedDates.forEach(date => {
                            // Aggregate Buy section: sum all rows with same BCode (not just row index)
                            const buyDataForDate = buyStocksByDate.get(date) || [];
                            buyDataForDate.forEach(buyRow => {
                              if (buyRow.stock === buyStockCode && buyStockCode) {
                                const dayData = buyRow.data;
                                totalBuyVol += Number(dayData.BuyerVol) || 0;
                                totalBuyValue += Number(dayData.BuyerValue) || 0;
                                totalBuyFreq += Number(dayData.BFreq) || Number(dayData.TransactionCount) || 0;
                                totalBuyOrdNum += Number(dayData.BOrdNum) || 0;
                                if (dayData.BuyerAvg || (dayData.BuyerVol && dayData.BuyerVol > 0)) {
                                  totalBuyAvg += dayData.BuyerAvg || ((dayData.BuyerValue || 0) / (dayData.BuyerVol || 1));
                                  totalBuyAvgCount += 1;
                                }
                              }
                            });
                            
                            // Aggregate Sell section: sum all rows with same SCode (not just row index)
                            const sellDataForDate = sellStocksByDate.get(date) || [];
                            sellDataForDate.forEach(sellRow => {
                              if (sellRow.stock === sellStockCode && sellStockCode) {
                                const dayData = sellRow.data;
                                totalSellVol += Number(dayData.SellerVol) || 0;
                                totalSellValue += Number(dayData.SellerValue) || 0;
                                totalSellFreq += Number(dayData.SFreq) || Number(dayData.TransactionCount) || 0;
                                totalSellOrdNum += Number(dayData.SOrdNum) || 0;
                                if (dayData.SellerAvg || (dayData.SellerVol && dayData.SellerVol > 0)) {
                                  totalSellAvg += dayData.SellerAvg || ((dayData.SellerValue || 0) / (dayData.SellerVol || 1));
                                  totalSellAvgCount += 1;
                                }
                              }
                            });
                          });
                          
                          // Calculate final averages
                          const finalBuyAvg = totalBuyAvgCount > 0 ? totalBuyAvg / totalBuyAvgCount : (totalBuyVol > 0 ? totalBuyValue / totalBuyVol : 0);
                          const finalSellAvg = totalSellAvgCount > 0 ? totalSellAvg / totalSellAvgCount : (totalSellVol > 0 ? totalSellValue / totalSellVol : 0);
                          
                          const totalBuyLot = totalBuyVol / 100;
                          const totalSellLot = totalSellVol / 100;
                          const totalBuyLotPerFreq = totalBuyFreq > 0 ? totalBuyLot / totalBuyFreq : 0;
                          const totalSellLotPerFreq = totalSellFreq > 0 ? totalSellLot / totalSellFreq : 0;
                          const totalBuyLotPerOrdNum = totalBuyOrdNum > 0 ? totalBuyLot / totalBuyOrdNum : 0;
                          const totalSellLotPerOrdNum = totalSellOrdNum > 0 ? totalSellLot / totalSellOrdNum : 0;
                          
                          // Hide Total row if both Buy and Sell are empty
                          if (totalBuyBCode === '-' && totalSellSCode === '-') {
                          return (
                            <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                                -
                            </td>
                          );
                        }
                        
                          // Filter by search term
                          const searchTerm = debouncedTickerSearch.trim().toLowerCase();
                          const buyMatch = !searchTerm || totalBuyBCode.toLowerCase() === searchTerm;
                          const sellMatch = !searchTerm || totalSellSCode.toLowerCase() === searchTerm;
                          
                          if (searchTerm && !buyMatch && !sellMatch) {
                            return (
                              <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                                -
                              </td>
                            );
                          }
                        
                        return (
                          <React.Fragment>
                              {/* Buyer Total Columns */}
                              {buyMatch ? (
                                <>
                            <td className={`text-center py-[1px] px-[4.2px] font-bold text-green-600 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                                    {totalBuyBCode}
                            </td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{formatLot(totalBuyLot)}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{formatValue(totalBuyValue)}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{formatAverage(finalBuyAvg)}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{totalBuyFreq}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-8">{formatAverage(totalBuyLotPerFreq)}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{totalBuyOrdNum}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-16">{formatAverage(totalBuyLotPerOrdNum)}</td>
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-8">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-16">-</td>
                                </>
                              )}
                            {/* Separator */}
                              <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold">{rowIdx + 1}</td>
                              {/* Seller Total Columns */}
                              {sellMatch ? (
                                <>
                            <td className="text-center py-[1px] px-[4.2px] font-bold text-red-600">
                                    {totalSellSCode}
                            </td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{formatLot(totalSellLot)}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{formatValue(totalSellValue)}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{formatAverage(finalSellAvg)}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{totalSellFreq}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-8">{formatAverage(totalSellLotPerFreq)}</td>
                                  <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{totalSellOrdNum}</td>
                                  <td className="text-right py-[1px] px-[6px] font-bold text-red-600 border-r-2 border-white w-16">
                                    {formatAverage(totalSellLotPerOrdNum)}
                            </td>
                                </>
                              ) : (
                                <>
                                  <td className="text-center py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400 w-8">-</td>
                                  <td className="text-right py-[1px] px-[4.2px] text-gray-400">-</td>
                                  <td className="text-right py-[1px] px-[6px] text-gray-400 border-r-2 border-white w-16">-</td>
                                </>
                              )}
                          </React.Fragment>
                        );
                      })()}
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    };
    
    // NET Table - Shows Net Buy/Sell data
    const renderNetTable = () => {
      // For NET table: Get max row count across all dates for Net Buy and Net Sell sections separately
      let maxNetBuyRows = 0;
      let maxNetSellRows = 0;
      selectedDates.forEach(date => {
        const netBuyData = netBuyStocksByDate.get(date) || [];
        const netSellData = netSellStocksByDate.get(date) || [];
        maxNetBuyRows = Math.max(maxNetBuyRows, netBuyData.length);
        maxNetSellRows = Math.max(maxNetSellRows, netSellData.length);
      });
      const maxRows = Math.max(maxNetBuyRows, maxNetSellRows);
      
      // Get paginated rows for this table
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const rowIndices = Array.from({ length: Math.min(endIndex - startIndex, maxRows - startIndex) }, (_, i) => startIndex + i);
    
    return (
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">NET - {selectedBrokers.join(', ')} ({maxRows} total, showing {rowIndices.length})</h3>
            {totalPages > 1 && (
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
            )}
          </div>
          <div className="w-full max-w-full">
            <div ref={netTableContainerRef} className="w-full max-w-full overflow-x-auto max-h-[494px] overflow-y-auto border-l-2 border-r-2 border-b-2 border-white">
              <table ref={netTableRef} className={`min-w-[1000px] ${getFontSizeClass()} table-auto border-collapse`} style={{ borderSpacing: 0 }}>
                <thead className="bg-[#3a4252]">
                  {/* Date Header Row */}
                  <tr className="border-t-2 border-white">
                    {selectedDates.map((date, dateIndex) => (
                      <th 
                        key={date} 
                        className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} 
                        colSpan={17}
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                      Total
                    </th>
                  </tr>
                  {/* Column Header Row */}
                  <tr className="bg-[#3a4252]">
                    {selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        {/* Net Buy Columns (from CSV columns 17-23) */}
                        <th className={`text-center py-[1px] px-[4.2px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} title={formatDisplayDate(date)}>NBCode</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NBLot</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NBVal</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NBAvg</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NBFreq</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NBOrdNum</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-16" title={formatDisplayDate(date)}>Lot/ON</th>
                        {/* Separator */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-4" title={formatDisplayDate(date)}>#</th>
                        {/* Net Sell Columns (from CSV columns 24-30) */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white w-4" title={formatDisplayDate(date)}>NSCode</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NSLot</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NSVal</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NSAvg</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NSFreq</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-8" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>NSOrdNum</th>
                        <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/ON</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns - Net Buy/Net Sell */}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>NBCode</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NBLot</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NBVal</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NBAvg</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NBFreq</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-8">Lot/F</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NBOrdNum</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-16">Lot/ON</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252]">#</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">NSCode</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NSLot</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NSVal</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NSAvg</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NSFreq</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-8">Lot/F</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">NSOrdNum</th>
                    <th className="text-right py-[1px] px-[6px] font-bold text-white border-r-2 border-white w-16">Lot/ON</th>
                  </tr>
                </thead>
                <tbody>
                  {rowIndices.map((rowIdx: number) => {
                          return (
                      <tr key={rowIdx}>
                        {selectedDates.map((date: string, dateIndex: number) => {
                          // Get Net Buy data at this row index for this date
                          const netBuyDataForDate = netBuyStocksByDate.get(date) || [];
                          const netBuyRowData = netBuyDataForDate[rowIdx];
                          
                          // Get Net Sell data at this row index for this date
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
                                    const nbLot = dayData.NBLot || 0;
                                    const nbVal = dayData.NBVal || 0;
                                    const nbAvg = dayData.NBAvg !== undefined && dayData.NBAvg !== null ? dayData.NBAvg : (nbLot > 0 ? nbVal / (nbLot * 100) : 0);
                                    const nbFreq = dayData.NBFreq || 0;
                                    // Use value from CSV if available (including negative values), otherwise calculate
                                    const nbLotPerFreq = dayData.NBLotPerFreq !== undefined && dayData.NBLotPerFreq !== null ? dayData.NBLotPerFreq : (nbFreq > 0 ? nbLot / nbFreq : 0);
                                    const nbOrdNum = dayData.NBOrdNum || 0;
                                    // Use value from CSV if available (including negative values), otherwise calculate
                                    const nbLotPerOrdNum = dayData.NBLotPerOrdNum !== undefined && dayData.NBLotPerOrdNum !== null ? dayData.NBLotPerOrdNum : (nbOrdNum > 0 ? nbLot / nbOrdNum : 0);
                                    
                                    return (
                                      <>
                                        <td className={`text-center py-[1px] px-[4.2px] font-bold text-green-600 w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>
                                          {nbCode}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6`}>
                                          {formatLot(nbLot)}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6`}>
                                          {formatValue(nbVal)}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6`}>
                                          {formatAverage(nbAvg)}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6`}>
                                          {nbFreq}
                                        </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-green-600 w-8`}>
                                          {formatAverage(nbLotPerFreq)}
                                        </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6`}>
                                          {nbOrdNum}
                                        </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-green-600 w-16`}>
                                          {formatAverage(nbLotPerOrdNum)}
                                        </td>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                // Show empty cells if no Net Buy data at this row index
                                <>
                                  <td className={`text-center py-[1px] px-[4.2px] text-gray-400 w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-8`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-16`}>-</td>
                                </>
                              )}
                            {/* Separator */}
                              <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-4">{rowIdx + 1}</td>
                              {/* Net Sell Columns - from netSellStocksByDate */}
                              {netSellRowData ? (
                                <>
                                  {(() => {
                                    const dayData = netSellRowData.data;
                                    const nsCode = dayData.NSCode || netSellRowData.stock;
                                    const nsLot = dayData.NSLot || 0;
                                    const nsVal = dayData.NSVal || 0;
                                    const nsAvg = dayData.NSAvg !== undefined && dayData.NSAvg !== null ? dayData.NSAvg : (nsLot > 0 ? nsVal / (nsLot * 100) : 0);
                                    const nsFreq = dayData.NSFreq || 0;
                                    // Use value from CSV if available (including negative values), otherwise calculate
                                    const nsLotPerFreq = dayData.NSLotPerFreq !== undefined && dayData.NSLotPerFreq !== null ? dayData.NSLotPerFreq : (nsFreq > 0 ? nsLot / nsFreq : 0);
                                    const nsOrdNum = dayData.NSOrdNum || 0;
                                    // Use value from CSV if available (including negative values), otherwise calculate
                                    const nsLotPerOrdNum = dayData.NSLotPerOrdNum !== undefined && dayData.NSLotPerOrdNum !== null ? dayData.NSLotPerOrdNum : (nsOrdNum > 0 ? nsLot / nsOrdNum : 0);
                                    
                                    return (
                                      <>
                                        <td className={`text-center py-[1px] px-[4.2px] font-bold text-red-600 w-4`}>
                                          {nsCode}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6`}>
                                          {formatLot(nsLot)}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6`}>
                                          {formatValue(nsVal)}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6`}>
                                          {formatAverage(nsAvg)}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6`}>
                                          {nsFreq}
                            </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-8`}>
                                          {formatAverage(nsLotPerFreq)}
                                        </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6`}>
                                          {nsOrdNum}
                                        </td>
                                        <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                                          {formatAverage(nsLotPerOrdNum)}
                                        </td>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                // Show empty cells if no Net Sell data at this row index
                                <>
                                  <td className={`text-center py-[1px] px-[4.2px] text-gray-400 w-4`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-8`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-6`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-16 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>-</td>
                                </>
                              )}
                          </React.Fragment>
                        );
                      })}
                        {/* Total Column - aggregate Net Buy and Net Sell data separately by stock code */}
                      {(() => {
                          // Get Net Buy stock code at this row index (from first date that has data)
                          let totalNetBuyNBCode = '-';
                          let netBuyStockCode = '';
                          for (const date of selectedDates) {
                            const netBuyDataForDate = netBuyStocksByDate.get(date) || [];
                            const netBuyRowData = netBuyDataForDate[rowIdx];
                            if (netBuyRowData) {
                              netBuyStockCode = netBuyRowData.stock; // This is NBCode
                              totalNetBuyNBCode = netBuyRowData.stock;
                              break;
                            }
                          }
                          
                          // Get Net Sell stock code at this row index (from first date that has data)
                          let totalNetSellNSCode = '-';
                          let netSellStockCode = '';
                          for (const date of selectedDates) {
                            const netSellDataForDate = netSellStocksByDate.get(date) || [];
                            const netSellRowData = netSellDataForDate[rowIdx];
                            if (netSellRowData) {
                              netSellStockCode = netSellRowData.stock; // This is NSCode
                              totalNetSellNSCode = netSellRowData.stock;
                              break;
                            }
                          }
                          
                          // Aggregate Net Buy data from all dates for this stock code (NBCode)
                          let totalNetBuyVol = 0;
                          let totalNetBuyValue = 0;
                          let totalNetBuyAvg = 0;
                          let totalNetBuyAvgCount = 0;
                          let totalNetBuyFreq = 0;
                          let totalNetBuyOrdNum = 0;
                          
                          // Aggregate Net Sell data from all dates for this stock code (NSCode)
                          let totalNetSellVol = 0;
                          let totalNetSellValue = 0;
                          let totalNetSellAvg = 0;
                          let totalNetSellAvgCount = 0;
                          let totalNetSellFreq = 0;
                          let totalNetSellOrdNum = 0;
                          
                          // Track Lot/F and Lot/ON from CSV for aggregation
                          let totalNetBuyLotPerFreqSum = 0;
                          let totalNetBuyLotPerFreqCount = 0;
                          let totalNetBuyLotPerOrdNumSum = 0;
                          let totalNetBuyLotPerOrdNumCount = 0;
                          let totalNetSellLotPerFreqSum = 0;
                          let totalNetSellLotPerFreqCount = 0;
                          let totalNetSellLotPerOrdNumSum = 0;
                          let totalNetSellLotPerOrdNumCount = 0;
                          
                          selectedDates.forEach(date => {
                            // Aggregate Net Buy section: sum all rows with same NBCode (not just row index)
                            const netBuyDataForDate = netBuyStocksByDate.get(date) || [];
                            netBuyDataForDate.forEach(netBuyRow => {
                              if (netBuyRow.stock === netBuyStockCode && netBuyStockCode) {
                                const dayData = netBuyRow.data;
                                const nbLot = (dayData.NBLot || 0) * 100; // Convert lot to volume
                                totalNetBuyVol += nbLot;
                                totalNetBuyValue += Number(dayData.NBVal) || 0;
                                totalNetBuyFreq += Number(dayData.NBFreq) || 0;
                                totalNetBuyOrdNum += Number(dayData.NBOrdNum) || 0;
                                if (nbLot > 0) {
                                  totalNetBuyAvg += (dayData.NBVal || 0) / nbLot;
                                  totalNetBuyAvgCount += 1;
                                }
                                // Aggregate Lot/F and Lot/ON from CSV if available (including negative values)
                                if (dayData.NBLotPerFreq !== undefined && dayData.NBLotPerFreq !== null) {
                                  totalNetBuyLotPerFreqSum += dayData.NBLotPerFreq;
                                  totalNetBuyLotPerFreqCount += 1;
                                }
                                if (dayData.NBLotPerOrdNum !== undefined && dayData.NBLotPerOrdNum !== null) {
                                  totalNetBuyLotPerOrdNumSum += dayData.NBLotPerOrdNum;
                                  totalNetBuyLotPerOrdNumCount += 1;
                                }
                              }
                            });
                            
                            // Aggregate Net Sell section: sum all rows with same NSCode (not just row index)
                            const netSellDataForDate = netSellStocksByDate.get(date) || [];
                            netSellDataForDate.forEach(netSellRow => {
                              if (netSellRow.stock === netSellStockCode && netSellStockCode) {
                                const dayData = netSellRow.data;
                                const nsLot = (dayData.NSLot || 0) * 100; // Convert lot to volume
                                totalNetSellVol += nsLot;
                                totalNetSellValue += Number(dayData.NSVal) || 0;
                                totalNetSellFreq += Number(dayData.NSFreq) || 0;
                                totalNetSellOrdNum += Number(dayData.NSOrdNum) || 0;
                                if (nsLot > 0) {
                                  totalNetSellAvg += (dayData.NSVal || 0) / nsLot;
                                  totalNetSellAvgCount += 1;
                                }
                                // Aggregate Lot/F and Lot/ON from CSV if available (including negative values)
                                if (dayData.NSLotPerFreq !== undefined && dayData.NSLotPerFreq !== null) {
                                  totalNetSellLotPerFreqSum += dayData.NSLotPerFreq;
                                  totalNetSellLotPerFreqCount += 1;
                                }
                                if (dayData.NSLotPerOrdNum !== undefined && dayData.NSLotPerOrdNum !== null) {
                                  totalNetSellLotPerOrdNumSum += dayData.NSLotPerOrdNum;
                                  totalNetSellLotPerOrdNumCount += 1;
                                }
                              }
                            });
                          });
                          
                          // Calculate final averages
                          const finalNetBuyAvg = totalNetBuyAvgCount > 0 ? totalNetBuyAvg / totalNetBuyAvgCount : (totalNetBuyVol > 0 ? totalNetBuyValue / totalNetBuyVol : 0);
                          const finalNetSellAvg = totalNetSellAvgCount > 0 ? totalNetSellAvg / totalNetSellAvgCount : (totalNetSellVol > 0 ? totalNetSellValue / totalNetSellVol : 0);
                          
                          const totalNetBuyLot = totalNetBuyVol / 100;
                          const totalNetSellLot = totalNetSellVol / 100;
                          // Use average of CSV values if available (preserving negative values), otherwise calculate
                          const totalNetBuyLotPerFreq = totalNetBuyLotPerFreqCount > 0 
                            ? totalNetBuyLotPerFreqSum / totalNetBuyLotPerFreqCount 
                            : (totalNetBuyFreq > 0 ? totalNetBuyLot / totalNetBuyFreq : 0);
                          const totalNetSellLotPerFreq = totalNetSellLotPerFreqCount > 0 
                            ? totalNetSellLotPerFreqSum / totalNetSellLotPerFreqCount 
                            : (totalNetSellFreq > 0 ? totalNetSellLot / totalNetSellFreq : 0);
                          const totalNetBuyLotPerOrdNum = totalNetBuyLotPerOrdNumCount > 0 
                            ? totalNetBuyLotPerOrdNumSum / totalNetBuyLotPerOrdNumCount 
                            : (totalNetBuyOrdNum > 0 ? totalNetBuyLot / totalNetBuyOrdNum : 0);
                          const totalNetSellLotPerOrdNum = totalNetSellLotPerOrdNumCount > 0 
                            ? totalNetSellLotPerOrdNumSum / totalNetSellLotPerOrdNumCount 
                            : (totalNetSellOrdNum > 0 ? totalNetSellLot / totalNetSellOrdNum : 0);
                          
                          // Hide Total row if both Net Buy and Net Sell are empty, or if both NBLot and NSLot are 0
                          if ((totalNetBuyNBCode === '-' || Math.abs(totalNetBuyLot) === 0) && 
                              (totalNetSellNSCode === '-' || Math.abs(totalNetSellLot) === 0)) {
                          return (
                            <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                                -
                            </td>
                          );
                        }
                        
                          // Filter by search term
                          const searchTerm = debouncedTickerSearch.trim().toLowerCase();
                          const netBuyMatch = !searchTerm || totalNetBuyNBCode.toLowerCase() === searchTerm;
                          const netSellMatch = !searchTerm || totalNetSellNSCode.toLowerCase() === searchTerm;
                          
                          if (searchTerm && !netBuyMatch && !netSellMatch) {
                            return (
                              <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                                -
                              </td>
                            );
                          }
                          
                          // Net Buy side (always green as it's net buy)
                          const totalNetBuyColor = 'text-green-600';
                          // Net Sell side (always red as it's net sell)
                          const totalNetSellColor = 'text-red-600';
                        
                        return (
                          <React.Fragment>
                              {/* Net Buy Total Columns */}
                              {netBuyMatch ? (
                                <>
                            <td className={`text-center py-[1px] px-[4.2px] font-bold ${totalNetBuyColor} ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                                    {totalNetBuyNBCode}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                                    {formatLot(totalNetBuyLot)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                                    {formatValue(totalNetBuyValue)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                                    {formatAverage(finalNetBuyAvg)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                                    {totalNetBuyFreq}
                            </td>
                                  <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor} w-8`}>
                                    {formatAverage(totalNetBuyLotPerFreq)}
                                  </td>
                                  <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                                    {totalNetBuyOrdNum}
                                  </td>
                                  <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor} w-16`}>
                                    {formatAverage(totalNetBuyLotPerOrdNum)}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-8`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-16`}>-</td>
                                </>
                              )}
                            {/* Separator */}
                              <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold">{rowIdx + 1}</td>
                              {/* Net Sell Total Columns */}
                              {netSellMatch ? (
                                <>
                            <td className={`text-center py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                                    {totalNetSellNSCode}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                                    {formatLot(totalNetSellLot)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                                    {formatValue(totalNetSellValue)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                                    {formatAverage(finalNetSellAvg)}
                            </td>
                                  <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                                    {totalNetSellFreq}
                            </td>
                                  <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor} w-8`}>
                                    {formatAverage(totalNetSellLotPerFreq)}
                                  </td>
                                  <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                                    {totalNetSellOrdNum}
                                  </td>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor} border-r-2 border-white w-16`}>
                                    {formatAverage(totalNetSellLotPerOrdNum)}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={`text-center py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400 w-8`}>-</td>
                                  <td className={`text-right py-[1px] px-[4.2px] text-gray-400`}>-</td>
                                  <td className={`text-right py-[1px] px-[6px] text-gray-400 border-r-2 border-white w-12`}>-</td>
                                </>
                              )}
                          </React.Fragment>
                        );
                      })()}
                    </tr>
                  );
                })}
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
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-[#0a0f20] border-t border-[#3a4252]">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {(() => {
                  let maxRows = 0;
                  selectedDates.forEach(date => {
                    const buyData = buyStocksByDate.get(date) || [];
                    const sellData = sellStocksByDate.get(date) || [];
                    const netBuyData = netBuyStocksByDate.get(date) || [];
                    const netSellData = netSellStocksByDate.get(date) || [];
                    maxRows = Math.max(maxRows, buyData.length, sellData.length, netBuyData.length, netSellData.length);
                  });
                  const startRow = ((currentPage - 1) * itemsPerPage) + 1;
                  const endRow = Math.min(currentPage * itemsPerPage, maxRows);
                  return `Showing ${startRow} to ${endRow} of ${maxRows} rows`;
                })()}
              </span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1); // Reset to first page when changing page size
                }}
                className="px-2 py-1 text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={200}>200 per page</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-[#3a4252] rounded-md bg-input text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-[#3a4252] rounded-md bg-input text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }, [selectedBrokers, selectedDates, filteredStocks, uniqueStocks, sortedStocksByDate, sortedNetStocksByDate, totalDataByStock, totalNetDataByStock, sortedTotalStocks, sortedTotalNetStocks, transactionData, debouncedTickerSearch, currentPage, itemsPerPage, totalPages]);


  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-8">
          {/* Broker Selection - Multi-select with chips */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Broker:</label>
            <div className="flex flex-wrap items-center gap-2">
              {/* Selected Broker Chips */}
              {selectedBrokers.map(broker => (
                <div
                  key={broker}
                  className="flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary rounded-md text-sm"
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
              <div className="relative" ref={dropdownBrokerRef}>
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
                  className="w-24 px-3 py-2 text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
                    role="combobox"
                    aria-expanded={showBrokerSuggestions}
                    aria-controls="broker-suggestions"
                    aria-autocomplete="list"
                  />
                  {showBrokerSuggestions && (
                  <div id="broker-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {availableBrokers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground flex items-center">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading brokers...
                        </div>
                    ) : brokerInput === '' ? (
                      <>
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                          Available Brokers ({availableBrokers.filter(b => !selectedBrokers.includes(b)).length})
                        </div>
                        {availableBrokers.filter(b => !selectedBrokers.includes(b)).map(broker => (
                          <div
                            key={broker}
                            onClick={() => handleBrokerSelect(broker)}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
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
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                            {filteredBrokers.length} broker(s) found
                          </div>
                          {filteredBrokers.length > 0 ? (
                            filteredBrokers.map((broker, idx) => (
                              <div
                                key={broker}
                                onClick={() => handleBrokerSelect(broker)}
                                className={`px-3 py-2 hover:bg-muted cursor-pointer text-sm ${idx === highlightedIndex ? 'bg-accent' : ''}`}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                              >
                                {broker}
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
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

              {/* Ticker Multi-Select */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
            <div className="flex flex-wrap gap-1">
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
            </div>
            <div className="relative" ref={dropdownTickerRef}>
              <input
                type="text"
                placeholder="Type ticker..."
                value={tickerInput}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setTickerInput(v);
                  setShowTickerSuggestions(true);
                  setHighlightedTickerIndex(0);
                }}
                onFocus={() => setShowTickerSuggestions(true)}
                onKeyDown={(e) => {
                  // Get unique tickers from all sections (BCode, SCode, NBCode, NSCode)
                  const allTickers = new Set<string>();
                  selectedDates.forEach(date => {
                    const dateData = transactionData.get(date) || [];
                    dateData.forEach(item => {
                      if (item.BCode) allTickers.add(item.BCode);
                      if (item.SCode) allTickers.add(item.SCode);
                      if (item.NBCode) allTickers.add(item.NBCode);
                      if (item.NSCode) allTickers.add(item.NSCode);
                    });
                  });
                  const availableTickers = Array.from(allTickers).filter(t => !selectedTickers.includes(t));
                  const filteredTickers = tickerInput === '' 
                    ? availableTickers
                    : availableTickers.filter(t => 
                        t.toLowerCase().includes(tickerInput.toLowerCase())
                      );
                  const suggestions = filteredTickers.slice(0, 10);
                  
                  if (e.key === 'ArrowDown' && suggestions.length) {
                    e.preventDefault();
                    setHighlightedTickerIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
                  } else if (e.key === 'ArrowUp' && highlightedTickerIndex > 0) {
                    e.preventDefault();
                    setHighlightedTickerIndex(prev => prev - 1);
                  } else if (e.key === 'Enter' && highlightedTickerIndex >= 0 && highlightedTickerIndex < suggestions.length) {
                    e.preventDefault();
                    const choice = suggestions[highlightedTickerIndex];
                    if (choice) handleTickerSelect(choice);
                  } else if (e.key === 'Escape') {
                    setShowTickerSuggestions(false);
                    setHighlightedTickerIndex(-1);
                  }
                }}
                className="w-32 h-9 px-3 py-1 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {showTickerSuggestions && isDataReady && (
                <div id="ticker-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                  {(() => {
                    // Get unique tickers from all sections (BCode, SCode, NBCode, NSCode)
                    const allTickers = new Set<string>();
                    selectedDates.forEach(date => {
                      const dateData = transactionData.get(date) || [];
                      dateData.forEach(item => {
                        if (item.BCode) allTickers.add(item.BCode);
                        if (item.SCode) allTickers.add(item.SCode);
                        if (item.NBCode) allTickers.add(item.NBCode);
                        if (item.NSCode) allTickers.add(item.NSCode);
                      });
                    });
                    const availableTickers = Array.from(allTickers).filter(t => !selectedTickers.includes(t));
                    
                    if (availableTickers.length === 0) {
                      return (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No tickers available
                        </div>
                      );
                    }
                    
                    if (tickerInput === '') {
                      return (
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                            Available Tickers ({availableTickers.length})
                          </div>
                          {availableTickers.slice(0, 20).map(ticker => (
                            <div
                              key={ticker}
                              onClick={() => handleTickerSelect(ticker)}
                              className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                            >
                              {ticker}
                            </div>
                          ))}
                        </>
                      );
                    } else {
                      const filteredTickers = availableTickers.filter(t => 
                        t.toLowerCase().includes(tickerInput.toLowerCase())
                      );
                      return (
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                            {filteredTickers.length} ticker(s) found
                          </div>
                          {filteredTickers.length > 0 ? (
                            filteredTickers.slice(0, 20).map((ticker, idx) => (
                              <div
                                key={ticker}
                                onClick={() => handleTickerSelect(ticker)}
                                className={`px-3 py-2 hover:bg-muted cursor-pointer text-sm ${idx === highlightedTickerIndex ? 'bg-accent' : ''}`}
                                onMouseEnter={() => setHighlightedTickerIndex(idx)}
                              >
                                {ticker}
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              No tickers found
                            </div>
                          )}
                        </>
                      );
                    }
                  })()}
                </div>
              )}
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
                  const selectedDate = new Date(e.target.value);
                  const dayOfWeek = selectedDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    alert('Tidak bisa memilih hari Sabtu atau Minggu');
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
              <div className="flex items-center justify-between h-full px-3 py-2">
                <span className="text-sm text-foreground">
                  {startDate ? new Date(startDate).toLocaleDateString('en-GB', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                  }) : ''}
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
                  const selectedDate = new Date(e.target.value);
                  const dayOfWeek = selectedDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    alert('Tidak bisa memilih hari Sabtu atau Minggu');
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
              <div className="flex items-center justify-between h-full px-3 py-2">
                <span className="text-sm text-foreground">
                  {endDate ? new Date(endDate).toLocaleDateString('en-GB', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                  }) : ''}
                </span>
                <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>

          {/* Show Button */}
          <button
            onClick={() => {
              console.log('[BrokerTransaction] Show button clicked:', {
                selectedBrokers,
                selectedDates,
                marketFilter
              });
              // Clear existing data before fetching new data
              setTransactionData(new Map());
              setIsDataReady(false);
              setShouldFetchData(true);
            }}
            disabled={isLoading || selectedBrokers.length === 0 || selectedDates.length === 0}
            className="px-4 py-1.5 h-9 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap"
          >
            Show
          </button>

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

          {/* Ticker Search */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Search:</label>
            <input
              type="text"
              value={tickerSearch}
              onChange={(e) => setTickerSearch(e.target.value)}
              placeholder="Ticker..."
              className="w-24 px-3 py-2 text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
            />
          </div>
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
