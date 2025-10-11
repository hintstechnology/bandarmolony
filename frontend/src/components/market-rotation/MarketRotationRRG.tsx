import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Line } from 'recharts';
import { X, Search, Plus } from 'lucide-react';

// Type definition for trajectory data
interface TrajectoryPoint {
  point: number;
  rsRatio: number;
  rsMomentum: number;
  color: string;
  name: string;
  isLatest: boolean;
  fill: string;
  stroke: string;
  radius: number;
}

// Optimized trajectory data generation with memoization
const generateTrajectoryData = (
  baseRsRatio: number,
  baseRsMomentum: number,
  color: string,
  name: string,
  seed: number = 0
): TrajectoryPoint[] => {
  const points: TrajectoryPoint[] = [];
  // Use seed for consistent data generation
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  for (let i = 0; i < 6; i++) { // Reduced from 10 to 6 points for better performance
    const seedValue = seed + i;
    const rsRatioVariation = (random(seedValue) - 0.5) * 6; // ±3 range (reduced)
    const rsMomentumVariation = (random(seedValue + 1000) - 0.5) * 6; // ±3 range (reduced)

    points.push({
      point: i + 1,
      rsRatio: baseRsRatio + rsRatioVariation + i * 0.15, // Slight trend
      rsMomentum: baseRsMomentum + rsMomentumVariation + i * 0.08, // Slight trend
      color,
      name,
      isLatest: i === 5, // Updated for 6 points
      fill: color,
      stroke: color,
      radius: i === 5 ? 12 : 1 // Reduced size
    });
  }
  return points;
};


// Sample RRG data with trajectories - matching RRC sectors
const sectorData = [
  { name: 'Technology', rsRatio: 102.5, rsMomentum: 101.8, performance: 2.5, color: '#3B82F6' },
  { name: 'Healthcare', rsRatio: 98.2, rsMomentum: 104.2, performance: 1.8, color: '#10B981' },
  { name: 'Finance', rsRatio: 95.8, rsMomentum: 96.5, performance: -1.2, color: '#EF4444' },
  { name: 'Energy', rsRatio: 106.3, rsMomentum: 99.2, performance: 3.1, color: '#F59E0B' },
  { name: 'Consumer', rsRatio: 99.5, rsMomentum: 102.1, performance: 0.8, color: '#8B5CF6' },
  { name: 'Industrial', rsRatio: 101.2, rsMomentum: 98.7, performance: 1.2, color: '#06B6D4' },
  { name: 'Materials', rsRatio: 97.8, rsMomentum: 100.5, performance: -0.5, color: '#84CC16' },
];

const stockData = [
  { name: 'BBRI', rsRatio: 103.2, rsMomentum: 102.5, performance: 2.8, color: '#3B82F6' },
  { name: 'BBCA', rsRatio: 98.5, rsMomentum: 99.2, performance: -0.5, color: '#EF4444' },
  { name: 'BMRI', rsRatio: 101.8, rsMomentum: 103.1, performance: 1.9, color: '#10B981' },
  { name: 'TLKM', rsRatio: 96.2, rsMomentum: 97.8, performance: -1.8, color: '#F59E0B' },
  { name: 'ASII', rsRatio: 104.5, rsMomentum: 101.2, performance: 3.2, color: '#8B5CF6' },
  { name: 'UNVR', rsRatio: 99.8, rsMomentum: 100.5, performance: 0.3, color: '#06B6D4' },
];

