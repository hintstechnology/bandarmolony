// seasonalityAutoGenerate.ts
// ------------------------------------------------------------
// Auto-generation service for seasonal analysis
// Manages seasonal calculations for indexes, sectors, and stocks
// ------------------------------------------------------------

import { generateIndexSeasonality } from '../calculations/seasonal/seasonality_index';
import { generateSectorSeasonality } from '../calculations/seasonal/seasonality_sector';
import { generateStockSeasonality } from '../calculations/seasonal/seasonality_stock';

let isGenerating = false;
let generationStatus = {
  indexes: { status: 'idle', progress: 0, total: 0, current: '' },
  sectors: { status: 'idle', progress: 0, total: 0, current: '' },
  stocks: { status: 'idle', progress: 0, total: 0, current: '' }
};

export function getGenerationStatus() {
  return {
    isGenerating,
    indexes: generationStatus.indexes,
    sectors: generationStatus.sectors,
    stocks: generationStatus.stocks
  };
}

/**
 * Generate all seasonal analysis (indexes, sectors, stocks)
 */
export async function forceRegenerate(triggerType: 'startup' | 'scheduled' | 'manual' | 'debug' = 'manual'): Promise<void> {
  if (isGenerating) {
    console.log('⚠️ Seasonal generation already in progress');
    return;
  }

  isGenerating = true;
  console.log(`🔄 Starting seasonal analysis generation (${triggerType})...`);

  try {
    // Reset status
    generationStatus = {
      indexes: { status: 'idle', progress: 0, total: 0, current: '' },
      sectors: { status: 'idle', progress: 0, total: 0, current: '' },
      stocks: { status: 'idle', progress: 0, total: 0, current: '' }
    };

    // 1. Generate Index Seasonality
    console.log('📊 Starting Index Seasonality Analysis...');
    generationStatus.indexes = { status: 'running', progress: 0, total: 0, current: 'Initializing...' };
    
    const indexResults = await generateIndexSeasonality();
    generationStatus.indexes = { 
      status: 'completed', 
      progress: 100, 
      total: indexResults.indexes.length, 
      current: 'Completed' 
    };
    console.log(`✅ Index Seasonality completed - ${indexResults.indexes.length} indexes processed`);

    // 2. Generate Sector Seasonality
    console.log('📊 Starting Sector Seasonality Analysis...');
    generationStatus.sectors = { status: 'running', progress: 0, total: 0, current: 'Initializing...' };
    
    const sectorResults = await generateSectorSeasonality();
    generationStatus.sectors = { 
      status: 'completed', 
      progress: 100, 
      total: sectorResults.sectors.length, 
      current: 'Completed' 
    };
    console.log(`✅ Sector Seasonality completed - ${sectorResults.sectors.length} sectors processed`);

    // 3. Generate Stock Seasonality
    console.log('📊 Starting Stock Seasonality Analysis...');
    generationStatus.stocks = { status: 'running', progress: 0, total: 0, current: 'Initializing...' };
    
    const stockResults = await generateStockSeasonality();
    generationStatus.stocks = { 
      status: 'completed', 
      progress: 100, 
      total: stockResults.stocks.length, 
      current: 'Completed' 
    };
    console.log(`✅ Stock Seasonality completed - ${stockResults.stocks.length} stocks processed`);

    console.log('✅ All seasonal analysis completed successfully');
    
  } catch (error) {
    console.error('❌ Error during seasonal generation:', error);
    
    // Update status to show error
    if (generationStatus.indexes.status === 'running') {
      generationStatus.indexes = { status: 'error', progress: 0, total: 0, current: 'Error occurred' };
    }
    if (generationStatus.sectors.status === 'running') {
      generationStatus.sectors = { status: 'error', progress: 0, total: 0, current: 'Error occurred' };
    }
    if (generationStatus.stocks.status === 'running') {
      generationStatus.stocks = { status: 'error', progress: 0, total: 0, current: 'Error occurred' };
    }
    
    throw error;
  } finally {
    isGenerating = false;
  }
}

/**
 * Generate only index seasonality
 */
export async function generateIndexSeasonalityOnly(): Promise<void> {
  if (isGenerating) {
    console.log('⚠️ Seasonal generation already in progress');
    return;
  }

  isGenerating = true;
  console.log('🔄 Starting Index Seasonality Analysis...');

  try {
    generationStatus.indexes = { status: 'running', progress: 0, total: 0, current: 'Initializing...' };
    
    const results = await generateIndexSeasonality();
    generationStatus.indexes = { 
      status: 'completed', 
      progress: 100, 
      total: results.indexes.length, 
      current: 'Completed' 
    };
    
    console.log(`✅ Index Seasonality completed - ${results.indexes.length} indexes processed`);
    
  } catch (error) {
    console.error('❌ Error during index seasonality generation:', error);
    generationStatus.indexes = { status: 'error', progress: 0, total: 0, current: 'Error occurred' };
    throw error;
  } finally {
    isGenerating = false;
  }
}

/**
 * Generate only sector seasonality
 */
export async function generateSectorSeasonalityOnly(): Promise<void> {
  if (isGenerating) {
    console.log('⚠️ Seasonal generation already in progress');
    return;
  }

  isGenerating = true;
  console.log('🔄 Starting Sector Seasonality Analysis...');

  try {
    generationStatus.sectors = { status: 'running', progress: 0, total: 0, current: 'Initializing...' };
    
    const results = await generateSectorSeasonality();
    generationStatus.sectors = { 
      status: 'completed', 
      progress: 100, 
      total: results.sectors.length, 
      current: 'Completed' 
    };
    
    console.log(`✅ Sector Seasonality completed - ${results.sectors.length} sectors processed`);
    
  } catch (error) {
    console.error('❌ Error during sector seasonality generation:', error);
    generationStatus.sectors = { status: 'error', progress: 0, total: 0, current: 'Error occurred' };
    throw error;
  } finally {
    isGenerating = false;
  }
}

/**
 * Generate only stock seasonality
 */
export async function generateStockSeasonalityOnly(): Promise<void> {
  if (isGenerating) {
    console.log('⚠️ Seasonal generation already in progress');
    return;
  }

  isGenerating = true;
  console.log('🔄 Starting Stock Seasonality Analysis...');

  try {
    generationStatus.stocks = { status: 'running', progress: 0, total: 0, current: 'Initializing...' };
    
    const results = await generateStockSeasonality();
    generationStatus.stocks = { 
      status: 'completed', 
      progress: 100, 
      total: results.stocks.length, 
      current: 'Completed' 
    };
    
    console.log(`✅ Stock Seasonality completed - ${results.stocks.length} stocks processed`);
    
  } catch (error) {
    console.error('❌ Error during stock seasonality generation:', error);
    generationStatus.stocks = { status: 'error', progress: 0, total: 0, current: 'Error occurred' };
    throw error;
  } finally {
    isGenerating = false;
  }
}