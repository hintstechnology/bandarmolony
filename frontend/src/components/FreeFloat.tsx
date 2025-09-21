import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const freeFloatData = [
  { name: "Free Float", value: 32.5, color: "hsl(var(--chart-1))" },
  { name: "Strategic Holdings", value: 56.75, color: "hsl(var(--chart-2))" },
  { name: "Treasury & Employee", value: 10.75, color: "hsl(var(--chart-3))" },
];

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent
}: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text 
      x={x} 
      y={y} 
      fill="white" 
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
      className="text-sm font-medium"
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
};

export function FreeFloat() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Free Float Analysis</CardTitle>
        <p className="text-sm text-muted-foreground">Available shares for public trading</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={freeFloatData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {freeFloatData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [`${value}%`, ""]} 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          
          <div className="space-y-4">
            <div className="space-y-3">
              {freeFloatData.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-medium text-card-foreground">{item.name}</span>
                  </div>
                  <span className="text-lg font-bold text-card-foreground">{item.value}%</span>
                </div>
              ))}
            </div>
            
            <div className="pt-4 border-t border-border">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">Total Free Float</p>
                <p className="text-3xl font-bold" style={{ color: 'hsl(var(--chart-1))' }}>32.5%</p>
                <p className="text-sm text-muted-foreground">≈ 42.88 Billion Shares</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}