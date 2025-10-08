import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface OwnershipProps {
  selectedStock?: string;
}

// Function to parse CSV data and create ownership data (from StoryOwnership.tsx)
const parseOwnershipData = () => {
  // Raw CSV data from BBCA.csv (latest data - 2025-08-31)
  const csvData = [
    { name: 'PT Dwimuria Investama Andalan', percentage: 54.942, shares: 67729950000, category: 'Controlling Shareholder' },
    { name: 'Masyarakat Non Warkat', percentage: 42.463, shares: 52346743930, category: 'Public/Retail' },
    { name: 'Pihak Afiliasi Pengendali', percentage: 2.455, shares: 3026977500, category: 'Affiliate' },
    { name: 'Jahja Setiaatmadja', percentage: 0.03, shares: 34805144, category: 'Board Member' },
    { name: 'Saham Treasury', percentage: 0.023, shares: 28317500, category: 'Treasury' },
    { name: 'Robert Budi Hartono', percentage: 0.023, shares: 28135000, category: 'Major Shareholder' },
    { name: 'Bambang Hartono', percentage: 0.022, shares: 27025000, category: 'Major Shareholder' },
    { name: 'Masyarakat Warkat', percentage: 0.009, shares: 11248880, category: 'Public/Retail' },
    { name: 'Tan Ho Hien/Subur', percentage: 0.009, shares: 11169044, category: 'Board Member' },
    { name: 'Tonny Kusnadi', percentage: 0.006, shares: 7502058, category: 'Board Member' },
    { name: 'Others', percentage: 0.017, shares: 21000000, category: 'Others' }
  ];

  // Separate major and minor shareholders
  const majorShareholders = csvData.filter(item => item.percentage >= 2);
  const minorShareholders = csvData.filter(item => item.percentage < 2);
  
  // Calculate total for others
  const othersTotal = minorShareholders.reduce((sum, item) => ({
    percentage: sum.percentage + item.percentage,
    shares: sum.shares + item.shares
  }), { percentage: 0, shares: 0 });

  // Combine data
  const combinedData = [
    ...majorShareholders,
    { name: 'Others', percentage: othersTotal.percentage, shares: othersTotal.shares, category: 'Others' }
  ];

  const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981'];

  return combinedData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length]
  }));
};

// Complete detailed ownership data from BBCA.csv (all shareholders)
const detailedOwnership = [
  {
    rank: 1,
    holder: 'PT Dwimuria Investama Andalan',
    type: 'Lebih dari 5%',
    shares: 67729950000,
    percentage: 54.942,
    value: 315045367500,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 2,
    holder: 'Masyarakat Non Warkat',
    type: 'Masyarakat Non Warkat',
    shares: 52346743930,
    percentage: 42.463,
    value: 243412359975,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 3,
    holder: 'Pihak Afiliasi Pengendali',
    type: 'Lebih dari 5%',
    shares: 3026977500,
    percentage: 2.455,
    value: 14075455375,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 4,
    holder: 'Jahja Setiaatmadja',
    type: 'Komisaris',
    shares: 34805144,
    percentage: 0.03,
    value: 161843920,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 5,
    holder: 'Saham Treasury',
    type: 'Saham Treasury',
    shares: 28317500,
    percentage: 0.023,
    value: 131676375,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 6,
    holder: 'Robert Budi Hartono',
    type: 'Lebih dari 5%',
    shares: 28135000,
    percentage: 0.023,
    value: 130827750,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 7,
    holder: 'Bambang Hartono',
    type: 'Lebih dari 5%',
    shares: 27025000,
    percentage: 0.022,
    value: 125666250,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 8,
    holder: 'Masyarakat Warkat',
    type: 'Masyarakat Warkat',
    shares: 11248880,
    percentage: 0.009,
    value: 52307292,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 9,
    holder: 'Tan Ho Hien/Subur disebut juga Subur Tan',
    type: 'Direksi',
    shares: 11169044,
    percentage: 0.009,
    value: 51936055,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 10,
    holder: 'Tonny Kusnadi',
    type: 'Komisaris',
    shares: 7502058,
    percentage: 0.006,
    value: 34884570,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  }
];

// Get ownership data
const ownershipData = parseOwnershipData();

const formatNumber = (num: number): string => {
  if (num >= 1000000000) {
    return `${(num / 1000000000).toFixed(1)}B`;
  } else if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  return num.toLocaleString();
};

export function Ownership({ selectedStock = 'BBRI' }: OwnershipProps) {
  return (
    <div>
        <div className="space-y-2">
          {/* Ownership Distribution Chart and Top Shareholders Table */}
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
             {/* Pie Chart */}
             <div className="flex justify-center items-center h-80">
               <div className="h-72 w-72">
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={ownershipData}
                       cx="50%"
                       cy="50%"
                       innerRadius={60}
                       outerRadius={120}
                       paddingAngle={2}
                       dataKey="percentage"
                       nameKey="name"
                     >
                       {ownershipData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                     </Pie>
                     <Tooltip 
                       formatter={(value, name, props) => [
                         `${value}%`,
                         props.payload.name
                       ]}
                       contentStyle={{
                         backgroundColor: 'hsl(var(--popover))',
                         border: '1px solid hsl(var(--border))',
                         borderRadius: '6px',
                         fontSize: '12px',
                         color: 'hsl(var(--popover-foreground))'
                       }}
                       labelStyle={{
                         color: 'hsl(var(--popover-foreground))'
                       }}
                     />
                   </PieChart>
                 </ResponsiveContainer>
               </div>
             </div>

             {/* Top Shareholders Table */}
             <div className="flex flex-col justify-center h-80">
              <div className="overflow-y-auto">
                <table className="w-full text-xs">
                   <thead className="sticky top-0 bg-muted/50">
                     <tr className="border-b border-border">
                       <th className="text-left p-1.5 text-foreground">Shareholder</th>
                       <th className="text-right p-1.5 text-foreground">%</th>
                       <th className="text-right p-1.5 text-foreground">Shares</th>
                     </tr>
                   </thead>
                  <tbody>
                    {ownershipData.map((owner, index) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-1.5">
                          <div className="flex items-center gap-1.5">
                            <div 
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: owner.color }}
                            ></div>
                            <span className="truncate text-foreground text-xs leading-tight" title={owner.name}>
                              {owner.name.length > 20 ? owner.name.substring(0, 20) + '...' : owner.name}
                    </span>
                          </div>
                        </td>
                        <td className="p-1.5 text-right font-medium text-foreground text-xs">{owner.percentage}%</td>
                        <td className="p-1.5 text-right text-foreground text-xs">{formatNumber(owner.shares)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}