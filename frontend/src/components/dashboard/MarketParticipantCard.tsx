import { useEffect, useRef } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { StoryMarketParticipant } from '../story/StoryMarketParticipant';

interface MarketParticipantCardProps {
  selectedStock: string;
  defaultExpanded?: boolean;
}

export function MarketParticipantCard({ selectedStock, defaultExpanded = false }: MarketParticipantCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fix chart rendering
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isProcessing = false;

    const fixChartContainers = () => {
      if (isProcessing) return;
      isProcessing = true;

      requestAnimationFrame(() => {
        try {
          // Fix ResponsiveContainer - only if needed (optimized)
          const responsiveContainers = container.querySelectorAll('.recharts-responsive-container');
          for (const rc of Array.from(responsiveContainers)) {
            const element = rc as HTMLElement;
            const style = window.getComputedStyle(element);
            
            // Only fix if actually broken
            if (style.width === '0px' || style.height === '0px') {
              element.style.width = '100%';
              element.style.minWidth = '100%';
              element.style.height = '100%';
              element.style.minHeight = '100%';
            }
            
            // Fix parent containers only if needed
            let parent = element.parentElement as HTMLElement;
            let depth = 0;
            while (parent && parent !== container && depth < 5) {
              const parentStyle = window.getComputedStyle(parent);
              if (parentStyle.width === '0px') {
                parent.style.width = '100%';
                parent.style.minWidth = '100%';
              }
              parent.classList.remove('min-w-0');
              parent = parent.parentElement as HTMLElement;
              depth++;
            }
          }
          
          // Fix BarChart visibility - only if needed
          const barCharts = container.querySelectorAll('.recharts-bar');
          for (const bar of Array.from(barCharts)) {
            const barElement = bar as HTMLElement;
            const style = window.getComputedStyle(barElement);
            if (style.visibility === 'hidden' || style.opacity === '0') {
              barElement.style.visibility = 'visible';
              barElement.style.opacity = '1';
            }
          }
          
          // Fix all bar rectangles visibility
          const barRectangles = container.querySelectorAll('.recharts-bar-rectangle, .recharts-rectangle');
          for (const rect of Array.from(barRectangles)) {
            const rectElement = rect as HTMLElement;
            rectElement.style.visibility = 'visible';
            rectElement.style.opacity = '1';
            rectElement.style.display = 'block';
          }
          
          // Fix all area paths
          const areas = container.querySelectorAll('.recharts-area');
          for (const area of Array.from(areas)) {
            const areaElement = area as HTMLElement;
            areaElement.style.visibility = 'visible';
            areaElement.style.opacity = '1';
            const paths = areaElement.querySelectorAll('path');
            for (const path of Array.from(paths)) {
              (path as HTMLElement).style.visibility = 'visible';
              (path as HTMLElement).style.opacity = '1';
              (path as HTMLElement).style.display = 'block';
            }
          }
        } finally {
          isProcessing = false;
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
      title={`Market Participant - ${selectedStock}`}
      subtitle="Local vs Foreign market participation analysis"
      defaultExpanded={defaultExpanded}
    >
      <div ref={containerRef} className="w-full">
        <StoryMarketParticipant 
          selectedStock={selectedStock} 
          hideMarketAnalysis={false}
          hideForeignFlowAnalysis={false}
          disableFixedControlPanel={true}
        />
      </div>
    </CollapsibleSection>
  );
}

