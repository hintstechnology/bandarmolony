import { useEffect, useRef } from 'react';

/**
 * Hook to prevent unnecessary data fetching when tab regains focus
 * Only triggers callback if data is stale (older than specified time)
 */
export function useTabFocus(
  callback: () => void,
  staleTime: number = 5 * 60 * 1000, // 5 minutes default
  lastFetchTime: number = 0
) {
  const isInitialMount = useRef(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      // Skip on initial mount
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }

      // Only fetch if tab becomes visible and data is stale
      if (!document.hidden && lastFetchTime > 0) {
        const now = Date.now();
        const isStale = (now - lastFetchTime) > staleTime;
        
        if (isStale) {
          callback();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [callback, staleTime, lastFetchTime]);
}
