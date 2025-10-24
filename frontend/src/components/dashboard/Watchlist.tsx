import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { TrendingUp, TrendingDown, Star, Search, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

// Interface for stock data from backend
interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdate?: string;
}

// Extended stock data with more companies (fallback data)
const fallbackStocksData = [
  {
    symbol: "BBRI",
    name: "Bank Rakyat Indonesia",
    price: 4650,
    change: 50,
    changePercent: 1.09,
  },
  {
    symbol: "BBCA",
    name: "Bank Central Asia",
    price: 9150,
    change: -25,
    changePercent: -0.27,
  },
  {
    symbol: "BMRI",
    name: "Bank Mandiri",
    price: 5675,
    change: 75,
    changePercent: 1.34,
  },
  {
    symbol: "BBNI",
    name: "Bank Negara Indonesia",
    price: 4850,
    change: 30,
    changePercent: 0.62,
  },
  {
    symbol: "TLKM",
    name: "Telkom Indonesia",
    price: 3580,
    change: -20,
    changePercent: -0.56,
  },
  {
    symbol: "ASII",
    name: "Astra International",
    price: 5200,
    change: 100,
    changePercent: 1.96,
  },
  {
    symbol: "UNVR",
    name: "Unilever Indonesia",
    price: 2850,
    change: -15,
    changePercent: -0.52,
  },
  {
    symbol: "GGRM",
    name: "Gudang Garam",
    price: 18500,
    change: 200,
    changePercent: 1.09,
  },
  {
    symbol: "ICBP",
    name: "Indofood CBP Sukses Makmur",
    price: 10250,
    change: -50,
    changePercent: -0.49,
  },
  {
    symbol: "INDF",
    name: "Indofood Sukses Makmur",
    price: 6250,
    change: 75,
    changePercent: 1.22,
  },
  {
    symbol: "KLBF",
    name: "Kalbe Farma",
    price: 1850,
    change: 25,
    changePercent: 1.37,
  },
  {
    symbol: "ADRO",
    name: "Adaro Energy",
    price: 3250,
    change: -40,
    changePercent: -1.22,
  },
  {
    symbol: "ANTM",
    name: "Aneka Tambang",
    price: 1250,
    change: 15,
    changePercent: 1.22,
  },
  {
    symbol: "ITMG",
    name: "Indo Tambangraya Megah",
    price: 28500,
    change: -300,
    changePercent: -1.04,
  },
  {
    symbol: "PTBA",
    name: "Bukit Asam",
    price: 3250,
    change: 50,
    changePercent: 1.56,
  },
  {
    symbol: "SMGR",
    name: "Semen Indonesia",
    price: 4250,
    change: -25,
    changePercent: -0.58,
  },
  {
    symbol: "INTP",
    name: "Indocement Tunggal Prakarsa",
    price: 12500,
    change: 100,
    changePercent: 0.81,
  },
  {
    symbol: "WIKA",
    name: "Wijaya Karya",
    price: 850,
    change: -5,
    changePercent: -0.58,
  },
  {
    symbol: "WSKT",
    name: "Waskita Karya",
    price: 450,
    change: 10,
    changePercent: 2.27,
  },
  {
    symbol: "PGAS",
    name: "Perusahaan Gas Negara",
    price: 1850,
    change: -20,
    changePercent: -1.07,
  },
];

interface WatchlistProps {
  selectedStock: string;
  onStockSelect: (symbol: string) => void;
  showFavoritesOnly?: boolean;
}

