import React, { useState } from 'react';
import { Watchlist } from './Watchlist';
import { MainChart } from './MainChart';
import { DoneSummary } from './DoneSummary';
import { BrokerSummary } from './BrokerSummary';
import { MarketParticipant } from './MarketParticipant';
import { Ownership } from './Ownership';
import { FreeFloat } from './FreeFloat';
import { BrokerInventory } from './BrokerInventory';

export function Dashboard() {
  const [selectedStock, setSelectedStock] = useState('BBRI');

  const handleStockSelect = (symbol: string) => {
    setSelectedStock(symbol);
  };

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

