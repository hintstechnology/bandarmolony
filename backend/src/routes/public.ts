// public.ts
// Public routes (no authentication required)
// Used for GitHub Actions and other automated systems

import { Router } from 'express';
import { getSchedulerConfig, getSchedulerStatus, getPhaseStatuses } from '../services/scheduler';
import { createSuccessResponse, createErrorResponse } from '../utils/responseUtils';

const router = Router();

/**
 * GET /api/public/scheduler/config
 * Get scheduler configuration (public, no auth required)
 * Used by GitHub Actions for dynamic resize scheduling
 */
router.get('/scheduler/config', async (_req, res) => {
  try {
    const config = getSchedulerConfig();
    
    return res.json(createSuccessResponse({
      config: {
        PHASE1_DATA_COLLECTION_TIME: config.PHASE1_DATA_COLLECTION_TIME,
        PHASE1_SHAREHOLDERS_TIME: config.PHASE1_SHAREHOLDERS_TIME,
        TIMEZONE: config.TIMEZONE,
        WEEKEND_SKIP: config.WEEKEND_SKIP
      }
    }, 'Scheduler configuration retrieved successfully'));
  } catch (error) {
    console.error('Get public scheduler config error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to retrieve scheduler configuration',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

/**
 * GET /api/public/scheduler/status
 * Get scheduler status (public, no auth required)
 * Used by GitHub Actions to check if scheduler is running/completed
 */
router.get('/scheduler/status', async (_req, res) => {
  try {
    const status = getSchedulerStatus();
    const phases = getPhaseStatuses();
    
    // Check if all phases are completed or idle
    const allPhases = [
      'phase1a_input_daily',
      'phase1b_input_monthly',
      'phase2_market_rotation',
      'phase3_flow_trade',
      'phase4_broker_summary',
      'phase5_broktrans_broker',
      'phase6_broktrans_stock',
      'phase7_bid_breakdown',
      'phase8_additional'
    ];
    
    const allCompleted = allPhases.every(phase => 
      phases[phase] === 'idle' || phases[phase] === 'stopped'
    );
    
    return res.json(createSuccessResponse({
      status: {
        running: status.running,
        phases: phases,
        allCompleted: allCompleted,
        timezone: status.timezone,
        schedules: status.schedules,
        weekendSkip: status.weekendSkip
      }
    }, 'Scheduler status retrieved successfully'));
  } catch (error) {
    console.error('Get public scheduler status error:', error);
    return res.status(500).json(createErrorResponse(
      'Failed to retrieve scheduler status',
      'INTERNAL_SERVER_ERROR',
      undefined,
      500
    ));
  }
});

export default router;

