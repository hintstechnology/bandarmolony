import { useState, useEffect, useRef, useCallback } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { api } from '../../services/api';

interface StoryForeignFlowAnalysisProps {
  selectedStock?: string;
}

export function StoryForeignFlowAnalysis({ selectedStock: propSelectedStock }: StoryForeignFlowAnalysisProps) {
  const [selectedStock, setSelectedStock] = useState(propSelectedStock || 'BBRI');
  const [foreignFlowDataReal, setForeignFlowDataReal] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [chartKey, setChartKey] = useState(0);
  const isResizingRef = useRef(false);
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 320 });
  const lastResizeTimeRef = useRef(0);

  // Update selectedStock when prop changes
  useEffect(() => {
    if (propSelectedStock && propSelectedStock !== selectedStock) {
      setSelectedStock(propSelectedStock);
    }
  }, [propSelectedStock, selectedStock]);

  // Fetch Foreign Flow data
  useEffect(() => {
    const fetchForeignFlowData = async () => {
      if (!selectedStock) return;
      
      try {
        setLoading(true);
        
        // Fetch Foreign Flow data
        const foreignFlowResponse = await api.getForeignFlowData(selectedStock, 100);
        let foreignData: any[] = [];
        
        if (foreignFlowResponse.success && foreignFlowResponse.data?.data) {
          foreignData = foreignFlowResponse.data.data.map((row: any) => ({
            time: row.Date as any,
            buyVol: row.BuyVol,
            sellVol: row.SellVol,
            netBuyVol: row.NetBuyVol
          }));
          setForeignFlowDataReal(foreignData);
          console.log(`✅ Foreign flow data loaded: ${foreignData.length} records`);
        } else {
          console.warn(`No foreign flow data for ${selectedStock}`);
          setForeignFlowDataReal([]);
        }
        
      } catch (error) {
        console.error('Error fetching foreign flow data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchForeignFlowData();
  }, [selectedStock]);

  // Debounced resize handler to prevent loop - AGGRESSIVE throttling
  const handleResize = useCallback(() => {
    if (isResizingRef.current) return;
    
    const now = Date.now();
    // Throttle resize to max once per 1000ms
    if (now - lastResizeTimeRef.current < 1000) {
      return;
    }
    
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    
    resizeTimeoutRef.current = setTimeout(() => {
      if (containerRef.current && !isResizingRef.current) {
        isResizingRef.current = true;
        lastResizeTimeRef.current = Date.now();
        
        // Set fixed height to prevent vertical scaling loop
        const rect = containerRef.current.getBoundingClientRect();
        setChartDimensions({
          width: Math.max(1, Math.floor(rect.width)),
          height: 320 // Fixed height to prevent loop
        });
        
        setChartKey(prev => prev + 1);
        setTimeout(() => {
          isResizingRef.current = false;
        }, 500);
      }
    }, 1000);
  }, []);

  // Setup resize observer with aggressive debounce - DISABLED ResizeObserver, use window resize only
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initialize dimensions
    const rect = container.getBoundingClientRect();
    setChartDimensions({
      width: Math.max(1, Math.floor(rect.width)),
      height: 320 // Fixed height
    });

    // Only listen to window resize, NOT ResizeObserver (which causes loop)
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [handleResize]);

  // Format numbers with M/B/T prefix
  const formatNumber = (num: number): string => {
    if (num >= 1000000000000) {
      return `${(num / 1000000000000).toFixed(1)}T`;
    } else if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B`;
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  // Custom tooltip formatter
  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-md p-3 shadow-lg">
          <p className="text-sm font-medium text-popover-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              ></div>
              <span className="text-popover-foreground">
                {entry.name}: {formatNumber(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading foreign flow data...</p>
        </div>
      </div>
    );
  }

  if (foreignFlowDataReal.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-muted-foreground">No foreign flow data available for {selectedStock}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{selectedStock} - Foreign Flow Analysis</CardTitle>
        <p className="text-sm text-muted-foreground">
          Foreign investor buying and selling activity. Positive net = Foreign net buy (bullish), Negative net = Foreign net sell (bearish)
        </p>
      </CardHeader>
      <CardContent>
        <div 
          ref={containerRef} 
          className="w-full" 
          style={{ 
            height: '320px', 
            width: '100%',
            position: 'relative',
            overflow: 'hidden',
            minWidth: '100%'
          }}
        >
          <ResponsiveContainer 
            width={chartDimensions.width || '100%'} 
            height={chartDimensions.height || 320} 
            key={`${chartKey}-${chartDimensions.width}-${chartDimensions.height}`}
            debounce={500}
          >
            <ComposedChart 
              data={foreignFlowDataReal} 
              margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="time" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                allowDataOverflow={false}
              />
              <YAxis 
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatNumber}
                label={{ value: 'Volume', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                allowDataOverflow={false}
                width={60}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatNumber}
                label={{ value: 'Net Buy Volume', angle: 90, position: 'insideRight', style: { fontSize: 12 } }}
                allowDataOverflow={false}
                width={80}
              />
              <Tooltip 
                content={customTooltip}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="buyVol" fill="#10b981" name="Foreign Buy" />
              <Bar yAxisId="left" dataKey="sellVol" fill="#ef4444" name="Foreign Sell" />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="netBuyVol" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Net Buy Volume"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
