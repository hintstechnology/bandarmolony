import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  Search,
  Calendar,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Target,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const trendData = {
  uptrend: [
    {
      symbol: "BBRI",
      name: "Bank Rakyat Indonesia",
      price: 4820,
      change: 2.8,
      sector: "Banking",
    },
    {
      symbol: "BMRI",
      name: "Bank Mandiri",
      price: 8900,
      change: 1.9,
      sector: "Banking",
    },
    {
      symbol: "TLKM",
      name: "Telkom Indonesia",
      price: 3250,
      change: 3.2,
      sector: "Infrastructure",
    },
    {
      symbol: "ASII",
      name: "Astra International",
      price: 5575,
      change: 1.5,
      sector: "Consumer",
    },
    {
      symbol: "UNVR",
      name: "Unilever Indonesia",
      price: 2690,
      change: 2.1,
      sector: "Consumer",
    },
    {
      symbol: "ANTM",
      name: "Aneka Tambang",
      price: 1850,
      change: 4.5,
      sector: "Mining",
    },
    {
      symbol: "INCO",
      name: "Vale Indonesia",
      price: 3890,
      change: 3.8,
      sector: "Mining",
    },
    {
      symbol: "ITMG",
      name: "Indo Tambangraya Megah",
      price: 22500,
      change: 2.9,
      sector: "Mining",
    },
    {
      symbol: "PTBA",
      name: "Bukit Asam",
      price: 4275,
      change: 3.1,
      sector: "Mining",
    },
    {
      symbol: "INDF",
      name: "Indofood Sukses Makmur",
      price: 6800,
      change: 2.4,
      sector: "Consumer",
    },
    {
      symbol: "EXCL",
      name: "XL Axiata",
      price: 2890,
      change: 2.7,
      sector: "Infrastructure",
    },
    {
      symbol: "PGAS",
      name: "Perusahaan Gas Negara",
      price: 1675,
      change: 3.3,
      sector: "Infrastructure",
    },
    {
      symbol: "JSMR",
      name: "Jasa Marga",
      price: 4150,
      change: 2.2,
      sector: "Infrastructure",
    },
    {
      symbol: "WSKT",
      name: "Waskita Karya",
      price: 1025,
      change: 4.1,
      sector: "Infrastructure",
    },
    {
      symbol: "WIKA",
      name: "Wijaya Karya",
      price: 1890,
      change: 2.6,
      sector: "Infrastructure",
    },
  ],
  sideways: [
    {
      symbol: "GGRM",
      name: "Gudang Garam",
      price: 1875,
      change: 0.2,
      sector: "Consumer",
    },
    {
      symbol: "ICBP",
      name: "Indofood CBP",
      price: 12175,
      change: -0.1,
      sector: "Consumer",
    },
    {
      symbol: "INTP",
      name: "Indocement",
      price: 8650,
      change: 0.3,
      sector: "Infrastructure",
    },
    {
      symbol: "KLBF",
      name: "Kalbe Farma",
      price: 1535,
      change: -0.2,
      sector: "Consumer",
    },
    {
      symbol: "SMGR",
      name: "Semen Indonesia",
      price: 3980,
      change: 0.1,
      sector: "Infrastructure",
    },
    {
      symbol: "MNCN",
      name: "Media Nusantara Citra",
      price: 1450,
      change: 0.0,
      sector: "Technology",
    },
    {
      symbol: "TOWR",
      name: "Sarana Menara Nusantara",
      price: 1890,
      change: -0.1,
      sector: "Infrastructure",
    },
    {
      symbol: "TINS",
      name: "Timah",
      price: 1275,
      change: 0.2,
      sector: "Mining",
    },
    {
      symbol: "BYAN",
      name: "Bumi Resources",
      price: 325,
      change: 0.1,
      sector: "Mining",
    },
    {
      symbol: "ADRO",
      name: "Adaro Energy",
      price: 3450,
      change: -0.2,
      sector: "Mining",
    },
    {
      symbol: "HMSP",
      name: "HM Sampoerna",
      price: 1350,
      change: 0.0,
      sector: "Consumer",
    },
    {
      symbol: "SIDO",
      name: "Industri Jamu Dan Farmasi Sido Muncul",
      price: 565,
      change: 0.1,
      sector: "Consumer",
    },
  ],
  downtrend: [
    {
      symbol: "BBCA",
      name: "Bank Central Asia",
      price: 9825,
      change: -1.8,
      sector: "Banking",
    },
    {
      symbol: "BBTN",
      name: "Bank Tabungan Negara",
      price: 1285,
      change: -2.5,
      sector: "Banking",
    },
    {
      symbol: "BRIS",
      name: "Bank Syariah Indonesia",
      price: 2580,
      change: -1.2,
      sector: "Banking",
    },
    {
      symbol: "GOTO",
      name: "GoTo Gojek Tokopedia",
      price: 68,
      change: -3.1,
      sector: "Technology",
    },
    {
      symbol: "AMMN",
      name: "Amman Mineral",
      price: 8475,
      change: -2.8,
      sector: "Mining",
    },
    {
      symbol: "EMTK",
      name: "Elang Mahkota Teknologi",
      price: 145,
      change: -4.2,
      sector: "Technology",
    },
    {
      symbol: "FREN",
      name: "Smartfren Telecom",
      price: 285,
      change: -3.5,
      sector: "Infrastructure",
    },
    {
      symbol: "ISAT",
      name: "Indosat Ooredoo Hutchison",
      price: 6750,
      change: -2.1,
      sector: "Infrastructure",
    },
    {
      symbol: "LPKR",
      name: "Lippo Karawaci",
      price: 168,
      change: -2.9,
      sector: "Infrastructure",
    },
    {
      symbol: "PWON",
      name: "Pakuwon Jati",
      price: 465,
      change: -1.9,
      sector: "Infrastructure",
    },
    {
      symbol: "PNBN",
      name: "Bank Pan Indonesia",
      price: 1995,
      change: -2.2,
      sector: "Banking",
    },
    {
      symbol: "MEGA",
      name: "Bank Mega",
      price: 2890,
      change: -1.7,
      sector: "Banking",
    },
  ],
};

