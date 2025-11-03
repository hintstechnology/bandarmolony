import React, { useState, useEffect, useRef } from 'react';
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
}


// Fetch broker transaction data from API
const fetchBrokerTransactionData = async (brokerCode: string, date: string): Promise<BrokerTransactionData[]> => {
  try {
    const response = await api.getBrokerTransactionData(brokerCode, date);
    if (response.success && response.data?.transactionData) {
      return response.data.transactionData;
    }
    return [];
  } catch (error) {
    console.error('Error fetching broker transaction data:', error);
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
  
  if (absValue >= 1000000000) {
    // Use B (billion) with 3 decimal places
    // Example: 144,000,000,000 → 144.000B
    const billions = rounded / 1000000000;
    const billionsStr = billions.toFixed(3);
    // Split integer and decimal parts
    const parts = billionsStr.split('.');
    const integerPart = parts[0] || '0';
    const decimalPart = parts[1] || '000';
    // Format integer part with thousand separator (dot for thousand, comma for decimal in id-ID)
    const integerFormatted = parseInt(integerPart).toLocaleString('id-ID', { useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return `${integerFormatted},${decimalPart}B`;
  } else if (absValue >= 1000000) {
    // Use M (million) with 3 decimal places
    // Example: 141,431,000 → 141.431M
    const millions = rounded / 1000000;
    const millionsStr = millions.toFixed(3);
    // Split integer and decimal parts
    const parts = millionsStr.split('.');
    const integerPart = parts[0] || '0';
    const decimalPart = parts[1] || '000';
    // Format integer part with thousand separator
    const integerFormatted = parseInt(integerPart).toLocaleString('id-ID', { useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return `${integerFormatted},${decimalPart}M`;
  } else if (absValue >= 1000) {
    // Use K (thousand) with no decimals
    const thousands = rounded / 1000;
    return `${thousands.toLocaleString('en-US', { maximumFractionDigits: 0 })}K`;
  }
  return rounded.toLocaleString('en-US');
};

const formatAverage = (value: number): string => {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
};

// Filter and sort functions
const getFilteredAndSortedStocks = (
  uniqueStocks: string[], 
  transactionData: Map<string, BrokerTransactionData[]>, 
  selectedDates: string[], 
  tickerSearch: string, 
  filter: string
) => {
  // Filter by ticker search
  let filteredStocks = uniqueStocks;
  if (tickerSearch.trim()) {
    filteredStocks = uniqueStocks.filter(stock => 
      stock.toLowerCase().includes(tickerSearch.toLowerCase())
    );
  }
  
  // Sort by filter
  if (filter !== 'all') {
    filteredStocks.sort((a, b) => {
      let aValue = 0;
      let bValue = 0;
      
      // Get the first date with data for comparison
      for (const date of selectedDates) {
        const dateData = transactionData.get(date) || [];
        const aData = dateData.find(d => d.Emiten === a);
        const bData = dateData.find(d => d.Emiten === b);
        
        if (aData && bData) {
          switch (filter) {
            case 'buyVol-highest':
            case 'buyVol-lowest':
              aValue = aData.BuyerVol || 0;
              bValue = bData.BuyerVol || 0;
              break;
            case 'buyVal-highest':
            case 'buyVal-lowest':
              aValue = aData.BuyerValue || 0;
              bValue = bData.BuyerValue || 0;
              break;
            case 'sellVol-highest':
            case 'sellVol-lowest':
              aValue = aData.SellerVol || 0;
              bValue = bData.SellerVol || 0;
              break;
            case 'sellVal-highest':
            case 'sellVal-lowest':
              aValue = aData.SellerValue || 0;
              bValue = bData.SellerValue || 0;
              break;
            case 'netBuyVol-highest':
            case 'netBuyVol-lowest':
              aValue = aData.NetBuyVol || 0;
              bValue = bData.NetBuyVol || 0;
              break;
            case 'netBuyVal-highest':
            case 'netBuyVal-lowest':
              aValue = aData.NetBuyValue || 0;
              bValue = bData.NetBuyValue || 0;
              break;
            case 'totalVol-highest':
            case 'totalVol-lowest':
              aValue = aData.TotalVolume || 0;
              bValue = bData.TotalVolume || 0;
              break;
            case 'totalVal-highest':
            case 'totalVal-lowest':
              aValue = aData.TotalValue || 0;
              bValue = bData.TotalValue || 0;
              break;
          }
          break;
        }
      }
      
      // Determine sort direction based on filter
      if (filter.includes('-lowest')) {
        return aValue - bValue; // Lowest to highest
      } else {
        return bValue - aValue; // Highest to lowest
      }
    });
  }
  
  return filteredStocks;
};

// Get trading days based on count (start from yesterday, skip today)
// Returns dates sorted from oldest to newest (for display left to right)
const getTradingDays = (count: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  let daysBack = 1; // Start from yesterday, skip today
  
  while (dates.length < count) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const dayOfWeek = date.getDay();
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateStr = date.toISOString().split('T')[0];
      if (dateStr) {
        dates.push(dateStr);
      }
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
        // Sort from newest to oldest, then take first count, then reverse for display (oldest first)
        const availableDates = response.data.dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
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
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(['CC']);
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const dropdownBrokerRef = useRef<HTMLDivElement>(null);
  
  // API data states
  const [transactionData, setTransactionData] = useState<Map<string, BrokerTransactionData[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableBrokers, setAvailableBrokers] = useState<string[]>([]);
  
  // Search states
  const [tickerSearch, setTickerSearch] = useState<string>('');

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
        
        // Load initial dates based on available data
        const initialDates = await getAvailableTradingDays(3);
        // Sort by date (oldest first) for display
        const sortedDates = [...initialDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        setSelectedDates(sortedDates);
        
        // Set initial date range
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
        
      } catch (error) {
        console.error('Error loading initial data:', error);
        
        // Fallback to hardcoded broker list and local date calculation
        const brokers = ['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA'];
        setAvailableBrokers(brokers);
        
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

  // Load transaction data when selected brokers or dates change
  useEffect(() => {
    const loadTransactionData = async () => {
      if (selectedBrokers.length === 0 || selectedDates.length === 0) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const newTransactionData = new Map<string, BrokerTransactionData[]>();
        
        // Load data for ALL selected dates and ALL selected brokers
        for (const date of selectedDates) {
          // Aggregate data from all selected brokers per emiten
          const aggregatedByEmiten = new Map<string, BrokerTransactionData>();
          
          for (const broker of selectedBrokers) {
            try {
              const data = await fetchBrokerTransactionData(broker, date);
              
              // Aggregate data per emiten
              for (const row of data) {
                const emiten = row.Emiten;
                const existing = aggregatedByEmiten.get(emiten);
                
                if (existing) {
                  // Sum all values
                  existing.BuyerVol += row.BuyerVol || 0;
                  existing.BuyerValue += row.BuyerValue || 0;
                  existing.SellerVol += row.SellerVol || 0;
                  existing.SellerValue += row.SellerValue || 0;
                  existing.NetBuyVol += row.NetBuyVol || 0;
                  existing.NetBuyValue += row.NetBuyValue || 0;
                  existing.TotalVolume += row.TotalVolume || 0;
                  existing.TotalValue += row.TotalValue || 0;
                  existing.TransactionCount += row.TransactionCount || 0;
                  
                  // Recalculate averages
                  existing.BuyerAvg = existing.BuyerVol > 0 ? existing.BuyerValue / existing.BuyerVol : 0;
                  existing.SellerAvg = existing.SellerVol > 0 ? existing.SellerValue / existing.SellerVol : 0;
                  existing.AvgPrice = existing.TotalVolume > 0 ? existing.TotalValue / existing.TotalVolume : 0;
            } else {
                  // First occurrence of this emiten
                  aggregatedByEmiten.set(emiten, { ...row });
                }
            }
          } catch (err) {
              console.log(`No data available for ${broker} on ${date}`);
          }
          }
          
          // Convert map to array
          const aggregatedData = Array.from(aggregatedByEmiten.values());
          newTransactionData.set(date, aggregatedData);
        }
        
        setTransactionData(newTransactionData);
        
      } catch (err) {
        setError('Failed to load transaction data');
        console.error('Error loading transaction data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadTransactionData();
  }, [selectedBrokers, selectedDates]);

  // Update date range when startDate or endDate changes
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Reset time to avoid timezone issues
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      // Check if range is valid
      if (start > end) {
        console.warn('Tanggal mulai harus sebelum tanggal akhir');
        return;
      }
      
      // Generate date array (only trading days)
      const dateArray: string[] = [];
      const currentDate = new Date(start);
      currentDate.setHours(0, 0, 0, 0);
      const endDateObj = new Date(end);
      endDateObj.setHours(0, 0, 0, 0);
      
      while (currentDate <= endDateObj) {
        const dayOfWeek = currentDate.getDay();
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const dateString = currentDate.toISOString().split('T')[0];
          if (dateString) {
            dateArray.push(dateString);
          }
        }
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);
        currentDate.setTime(nextDate.getTime());
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

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownBrokerRef.current && !dropdownBrokerRef.current.contains(event.target as Node)) {
        setShowBrokerSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  const renderHorizontalView = () => {
    if (selectedBrokers.length === 0 || selectedDates.length === 0) return null;
    
    // Get all unique stocks from all dates
    const allStocks = new Set<string>();
    selectedDates.forEach(date => {
      const data = transactionData.get(date) || [];
      data.forEach(item => allStocks.add(item.Emiten));
    });
    
    const uniqueStocks = Array.from(allStocks);
    
    if (uniqueStocks.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="text-gray-400 text-sm">
            No data available for {selectedBrokers.join(', ')} on selected dates
          </div>
        </div>
      );
    }
    
    // Get filtered and sorted stocks (no sorting, just filter by ticker search)
    const filteredBuyStocks = getFilteredAndSortedStocks(uniqueStocks, transactionData, selectedDates, tickerSearch, 'all');
    const filteredSellStocks = getFilteredAndSortedStocks(uniqueStocks, transactionData, selectedDates, tickerSearch, 'all');
    
    return (
      <div className="w-full">
        {/* Buy Side Horizontal Table */}
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">BUY SIDE - {selectedBrokers.join(', ')} ({filteredBuyStocks.length} stocks)</h3>
          </div>
          <div className="w-full max-w-full">
            <div className="w-full max-w-full overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className={`min-w-[900px] ${getFontSizeClass()} border-collapse table-auto`}>
                <thead className="bg-[#3a4252]">
                  <tr className="border-b border-[#3a4252]">
                    <th className="text-left py-0 px-2 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252] sticky left-0 z-20 bg-[#3a4252]">Ticker</th>
                      {selectedDates.map((date) => (
                      <th key={date} colSpan={6} className="text-center py-0 px-2 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252] whitespace-nowrap">
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                    </tr>
                  <tr className="border-b border-[#3a4252] bg-[#3a4252]">
                    <th className="text-left py-0 px-1 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252] sticky left-0 z-20 bg-[#3a4252]"></th>
                      {selectedDates.map((date) => (
                        <React.Fragment key={date}>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252]">BLot</th>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252]">BVal</th>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252]">BAvg</th>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252]">SLot</th>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252]">SVal</th>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252]">SAvg</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBuyStocks.map((stock, idx) => (
                    <tr key={idx} className="border-b border-[#3a4252]/50 hover:bg-accent/50">
                      <td className="py-0 px-2 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252] sticky left-0 z-20 bg-background">{stock}</td>
                        {selectedDates.map((date) => {
                          const dateData = transactionData.get(date) || [];
                          const dayData = dateData.find(d => d.Emiten === stock);
                          const hasDataForDate = dayData !== undefined;
                        
                        const buyerLot = (dayData?.BuyerVol || 0) / 100;
                        const buyerAvg = (dayData?.BuyerVol || 0) > 0 ? (dayData?.BuyerValue || 0) / (dayData?.BuyerVol || 0) : 0;
                        const sellerLot = (dayData?.SellerVol || 0) / 100;
                        const sellerAvg = (dayData?.SellerVol || 0) > 0 ? (dayData?.SellerValue || 0) / (dayData?.SellerVol || 0) : 0;
                          
                          return (
                            <React.Fragment key={date}>
                              {hasDataForDate && dayData ? (
                                <>
                                <td className="text-right py-0 px-1 text-green-600 border border-[#3a4252]">{formatLot(buyerLot)}</td>
                                <td className="text-right py-0 px-1 text-green-600 border border-[#3a4252]">{formatValue(dayData.BuyerValue || 0)}</td>
                                <td className="text-right py-0 px-1 text-green-600 border border-[#3a4252]">{formatAverage(buyerAvg)}</td>
                                <td className="text-right py-0 px-1 text-red-600 border border-[#3a4252]">{formatLot(sellerLot)}</td>
                                <td className="text-right py-0 px-1 text-red-600 border border-[#3a4252]">{formatValue(dayData.SellerValue || 0)}</td>
                                <td className="text-right py-0 px-1 text-red-600 border border-[#3a4252] border-r-8 border-r-[#3a4252]">{formatAverage(sellerAvg)}</td>
                                </>
                            ) : (
                              <>
                                <td className="text-center py-0 px-1 text-gray-400 border border-[#3a4252] border-r-8 border-r-[#3a4252]" colSpan={6}>
                                  No Data
                                </td>
                              </>
                            )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        </div>

        {/* Sell Side Horizontal Table */}
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">SELL SIDE - {selectedBrokers.join(', ')} ({filteredSellStocks.length} stocks)</h3>
          </div>
          <div className="w-full max-w-full">
            <div className="w-full max-w-full overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className={`min-w-[900px] ${getFontSizeClass()} border-collapse table-auto`}>
                <thead className="bg-[#3a4252]">
                  <tr className="border-b border-[#3a4252]">
                    <th className="text-left py-0 px-2 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252] sticky left-0 z-20 bg-[#3a4252]">Ticker</th>
                      {selectedDates.map((date) => (
                      <th key={date} colSpan={4} className="text-center py-0 px-2 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252] whitespace-nowrap">
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                    </tr>
                  <tr className="border-b border-[#3a4252] bg-[#3a4252]">
                    <th className="text-left py-0 px-1 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252] sticky left-0 z-20 bg-[#3a4252]"></th>
                      {selectedDates.map((date) => (
                        <React.Fragment key={date}>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252]">NBLot</th>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252]">NBVal</th>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252]">TLot</th>
                        <th className="text-right py-0 px-1 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252]">TVal</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSellStocks.map((stock, idx) => (
                    <tr key={idx} className="border-b border-[#3a4252]/50 hover:bg-accent/50">
                      <td className="py-0 px-2 font-medium text-white border border-[#3a4252] border-r-8 border-r-[#3a4252] sticky left-0 z-20 bg-background">{stock}</td>
                        {selectedDates.map((date) => {
                          const dateData = transactionData.get(date) || [];
                          const dayData = dateData.find(d => d.Emiten === stock);
                          const hasDataForDate = dayData !== undefined;
                        
                        const netBuyVol = dayData?.NetBuyVol || 0;
                        const netBuyValue = dayData?.NetBuyValue || 0;
                        const totalLot = (dayData?.TotalVolume || 0) / 100;
                        
                        // Color: green if positive, red if negative
                        const netBuyVolColor = netBuyVol >= 0 ? 'text-green-600' : 'text-red-600';
                        const netBuyValColor = netBuyValue >= 0 ? 'text-green-600' : 'text-red-600';
                          
                          return (
                            <React.Fragment key={date}>
                              {hasDataForDate && dayData ? (
                                <>
                                <td className={`text-right py-0 px-1 ${netBuyVolColor} border border-[#3a4252]`}>{formatLot(Math.abs(netBuyVol) / 100)}</td>
                                <td className={`text-right py-0 px-1 ${netBuyValColor} border border-[#3a4252]`}>{formatValue(Math.abs(netBuyValue))}</td>
                                <td className="text-right py-0 px-1 border border-[#3a4252]">{formatLot(totalLot)}</td>
                                <td className="text-right py-0 px-1 border border-[#3a4252] border-r-8 border-r-[#3a4252]">{formatValue(dayData.TotalValue || 0)}</td>
                                </>
                            ) : (
                              <>
                                <td className="text-center py-0 px-1 text-gray-400 border border-[#3a4252] border-r-8 border-r-[#3a4252]" colSpan={4}>
                                  No Data
                                </td>
                              </>
                            )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
      </div>
      </div>
    );
  };

    
    return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      <div className="bg-background border-b border-[#3a4252] px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-4">
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
      {!isLoading && !error && renderHorizontalView()}
    </div>
  );
}
