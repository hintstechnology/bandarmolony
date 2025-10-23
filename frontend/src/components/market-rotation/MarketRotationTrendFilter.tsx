import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, Minus, Filter, Search, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';

interface TrendStock {
  Symbol: string;
  Name: string;
  Price: number;
  ChangePct: number;
  Sector: string;
  Trend: string;
  Period: string;
}

interface TrendData {
  uptrend: TrendStock[];
  sideways: TrendStock[];
  downtrend: TrendStock[];
}

interface SummaryItem {
  trend: string;
  count: number;
  percentage: number;
  color: string;
}

const timeframes = ['3D', '5D', '2W', '1M'];

export function MarketRotationTrendFilter() {
  const [selectedTimeframe, setSelectedTimeframe] = useState("1M");
  const [selectedSector, setSelectedSector] = useState("All Sectors");
  const [selectedTrend, setSelectedTrend] = useState("all");
  const [currentPage, setCurrentPage] = useState({
    uptrend: 0,
    sideways: 0,
    downtrend: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [trendData, setTrendData] = useState<TrendData>({ uptrend: [], sideways: [], downtrend: [] });
  const [sectors, setSectors] = useState<string[]>(["All Sectors"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsPerPage = 15;

  // Load trend data from API
  useEffect(() => {
    let mounted = true;
    (async () => {
      console.log('🔄 TREND: Loading trend data for timeframe:', selectedTimeframe);
      
      try {
        setLoading(true);
        setError(null);
        
        const response = await api.getTrendFilterData(selectedTimeframe);
        
        if (response.success && response.data) {
          console.log('✅ TREND: Data loaded:', response.data);
          
          // Parse summary data - will be calculated from actual loaded data

          // Parse stocks data
          const stocks = response.data.stocks || [];
          const uptrend: TrendStock[] = [];
          const sideways: TrendStock[] = [];
          const downtrend: TrendStock[] = [];
          const sectorsSet = new Set<string>();
          
          stocks.forEach((stock: any) => {
            const trendStock: TrendStock = {
              Symbol: stock.Symbol || '',
              Name: stock.Name || '',
              Price: stock.Price || 0,
              ChangePct: stock.ChangePct || 0,
              Sector: stock.Sector || '',
              Trend: stock.Trend || '',
              Period: stock.Period || selectedTimeframe
            };
            sectorsSet.add(trendStock.Sector);
            
            const trendLower = trendStock.Trend?.toLowerCase().trim() || '';
            const changePct = trendStock.ChangePct;
            
            // Debug logging for each stock
            console.log(`🔍 Stock Debug: ${trendStock.Symbol} - trend="${trendLower}", changePct=${changePct}%`);
            
            // Derive trend from changePct (sum over period) to guard against bad backend labels
            const derivedLower = changePct > 1 ? 'uptrend' : changePct < -1 ? 'downtrend' : 'sideways';
            if (trendLower !== derivedLower) {
              console.warn(`⚠️ Reclassifying trend: ${trendStock.Symbol} - received="${trendLower}" -> derived="${derivedLower}" (changePct=${changePct}%)`);
            }
            // Use derived trend for categorization
            if (derivedLower === 'uptrend') {
              uptrend.push({ ...trendStock, Trend: 'Uptrend' });
            } else if (derivedLower === 'sideways') {
              sideways.push({ ...trendStock, Trend: 'Sideways' });
            } else if (derivedLower === 'downtrend') {
              downtrend.push({ ...trendStock, Trend: 'Downtrend' });
            }
          });
          
          console.log('📊 TREND: Parsed trend data:', {
            uptrend: uptrend.length,
            sideways: sideways.length,
            downtrend: downtrend.length,
            sectors: sectorsSet.size
          });
          
          // Calculate summary from actual loaded data
          const totalStocks = uptrend.length + sideways.length + downtrend.length;
          const summaries: SummaryItem[] = [
            { 
              trend: 'Uptrend', 
              count: uptrend.length, 
              percentage: totalStocks > 0 ? parseFloat(((uptrend.length / totalStocks) * 100).toFixed(1)) : 0, 
              color: '#10b981' 
            },
            { 
              trend: 'Sideways', 
              count: sideways.length, 
              percentage: totalStocks > 0 ? parseFloat(((sideways.length / totalStocks) * 100).toFixed(1)) : 0, 
              color: '#f59e0b' 
            },
            { 
              trend: 'Downtrend', 
              count: downtrend.length, 
              percentage: totalStocks > 0 ? parseFloat(((downtrend.length / totalStocks) * 100).toFixed(1)) : 0, 
              color: '#ef4444' 
            }
          ];
          
          console.log('📊 TREND: Calculated summary from loaded data:', {
            totalStocks,
            summaries: summaries.map(s => `${s.trend}: ${s.count} (${s.percentage}%)`)
          });
          
          if (mounted) {
            setTrendData({ uptrend, sideways, downtrend });
            setSectors(['All Sectors', ...Array.from(sectorsSet).sort()]);
          }
        } else {
          throw new Error(response.error || 'Failed to load trend data');
        }
      } catch (err) {
        console.error('❌ TREND: Error loading trend data:', err);
        if (mounted) {
          setError(`Failed to load trend data: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedTimeframe]);


  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "uptrend":
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case "sideways":
        return <Minus className="w-4 h-4 text-yellow-500" />;
      case "downtrend":
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getFilteredData = () => {
    if (selectedTrend === "all") {
      return {
        uptrend: trendData.uptrend,
        sideways: trendData.sideways,
        downtrend: trendData.downtrend,
      };
    }
    return {
      [selectedTrend]: (trendData as any)[selectedTrend] || [],
    };
  };

  const filteredData = getFilteredData();

  const getPaginatedData = (trendType: string) => {
    const data = (trendData as any)[trendType] || [];
    const query = searchQuery.toLowerCase();
    const sectorFiltered = selectedSector === "All Sectors" ? data : data.filter((s: TrendStock) => s.Sector === selectedSector);
    const filtered = query
      ? sectorFiltered.filter(
          (stock: TrendStock) =>
            stock.Symbol.toLowerCase().includes(query) ||
            stock.Name.toLowerCase().includes(query),
        )
      : sectorFiltered;

    const startIndex = (currentPage as any)[trendType] * itemsPerPage;
    return {
      data: filtered.slice(startIndex, startIndex + itemsPerPage),
      totalPages: Math.ceil(filtered.length / itemsPerPage),
      currentPage: (currentPage as any)[trendType],
      totalItems: filtered.length,
    };
  };

  // Calculate filtered summary for display
  const getFilteredSummary = () => {
    const uptrendData = getPaginatedData('uptrend');
    const sidewaysData = getPaginatedData('sideways');
    const downtrendData = getPaginatedData('downtrend');
    
    const totalFiltered = uptrendData.totalItems + sidewaysData.totalItems + downtrendData.totalItems;
    
    return [
      { 
        trend: 'Uptrend', 
        count: uptrendData.totalItems, 
        percentage: totalFiltered > 0 ? parseFloat(((uptrendData.totalItems / totalFiltered) * 100).toFixed(1)) : 0, 
        color: '#10b981' 
      },
      { 
        trend: 'Sideways', 
        count: sidewaysData.totalItems, 
        percentage: totalFiltered > 0 ? parseFloat(((sidewaysData.totalItems / totalFiltered) * 100).toFixed(1)) : 0, 
        color: '#f59e0b' 
      },
      { 
        trend: 'Downtrend', 
        count: downtrendData.totalItems, 
        percentage: totalFiltered > 0 ? parseFloat(((downtrendData.totalItems / totalFiltered) * 100).toFixed(1)) : 0, 
        color: '#ef4444' 
      }
    ];
  };

  const handleNextPage = (trendType: string) => {
    setCurrentPage((prev) => ({
      ...prev,
      [trendType]: Math.min(
        (prev as any)[trendType] + 1,
        Math.ceil(((trendData as any)[trendType] || []).length / itemsPerPage) - 1,
      ),
    }));
  };

  const handlePrevPage = (trendType: string) => {
    setCurrentPage((prev) => ({
      ...prev,
      [trendType]: Math.max((prev as any)[trendType] - 1, 0),
    }));
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // Reset all pagination when search changes
    setCurrentPage({
      uptrend: 0,
      sideways: 0,
      downtrend: 0,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading trend data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>{error}</p>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => window.location.reload()}
          className="mt-2"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Timeframe Filter */}
            <div className="w-full">
              <label className="block text-sm font-medium mb-2">Timeframe:</label>
              <div className="grid grid-cols-4 gap-1 border border-border rounded-lg p-1">
                {timeframes.map((tf) => (
                  <Button
                    key={tf}
                    variant={
                      selectedTimeframe === tf
                        ? "default"
                        : "ghost"
                    }
                    size="sm"
                    onClick={() => setSelectedTimeframe(tf)}
                    className="px-2 py-1 h-8 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {tf}
                  </Button>
                ))}
              </div>
            </div>

            {/* Trend Filter */}
            <div className="w-full">
              <label className="block text-sm font-medium mb-2">Trend:</label>
              <div className="grid grid-cols-4 gap-1 border border-border rounded-lg p-1">
                <Button
                  variant={
                    selectedTrend === "all" ? "default" : "ghost"
                  }
                  size="sm"
                  onClick={() => setSelectedTrend("all")}
                  className="px-2 py-1 h-8 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  All
                </Button>
                <Button
                  variant={
                    selectedTrend === "uptrend"
                      ? "default"
                      : "ghost"
                  }
                  size="sm"
                  onClick={() => setSelectedTrend("uptrend")}
                  className="px-2 py-1 h-8 text-xs flex items-center justify-center gap-1 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <TrendingUp className="w-3 h-3" />
                  Up
                </Button>
                <Button
                  variant={
                    selectedTrend === "sideways"
                      ? "default"
                      : "ghost"
                  }
                  size="sm"
                  onClick={() => setSelectedTrend("sideways")}
                  className="px-2 py-1 h-8 text-xs flex items-center justify-center gap-1 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Minus className="w-3 h-3" />
                  Side
                </Button>
                <Button
                  variant={
                    selectedTrend === "downtrend"
                      ? "default"
                      : "ghost"
                  }
                  size="sm"
                  onClick={() => setSelectedTrend("downtrend")}
                  className="px-2 py-1 h-8 text-xs flex items-center justify-center gap-1 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <TrendingDown className="w-3 h-3" />
                  Down
                </Button>
              </div>
            </div>

            {/* Sector Filter */}
            <div className="w-full">
              <label className="block text-sm font-medium mb-2">Sector:</label>
              <select
                value={selectedSector}
                onChange={(e) =>
                  setSelectedSector(e.target.value)
                }
                className="w-full px-3 py-2 h-10 text-xs bg-background border border-border rounded-md hover:border-primary/50 transition-colors"
              >
                {sectors.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Global Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={`Search ${selectedTrend === "all" ? "all" : `${selectedTrend}`} stock symbols or company names here...`}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm bg-background border border-border rounded-md hover:border-primary/50 focus:border-primary focus:outline-none transition-colors"
          />
        </div>
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-2">
            Searching in {selectedTrend === "all" ? "all trends" : selectedTrend} • {getFilteredSummary().reduce((sum, item) => sum + item.count, 0)} results
          </p>
        )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {getFilteredSummary().map((item, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{item.trend}</p>
                <p className="text-2xl font-semibold">{item.count}</p>
                <p className="text-sm text-muted-foreground">
                  {item.percentage}% {selectedSector !== "All Sectors" ? `of ${selectedSector}` : "of market"}
                </p>
              </div>
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${item.color}20` }}
              >
                {item.trend === "Uptrend" && (
                  <TrendingUp className="w-6 h-6" style={{ color: item.color }} />
                )}
                {item.trend === "Sideways" && (
                  <Minus className="w-6 h-6" style={{ color: item.color }} />
                )}
                {item.trend === "Downtrend" && (
                  <TrendingDown className="w-6 h-6" style={{ color: item.color }} />
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        {Object.entries(filteredData).map(
          ([trendType, _stocks]) => {
            const paginatedResult = getPaginatedData(trendType);
            return (
              <Card key={trendType} className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  {getTrendIcon(trendType)}
                  <div>
                    <h3 className="font-semibold capitalize">
                      {trendType} Stocks
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {trendType === 'uptrend' && 'Sum open-to-close > +1%'}
                      {trendType === 'sideways' && 'Sum open-to-close between -1% to +1%'}
                      {trendType === 'downtrend' && 'Sum open-to-close < -1%'}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {paginatedResult.totalItems} stocks
                  </Badge>
                </div>

                <div className="-mx-4 overflow-x-auto sm:mx-0">
                  <div className="min-w-[640px] px-4 sm:min-w-[800px] sm:px-0 mx-auto w-full">
                    <table className="w-full">
                      <thead className="bg-background">
                        <tr className="border-b border-border">
                          <th className="sticky top-0 bg-background text-left py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Symbol</th>
                          <th className="sticky top-0 bg-background text-left py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Name</th>
                          <th className="sticky top-0 bg-background text-right py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Price</th>
                          <th className="sticky top-0 bg-background text-right py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Sum Open-Close %</th>
                          <th className="sticky top-0 bg-background text-left py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Sector</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedResult.data.map((stock: TrendStock, index: number) => (
                          <tr
                            key={index}
                            className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-2 sm:py-3 px-3">
                              <span className="font-medium">{stock.Symbol}</span>
                            </td>
                            <td className="py-2 sm:py-3 px-3">
                              <span className="text-xs sm:text-sm text-muted-foreground">{stock.Name}</span>
                            </td>
                            <td className="py-2 sm:py-3 px-3 text-right">
                              <span className="font-medium">{stock.Price.toLocaleString()}</span>
                            </td>
                            <td className="py-2 sm:py-3 px-3 text-right">
                              <span
                                className={`font-medium ${
                                  stock.ChangePct > 0
                                    ? "text-green-600"
                                    : stock.ChangePct < 0
                                      ? "text-red-600"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {stock.ChangePct > 0 ? "+" : ""}
                                {stock.ChangePct}%
                              </span>
                            </td>
                            <td className="py-2 sm:py-3 px-3">
                              <Badge variant="outline" className="text-[10px] sm:text-xs">{stock.Sector}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination Controls */}
                {paginatedResult.totalPages > 1 && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4 pt-4 border-t border-border">
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      Showing{" "}
                      {paginatedResult.currentPage *
                        itemsPerPage +
                        1}{" "}
                      -{" "}
                      {Math.min(
                        (paginatedResult.currentPage + 1) *
                          itemsPerPage,
                        paginatedResult.totalItems,
                      )}{" "}
                      of {paginatedResult.totalItems} stocks
                    </div>
                     <div className="flex items-center gap-2 self-start sm:self-auto">
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={() =>
                           handlePrevPage(trendType)
                         }
                         disabled={
                           paginatedResult.currentPage === 0
                         }
                         className="w-8 h-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         <ChevronLeft className="w-3 h-3" />
                       </Button>
                       <span className="text-sm w-12 h-8 flex items-center justify-center border border-border rounded">
                         {paginatedResult.currentPage + 1} /{" "}
                         {paginatedResult.totalPages}
                       </span>
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={() =>
                           handleNextPage(trendType)
                         }
                         disabled={
                           paginatedResult.currentPage ===
                           paginatedResult.totalPages - 1
                         }
                         className="w-8 h-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         <ChevronRight className="w-3 h-3" />
                       </Button>
                     </div>
                  </div>
                )}
              </Card>
            );
          }
        )}
      </div>
    </div>
  );
}
