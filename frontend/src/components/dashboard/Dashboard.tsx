import { useState, useRef, useEffect } from 'react';
import { Watchlist } from './Watchlist';
import { TechnicalAnalysisTradingView } from '../technical-analysis/TechnicalAnalysisTradingView';
import { DoneSummary } from '../stock-transaction/DoneSummary';
import { BrokerSummary } from '../broker-activity/BrokerSummary';
import { MarketParticipant } from '../broker-activity/MarketParticipant';
import { Ownership } from '../broker-activity/Ownership';
import { ForeignFlow } from '../broker-activity/ForeignFlow';
import { BrokerInventory } from '../broker-activity/BrokerInventory';
import { CollapsibleSection } from './CollapsibleSection';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { TrendingUp, Calendar, BarChart3, Sparkles, ChartCandlestick } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export function Dashboard() {
  const { showToast } = useToast();
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [timeframe, setTimeframe] = useState('1D');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [isChartLoading, setIsChartLoading] = useState(false);
  const analysisSectionRef = useRef<HTMLDivElement>(null);

  // Check for email verification success toast
  useEffect(() => {
    const showVerificationToast = localStorage.getItem('showEmailVerificationSuccessToast');
    if (showVerificationToast === 'true') {
      // Remove flag immediately
      localStorage.removeItem('showEmailVerificationSuccessToast');
      
      // Show welcome toast
      showToast({
        type: 'success',
        title: 'Email Berhasil Diverifikasi! 🎉',
        message: 'Selamat datang di BandarmoloNY! Akun Anda sudah aktif.',
      });
    }
  }, [showToast]);

  const handleStockSelect = (symbol: string) => {
    if (symbol !== selectedStock) {
      setIsChartLoading(true);
      setSelectedStock(symbol);
      // Reset loading state after a delay to allow chart to load
      setTimeout(() => setIsChartLoading(false), 2000);
    }
  };

  const handleBandarmologyClick = () => {
    // Scroll to watchlist section (start of dashboard content)
    const watchlistSection = document.querySelector('[data-watchlist-section]');
    if (watchlistSection) {
      watchlistSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Expand all sections
    setExpandedSections({
      'done-summary': true,
      'broker-summary': true,
      'market-participant': true,
      'ownership-structure': true,
      'foreign-flow': true,
      'broker-inventory': true,
    });
  };

  const handleBazimologyClick = () => {
    // Navigate to astrology page
    window.location.href = '/astrology';
  };

  return (
    <div className="min-h-screen space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Shortcut Section */}
      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-center text-lg font-semibold text-primary flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" />
            Quick Access
            <Sparkles className="w-5 h-5" />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-2xl mx-auto">
            {/* Bandarmology Button */}
            <div className="group">
              <Button 
                onClick={handleBandarmologyClick}
                className="w-full h-20 sm:h-24 flex flex-col items-center justify-center gap-1 sm:gap-2 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 rounded-lg"
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <BarChart3 className="w-5 h-5 sm:w-7 sm:h-7" />
                  <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6" />
                </div>
                <span className="font-semibold text-sm sm:text-base">Bandarmology</span>
              </Button>
            </div>
            
            {/* Bazimology Button */}
            <div className="group">
              <Button 
                onClick={handleBazimologyClick}
                variant="outline"
                className="w-full h-20 sm:h-24 flex flex-col items-center justify-center gap-1 sm:gap-2 bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 rounded-lg"
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <Calendar className="w-5 h-5 sm:w-7 sm:h-7" />
                  <Sparkles className="w-4 h-4 sm:w-6 sm:h-6" />
                </div>
                <span className="font-semibold text-sm sm:text-base">Bazimology</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Section - Watchlist and Main Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6" data-watchlist-section>
        <div className="xl:col-span-1 order-2 xl:order-1">
          <div className="h-[400px] md:h-[620px]">
            <Watchlist 
              selectedStock={selectedStock}
              onStockSelect={handleStockSelect}
              showFavoritesOnly={true}
            />
          </div>
        </div>
         <div className="xl:col-span-2 order-1 xl:order-2">
          <div className="relative h-[400px] md:h-[620px]">
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
              <div className="h-9 w-20 flex items-center justify-center px-3 rounded bg-background/70 backdrop-blur-sm border border-border text-card-foreground text-sm font-medium font-sans uppercase tracking-wide text-center whitespace-nowrap">
                {selectedStock}
              </div>
              <div className="flex items-center gap-1 p-1 rounded border border-border bg-background/70 backdrop-blur-sm">
                <ChartCandlestick className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">OHLC</span>
              </div>
              {/* Timeframe dropdown */}
              <div className="p-1 rounded border border-border bg-background/70 backdrop-blur-sm">
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="px-2 py-1 text-xs rounded bg-background text-foreground focus:outline-none"
                  title="Timeframe"
                  aria-label="Timeframe"
                >
                  {['1D','3D','5D','1W','2W','3W','1M','3M','6M','1Y'].map(tf => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Chart Loading Overlay */}
            {isChartLoading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading chart data...</p>
                </div>
              </div>
            )}
            
            <TechnicalAnalysisTradingView selectedStock={selectedStock} hideControls={true} styleProp="candles" timeframeProp={timeframe} />
          </div>
        </div>
      </div>
      
      {/* Analysis Sections */}
      <div ref={analysisSectionRef} className="space-y-6">
        {/* Done Summary Section */}
        <CollapsibleSection 
          title={`Done Summary - ${selectedStock}`}
          subtitle="Price analysis with buy/sell frequency and lot data"
          defaultExpanded={expandedSections['done-summary'] || false}
        >
          <DoneSummary selectedStock={selectedStock} />
        </CollapsibleSection>
      
        {/* Broker Summary Section */}
        <CollapsibleSection 
          title={`Broker Summary - ${selectedStock}`}
          subtitle="Top brokers trading activity and net positions"
          defaultExpanded={expandedSections['broker-summary'] || false}
        >
          <BrokerSummary selectedStock={selectedStock} />
        </CollapsibleSection>
        
        {/* Market Participant Section */}
        <CollapsibleSection 
          title={`Market Participant - ${selectedStock}`}
          subtitle="Local vs Foreign market participation analysis"
          defaultExpanded={expandedSections['market-participant'] || false}
        >
          <MarketParticipant selectedStock={selectedStock} />
        </CollapsibleSection>
        
        {/* Ownership and Foreign Flow Section */}
        <div className="flex flex-col xl:flex-row gap-4 md:gap-6">
          <div className="flex-1">
            <CollapsibleSection 
              title={`Ownership Structure - ${selectedStock}`}
              subtitle="Shareholding composition and distribution"
              defaultExpanded={expandedSections['ownership-structure'] || false}
            >
              <Ownership selectedStock={selectedStock} />
            </CollapsibleSection>
          </div>
          
          <div className="flex-1">
            <CollapsibleSection 
              title={`Foreign Flow Analysis - ${selectedStock}`}
              subtitle="Foreign investor buying and selling activity"
              defaultExpanded={expandedSections['foreign-flow'] || false}
            >
              <ForeignFlow selectedStock={selectedStock} />
            </CollapsibleSection>
          </div>
        </div>
        
        {/* Broker Inventory Section */}
        <CollapsibleSection 
          title={`Broker Inventory Analysis - ${selectedStock}`}
          subtitle="Cumulative net flow for top brokers"
          defaultExpanded={expandedSections['broker-inventory'] || false}
        >
          <BrokerInventory selectedStock={selectedStock} />
        </CollapsibleSection>
      </div>
      
      {/* Footer spacing */}
      <div className="h-6"></div>
    </div>
  );
}

