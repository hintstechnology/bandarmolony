import { useEffect, useRef } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { StockTransactionDoneSummary } from '../stock-transaction/StockTransactionDoneSummary';

interface DoneSummaryCardProps {
  selectedStock: string;
  defaultExpanded?: boolean;
}

// Auto-loading wrapper component that triggers Show button click
function AutoLoadingDoneSummary({ selectedStock }: { selectedStock: string }) {
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

  // Override fixed positioning for control panel and remove inner Card when used in card
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fixControlPanel = () => {
      // Find control panel by looking for div with specific background color or border
      const allDivs = container.querySelectorAll('div');
      let controlPanel: HTMLElement | null = null;
      
      for (const div of Array.from(allDivs)) {
        const style = window.getComputedStyle(div);
        const bgColor = style.backgroundColor;
        const hasBorder = style.borderBottomWidth !== '0px';
        const hasFixed = div.classList.contains('lg:fixed') || style.position === 'fixed';
        
        // Look for control panel: has dark background, border, and fixed positioning
        const hasDarkBg = bgColor.includes('rgb(10, 15, 32)') || bgColor.includes('rgba(10, 15, 32') || div.classList.contains('bg-[#0a0f20]');
        if (hasDarkBg && hasBorder && hasFixed) {
          controlPanel = div as HTMLElement;
          break;
        }
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
      }
      
      // Also remove spacer that was meant for fixed header
      const spacers = container.querySelectorAll('div');
      for (const spacer of Array.from(spacers)) {
        const classes = spacer.className;
        if (classes.includes('h-0') && (classes.includes('lg:h-[38px]') || classes.includes('lg:h-[60px]') || classes.includes('lg:h-[35px]'))) {
          (spacer as HTMLElement).style.display = 'none';
        }
      }

      // Hide inner Card wrapper styling (Card inside CardContent)
      // Instead of removing, we'll hide the Card styling to make it look like it's not there
      const innerCards = container.querySelectorAll('[data-slot="card"]');
      for (const card of Array.from(innerCards)) {
        const cardElement = card as HTMLElement;
        // Check if this card contains a table (from renderHorizontalSummaryView)
        const hasTable = cardElement.querySelector('table');
        const hasCardHeader = cardElement.querySelector('[data-slot="card-header"]');
        const hasCardContent = cardElement.querySelector('[data-slot="card-content"]');
        
        if (hasTable && hasCardHeader && hasCardContent) {
          // This is the inner Card from StockTransactionDoneSummary
          // Hide Card styling: remove border, background, padding, gap
          cardElement.style.border = 'none';
          cardElement.style.background = 'transparent';
          cardElement.style.padding = '0';
          cardElement.style.gap = '0';
          cardElement.style.margin = '0';
          
          // Hide CardHeader
          if (hasCardHeader) {
            (hasCardHeader as HTMLElement).style.display = 'none';
          }
          
          // Remove padding from CardContent
          if (hasCardContent) {
            const cardContent = hasCardContent as HTMLElement;
            cardContent.style.padding = '0';
            cardContent.style.paddingLeft = '0';
            cardContent.style.paddingRight = '0';
            cardContent.style.paddingTop = '0';
            cardContent.style.paddingBottom = '0';
          }
        }
      }
    };

    // Try immediately
    fixControlPanel();

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

    return () => {
      fixObserver.disconnect();
    };
  }, [selectedStock]);

  return (
    <div ref={containerRef}>
      <StockTransactionDoneSummary selectedStock={selectedStock} />
    </div>
  );
}

export function DoneSummaryCard({ selectedStock, defaultExpanded = false }: DoneSummaryCardProps) {
  const overflowGuardClasses = 'w-full max-w-full overflow-x-auto md:overflow-x-visible';
  const shrinkWrapClasses = 'min-w-0 [&_*]:min-w-0';

  return (
    <CollapsibleSection 
      title={`Done Summary - ${selectedStock}`}
      subtitle="Price analysis with buy/sell frequency and lot data"
      defaultExpanded={defaultExpanded}
    >
      <div className={overflowGuardClasses}>
        <div className={shrinkWrapClasses}>
          <AutoLoadingDoneSummary selectedStock={selectedStock} />
        </div>
      </div>
    </CollapsibleSection>
  );
}