const trendSummary = [
  {
    trend: "Uptrend",
    count: 125,
    percentage: 42.3,
    color: "#10b981",
  },
  {
    trend: "Sideways",
    percentage: 35.2,
    count: 104,
    color: "#f59e0b",
  },
  {
    trend: "Downtrend",
    count: 66,
    percentage: 22.5,
    color: "#ef4444",
  },
];

const timeframes = ["3D", "5D", "2W", "1M"];
const sectors = [
  "All Sectors",
  "Banking",
  "Mining",
  "Consumer",
  "Infrastructure",
  "Technology",
];

export function MarketRotationTrendFilter() {
  const [selectedTimeframe, setSelectedTimeframe] =
    useState("1M");
  const [selectedSector, setSelectedSector] =
    useState("All Sectors");
  const [selectedTrend, setSelectedTrend] = useState("uptrend");
  const [searchQuery, setSearchQuery] = useState("");
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

  const itemsPerPage = 5;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "uptrend":
        return (
          <TrendingUp className="w-4 h-4 text-green-500" />
        );
      case "sideways":
        return <Minus className="w-4 h-4 text-yellow-500" />;
      case "downtrend":
        return (
          <TrendingDown className="w-4 h-4 text-red-500" />
        );
      default:
        return null;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "uptrend":
        return "text-green-600 bg-green-50 dark:bg-green-900/20";
      case "sideways":
        return "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20";
      case "downtrend":
        return "text-red-600 bg-red-50 dark:bg-red-900/20";
      default:
        return "";
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
      [selectedTrend]: trendData[selectedTrend] || [],
    };
  };

  const filteredData = getFilteredData();

  const getPaginatedData = (trendType: string) => {
    const data = trendData[trendType] || [];
    const query = searchQueries[trendType].toLowerCase();
    const filtered = query
      ? data.filter(
          (stock) =>
            stock.symbol.toLowerCase().includes(query) ||
            stock.name.toLowerCase().includes(query),
        )
      : data;

    const startIndex = currentPage[trendType] * itemsPerPage;
    return {
      data: filtered.slice(
        startIndex,
        startIndex + itemsPerPage,
      ),
      totalPages: Math.ceil(filtered.length / itemsPerPage),
      currentPage: currentPage[trendType],
      totalItems: filtered.length,
    };
  };

  const handleNextPage = (trendType: string) => {
    setCurrentPage((prev) => ({
      ...prev,
      [trendType]: Math.min(
        prev[trendType] + 1,
        Math.ceil(trendData[trendType].length / itemsPerPage) -
          1,
      ),
    }));
  };

  const handlePrevPage = (trendType: string) => {
    setCurrentPage((prev) => ({
      ...prev,
      [trendType]: Math.max(prev[trendType] - 1, 0),
    }));
  };

  const handleSearchChange = (
    trendType: string,
    value: string,
  ) => {
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
      {/* Filter Controls */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Filters:
            </span>
          </div>

          {/* Timeframe Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
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

          {/* Sector Filter */}
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <select
              value={selectedSector}
              onChange={(e) =>
                setSelectedSector(e.target.value)
              }
              className="px-3 py-1 text-xs bg-background border border-border rounded-md hover:border-primary/50 transition-colors"
            >
              {sectors.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </div>

          {/* Trend Filter */}
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
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
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {trendSummary.map((item, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {item.trend}
                </p>
                <p className="text-2xl font-semibold">
                  {item.count}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.percentage}% of market
                </p>
              </div>
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${item.color}20` }}
              >
                {item.trend === "Uptrend" && (
                  <TrendingUp
                    className="w-6 h-6"
                    style={{ color: item.color }}
                  />
                )}
                {item.trend === "Sideways" && (
                  <Minus
                    className="w-6 h-6"
                    style={{ color: item.color }}
                  />
                )}
                {item.trend === "Downtrend" && (
                  <TrendingDown
                    className="w-6 h-6"
                    style={{ color: item.color }}
                  />
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Trend Categories */}
      <div className="space-y-6">
        {Object.entries(filteredData).map(
          ([trendType, stocks]) => {
            const paginatedResult = getPaginatedData(trendType);
            return (
              <Card key={trendType} className="p-6">
                <div className="flex items-center justify-between mb-4">
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
                  <div className="flex items-center gap-2 max-w-xs">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={`Search ${trendType} stocks...`}
                      value={searchQueries[trendType]}
                      onChange={(e) =>
                        handleSearchChange(
                          trendType,
                          e.target.value,
                        )
                      }
                      className="flex-1 px-3 py-1 text-xs bg-background border border-border rounded-md hover:border-primary/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">
                          Symbol
                        </th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">
                          Name
                        </th>
                        <th className="text-right py-2 px-3 text-sm font-medium text-muted-foreground">
                          Price
                        </th>
                        <th className="text-right py-2 px-3 text-sm font-medium text-muted-foreground">
                          Change %
                        </th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">
                          Sector
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedResult.data.map(
                        (stock, index) => (
                          <tr
                            key={index}
                            className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-3 px-3">
                              <span className="font-medium">
                                {stock.symbol}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-sm text-muted-foreground">
                                {stock.name}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="font-medium">
                                {stock.price.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
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
                            <td className="py-3 px-3">
                              <Badge
                                variant="outline"
                                className="text-xs"
                              >
                                {stock.sector}
                              </Badge>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {paginatedResult.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <div className="text-sm text-muted-foreground">
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
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handlePrevPage(trendType)
                        }
                        disabled={
                          paginatedResult.currentPage === 0
                        }
                        className="flex items-center gap-1 hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-3 h-3" />
                        Previous
                      </Button>
                      <span className="text-sm px-3 py-1 bg-muted rounded">
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
                        className="flex items-center gap-1 hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          },
        )}
      </div>
    </div>
  );
}