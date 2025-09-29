import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui-clean/Card';
import { Badge } from './ui-clean/Badge';
import { TrendingUp, TrendingDown } from 'lucide-react';

const watchlistData = [
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
];

interface WatchlistProps {
  selectedStock: string;
  onStockSelect: (symbol: string) => void;
}

export function Watchlist({ selectedStock, onStockSelect }: WatchlistProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Watchlist</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {watchlistData.map((stock) => (
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
                  <span className={`font-medium ${selectedStock === stock.symbol ? 'text-primary' : 'text-card-foreground'}`}>
                    {stock.symbol}
                  </span>
                  <Badge variant={stock.changePercent > 0 ? 'default' : 'destructive'} className="text-xs flex items-center gap-1">
                    {stock.changePercent > 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {Math.abs(stock.changePercent)}%
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">{stock.name}</p>
              </div>
              <div className="text-right">
                <p className={`font-medium ${selectedStock === stock.symbol ? 'text-primary' : 'text-card-foreground'}`}>
                  {stock.price.toLocaleString()}
                </p>
                <p className={`text-sm ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stock.change >= 0 ? '+' : ''}{stock.change}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}