// Memoized trajectory data generation - only generate when needed
const generateTrajectoryDataMemo = (() => {
  const cache = new Map<string, TrajectoryPoint[]>();
  
  return (data: any[], type: 'stock' | 'sector') => {
    const cacheKey = `${type}-${data.length}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }
    
    const trajectoryData = data.map((item, index) => 
      generateTrajectoryData(item.rsRatio, item.rsMomentum, item.color, item.name, index)
    ).flat();
    
    cache.set(cacheKey, trajectoryData);
    return trajectoryData;
  };
})();

// Sector options - matching RRC
const sectorOptions = [
  { name: 'Technology', color: '#3B82F6' },
  { name: 'Healthcare', color: '#10B981' },
  { name: 'Finance', color: '#EF4444' },
  { name: 'Energy', color: '#F59E0B' },
  { name: 'Consumer', color: '#8B5CF6' },
  { name: 'Industrial', color: '#06B6D4' },
  { name: 'Materials', color: '#84CC16' },
];

// Index options
const indexOptions = [
  { name: 'COMPOSITE', color: '#000000' },
  { name: 'LQ45', color: '#374151' },
  { name: 'IDX30', color: '#4B5563' },
  { name: 'IDX80', color: '#6B7280' },
  { name: 'IDXQ30', color: '#9CA3AF' },
];

// Stock options for search
const stockOptions = [
  { name: 'BBRI', color: '#3B82F6' },
  { name: 'BBCA', color: '#EF4444' },
  { name: 'BMRI', color: '#10B981' },
  { name: 'TLKM', color: '#F59E0B' },
  { name: 'ASII', color: '#8B5CF6' },
  { name: 'UNVR', color: '#06B6D4' },
  { name: 'GGRM', color: '#84CC16' },
  { name: 'ICBP', color: '#EC4899' },
  { name: 'INTP', color: '#F97316' },
  { name: 'KLBF', color: '#6366F1' },
  { name: 'SMGR', color: '#14B8A6' },
  { name: 'PGAS', color: '#DC2626' },
  { name: 'JSMR', color: '#7C3AED' },
  { name: 'EXCL', color: '#059669' },
  { name: 'INDF', color: '#DB2777' },
  { name: 'ANTM', color: '#D97706' },
  { name: 'INCO', color: '#2563EB' },
  { name: 'ITMG', color: '#DC2626' },
  { name: 'PTBA', color: '#16A34A' },
  { name: 'GOTO', color: '#9333EA' },
];

// Dashboard screener data
const screenerData = [
  { symbol: 'BBRI', sector: 'Finance', rsRatio: 103.2, rsMomentum: 102.5, performance: 2.8, volume: 'HIGH', trend: 'STRONG' },
  { symbol: 'ASII', sector: 'Industrial', rsRatio: 104.5, rsMomentum: 101.2, performance: 3.2, volume: 'HIGH', trend: 'STRONG' },
  { symbol: 'BMRI', sector: 'Finance', rsRatio: 101.8, rsMomentum: 103.1, performance: 1.9, volume: 'MEDIUM', trend: 'IMPROVING' },
  { symbol: 'UNVR', sector: 'Consumer', rsRatio: 99.8, rsMomentum: 100.5, performance: 0.3, volume: 'MEDIUM', trend: 'WEAKENING' },
  { symbol: 'TLKM', sector: 'Technology', rsRatio: 96.2, rsMomentum: 97.8, performance: -1.8, volume: 'LOW', trend: 'WEAK' },
  { symbol: 'BBCA', sector: 'Finance', rsRatio: 98.5, rsMomentum: 99.2, performance: -0.5, volume: 'MEDIUM', trend: 'WEAK' },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-card-foreground">{data.name}</p>
        <p className="text-sm text-muted-foreground">RS-Ratio: {data.rsRatio?.toFixed(2) || data.rsRatio}</p>
        <p className="text-sm text-muted-foreground">RS-Momentum: {data.rsMomentum?.toFixed(2) || data.rsMomentum}</p>
        {data.performance && (
          <p className="text-sm text-muted-foreground">Performance: {data.performance}%</p>
        )}
        {data.point && (
          <p className="text-sm text-muted-foreground">Point: {data.point}/10</p>
        )}
      </div>
    );
  }
  return null;
};

const MarketRotationRRG = memo(function MarketRotationRRG() {
  const [viewMode, setViewMode] = useState<'sector' | 'stock'>('sector');
  const [selectedIndex, setSelectedIndex] = useState<string>('COMPOSITE');
  const [selectedItems, setSelectedItems] = useState<string[]>(['Technology', 'Healthcare', 'Finance']);
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const [screenerSearchQuery, setScreenerSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showIndexSearchDropdown, setShowIndexSearchDropdown] = useState(false);
  const [showScreenerSearchDropdown, setShowScreenerSearchDropdown] = useState(false);
  const [screenerStocks, setScreenerStocks] = useState(screenerData);
  const searchRef = useRef<HTMLDivElement>(null);
  const indexSearchRef = useRef<HTMLDivElement>(null);
  const screenerSearchRef = useRef<HTMLDivElement>(null);

  // Memoized data calculations
  const currentData = useMemo(() => 
    viewMode === 'sector' ? sectorData : stockData, 
    [viewMode]
  );

  const currentOptions = useMemo(() => 
    viewMode === 'sector' ? sectorOptions : stockOptions,
    [viewMode]
  );

  // Memoized trajectory data - only generate when selectedItems change
  const filteredTrajectoryData = useMemo(() => {
    const trajectoryData = generateTrajectoryDataMemo(currentData, viewMode);
    return trajectoryData.filter(point => selectedItems.includes(point.name));
  }, [selectedItems, viewMode, currentData]);

  // Lazy loading state for chart
  const [isChartLoaded, setIsChartLoaded] = useState(false);

  useEffect(() => {
    // Delay chart rendering to improve initial load performance
    const timer = setTimeout(() => {
      setIsChartLoaded(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedItems, viewMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (indexSearchRef.current && !indexSearchRef.current.contains(event.target as Node)) {
        setShowIndexSearchDropdown(false);
      }
      if (screenerSearchRef.current && !screenerSearchRef.current.contains(event.target as Node)) {
        setShowScreenerSearchDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Removed old data calculations - now using memoized versions above

  // Memoized functions to prevent unnecessary re-renders
  const getBadgeVariant = useCallback((trend: string) => {
    switch (trend) {
      case 'STRONG': return 'default';
      case 'IMPROVING': return 'secondary';
      case 'WEAKENING': return 'outline';
      case 'WEAK': return 'destructive';
      default: return 'secondary';
    }
  }, []);

  const toggleItem = useCallback((itemName: string) => {
    setSelectedItems(prev => 
      prev.includes(itemName) 
        ? prev.filter(item => item !== itemName)
        : [...prev, itemName]
    );
  }, []);

  const removeItem = useCallback((itemName: string) => {
    setSelectedItems(prev => {
      const newItems = prev.filter(item => item !== itemName);
      return newItems.length > 0 ? newItems : prev;
    });
  }, []);

  const handleViewModeChange = useCallback((mode: 'sector' | 'stock') => {
    setViewMode(mode);
    setSearchQuery('');
    setIndexSearchQuery('');
    setShowSearchDropdown(false);
    setShowIndexSearchDropdown(false);
    if (mode === 'sector') {
      setSelectedItems(['Technology', 'Healthcare', 'Finance']);
    } else {
      setSelectedItems(['BBRI', 'BBCA', 'BMRI']);
    }
  }, []);

  // Memoized filter functions
  const getFilteredOptions = useMemo(() => {
    if (viewMode === 'sector') return currentOptions;
    
    return currentOptions.filter(option => 
      option.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedItems.includes(option.name)
    );
  }, [viewMode, currentOptions, searchQuery, selectedItems]);

  const getFilteredIndexOptions = useMemo(() => {
    return indexOptions.filter(option => 
      option.name.toLowerCase().includes(indexSearchQuery.toLowerCase())
    );
  }, [indexSearchQuery]);

  const getFilteredScreenerOptions = useMemo(() => {
    return stockOptions.filter(option => 
      option.name.toLowerCase().includes(screenerSearchQuery.toLowerCase()) &&
      !screenerStocks.some(stock => stock.symbol === option.name)
    );
  }, [screenerSearchQuery, screenerStocks]);

  const addFromSearch = useCallback((itemName: string) => {
    if (!selectedItems.includes(itemName)) {
      setSelectedItems(prev => [...prev, itemName]);
    }
    setSearchQuery('');
    setShowSearchDropdown(false);
  }, [selectedItems]);

  const addToScreener = useCallback((stockName: string) => {
    const stockOption = stockOptions.find(opt => opt.name === stockName);
    if (stockOption && !screenerStocks.some(stock => stock.symbol === stockName)) {
      const newStock = {
        symbol: stockName,
        sector: 'Unknown',
        rsRatio: Math.random() * 20 + 90,
        rsMomentum: Math.random() * 20 + 90,
        performance: (Math.random() - 0.5) * 10,
        volume: ['HIGH', 'MEDIUM', 'LOW'][Math.floor(Math.random() * 3)] || 'MEDIUM',
        trend: ['STRONG', 'IMPROVING', 'WEAKENING', 'WEAK'][Math.floor(Math.random() * 4)] || 'IMPROVING'
      };
      setScreenerStocks(prev => [...prev, newStock]);
    }
    setScreenerSearchQuery('');
    setShowScreenerSearchDropdown(false);
  }, [screenerStocks]);

  const removeFromScreener = useCallback((symbol: string) => {
    setScreenerStocks(prev => prev.filter(stock => stock.symbol !== symbol));
  }, []);

  const selectIndex = useCallback((indexName: string) => {
    setSelectedIndex(indexName);
    setIndexSearchQuery('');
    setShowIndexSearchDropdown(false);
  }, []);

  return (
    <div className="h-screen overflow-hidden">
      <div className="h-full flex flex-col max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 py-4 sm:py-6">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">View Mode:</span>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'sector' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleViewModeChange('sector')}
          >
            Sector
          </Button>
          <Button
            variant={viewMode === 'stock' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleViewModeChange('stock')}
          >
            Stock
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* RRG Chart */}
        <div className="xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Relative Rotation Graph (RRG) vs {selectedIndex}</CardTitle>
            </CardHeader>
            <CardContent className="relative">
              {!isChartLoaded ? (
                <div className="flex items-center justify-center h-[600px]">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading chart...</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={600}>
                  <ComposedChart data={filteredTrajectoryData} margin={{ bottom: 50, left: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                  <XAxis 
                    type="number" 
                    dataKey="rsRatio" 
                    domain={[90, 110]}
                    name="RS-Ratio"
                    label={{ value: 'RS-Ratio', position: 'insideBottom', offset: -20 }}
                    stroke="hsl(var(--foreground))"
                    tick={{ fill: 'hsl(var(--foreground))' }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="rsMomentum" 
                    domain={[90, 110]}
                    name="RS-Momentum"
                    label={{ value: 'RS-Momentum', angle: -90, position: 'insideLeft' }}
                    stroke="hsl(var(--foreground))"
                    tick={{ fill: 'hsl(var(--foreground))' }}
                  />
                  <ReferenceLine x={100} stroke="hsl(var(--foreground))" strokeDasharray="2 2" />
                  <ReferenceLine y={100} stroke="hsl(var(--foreground))" strokeDasharray="2 2" />
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* Optimized trajectory rendering - single Scatter with all data */}
                  <Scatter 
                    dataKey="rsMomentum" 
                    fill="#8884d8"
                    data={filteredTrajectoryData}
                  >
                    {filteredTrajectoryData.map((point, index) => (
                      <Scatter 
                        key={`${point.name}-${index}`} 
                        fill={point.fill}
                        stroke={point.stroke}
                        fillOpacity={0.8}
                        strokeOpacity={0.8}
                        r={point.radius}
                      />
                    ))}
                  </Scatter>
                  
                  {/* Simplified trajectory lines - only for selected items */}
                  {selectedItems.slice(0, 3).map((itemName) => {
                    const itemOption = currentOptions.find(opt => opt.name === itemName);
                    const itemTrajectory = filteredTrajectoryData.filter(point => point.name === itemName);
                    
                    return (
                      <Line
                        key={`line-${itemName}`}
                        type="monotone"
                        dataKey="rsMomentum"
                        stroke={itemOption?.color || '#6B7280'}
                        strokeWidth={1.5}
                        dot={false}
                        data={itemTrajectory}
                        connectNulls={false}
                        strokeOpacity={0.7}
                      />
                    );
                  })}
                  
                  {/* Add benchmark point at center (100, 100) */}
                  <Scatter 
                    dataKey="rsMomentum" 
                    fill="#000000"
                    data={[{ rsRatio: 100, rsMomentum: 100 }]}
                    r={8} 
                  />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              
              {/* Quadrant Labels positioned based on chart corners */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Top Left - Improving */}
                <div className="absolute top-[8%] left-[15%]">
                  <span className="text-blue-600 font-bold text-lg bg-background/80 px-3 py-2 rounded">Improving</span>
                </div>
                
                {/* Top Right - Leading */}
                <div className="absolute top-[8%] right-[10%]">
                  <span className="text-green-600 font-bold text-lg bg-background/80 px-3 py-2 rounded">Leading</span>
                </div>
                
                {/* Bottom Left - Lagging */}
                <div className="absolute bottom-[25%] left-[15%]">
                  <span className="text-red-600 font-bold text-lg bg-background/80 px-3 py-2 rounded">Lagging</span>
                </div>
                
                {/* Bottom Right - Weakening */}
                <div className="absolute bottom-[25%] right-[10%]">
                  <span className="text-yellow-600 font-bold text-lg bg-background/80 px-3 py-2 rounded">Weakening</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Selection Panel */}
        <div className="xl:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>{viewMode === 'sector' ? 'Sector' : 'Stock'} Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Index Selection */}
              <div>
                <h4 className="text-sm font-medium mb-2">Index Selection</h4>
                <div className="relative" ref={indexSearchRef}>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search index..."
                      value={indexSearchQuery}
                      onChange={(e) => {
                        setIndexSearchQuery(e.target.value);
                        setShowIndexSearchDropdown(true);
                      }}
                      onFocus={() => setShowIndexSearchDropdown(true)}
                      className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                    />
                  </div>
                  
                  {/* Index Search Dropdown */}
                  {showIndexSearchDropdown && indexSearchQuery && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                      {getFilteredIndexOptions.map((option: any) => (
                        <button
                          key={option.name}
                          onClick={() => selectIndex(option.name)}
                          className="flex items-center justify-between w-full p-2 text-left hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: option.color }}
                            ></div>
                            <span className="text-sm">{option.name}</span>
                          </div>
                          <Plus className="w-3 h-3 text-muted-foreground" />
                        </button>
                      ))}
                      {getFilteredIndexOptions.length === 0 && (
                        <div className="p-2 text-sm text-muted-foreground">
                          No index found
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Selected Index Display */}
                <div className="mt-2">
                  <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: indexOptions.find(opt => opt.name === selectedIndex)?.color || '#000000' }}
                      ></div>
                      <span className="text-sm font-medium">{selectedIndex}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">Locked</Badge>
                  </div>
                </div>
              </div>

              {/* Selected Items */}
              {selectedItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Selected ({selectedItems.length})</h4>
                    {selectedItems.length === 1 && (
                      <Badge variant="outline" className="text-xs">Min. required</Badge>
                    )}
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {selectedItems.map((item) => {
                      const option = currentOptions.find(opt => opt.name === item);
                      return (
                        <div key={item} className="flex items-center justify-between p-2 bg-accent rounded-md">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: option?.color }}
                            ></div>
                            <span className="text-sm">{item}</span>
                          </div>
                          <button
                            onClick={() => removeItem(item)}
                            disabled={selectedItems.length === 1}
                            className={`h-6 w-6 p-0 flex items-center justify-center rounded-md transition-colors ${
                              selectedItems.length === 1 
                                ? 'cursor-not-allowed opacity-30' 
                                : 'hover:bg-muted/50 hover:shadow-sm opacity-60 hover:opacity-100'
                            }`}
                            title={selectedItems.length === 1 ? 'Cannot remove last item' : `Remove ${item} from selection`}
                          >
                            <X className={`w-3 h-3 transition-colors ${
                              selectedItems.length === 1 
                                ? 'text-muted-foreground/50' 
                                : 'text-muted-foreground hover:text-destructive'
                            }`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {selectedItems.length === 1 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      At least one {viewMode === 'sector' ? 'sector' : 'stock'} must be selected for comparison
                    </p>
                  )}
                </div>
              )}

              {/* Search (for stocks only) */}
              {viewMode === 'stock' && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Add Stock</h4>
                  <div className="relative" ref={searchRef}>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search stocks..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setShowSearchDropdown(true);
                        }}
                        onFocus={() => setShowSearchDropdown(true)}
                        className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                      />
                    </div>
                    
                    {/* Search Dropdown */}
                    {showSearchDropdown && searchQuery && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                        {getFilteredOptions.map((option: any) => (
                          <button
                            key={option.name}
                            onClick={() => addFromSearch(option.name)}
                            className="flex items-center justify-between w-full p-2 text-left hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: option.color }}
                              ></div>
                              <span className="text-sm">{option.name}</span>
                            </div>
                            <Plus className="w-3 h-3 text-muted-foreground" />
                          </button>
                        ))}
                        {getFilteredOptions.length === 0 && (
                          <div className="p-2 text-sm text-muted-foreground">
                            {stockOptions.filter(s => !selectedItems.includes(s.name)).length === 0 
                              ? 'All stocks already selected' 
                              : 'No stocks found'
                            }
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Available Options */}
              <div>
                <h4 className="text-sm font-medium mb-2">Available {viewMode === 'sector' ? 'Sectors' : 'Stocks'}</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {currentOptions
                    .filter(option => !selectedItems.includes(option.name))
                    .slice(0, viewMode === 'stock' ? 6 : undefined)
                    .map((option) => (
                    <button
                      key={option.name}
                      onClick={() => toggleItem(option.name)}
                      className="flex items-center gap-2 w-full p-2 text-left hover:bg-accent rounded-md transition-colors"
                    >
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: option.color }}
                      ></div>
                      <span className="text-sm">{option.name}</span>
                    </button>
                  ))}
                  {viewMode === 'stock' && currentOptions.filter(option => !selectedItems.includes(option.name)).length > 6 && (
                    <div className="text-xs text-muted-foreground p-2 border-t border-border">
                      + {currentOptions.filter(option => !selectedItems.includes(option.name)).length - 6} more stocks available via search
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dashboard Momentum Screener */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Relative Momentum Screener</CardTitle>
            <div className="relative" ref={screenerSearchRef}>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Add stock to screener..."
                  value={screenerSearchQuery}
                  onChange={(e) => {
                    setScreenerSearchQuery(e.target.value);
                    setShowScreenerSearchDropdown(true);
                  }}
                  onFocus={() => setShowScreenerSearchDropdown(true)}
                  className="pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors w-48"
                />
              </div>
              
              {/* Screener Search Dropdown */}
              {showScreenerSearchDropdown && screenerSearchQuery && (
                <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto min-w-48">
                  {getFilteredScreenerOptions.map((option: any) => (
                    <button
                      key={option.name}
                      onClick={() => addToScreener(option.name)}
                      className="flex items-center justify-between w-full p-2 text-left hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: option.color }}
                        ></div>
                        <span className="text-sm">{option.name}</span>
                      </div>
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </button>
                  ))}
                  {getFilteredScreenerOptions.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">
                      {stockOptions.filter(s => !screenerStocks.some(stock => stock.symbol === s.name)).length === 0 
                        ? 'All stocks already in screener' 
                        : 'No stocks found'
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Header */}
            <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
              <div>Symbol</div>
              <div>Sector</div>
              <div>RS-Ratio</div>
              <div>RS-Momentum</div>
              <div>Performance</div>
              <div>Trend</div>
              <div>Action</div>
            </div>
            
            {/* Data Rows */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {screenerStocks.map((item, index) => (
                <div key={index} className="grid grid-cols-7 gap-2 text-xs items-center py-2 border-b border-border/50">
                  <div className="font-medium text-card-foreground">{item.symbol}</div>
                  <div className="text-muted-foreground">{item.sector}</div>
                  <div className="text-card-foreground">
                    {item.rsRatio.toFixed(1)}
                  </div>
                  <div className="text-card-foreground">
                    {item.rsMomentum.toFixed(1)}
                  </div>
                  <div className={item.performance >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {item.performance >= 0 ? '+' : ''}{item.performance.toFixed(1)}%
                  </div>
                  <div>
                    <Badge variant={getBadgeVariant(item.trend)} className="text-xs">
                      {item.trend}
                    </Badge>
                  </div>
                  <div>
                    <button
                      onClick={() => removeFromScreener(item.symbol)}
                      className="h-6 w-6 p-0 flex items-center justify-center rounded-md transition-colors hover:bg-muted/50 hover:shadow-sm opacity-60 hover:opacity-100"
                      title={`Remove ${item.symbol} from screener`}
                    >
                      <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
});

export { MarketRotationRRG };