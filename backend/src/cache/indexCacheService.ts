/**
 * Index Cache Service
 * 
 * Shared cache service untuk menyimpan data index files
 * yang sudah di-load, sehingga tidak perlu bolak-balik memanggil Azure
 * untuk file yang sama.
 * 
 * Cache ini digunakan oleh RRG dan Money Flow calculators yang membaca
 * index files sebagai benchmark.
 */

import { downloadText } from '../utils/azureBlob';

// Cache untuk raw CSV content
interface CacheEntry {
  content: string;
  timestamp: number;
  size: number; // Size in bytes
}

class IndexCacheService {
  // Cache untuk raw CSV content
  private rawContentCache: Map<string, CacheEntry> = new Map();
  
  // Statistics
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    totalLoads: 0,
    totalBytesLoaded: 0,
    totalBytesFromCache: 0
  };
  
  // Cache TTL (Time To Live) - default 2.5 hours
  private readonly CACHE_TTL = 2.5 * 60 * 60 * 1000; // 2.5 hours in milliseconds
  
  // Max cache size (default 500MB - index files tidak terlalu banyak)
  private readonly MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB in bytes
  
  // Current cache size
  private currentCacheSize = 0;
  
  /**
   * Get raw CSV content from cache or Azure
   * @param blobName Full blob path (e.g., 'index/COMPOSITE.csv')
   * @returns CSV content as string
   */
  async getRawContent(blobName: string): Promise<string | null> {
    // Check cache first
    const cached = this.rawContentCache.get(blobName);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      this.stats.cacheHits++;
      this.stats.totalBytesFromCache += cached.size;
      console.log(`📦 Index Cache HIT: ${blobName} (${(cached.size / 1024).toFixed(2)} KB)`);
      return cached.content;
    }
    
    // Cache miss - load from Azure
    this.stats.cacheMisses++;
    console.log(`📥 Index Cache MISS: ${blobName} - loading from Azure...`);
    
    try {
      const content = await downloadText(blobName);
      
      if (!content) {
        return null;
      }
      
      const size = Buffer.byteLength(content, 'utf8');
      this.stats.totalLoads++;
      this.stats.totalBytesLoaded += size;
      
      // Check if we need to evict old entries to make room
      if (this.currentCacheSize + size > this.MAX_CACHE_SIZE) {
        await this.evictOldEntries(size);
      }
      
      // Store in cache
      this.rawContentCache.set(blobName, {
        content,
        timestamp: Date.now(),
        size
      });
      
      this.currentCacheSize += size;
      
      console.log(`✅ Index loaded and cached: ${blobName} (${(size / 1024).toFixed(2)} KB)`);
      return content;
      
    } catch (error) {
      console.error(`❌ Error loading index ${blobName}:`, error);
      return null;
    }
  }
  
  /**
   * Evict old entries from cache to make room
   */
  private async evictOldEntries(requiredSize: number): Promise<void> {
    console.log(`🧹 Evicting old index cache entries to free ${(requiredSize / 1024 / 1024).toFixed(2)} MB...`);
    
    // Sort entries by timestamp (oldest first)
    const entries = Array.from(this.rawContentCache.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    let freedSize = 0;
    let evictedCount = 0;
    
    for (const entry of entries) {
      if (this.currentCacheSize - freedSize + requiredSize <= this.MAX_CACHE_SIZE * 0.9) {
        // We've freed enough space (leave 10% buffer)
        break;
      }
      
      this.rawContentCache.delete(entry.key);
      freedSize += entry.size;
      evictedCount++;
    }
    
    this.currentCacheSize -= freedSize;
    console.log(`✅ Evicted ${evictedCount} index entries, freed ${(freedSize / 1024 / 1024).toFixed(2)} MB`);
  }
  
  /**
   * Clear all caches
   */
  clearAll(): void {
    console.log('🧹 Clearing all index caches...');
    this.rawContentCache.clear();
    this.currentCacheSize = 0;
    console.log('✅ All index caches cleared');
  }
  
  /**
   * Clear cache for specific index
   */
  clearIndex(indexName: string): void {
    const blobName = `index/${indexName}.csv`;
    const cached = this.rawContentCache.get(blobName);
    if (cached) {
      this.rawContentCache.delete(blobName);
      this.currentCacheSize -= cached.size;
      console.log(`✅ Cleared cache for ${blobName}`);
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2)
      : '0.00';
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      cacheSize: `${(this.currentCacheSize / 1024 / 1024).toFixed(2)} MB`,
      maxCacheSize: `${(this.MAX_CACHE_SIZE / 1024 / 1024).toFixed(2)} MB`,
      entries: this.rawContentCache.size
    };
  }
  
  /**
   * Print cache statistics
   */
  printStats(): void {
    const stats = this.getStats();
    console.log('\n📊 ===== INDEX CACHE STATISTICS =====');
    console.log(`Cache Hits: ${stats.cacheHits}`);
    console.log(`Cache Misses: ${stats.cacheMisses}`);
    console.log(`Hit Rate: ${stats.hitRate}`);
    console.log(`Total Loads: ${stats.totalLoads}`);
    console.log(`Total Bytes Loaded: ${(stats.totalBytesLoaded / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total Bytes From Cache: ${(stats.totalBytesFromCache / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Current Cache Size: ${stats.cacheSize}`);
    console.log(`Max Cache Size: ${stats.maxCacheSize}`);
    console.log(`Entries: ${stats.entries}`);
    console.log('====================================\n');
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      totalLoads: 0,
      totalBytesLoaded: 0,
      totalBytesFromCache: 0
    };
    console.log('🔄 Index cache statistics reset');
  }
}

// Singleton instance
export const indexCache = new IndexCacheService();

