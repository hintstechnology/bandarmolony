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

  // Override fixed positioning for control panel when used in card
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fixControlPanel = () => {
      // Find control panel by looking for div with specific classes and attributes
      // BrokerInventoryPage control panel has: bg-[#0a0f20]/95, border-b, backdrop-blur-md, lg:fixed
      // Search within container first, then in parent hierarchy
      let searchRoots: HTMLElement[] = [container];
      
      // Also search in parent CollapsibleSection and its parents
      let parent: HTMLElement | null = container.parentElement;
      while (parent && searchRoots.length < 5) {
        searchRoots.push(parent);
        parent = parent.parentElement;
      }
      
      let controlPanel: HTMLElement | null = null;
      
      // Search in all roots
      for (const root of searchRoots) {
        const allDivs = root.querySelectorAll('div');
        
        for (const div of Array.from(allDivs)) {
          // Skip if we already found it or if it's not related to our container
          if (controlPanel) break;
          
          const classes = div.className;
          const style = window.getComputedStyle(div);
          const bgColor = style.backgroundColor;
          const hasBorder = style.borderBottomWidth !== '0px';
          const hasFixed = div.classList.contains('lg:fixed') || style.position === 'fixed';
          
          // Look for control panel: has backdrop-blur (specific to BrokerInventoryPage), dark background, border, and fixed positioning
          const hasBackdropBlur = classes.includes('backdrop-blur-md');
          const hasDarkBg = bgColor.includes('rgb(10, 15, 32)') || bgColor.includes('rgba(10, 15, 32') || 
                           classes.includes('bg-[#0a0f20]') || classes.includes('bg-[#0a0f20]/95');
          
          // More specific: look for div that contains "Ticker:" label (control panel specific)
          const containsTickerLabel = div.textContent?.includes('Ticker:') || 
                                     div.querySelector('label')?.textContent?.includes('Ticker:');
          
          // Also check for "Broker:" and "Date Range:" labels which are specific to BrokerInventoryPage
          const containsBrokerLabel = div.textContent?.includes('Broker:') || 
                                     div.querySelector('label')?.textContent?.includes('Broker:');
          const containsDateRangeLabel = div.textContent?.includes('Date Range:') || 
                                        div.querySelector('label')?.textContent?.includes('Date Range:');
          
          // Match if it has backdrop-blur (specific to BrokerInventoryPage) OR contains the specific labels
          // Also match if it has all three labels (Ticker, Broker, Date Range) which is unique to BrokerInventoryPage
          if ((hasBackdropBlur || (containsTickerLabel && containsBrokerLabel && containsDateRangeLabel)) && 
              hasDarkBg && hasBorder && hasFixed) {
            controlPanel = div as HTMLElement;
            break;
          }
        }
        
        if (controlPanel) break;
      }
      
      if (controlPanel) {
        // Remove fixed positioning classes
        controlPanel.classList.remove('lg:fixed', 'lg:top-14', 'lg:left-20', 'lg:right-0', 'lg:z-40');
        // Make it relative/static instead
        controlPanel.style.position = 'relative';
        controlPanel.style.top = 'auto';
        controlPanel.style.left = 'auto';
        controlPanel.style.right = 'auto';
        controlPanel.style.zIndex = 'auto';
        controlPanel.style.width = '100%';
        controlPanel.style.maxWidth = '100%';
      }
      
      // Also remove spacer that was meant for fixed header
      const spacers = container.querySelectorAll('div');
      for (const spacer of Array.from(spacers)) {
        const classes = spacer.className;
        if (classes.includes('h-0') && (classes.includes('lg:h-[38px]') || classes.includes('lg:h-[60px]') || classes.includes('lg:h-[35px]'))) {
          (spacer as HTMLElement).style.display = 'none';
        }
      }
    };

    // Try immediately with multiple attempts to catch it when rendered
    fixControlPanel();
    
    // Try again after a short delay
    const timer1 = setTimeout(() => {
      fixControlPanel();
    }, 200);
    
    // Try again after a longer delay
    const timer2 = setTimeout(() => {
      fixControlPanel();
    }, 500);

    // Also use MutationObserver to catch it when it's added
    const fixObserver = new MutationObserver(() => {
      fixControlPanel();
    });

    fixObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    // Also observe parent CollapsibleSection if it exists
    const collapsibleSection = container.closest('[class*="space-y"], [class*="CollapsibleSection"]');
    if (collapsibleSection) {
      fixObserver.observe(collapsibleSection, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      fixObserver.disconnect();
    };
  }, [selectedStock]);

  return (
    <div ref={containerRef}>
      <BrokerInventoryPage 
        selectedStock={selectedStock} 
        defaultSplitView={true}
        hideControls={false}
        onlyShowInventoryChart={true}
        disableTickerSelection={true}
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

