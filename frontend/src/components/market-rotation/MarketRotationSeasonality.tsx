import { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, Plus, TrendingUp, Search } from 'lucide-react';

interface MonthData {
  month: string;
  performance: number;
}

interface SeasonalityData {
  [key: string]: MonthData[];
}

// Sample seasonality data for sectors
const sectorSeasonalityData: SeasonalityData = {
  Technology: [
    { month: 'Jan', performance: 2.5 }, { month: 'Feb', performance: 1.8 }, { month: 'Mar', performance: -0.5 },
    { month: 'Apr', performance: 3.2 }, { month: 'May', performance: 1.1 }, { month: 'Jun', performance: -1.2 },
    { month: 'Jul', performance: 2.8 }, { month: 'Aug', performance: -0.8 }, { month: 'Sep', performance: 1.5 },
    { month: 'Oct', performance: -2.1 }, { month: 'Nov', performance: 3.5 }, { month: 'Dec', performance: 2.2 },
  ],
  Healthcare: [
    { month: 'Jan', performance: 1.2 }, { month: 'Feb', performance: 2.8 }, { month: 'Mar', performance: 1.5 },
    { month: 'Apr', performance: -1.1 }, { month: 'May', performance: 2.3 }, { month: 'Jun', performance: 0.8 },
    { month: 'Jul', performance: -0.5 }, { month: 'Aug', performance: 1.9 }, { month: 'Sep', performance: -1.8 },
    { month: 'Oct', performance: 2.6 }, { month: 'Nov', performance: 1.4 }, { month: 'Dec', performance: -0.3 },
  ],
  Finance: [
    { month: 'Jan', performance: -1.5 }, { month: 'Feb', performance: 0.8 }, { month: 'Mar', performance: 2.1 },
    { month: 'Apr', performance: 1.8 }, { month: 'May', performance: -0.9 }, { month: 'Jun', performance: 2.5 },
    { month: 'Jul', performance: -1.2 }, { month: 'Aug', performance: 1.6 }, { month: 'Sep', performance: 0.4 },
    { month: 'Oct', performance: 2.9 }, { month: 'Nov', performance: -1.8 }, { month: 'Dec', performance: 1.3 },
  ],
  Energy: [
    { month: 'Jan', performance: 3.1 }, { month: 'Feb', performance: -1.4 }, { month: 'Mar', performance: 2.8 },
    { month: 'Apr', performance: 1.2 }, { month: 'May', performance: 3.5 }, { month: 'Jun', performance: -2.1 },
    { month: 'Jul', performance: 1.8 }, { month: 'Aug', performance: 2.4 }, { month: 'Sep', performance: -1.6 },
    { month: 'Oct', performance: 0.9 }, { month: 'Nov', performance: 2.7 }, { month: 'Dec', performance: -0.8 },
  ],
  Consumer: [
    { month: 'Jan', performance: 0.5 }, { month: 'Feb', performance: 1.9 }, { month: 'Mar', performance: -1.1 },
    { month: 'Apr', performance: 2.3 }, { month: 'May', performance: 0.7 }, { month: 'Jun', performance: 1.8 },
    { month: 'Jul', performance: -0.9 }, { month: 'Aug', performance: 2.1 }, { month: 'Sep', performance: 1.4 },
    { month: 'Oct', performance: -1.5 }, { month: 'Nov', performance: 0.8 }, { month: 'Dec', performance: 2.6 },
  ],
};

