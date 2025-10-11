import { useRef, useEffect, useMemo } from 'react';
import { createChart, IChartApi, LineSeries, ColorType, CrosshairMode } from 'lightweight-charts';

interface BrokerInventoryProps {
  selectedStock?: string;
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

// Generate inventory data for selected brokers
const generateInventoryData = (_ticker: string, selectedBrokers: string[]) => {
  const data: any[] = [];
  const days = 30; // Last 30 days

  for (let i = 0; i < days; i++) {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() - (days - 1 - i));
    const timeStr = currentDate.toISOString().split('T')[0];

    const dayData: any = { time: timeStr };

    selectedBrokers.forEach(broker => {
      // Start from 0, simulate cumulative net flow changes
      const baseValue = i === 0 ? 0 : (Math.random() - 0.5) * 20;
      const trend = Math.sin(i * 0.1) * 10; // Some trend
      const noise = (Math.random() - 0.5) * 5; // Random noise

      dayData[broker] = Math.round(baseValue + trend + noise);
    });

    data.push(dayData);
  }

  return data;
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

  // Generate inventory data
  const inventoryData = useMemo(() =>
    generateInventoryData(selectedStock, selectedBrokers),
    [selectedStock, selectedBrokers]
  );

  return (
    <div>
      <div className="space-y-4">
        {/* Chart */}
        <BrokerInventoryChart
          inventoryData={inventoryData}
          selectedBrokers={selectedBrokers}
        />
        
        {/* Legend */}
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
      </div>
    </div>
  );
}
