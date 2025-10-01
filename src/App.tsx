import React, { useState } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { Watchlist } from './components/Watchlist';
import { MainChart } from './components/MainChart';
import { DoneSummary } from './components/DoneSummary';
import { BrokerSummary } from './components/BrokerSummary';
import { MarketParticipant } from './components/MarketParticipant';
import { Ownership } from './components/Ownership';
import { FreeFloat } from './components/FreeFloat';
import { BrokerInventory } from './components/BrokerInventory';
import { MarketRotationRRG } from './components/MarketRotationRRG';
import { MarketRotationRRC } from './components/MarketRotationRRC';
import { MarketRotationSeasonality } from './components/MarketRotationSeasonality';
import { MarketRotationTrendFilter } from './components/MarketRotationTrendFilter';
import { BrokerTransaction } from './components/BrokerTransaction';
import { BrokerSummaryPage } from './components/BrokerSummaryPage';
import { BrokerInventoryPage } from './components/BrokerInventoryPage';
import { StockTransactionDoneSummary } from './components/StockTransactionDoneSummary';
import { StockTransactionDoneDetail } from './components/StockTransactionDoneDetail';
import { StoryAccumulationDistribution } from './components/StoryAccumulationDistribution';
import { StoryMarketParticipant } from './components/StoryMarketParticipant';
import { StoryOwnership } from './components/StoryOwnership';
import { StoryForeignFlow } from './components/StoryForeignFlow';
import { AstrologyLunarCalendar } from './components/AstrologyLunarCalendar';
import { TechnicalAnalysis } from './components/TechnicalAnalysis';
import { TechnicalAnalysisTradingView } from './components/TechnicalAnalysisTradingView';
import { ProfilePage } from './components/ProfilePage';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [currentRoute, setCurrentRoute] = useState('home');

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleStockSelect = (symbol: string) => {
    setSelectedStock(symbol);
  };

  const handleRouteChange = (route: string) => {
    setCurrentRoute(route);
  };

  const renderMainContent = () => {
    switch (currentRoute) {
      case 'market-rotation':
      case 'market-rotation/rrg':
        return <MarketRotationRRG />;
      
      case 'market-rotation/rrc':
        return <MarketRotationRRC />;
      
      case 'market-rotation/seasonality':
        return <MarketRotationSeasonality />;
      
      case 'market-rotation/trend-filter':
        return <MarketRotationTrendFilter />;

      case 'broker-activity':
      case 'broker-activity/transaction':
        return <BrokerTransaction />;

      case 'broker-activity/summary':
        return <BrokerSummaryPage />;

      case 'broker-activity/inventory':
        return <BrokerInventoryPage />;

      case 'stock-transaction':
      case 'stock-transaction/done-summary':
        return <StockTransactionDoneSummary />;

      case 'stock-transaction/done-detail':
        return <StockTransactionDoneDetail />;

      case 'story':
      case 'story/accumulation-distribution':
        return <StoryAccumulationDistribution />;

      case 'story/market-participant':
        return <StoryMarketParticipant />;

      case 'story/ownership':
        return <StoryOwnership />;

      case 'story/foreign-flow':
        return <StoryForeignFlow />;

      case 'astrology':
      case 'astrology/lunar':
        return <AstrologyLunarCalendar />;



      case 'technical-analysis':
        return (
          <div className="h-full">
            <TechnicalAnalysis />
          </div>
        );
      case 'technical-analysis/tradingview':
        return (
          <div className="h-full">
            <TechnicalAnalysisTradingView />
          </div>
        );
      case 'profile':
        return (
          <div className="space-y-6">
            <ProfilePage />
          </div>
        );
      
      case 'home':
      default:
        return (
          <div className="space-y-6">
            {/* Top Section - Watchlist and Main Chart */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
              <div className="xl:col-span-1 order-2 xl:order-1">
                <div className="h-[400px] md:h-[450px]">
                  <Watchlist 
                    selectedStock={selectedStock}
                    onStockSelect={handleStockSelect}
                  />
                </div>
              </div>
              <div className="xl:col-span-2 order-1 xl:order-2">
                <div className="h-[400px] md:h-[450px]">
                  <MainChart selectedStock={selectedStock} />
                </div>
              </div>
            </div>
            
            {/* Done Summary Section */}
            <DoneSummary />
            
            {/* Broker Summary Section */}
            <BrokerSummary />
            
            {/* Market Participant Section */}
            <MarketParticipant />
            
            {/* Ownership and Free Float Section */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
              <Ownership />
              <FreeFloat />
            </div>
            
            {/* Broker Inventory Section */}
            <BrokerInventory />
            
            {/* Footer spacing */}
            <div className="h-6"></div>
          </div>
        );
    }
  };

  const getMainCategory = () => {
    if (currentRoute.startsWith('market-rotation')) return 'Market Rotation';
    if (currentRoute.startsWith('broker-activity')) return 'Broker Activity';
    if (currentRoute.startsWith('stock-transaction')) return 'Stock Transaction';
    if (currentRoute.startsWith('story')) return 'Story';
    if (currentRoute.startsWith('astrology')) return 'Astrology';
    if (currentRoute.startsWith('profile')) return 'Profile';
    return 'Dashboard';
  };

  const getSubPageTitle = () => {
    switch (currentRoute) {
      case 'market-rotation':
      case 'market-rotation/rrg':
        return 'RRG (Relative Rotation Graph)';
      case 'market-rotation/rrc':
        return 'RRC (Relative Rotation Curve)';
      case 'market-rotation/seasonality':
        return 'Seasonality';
      case 'market-rotation/trend-filter':
        return 'Trend Filter';
      case 'broker-activity':
      case 'broker-activity/transaction':
        return 'Broker Transaction';
      case 'broker-activity/summary':
        return 'Broker Summary';
      case 'broker-activity/inventory':
        return 'Broker Inventory';
      case 'stock-transaction':
      case 'stock-transaction/done-summary':
        return 'Done Summary';
      case 'stock-transaction/done-detail':
        return 'Done Detail';
      case 'story':
      case 'story/accumulation-distribution':
        return 'Accumulation Distribution';
      case 'story/market-participant':
        return 'Market Participant';
      case 'story/ownership':
        return 'Ownership';
      case 'story/foreign-flow':
        return 'Foreign Flow';
      case 'astrology':
      case 'astrology/lunar':
        return 'Ba Zi & Shio';
      case 'technical-analysis':
        return 'Technical Analysis';
      case 'profile':
        return 'Profile';
      case 'home':
      default:
        return null;
    }
  };

  const getPageDescription = () => {
    switch (currentRoute) {
      case 'market-rotation':
      case 'market-rotation/rrg':
        return 'Analyze market rotation patterns and relative strength dynamics.';
      case 'market-rotation/rrc':
        return 'Bisa pilih sendiri yang mau dilihat - IHSG (locked), Sector, Saham';
      case 'market-rotation/seasonality':
        return 'Bisa pilih sendiri yang mau dilihat - IHSG, Sector, Saham';
      case 'market-rotation/trend-filter':
        return 'Advanced trend filtering for market analysis.';
      case 'broker-activity':
      case 'broker-activity/transaction':
        return 'Bisa series langsung beberapa hari sekaligus';
      case 'broker-activity/summary':
        return 'Bisa series langsung beberapa hari sekaligus + Bisa kasih background warna untuk buy brokernya at least big 5';
      case 'broker-activity/inventory':
        return 'Start dari titik 0 + kasih garis 0 + kasih Broker gross/net + kasih broker summary/bar/angka table untuk big 5 gross& nett';
      case 'stock-transaction':
      case 'stock-transaction/done-summary':
        return 'Analisis transaksi done summary dengan visualisasi lengkap';
      case 'stock-transaction/done-detail':
        return 'Dibuat versi pivot table + by price +by broker + by time + by day series beberapa hari';
      case 'story':
      case 'story/accumulation-distribution':
        return 'Heatmap visualization untuk melihat pola akumulasi dan distribusi saham dengan coding warna berdasarkan intensitas';
      case 'story/market-participant':
        return 'Sejarah kebawah semua + Cari visual yang lebih mudah + Chart integrated ke TV';
      case 'story/ownership':
        return 'Analisis kepemilikan saham dengan breakdown detailed dan historical trends';
      case 'story/foreign-flow':
        return 'Analisis comprehensive foreign flow dan kepemilikan investor asing dengan breakdown berdasarkan negara dan jenis investor';
      case 'astrology':
      case 'astrology/lunar':
        return 'Ba Zi (Four Pillars) dan Shio Cina untuk analisis astrologi trading dengan formula (high + close)/2 > 5%';
      case 'technical-analysis':
        return 'Advanced charting platform seperti TradingView dengan technical indicators dan PineScript editor';
      case 'profile':
        return 'Manage your account, subscription, and security settings.';
      case 'home':
      default:
        return 'Welcome back! Here\'s your trading overview.';
    }
  };

  const mainCategory = getMainCategory();
  const subPageTitle = getSubPageTitle();

  return (
    <ThemeProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar 
          isOpen={sidebarOpen} 
          onToggle={toggleSidebar}
          currentRoute={currentRoute}
          onRouteChange={handleRouteChange}
        />
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 lg:ml-16">
          <nav className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSidebar}
                className="lg:hidden p-2 rounded-md hover:bg-accent"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-semibold text-card-foreground">{mainCategory}</h1>
                {subPageTitle && (
                  <div className="mt-1">
                    <h2 className="text-lg font-medium text-card-foreground">{subPageTitle}</h2>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-1">{getPageDescription()}</p>
              </div>
            </div>
          </nav>
          
          <main className={`flex-1 overflow-auto ${currentRoute === 'technical-analysis' ? 'p-2' : 'p-3 md:p-6'}`}>
            <div className={`${currentRoute === 'technical-analysis' ? 'h-full' : 'max-w-7xl mx-auto'}`}>
              {renderMainContent()}
            </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}