// Sample seasonality data for stocks
const stockSeasonalityData: SeasonalityData = {
  BBRI: [
    { month: 'Jan', performance: 1.8 }, { month: 'Feb', performance: 2.5 }, { month: 'Mar', performance: -0.8 },
    { month: 'Apr', performance: 2.1 }, { month: 'May', performance: 1.4 }, { month: 'Jun', performance: -1.5 },
    { month: 'Jul', performance: 3.2 }, { month: 'Aug', performance: -0.6 }, { month: 'Sep', performance: 1.9 },
    { month: 'Oct', performance: -2.3 }, { month: 'Nov', performance: 2.8 }, { month: 'Dec', performance: 1.7 },
  ],
  BBCA: [
    { month: 'Jan', performance: -0.5 }, { month: 'Feb', performance: 1.2 }, { month: 'Mar', performance: 2.4 },
    { month: 'Apr', performance: 1.6 }, { month: 'May', performance: -1.1 }, { month: 'Jun', performance: 2.8 },
    { month: 'Jul', performance: -1.8 }, { month: 'Aug', performance: 2.3 }, { month: 'Sep', performance: 0.7 },
    { month: 'Oct', performance: 3.1 }, { month: 'Nov', performance: -1.4 }, { month: 'Dec', performance: 1.9 },
  ],
  BMRI: [
    { month: 'Jan', performance: 2.2 }, { month: 'Feb', performance: -1.3 }, { month: 'Mar', performance: 1.7 },
    { month: 'Apr', performance: 0.9 }, { month: 'May', performance: 2.6 }, { month: 'Jun', performance: -2.1 },
    { month: 'Jul', performance: 1.4 }, { month: 'Aug', performance: 1.8 }, { month: 'Sep', performance: -1.2 },
    { month: 'Oct', performance: 0.6 }, { month: 'Nov', performance: 2.4 }, { month: 'Dec', performance: -0.9 },
  ],
  TLKM: [
    { month: 'Jan', performance: -1.8 }, { month: 'Feb', performance: 0.4 }, { month: 'Mar', performance: 1.9 },
    { month: 'Apr', performance: 2.7 }, { month: 'May', performance: -0.6 }, { month: 'Jun', performance: 1.3 },
    { month: 'Jul', performance: -2.4 }, { month: 'Aug', performance: 2.1 }, { month: 'Sep', performance: 1.6 },
    { month: 'Oct', performance: -1.9 }, { month: 'Nov', performance: 0.8 }, { month: 'Dec', performance: 2.5 },
  ],
  ASII: [
    { month: 'Jan', performance: 3.2 }, { month: 'Feb', performance: 1.1 }, { month: 'Mar', performance: -1.4 },
    { month: 'Apr', performance: 1.8 }, { month: 'May', performance: 2.9 }, { month: 'Jun', performance: -0.7 },
    { month: 'Jul', performance: 0.5 }, { month: 'Aug', performance: 1.6 }, { month: 'Sep', performance: -2.2 },
    { month: 'Oct', performance: 2.3 }, { month: 'Nov', performance: 1.7 }, { month: 'Dec', performance: -1.1 },
  ],
};

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

// Index options
const indexOptions = [
  { name: 'COMPOSITE', color: '#000000' },
  { name: 'LQ45', color: '#374151' },
  { name: 'IDX30', color: '#4B5563' },
  { name: 'IDX80', color: '#6B7280' },
  { name: 'IDXQ30', color: '#9CA3AF' },
];

