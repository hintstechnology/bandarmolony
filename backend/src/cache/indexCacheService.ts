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
  
  // Active processing files - track file yang sedang diproses oleh kalkulasi
  // Untuk index, file-nya static (tidak per-date), jadi kita track per-file
  private activeProcessingFiles: Set<string> = new Set();
  
  // Track last access time untuk setiap file (untuk auto-cleanup)
  private fileLastAccess: Map<string, number> = new Map();
  
  // Auto-cleanup threshold: remove file yang tidak dipanggil lagi selama 1 jam
  private readonly FILE_INACTIVE_THRESHOLD = 60 * 60 * 1000; // 1 hour in milliseconds
  
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
   * Add active processing file - file yang sedang diproses oleh kalkulasi
   * Cache akan hanya menyimpan file yang ada di activeProcessingFiles
   * @param blobName Full blob path (e.g., 'index/COMPOSITE.csv')
   */
  addActiveProcessingFile(blobName: string): void {
    if (!this.activeProcessingFiles.has(blobName)) {
      this.activeProcessingFiles.add(blobName);
      console.log(`📅 Index Cache: Added active processing file ${blobName} (total: ${this.activeProcessingFiles.size})`);
    }
    // Selalu update last access time untuk file ini
    this.fileLastAccess.set(blobName, Date.now());
  }
  
  /**
   * Tandai bahwa kalkulasi saat ini sudah tidak lagi aktif menggunakan file ini.
   * Catatan: method ini TIDAK langsung menghapus data dari cache agar file yang
   * sama masih bisa dipakai ulang oleh phase/kalkulasi lain. Pembersihan fisik
   * akan dilakukan oleh autoCleanupInactiveFiles() atau clearAll().
   * @param blobName Full blob path (e.g., 'index/COMPOSITE.csv')
   */
  removeActiveProcessingFile(blobName: string): void {
    if (this.activeProcessingFiles.has(blobName)) {
      this.activeProcessingFiles.delete(blobName);
      console.log(`📅 Index Cache: Deactivated processing file ${blobName} (remaining active: ${this.activeProcessingFiles.size})`);
      // Jangan hapus fileLastAccess atau cache di sini.
    }
  }
  
  /**
   * Auto-cleanup: Remove file yang sudah lama tidak dipanggil
   * Dipanggil secara periodik atau saat evict old entries
   */
  private autoCleanupInactiveFiles(): void {
    const now = Date.now();
    const filesToRemove: string[] = [];
    
    for (const [file, lastAccess] of this.fileLastAccess.entries()) {
      // Jika file tidak dipanggil lagi selama 1 jam, remove dari cache
      if (now - lastAccess > this.FILE_INACTIVE_THRESHOLD) {
        filesToRemove.push(file);
      }
    }
    
    // Remove inactive files (clear cache + tracking)
    for (const file of filesToRemove) {
      this.clearIndex(file.replace('index/', '').replace('.csv', ''));
      this.activeProcessingFiles.delete(file);
      this.fileLastAccess.delete(file);
    }
    
    if (filesToRemove.length > 0) {
      console.log(`🧹 Auto-cleaned ${filesToRemove.length} inactive index files: ${filesToRemove.join(', ')}`);
    }
  }
  
  /**
   * Get active processing files
   */
  getActiveProcessingFiles(): string[] {
    return Array.from(this.activeProcessingFiles);
  }
  
  /**
   * Check if file is currently being processed
   */
  isFileActive(blobName: string): boolean {
    return this.activeProcessingFiles.has(blobName);
  }
  
  /**
   * Get raw CSV content from cache or Azure
   * OPTIMIZED: Hanya cache file yang sedang diproses (activeProcessingFiles)
   * CRITICAL: Kalkulasi harus manual set active files sebelum memanggil getRawContent
   * @param blobName Full blob path (e.g., 'index/COMPOSITE.csv')
   * @returns CSV content as string
   */
  async getRawContent(blobName: string): Promise<string | null> {
    // Selalu update last access time untuk file ini
    this.fileLastAccess.set(blobName, Date.now());
    
    // Check cache first (only for current processing file)
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
      
      // Only cache if file is active (sedang diproses)
      // CRITICAL: Jangan cache jika file tidak active - ini mencegah cache semua file
      if (this.isFileActive(blobName)) {
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
        console.log(`💾 Cached: ${blobName} (${(size / 1024).toFixed(2)} KB) - file is active`);
      } else {
        console.log(`⏭️  NOT cached: ${blobName} - file is NOT active`);
      }
      
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
    
    // Auto-cleanup inactive files sebelum evict
    this.autoCleanupInactiveFiles();
    
    // Sort entries by timestamp (oldest first)
    // Prioritize entries from inactive files (jika masih ada setelah cleanup)
    const entries = Array.from(this.rawContentCache.entries())
      .map(([key, value]) => {
        const isActive = this.isFileActive(key);
        return { key, ...value, isActive };
      })
      .sort((a, b) => {
        // First: inactive files first, then by timestamp
        if (a.isActive !== b.isActive) {
          return a.isActive ? 1 : -1; // inactive first
        }
        return a.timestamp - b.timestamp; // oldest first
      });
    
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
    this.activeProcessingFiles.clear();
    this.fileLastAccess.clear();
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