export function Watchlist({ selectedStock, onStockSelect, showFavoritesOnly: propShowFavoritesOnly }: WatchlistProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    // Load favorites from localStorage
    const saved = localStorage.getItem('watchlist-favorites');
    return saved ? JSON.parse(saved) : ['BBRI', 'BBCA', 'BMRI'];
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(propShowFavoritesOnly || false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  // Backend data state
  const [stocksData, setStocksData] = useState<StockData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Save favorites to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('watchlist-favorites', JSON.stringify(favorites));
  }, [favorites]);

  // Fetch stock list from backend (symbols only, no OHLC data)
  useEffect(() => {
    const fetchStockList = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Get stock list from backend (only symbols, no price data)
        console.log('📊 Fetching stock list from backend...');
        const stockListResponse = await api.getStockList();
        console.log('📊 Stock list response:', stockListResponse);
        
        if (stockListResponse.success && stockListResponse.data) {
          const stockSymbols = stockListResponse.data.stocks; // Get ALL stocks from backend
          console.log('📊 Raw stock symbols from backend:', stockSymbols.slice(0, 10), '...');
          
          // Convert to StockData format with placeholder prices
          const stocksList: StockData[] = stockSymbols.map((symbol: string) => ({
            symbol: symbol,
            name: symbol,
            price: 0, // Placeholder, will be loaded when selected
            change: 0,
            changePercent: 0,
            lastUpdate: undefined
          }));
          
          setStocksData(stocksList);
          console.log(`📊 Loaded ${stocksList.length} stock symbols from backend (without price data)`);
        } else {
          console.error('📊 Backend response failed:', stockListResponse);
          throw new Error('Failed to get stock list from backend');
        }
      } catch (err) {
        console.error('Error fetching stock list:', err);
        setError('Failed to load stock list from backend');
        // Fallback to static data
        console.log('📊 Using fallback data due to backend error');
        setStocksData(fallbackStocksData);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStockList();
  }, []);

  const toggleFavorite = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent stock selection when clicking star
    setFavorites(prev => 
      prev.includes(symbol) 
        ? prev.filter(fav => fav !== symbol)
        : [...prev, symbol]
    );
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSearchDropdown(value.length > 0);
  };

  const handleSearchFocus = () => {
    if (searchQuery.length > 0) {
      setShowSearchDropdown(true);
    }
  };

  const handleSearchBlur = () => {
    // Delay hiding dropdown to allow clicking on items
    setTimeout(() => setShowSearchDropdown(false), 200);
  };

  const handleStockSelectFromSearch = (symbol: string) => {
    onStockSelect(symbol);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  // For search dropdown - show all stocks that match search
  const searchResults = stocksData.filter(stock => {
    const matchesSearch = stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         stock.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // For main watchlist - show only favorites when propShowFavoritesOnly is true, but hide when dropdown is open
  const filteredStocks = showSearchDropdown ? [] : stocksData.filter(stock => {
    const matchesSearch = stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         stock.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorites = (propShowFavoritesOnly || showFavoritesOnly) ? favorites.includes(stock.symbol) : true;
    return matchesSearch && matchesFavorites;
  });

  // Sort: favorites first, then by symbol
  const sortedStocks = filteredStocks.sort((a, b) => {
    const aIsFavorite = favorites.includes(a.symbol);
    const bIsFavorite = favorites.includes(b.symbol);
    
    if (aIsFavorite && !bIsFavorite) return -1;
    if (!aIsFavorite && bIsFavorite) return 1;
    return a.symbol.localeCompare(b.symbol);
  });

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between mb-3">
          <span>Watchlist</span>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            {favorites.length} favorites
          </div>
        </CardTitle>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            placeholder="Search stocks..."
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            className="w-full pl-10 pr-8 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setShowSearchDropdown(false);
              }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          
          {/* Search Dropdown */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto w-full">
              {searchResults.map((stock) => (
                <div 
                  key={stock.symbol}
                  className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-b-0"
                  onClick={() => handleStockSelectFromSearch(stock.symbol)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-card-foreground">
                        {stock.symbol}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{stock.name}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(stock.symbol, e);
                    }}
                    className="hover:scale-110 transition-transform p-1"
                  >
                    <Star 
                      className={`w-4 h-4 ${
                        favorites.includes(stock.symbol) 
                          ? 'fill-yellow-400 text-yellow-400' 
                          : 'text-muted-foreground hover:text-yellow-400'
                      }`} 
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-y-auto pb-4">
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p>Loading stock data...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-red-600 mb-2">{error}</p>
              <p className="text-sm">Using fallback data</p>
            </div>
          ) : showSearchDropdown ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Search results appear in dropdown above</p>
              <p className="text-sm">Click on a stock to select it</p>
            </div>
          ) : sortedStocks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No stocks found</p>
              {searchQuery && (
                <p className="text-sm">Try adjusting your search</p>
              )}
            </div>
          ) : (
            sortedStocks.map((stock) => (
              <div 
                key={stock.symbol} 
                className={`
                  flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md
                  ${selectedStock === stock.symbol 
                    ? 'border-primary bg-primary/5 shadow-sm' 
                    : 'border-border hover:border-primary/50'
                  }
                `}
                onClick={() => onStockSelect(stock.symbol)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={(e) => toggleFavorite(stock.symbol, e)}
                      className="hover:scale-110 transition-transform"
                    >
                      <Star 
                        className={`w-4 h-4 ${
                          favorites.includes(stock.symbol) 
                            ? 'fill-yellow-400 text-yellow-400' 
                            : 'text-muted-foreground hover:text-yellow-400'
                        }`} 
                      />
                    </button>
                    <span className={`font-medium ${selectedStock === stock.symbol ? 'text-primary' : 'text-card-foreground'}`}>
                      {stock.symbol}
                    </span>
                    {stock.price > 0 && (
                      <Badge variant={stock.changePercent > 0 ? 'default' : 'destructive'} className="text-xs flex items-center gap-1">
                        {stock.changePercent > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {Math.abs(stock.changePercent).toFixed(2)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{stock.name}</p>
                </div>
                {stock.price > 0 && (
                  <div className="text-right">
                    <p className={`font-medium ${selectedStock === stock.symbol ? 'text-primary' : 'text-card-foreground'}`}>
                      {stock.price.toLocaleString()}
                    </p>
                    <p className={`text-sm ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(0)}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}