// Index seasonality data
const indexSeasonalityData: SeasonalityData = {
  COMPOSITE: [
    { month: 'Jan', performance: 1.5 }, { month: 'Feb', performance: 2.1 }, { month: 'Mar', performance: -0.8 },
    { month: 'Apr', performance: 2.4 }, { month: 'May', performance: 1.2 }, { month: 'Jun', performance: -1.6 },
    { month: 'Jul', performance: 2.8 }, { month: 'Aug', performance: -0.4 }, { month: 'Sep', performance: 1.7 },
    { month: 'Oct', performance: -2.2 }, { month: 'Nov', performance: 3.1 }, { month: 'Dec', performance: 1.9 },
  ],
  LQ45: [
    { month: 'Jan', performance: 1.8 }, { month: 'Feb', performance: 2.3 }, { month: 'Mar', performance: -0.6 },
    { month: 'Apr', performance: 2.7 }, { month: 'May', performance: 1.4 }, { month: 'Jun', performance: -1.4 },
    { month: 'Jul', performance: 3.1 }, { month: 'Aug', performance: -0.2 }, { month: 'Sep', performance: 1.9 },
    { month: 'Oct', performance: -2.0 }, { month: 'Nov', performance: 3.4 }, { month: 'Dec', performance: 2.1 },
  ],
  IDX30: [
    { month: 'Jan', performance: 1.2 }, { month: 'Feb', performance: 1.8 }, { month: 'Mar', performance: -1.1 },
    { month: 'Apr', performance: 2.1 }, { month: 'May', performance: 0.9 }, { month: 'Jun', performance: -1.8 },
    { month: 'Jul', performance: 2.5 }, { month: 'Aug', performance: -0.6 }, { month: 'Sep', performance: 1.5 },
    { month: 'Oct', performance: -2.4 }, { month: 'Nov', performance: 2.8 }, { month: 'Dec', performance: 1.7 },
  ],
  IDX80: [
    { month: 'Jan', performance: 1.7 }, { month: 'Feb', performance: 2.4 }, { month: 'Mar', performance: -0.4 },
    { month: 'Apr', performance: 2.9 }, { month: 'May', performance: 1.6 }, { month: 'Jun', performance: -1.2 },
    { month: 'Jul', performance: 3.3 }, { month: 'Aug', performance: 0.1 }, { month: 'Sep', performance: 2.2 },
    { month: 'Oct', performance: -1.8 }, { month: 'Nov', performance: 3.6 }, { month: 'Dec', performance: 2.3 },
  ],
  IDXQ30: [
    { month: 'Jan', performance: 1.3 }, { month: 'Feb', performance: 1.9 }, { month: 'Mar', performance: -0.9 },
    { month: 'Apr', performance: 2.2 }, { month: 'May', performance: 1.0 }, { month: 'Jun', performance: -1.7 },
    { month: 'Jul', performance: 2.6 }, { month: 'Aug', performance: -0.5 }, { month: 'Sep', performance: 1.6 },
    { month: 'Oct', performance: -2.3 }, { month: 'Nov', performance: 2.9 }, { month: 'Dec', performance: 1.8 },
  ],
};

// Available stocks for selection - extended list
const availableStocks = [
  'BBRI', 'BBCA', 'BMRI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INTP', 'KLBF', 
  'SMGR', 'PGAS', 'JSMR', 'EXCL', 'INDF', 'ANTM', 'INCO', 'ITMG', 'PTBA', 'GOTO',
  'AMMN', 'BYAN', 'ADRO', 'TINS', 'HMSP', 'SIDO', 'MNCN', 'TOWR', 'EMTK', 'FREN',
  'ISAT', 'LPKR', 'PWON', 'PNBN', 'MEGA', 'WSKT', 'WIKA'
];

