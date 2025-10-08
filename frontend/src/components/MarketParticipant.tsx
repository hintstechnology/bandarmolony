import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Combined Local vs Foreign data from StoryMarketParticipant.tsx
const combinedStackedDataRaw = [
  { date: '2025-06-30', Local: 17.94, Foreign: 82.06 },
  { date: '2024-09-30', Local: 13.94, Foreign: 86.06 },
  { date: '2025-02-28', Local: 16.52, Foreign: 83.48 },
  { date: '2025-05-28', Local: 17.09, Foreign: 82.91 },
  { date: '2025-03-27', Local: 17.63, Foreign: 82.37 },
  { date: '2025-01-31', Local: 15.73, Foreign: 84.27 },
  { date: '2024-11-29', Local: 14.91, Foreign: 85.09 },
  { date: '2025-04-30', Local: 17.72, Foreign: 82.28 },
  { date: '2024-08-30', Local: 14.36, Foreign: 85.64 },
  { date: '2024-12-30', Local: 15.20, Foreign: 84.80 },
  { date: '2025-08-29', Local: 19.48, Foreign: 80.52 },
  { date: '2024-10-31', Local: 14.20, Foreign: 85.80 },
  { date: '2025-07-31', Local: 18.99, Foreign: 81.01 },
];

// Sort data by date (oldest to newest)
const combinedStackedData = combinedStackedDataRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

interface MarketParticipantProps {
  selectedStock?: string;
}

export function MarketParticipant({ selectedStock = 'BBRI' }: MarketParticipantProps) {
  return (
    <div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={combinedStackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
                formatter={(value, name) => [`${value}%`, name]}
              />
              <Bar dataKey="Local" stackId="combined" fill="#3b82f6" name="Local" />
              <Bar dataKey="Foreign" stackId="combined" fill="#f59e0b" name="Foreign" />
            </BarChart>
          </ResponsiveContainer>
        </div>
    </div>
  );
}