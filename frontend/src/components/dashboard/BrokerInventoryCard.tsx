import { useEffect, useRef } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { BrokerInventoryPage } from '../broker-activity/BrokerInventoryPage';

interface BrokerInventoryCardProps {
  selectedStock: string;
  defaultExpanded?: boolean;
}

// Auto-loading wrapper component that triggers Show button click
function AutoLoadingBrokerInventory({ selectedStock }: { selectedStock: string }) {
  const prevStockRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  // Function to trigger Show button click
  const triggerShowButton = () => {
    const container = containerRef.current;
    if (container) {
      // Look for the Show button - it's the button with text "Show" and bg-primary class
      const buttons = container.querySelectorAll('button');
      const showButton = Array.from(buttons).find(btn => {
        const text = btn.textContent?.trim();
        return text === 'Show' && 
               !btn.disabled &&
               (btn.classList.contains('bg-primary') || btn.classList.contains('text-primary-foreground'));
      });
      
      if (showButton) {
        (showButton as HTMLButtonElement).click();
        return true;
      }
    }
    return false;
  };

  // Auto-load when stock changes
  useEffect(() => {
    if (selectedStock && selectedStock !== prevStockRef.current) {
      prevStockRef.current = selectedStock;
      
      // Clear existing observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      
      // Wait for component to render, then find and click the Show button
      const timer = setTimeout(() => {
        if (!triggerShowButton()) {
          // If button not found, use MutationObserver to wait for it
          const container = containerRef.current;
          if (container) {
            observerRef.current = new MutationObserver(() => {
              if (triggerShowButton() && observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
              }
            });
            
            observerRef.current.observe(container, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['disabled', 'class']
            });
            
            // Fallback timeout
            setTimeout(() => {
              if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
              }
            }, 3000);
          }
        }
      }, 400);

      return () => {
        clearTimeout(timer);
        if (observerRef.current) {
          observerRef.current.disconnect();
          observerRef.current = null;
        }
      };
    }
  }, [selectedStock]);

  // Initial load on mount
  useEffect(() => {
    if (selectedStock) {
      const timer = setTimeout(() => {
        if (!triggerShowButton()) {
          // Use MutationObserver for initial load too
          const container = containerRef.current;
          if (container) {
            observerRef.current = new MutationObserver(() => {
              if (triggerShowButton() && observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
              }
            });
            
            observerRef.current.observe(container, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['disabled', 'class']
            });
            
            // Fallback timeout
            setTimeout(() => {
              if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
              }
            }, 3000);
          }
        }
      }, 600);
      
      return () => {
        clearTimeout(timer);
        if (observerRef.current) {
          observerRef.current.disconnect();
          observerRef.current = null;
        }
      };
    }
  }, [selectedStock]);

  return (
    <div ref={containerRef}>
      <BrokerInventoryPage 
        selectedStock={selectedStock} 
        defaultSplitView={true}
        hideControls={false}
        onlyShowInventoryChart={true}
      />
    </div>
  );
}

export function BrokerInventoryCard({ selectedStock, defaultExpanded = false }: BrokerInventoryCardProps) {
  const overflowGuardClasses = 'w-full max-w-full overflow-x-auto md:overflow-x-visible';
  const shrinkWrapClasses = 'min-w-0 [&_*]:min-w-0';

  return (
    <CollapsibleSection 
      title={`Broker Inventory Analysis - ${selectedStock}`}
      subtitle="Cumulative net flow for top brokers"
      defaultExpanded={defaultExpanded}
    >
      <div className={overflowGuardClasses}>
        <div className={shrinkWrapClasses}>
          <AutoLoadingBrokerInventory selectedStock={selectedStock} />
        </div>
      </div>
    </CollapsibleSection>
  );
}