export function MarketRotationSeasonality() {
  const [showIndex, setShowIndex] = useState(true);
  const [showSector, setShowSector] = useState(true);
  const [showStock, setShowStock] = useState(true);
  const [selectedIndices, setSelectedIndices] = useState(['COMPOSITE']);
  const [selectedSectors, setSelectedSectors] = useState(['Technology', 'Healthcare', 'Finance']);
  const [selectedStocks, setSelectedStocks] = useState(['BBRI', 'BBCA', 'BMRI']);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddIndex, setShowAddIndex] = useState(false);
  const [showAddSector, setShowAddSector] = useState(false);
  const [highlightedIndexIdx, setHighlightedIndexIdx] = useState<number>(-1);
  const [highlightedSectorIdx, setHighlightedSectorIdx] = useState<number>(-1);
  const [highlightedStockIdx, setHighlightedStockIdx] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const [sectorSearchQuery, setSectorSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const indexDropdownRef = useRef<HTMLDivElement>(null);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);

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
  };

  const getFilteredIndices = () => {
    return indexOptions.filter(index => 
      index.name.toLowerCase().includes(indexSearchQuery.toLowerCase()) &&
      !selectedIndices.includes(index.name)
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
  };

  const getFilteredSectors = () => {
    return Object.keys(sectorSeasonalityData).filter(sector => 
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
  };

  const getFilteredStocks = () => {
    return availableStocks.filter(stock => 
      stock.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedStocks.includes(stock)
    );
  };

  const removeStock = (stock: string) => {
    setSelectedStocks(selectedStocks.filter(s => s !== stock));
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
      {/* Display Options */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Display Options:</span>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Index toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showIndex}
                onChange={(e) => setShowIndex(e.target.checked)}
                className="w-4 h-4 text-primary bg-background border border-border rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
              />
              <span className="text-sm font-medium">Index</span>
            </label>
            
            {/* Sector toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSector}
                onChange={(e) => setShowSector(e.target.checked)}
                className="w-4 h-4 text-primary bg-background border border-border rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
              />
              <span className="text-sm font-medium">Sector</span>
            </label>
            
            {/* Stock toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showStock}
                onChange={(e) => setShowStock(e.target.checked)}
                className="w-4 h-4 text-primary bg-background border border-border rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
              />
              <span className="text-sm font-medium">Saham</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Index Seasonality */}
      {showIndex && (
        <Card className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold sm:text-lg">Index Seasonality Pattern</h3>
              <Badge variant="outline" className="text-xs">{selectedIndices.length} Indices</Badge>
            </div>

            {/* Add Index Section */}
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {/* Search Input */}
              <div className="relative w-full sm:w-48" role="combobox" aria-expanded={showAddIndex} aria-controls="add-index-list" aria-autocomplete="list">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 transform text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search indices..."
                  value={indexSearchQuery}
                  onChange={(e) => {
                    setIndexSearchQuery(e.target.value);
                    setShowAddIndex(true);
                  }}
                  onFocus={() => setShowAddIndex(true)}
                  onKeyDown={(e) => { const suggestions = (indexSearchQuery ? getFilteredIndices().map(i=>i.name) : indexOptions.filter(i=>!selectedIndices.includes(i.name)).map(i=>i.name)).slice(0,10); if (!suggestions.length) return; if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndexIdx((prev) => (prev + 1) % suggestions.length); } else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndexIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length); } else if (e.key === "Enter" && showAddIndex) { e.preventDefault(); const idx = highlightedIndexIdx >= 0 ? highlightedIndexIdx : 0; const choice = suggestions[idx]; if (choice) addIndex(choice); } else if (e.key === "Escape") { setShowAddIndex(false); setHighlightedIndexIdx(-1); } }} className="h-9 w-full rounded-md border border-border bg-background pl-7 pr-3 text-xs transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Add Index Button */}
              <div className="relative w-full sm:w-auto" ref={indexDropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddIndex(!showAddIndex)}
                  className="flex h-9 w-full items-center justify-center gap-2 hover:bg-primary/10 hover:text-primary transition-colors sm:w-auto"
                >
                  <Plus className="h-3 w-3" />
                  Add Index
                </Button>

                {/* Add Index Dropdown */}
                {showAddIndex && (
                  <div id="add-index-list" role="listbox" className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full sm:w-52 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {/* Show search results if there's a query, otherwise show all available */}
                    {indexSearchQuery ? (
                      <>
                        {getFilteredIndices().map(index => (
                          <button
                            key={index.name}
                            onClick={() => addIndex(index.name)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between"
                          >
                            <span className="font-medium">{index.name}</span>
                            <Plus className="w-3 h-3 text-muted-foreground" />
                          </button>
                        ))}
                        {getFilteredIndices().length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No indices found matching "{indexSearchQuery}"
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {indexOptions
                          .filter(index => !selectedIndices.includes(index.name))
                          .map(index => (
                            <button
                              key={index.name}
                              onClick={() => addIndex(index.name)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between"
                            >
                              {index.name}
                              <Plus className="w-3 h-3 text-muted-foreground" />
                            </button>
                          ))}
                        {indexOptions.filter(index => !selectedIndices.includes(index.name)).length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No more indices available</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {selectedIndices.length > 0 ? (
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
                  {selectedIndices.map((index) => (
                    indexSeasonalityData[index] && (
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
                        {indexSeasonalityData[index].map((monthData, monthIndex) => (
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
                    )
                  ))}
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
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {/* Search Input */}
              <div className="relative w-full sm:w-52">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 transform text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search sectors..."
                  value={sectorSearchQuery}
                  onChange={(e) => {
                    setSectorSearchQuery(e.target.value);
                    setShowAddSector(true);
                  }}
                  onFocus={() => setShowAddSector(true)}
                  className="h-9 w-full rounded-md border border-border bg-background pl-7 pr-3 text-xs transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Add Sector Button */}
              <div className="relative w-full sm:w-auto" ref={sectorDropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddSector(!showAddSector)}
                  className="flex h-9 w-full items-center justify-center gap-2 hover:bg-primary/10 hover:text-primary transition-colors sm:w-auto"
                >
                  <Plus className="h-3 w-3" />
                  Add Sector
                </Button>

                {/* Add Sector Dropdown */}
                {showAddSector && (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full sm:w-52 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {/* Show search results if there's a query, otherwise show all available */}
                    {sectorSearchQuery ? (
                      <>
                        {getFilteredSectors().map(sector => (
                          <button
                            key={sector}
                            onClick={() => addSector(sector)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                          >
                            <span className="font-medium">{sector}</span>
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ))}
                        {getFilteredSectors().length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No sectors found matching "{sectorSearchQuery}"
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {Object.keys(sectorSeasonalityData)
                          .filter(sector => !selectedSectors.includes(sector))
                          .map(sector => (
                            <button
                              key={sector}
                              onClick={() => addSector(sector)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              {sector}
                              <Plus className="h-3 w-3 text-muted-foreground" />
                            </button>
                          ))}
                        {Object.keys(sectorSeasonalityData).filter(sector => !selectedSectors.includes(sector)).length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No more sectors available</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {selectedSectors.length > 0 ? (
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
                  {selectedSectors.map((sector) => (
                    sectorSeasonalityData[sector] && (
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
                        {sectorSeasonalityData[sector].map((monthData, index) => (
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
                    )
                  ))}
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
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {/* Search Input */}
              <div className="relative w-full sm:w-52">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 transform text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search stocks..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowAddStock(true);
                  }}
                  onFocus={() => setShowAddStock(true)}
                  className="h-9 w-full rounded-md border border-border bg-background pl-7 pr-3 text-xs transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Add Stock Button */}
              <div className="relative w-full sm:w-auto" ref={dropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddStock(!showAddStock)}
                  className="flex h-9 w-full items-center justify-center gap-2 hover:bg-primary/10 hover:text-primary transition-colors sm:w-auto"
                >
                  <Plus className="h-3 w-3" />
                  Add Stock
                </Button>

                {/* Add Stock Dropdown */}
                {showAddStock && (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full sm:w-52 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {/* Show search results if there's a query, otherwise show all available */}
                    {searchQuery ? (
                      <>
                        {getFilteredStocks().map(stock => (
                          <button
                            key={stock}
                            onClick={() => addStock(stock)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                          >
                            <span className="font-medium">{stock}</span>
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ))}
                        {getFilteredStocks().length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No stocks found matching "{searchQuery}"
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {availableStocks
                          .filter(stock => !selectedStocks.includes(stock))
                          .slice(0, 8) // Show only first 8 for performance
                          .map(stock => (
                            <button
                              key={stock}
                              onClick={() => addStock(stock)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              {stock}
                              <Plus className="h-3 w-3 text-muted-foreground" />
                            </button>
                          ))}
                        {availableStocks.filter(stock => !selectedStocks.includes(stock)).length > 8 && (
                          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            + {availableStocks.filter(stock => !selectedStocks.includes(stock)).length - 8} more stocks. Use search to find specific stocks.
                          </div>
                        )}
                        {availableStocks.filter(stock => !selectedStocks.includes(stock)).length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No more stocks available</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selected Stocks list removed; deletion handled on row labels */}

          {selectedStocks.length > 0 && (
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
                {selectedStocks.map((stock) => (
                  stockSeasonalityData[stock] && (
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
                      {stockSeasonalityData[stock].map((monthData, index) => (
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
                  )
                ))}
              </div>
            </div>
          )}

          {selectedStocks.length === 0 && (
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






