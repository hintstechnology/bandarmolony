import { useState, useEffect } from 'react';
import { Watchlist } from './Watchlist';
import { TechnicalAnalysisTradingView } from '../technical-analysis/TechnicalAnalysisTradingView';

interface WatchlistChartSectionProps {
  selectedStock: string;
  onStockSelect: (symbol: string) => void;
}

export function WatchlistChartSection({ selectedStock, onStockSelect }: WatchlistChartSectionProps) {
  const [timeframe, setTimeframe] = useState('1D');
  const [isChartLoading, setIsChartLoading] = useState(false);

  // Reset loading when selectedStock changes
  useEffect(() => {
    setIsChartLoading(true);
    const timer = setTimeout(() => setIsChartLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [selectedStock]);

  const handleStockSelect = (symbol: string) => {
    if (symbol !== selectedStock) {
      onStockSelect(symbol);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-6" data-watchlist-section>
      <div className="xl:col-span-1 order-2 xl:order-1">
        <div className="h-[300px] sm:h-[400px] md:h-[500px] xl:h-[620px]">
          <Watchlist 
            selectedStock={selectedStock}
            onStockSelect={handleStockSelect}
            showFavoritesOnly={true}
          />
        </div>
      </div>
      <div className="xl:col-span-2 order-1 xl:order-2">
        <div className="relative h-[300px] sm:h-[400px] md:h-[500px] xl:h-[620px]">
          {/* Chart Loading Overlay */}
          {isChartLoading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Loading chart data...</p>
              </div>
            </div>
          )}
          
          <TechnicalAnalysisTradingView 
            selectedStock={selectedStock} 
            hideControls={true} 
            styleProp="candles" 
            timeframeProp={timeframe} 
            showStockSymbol={true}
            timeframeOptions={['1D','3D','5D','1W','2W','3W','1M','3M','6M','1Y']}
            onTimeframeChange={(tf) => setTimeframe(tf)}
          />
        </div>
      </div>
    </div>
  );
}

