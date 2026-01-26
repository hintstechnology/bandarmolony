import { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, Plus, Search, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';

interface MonthData {
  month: string;
  performance: number;
}

interface SeasonalityData {
  [key: string]: MonthData[];
}

interface ApiSeasonalityData {
  Ticker?: string;
  Sector?: string;
  Name?: string;
  StockCount?: string;
  Jan: string;
  Feb: string;
  Mar: string;
  Apr: string;
  May: string;
  Jun: string;
  Jul: string;
  Aug: string;
  Sep: string;
  Oct: string;
  Nov: string;
  Dec: string;
  BestMonth?: string;
  BestReturn?: string;
  WorstMonth?: string;
  WorstReturn?: string;
  Volatility?: string;
}

// No dummy data - all data comes from API

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Layout sizing (keeps things proportional across devices)
const LABEL_WIDTH_CSS = 'clamp(84px, 22vw, 128px)';
const MONTH_COL_WIDTH_CSS = 'minmax(44px, 1fr)';
const GRID_TEMPLATE = `${LABEL_WIDTH_CSS} repeat(12, ${MONTH_COL_WIDTH_CSS})`;

const getPerformanceColor = (performance: number): string => {
  const intensity = Math.min(Math.abs(performance) / 3, 1); // Normalize to 0-1
  if (performance > 0) {
    return `rgba(34, 197, 94, ${0.2 + intensity * 0.6})`; // Green with varying opacity
  } else if (performance < 0) {
    return `rgba(239, 68, 68, ${0.2 + intensity * 0.6})`; // Red with varying opacity
  }
  return 'rgba(156, 163, 175, 0.2)'; // Gray for neutral
};

const getTextColor = (performance: number): string => {
  const intensity = Math.abs(performance);
  if (intensity > 1.5) {
    return 'white'; // White text for high intensity
  }
  return 'hsl(var(--card-foreground))'; // Default text color for low intensity
};

// All data comes from API - no hardcoded options

export function MarketRotationSeasonality() {
  const [showIndex, setShowIndex] = useState(true);
  const [showSector, setShowSector] = useState(true);
  const [showStock, setShowStock] = useState(true);
  const [selectedIndices, setSelectedIndices] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedStocks, setSelectedStocks] = useState<string[]>([]);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddIndex, setShowAddIndex] = useState(false);
  const [showAddSector, setShowAddSector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const [sectorSearchQuery, setSectorSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const indexDropdownRef = useRef<HTMLDivElement>(null);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);
  const controlPanelRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation state
  const [stockDropdownIndex, setStockDropdownIndex] = useState(-1);
  const [indexDropdownIndex, setIndexDropdownIndex] = useState(-1);
  const [sectorDropdownIndex, setSectorDropdownIndex] = useState(-1);

  // Control panel spacer height for fixed positioning


  // API data states
  const [indexData, setIndexData] = useState<ApiSeasonalityData[]>([]);
  const [sectorData, setSectorData] = useState<ApiSeasonalityData[]>([]);
  const [stockData, setStockData] = useState<ApiSeasonalityData[]>([]);
  const [loading, setLoading] = useState({
    index: false,
    sector: false,
    stock: false
  });
  const [error, setError] = useState<string | null>(null);

  // Load data from API
  const loadSeasonalityData = async (type: 'index' | 'sector' | 'stock') => {
    setLoading(prev => ({ ...prev, [type]: true }));
    setError(null);

    try {
      console.log(`🔄 Loading ${type} data from API...`);
      const response = await api.getSeasonalityData(type, undefined, undefined);
      if (response.success && response.data) {
        console.log(`✅ ${type} data loaded:`, {
          total: response.data.total,
          dataLength: response.data.data?.length,
          fileName: response.data.fileName
        });

        if (type === 'index') {
          setIndexData(response.data.data);
        } else if (type === 'sector') {
          setSectorData(response.data.data);
        } else if (type === 'stock') {
          setStockData(response.data.data);
          console.log(`📊 Stock data sample:`, response.data.data?.slice(0, 3));
        }
      } else {
        throw new Error(response.error || 'Failed to load data');
      }
    } catch (err) {
      console.error(`Error loading ${type} data:`, err);
      setError(`Failed to load ${type} data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  // Load all data on component mount
  useEffect(() => {
    loadSeasonalityData('index');
    loadSeasonalityData('sector');
    loadSeasonalityData('stock');
  }, []);

  // Auto-select first available items when data loads
  useEffect(() => {
    if (indexData.length > 0 && selectedIndices.length === 0) {
      const firstIndex = indexData[0]?.Ticker;
      if (firstIndex) {
        setSelectedIndices([firstIndex]);
      }
    }
  }, [indexData, selectedIndices.length]);

  useEffect(() => {
    if (sectorData.length > 0 && selectedSectors.length === 0) {
      const firstSector = sectorData[0]?.Sector;
      if (firstSector) {
        setSelectedSectors([firstSector]);
      }
    }
  }, [sectorData, selectedSectors.length]);

  useEffect(() => {
    if (stockData.length > 0 && selectedStocks.length === 0) {
      const firstStock = stockData[0]?.Ticker;
      if (firstStock) {
        setSelectedStocks([firstStock]);
      }
    }
  }, [stockData, selectedStocks.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAddStock(false);
      }
      if (indexDropdownRef.current && !indexDropdownRef.current.contains(event.target as Node)) {
        setShowAddIndex(false);
      }
      if (sectorDropdownRef.current && !sectorDropdownRef.current.contains(event.target as Node)) {
        setShowAddSector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);



  const addIndex = (index: string) => {
    if (!selectedIndices.includes(index)) {
      setSelectedIndices([...selectedIndices, index]);
    }
    setShowAddIndex(false);
    setIndexSearchQuery('');
    setIndexDropdownIndex(-1);
  };

  const getFilteredIndices = () => {
    const availableIndices = getAvailableIndices();
    return availableIndices.filter(index =>
      index.toLowerCase().includes(indexSearchQuery.toLowerCase()) &&
      !selectedIndices.includes(index)
    );
  };

  const removeIndex = (index: string) => {
    // Prevent removing all indices - keep at least one
    const newIndices = selectedIndices.filter(i => i !== index);
    if (newIndices.length > 0) {
      setSelectedIndices(newIndices);
    }
  };

  const addSector = (sector: string) => {
    if (!selectedSectors.includes(sector)) {
      setSelectedSectors([...selectedSectors, sector]);
    }
    setShowAddSector(false);
    setSectorSearchQuery('');
    setSectorDropdownIndex(-1);
  };

  const getFilteredSectors = () => {
    const availableSectors = getAvailableSectors();
    return availableSectors.filter(sector =>
      sector.toLowerCase().includes(sectorSearchQuery.toLowerCase()) &&
      !selectedSectors.includes(sector)
    );
  };

  const removeSector = (sector: string) => {
    setSelectedSectors(selectedSectors.filter(s => s !== sector));
  };

  const addStock = (stock: string) => {
    if (!selectedStocks.includes(stock)) {
      setSelectedStocks([...selectedStocks, stock]);
    }
    setShowAddStock(false);
    setSearchQuery('');
    setStockDropdownIndex(-1);
  };

  const getFilteredStocks = () => {
    const availableStocksFromApi = getAvailableStocks();
    return availableStocksFromApi.filter(stock =>
      stock.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedStocks.includes(stock)
    );
  };

  const removeStock = (stock: string) => {
    setSelectedStocks(selectedStocks.filter(s => s !== stock));
  };

  // Keyboard navigation handlers
  const handleStockKeyDown = (e: React.KeyboardEvent) => {
    const availableStocks = getFilteredStocks();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setStockDropdownIndex(prev =>
          prev < availableStocks.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setStockDropdownIndex(prev =>
          prev > 0 ? prev - 1 : availableStocks.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (stockDropdownIndex >= 0 && availableStocks[stockDropdownIndex]) {
          addStock(availableStocks[stockDropdownIndex]);
        }
        break;
      case 'Escape':
        setShowAddStock(false);
        setStockDropdownIndex(-1);
        break;
    }
  };

  const handleIndexKeyDown = (e: React.KeyboardEvent) => {
    const availableIndices = getFilteredIndices();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setIndexDropdownIndex(prev =>
          prev < availableIndices.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setIndexDropdownIndex(prev =>
          prev > 0 ? prev - 1 : availableIndices.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (indexDropdownIndex >= 0 && availableIndices[indexDropdownIndex]) {
          addIndex(availableIndices[indexDropdownIndex]);
        }
        break;
      case 'Escape':
        setShowAddIndex(false);
        setIndexDropdownIndex(-1);
        break;
    }
  };

  const handleSectorKeyDown = (e: React.KeyboardEvent) => {
    const availableSectors = getFilteredSectors();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSectorDropdownIndex(prev =>
          prev < availableSectors.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSectorDropdownIndex(prev =>
          prev > 0 ? prev - 1 : availableSectors.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (sectorDropdownIndex >= 0 && availableSectors[sectorDropdownIndex]) {
          addSector(availableSectors[sectorDropdownIndex]);
        }
        break;
      case 'Escape':
        setShowAddSector(false);
        setSectorDropdownIndex(-1);
        break;
    }
  };

  // Convert API data to frontend format
  const convertApiDataToSeasonality = (apiData: ApiSeasonalityData[]): SeasonalityData => {
    const result: SeasonalityData = {};

    console.log(`📊 Converting ${apiData.length} API items to seasonality data`);

    // Check for duplicates in API data
    const keys = apiData.map(item => item.Ticker || item.Sector || '').filter(Boolean);
    const uniqueKeys = [...new Set(keys)];
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);

    if (duplicates.length > 0) {
      console.warn(`⚠️ Found ${duplicates.length} duplicate keys in API data:`, duplicates.slice(0, 10));
    }

    apiData.forEach((item, index) => {
      const key = item.Ticker || item.Sector || '';
      if (key) {
        result[key] = [
          { month: 'Jan', performance: parseFloat(item.Jan) || 0 },
          { month: 'Feb', performance: parseFloat(item.Feb) || 0 },
          { month: 'Mar', performance: parseFloat(item.Mar) || 0 },
          { month: 'Apr', performance: parseFloat(item.Apr) || 0 },
          { month: 'May', performance: parseFloat(item.May) || 0 },
          { month: 'Jun', performance: parseFloat(item.Jun) || 0 },
          { month: 'Jul', performance: parseFloat(item.Jul) || 0 },
          { month: 'Aug', performance: parseFloat(item.Aug) || 0 },
          { month: 'Sep', performance: parseFloat(item.Sep) || 0 },
          { month: 'Oct', performance: parseFloat(item.Oct) || 0 },
          { month: 'Nov', performance: parseFloat(item.Nov) || 0 },
          { month: 'Dec', performance: parseFloat(item.Dec) || 0 },
        ];
      } else {
        console.warn(`⚠️ Item ${index} has no valid key:`, item);
      }
    });

    console.log(`📊 Converted to ${Object.keys(result).length} seasonality entries (${uniqueKeys.length} unique keys from ${keys.length} total)`);
    return result;
  };

  // Get available options from API data
  const getAvailableIndices = () => {
    return indexData.map(item => item.Ticker || '').filter(Boolean);
  };

  const getAvailableSectors = () => {
    return sectorData.map(item => item.Sector || '').filter(Boolean);
  };

  const getAvailableStocks = () => {
    const stocks = stockData.map(item => item.Ticker || '').filter(Boolean);
    // Remove duplicates and sort
    const uniqueStocks = [...new Set(stocks)].sort();

    // Check for duplicates
    const duplicates = stocks.filter((stock, index) => stocks.indexOf(stock) !== index);
    if (duplicates.length > 0) {
      console.warn(`⚠️ Found ${duplicates.length} duplicate stocks in frontend data:`, duplicates.slice(0, 10));
    }

    console.log(`📊 Available stocks: ${uniqueStocks.length} (from ${stocks.length} total entries)`);
    console.log(`📊 Stock data sample:`, stockData.slice(0, 3));
    console.log(`📊 First 10 unique stocks:`, uniqueStocks.slice(0, 10));
    console.log(`📊 Last 10 unique stocks:`, uniqueStocks.slice(-10));
    return uniqueStocks;
  };

  // Get current data based on selection - ONLY from API data
  const getCurrentIndexData = () => {
    const apiData = convertApiDataToSeasonality(indexData);
    const result: SeasonalityData = {};
    selectedIndices.forEach(index => {
      if (apiData[index]) {
        result[index] = apiData[index];
      }
    });
    return result;
  };

  const getCurrentSectorData = () => {
    const apiData = convertApiDataToSeasonality(sectorData);
    const result: SeasonalityData = {};
    selectedSectors.forEach(sector => {
      if (apiData[sector]) {
        result[sector] = apiData[sector];
      }
    });
    return result;
  };

  const getCurrentStockData = () => {
    const apiData = convertApiDataToSeasonality(stockData);
    const result: SeasonalityData = {};
    selectedStocks.forEach(stock => {
      if (apiData[stock]) {
        result[stock] = apiData[stock];
      }
    });
    return result;
  };

  // const getSelectedStockData = () => {
  //   const result: SeasonalityData = {};
  //   selectedStocks.forEach(stock => {
  //     if (stockSeasonalityData[stock]) {
  //       result[stock] = stockSeasonalityData[stock];
  //     }
  //   });
  //   return result;
  // };

  return (
    <div className="space-y-6">
      {/* Display Options - Fixed at top on large screens */}
      <div className="bg-[#0a0f20]/95 border-b border-[#3a4252] px-4 py-1.5 backdrop-blur-md shadow-lg lg:sticky lg:top-0 lg:z-40">
        <div ref={controlPanelRef} className="flex flex-col md:flex-row md:flex-wrap items-center gap-1 md:gap-x-7 md:gap-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap" style={{ paddingTop: '8px', paddingBottom: '8px' }}>Display Options:</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* Index toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showIndex}
                onChange={(e) => setShowIndex(e.target.checked)}
                className="w-4 h-4 text-primary bg-background border border-[#3a4252] rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
              />
              <span className="text-sm font-medium">Index</span>
            </label>

            {/* Sector toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSector}
                onChange={(e) => setShowSector(e.target.checked)}
                className="w-4 h-4 text-primary bg-background border border-[#3a4252] rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
              />
              <span className="text-sm font-medium">Sector</span>
            </label>

            {/* Stock toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showStock}
                onChange={(e) => setShowStock(e.target.checked)}
                className="w-4 h-4 text-primary bg-background border border-[#3a4252] rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
              />
              <span className="text-sm font-medium">Saham</span>
            </label>
          </div>
        </div>
      </div>



      {/* Index Seasonality */}
      {showIndex && (
        <Card className="space-y-4 p-4 sm:p-6 lg:pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold sm:text-lg">Index Seasonality Pattern</h3>
              <Badge variant="outline" className="text-xs">{selectedIndices.length} Indices</Badge>
            </div>

            {/* Add Index Section */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Available Indices: {getAvailableIndices().length}
              </div>
              <div className="relative w-full sm:w-52" ref={indexDropdownRef}>
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 transform text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search and add indices..."
                    value={indexSearchQuery}
                    onChange={(e) => {
                      setIndexSearchQuery(e.target.value);
                      setShowAddIndex(true);
                      setIndexDropdownIndex(-1);
                    }}
                    onFocus={() => setShowAddIndex(true)}
                    onKeyDown={handleIndexKeyDown}
                    className="h-9 w-full rounded-md border border-border bg-background pl-7 pr-3 text-xs transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Add Index Dropdown */}
                {showAddIndex && (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {indexSearchQuery ? (
                      <>
                        {getFilteredIndices().slice(0, 8).map((index, idx) => (
                          <button
                            key={index}
                            onClick={() => addIndex(index)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${idx === indexDropdownIndex ? 'bg-accent' : ''
                              }`}
                          >
                            <span className="font-medium">{index}</span>
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ))}
                        {getFilteredIndices().length > 8 && (
                          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            + {getFilteredIndices().length - 8} more indices. Continue typing to search...
                          </div>
                        )}
                        {getFilteredIndices().length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            {getAvailableIndices().filter(index => !selectedIndices.includes(index)).length === 0
                              ? 'All indices already selected'
                              : 'No indices found'
                            }
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {getAvailableIndices()
                          .filter(index => !selectedIndices.includes(index))
                          .slice(0, 8)
                          .map((index, idx) => (
                            <button
                              key={index}
                              onClick={() => addIndex(index)}
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${idx === indexDropdownIndex ? 'bg-accent' : ''
                                }`}
                            >
                              <span className="font-medium">{index}</span>
                              <Plus className="h-3 w-3 text-muted-foreground" />
                            </button>
                          ))}
                        {getAvailableIndices().filter(index => !selectedIndices.includes(index)).length > 8 && (
                          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            + {getAvailableIndices().filter(index => !selectedIndices.includes(index)).length - 8} more indices. Type to search...
                          </div>
                        )}
                        {getAvailableIndices().filter(index => !selectedIndices.includes(index)).length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">All indices already selected</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading.index ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading index data...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSeasonalityData('index')}
                className="mt-2"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : selectedIndices.length > 0 ? (
            <div className="mt-4">
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <div className="min-w-[680px] px-4 sm:min-w-[800px] sm:px-0 mx-auto w-full">
                  {/* Header row */}
                  <div
                    className="mb-2 grid gap-2 w-full"
                    style={{ gridTemplateColumns: GRID_TEMPLATE }}
                  >
                    <div className="sticky left-0 z-20 bg-background text-xs font-medium text-muted-foreground"></div>
                    {months.map((month) => (
                      <div key={month} className="text-center">
                        <div className="text-xs font-medium text-muted-foreground">{month}</div>
                      </div>
                    ))}
                  </div>

                  {/* Data rows */}
                  {selectedIndices.map((index) => {
                    const currentData = getCurrentIndexData();
                    return currentData[index] && (
                      <div key={index} className="mb-2 grid gap-2" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                        <div className="sticky left-0 z-20 flex min-w-0 items-center bg-background pr-2 text-xs sm:text-sm font-medium text-card-foreground whitespace-normal break-words leading-snug">
                          <span className="mr-2">{index}</span>
                          <button
                            onClick={() => removeIndex(index)}
                            disabled={selectedIndices.length === 1}
                            className={`opacity-60 transition-opacity hover:opacity-100 ${selectedIndices.length === 1 ? 'cursor-not-allowed opacity-30' : ''}`}
                            title={selectedIndices.length === 1 ? 'Cannot remove last index' : `Remove ${index}`}
                            aria-label={`Remove ${index}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {currentData[index].map((monthData, monthIndex) => (
                          <div
                            key={monthIndex}
                            className="flex items-center justify-center rounded-md text-xs sm:text-sm font-medium transition-colors hover:opacity-80"
                            style={{
                              backgroundColor: getPerformanceColor(monthData.performance),
                              color: getTextColor(monthData.performance),
                              aspectRatio: '1 / 1',
                            }}
                          >
                            {monthData.performance.toFixed(1)}%
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No indices selected</p>
              <p className="text-sm">Click "Add Index" to add indices to compare</p>
            </div>
          )}
        </Card>
      )}

      {/* Sector Seasonality */}
      {showSector && (
        <Card className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold sm:text-lg">Sector Seasonality Heatmap</h3>
              <Badge variant="outline" className="text-xs">{selectedSectors.length} Sectors</Badge>
            </div>

            {/* Add Sector Section */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Available Sectors: {getAvailableSectors().length}
              </div>
              <div className="relative w-full sm:w-52" ref={sectorDropdownRef}>
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 transform text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search and add sectors..."
                    value={sectorSearchQuery}
                    onChange={(e) => {
                      setSectorSearchQuery(e.target.value);
                      setShowAddSector(true);
                      setSectorDropdownIndex(-1);
                    }}
                    onFocus={() => setShowAddSector(true)}
                    onKeyDown={handleSectorKeyDown}
                    className="h-9 w-full rounded-md border border-border bg-background pl-7 pr-3 text-xs transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Add Sector Dropdown */}
                {showAddSector && (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {sectorSearchQuery ? (
                      <>
                        {getFilteredSectors().slice(0, 8).map((sector, idx) => (
                          <button
                            key={sector}
                            onClick={() => addSector(sector)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${idx === sectorDropdownIndex ? 'bg-accent' : ''
                              }`}
                          >
                            <span className="font-medium">{sector}</span>
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ))}
                        {getFilteredSectors().length > 8 && (
                          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            + {getFilteredSectors().length - 8} more sectors. Continue typing to search...
                          </div>
                        )}
                        {getFilteredSectors().length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            {getAvailableSectors().filter(sector => !selectedSectors.includes(sector)).length === 0
                              ? 'All sectors already selected'
                              : 'No sectors found'
                            }
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {getAvailableSectors()
                          .filter(sector => !selectedSectors.includes(sector))
                          .slice(0, 8)
                          .map((sector, idx) => (
                            <button
                              key={sector}
                              onClick={() => addSector(sector)}
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${idx === sectorDropdownIndex ? 'bg-accent' : ''
                                }`}
                            >
                              <span className="font-medium">{sector}</span>
                              <Plus className="h-3 w-3 text-muted-foreground" />
                            </button>
                          ))}
                        {getAvailableSectors().filter(sector => !selectedSectors.includes(sector)).length > 8 && (
                          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            + {getAvailableSectors().filter(sector => !selectedSectors.includes(sector)).length - 8} more sectors. Type to search...
                          </div>
                        )}
                        {getAvailableSectors().filter(sector => !selectedSectors.includes(sector)).length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">All sectors already selected</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading.sector ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading sector data...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSeasonalityData('sector')}
                className="mt-2"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : selectedSectors.length > 0 ? (
            <div className="mt-4">
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <div className="min-w-[680px] px-4 sm:min-w-[800px] sm:px-0 mx-auto w-full">
                  {/* Header row */}
                  <div className="mb-2 grid gap-2 w-full" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                    <div className="sticky left-0 z-20 bg-background text-xs font-medium text-muted-foreground"></div>
                    {months.map((month) => (
                      <div key={month} className="text-center">
                        <div className="text-xs font-medium text-muted-foreground">{month}</div>
                      </div>
                    ))}
                  </div>

                  {/* Data rows */}
                  {selectedSectors.map((sector) => {
                    const currentData = getCurrentSectorData();
                    return currentData[sector] && (
                      <div
                        key={sector}
                        className="mb-2 grid gap-2"
                        style={{ gridTemplateColumns: GRID_TEMPLATE }}
                      >
                        <div className="sticky left-0 z-20 flex min-w-0 items-center bg-background pr-2 text-xs sm:text-sm font-medium text-card-foreground whitespace-normal break-words leading-snug">
                          <span className="mr-2">{sector}</span>
                          <button onClick={() => removeSector(sector)} className="opacity-60 transition-opacity hover:opacity-100" aria-label={`Remove ${sector}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {currentData[sector].map((monthData, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-center rounded-md text-xs sm:text-sm font-medium transition-colors hover:opacity-80"
                            style={{
                              backgroundColor: getPerformanceColor(monthData.performance),
                              color: getTextColor(monthData.performance),
                              aspectRatio: '1 / 1',
                            }}
                          >
                            {monthData.performance.toFixed(1)}%
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Plus className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>No sectors selected</p>
              <p className="text-sm">Click "Add Sector" to add sectors to compare</p>
            </div>
          )}
        </Card>
      )}

      {/* Stock Seasonality */}
      {showStock && (
        <Card className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold sm:text-lg">Stock Seasonality Heatmap</h3>
              <Badge variant="outline" className="text-xs">{selectedStocks.length} Stocks</Badge>
            </div>

            {/* Add Stock Section */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Available Stocks: {getAvailableStocks().length}
              </div>
              <div className="relative w-full sm:w-52" ref={dropdownRef}>
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 transform text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search and add stocks..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowAddStock(true);
                      setStockDropdownIndex(-1);
                    }}
                    onFocus={() => setShowAddStock(true)}
                    onKeyDown={handleStockKeyDown}
                    className="h-9 w-full rounded-md border border-border bg-background pl-7 pr-3 text-xs transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Add Stock Dropdown */}
                {showAddStock && (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {searchQuery ? (
                      <>
                        {getFilteredStocks().slice(0, 8).map((stock, idx) => (
                          <button
                            key={stock}
                            onClick={() => addStock(stock)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${idx === stockDropdownIndex ? 'bg-accent' : ''
                              }`}
                          >
                            <span className="font-medium">{stock}</span>
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ))}
                        {getFilteredStocks().length > 8 && (
                          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            + {getFilteredStocks().length - 8} more stocks. Continue typing to search...
                          </div>
                        )}
                        {getFilteredStocks().length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            {getAvailableStocks().filter(stock => !selectedStocks.includes(stock)).length === 0
                              ? 'All stocks already selected'
                              : 'No stocks found'
                            }
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {(() => {
                          const availableStocks = getAvailableStocks().filter(stock => !selectedStocks.includes(stock));
                          return (
                            <>
                              {availableStocks.slice(0, 8).map((stock, idx) => (
                                <button
                                  key={stock}
                                  onClick={() => addStock(stock)}
                                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${idx === stockDropdownIndex ? 'bg-accent' : ''
                                    }`}
                                >
                                  <span className="font-medium">{stock}</span>
                                  <Plus className="h-3 w-3 text-muted-foreground" />
                                </button>
                              ))}
                              {availableStocks.length > 8 && (
                                <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                                  + {availableStocks.length - 8} more stocks. Type to search...
                                </div>
                              )}
                              {availableStocks.length === 0 && (
                                <div className="px-3 py-2 text-sm text-muted-foreground">All stocks already selected</div>
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

          {/* Selected Stocks list removed; deletion handled on row labels */}

          {loading.stock ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading stock data...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSeasonalityData('stock')}
                className="mt-2"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : selectedStocks.length > 0 ? (
            <div className="mt-4 -mx-4 overflow-x-auto sm:mx-0">
              <div className="min-w-[680px] px-4 sm:min-w-[800px] sm:px-0 mx-auto w-full">
                {/* Header row */}
                <div
                  className="mb-2 grid gap-2 w-full"
                  style={{ gridTemplateColumns: GRID_TEMPLATE }}
                >
                  <div className="sticky left-0 z-20 bg-background text-xs font-medium text-muted-foreground"></div>
                  {months.map((month) => (
                    <div key={month} className="text-center">
                      <div className="text-xs font-medium text-muted-foreground">{month}</div>
                    </div>
                  ))}
                </div>

                {/* Data rows */}
                {selectedStocks.map((stock) => {
                  const currentData = getCurrentStockData();
                  return currentData[stock] && (
                    <div
                      key={stock}
                      className="mb-2 grid gap-2"
                      style={{ gridTemplateColumns: GRID_TEMPLATE }}
                    >
                      <div className="sticky left-0 z-20 flex min-w-0 items-center bg-background pr-2 text-xs sm:text-sm font-medium text-card-foreground whitespace-normal break-words leading-snug">
                        <span className="mr-2">{stock}</span>
                        <button onClick={() => removeStock(stock)} className="opacity-60 transition-opacity hover:opacity-100" aria-label={`Remove ${stock}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {currentData[stock].map((monthData, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-center rounded-md text-xs sm:text-sm font-medium transition-colors hover:opacity-80"
                          style={{
                            backgroundColor: getPerformanceColor(monthData.performance),
                            color: getTextColor(monthData.performance),
                            aspectRatio: '1 / 1',
                          }}
                        >
                          {monthData.performance.toFixed(1)}%
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No stocks selected</p>
              <p className="text-sm">Click "Add Stock" to add stocks to compare</p>
            </div>
          )}
        </Card>
      )}

      {/* Legend */}
      <Card className="p-4 sm:p-6">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Negative</span>
            <span>Neutral</span>
            <span>Positive</span>
          </div>
          <div className="h-3 w-full rounded-full bg-gradient-to-r from-[rgba(239,68,68,0.9)] via-[rgba(156,163,175,0.2)] to-[rgba(34,197,94,0.9)]" />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>-3% or less</span>
            <span>0%</span>
            <span>+3% or more</span>
          </div>
        </div>
      </Card>
    </div>
  );
}






