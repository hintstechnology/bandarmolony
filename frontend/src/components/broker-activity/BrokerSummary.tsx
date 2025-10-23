import { getBrokerBackgroundClass, getBrokerTextClass, useDarkMode } from '../../utils/brokerColors';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar, RotateCcw, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

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


interface BrokerSummaryProps {
  selectedStock?: string;
}

// Fetch broker summary data from API
const fetchBrokerSummaryData = async (stock: string, date: string): Promise<BrokerSummaryData[]> => {
  try {
    const response = await api.getBrokerSummaryData(stock, date);
    if (response.success && response.data?.brokerData) {
      return response.data.brokerData;
    }
    return [];
  } catch (error) {
    console.error('Error fetching broker summary data:', error);
    return [];
  }
};


const formatNumber = (num: number): string => {
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(num >= 10 ? 0 : num >= 1 ? 1 : 2);
};

const formatValue = (value: number): string => {
  return formatNumber(value);
};

const getBrokerRowClass = (broker: string, _data: BrokerSummaryData): string => {
  const isDarkMode = useDarkMode();
  const backgroundClass = getBrokerBackgroundClass(broker, isDarkMode);
  const textClass = getBrokerTextClass(broker, isDarkMode);
  return `${backgroundClass} ${textClass} hover:opacity-80`;
};

export function BrokerSummary({ selectedStock = 'BBRI' }: BrokerSummaryProps) {
  // Date range states (styling and basic functionality copied from BrokerTransaction)
  const todayIso = new Date().toISOString().split('T')[0] ?? '';
  const [startDate, setStartDate] = useState<string>(todayIso);
  const [endDate, setEndDate] = useState<string>(todayIso);
  const [dateRangeMode, setDateRangeMode] = useState<'1day'|'3days'|'1week'|'custom'>('1day');
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal');
  
  // API data states
  const [brokerData, setBrokerData] = useState<BrokerSummaryData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Get trading days (skip weekends)
  const getTradingDays = (count: number): string[] => {
    const dates: string[] = [];
    const today = new Date();
    let currentDate = new Date(today);
    while (dates.length < count) {
      const dow = currentDate.getDay();
      if (dow !== 0 && dow !== 6) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (dateStr) {
          dates.push(dateStr);
        }
      }
      currentDate.setDate(currentDate.getDate() - 1);
      if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
        const todayStr = today.toISOString().split('T')[0];
        if (todayStr) {
          dates.push(todayStr);
        }
        break;
      }
    }
    return dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  };

  const handleDateRangeModeChange = (mode: '1day'|'3days'|'1week'|'custom') => {
    setDateRangeMode(mode);
    if (mode === 'custom') return;
    const count = mode === '1day' ? 1 : mode === '3days' ? 3 : 5;
    const days = getTradingDays(count);
    if (days.length) {
      setStartDate(days[0] || todayIso);
      setEndDate(days[days.length - 1] || todayIso);
    }
  };

  // Load broker data when selected stock or date changes
  useEffect(() => {
    const loadBrokerData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await fetchBrokerSummaryData(selectedStock, startDate);
        setBrokerData(data);
      } catch (err) {
        setError('Failed to load broker data');
        console.error('Error loading broker data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadBrokerData();
  }, [selectedStock, startDate]);
  
  return (
    <div className="space-y-6">
      {/* Date Range Selection - styling copied from BrokerTransaction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Date Range Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:grid md:grid-cols-2 lg:flex lg:flex-row items-center lg:items-end">
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
                <Button size="sm" className="w-auto justify-self-center" onClick={() => { /* hook for future filtering */ }}>
                  Apply
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
                  <Button variant="outline" size="sm" onClick={() => { setStartDate(todayIso); setEndDate(todayIso); }}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Layout Switch (same styling as BrokerTransaction) */}
            <div className="flex-1 min-w-0 w-full lg:w-auto lg:flex-none">
              <label className="block text-sm font-medium mb-2">Layout:</label>
              <div className="flex sm:inline-flex items-center gap-1 border border-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto lg:w-auto">
                <div className="flex items-center gap-1 min-w-max">
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
        </CardContent>
      </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Loading broker data...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-red-600">
            <span>{error}</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-3 font-medium">Broker</th>
                  <th className="text-right py-2 px-3 font-medium">NBLot</th>
                  <th className="text-right py-2 px-3 font-medium">NBVal</th>
                  <th className="text-right py-2 px-3 font-medium">BAvg</th>
                  <th className="text-right py-2 px-3 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {brokerData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      No broker data available for {selectedStock} on {startDate}
                    </td>
                  </tr>
                ) : (
                  brokerData.map((row, idx) => {
                    const netPosition = row.nblot + row.nslot;
                    return (
                      <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                        <td className="py-2 px-3 font-medium">{row.broker}</td>
                        <td className="text-right py-2 px-3 text-green-600">{formatValue(row.nblot)}</td>
                        <td className="text-right py-2 px-3 text-green-600">{formatValue(row.nbval)}</td>
                        <td className="text-right py-2 px-3">{formatValue(row.bavg)}</td>
                        <td className={`text-right py-2 px-3 font-medium ${netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {netPosition >= 0 ? '+' : ''}{formatValue(netPosition)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
