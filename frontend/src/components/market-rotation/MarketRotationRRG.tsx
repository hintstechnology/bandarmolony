import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Line } from 'recharts';
import { X, Search, Plus, Minus } from 'lucide-react';

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
  seed: number = 0,
  days: number = 5
): TrajectoryPoint[] => {
  const points: TrajectoryPoint[] = [];
  // Use seed for consistent data generation
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  for (let i = 0; i < days; i++) {
    const seedValue = seed + i;
    const rsRatioVariation = (random(seedValue) - 0.5) * 6; // ±3 range (reduced)
    const rsMomentumVariation = (random(seedValue + 1000) - 0.5) * 6; // ±3 range (reduced)

    // Calculate size: largest for latest point, smaller for older points
    let size;
    if (i === days - 1) {
      // Latest point - largest
      size = 20;
    } else if (days === 1) {
      // Single point
      size = 20;
    } else {
      // Older points - gradually smaller
      const progress = i / (days - 1);
      size = 3 + progress * 17; // From 3 to 20
    }
    
    console.log(`Point ${i + 1}/${days}: size = ${size}`);

    points.push({
      point: i + 1,
      rsRatio: baseRsRatio + rsRatioVariation + i * 0.15, // Slight trend
      rsMomentum: baseRsMomentum + rsMomentumVariation + i * 0.08, // Slight trend
      color,
      name,
      isLatest: i === days - 1, // Last point is the latest
      fill: color,
      stroke: color,
      radius: size
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
  const cache = new Map<string, { trajectories: TrajectoryPoint[][], allPoints: TrajectoryPoint[] }>();
  
  return (data: any[], type: 'stock' | 'sector', days: number) => {
    const cacheKey = `${type}-${data.length}-${days}-v2`; // Added v2 to clear cache
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }
    
    const trajectories = data.map((item, index) => 
      generateTrajectoryData(item.rsRatio, item.rsMomentum, item.color, item.name, index, days)
    );
    
    const allPoints = trajectories.flat();
    
    const result = { trajectories, allPoints };
    cache.set(cacheKey, result);
    return result;
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
  const [selectedDays, setSelectedDays] = useState<number>(5);
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const [screenerSearchQuery, setScreenerSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showIndexSearchDropdown, setShowIndexSearchDropdown] = useState(false);
  const [showScreenerSearchDropdown, setShowScreenerSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const indexSearchRef = useRef<HTMLDivElement>(null);
  const screenerSearchRef = useRef<HTMLDivElement>(null);

  // Memoized data calculations
  const currentData = useMemo(() => 
    viewMode === 'sector' ? sectorData : stockData, 
    [viewMode]
  );

  // Memoized screener data based on selectedDays
  const memoizedScreenerData = useMemo(() => {
    return screenerData.map(item => ({
      ...item,
      // Simulate different performance based on selectedDays
      rsRatio: item.rsRatio + (selectedDays - 5) * 0.5,
      rsMomentum: item.rsMomentum + (selectedDays - 5) * 0.3,
      performance: item.performance + (selectedDays - 5) * 0.1
    }));
  }, [selectedDays]);

  const [screenerStocks, setScreenerStocks] = useState(memoizedScreenerData);

  const currentOptions = useMemo(() => 
    viewMode === 'sector' ? sectorOptions : stockOptions,
    [viewMode]
  );

  // Memoized trajectory data - only generate when selectedItems or selectedDays change
  const trajectoryDataResult = useMemo(() => {
    return generateTrajectoryDataMemo(currentData, viewMode, selectedDays);
  }, [viewMode, currentData, selectedDays]);

  const filteredTrajectoryData = useMemo(() => {
    return trajectoryDataResult.allPoints.filter(point => selectedItems.includes(point.name));
  }, [selectedItems, trajectoryDataResult]);

  const filteredTrajectories = useMemo(() => {
    return trajectoryDataResult.trajectories.filter(trajectory => 
      trajectory.length > 0 && trajectory[0] && selectedItems.includes(trajectory[0].name)
    );
  }, [selectedItems, trajectoryDataResult]);

  // Lazy loading state for chart
  const [isChartLoaded, setIsChartLoaded] = useState(false);

  useEffect(() => {
    // Delay chart rendering to improve initial load performance
    const timer = setTimeout(() => {
      setIsChartLoaded(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedItems, viewMode, selectedDays]);

  // Update screener stocks when selectedDays changes
  useEffect(() => {
    setScreenerStocks(memoizedScreenerData);
  }, [memoizedScreenerData]);

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

  const handleDaysChange = useCallback((increment: boolean) => {
    setSelectedDays(prev => {
      const newValue = increment ? prev + 1 : prev - 1;
      return Math.max(1, Math.min(14, newValue));
    });
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
    <div className="space-y-6">
        {/* Controls */}
        <div className="space-y-4">
          {/* Row 1: View Mode & Show Last */}
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            {/* View Mode */}
            <div>
              <label className="block text-sm font-medium mb-2">View Mode:</label>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'sector' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleViewModeChange('sector')}
                  className="h-8 px-3"
                >
                  Sector
                </Button>
                <Button
                  variant={viewMode === 'stock' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleViewModeChange('stock')}
                  className="h-8 px-3"
                >
                  Stock
                </Button>
              </div>
            </div>
            
            {/* Show Last */}
            <div>
              <label className="block text-sm font-medium mb-2">Show Last:</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDaysChange(false)}
                  disabled={selectedDays <= 1}
                  className="h-8 w-8 p-0"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <div className="flex items-center justify-center min-w-[50px] h-8 px-3 border border-border rounded-md bg-background text-sm font-medium">
                  {selectedDays}D
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDaysChange(true)}
                  disabled={selectedDays >= 14}
                  className="h-8 w-8 p-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* RRG Chart */}
        <div className="xl:col-span-3">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Relative Rotation Graph (RRG) vs {selectedIndex} - Last {selectedDays} Day{selectedDays > 1 ? 's' : ''}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {!isChartLoaded ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading chart...</p>
                  </div>
                </div>
              ) : (
                <div className="h-full w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={filteredTrajectoryData} margin={{ bottom: 20, left: 20, right: 20, top: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                      <XAxis 
                        type="number" 
                        dataKey="rsRatio" 
                        domain={[90, 110]}
                        name="RS-Ratio"
                        stroke="hsl(var(--foreground))"
                        tick={{ fill: 'hsl(var(--foreground))' }}
                      />
                      <YAxis 
                        type="number" 
                        dataKey="rsMomentum" 
                        domain={[90, 110]}
                        name="RS-Momentum"
                        stroke="hsl(var(--foreground))"
                        tick={{ fill: 'hsl(var(--foreground))' }}
                      />
                      <ReferenceLine x={100} stroke="hsl(var(--foreground))" strokeDasharray="2 2" />
                      <ReferenceLine y={100} stroke="hsl(var(--foreground))" strokeDasharray="2 2" />
                      <Tooltip content={<CustomTooltip />} />
                      
                      {/* Render only latest trajectory points */}
                      {filteredTrajectoryData
                        .filter(point => point.isLatest)
                        .map((point, index) => (
                          <Scatter 
                            key={`${point.name}-${index}`} 
                            dataKey="rsMomentum"
                            fill={point.fill}
                            stroke={point.stroke}
                            fillOpacity={0.8}
                            strokeOpacity={0.8}
                            r={point.radius}
                            data={[point]}
                          />
                        ))}
                      
                      {/* Trajectory lines for all selected items with gradient opacity and tapered ends */}
                      {filteredTrajectories.map((trajectory) => {
                        const itemName = trajectory[0]?.name;
                        const itemOption = currentOptions.find(opt => opt.name === itemName);
                        
                        // Create gradient lines for each segment
                        return trajectory.map((point, index) => {
                          if (index === 0) return null; // Skip first point as it has no previous point to connect
                          
                          const previousPoint = trajectory[index - 1];
                          if (!previousPoint) return null;
                          const segmentData = [previousPoint, point];
                          
                          // Calculate opacity: newer segments are more opaque with smoother gradient
                          const totalPoints = trajectory.length;
                          const progress = index / (totalPoints - 1);
                          const opacity = 0.1 + (progress * progress * 0.9); // Smoother curve: 0.1 to 1.0
                          
                          // Calculate stroke width: taper from thin to thick
                          const strokeWidth = 0.5 + (progress * 2.5); // From 0.5 to 3.0
                        
                        return (
                          <Line
                               key={`line-${itemName}-${index}`}
                               type="monotone"
                            dataKey="rsMomentum"
                               stroke={itemOption?.color || trajectory[0]?.stroke || '#6B7280'}
                               strokeWidth={strokeWidth}
                            dot={false}
                               data={segmentData}
                            connectNulls={false}
                               strokeOpacity={opacity}
                               strokeLinecap="round"
                               strokeLinejoin="round"
                          />
                        );
                        }).filter(Boolean);
                      }).flat()}
                      
                      {/* Add benchmark point at center (100, 100) */}
                      <Scatter 
                        dataKey="rsMomentum" 
                        fill="#000000"
                        data={[{ rsRatio: 100, rsMomentum: 100 }]}
                        r={8} 
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  
                  {/* Axis Labels - Floating Fixed */}
                  <div className="absolute inset-0 pointer-events-none">
                    {/* RS-Momentum Label - Left side */}
                    <div
                      className="absolute top-1/2 -left-8 text-sm text-muted-foreground font-bold whitespace-nowrap"
                      style={{
                        transform: 'translateY(-50%) rotate(-90deg)',
                        transformOrigin: 'center',
                        zIndex: 10
                      }}
                    >
                      RS-Momentum
                    </div>
                    
                    {/* RS-Ratio Label - Below 100 */}
                    <div
                      className="absolute bottom-2 left-1/2 text-sm text-muted-foreground font-bold whitespace-nowrap text-center"
                      style={{
                        transform: 'translateX(-50%)',
                        zIndex: 10
                      }}
                    >
                      RS-Ratio
                    </div>
                    
                    {/* Quadrant Labels positioned based on chart corners */}
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Selection Panel */}
        <div className="xl:col-span-1">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>{viewMode === 'sector' ? 'Sector' : 'Stock'} Selection</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
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
            <CardTitle>Relative Momentum Screener - Last {selectedDays} Day{selectedDays > 1 ? 's' : ''}</CardTitle>
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
  );
});

export { MarketRotationRRG };