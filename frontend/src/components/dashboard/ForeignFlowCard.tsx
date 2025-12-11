import { useEffect, useRef } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { StoryForeignFlowAnalysis } from '../story/StoryForeignFlowAnalysis';

interface ForeignFlowCardProps {
  selectedStock: string;
  defaultExpanded?: boolean;
}

export function ForeignFlowCard({ selectedStock, defaultExpanded = false }: ForeignFlowCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fix ResponsiveContainer width issues by ensuring chart containers have proper width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fixChartContainers = () => {
      // Find all ResponsiveContainer parents (divs with h-64, h-80, etc.)
      const chartContainers = container.querySelectorAll('div[class*="h-64"], div[class*="h-80"], div[class*="h-72"]');
      chartContainers.forEach((div) => {
        const element = div as HTMLElement;
        // Ensure width is set and remove any min-width constraints
        element.style.width = '100%';
        element.style.minWidth = '100%';
        element.style.maxWidth = '100%';
        // Remove any min-w-0 classes that might interfere
        element.classList.remove('min-w-0');
      });

      // Fix ResponsiveContainer itself and all its parents
      const responsiveContainers = container.querySelectorAll('.recharts-responsive-container');
      responsiveContainers.forEach((rc) => {
        const element = rc as HTMLElement;
        // Ensure ResponsiveContainer has width
        if (!element.style.width || element.style.width === '0px') {
          element.style.width = '100%';
          element.style.minWidth = '100%';
        }
        
        // Fix all parent containers up to the chart container
        let parent = element.parentElement as HTMLElement;
        while (parent && parent !== container) {
          if (!parent.style.width || parent.style.width === '0px') {
            parent.style.width = '100%';
            parent.style.minWidth = '100%';
          }
          parent.classList.remove('min-w-0');
          parent = parent.parentElement as HTMLElement;
        }
      });
    };

    // Try immediately
    fixChartContainers();

    // Use MutationObserver to catch charts when they're added
    const observer = new MutationObserver(() => {
      fixChartContainers();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    return () => {
      observer.disconnect();
    };
  }, [selectedStock]);

  return (
    <CollapsibleSection 
      title={`Foreign Flow Analysis - ${selectedStock}`}
      subtitle="Foreign investor buying and selling activity"
      defaultExpanded={defaultExpanded}
    >
      <div ref={containerRef} className="w-full">
        <StoryForeignFlowAnalysis selectedStock={selectedStock} />
      </div>
    </CollapsibleSection>
  );
}

