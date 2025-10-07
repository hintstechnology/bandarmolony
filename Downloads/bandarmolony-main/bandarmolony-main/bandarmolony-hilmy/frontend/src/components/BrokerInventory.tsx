import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Package } from 'lucide-react';

const inventoryData = [
  {
    broker: "INDO",
    position: "Long",
    shares: 15750000,
    avgPrice: 4520,
    currentPrice: 4650,
    unrealizedPL: 2047500,
    percentage: 2.1,
  },
  {
    broker: "MIRA", 
    position: "Long",
    shares: 8900000,
    avgPrice: 4580,
    currentPrice: 4650,
    unrealizedPL: 623000,
    percentage: 0.7,
  },
  {
    broker: "TRAM",
    position: "Short", 
    shares: -5200000,
    avgPrice: 4620,
    currentPrice: 4650,
    unrealizedPL: -156000,
    percentage: -0.3,
  },
  {
    broker: "TRIM",
    position: "Long",
    shares: 12300000,
    avgPrice: 4490,
    currentPrice: 4650,
    unrealizedPL: 1968000,
    percentage: 1.9,
  },
  {
    broker: "CITI",
    position: "Long",
    shares: 6750000,
    avgPrice: 4550,
    currentPrice: 4650,
    unrealizedPL: 675000,
    percentage: 0.8,
  },
];

export function BrokerInventory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          Broker Inventory
        </CardTitle>
        <p className="text-sm text-muted-foreground">Current broker positions and P&L</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {inventoryData.map((broker) => (
            <div key={broker.broker} className="p-4 border border-border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg text-card-foreground">{broker.broker}</span>
                  <Badge variant={broker.position === "Long" ? 'default' : 'destructive'}>
                    {broker.position}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    {broker.unrealizedPL >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`font-bold ${broker.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {broker.unrealizedPL >= 0 ? '+' : ''}{broker.unrealizedPL.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{broker.percentage}%</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Shares</p>
                  <p className="font-medium text-card-foreground">{Math.abs(broker.shares).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Avg Price</p>
                  <p className="font-medium text-card-foreground">{broker.avgPrice.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Current Price</p>
                  <p className="font-medium text-card-foreground">{broker.currentPrice.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">P&L per Share</p>
                  <p className={`font-medium ${broker.currentPrice - broker.avgPrice >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {broker.currentPrice - broker.avgPrice >= 0 ? '+' : ''}{broker.currentPrice - broker.avgPrice}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Total Long</p>
              <p className="text-lg font-bold text-green-600">+5.5%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Short</p>
              <p className="text-lg font-bold text-red-600">-0.3%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Net Position</p>
              <p className="text-lg font-bold text-card-foreground">+5.2%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total P&L</p>
              <p className="text-lg font-bold text-green-600">+5.16M</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

