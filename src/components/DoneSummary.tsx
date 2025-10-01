import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { TrendingUp, Activity } from 'lucide-react';

const summaryData = {
  totalTrades: 128,
  profitableTrades: 95,
  totalProfit: 15750000,
  winRate: 74.2,
  avgProfit: 165789,
  avgLoss: -89234,
  largestWin: 2340000,
  largestLoss: -1230000,
};

export function DoneSummary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Done Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Total Trades</p>
            <p className="text-2xl font-bold text-card-foreground">{summaryData.totalTrades}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-card-foreground">{summaryData.winRate}%</p>
              <Badge variant="default" className="bg-green-100 text-green-800 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Good
              </Badge>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Total P&L</p>
            <p className="text-2xl font-bold text-green-600">
              +{summaryData.totalProfit.toLocaleString()}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Avg Profit</p>
            <p className="text-2xl font-bold text-green-600">
              +{summaryData.avgProfit.toLocaleString()}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Profitable Trades</p>
            <p className="text-xl font-medium text-card-foreground">{summaryData.profitableTrades}/{summaryData.totalTrades}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Avg Loss</p>
            <p className="text-xl font-medium text-red-600">
              {summaryData.avgLoss.toLocaleString()}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Largest Win</p>
            <p className="text-xl font-medium text-green-600">
              +{summaryData.largestWin.toLocaleString()}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Largest Loss</p>
            <p className="text-xl font-medium text-red-600">
              {summaryData.largestLoss.toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}