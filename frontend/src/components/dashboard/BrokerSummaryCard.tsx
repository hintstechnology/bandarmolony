import { useEffect, useRef } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { BrokerSummaryPage } from '../broker-activity/BrokerSummaryPage';

interface BrokerSummaryCardProps {
  selectedStock: string;
  defaultExpanded?: boolean;
}

// Auto-loading wrapper component that triggers Show button click
function AutoLoadingBrokerSummary({ selectedStock }: { selectedStock: string }) {
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

  // Ensure data is visible after loading - optimized with debouncing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let dataContainerCache: HTMLElement | null = null;
    let tablesCache: NodeListOf<HTMLTableElement> | null = null;
    let isProcessing = false;

    const ensureDataVisible = () => {
      if (isProcessing) return;
      isProcessing = true;

      requestAnimationFrame(() => {
        try {
          // Use cached data container if available, otherwise find it
          if (!dataContainerCache || !container.contains(dataContainerCache)) {
            // Find data container more efficiently - only check divs with specific class or background
            const candidateDivs = container.querySelectorAll('div[class*="bg-"], div');
            for (const div of Array.from(candidateDivs)) {
              const classes = div.getAttribute('class') || '';
              if (classes.includes('bg-[#0a0f20]')) {
                const hasTable = div.querySelector('table');
                if (hasTable) {
                  dataContainerCache = div as HTMLElement;
                  break;
                }
              }
            }
          }

          // Only update if data container exists and needs fixing
          if (dataContainerCache) {
            const style = window.getComputedStyle(dataContainerCache);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
              dataContainerCache.style.display = '';
              dataContainerCache.style.visibility = 'visible';
              dataContainerCache.style.opacity = '1';
              dataContainerCache.style.height = 'auto';
              dataContainerCache.style.minHeight = 'auto';
              dataContainerCache.style.overflow = 'visible';
              dataContainerCache.classList.remove('hidden', 'invisible', 'opacity-0');
            }
          }

          // Cache tables and only update if needed
          if (!tablesCache || tablesCache.length === 0) {
            tablesCache = container.querySelectorAll('table');
          }

          for (const table of Array.from(tablesCache)) {
            const tableEl = table as HTMLElement;
            const tableStyle = window.getComputedStyle(tableEl);
            if (tableStyle.display === 'none' || tableStyle.visibility === 'hidden' || tableStyle.opacity === '0') {
              tableEl.style.display = '';
              tableEl.style.visibility = 'visible';
              tableEl.style.opacity = '1';
              tableEl.classList.remove('hidden', 'invisible', 'opacity-0');
            }
          }
        } finally {
          isProcessing = false;
        }
      });
    };

    // Debounced version for MutationObserver
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedEnsureDataVisible = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        ensureDataVisible();
      }, 100); // Debounce 100ms
    };

    // Run immediately once
    ensureDataVisible();

    // Use MutationObserver with debouncing
    const dataObserver = new MutationObserver((mutations) => {
      // Only process if there are actual changes
      if (mutations.length > 0) {
        debouncedEnsureDataVisible();
      }
    });

    dataObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: false, // Don't observe attributes to reduce overhead
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      dataObserver.disconnect();
      dataContainerCache = null;
      tablesCache = null;
    };
  }, [selectedStock]);

  // Override fixed positioning for control panel when used in card - optimized
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let controlPanelCache: HTMLElement | null = null;
    let isProcessing = false;

    const fixControlPanel = () => {
      if (isProcessing) return;
      isProcessing = true;

      requestAnimationFrame(() => {
        try {
          // Use cached control panel if available, otherwise find it
          if (!controlPanelCache || !container.contains(controlPanelCache)) {
            // Find control panel more efficiently - check for specific classes first
            const candidateDivs = container.querySelectorAll('div[class*="lg:fixed"], div[class*="bg-"]');
            for (const div of Array.from(candidateDivs)) {
              const hasFixed = div.classList.contains('lg:fixed');
              if (hasFixed) {
                const style = window.getComputedStyle(div);
                const hasBorder = style.borderBottomWidth !== '0px';
                if (hasBorder) {
                  controlPanelCache = div as HTMLElement;
                  break;
                }
              }
            }
          }

          if (controlPanelCache) {
            const style = window.getComputedStyle(controlPanelCache);
            // Only update if still fixed
            if (style.position === 'fixed' || controlPanelCache.classList.contains('lg:fixed')) {
              controlPanelCache.classList.remove('lg:fixed', 'lg:top-14', 'lg:left-20', 'lg:right-0', 'lg:z-40');
              controlPanelCache.style.position = 'sticky';
              controlPanelCache.style.top = '0';
              controlPanelCache.style.left = 'auto';
              controlPanelCache.style.right = 'auto';
              controlPanelCache.style.zIndex = '10';
              
              const cardContainer = controlPanelCache.closest('[data-slot="card"]') || container;
              if (cardContainer) {
                (cardContainer as HTMLElement).style.position = 'relative';
                (cardContainer as HTMLElement).style.overflow = 'visible';
              }
            }
          }

          // Remove spacers - only check once
          const spacers = container.querySelectorAll('div.h-0');
          for (const spacer of Array.from(spacers)) {
            const classes = spacer.className;
            if (classes.includes('lg:h-[38px]') || classes.includes('lg:h-[60px]') || classes.includes('lg:h-[35px]')) {
              (spacer as HTMLElement).style.display = 'none';
            }
          }

          // Ensure parent containers don't hide content - only check once
          const parentContainers = container.querySelectorAll('[data-slot="card-content"]');
          for (const parent of Array.from(parentContainers)) {
            const parentEl = parent as HTMLElement;
            const parentStyle = window.getComputedStyle(parentEl);
            if (parentStyle.overflow === 'hidden') {
              parentEl.style.overflow = 'visible';
            }
            if (parentStyle.height === '0px') {
              parentEl.style.height = 'auto';
            }
          }
        } finally {
          isProcessing = false;
        }
      });
    };

    // Debounced version for MutationObserver
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedFixControlPanel = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fixControlPanel();
      }, 150); // Debounce 150ms
    };

    // Try immediately
    fixControlPanel();

    // Use MutationObserver with debouncing and limited scope
    const fixObserver = new MutationObserver((mutations) => {
      // Only process if there are actual DOM changes
      if (mutations.length > 0) {
        debouncedFixControlPanel();
      }
    });

    fixObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'] // Only observe class changes, not style
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      fixObserver.disconnect();
      controlPanelCache = null;
    };
  }, [selectedStock]);

  return (
    <div ref={containerRef}>
      <BrokerSummaryPage selectedStock={selectedStock} disableTickerSelection={true} />
    </div>
  );
}

export function BrokerSummaryCard({ selectedStock, defaultExpanded = false }: BrokerSummaryCardProps) {
  const overflowGuardClasses = 'w-full max-w-full overflow-x-auto md:overflow-x-visible';
  const shrinkWrapClasses = 'min-w-0 [&_*]:min-w-0';

  return (
    <CollapsibleSection 
      title={`Broker Summary - ${selectedStock}`}
      subtitle="Top brokers trading activity and net positions"
      defaultExpanded={defaultExpanded}
    >
      <div className={overflowGuardClasses} style={{ minHeight: '200px' }}>
        <div className={shrinkWrapClasses}>
          <AutoLoadingBrokerSummary selectedStock={selectedStock} />
        </div>
      </div>
    </CollapsibleSection>
  );
}

