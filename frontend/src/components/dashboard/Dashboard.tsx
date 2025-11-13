import { useState, useRef, useEffect } from 'react';
import { Watchlist } from './Watchlist';
import { TechnicalAnalysisTradingView } from '../technical-analysis/TechnicalAnalysisTradingView';
import { StockTransactionDoneSummary } from '../stock-transaction/StockTransactionDoneSummary';
import { BrokerSummaryPage } from '../broker-activity/BrokerSummaryPage';
import { StoryMarketParticipant } from '../story/StoryMarketParticipant';
import { StoryOwnershipSummary } from '../story/StoryOwnershipSummary';
import { StoryForeignFlowAnalysis } from '../story/StoryForeignFlowAnalysis';
import { BrokerInventoryPage } from '../broker-activity/BrokerInventoryPage';
import { CollapsibleSection } from './CollapsibleSection';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { TrendingUp, Calendar, BarChart3, Sparkles } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export function Dashboard() {
  const { showToast } = useToast();
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [timeframe, setTimeframe] = useState('1D');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [isChartLoading, setIsChartLoading] = useState(false);
  const analysisSectionRef = useRef<HTMLDivElement>(null);
  const overflowGuardClasses = 'w-full max-w-full overflow-x-auto md:overflow-x-visible';
  const shrinkWrapClasses = 'min-w-0 [&_*]:min-w-0';

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
    <div className="min-h-screen space-y-3 sm:space-y-4 md:space-y-6 p-2 sm:p-3 md:p-4 lg:p-6 overflow-x-hidden">
      {/* Shortcut Section */}
      <Card>
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
      
      {/* Analysis Sections */}
      <div ref={analysisSectionRef} className="space-y-4 sm:space-y-6">
        {/* Done Summary Section */}
        <CollapsibleSection 
          title={`Done Summary - ${selectedStock}`}
          subtitle="Price analysis with buy/sell frequency and lot data"
          defaultExpanded={expandedSections['done-summary'] || false}
        >
          {/* Guard overflow so inner grids/inputs can't push the card width */}
          <div className={overflowGuardClasses}>
            {/* Allow descendants to actually shrink inside flex/grid */}
            <div className={shrinkWrapClasses}>
              <StockTransactionDoneSummary selectedStock={selectedStock} />
            </div>
          </div>
        </CollapsibleSection>
      
        {/* Broker Summary Section */}
        <CollapsibleSection 
          title={`Broker Summary - ${selectedStock}`}
          subtitle="Top brokers trading activity and net positions"
          defaultExpanded={expandedSections['broker-summary'] || false}
        >
          <div className={overflowGuardClasses}>
            <div className={shrinkWrapClasses}>
              <BrokerSummaryPage selectedStock={selectedStock} />
            </div>
          </div>
        </CollapsibleSection>
        
        {/* Market Participant Section */}
        <CollapsibleSection 
          title={`Market Participant - ${selectedStock}`}
          subtitle="Local vs Foreign market participation analysis"
          defaultExpanded={expandedSections['market-participant'] || false}
        >
          <div className={overflowGuardClasses}>
            <div className={shrinkWrapClasses}>
              <StoryMarketParticipant selectedStock={selectedStock} hideMarketAnalysis={true} hideForeignFlowAnalysis={true} />
            </div>
          </div>
        </CollapsibleSection>
        
        {/* Ownership and Foreign Flow Section */}
        <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 md:gap-6">
          <div className="flex-1">
            <CollapsibleSection 
              title={`Ownership Structure - ${selectedStock}`}
              subtitle="Shareholding composition and distribution"
              defaultExpanded={expandedSections['ownership-structure'] || false}
            >
              <StoryOwnershipSummary selectedStock={selectedStock} />
            </CollapsibleSection>
          </div>
          
          <div className="flex-1">
            <CollapsibleSection 
              title={`Foreign Flow Analysis - ${selectedStock}`}
              subtitle="Foreign investor buying and selling activity"
              defaultExpanded={expandedSections['foreign-flow'] || false}
            >
              <StoryForeignFlowAnalysis selectedStock={selectedStock} />
            </CollapsibleSection>
          </div>
        </div>
        
        {/* Broker Inventory Section */}
        <CollapsibleSection 
          title={`Broker Inventory Analysis - ${selectedStock}`}
          subtitle="Cumulative net flow for top brokers"
          defaultExpanded={expandedSections['broker-inventory'] || false}
        >
          <div className={overflowGuardClasses}>
            <div className={shrinkWrapClasses}>
              <BrokerInventoryPage 
                selectedStock={selectedStock} 
                defaultSplitView={true}
                hideControls={false}
                onlyShowInventoryChart={true}
              />
            </div>
          </div>
        </CollapsibleSection>
      </div>
      
      {/* Footer spacing */}
      <div className="h-6"></div>
    </div>
  );
}
