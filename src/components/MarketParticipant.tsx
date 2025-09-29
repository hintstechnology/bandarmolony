import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const participantData = [
  { time: "09:00", domestic: 65, foreign: 35, retail: 45, institutional: 55 },
  { time: "10:00", domestic: 68, foreign: 32, retail: 42, institutional: 58 },
  { time: "11:00", domestic: 62, foreign: 38, retail: 48, institutional: 52 },
  { time: "12:00", domestic: 70, foreign: 30, retail: 40, institutional: 60 },
  { time: "13:00", domestic: 66, foreign: 34, retail: 46, institutional: 54 },
  { time: "14:00", domestic: 72, foreign: 28, retail: 38, institutional: 62 },
  { time: "15:00", domestic: 69, foreign: 31, retail: 43, institutional: 57 },
];

export function MarketParticipant() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Participant</CardTitle>
        <p className="text-sm text-muted-foreground">Trading activity breakdown by participant type</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={participantData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="time" className="text-muted-foreground" />
              <YAxis className="text-muted-foreground" />
              <Tooltip 
                formatter={(value) => [`${value}%`, ""]} 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="domestic" 
                stackId="1" 
                stroke="hsl(var(--chart-1))" 
                fill="hsl(var(--chart-1))"
                name="Domestic"
              />
              <Area 
                type="monotone" 
                dataKey="foreign" 
                stackId="1" 
                stroke="hsl(var(--chart-2))" 
                fill="hsl(var(--chart-2))"
                name="Foreign"
              />
            </AreaChart>
          </ResponsiveContainer>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border border-border rounded-lg">
              <p className="text-2xl font-bold" style={{ color: 'hsl(var(--chart-1))' }}>69%</p>
              <p className="text-sm text-muted-foreground">Domestic</p>
            </div>
            <div className="text-center p-4 border border-border rounded-lg">
              <p className="text-2xl font-bold" style={{ color: 'hsl(var(--chart-2))' }}>31%</p>
              <p className="text-sm text-muted-foreground">Foreign</p>
            </div>
            <div className="text-center p-4 border border-border rounded-lg">
              <p className="text-2xl font-bold" style={{ color: 'hsl(var(--chart-3))' }}>43%</p>
              <p className="text-sm text-muted-foreground">Retail</p>
            </div>
            <div className="text-center p-4 border border-border rounded-lg">
              <p className="text-2xl font-bold" style={{ color: 'hsl(var(--chart-4))' }}>57%</p>
              <p className="text-sm text-muted-foreground">Institutional</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}