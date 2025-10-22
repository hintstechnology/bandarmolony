import { useRef, useEffect, useMemo, useState } from 'react';
import { createChart, IChartApi, LineSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { api } from '../../services/api';
import { Loader2 } from 'lucide-react';

interface BrokerInventoryProps {
  selectedStock?: string;
}

interface BrokerInventoryData {
  broker: string;
  date: string;
  inventory: number;
  netFlow: number;
  cumulativeNetFlow: number;
}


// Available brokers (unused for now)
// const AVAILABLE_BROKERS = [
//   'LG', 'MG', 'BR', 'RG', 'CC', 'AK', 'BK', 'DH', 'KZ', 'YU', 'ZP',
//   'AG', 'NI', 'PD', 'SQ', 'SS', 'CIMB', 'UOB', 'COIN', 'NH', 'RG'
// ];

// Broker colors
const getBrokerColor = (broker: string): string => {
  const colors = {
    LG: '#3B82F6', MG: '#10B981', BR: '#8B5CF6', RG: '#F59E0B', CC: '#EC4899',
    AK: '#22C55E', BK: '#06B6D4', DH: '#8B5CF6', KZ: '#84CC16', YU: '#F97316',
    ZP: '#6B7280', AG: '#EF4444', NI: '#F59E0B', PD: '#10B981', SQ: '#8B5CF6',
    SS: '#DC2626', CIMB: '#059669', UOB: '#7C3AED', COIN: '#EA580C', NH: '#BE185D'
  };
  return colors[broker as keyof typeof colors] || '#6B7280';
};

// Fetch broker inventory data from API
const fetchBrokerInventoryData = async (stockCode: string, date: string): Promise<BrokerInventoryData[]> => {
  try {
    const response = await api.getBrokerInventoryData(stockCode, date);
    if (response.success && response.data?.inventoryData) {
      return response.data.inventoryData;
    }
    return [];
  } catch (error) {
    console.error('Error fetching broker inventory data:', error);
    return [];
  }
};

// TradingView-style chart component for broker inventory
const BrokerInventoryChart = ({
  inventoryData,
  selectedBrokers,
}: {
  inventoryData: any[],
  selectedBrokers: string[],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Get theme-aware colors 
  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280'
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clear existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const width = el.clientWidth || 800;
    const height = el.clientHeight || 300;
    const colors = getThemeColors();

    chartRef.current = createChart(el, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.axisTextColor
      },
      grid: {
        horzLines: { color: colors.gridColor, style: 1 },
        vertLines: { color: colors.gridColor, style: 1 }
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any) => {
          let date: Date;
          if (typeof time === 'string') {
            date = new Date(time);
          } else {
            date = new Date(time * 1000);
          }
          const day = date.getDate();
          const month = date.toLocaleDateString('en-US', { month: 'short' });
          return `${day} ${month}`;
        }
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const chart = chartRef.current!;

    try {
      // Add inventory lines for each selected broker
      selectedBrokers.forEach(broker => {
        const lineSeries = chart.addSeries(LineSeries, {
          color: getBrokerColor(broker),
          lineWidth: 2,
          title: broker,
        });

        lineSeries.setData(inventoryData.map(d => ({
          time: d.time,
          value: d[broker] as number,
        })));
      });

      chart.timeScale().fitContent();
    } catch (e) {
      console.error('Broker inventory chart render error:', e);
    }
  }, [inventoryData, selectedBrokers]);

  // Resize responsif
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: Math.max(1, Math.floor(cr.width)),
        height: Math.max(1, Math.floor(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-[280px] w-full relative px-6 pb-8">
      <style>{`
        #tv-attr-logo {
          display: none !important;
        }
        .tv-attr-logo {
          display: none !important;
        }
        [data-tv-attr-logo] {
          display: none !important;
        }
      `}</style>

      {/* Axis Labels */}
      <div
        className="absolute top-1/2 -left-20 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: 'center',
          zIndex: 10
        }}
      >
        Kumulatif Net Flow (lot)
      </div>
      <div
        className="absolute -bottom-3 left-1/2 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateX(-50%)',
          zIndex: 10
        }}
      >
        Timeframe
      </div>

      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export function BrokerInventory({ selectedStock = 'BBRI' }: BrokerInventoryProps) {
  // Select top 5 brokers for dashboard display
  const selectedBrokers = useMemo(() => ['LG', 'MG', 'BR', 'RG', 'CC'], []);
  
  // API data states
  const [inventoryData, setInventoryData] = useState<Map<string, BrokerInventoryData[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load inventory data when selected stock changes
  useEffect(() => {
    const loadInventoryData = async () => {
      if (!selectedStock) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const newInventoryData = new Map<string, BrokerInventoryData[]>();
        
        // Load data for the last 30 days
        const today = new Date();
        for (let i = 0; i < 30; i++) {
          const currentDate = new Date(today);
          currentDate.setDate(currentDate.getDate() - i);
          const dateStr = currentDate.toISOString().split('T')[0]?.replace(/-/g, '') || '';
          
          const data = await fetchBrokerInventoryData(selectedStock, dateStr);
          if (data.length > 0) {
            newInventoryData.set(dateStr, data);
          }
        }
        
        setInventoryData(newInventoryData);
      } catch (err) {
        setError('Failed to load inventory data');
        console.error('Error loading inventory data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadInventoryData();
  }, [selectedStock]);

  // Convert inventory data to chart format
  const chartData = useMemo(() => {
    const data: any[] = [];
    const days = 30; // Last 30 days

    for (let i = 0; i < days; i++) {
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() - (days - 1 - i));
      const timeStr = currentDate.toISOString().split('T')[0] || '';
      const dateStr = timeStr.replace(/-/g, '');

      const dayData: any = { time: timeStr };

      selectedBrokers.forEach(broker => {
        const brokerData = inventoryData.get(dateStr)?.find(d => d.broker === broker);
        dayData[broker] = brokerData ? brokerData.cumulativeNetFlow : 0;
      });

      data.push(dayData);
    }

    return data;
  }, [inventoryData, selectedBrokers]);

  return (
    <div>
      <div className="space-y-4">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Loading inventory data...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-center justify-center py-8 text-red-600">
            <span>{error}</span>
          </div>
        )}

        {/* Chart */}
        {!isLoading && !error && (
          <BrokerInventoryChart
            inventoryData={chartData}
            selectedBrokers={selectedBrokers}
          />
        )}
        
        {/* Legend */}
        {!isLoading && !error && (
          <div className="flex flex-wrap gap-3 justify-center mt-6">
            {selectedBrokers.map(broker => (
              <div key={broker} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: getBrokerColor(broker) }}
                />
                <span className="text-sm font-medium">{broker}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
