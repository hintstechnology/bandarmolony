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
        // Ensure ResponsiveContainer has width and height
        if (!element.style.width || element.style.width === '0px') {
          element.style.width = '100%';
          element.style.minWidth = '100%';
        }
        if (!element.style.height || element.style.height === '0px') {
          element.style.height = '100%';
          element.style.minHeight = '100%';
        }
        
        // Fix all parent containers up to the chart container
        let parent = element.parentElement as HTMLElement;
        while (parent && parent !== container) {
          if (!parent.style.width || parent.style.width === '0px') {
            parent.style.width = '100%';
            parent.style.minWidth = '100%';
          }
          if (!parent.style.height || parent.style.height === '0px') {
            const computedHeight = window.getComputedStyle(parent).height;
            if (computedHeight && computedHeight !== '0px' && computedHeight !== 'auto') {
              parent.style.height = computedHeight;
            } else {
              parent.style.height = '100%';
              parent.style.minHeight = '100%';
            }
          }
          parent.classList.remove('min-w-0');
          parent = parent.parentElement as HTMLElement;
        }
      });
      
      // Fix chart shapes visibility - ensure bars and lines are visible
      const bars = container.querySelectorAll('.recharts-bar');
      bars.forEach((bar) => {
        const barElement = bar as HTMLElement;
        barElement.style.visibility = 'visible';
        barElement.style.opacity = '1';
        const paths = barElement.querySelectorAll('path');
        paths.forEach((path) => {
          (path as HTMLElement).style.visibility = 'visible';
          (path as HTMLElement).style.opacity = '1';
          (path as HTMLElement).style.display = 'block';
        });
      });
      
      const lines = container.querySelectorAll('.recharts-line');
      lines.forEach((line) => {
        const lineElement = line as HTMLElement;
        lineElement.style.visibility = 'visible';
        lineElement.style.opacity = '1';
        const paths = lineElement.querySelectorAll('path');
        paths.forEach((path) => {
          (path as HTMLElement).style.visibility = 'visible';
          (path as HTMLElement).style.opacity = '1';
          (path as HTMLElement).style.display = 'block';
        });
      });
      
      // Fix all bar rectangles visibility
      const barRectangles = container.querySelectorAll('.recharts-bar-rectangle, .recharts-rectangle');
      barRectangles.forEach((rect) => {
        const rectElement = rect as HTMLElement;
        rectElement.style.visibility = 'visible';
        rectElement.style.opacity = '1';
        rectElement.style.display = 'block';
      });
      
      // Fix all area paths
      const areas = container.querySelectorAll('.recharts-area');
      areas.forEach((area) => {
        const areaElement = area as HTMLElement;
        areaElement.style.visibility = 'visible';
        areaElement.style.opacity = '1';
        const paths = areaElement.querySelectorAll('path');
        paths.forEach((path) => {
          (path as HTMLElement).style.visibility = 'visible';
          (path as HTMLElement).style.opacity = '1';
          (path as HTMLElement).style.display = 'block';
        });
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

