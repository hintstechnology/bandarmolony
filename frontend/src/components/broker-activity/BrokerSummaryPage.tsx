import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, Plus, RotateCcw, Calendar, Loader2 } from 'lucide-react';
import { getBrokerBackgroundClass, getBrokerTextClass, useDarkMode } from '../../utils/brokerColors';
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface BrokerSummaryData {
  broker: string;
  nblot: number;
  nbval: number;
  bavg: number;
  sl: number;
  nslot: number;
  nsval: number;
  savg: number;
}

// Fetch broker summary data from API
const fetchBrokerSummaryData = async (stock: string, date: string, showToast: any): Promise<BrokerSummaryData[]> => {
  try {
    console.log(`Fetching broker data for ${stock} on ${date}`);
    const response = await api.getBrokerSummaryData(stock, date);
    console.log('API Response:', response);
    
    if (response.success && response.data?.brokerData) {
      return response.data.brokerData;
    }
    
    if (!response.success) {
      console.error('API Error:', response.error);
      
      // Show toast for data not found
      const formattedDate = new Date(date).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      
      showToast({
        type: 'warning',
        title: 'Data Tidak Ditemukan',
        message: `Data broker untuk ${stock} pada tanggal ${formattedDate} tidak tersedia.`
      });
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching broker summary data:', error);
    
    // Show toast for network/other errors
    const formattedDate = new Date(date).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    
    showToast({
      type: 'error',
      title: 'Error Memuat Data',
      message: `Gagal memuat data broker untuk ${stock} pada tanggal ${formattedDate}.`
    });
    
    return [];
  }
};

// Get last three trading days
const getLastThreeDays = (): string[] => {
  const today = new Date();
  const dates: string[] = [];
  
  for (let i = 0; i < 3; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0] ?? '');
  }
  
  return dates;
};

const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
};

const getBrokerRowClass = (broker: string, _data: BrokerSummaryData): string => {
  const isDarkMode = useDarkMode();
  const backgroundClass = getBrokerBackgroundClass(broker, isDarkMode);
  const textClass = getBrokerTextClass(broker, isDarkMode);
  return `${backgroundClass} ${textClass} hover:opacity-80`;
};

