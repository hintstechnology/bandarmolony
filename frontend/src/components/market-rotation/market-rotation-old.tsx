
import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  Search,
  Calendar,
  BarChart3,
  Target,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface TrendStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  sector: string;
  trend?: string;
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

const timeframes = ["3D", "5D", "2W", "1M"];

export function MarketRotationTrendFilter() {
  const [selectedTimeframe, setSelectedTimeframe] = useState("1M");
  const [selectedSector, setSelectedSector] = useState("All Sectors");
  const [selectedTrend, setSelectedTrend] = useState("uptrend");
  const [currentPage, setCurrentPage] = useState({
    uptrend: 0,
    sideways: 0,
    downtrend: 0,
  });
  const [searchQueries, setSearchQueries] = useState({
    uptrend: "",
    sideways: "",
    downtrend: "",
  });
  const [trendData, setTrendData] = useState<TrendData>({ uptrend: [], sideways: [], downtrend: [] });
  const [trendSummary, setTrendSummary] = useState<SummaryItem[]>([]);
  const [sectors, setSectors] = useState<string[]>(["All Sectors"]);

  const itemsPerPage = 5;

  // Load trend data from Azure on mount and when timeframe changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      console.log('🔄 TREND: Loading trend data for timeframe:', selectedTimeframe);
      
      try {
        // No need for manual backfill - files will be generated on-demand
        console.log('✅ TREND: Inputs loaded, files will be generated on-demand when needed');
        
        // Load summary
        console.log('🔄 TREND: Loading summary data...');
        const summaryPath = 'trend_output/summary/trend-summary.csv';
        const summaryCsv = await api.getMarketRotationOutputFile('trend', summaryPath);
        console.log('📄 TREND: Got summary CSV, length:', summaryCsv.length);
        
        const summaryLines = summaryCsv.trim().split(/\r?\n/).slice(1);
        const summaries: SummaryItem[] = [];
        
        for (const line of summaryLines) {
          const [period, , upCnt, upPct, sideCnt, sidePct, downCnt, downPct] = line.split(',');
          if (period?.toLowerCase() === selectedTimeframe.toLowerCase()) {
            summaries.push(
              { trend: 'Uptrend', count: Number.parseInt(upCnt || '0'), percentage: Number.parseFloat(upPct || '0'), color: '#10b981' },
              { trend: 'Sideways', count: Number.parseInt(sideCnt || '0'), percentage: Number.parseFloat(sidePct || '0'), color: '#f59e0b' },
              { trend: 'Downtrend', count: Number.parseInt(downCnt || '0'), percentage: Number.parseFloat(downPct || '0'), color: '#ef4444' }
            );
          }
        }
        
        console.log('📊 TREND: Parsed summaries:', summaries);
        if (mounted) setTrendSummary(summaries);

        // Load period data
        console.log('🔄 TREND: Loading period data...');
        const periodPath = `trend_output/periods/o1-trend-${selectedTimeframe.toLowerCase()}.csv`;
        const periodCsv = await api.getMarketRotationOutputFile('trend', periodPath);
        console.log('📄 TREND: Got period CSV, length:', periodCsv.length);
        
        const periodLines = periodCsv.trim().split(/\r?\n/).slice(1);
        const uptrend: TrendStock[] = [];
        const sideways: TrendStock[] = [];
        const downtrend: TrendStock[] = [];
        const sectorsSet = new Set<string>();
        
        for (const line of periodLines) {
          const [symbol, name, price, changePct, sector, trend] = line.split(',');
          const stock: TrendStock = {
            symbol: (symbol || '').trim(),
            name: (name || '').trim(),
            price: Number.parseFloat((price || '').trim()),
            change: Number.parseFloat((changePct || '').trim()),
            sector: (sector || '').trim(),
            trend: (trend || '').trim(),
          };
          sectorsSet.add(stock.sector);
          const trendLower = stock.trend?.toLowerCase() || '';
          if (trendLower === 'uptrend') uptrend.push(stock);
          else if (trendLower === 'sideways') sideways.push(stock);
          else if (trendLower === 'downtrend') downtrend.push(stock);
        }
        
        console.log('📊 TREND: Parsed trend data:', {
          uptrend: uptrend.length,
          sideways: sideways.length,
          downtrend: downtrend.length,
          sectors: sectorsSet.size
        });
        
        if (mounted) {
          setTrendData({ uptrend, sideways, downtrend });
          setSectors(['All Sectors', ...Array.from(sectorsSet).sort()]);
        }
      } catch (error) {
        console.error('❌ TREND: Error loading trend data:', error);
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
    const query = (searchQueries as any)[trendType].toLowerCase();
    const sectorFiltered = selectedSector === "All Sectors" ? data : data.filter((s: TrendStock) => s.sector === selectedSector);
    const filtered = query
      ? sectorFiltered.filter(
          (stock: TrendStock) =>
            stock.symbol.toLowerCase().includes(query) ||
            stock.name.toLowerCase().includes(query),
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

  const handleSearchChange = (trendType: string, value: string) => {
    setSearchQueries((prev) => ({
      ...prev,
      [trendType]: value,
    }));
    setCurrentPage((prev) => ({
      ...prev,
      [trendType]: 0,
    }));
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 lg:flex lg:flex-row">
            {/* Timeframe Filter */}
            <div className="min-w-0">
              <label className="block text-sm font-medium mb-2">Timeframe:</label>
              <div className="flex items-center gap-1 border border-border rounded-lg p-1 overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
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
                    className="px-3 py-1 h-8 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {tf}
                  </Button>
                ))}
                </div>
              </div>
            </div>

            {/* Trend Filter */}
            <div className="min-w-0">
              <label className="block text-sm font-medium mb-2">Trend:</label>
              <div className="flex items-center gap-1 border border-border rounded-lg p-1 overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                <Button
                  variant={
                    selectedTrend === "all" ? "default" : "ghost"
                  }
                  size="sm"
                  onClick={() => setSelectedTrend("all")}
                  className="px-3 py-1 h-8 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
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
                  className="px-3 py-1 h-8 text-xs flex items-center gap-1 hover:bg-primary/10 hover:text-primary transition-colors"
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
                  className="px-3 py-1 h-8 text-xs flex items-center gap-1 hover:bg-primary/10 hover:text-primary transition-colors"
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
                  className="px-3 py-1 h-8 text-xs flex items-center gap-1 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <TrendingDown className="w-3 h-3" />
                  Down
                </Button>
                </div>
              </div>
            </div>

            {/* Sector Filter */}
            <div className="min-w-0">
              <label className="block text-sm font-medium mb-2">Sector:</label>
              <select
                value={selectedSector}
                onChange={(e) =>
                  setSelectedSector(e.target.value)
                }
                className="w-full sm:w-48 px-3 py-2 h-10 text-xs bg-background border border-border rounded-md hover:border-primary/50 transition-colors"
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {trendSummary.map((item, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{item.trend}</p>
                <p className="text-2xl font-semibold">{item.count}</p>
                <p className="text-sm text-muted-foreground">{item.percentage}% of market</p>
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getTrendIcon(trendType)}
                    <h3 className="font-semibold capitalize">
                      {trendType} Stocks
                    </h3>
                    <Badge variant="secondary">
                      {paginatedResult.totalItems} stocks
                    </Badge>
                  </div>

                   {/* Search for this trend */}
                   <div className="flex items-center gap-2 w-full sm:max-w-sm">
                     <div className="relative flex-1">
                       <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                       <input
                         type="text"
                         placeholder={`Search ${trendType} stocks...`}
                         value={(searchQueries as any)[trendType]}
                         onChange={(e) =>
                           handleSearchChange(
                             trendType,
                             e.target.value,
                           )
                         }
                         className="w-full pl-10 pr-3 py-2 text-sm bg-background border border-border rounded-md hover:border-primary/50 transition-colors"
                       />
                     </div>
                   </div>
                </div>

                <div className="overflow-x-auto rounded-md">
                  <table className="w-full min-w-[640px]">
                    <thead className="bg-background">
                      <tr className="border-b border-border">
                        <th className="sticky top-0 bg-background text-left py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Symbol</th>
                        <th className="sticky top-0 bg-background text-left py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Name</th>
                        <th className="sticky top-0 bg-background text-right py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Price</th>
                        <th className="sticky top-0 bg-background text-right py-2 px-3 text-xs sm:text-sm font-medium text-muted-foreground">Change %</th>
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
                            <span className="font-medium">{stock.symbol}</span>
                          </td>
                          <td className="py-2 sm:py-3 px-3">
                            <span className="text-xs sm:text-sm text-muted-foreground">{stock.name}</span>
                          </td>
                          <td className="py-2 sm:py-3 px-3 text-right">
                            <span className="font-medium">{stock.price.toLocaleString()}</span>
                          </td>
                          <td className="py-2 sm:py-3 px-3 text-right">
                            <span
                              className={`font-medium ${
                                stock.change > 0
                                  ? "text-green-600"
                                  : stock.change < 0
                                    ? "text-red-600"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {stock.change > 0 ? "+" : ""}
                              {stock.change}%
                            </span>
                          </td>
                          <td className="py-2 sm:py-3 px-3">
                            <Badge variant="outline" className="text-[10px] sm:text-xs">{stock.sector}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
