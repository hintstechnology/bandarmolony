import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, Plus, X, RotateCcw, Loader2 } from 'lucide-react';
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

const formatNumber = (num: number): string => {
  // Ensure num is a valid number
  if (isNaN(num) || !isFinite(num)) {
    return '0';
  }
  
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(num >= 10 ? 0 : num >= 1 ? 1 : 2);
};

const formatValue = (value: any): string => {
  // Handle null, undefined, or non-numeric values
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '0';
  }
  return formatNumber(Number(value));
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

// Get trading days based on count
const getTradingDays = (count: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  let currentDate = new Date(today);
  
  while (dates.length < count) {
    const dayOfWeek = currentDate.getDay();
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (dateStr) {
        dates.push(dateStr);
      }
    }
    
    // Go to previous day
    currentDate.setDate(currentDate.getDate() - 1);
    
    // Safety check
    if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
      const todayStr = today.toISOString().split('T')[0];
      if (todayStr) {
        dates.push(todayStr);
      }
      break;
    }
  }
  
  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};

// Helper function to get last 3 days including today (sorted newest first)
const getLastThreeDays = (): string[] => {
  return getTradingDays(3);
};

export function BrokerTransaction() {
  const { showToast } = useToast();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  
  // Get available dates from backend and return recent trading days
  const getAvailableTradingDays = async (count: number): Promise<string[]> => {
    try {
      // Get available dates from backend
      const response = await api.getBrokerTransactionDates();
      if (response.success && response.data?.dates) {
        const availableDates = response.data.dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        return availableDates.slice(0, count);
      }
    } catch (error) {
      console.error('Error fetching available dates:', error);
    }
    
    // Fallback to local calculation if backend fails
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
  const [brokerInput, setBrokerInput] = useState('CC');
  const [selectedBroker, setSelectedBroker] = useState<string>('CC');
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal');
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');
  
  // API data states
  const [transactionData, setTransactionData] = useState<Map<string, BrokerTransactionData[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableBrokers, setAvailableBrokers] = useState<string[]>([]);
  
  // Search and filter states
  const [tickerSearch, setTickerSearch] = useState<string>('');
  const [buySideFilter, setBuySideFilter] = useState<string>('all');
  const [sellSideFilter, setSellSideFilter] = useState<string>('all');

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
        setSelectedDates(initialDates);
        
        // Set initial date range
        if (initialDates.length > 0) {
          const sortedDates = [...initialDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
        
      } catch (error) {
        console.error('Error loading initial data:', error);
        
        // Fallback to hardcoded broker list and local date calculation
        const brokers = ['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA'];
        setAvailableBrokers(brokers);
        
        const fallbackDates = getTradingDays(3);
        setSelectedDates(fallbackDates);
        
        if (fallbackDates.length > 0) {
          const sortedDates = [...fallbackDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
      }
    };

    loadInitialData();
  }, [showToast]);

  // Load transaction data when selected broker or dates change
  useEffect(() => {
    const loadTransactionData = async () => {
      if (!selectedBroker || selectedDates.length === 0) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const newTransactionData = new Map<string, BrokerTransactionData[]>();
        let hasAnyData = false;
        let missingDates: string[] = [];
        
        // Load data for ALL selected dates
        for (const date of selectedDates) {
          try {
          const data = await fetchBrokerTransactionData(selectedBroker, date);
            if (data.length > 0) {
          newTransactionData.set(date, data);
              hasAnyData = true;
            } else {
              // Set empty array for dates with no data
              newTransactionData.set(date, []);
              missingDates.push(date);
            }
          } catch (err) {
            // Set empty array for dates with errors
            newTransactionData.set(date, []);
            missingDates.push(date);
            console.log(`No data available for ${selectedBroker} on ${date}`);
          }
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
  }, [selectedBroker, selectedDates, showToast]);

  const addDateRange = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if range is valid
      if (start > end) {
        console.warn('Tanggal mulai harus sebelum tanggal akhir');
        return;
      }
      
      // Generate date array
      const dateArray: string[] = [];
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        const dateString = currentDate.toISOString().split('T')[0];
        if (dateString) {
          dateArray.push(dateString);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Remove duplicates, sort by date (newest first), and check total limit
      const uniqueDates = Array.from(new Set([...selectedDates, ...dateArray]));
      const sortedDates = uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      
      // Check if total dates would exceed 7
      if (sortedDates.length > 7) {
        console.warn('Maksimal 7 tanggal yang bisa dipilih');
        return;
      }
      
      setSelectedDates(sortedDates);
      // Switch to custom mode when user manually selects dates
      setDateRangeMode('custom');
      // Don't clear the date inputs - keep them for user reference
      
      showToast({
        type: 'success',
        title: 'Date Range Added',
        message: `Berhasil menambahkan ${dateArray.length} tanggal.`
      });
    }
  };

  const removeDate = (dateToRemove: string) => {
    if (selectedDates.length > 1) {
      setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
      // Switch to custom mode when user manually removes dates
      setDateRangeMode('custom');
    }
  };

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };

  // Handle date range mode change
  const handleDateRangeModeChange = async (mode: '1day' | '3days' | '1week' | 'custom') => {
    setDateRangeMode(mode);
    
    if (mode === 'custom') {
      // Don't change dates, just switch to custom mode
      return;
    }
    
    // Apply preset dates based on mode using available data
    let newDates: string[] = [];
    try {
    switch (mode) {
      case '1day':
          newDates = await getAvailableTradingDays(1);
        break;
      case '3days':
          newDates = await getAvailableTradingDays(3);
        break;
      case '1week':
          newDates = await getAvailableTradingDays(5);
        break;
    }
    
    setSelectedDates(newDates);
    
    // Set date range to show the selected dates
    if (newDates.length > 0) {
      const sortedDates = [...newDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setStartDate(sortedDates[0]);
      setEndDate(sortedDates[sortedDates.length - 1]);
      }
      
    } catch (error) {
      console.error('Error updating date range:', error);
      
      // Fallback to local calculation
      switch (mode) {
        case '1day':
          newDates = getTradingDays(1);
          break;
        case '3days':
          newDates = getTradingDays(3);
          break;
        case '1week':
          newDates = getTradingDays(5);
          break;
      }
      setSelectedDates(newDates);
    }
  };

  // Clear all dates and reset to 1 day
  const clearAllDates = async () => {
    try {
      const oneDay = await getAvailableTradingDays(1);
      setSelectedDates(oneDay);
    setDateRangeMode('1day');
      if (oneDay.length > 0) {
        setStartDate(oneDay[0] || '');
        setEndDate(oneDay[0] || '');
      }
      
    } catch (error) {
      console.error('Error clearing dates:', error);
      // Fallback to local calculation
    const oneDay = getTradingDays(1);
      setSelectedDates(oneDay);
      setDateRangeMode('1day');
    if (oneDay.length > 0) {
      setStartDate(oneDay[0] || '');
      setEndDate(oneDay[0] || '');
      }
      
    }
  };

  const renderHorizontalView = () => {
    if (!selectedBroker || selectedDates.length === 0) return null;
    
    // Get all unique stocks from all dates
    const allStocks = new Set<string>();
    selectedDates.forEach(date => {
      const data = transactionData.get(date) || [];
      data.forEach(item => allStocks.add(item.Emiten));
    });
    
    const uniqueStocks = Array.from(allStocks);
    
    if (uniqueStocks.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No data available for {selectedBroker} on selected dates
        </div>
      );
    }
    
    // Get filtered and sorted stocks
    const filteredBuyStocks = getFilteredAndSortedStocks(uniqueStocks, transactionData, selectedDates, tickerSearch, buySideFilter);
    const filteredSellStocks = getFilteredAndSortedStocks(uniqueStocks, transactionData, selectedDates, tickerSearch, sellSideFilter);
    
    return (
      <div className="space-y-6">
        {/* Search and Filter Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search & Filter Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Ticker Search */}
              <div>
                <label className="block text-sm font-medium mb-2">Search Ticker:</label>
                <input
                  type="text"
                  value={tickerSearch}
                  onChange={(e) => setTickerSearch(e.target.value)}
                  placeholder="Enter ticker code..."
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                />
              </div>
              
              {/* Buy Side Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Buy Side Sort:</label>
                <select
                  value={buySideFilter}
                  onChange={(e) => setBuySideFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                >
                  <option value="all">All</option>
                  <option value="buyVol-highest">BuyVol (Highest)</option>
                  <option value="buyVol-lowest">BuyVol (Lowest)</option>
                  <option value="buyVal-highest">BuyVal (Highest)</option>
                  <option value="buyVal-lowest">BuyVal (Lowest)</option>
                  <option value="sellVol-highest">SellVol (Highest)</option>
                  <option value="sellVol-lowest">SellVol (Lowest)</option>
                  <option value="sellVal-highest">SellVal (Highest)</option>
                  <option value="sellVal-lowest">SellVal (Lowest)</option>
                </select>
              </div>
              
              {/* Sell Side Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Sell Side Sort:</label>
                <select
                  value={sellSideFilter}
                  onChange={(e) => setSellSideFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                >
                  <option value="all">All</option>
                  <option value="netBuyVol-highest">NetBuyVol (Highest)</option>
                  <option value="netBuyVol-lowest">NetBuyVol (Lowest)</option>
                  <option value="netBuyVal-highest">NetBuyVal (Highest)</option>
                  <option value="netBuyVal-lowest">NetBuyVal (Lowest)</option>
                  <option value="totalVol-highest">TotalVol (Highest)</option>
                  <option value="totalVol-lowest">TotalVol (Lowest)</option>
                  <option value="totalVal-highest">TotalVal (Highest)</option>
                  <option value="totalVal-lowest">TotalVal (Lowest)</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Buy Side Horizontal Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">BUY SIDE - {selectedBroker} ({filteredBuyStocks.length} stocks)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md max-h-96 overflow-y-auto">
              <div className="inline-block min-w-full">
                <table className="w-full min-w-[900px] text-xs border-collapse">
                  <thead className="bg-background sticky top-0 z-30">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent sticky left-0 z-20">Ticker</th>
                      {selectedDates.map((date) => (
                        <th key={date} colSpan={4} className="text-center py-2 px-1 font-medium border-l border-border">
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left py-1 px-2 font-medium bg-accent sticky left-0 z-20"></th>
                      {selectedDates.map((date) => (
                        <React.Fragment key={date}>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">BuyVol</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">BuyVal</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">SellVol</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px] border-r-2 border-border">SellVal</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBuyStocks.map((stock, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                        <td className="py-1.5 px-2 font-medium bg-background sticky left-0 z-20 border-r border-border">{stock}</td>
                        {selectedDates.map((date) => {
                          const dateData = transactionData.get(date) || [];
                          const dayData = dateData.find(d => d.Emiten === stock);
                          const hasDataForDate = dayData !== undefined;
                          
                          return (
                            <React.Fragment key={date}>
                              {hasDataForDate && dayData ? (
                                <>
                                  <td className="text-right py-1.5 px-1 text-green-600">{formatValue(dayData.BuyerVol || 0)}</td>
                                  <td className="text-right py-1.5 px-1 text-green-600">{formatValue(dayData.BuyerValue || 0)}</td>
                                  <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.SellerVol || 0)}</td>
                                  <td className="text-right py-1.5 px-1 text-red-600 border-r-2 border-border">{formatValue(dayData.SellerValue || 0)}</td>
                                </>
                              ) : (
                                <>
                                  <td className="text-center py-1.5 px-1 text-muted-foreground text-[10px]" colSpan={4}>
                                    No data
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
          </CardContent>
        </Card>

        {/* Sell Side Horizontal Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">SELL SIDE - {selectedBroker} ({filteredSellStocks.length} stocks)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md max-h-96 overflow-y-auto">
              <div className="inline-block min-w-full">
                <table className="w-full min-w-[900px] text-xs border-collapse">
                  <thead className="bg-background sticky top-0 z-30">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent sticky left-0 z-20">Ticker</th>
                      {selectedDates.map((date) => (
                        <th key={date} colSpan={4} className="text-center py-2 px-1 font-medium border-l border-border">
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left py-1 px-2 font-medium bg-accent sticky left-0 z-20"></th>
                      {selectedDates.map((date) => (
                        <React.Fragment key={date}>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">NetBuyVol</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">NetBuyVal</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">TotalVol</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px] border-r-2 border-border">TotalVal</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSellStocks.map((stock, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                        <td className="py-1.5 px-2 font-medium bg-background sticky left-0 z-20 border-r border-border">{stock}</td>
                        {selectedDates.map((date) => {
                          const dateData = transactionData.get(date) || [];
                          const dayData = dateData.find(d => d.Emiten === stock);
                          const hasDataForDate = dayData !== undefined;
                          
                          return (
                            <React.Fragment key={date}>
                              {hasDataForDate && dayData ? (
                                <>
                                  <td className="text-right py-1.5 px-1 text-blue-600">{formatValue(dayData.NetBuyVol || 0)}</td>
                                  <td className="text-right py-1.5 px-1 text-blue-600">{formatValue(dayData.NetBuyValue || 0)}</td>
                                  <td className="text-right py-1.5 px-1">{formatValue(dayData.TotalVolume || 0)}</td>
                                  <td className="text-right py-1.5 px-1 border-r-2 border-border">{formatValue(dayData.TotalValue || 0)}</td>
                                </>
                              ) : (
                                <>
                                  <td className="text-center py-1.5 px-1 text-muted-foreground text-[10px]" colSpan={4}>
                                    No data
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
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderVerticalView = () => {
    if (!selectedBroker) return null;
    
    return (
      <div className="space-y-6">
        {selectedDates.map((date) => {
          const buyData = transactionData.get(date) || [];
          const sellData = transactionData.get(date) || [];
          const hasData = buyData.length > 0;
          
          return (
            <div key={date} className="space-y-4">
              {/* Date Header */}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">{formatDisplayDate(date)}</h3>
              </div>
              
              {!hasData ? (
                <div className="text-center py-8 text-muted-foreground">
                  No data available for {selectedBroker} on {formatDisplayDate(date)}
                </div>
              ) : (
                /* Buy Side and Sell Side side by side */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Buy Side for this date */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-green-600">BUY SIDE - {selectedBroker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead className="bg-background">
                          <tr className="border-b border-border bg-accent/30">
                            <th className="text-left py-2 px-3 font-medium">Ticker</th>
                            <th className="text-right py-2 px-3 font-medium">BuyVol</th>
                            <th className="text-right py-2 px-3 font-medium">BuyVal</th>
                            <th className="text-right py-2 px-3 font-medium">SellVol</th>
                            <th className="text-right py-2 px-3 font-medium">SellVal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {buyData.map((row, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                              <td className="py-2 px-3 font-medium">{row.Emiten}</td>
                              <td className="text-right py-2 px-3 text-green-600">{formatValue(row.BuyerVol)}</td>
                              <td className="text-right py-2 px-3 text-green-600">{formatValue(row.BuyerValue)}</td>
                              <td className="text-right py-2 px-3 text-red-600">{formatValue(row.SellerVol)}</td>
                              <td className="text-right py-2 px-3 text-red-600">{formatValue(row.SellerValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Sell Side for this date */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-red-600">SELL SIDE - {selectedBroker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead className="bg-background">
                          <tr className="border-b border-border bg-accent/30">
                            <th className="text-left py-2 px-3 font-medium">Ticker</th>
                            <th className="text-right py-2 px-3 font-medium">NetBuyVol</th>
                            <th className="text-right py-2 px-3 font-medium">NetBuyVal</th>
                            <th className="text-right py-2 px-3 font-medium">TotalVol</th>
                            <th className="text-right py-2 px-3 font-medium">TotalVal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sellData.map((row, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                              <td className="py-2 px-3 font-medium">{row.Emiten}</td>
                              <td className="text-right py-2 px-3 text-blue-600">{formatValue(row.NetBuyVol)}</td>
                              <td className="text-right py-2 px-3 text-blue-600">{formatValue(row.NetBuyValue)}</td>
                              <td className="text-right py-2 px-3">{formatValue(row.TotalVolume)}</td>
                              <td className="text-right py-2 px-3">{formatValue(row.TotalValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading transaction data...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center justify-center py-8 text-red-600">
          <span>{error}</span>
        </div>
      )}

      {/* Top Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Date Range Selection (Max 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Row 1: Broker, Date Range, Quick Select, Layout */}
            <div className="flex flex-col gap-4 md:grid md:grid-cols-2 lg:flex lg:flex-row items-center lg:items-end">
              {/* Broker Selection */}
              <div className="flex-1 min-w-0 w-full">
                <label className="block text-sm font-medium mb-2">Broker:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={brokerInput}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setBrokerInput(v);
                      setShowBrokerSuggestions(true);
                      setHighlightedIndex(0);
                      if (!v) setSelectedBroker('');
                    }}
                    onFocus={() => setShowBrokerSuggestions(true)}
                    onKeyDown={(e) => {
                      // Filter brokers by text input only (no availability filtering)
                      const suggestions = availableBrokers.filter(b => b.toLowerCase().includes(brokerInput.toLowerCase())).slice(0, 10);
                      if (e.key === 'ArrowDown' && suggestions.length) {
                        e.preventDefault();
                        setHighlightedIndex((prev) => {
                          const next = prev + 1;
                          return next >= suggestions.length ? 0 : next;
                        });
                      } else if (e.key === 'ArrowUp' && suggestions.length) {
                        e.preventDefault();
                        setHighlightedIndex((prev) => {
                          const next = prev - 1;
                          return next < 0 ? suggestions.length - 1 : next;
                        });
                      } else if (e.key === 'Enter' && showBrokerSuggestions) {
                        e.preventDefault();
                        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
                        const choice = suggestions[idx];
                        if (choice) {
                          setSelectedBroker(choice);
                          setBrokerInput(choice);
                          setShowBrokerSuggestions(false);
                          setHighlightedIndex(-1);
                        }
                      } else if (e.key === 'Escape') {
                        setShowBrokerSuggestions(false);
                        setHighlightedIndex(-1);
                      }
                    }}
                    placeholder="Enter broker code..."
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                    role="combobox"
                    aria-expanded={showBrokerSuggestions}
                    aria-controls="broker-suggestions"
                    aria-autocomplete="list"
                  />
                  {!!brokerInput && (
                    <button
                      className="absolute right-2 top-2.5 text-muted-foreground"
                      onClick={() => { setBrokerInput(''); setSelectedBroker(''); setShowBrokerSuggestions(false); }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {showBrokerSuggestions && (
                    <div id="broker-suggestions" role="listbox" className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                      {availableBrokers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground flex items-center">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading brokers...
                        </div>
                      ) : (
                    (() => {
                          // Filter brokers by text input only (no availability filtering)
                          const suggestions = availableBrokers.filter(b => b.toLowerCase().includes(brokerInput.toLowerCase())).slice(0, 10);
                      return (
                            <>
                          {suggestions.map((b, idx) => (
                            <button
                              key={b}
                              role="option"
                              aria-selected={idx === highlightedIndex}
                              className={`w-full text-left px-3 py-2 text-sm ${idx === highlightedIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                              onMouseDown={(e) => { e.preventDefault(); }}
                              onClick={() => {
                                setSelectedBroker(b);
                                setBrokerInput(b);
                                setShowBrokerSuggestions(false);
                                setHighlightedIndex(-1);
                              }}
                            >
                              {b}
                            </button>
                          ))}
                          {suggestions.length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                          )}
                            </>
                      );
                    })()
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Date Range */}
              <div className="flex-1 min-w-0 w-full md:col-span-2">
                <label className="block text-sm font-medium mb-2">Date Range:</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 w-full">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                  <span className="text-sm text-muted-foreground text-center whitespace-nowrap sm:px-2">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                  <Button onClick={addDateRange} size="sm" className="w-auto justify-self-center">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Quick Select */}
              <div className="flex-1 min-w-0 w-full">
                <label className="block text-sm font-medium mb-2">Quick Select:</label>
                <div className="flex gap-2">
                  <select 
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                    value={dateRangeMode}
                    onChange={(e) => handleDateRangeModeChange(e.target.value as '1day' | '3days' | '1week' | 'custom')}
                  >
                    <option value="1day">1 Day</option>
                    <option value="3days">3 Days</option>
                    <option value="1week">1 Week</option>
                    <option value="custom">Custom</option>
                  </select>
                  {dateRangeMode === 'custom' && (
                    <Button onClick={clearAllDates} variant="outline" size="sm">
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Layout Mode Toggle */}
              <div className="flex-1 min-w-0 w-full lg:w-auto lg:flex-none">
                <label className="block text-sm font-medium mb-2">Layout:</label>
                <div className="flex sm:inline-flex items-center gap-1 border border-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto lg:w-auto justify-center sm:justify-start">
                  <div className="grid grid-cols-2 gap-1 w-full max-w-xs mx-auto sm:flex sm:items-center sm:gap-1 sm:max-w-none sm:mx-0">
                    <Button
                      variant={layoutMode === 'horizontal' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setLayoutMode('horizontal')}
                      className="px-3 py-1 h-8 text-xs"
                    >
                      Horizontal
                    </Button>
                    <Button
                      variant={layoutMode === 'vertical' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setLayoutMode('vertical')}
                      className="px-3 py-1 h-8 text-xs"
                    >
                      Vertical
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Selected Dates */}
            <div>
              <label className="text-sm font-medium">Selected Dates:</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedDates.map((date) => (
                  <Badge key={date} variant="secondary" className="px-3 py-1">
                    {formatDisplayDate(date)}
                    {selectedDates.length > 1 && (
                      <button
                        onClick={() => removeDate(date)}
                        className="ml-2 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Data Display */}
      {!isLoading && !error && (layoutMode === 'horizontal' ? renderHorizontalView() : renderVerticalView())}
    </div>
  );
}
