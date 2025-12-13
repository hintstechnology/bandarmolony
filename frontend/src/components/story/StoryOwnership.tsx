import { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Search, X } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

// Colors for charts
const stackColors = {
  controlling: '#3b82f6',
  public: '#06b6d4', 
  affiliate: '#8b5cf6',
  others: '#10b981'
};

interface StoryOwnershipProps {
  selectedStock?: string;
}

export function StoryOwnership({ selectedStock: propSelectedStock }: StoryOwnershipProps) {
  const [searchParams] = useSearchParams();
  const urlStock = searchParams.get('stock');
  const urlView = searchParams.get('view');
  
  const [selectedStock, setSelectedStock] = useState(urlStock || propSelectedStock || 'BBCA');
  const [selectedView, setSelectedView] = useState(urlView || 'summary');
  const [dataRange, setDataRange] = useState(6); // Default 6 months
  const [stockInput, setStockInput] = useState(urlStock || propSelectedStock || 'BBCA');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [shareholdersData, setShareholdersData] = useState<any>(null);
  
  // Cache for API responses (5 minutes)
  const cacheRef = useRef<Map<string, { data: any; timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // Control menu ref and spacer height for fixed positioning
  const controlMenuRef = useRef<HTMLDivElement>(null);
  const [controlSpacerHeight, setControlSpacerHeight] = useState<number>(72);

  // Constants for search display
  const MAX_DISPLAYED = 10;
  
  // Fallback stock list in case API fails
  const FALLBACK_STOCKS = ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF', 'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS'];
  const views = [
    { key: 'summary', label: 'Summary' },
    { key: 'detailed', label: 'Detailed' }
  ];

  // Fetch shareholders data from API
  const fetchShareholdersData = async (stockCode: string) => {
    // Check cache first
    const cached = cacheRef.current.get(stockCode);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`📊 Using cached shareholders data for ${stockCode}`);
      setShareholdersData(cached.data);
      return;
    }

    setLoading(true);
    try {
      console.log(`📊 Fetching shareholders data for ${stockCode}...`);
      // Don't pass limit to get ALL shareholders
      const response = await api.getShareholdersData(stockCode);
      
      if (response.success && response.data) {
        console.log(`✅ Shareholders data loaded for ${stockCode}`, response.data);
        setShareholdersData(response.data);
        
        // Cache the data
        cacheRef.current.set(stockCode, {
          data: response.data,
          timestamp: Date.now()
        });
      } else {
        console.error(`❌ Failed to load shareholders data:`, response.error);
        toast.error(response.error || 'Failed to load shareholders data');
        setShareholdersData(null);
      }
    } catch (error: any) {
      console.error(`❌ Error fetching shareholders data:`, error);
      toast.error(error.message || 'Failed to load shareholders data');
      setShareholdersData(null);
    } finally {
      setLoading(false);
    }
  };

  // Update selectedStock when prop or URL changes
  useEffect(() => {
    const urlStock = searchParams.get('stock');
    const urlView = searchParams.get('view');
    
    if (urlStock && urlStock !== selectedStock) {
      setSelectedStock(urlStock);
      setStockInput(urlStock);
    } else if (propSelectedStock && propSelectedStock !== selectedStock) {
      setSelectedStock(propSelectedStock);
      setStockInput(propSelectedStock);
    }
    
    if (urlView && urlView !== selectedView) {
      setSelectedView(urlView);
    }
  }, [propSelectedStock, selectedStock, searchParams, selectedView]);

  // Load available stocks from shareholders directory on mount
  useEffect(() => {
    const loadStocks = async () => {
      try {
        console.log('📊 Loading shareholders stock list...');
        const response = await api.getShareholdersStockList();
        console.log('📊 Shareholders stock list response:', response);
        if (response.success && response.data?.stocks) {
          console.log('📊 Setting available stocks from shareholders:', response.data.stocks);
          setAvailableStocks(Array.isArray(response.data.stocks) ? response.data.stocks : []);
        } else {
          console.log('📊 No shareholders stock data available, using fallback');
          setAvailableStocks(FALLBACK_STOCKS);
        }
      } catch (error) {
        console.error('Failed to load shareholders stock list:', error);
        setAvailableStocks(FALLBACK_STOCKS);
      }
    };
    loadStocks();
  }, []);

  // Fetch data when selected stock changes
  useEffect(() => {
    if (selectedStock) {
      fetchShareholdersData(selectedStock);
    }
  }, [selectedStock]);

  // Use available stocks from API or fallback to default
  const stockList = (availableStocks || []).length > 0 ? availableStocks : FALLBACK_STOCKS;
  const filteredStocks = stockList.filter(stock => 
    stock.toLowerCase().includes(stockInput.toLowerCase())
  );
  const hasMore = filteredStocks.length > MAX_DISPLAYED;
  const displayedStocks = filteredStocks.slice(0, MAX_DISPLAYED);
  const moreCount = filteredStocks.length - MAX_DISPLAYED;

  const handleStockSelect = (stock: string) => {
    setStockInput(stock);
    setSelectedStock(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value.toUpperCase());
    setShowStockSuggestions(true);
    // Auto-select if exact match
    if (stockList.includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.stock-dropdown-container')) {
        setShowStockSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update spacer height for fixed control menu
  useEffect(() => {
    const updateSpacerHeight = () => {
      if (controlMenuRef.current) {
        const height = controlMenuRef.current.offsetHeight;
        setControlSpacerHeight(Math.max(height + 16, 48));
      }
    };

    updateSpacerHeight();
    window.addEventListener('resize', updateSpacerHeight);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && controlMenuRef.current) {
      resizeObserver = new ResizeObserver(() => updateSpacerHeight());
      resizeObserver.observe(controlMenuRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSpacerHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [stockInput, selectedView]);

  // Process real shareholders data for pie chart - memoized to prevent infinite loops
  const ownershipData = useMemo(() => {
    if (!shareholdersData?.data?.shareholders || shareholdersData.data.shareholders.length === 0) {
      return [];
    }

    const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
    const shareholders = shareholdersData.data.shareholders;
    
    // Get major shareholders (>= 2%) - ensure percentage is a valid number
    const majorShareholders = shareholders
      .filter((s: any) => {
        const percentage = Number(s.PemegangSaham_Persentase);
        return !isNaN(percentage) && percentage >= 2;
      })
      .map((s: any, idx: number) => ({
        name: s.PemegangSaham_Nama || 'Unknown',
        percentage: Number(s.PemegangSaham_Persentase),
        shares: Number(s.PemegangSaham_JmlSaham) || 0,
        category: s.PemegangSaham_Kategori || 'Unknown',
        color: colors[idx % colors.length]
      }));

    // Get minor shareholders (< 2%) and combine as "Others"
    const minorShareholders = shareholders.filter((s: any) => {
      const percentage = Number(s.PemegangSaham_Persentase);
      return !isNaN(percentage) && percentage < 2;
    });
    
    const othersTotal = minorShareholders.reduce((sum: number, s: any) => {
      const percentage = Number(s.PemegangSaham_Persentase);
      return sum + (isNaN(percentage) ? 0 : percentage);
    }, 0);
    
    const othersShares = minorShareholders.reduce((sum: number, s: any) => {
      const shares = Number(s.PemegangSaham_JmlSaham);
      return sum + (isNaN(shares) ? 0 : shares);
    }, 0);

    if (othersTotal > 0 && !isNaN(othersTotal)) {
      majorShareholders.push({
        name: 'Others',
        percentage: parseFloat(othersTotal.toFixed(3)),
        shares: othersShares,
        category: 'Others',
        color: colors[majorShareholders.length % colors.length]
      });
    }

    // Final validation - ensure all percentages are valid numbers
    const finalData = majorShareholders
      .filter((entry: any) => {
        const percentage = Number(entry.percentage);
        return !isNaN(percentage) && percentage > 0;
      })
      .map((entry: any) => ({
        ...entry,
        percentage: Number(entry.percentage)
      }));

    return finalData;
  }, [shareholdersData, selectedStock]);

  // Get detailed shareholders list - ALL shareholders - memoized to prevent infinite loops
  const detailedOwnership = useMemo(() => {
    if (!shareholdersData?.data?.shareholders || shareholdersData.data.shareholders.length === 0) {
      return [];
    }

    return shareholdersData.data.shareholders.map((s: any, idx: number) => ({
      rank: idx + 1,
      holder: s.PemegangSaham_Nama || 'Unknown',
      type: s.PemegangSaham_Kategori || 'Unknown',
      shares: Number(s.PemegangSaham_JmlSaham) || 0,
      percentage: Number(s.PemegangSaham_Persentase) || 0,
      value: 0, // Not available in current data
      change: '0.0%', // Not available in current data
      lastUpdate: s.DataDate || '-'
    }));
  }, [shareholdersData]);

  // Get historical data based on selected range - memoized to prevent infinite loops
  const historicalData = useMemo(() => {
    if (!shareholdersData?.data?.historical || shareholdersData.data.historical.length === 0) {
      return [];
    }

    const historical = shareholdersData.data.historical;
    
    // Format dates to show month/year and ensure numbers are valid
    const formattedHistorical = historical
      .filter((h: any) => h.period) // Filter out invalid entries
      .map((h: any) => {
        const date = new Date(h.period);
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const year = date.getFullYear();
        return {
          period: `${month} ${year}`,
          controlling: Number(h.controlling) || 0,
          public: Number(h.public) || 0,
          affiliate: Number(h.affiliate) || 0,
          others: Number(h.others) || 0
        };
      });

    // Return last N months based on dataRange
    return formattedHistorical.slice(-dataRange);
  }, [shareholdersData, dataRange]);

  // Get summary metrics
  const getSummaryMetrics = () => {
    if (!shareholdersData?.data?.summary || !shareholdersData?.data?.shareholders) {
      return {
        totalShareholders: 0,
        controllingPercentage: 0,
        publicPercentage: 0,
        controllingName: 'No data',
        publicName: 'No data'
      };
    }

    const summary = shareholdersData.data.summary;
    const shareholders = shareholdersData.data.shareholders;
    
    // Find controlling shareholder name
    const controllingHolder = shareholders.find((s: any) => 
      s.PemegangSaham_Kategori?.toLowerCase().includes('pengendali') ||
      s.PemegangSaham_Kategori?.toLowerCase().includes('lebih dari 5')
    );
    
    // Find public holder name
    const publicHolder = shareholders.find((s: any) => 
      s.PemegangSaham_Kategori?.toLowerCase().includes('masyarakat')
    );

    return {
      totalShareholders: summary.totalShareholders || 0,
      controllingPercentage: summary.controllingPercentage || 0,
      publicPercentage: summary.publicPercentage || 0,
      controllingName: controllingHolder?.PemegangSaham_Nama || 'Controlling Shareholder',
      publicName: publicHolder?.PemegangSaham_Nama || 'Public'
    };
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B`;
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    return num.toLocaleString();
  };


  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-[#0a0f20]/95 border-b border-[#3a4252] px-4 py-1.5 backdrop-blur-md shadow-lg lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
        <div ref={controlMenuRef} className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3 md:gap-6">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">
                Ticker:
              </label>
              <div className="relative stock-dropdown-container w-32">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                <input
                  type="text"
                  value={stockInput}
                  onChange={(e) => handleStockInputChange(e.target.value)}
                  onFocus={() => setShowStockSuggestions(true)}
                  onKeyDown={(e) => {
                    if (!showStockSuggestions) setShowStockSuggestions(true);
                    if (e.key === 'ArrowDown' && displayedStocks.length) {
                      e.preventDefault();
                      setHighlightedIndex((prev) => (prev + 1) % displayedStocks.length);
                    } else if (e.key === 'ArrowUp' && displayedStocks.length) {
                      e.preventDefault();
                      setHighlightedIndex((prev) => (prev <= 0 ? displayedStocks.length - 1 : prev - 1));
                    } else if (e.key === 'Enter') {
                      if (highlightedIndex >= 0 && displayedStocks[highlightedIndex]) {
                        handleStockSelect(displayedStocks[highlightedIndex]);
                        setHighlightedIndex(-1);
                      }
                    } else if (e.key === 'Escape') {
                      setShowStockSuggestions(false);
                      setHighlightedIndex(-1);
                    }
                  }}
                  placeholder="Enter stock code..."
                  className="pl-9 pr-10 py-1 h-10 border border-border rounded-md bg-background text-foreground w-full"
                />
                {stockInput && (
                  <button
                    onClick={() => {
                      setStockInput('');
                      setShowStockSuggestions(true);
                    }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 w-6 h-6 flex items-center justify-center hover:bg-muted rounded-full transition-colors z-10"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
                {showStockSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                    {stockInput === '' && (
                      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                        All Stocks ({stockList.length} available)
                      </div>
                    )}
                    {displayedStocks.length > 0 ? (
                      <>
                        {displayedStocks.map((stock, idx) => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            onMouseLeave={() => setHighlightedIndex(-1)}
                            className={`px-3 py-2 cursor-pointer text-sm ${idx === highlightedIndex ? 'bg-muted' : 'hover:bg-muted'}`}
                          >
                            {stock}
                          </div>
                        ))}
                        {hasMore && (
                          <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                            +{moreCount} more stocks available
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No stocks found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">View:</label>
              <div className="flex gap-1 border border-border rounded-lg p-1 h-10">
                {views.map(view => (
                  <Button
                    key={view.key}
                    variant={selectedView === view.key ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setSelectedView(view.key)}
                    className="flex-1 h-8"
                  >
                    {view.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="hidden lg:block" style={{ height: `${controlSpacerHeight}px` }} />

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-pulse">
              <div className="text-lg font-medium text-muted-foreground">Loading shareholders data...</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary View */}
      {!loading && selectedView === 'summary' && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Total Shareholders</h3>
                <div className="text-2xl font-bold text-primary">{formatNumber(getSummaryMetrics().totalShareholders)}</div>
                <p className="text-sm text-muted-foreground">Number of shareholders</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Controlling Shareholder</h3>
                <div className="text-2xl font-bold text-blue-600">{getSummaryMetrics().controllingPercentage.toFixed(2)}%</div>
                <p className="text-sm text-muted-foreground truncate" title={getSummaryMetrics().controllingName}>
                  {getSummaryMetrics().controllingName}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Public Ownership</h3>
                <div className="text-2xl font-bold text-green-600">{getSummaryMetrics().publicPercentage.toFixed(2)}%</div>
                <p className="text-sm text-muted-foreground truncate" title={getSummaryMetrics().publicName}>
                  {getSummaryMetrics().publicName}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Ownership Breakdown Chart and Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Ownership Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-6 overflow-visible">
                {(() => {
                  if (ownershipData.length === 0) {
                    return (
                      <div className="h-80 flex items-center justify-center text-muted-foreground">
                        No ownership data available
                      </div>
                    );
                  }
                  
                  // Ensure data is properly formatted
                  const chartData = ownershipData.map((entry: any) => ({
                    name: entry.name,
                    percentage: Number(entry.percentage),
                    value: Number(entry.percentage), // Add value for compatibility
                    color: entry.color
                  }));
                  
                  // Debug: Log chart data
                  console.log('📊 Chart data:', chartData);
                  console.log('📊 Chart data length:', chartData.length);
                  console.log('📊 Chart data validation:', chartData.every((d: any) => 
                    !isNaN(d.percentage) && d.percentage > 0 && d.color
                  ));
                  
                  if (chartData.length === 0 || !chartData.every((d: any) => !isNaN(d.percentage) && d.percentage > 0)) {
                    return (
                      <div className="h-80 flex items-center justify-center text-muted-foreground">
                        Invalid chart data
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={120}
                            paddingAngle={2}
                            dataKey="percentage"
                            nameKey="name"
                          >
                            {chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}-${entry.name}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: any, _name: any, props: any) => [
                              `${Number(value).toFixed(2)}%`,
                              props.payload.name
                            ]}
                            contentStyle={{
                              backgroundColor: 'hsl(var(--popover))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px',
                              fontSize: '12px',
                              color: 'hsl(var(--popover-foreground))'
                            }}
                            labelStyle={{
                              color: 'hsl(var(--popover-foreground))'
                            }}
                            itemStyle={{
                              color: 'hsl(var(--popover-foreground))'
                            }}
                          />
                          <Legend 
                            verticalAlign="bottom" 
                            height={36}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Summary Table - Top Shareholders (>= 2%) */}
            <Card>
              <CardHeader>
                <CardTitle>Top Shareholders</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  if (ownershipData.length === 0) {
                    return (
                      <div className="h-80 flex items-center justify-center text-muted-foreground">
                        No shareholder data available
                      </div>
                    );
                  }
                  
                  return (
                    <div className="overflow-x-auto overflow-y-auto max-h-80">
                      <table className="w-full text-sm">
                         <thead className="sticky top-0 bg-muted/50">
                           <tr className="border-b border-border">
                             <th className="text-left p-2 text-foreground">Shareholder</th>
                             <th className="text-right p-2 text-foreground">%</th>
                             <th className="text-right p-2 text-foreground">Shares</th>
                           </tr>
                         </thead>
                        <tbody>
                          {ownershipData.map((owner: any, index: number) => (
                            <tr key={index} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="p-2">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: owner.color }}
                                  ></div>
                                  <span className="truncate text-foreground" title={owner.name}>
                                    {owner.name}
                                  </span>
                                </div>
                              </td>
                              <td className="p-2 text-right font-medium text-foreground">{Number(owner.percentage).toFixed(2)}%</td>
                              <td className="p-2 text-right text-foreground">{formatNumber(owner.shares)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Historical Ownership Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Historical Ownership Trends</CardTitle>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">Ownership changes over time</p>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Data Range:</label>
                  <select
                    value={dataRange}
                    onChange={(e) => setDataRange(Number(e.target.value))}
                    className="px-2 py-1 border border-border rounded-md bg-background text-foreground text-sm"
                  >
                    {[3, 6, 9, 12].map(num => (
                      <option key={num} value={num}>{num} months</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                if (historicalData.length === 0) {
                  return (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      No historical data available
                    </div>
                  );
                }
                
                return (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={historicalData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis 
                          dataKey="period" 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                          domain={[0, 100]}
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: 'hsl(var(--popover-foreground))'
                          }}
                          labelStyle={{
                            color: 'hsl(var(--popover-foreground))'
                          }}
                          formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
                        />
                        <Legend />
                        
                        <Bar dataKey="controlling" stackId="ownership" fill={stackColors.controlling} name="Controlling" />
                        <Bar dataKey="public" stackId="ownership" fill={stackColors.public} name="Public" />
                        <Bar dataKey="affiliate" stackId="ownership" fill={stackColors.affiliate} name="Affiliate" />
                        <Bar dataKey="others" stackId="ownership" fill={stackColors.others} name="Others" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}

      {/* Detailed View */}
      {!loading && selectedView === 'detailed' && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Ownership Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              if (detailedOwnership.length === 0) {
                return (
                  <div className="h-80 flex items-center justify-center text-muted-foreground">
                    No detailed ownership data available
                  </div>
                );
              }
              
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                     <thead>
                       <tr className="border-b border-border bg-muted/50">
                         <th className="text-left p-3 text-foreground">Rank</th>
                         <th className="text-left p-3 text-foreground">Holder Name</th>
                         <th className="text-left p-3 text-foreground">Type</th>
                         <th className="text-right p-3 text-foreground">Shares</th>
                         <th className="text-right p-3 text-foreground">%</th>
                         <th className="text-right p-3 text-foreground">Last Update</th>
                       </tr>
                     </thead>
                    <tbody>
                      {detailedOwnership.map((holder: any, index: number) => (
                        <tr key={index} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="p-3 font-medium text-foreground">#{holder.rank}</td>
                          <td className="p-3 font-medium text-foreground">{holder.holder}</td>
                          <td className="p-3">
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs">
                              {holder.type}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono text-foreground">{formatNumber(holder.shares)}</td>
                          <td className="p-3 text-right font-medium text-foreground">{Number(holder.percentage).toFixed(3)}%</td>
                          <td className="p-3 text-right text-muted-foreground">{holder.lastUpdate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
