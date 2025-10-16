// trigger.ts
// Unified trigger endpoint for manual data generation

import { Router } from 'express';
import { createErrorResponse, createSuccessResponse, HTTP_STATUS } from '../utils/responseUtils';
import { forceRegenerate as forceRegenerateRRC, getGenerationStatus as getRRCStatus } from '../services/rrcAutoGenerate';
import { forceRegenerate as forceRegenerateRRG, getGenerationStatus as getRRGStatus } from '../services/rrgAutoGenerate';
import { forceRegenerate as forceRegenerateSeasonal, getGenerationStatus as getSeasonalStatus } from '../services/seasonalityAutoGenerate';

const router = Router();

/**
 * Manual trigger for data generation
 * Query params:
 *   - feature: 'rrc' | 'rrg' | 'all' (default: 'all')
 */
router.post('/generate', async (req, res) => {
  try {
    const { feature = 'all' } = req.query;
    
    console.log(`🔄 Manual trigger requested for: ${feature}`);
    
    // Validate feature parameter
    if (!['rrc', 'rrg', 'seasonal', 'all'].includes(feature as string)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse('Invalid feature parameter. Use: rrc, rrg, seasonal, or all')
      );
    }
    
    const results: any = {
      rrc: null,
      rrg: null,
      seasonal: null
    };
    
    // Trigger RRC
    if (feature === 'rrc' || feature === 'all') {
      const rrcStatus = getRRCStatus();
      
      if (rrcStatus.isGenerating) {
        results.rrc = {
          status: 'skipped',
          message: 'RRC generation already in progress',
          progress: rrcStatus.progress
        };
      } else {
        console.log('🚀 Starting RRC generation...');
        
        // Start generation in background (non-blocking)
        forceRegenerateRRC().then(() => {
          console.log('✅ RRC generation completed in background');
        }).catch((error) => {
          console.error('❌ RRC generation failed:', error);
        });
        
        results.rrc = {
          status: 'started',
          message: 'RRC generation started in background',
          note: 'Check /api/rrc/status for progress'
        };
      }
    }
    
    // Trigger RRG
    if (feature === 'rrg' || feature === 'all') {
      const rrgStatus = getRRGStatus();
      
      if (rrgStatus.isGenerating) {
        results.rrg = {
          status: 'skipped',
          message: 'RRG generation already in progress',
          progress: rrgStatus.progress
        };
      } else {
        console.log('🚀 Starting RRG generation...');
        
        // Start generation in background (non-blocking)
        forceRegenerateRRG().then(() => {
          console.log('✅ RRG generation completed in background');
        }).catch((error) => {
          console.error('❌ RRG generation failed:', error);
        });
        
        results.rrg = {
          status: 'started',
          message: 'RRG generation started in background',
          note: 'Check /api/rrg/status for progress'
        };
      }
    }
    
    // Trigger Seasonality
    if (feature === 'seasonal' || feature === 'all') {
      const seasonalStatus = getSeasonalStatus();
      
      if (seasonalStatus.isGenerating) {
        results.seasonal = {
          status: 'skipped',
          message: 'Seasonality generation already in progress',
          progress: seasonalStatus.progress
        };
      } else {
        console.log('🚀 Starting Seasonality generation...');
        
        // Start generation in background (non-blocking)
        forceRegenerateSeasonal('manual').then(() => {
          console.log('✅ Seasonality generation completed in background');
        }).catch((error) => {
          console.error('❌ Seasonality generation failed:', error);
        });
        
        results.seasonal = {
          status: 'started',
          message: 'Seasonality generation started in background',
          note: 'Check /api/seasonality/status for progress'
        };
      }
    }
    
    return res.json(createSuccessResponse({
      message: `Manual generation triggered for: ${feature}`,
      feature: feature,
      results: results,
      monitoring: {
        rrc_status: feature === 'rrc' || feature === 'all' ? '/api/rrc/status' : null,
        rrg_status: feature === 'rrg' || feature === 'all' ? '/api/rrg/status' : null,
        seasonal_status: feature === 'seasonal' || feature === 'all' ? '/api/seasonality/status' : null
      }
    }));
    
  } catch (error: any) {
    console.error('❌ Error triggering manual generation:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(error?.message || 'Failed to trigger generation')
    );
  }
});

/**
 * Get combined status for RRC and RRG
 */
router.get('/status', async (_req, res) => {
  try {
    const rrcStatus = getRRCStatus();
    const rrgStatus = getRRGStatus();
    const seasonalStatus = getSeasonalStatus();
    
    return res.json(createSuccessResponse({
      rrc: {
        isGenerating: rrcStatus.isGenerating,
        lastGeneration: rrcStatus.lastGenerationTime,
        progress: rrcStatus.progress
      },
      rrg: {
        isGenerating: rrgStatus.isGenerating,
        lastGeneration: rrgStatus.lastGenerationTime,
        progress: rrgStatus.progress
      },
      seasonal: {
        isGenerating: seasonalStatus.isGenerating,
        lastGeneration: seasonalStatus.lastGenerationTime,
        progress: seasonalStatus.progress
      },
      overall: {
        anyGenerating: rrcStatus.isGenerating || rrgStatus.isGenerating || seasonalStatus.isGenerating,
        totalProgress: {
          rrc: rrcStatus.progress,
          rrg: rrgStatus.progress,
          seasonal: seasonalStatus.progress
        }
      }
    }));
    
  } catch (error: any) {
    console.error('❌ Error getting generation status:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(error?.message || 'Failed to get status')
    );
  }
});

export default router;

