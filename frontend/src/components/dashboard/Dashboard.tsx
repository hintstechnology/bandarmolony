import { useState, useRef, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { QuickAccessCard } from './QuickAccessCard';
import { WatchlistChartSection } from './WatchlistChartSection';
import { DoneSummaryCard } from './DoneSummaryCard';
import { BrokerSummaryCard } from './BrokerSummaryCard';
import { MarketParticipantCard } from './MarketParticipantCard';
import { OwnershipStructureCard } from './OwnershipStructureCard';
import { ForeignFlowCard } from './ForeignFlowCard';
import { BrokerInventoryCard } from './BrokerInventoryCard';

export function Dashboard() {
  const { showToast } = useToast();
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
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
    setSelectedStock(symbol);
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
      {/* Quick Access Card */}
      <QuickAccessCard 
        onBandarmologyClick={handleBandarmologyClick}
        onBazimologyClick={handleBazimologyClick}
      />

      {/* Watchlist and Chart Section */}
      <WatchlistChartSection 
        selectedStock={selectedStock}
        onStockSelect={handleStockSelect}
      />
      
      {/* Analysis Sections */}
      <div ref={analysisSectionRef} className="space-y-4 sm:space-y-6">
        {/* Done Summary Card */}
        <DoneSummaryCard 
          selectedStock={selectedStock}
          defaultExpanded={expandedSections['done-summary'] || false}
        />
      
        {/* Broker Summary Card */}
        <BrokerSummaryCard 
          selectedStock={selectedStock}
          defaultExpanded={expandedSections['broker-summary'] || false}
        />
        
        {/* Market Participant Card */}
        <MarketParticipantCard 
          selectedStock={selectedStock}
          defaultExpanded={expandedSections['market-participant'] || false}
        />
        
        {/* Ownership and Foreign Flow Section */}
        <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 md:gap-6">
          <div className="flex-1">
            <OwnershipStructureCard 
              selectedStock={selectedStock}
              defaultExpanded={expandedSections['ownership-structure'] || false}
            />
          </div>
          
          <div className="flex-1">
            <ForeignFlowCard 
              selectedStock={selectedStock}
              defaultExpanded={expandedSections['foreign-flow'] || false}
            />
          </div>
        </div>
        
        {/* Broker Inventory Card */}
        <BrokerInventoryCard 
          selectedStock={selectedStock}
          defaultExpanded={expandedSections['broker-inventory'] || false}
        />
      </div>
      
      {/* Footer spacing */}
      <div className="h-6"></div>
    </div>
  );
}
