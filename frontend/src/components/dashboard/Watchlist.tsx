import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, Star, Search, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdate?: string;
}

interface WatchlistProps {
  selectedStock: string;
  onStockSelect: (symbol: string) => void;
  showFavoritesOnly?: boolean;
}

export function Watchlist({ selectedStock, onStockSelect, showFavoritesOnly: propShowFavoritesOnly }: WatchlistProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('watchlist-favorites');
    return saved ? JSON.parse(saved) : ['BBRI', 'BBCA', 'BMRI'];
  });
  const showFavoritesOnly = propShowFavoritesOnly || false;
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [stocksData, setStocksData] = useState<StockData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('watchlist-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    let isMounted = true;

    const loadSnapshot = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await api.getWatchlistSnapshot();
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load watchlist snapshot');
        }

        const stocks: StockData[] = response.data.stocks.map((stock: any) => ({
          symbol: stock.symbol,
          name: stock.name || stock.symbol,
          price: Number(stock.price) || 0,
          change: Number(stock.change) || 0,
          changePercent: Number(stock.changePercent) || 0,
          lastUpdate: stock.lastUpdate,
        }));

        if (isMounted) {
          setStocksData(stocks);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Failed to load watchlist data';
          setError(message);
          setStocksData([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleFavorite = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(symbol) ? prev.filter((fav) => fav !== symbol) : [...prev, symbol]
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
    setTimeout(() => setShowSearchDropdown(false), 200);
  };

  const handleStockSelectFromSearch = (symbol: string) => {
    onStockSelect(symbol);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return stocksData
      .filter((stock) => {
        const symbol = stock.symbol.toLowerCase();
        const name = stock.name.toLowerCase();
        return symbol.includes(normalizedSearchQuery) || name.includes(normalizedSearchQuery);
      })
      .slice(0, 50);
  }, [normalizedSearchQuery, stocksData]);

  const filteredStocks = useMemo(() => {
    if (showSearchDropdown) {
      return [];
    }

    return stocksData.filter((stock) => {
      const symbol = stock.symbol.toLowerCase();
      const name = stock.name.toLowerCase();
      const matchesSearch =
        !normalizedSearchQuery || symbol.includes(normalizedSearchQuery) || name.includes(normalizedSearchQuery);
      const matchesFavorites =
        propShowFavoritesOnly || showFavoritesOnly ? favorites.includes(stock.symbol) : true;
      return matchesSearch && matchesFavorites;
    });
  }, [showSearchDropdown, stocksData, normalizedSearchQuery, propShowFavoritesOnly, showFavoritesOnly, favorites]);

  const sortedStocks = useMemo(() => {
    const stocks = [...filteredStocks];
    stocks.sort((a, b) => {
      const aIsFavorite = favorites.includes(a.symbol);
      const bIsFavorite = favorites.includes(b.symbol);

      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
    return stocks;
  }, [filteredStocks, favorites]);

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

          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto w-full">
              {searchResults.map((stock) => {
                const changeClass =
                  stock.change === 0 ? 'text-muted-foreground' : stock.change > 0 ? 'text-green-600' : 'text-red-600';
                const badgeVariant =
                  stock.changePercent === 0
                    ? 'secondary'
                    : stock.changePercent > 0
                      ? 'default'
                      : 'destructive';

                return (
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
                        <Badge variant={badgeVariant} className="text-xs flex items-center gap-1">
                          {stock.changePercent > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : stock.changePercent < 0 ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : null}
                          {stock.changePercent === 0 ? '--' : `${Math.abs(stock.changePercent).toFixed(2)}%`}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{stock.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium text-card-foreground">
                          {stock.price ? stock.price.toLocaleString() : '--'}
                        </p>
                        <p className={`text-sm ${changeClass}`}>
                          {stock.change === 0 ? '--' : `${stock.change > 0 ? '+' : ''}${stock.change.toFixed(0)}`}
                        </p>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto pb-4">
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p>Loading watchlist data...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-red-600 mb-2">{error}</p>
              <p className="text-sm">Watchlist data is unavailable right now.</p>
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
            sortedStocks.map((stock) => {
              const changeClass =
                stock.change === 0 ? 'text-muted-foreground' : stock.change > 0 ? 'text-green-600' : 'text-red-600';
              const badgeVariant =
                stock.changePercent === 0
                  ? 'secondary'
                  : stock.changePercent > 0
                    ? 'default'
                    : 'destructive';

              return (
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
                      <Badge variant={badgeVariant} className="text-xs flex items-center gap-1">
                        {stock.changePercent > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : stock.changePercent < 0 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : null}
                        {stock.changePercent === 0 ? '--' : `${Math.abs(stock.changePercent).toFixed(2)}%`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{stock.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${selectedStock === stock.symbol ? 'text-primary' : 'text-card-foreground'}`}>
                      {stock.price ? stock.price.toLocaleString() : '--'}
                    </p>
                    <p className={`text-sm ${changeClass}`}>
                      {stock.change === 0 ? '--' : `${stock.change > 0 ? '+' : ''}${stock.change.toFixed(0)}`}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
