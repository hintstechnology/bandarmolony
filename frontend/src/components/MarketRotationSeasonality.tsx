import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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
  const [showSector, setShowSector] = useState(true);
  const [showStock, setShowStock] = useState(true);
  const [selectedIndices, setSelectedIndices] = useState(['COMPOSITE']);
  const [selectedStocks, setSelectedStocks] = useState(['BBRI', 'BBCA', 'BMRI']);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddIndex, setShowAddIndex] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const indexDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAddStock(false);
      }
      if (indexDropdownRef.current && !indexDropdownRef.current.contains(event.target as Node)) {
        setShowAddIndex(false);
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

  const getSelectedStockData = () => {
    const result: SeasonalityData = {};
    selectedStocks.forEach(stock => {
      if (stockSeasonalityData[stock]) {
        result[stock] = stockSeasonalityData[stock];
      }
    });
    return result;
  };

  return (
    <div className="space-y-6">
      {/* Display Options */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Display Options:</span>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Index - Always enabled */}
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-primary rounded flex items-center justify-center">
                <div className="w-2 h-2 bg-primary-foreground rounded"></div>
              </div>
              <span className="text-sm font-medium">Index</span>
              <Badge variant="secondary" className="text-xs">Required</Badge>
            </div>
            
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

      {/* Index Seasonality - Always shown */}
      <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Index Seasonality Pattern</h3>
              <Badge variant="outline" className="text-xs">{selectedIndices.length} Indices</Badge>
            </div>
            
            {/* Add Index Section */}
            <div className="flex items-center gap-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search indices..."
                  value={indexSearchQuery}
                  onChange={(e) => {
                    setIndexSearchQuery(e.target.value);
                    setShowAddIndex(true);
                  }}
                  onFocus={() => setShowAddIndex(true)}
                  className="pl-7 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 w-32 hover:border-primary/50 transition-colors"
                />
              </div>
              
              {/* Add Index Button */}
              <div className="relative" ref={indexDropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddIndex(!showAddIndex)}
                  className="flex items-center gap-2 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Index
                </Button>
                
                {/* Add Index Dropdown */}
                {showAddIndex && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
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

          {/* Selected Indices */}
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedIndices.map(index => (
              <div key={index} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs">
                {index}
                <button
                  onClick={() => removeIndex(index)}
                  disabled={selectedIndices.length === 1}
                  className={`text-muted-foreground hover:text-destructive transition-colors ${
                    selectedIndices.length === 1 ? 'opacity-30 cursor-not-allowed' : ''
                  }`}
                  title={selectedIndices.length === 1 ? 'Cannot remove last index' : `Remove ${index}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {selectedIndices.length > 0 && (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header row */}
                <div className="grid grid-cols-13 gap-2 mb-2">
                  <div className="text-xs font-medium text-muted-foreground"></div>
                  {months.map((month) => (
                    <div key={month} className="text-center">
                      <div className="text-xs font-medium text-muted-foreground">{month}</div>
                    </div>
                  ))}
                </div>
                
                {/* Data rows */}
                {selectedIndices.map((index) => (
                  indexSeasonalityData[index] && (
                    <div key={index} className="grid grid-cols-13 gap-2 mb-2">
                      <div className="flex items-center text-sm font-medium text-card-foreground">
                        {index}
                      </div>
                      {indexSeasonalityData[index].map((monthData, monthIndex) => (
                        <div 
                          key={monthIndex}
                          className="h-16 rounded-md flex items-center justify-center text-sm font-medium transition-colors hover:opacity-80"
                          style={{ 
                            backgroundColor: getPerformanceColor(monthData.performance),
                            color: getTextColor(monthData.performance)
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

          {selectedIndices.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No indices selected</p>
              <p className="text-sm">Click "Add Index" to add indices to compare</p>
            </div>
          )}
        </Card>

      {/* Sector Seasonality */}
      {showSector && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold">Sector Seasonality Heatmap</h3>
            <Badge variant="outline" className="text-xs">{Object.keys(sectorSeasonalityData).length} Sectors</Badge>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header row */}
              <div className="grid grid-cols-13 gap-2 mb-2">
                <div className="text-xs font-medium text-muted-foreground"></div>
                {months.map((month) => (
                  <div key={month} className="text-center">
                    <div className="text-xs font-medium text-muted-foreground">{month}</div>
                  </div>
                ))}
              </div>
              
              {/* Data rows */}
              {Object.keys(sectorSeasonalityData).map((sector) => (
                <div key={sector} className="grid grid-cols-13 gap-2 mb-2">
                  <div className="flex items-center text-sm font-medium text-card-foreground">
                    {sector}
                  </div>
                  {sectorSeasonalityData[sector].map((monthData, index) => (
                    <div 
                      key={index}
                      className="h-16 rounded-md flex items-center justify-center text-sm font-medium transition-colors hover:opacity-80"
                      style={{ 
                        backgroundColor: getPerformanceColor(monthData.performance),
                        color: getTextColor(monthData.performance)
                      }}
                    >
                      {monthData.performance.toFixed(1)}%
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Stock Seasonality */}
      {showStock && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Stock Seasonality Heatmap</h3>
              <Badge variant="outline" className="text-xs">{selectedStocks.length} Stocks</Badge>
            </div>
            
            {/* Add Stock Section */}
            <div className="flex items-center gap-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search stocks..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowAddStock(true);
                  }}
                  onFocus={() => setShowAddStock(true)}
                  className="pl-7 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 w-32 hover:border-primary/50 transition-colors"
                />
              </div>
              
              {/* Add Stock Button */}
              <div className="relative" ref={dropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddStock(!showAddStock)}
                  className="flex items-center gap-2 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Stock
                </Button>
                
                {/* Add Stock Dropdown */}
                {showAddStock && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {/* Show search results if there's a query, otherwise show all available */}
                    {searchQuery ? (
                      <>
                        {getFilteredStocks().map(stock => (
                          <button
                            key={stock}
                            onClick={() => addStock(stock)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between"
                          >
                            <span className="font-medium">{stock}</span>
                            <Plus className="w-3 h-3 text-muted-foreground" />
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
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between"
                            >
                              {stock}
                              <Plus className="w-3 h-3 text-muted-foreground" />
                            </button>
                          ))}
                        {availableStocks.filter(stock => !selectedStocks.includes(stock)).length > 8 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
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

          {/* Selected Stocks */}
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedStocks.map(stock => (
              <div key={stock} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs">
                {stock}
                <button
                  onClick={() => removeStock(stock)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {selectedStocks.length > 0 && (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header row */}
                <div className="grid grid-cols-13 gap-2 mb-2">
                  <div className="text-xs font-medium text-muted-foreground"></div>
                  {months.map((month) => (
                    <div key={month} className="text-center">
                      <div className="text-xs font-medium text-muted-foreground">{month}</div>
                    </div>
                  ))}
                </div>
                
                {/* Data rows */}
                {selectedStocks.map((stock) => (
                  stockSeasonalityData[stock] && (
                    <div key={stock} className="grid grid-cols-13 gap-2 mb-2">
                      <div className="flex items-center text-sm font-medium text-card-foreground">
                        {stock}
                      </div>
                      {stockSeasonalityData[stock].map((monthData, index) => (
                        <div 
                          key={index}
                          className="h-16 rounded-md flex items-center justify-center text-sm font-medium transition-colors hover:opacity-80"
                          style={{ 
                            backgroundColor: getPerformanceColor(monthData.performance),
                            color: getTextColor(monthData.performance)
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
      <Card className="p-4">
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.8)' }}></div>
            <span className="text-muted-foreground">Negative Performance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(156, 163, 175, 0.2)' }}></div>
            <span className="text-muted-foreground">Neutral</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.8)' }}></div>
            <span className="text-muted-foreground">Positive Performance</span>
          </div>
        </div>
      </Card>
    </div>
  );
}