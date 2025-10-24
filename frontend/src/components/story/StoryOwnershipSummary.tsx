import { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface StoryOwnershipSummaryProps {
  selectedStock?: string;
}

export function StoryOwnershipSummary({ selectedStock: propSelectedStock }: StoryOwnershipSummaryProps) {
  const [selectedStock, setSelectedStock] = useState(propSelectedStock || 'BBCA');
  const [loading, setLoading] = useState(false);
  const [shareholdersData, setShareholdersData] = useState<any>(null);
  
  // Cache for API responses (5 minutes)
  const cacheRef = useRef<Map<string, { data: any; timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Fetch shareholders data from API
  const fetchShareholdersData = async (stockCode: string) => {
    // Check cache first
    const cached = cacheRef.current.get(stockCode);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`📊 Using cached shareholders data for ${stockCode}`);
      setShareholdersData(cached.data);
      return;
    }

    setLoading(true);
    try {
      console.log(`📊 Fetching shareholders data for ${stockCode}...`);
      const response = await api.getShareholdersData(stockCode);
      
      if (response.success && response.data) {
        console.log(`✅ Shareholders data loaded for ${stockCode}`, response.data);
        setShareholdersData(response.data);
        
        // Cache the data
        cacheRef.current.set(stockCode, {
          data: response.data,
          timestamp: Date.now()
        });
      } else {
        console.error(`❌ Failed to load shareholders data:`, response.error);
        toast.error(response.error || 'Failed to load shareholders data');
        setShareholdersData(null);
      }
    } catch (error: any) {
      console.error(`❌ Error fetching shareholders data:`, error);
      toast.error(error.message || 'Failed to load shareholders data');
      setShareholdersData(null);
    } finally {
      setLoading(false);
    }
  };

  // Update selectedStock when prop changes
  useEffect(() => {
    if (propSelectedStock && propSelectedStock !== selectedStock) {
      setSelectedStock(propSelectedStock);
    }
  }, [propSelectedStock, selectedStock]);

  // Fetch data when selected stock changes
  useEffect(() => {
    if (selectedStock) {
      fetchShareholdersData(selectedStock);
    }
  }, [selectedStock]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B`;
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    return num.toLocaleString();
  };


  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading ownership data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!shareholdersData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-muted-foreground">No ownership data available for {selectedStock}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Process data for pie chart and top shareholders
  const getOwnershipData = () => {
    if (!shareholdersData?.data?.shareholders || !Array.isArray(shareholdersData.data.shareholders)) {
      return { pieData: [], topShareholders: [] };
    }

    const shareholders = shareholdersData.data.shareholders;
    
    // Get major shareholders (>= 2%)
    const majorShareholders = shareholders
      .filter((s: any) => s.PemegangSaham_Persentase >= 2)
      .map((s: any, idx: number) => ({
        name: s.PemegangSaham_Nama,
        percentage: s.PemegangSaham_Persentase,
        shares: s.PemegangSaham_JmlSaham,
        category: s.PemegangSaham_Kategori,
        color: ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981'][idx % 4]
      }));

    // Get minor shareholders (< 2%) and combine as "Others"
    const minorShareholders = shareholders.filter((s: any) => s.PemegangSaham_Persentase < 2);
    const othersTotal = minorShareholders.reduce((sum: number, s: any) => sum + s.PemegangSaham_Persentase, 0);
    const othersShares = minorShareholders.reduce((sum: number, s: any) => sum + s.PemegangSaham_JmlSaham, 0);

    if (othersTotal > 0) {
      majorShareholders.push({
        name: 'Others',
        percentage: parseFloat(othersTotal.toFixed(3)),
        shares: othersShares,
        category: 'Others',
        color: '#6b7280'
      });
    }

    // Top 5 shareholders for table
    const topShareholders = shareholders.slice(0, 5).map((s: any, idx: number) => ({
      name: s.PemegangSaham_Nama,
      percentage: s.PemegangSaham_Persentase,
      shares: s.PemegangSaham_JmlSaham,
      category: s.PemegangSaham_Kategori
    }));

    return { pieData: majorShareholders, topShareholders };
  };

  const { pieData, topShareholders } = getOwnershipData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{selectedStock} - Ownership Structure</CardTitle>
        <p className="text-sm text-muted-foreground">Shareholding composition and distribution analysis</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Ownership Distribution Chart and Top Shareholders Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
            {/* Pie Chart */}
            <div className="flex justify-center items-center h-80">
              <div className="h-72 w-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="percentage"
                      nameKey="name"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, _name, props) => [
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
                    {topShareholders.map((owner: any, index: number) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-1.5">
                          <div className="flex items-center gap-1.5">
                            <div 
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: pieData[index]?.color || '#6b7280' }}
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
      </CardContent>
    </Card>
  );
}