export function BrokerSummaryPage() {
  const { showToast } = useToast();
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates;
    }
    return [];
  });
  const [startDate, setStartDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0] ?? '';
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1] ?? '';
    }
    return '';
  });
  const [tickerInput, setTickerInput] = useState('BBCA');
  const [selectedTicker, setSelectedTicker] = useState<string>('BBCA');
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);
  const [highlightedTickerIndex, setHighlightedTickerIndex] = useState<number>(-1);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('vertical');
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');
  
  // API data states
  const [brokerDataByDate, setBrokerDataByDate] = useState<{ [date: string]: BrokerSummaryData[] }>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);

  // Load available dates and stocks on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load available dates
        const datesResponse = await api.getBrokerSummaryDates();
        if (datesResponse.success && datesResponse.data?.dates && datesResponse.data.dates.length > 0) {
          const firstDate = datesResponse.data.dates[0];
          if (firstDate) {
            const stocksResponse = await api.getBrokerSummaryStocks(firstDate);
            if (stocksResponse.success && stocksResponse.data?.stocks) {
              setAvailableStocks(stocksResponse.data.stocks);
            }
          }
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      }
    };
    
    loadInitialData();
  }, []);

  // Load broker data when selected ticker or dates change
  useEffect(() => {
    const loadBrokerData = async () => {
      if (!selectedTicker || selectedDates.length === 0) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const newBrokerDataByDate: { [date: string]: BrokerSummaryData[] } = {};
        
        // Fetch data for each selected date
        for (const date of selectedDates) {
          const data = await fetchBrokerSummaryData(selectedTicker, date, showToast);
          newBrokerDataByDate[date] = data;
        }
        
        setBrokerDataByDate(newBrokerDataByDate);
        
        // Check if no data was found for any date
        const hasAnyData = Object.values(newBrokerDataByDate).some(data => data.length > 0);
        if (!hasAnyData && selectedDates.length > 0) {
          const startDate = selectedDates[0];
          const endDate = selectedDates[selectedDates.length - 1];
          const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }) : '';
          const formattedEndDate = endDate ? new Date(endDate).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }) : '';
          
          showToast({
            type: 'warning',
            title: 'Data Tidak Ditemukan',
            message: `Data broker untuk ${selectedTicker} pada rentang tanggal ${formattedStartDate} - ${formattedEndDate} tidak tersedia.`
          });
        }
      } catch (err) {
        setError('Failed to load broker data');
        console.error('Error loading broker data:', err);
        
        // Show toast for general error
        showToast({
          type: 'error',
          title: 'Error Memuat Data',
          message: `Gagal memuat data broker untuk ${selectedTicker}.`
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadBrokerData();
  }, [selectedTicker, selectedDates]);

  const addDateRange = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if range is valid
      if (start <= end) {
        const newDates: string[] = [];
        const current = new Date(start);
        
        while (current <= end) {
          newDates.push(current.toISOString().split('T')[0] ?? '');
          current.setDate(current.getDate() + 1);
        }
        
        setSelectedDates(prev => {
          const combined = [...prev, ...newDates];
          return [...new Set(combined)].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        });
      }
    }
  };

  const removeDate = (dateToRemove: string) => {
    setSelectedDates(prev => prev.filter(date => date !== dateToRemove));
  };

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleDateRangeModeChange = (mode: '1day' | '3days' | '1week' | 'custom') => {
    setDateRangeMode(mode);
    
    // Only auto-set dates for quick select modes, not custom
    if (mode === '1day') {
      const oneDay = getLastThreeDays().slice(0, 1);
      setSelectedDates(oneDay);
      setStartDate(oneDay[0] ?? '');
      setEndDate(oneDay[0] ?? '');
    } else if (mode === '3days') {
      const threeDays = getLastThreeDays();
      setSelectedDates(threeDays);
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setStartDate(sortedDates[0] ?? '');
      setEndDate(sortedDates[sortedDates.length - 1] ?? '');
    } else if (mode === '1week') {
      const oneWeek = getLastThreeDays().slice(0, 7);
      setSelectedDates(oneWeek);
      const sortedDates = [...oneWeek].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setStartDate(sortedDates[0] ?? '');
      setEndDate(sortedDates[sortedDates.length - 1] ?? '');
    } else if (mode === 'custom') {
      // For custom mode, don't auto-set dates, let user input manually
      // Keep current selectedDates, but clear start/end dates for fresh input
      setStartDate('');
      setEndDate('');
    }
  };

  const clearAllDates = () => {
    setSelectedDates([]);
    setStartDate('');
    setEndDate('');
  };

  const renderVerticalView = () => {
    if (!selectedTicker || selectedDates.length === 0) return null;
    
    return (
      <div className="space-y-6">
        {selectedDates.map((date) => {
          const buyData = brokerDataByDate[date] || [];
          const sellData = (brokerDataByDate[date] || []).map(broker => ({
            ...broker,
            nblot: Math.abs(broker.nslot),
            nbval: Math.abs(broker.nsval),
            bavg: broker.savg,
            nslot: broker.nslot,
            nsval: broker.nsval,
            savg: broker.savg
          }));
          
          return (
            <div key={date} className="space-y-4">
              {/* Date Header */}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">{formatDisplayDate(date)}</h3>
              </div>
              
              {/* Buy Side and Sell Side side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Buy Side for this date */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-green-600">BUY SIDE - {selectedTicker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-medium">Broker</th>
                            <th className="text-right py-2 px-2 font-medium">NBLot</th>
                            <th className="text-right py-2 px-2 font-medium">NBVal</th>
                            <th className="text-right py-2 px-2 font-medium">BAvg</th>
                            <th className="text-right py-2 px-2 font-medium">SL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {buyData.map((row, idx) => (
                            <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                              <td className="py-2 px-2 font-medium">{row.broker}</td>
                              <td className="text-right py-2 px-2 text-green-600">{formatNumber(row.nblot)}</td>
                              <td className="text-right py-2 px-2 text-green-600">{formatNumber(row.nbval)}</td>
                              <td className="text-right py-2 px-2">{formatNumber(row.bavg)}</td>
                              <td className="text-right py-2 px-2">{formatNumber(row.sl)}</td>
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
                    <CardTitle className="text-red-600">SELL SIDE - {selectedTicker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-medium">Broker</th>
                            <th className="text-right py-2 px-2 font-medium">NSLot</th>
                            <th className="text-right py-2 px-2 font-medium">NSVal</th>
                            <th className="text-right py-2 px-2 font-medium">SAvg</th>
                            <th className="text-right py-2 px-2 font-medium">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sellData.map((row, idx) => (
                            <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                              <td className="py-2 px-2 font-medium">{row.broker}</td>
                              <td className="text-right py-2 px-2 text-red-600">{formatNumber(row.nslot)}</td>
                              <td className="text-right py-2 px-2 text-red-600">{formatNumber(row.nsval)}</td>
                              <td className="text-right py-2 px-2">{formatNumber(row.savg)}</td>
                              <td className="text-right py-2 px-2 font-medium">
                                {formatNumber(row.nblot + row.nslot)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderHorizontalView = () => {
    if (!selectedTicker || selectedDates.length === 0) return null;
    
    return (
      <div className="space-y-6">
        {selectedDates.map((date) => {
          const buyData = brokerDataByDate[date] || [];
          const sellData = (brokerDataByDate[date] || []).map(broker => ({
            ...broker,
            nblot: Math.abs(broker.nslot),
            nbval: Math.abs(broker.nsval),
            bavg: broker.savg,
            nslot: broker.nslot,
            nsval: broker.nsval,
            savg: broker.savg
          }));
          
          return (
            <div key={date} className="space-y-4">
              {/* Date Header */}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">{formatDisplayDate(date)}</h3>
              </div>
              
              {/* Horizontal Layout: Buy and Sell side by side */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Buy Side for this date */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-green-600">BUY SIDE - {selectedTicker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
                      <table className="w-full min-w-[400px] text-xs">
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-medium">Broker</th>
                            <th className="text-right py-2 px-2 font-medium">NBLot</th>
                            <th className="text-right py-2 px-2 font-medium">NBVal</th>
                            <th className="text-right py-2 px-2 font-medium">BAvg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {buyData.map((row, idx) => (
                            <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                              <td className="py-2 px-2 font-medium">{row.broker}</td>
                              <td className="text-right py-2 px-2 text-green-600">{formatNumber(row.nblot)}</td>
                              <td className="text-right py-2 px-2 text-green-600">{formatNumber(row.nbval)}</td>
                              <td className="text-right py-2 px-2 text-green-600">{formatNumber(row.bavg)}</td>
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
                    <CardTitle className="text-red-600">SELL SIDE - {selectedTicker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
                      <table className="w-full min-w-[400px] text-xs">
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-medium">Broker</th>
                            <th className="text-right py-2 px-2 font-medium">SL</th>
                            <th className="text-right py-2 px-2 font-medium">NSVal</th>
                            <th className="text-right py-2 px-2 font-medium">SAvg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sellData.map((row, idx) => (
                            <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                              <td className="py-2 px-2 font-medium">{row.broker}</td>
                              <td className="text-right py-2 px-2 text-red-600">{formatNumber(row.sl)}</td>
                              <td className="text-right py-2 px-2 text-red-600">{formatNumber(row.nsval)}</td>
                              <td className="text-right py-2 px-2 text-red-600">{formatNumber(row.savg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
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
            {/* Row 1: Ticker, Quick Select, Layout */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              {/* Ticker Selection */}
              <div className="flex-1 min-w-0 w-full lg:w-2/3">
                <label className="block text-sm font-medium mb-2">Ticker:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setTickerInput(v);
                      setShowTickerSuggestions(true);
                      setHighlightedTickerIndex(0);
                      if (!v) setSelectedTicker('');
                    }}
                    onFocus={() => setShowTickerSuggestions(true)}
                    onKeyDown={(e) => {
                      const suggestions = availableStocks
                        .filter(t => t.toLowerCase().includes(tickerInput.toLowerCase()))
                        .slice(0, 10);
                      if (!suggestions.length) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedTickerIndex(prev => {
                          const next = prev + 1;
                          return next >= suggestions.length ? 0 : next;
                        });
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedTickerIndex(prev => {
                          const next = prev - 1;
                          return next < 0 ? suggestions.length - 1 : next;
                        });
                      } else if (e.key === 'Enter' && showTickerSuggestions) {
                        e.preventDefault();
                        const idx = highlightedTickerIndex >= 0 ? highlightedTickerIndex : 0;
                        const choice = suggestions[idx];
                        if (choice) {
                          setTickerInput(choice);
                          setSelectedTicker(choice);
                          setShowTickerSuggestions(false);
                          setHighlightedTickerIndex(-1);
                        }
                      } else if (e.key === 'Escape') {
                        setShowTickerSuggestions(false);
                        setHighlightedTickerIndex(-1);
                      }
                    }}
                    placeholder="Enter ticker code..."
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                    role="combobox"
                    aria-expanded={showTickerSuggestions}
                    aria-controls="ticker-suggestions"
                    aria-autocomplete="list"
                  />
                  {!!tickerInput && (
                    <button
                      className="absolute right-2 top-2.5 text-muted-foreground"
                      onClick={() => {
                        setTickerInput('');
                        setSelectedTicker('');
                        setShowTickerSuggestions(false);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {showTickerSuggestions && (
                    (() => {
                      const suggestions = availableStocks
                        .filter(t => t.toLowerCase().includes(tickerInput.toLowerCase()))
                        .slice(0, 10);
                      return (
                        <div id="ticker-suggestions" role="listbox" className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                          {suggestions.map((t, idx) => (
                            <button
                              key={t}
                              role="option"
                              aria-selected={idx === highlightedTickerIndex}
                              className={`w-full text-left px-3 py-2 text-sm ${idx === highlightedTickerIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                              onMouseEnter={() => setHighlightedTickerIndex(idx)}
                              onMouseDown={(e) => { e.preventDefault(); }}
                              onClick={() => {
                                setTickerInput(t);
                                setSelectedTicker(t);
                                setShowTickerSuggestions(false);
                                setHighlightedTickerIndex(-1);
                              }}
                            >
                              {t}
                            </button>
                          ))}
                          {suggestions.length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>


              {/* Quick Select */}
              <div className="w-full lg:w-1/3">
                <label className="block text-sm font-medium mb-2">Quick Select:</label>
                <div className="flex gap-2">
                  <select 
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
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
              <div className="w-full lg:w-auto lg:flex-none">
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

            {/* Custom Date Range - Only show when custom is selected */}
            {dateRangeMode === 'custom' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-4">
                  <div className="flex-1 min-w-0 w-full">
                    <label className="block text-sm font-medium mb-2">Date Range:</label>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto] items-center gap-2 w-full">
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
                      <Button onClick={clearAllDates} variant="outline" size="sm" className="w-auto">
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading broker data...</span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-8 text-red-600">
          <span>{error}</span>
        </div>
      ) : layoutMode === 'horizontal' ? (
        renderHorizontalView()
      ) : (
        renderVerticalView()
      )}
    </div>
  );
}
