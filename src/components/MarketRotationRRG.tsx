import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// Sample RRG data
const sectorData = [
  { name: 'Technology', rsRatio: 102.5, rsMomentum: 101.8, performance: 2.5, color: '#3B82F6' },
  { name: 'Healthcare', rsRatio: 98.2, rsMomentum: 104.2, performance: 1.8, color: '#10B981' },
  { name: 'Finance', rsRatio: 95.8, rsMomentum: 96.5, performance: -1.2, color: '#EF4444' },
  { name: 'Energy', rsRatio: 106.3, rsMomentum: 99.2, performance: 3.1, color: '#F59E0B' },
  { name: 'Consumer', rsRatio: 99.5, rsMomentum: 102.1, performance: 0.8, color: '#8B5CF6' },
  { name: 'Industrial', rsRatio: 101.2, rsMomentum: 98.7, performance: 1.2, color: '#06B6D4' },
  { name: 'Materials', rsRatio: 97.8, rsMomentum: 100.5, performance: -0.5, color: '#84CC16' },
  { name: 'Utilities', rsRatio: 94.2, rsMomentum: 95.8, performance: -2.1, color: '#EC4899' },
];

const stockData = [
  { name: 'BBRI', rsRatio: 103.2, rsMomentum: 102.5, performance: 2.8, color: '#3B82F6' },
  { name: 'BBCA', rsRatio: 98.5, rsMomentum: 99.2, performance: -0.5, color: '#EF4444' },
  { name: 'BMRI', rsRatio: 101.8, rsMomentum: 103.1, performance: 1.9, color: '#10B981' },
  { name: 'TLKM', rsRatio: 96.2, rsMomentum: 97.8, performance: -1.8, color: '#F59E0B' },
  { name: 'ASII', rsRatio: 104.5, rsMomentum: 101.2, performance: 3.2, color: '#8B5CF6' },
  { name: 'UNVR', rsRatio: 99.8, rsMomentum: 100.5, performance: 0.3, color: '#06B6D4' },
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
        <p className="text-sm text-muted-foreground">RS-Ratio: {data.rsRatio}</p>
        <p className="text-sm text-muted-foreground">RS-Momentum: {data.rsMomentum}</p>
        <p className="text-sm text-muted-foreground">Performance: {data.performance}%</p>
      </div>
    );
  }
  return null;
};

export function MarketRotationRRG() {
  const [viewMode, setViewMode] = useState<'sector' | 'stock'>('sector');
  
  const currentData = viewMode === 'sector' ? sectorData : stockData;

  const getBadgeVariant = (trend: string) => {
    switch (trend) {
      case 'STRONG': return 'default';
      case 'IMPROVING': return 'secondary';
      case 'WEAKENING': return 'outline';
      case 'WEAK': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">View Mode:</span>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'sector' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('sector')}
          >
            Sector
          </Button>
          <Button
            variant={viewMode === 'stock' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('stock')}
          >
            Stock
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* RRG Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Rotation Chart</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart data={currentData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  type="number" 
                  dataKey="rsRatio" 
                  domain={[90, 110]}
                  name="RS-Ratio"
                  className="text-muted-foreground"
                />
                <YAxis 
                  type="number" 
                  dataKey="rsMomentum" 
                  domain={[90, 110]}
                  name="RS-Momentum"
                  className="text-muted-foreground"
                />
                <ReferenceLine x={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
                <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
                <Tooltip content={<CustomTooltip />} />
                <Scatter dataKey="rsMomentum" fill="hsl(var(--chart-1))">
                  {currentData.map((entry, index) => (
                    <Scatter key={index} fill={entry.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            
            {/* Quadrant Labels */}
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div className="text-center">
                <span className="text-blue-600 font-medium">Improving</span>
                <p className="text-xs text-muted-foreground">Low RS-Ratio, High RS-Momentum</p>
              </div>
              <div className="text-center">
                <span className="text-green-600 font-medium">Leading</span>
                <p className="text-xs text-muted-foreground">High RS-Ratio, High RS-Momentum</p>
              </div>
              <div className="text-center">
                <span className="text-red-600 font-medium">Lagging</span>
                <p className="text-xs text-muted-foreground">Low RS-Ratio, Low RS-Momentum</p>
              </div>
              <div className="text-center">
                <span className="text-yellow-600 font-medium">Weakening</span>
                <p className="text-xs text-muted-foreground">High RS-Ratio, Low RS-Momentum</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard Momentum Screener */}
        <Card>
          <CardHeader>
            <CardTitle>Relative Momentum</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Header */}
              <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                <div>Symbol</div>
                <div>Sector</div>
                <div>RS-Ratio</div>
                <div>RS-Momentum</div>
                <div>Performance</div>
                <div>Trend</div>
              </div>
              
              {/* Data Rows */}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {screenerData.map((item, index) => (
                  <div key={index} className="grid grid-cols-6 gap-2 text-xs items-center py-2 border-b border-border/50">
                    <div className="font-medium text-card-foreground">{item.symbol}</div>
                    <div className="text-muted-foreground">{item.sector}</div>
                    <div className="text-card-foreground">
                      {item.rsRatio.toFixed(1)}
                    </div>
                    <div className="text-card-foreground">
                      {item.rsMomentum.toFixed(1)}
                    </div>
                    <div className={item.performance >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {item.performance >= 0 ? '+' : ''}{item.performance}%
                    </div>
                    <div>
                      <Badge variant={getBadgeVariant(item.trend)} className="text-xs">
                        {item.trend}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}