import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

const brokerData = [
  { 
    broker: "INDO", 
    volume: 2800000, 
    value: 14200000000, 
    percentage: 23.5,
    buyLot: 1800000,
    sellLot: 1200000,
    netLot: 600000, // buyLot - sellLot
    isBig5: true
  },
  { 
    broker: "MIRA", 
    volume: 2200000, 
    value: 11800000000, 
    percentage: 18.7,
    buyLot: 1100000,
    sellLot: 1400000,
    netLot: -300000, // buyLot - sellLot  
    isBig5: true
  },
  { 
    broker: "TRAM", 
    volume: 1900000, 
    value: 9650000000, 
    percentage: 15.8,
    buyLot: 1300000,
    sellLot: 900000,
    netLot: 400000, // buyLot - sellLot
    isBig5: true
  },
  { 
    broker: "TRIM", 
    volume: 1600000, 
    value: 8200000000, 
    percentage: 13.2,
    buyLot: 700000,
    sellLot: 1100000,
    netLot: -400000, // buyLot - sellLot
    isBig5: true
  },
  { 
    broker: "CITI", 
    volume: 1400000, 
    value: 7100000000, 
    percentage: 11.6,
    buyLot: 900000,
    sellLot: 800000,
    netLot: 100000, // buyLot - sellLot
    isBig5: true
  },
  { 
    broker: "Others", 
    volume: 2100000, 
    value: 10550000000, 
    percentage: 17.2,
    buyLot: 1000000,
    sellLot: 1200000,
    netLot: -200000, // buyLot - sellLot
    isBig5: false
  },
];

// Custom bar component for dynamic coloring
const CustomBar = (props: any) => {
  const { payload, ...rest } = props;
  const color = payload?.netLot >= 0 ? '#10B981' : '#EF4444'; // Green for buy, red for sell
  return <Bar {...rest} fill={color} />;
};

export function BrokerSummary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Broker Summary</CardTitle>
        <p className="text-sm text-muted-foreground">Top brokers by trading volume with net position trends</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Volume Chart */}
          <div>
            <h4 className="text-sm font-medium mb-3">Trading Volume</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={brokerData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="broker" className="text-muted-foreground" />
                <YAxis className="text-muted-foreground" />
                <Tooltip 
                  formatter={(value, name) => [
                    value.toLocaleString(),
                    "Volume"
                  ]}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Bar dataKey="volume" name="volume">
                  {brokerData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.isBig5 ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-3))'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Net Position Trend Chart */}
          <div>
            <h4 className="text-sm font-medium mb-3">Net Position Trend</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={brokerData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="broker" className="text-muted-foreground" />
                <YAxis className="text-muted-foreground" />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                <Tooltip 
                  formatter={(value: number, name) => [
                    `${value > 0 ? '+' : ''}${value.toLocaleString()}`,
                    value >= 0 ? "Net Buy" : "Net Sell"
                  ]}
                  labelFormatter={(label) => `Broker: ${label}`}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Bar dataKey="netLot" name="netLot">
                  {brokerData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.netLot >= 0 ? '#10B981' : '#EF4444'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Broker Cards with Enhanced Info */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {brokerData.map((broker) => (
              <div 
                key={broker.broker} 
                className={`p-3 border rounded-lg ${
                  broker.isBig5 
                    ? 'bg-accent/50 border-primary/20' 
                    : 'border-border'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-card-foreground">{broker.broker}</p>
                      {broker.isBig5 && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          Big 5
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{broker.percentage}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-card-foreground">
                      {broker.volume.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Volume</p>
                  </div>
                </div>
                
                {/* Net Position Info */}
                <div className="flex justify-between items-center pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">Net Position:</span>
                  <span className={`text-xs font-medium ${
                    broker.netLot >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {broker.netLot >= 0 ? '+' : ''}{broker.netLot.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                  <span>Buy: {broker.buyLot.toLocaleString()}</span>
                  <span>Sell: {broker.sellLot.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-xs text-muted-foreground">Net Buy Position</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span className="text-xs text-muted-foreground">Net Sell Position</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-primary/20 border border-primary/40 rounded"></div>
              <span className="text-xs text-muted-foreground">Big 5 Broker</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}