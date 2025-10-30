import express from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../supabaseClient';
import { requireSupabaseUser } from '../middleware/requireSupabaseUser';
import { createSuccessResponse, createErrorResponse } from '../utils/responseUtils';
import { HTTP_STATUS, ERROR_CODES } from '../utils/responseUtils';
import { midtransService } from '../services/midtransService';
import config from '../config';

const router = express.Router();

// Function to check and expire pending transactions
const checkExpiredTransactions = async () => {
  try {
    const now = new Date().toISOString();
    
    // Find expired pending transactions
    const { data: expiredTransactions, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('status', 'pending')
      .lt('expiry_time', now);

    if (error) {
      console.error('Error checking expired transactions:', error);
      return;
    }

    if (expiredTransactions && expiredTransactions.length > 0) {
      // Update expired transactions to cancelled
      const { error: updateError } = await supabaseAdmin
        .from('transactions')
        .update({
          status: 'cancel',
          updated_at: now
        })
        .eq('status', 'pending')
        .lt('expiry_time', now);

      if (updateError) {
        console.error('Error updating expired transactions:', updateError);
        return;
      }

      // Update related subscriptions to failed
      for (const transaction of expiredTransactions) {
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'failed',
            updated_at: now
          })
          .eq('id', transaction.subscription_id);
      }

      console.log(`Expired ${expiredTransactions.length} pending transactions`);
    }
  } catch (error) {
    console.error('Error in checkExpiredTransactions:', error);
  }
};

// Run expired transaction check every 5 minutes
setInterval(checkExpiredTransactions, 5 * 60 * 1000);

// Function to expire trial subscriptions
async function expireTrialSubscriptions() {
  try {
    const now = new Date().toISOString();
    
    // Find expired trials
    const { data: expiredTrials, error } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('status', 'trial')
      .lte('free_trial_end_date', now);

    if (error) {
      console.error('Error checking expired trials:', error);
      return;
    }

    if (expiredTrials && expiredTrials.length > 0) {
      // Update expired trials to expired status
      for (const trial of expiredTrials) {
        // Update subscription to expired
        await supabaseAdmin
          .from('subscriptions')
          .update({ 
            status: 'expired',
            updated_at: now
          })
          .eq('id', trial.id);

        // Update user to Free plan
        await supabaseAdmin
          .from('users')
          .update({
            subscription_status: 'inactive',
            subscription_plan: 'Free',
            subscription_start_date: null,
            subscription_end_date: null,
            updated_at: now
          })
          .eq('id', trial.user_id);
      }

      console.log(`Expired ${expiredTrials.length} trial subscriptions`);
    }
  } catch (error) {
    console.error('Error in expireTrialSubscriptions:', error);
  }
}

// Run trial expiry check every hour
setInterval(expireTrialSubscriptions, 60 * 60 * 1000);

// Free Trial Configuration
const FREE_TRIAL_CONFIG = {
  durationDays: 7,
  planType: 'Pro',
  eligibleRoles: ['user'],
  oneTimeOnly: true
};

// Helper function to check trial eligibility
async function checkTrialEligibility(userId: string): Promise<boolean> {
  try {
    // Check user role
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      return false;
    }

    // Exclude admin/developer
    if (!FREE_TRIAL_CONFIG.eligibleRoles.includes(userProfile.role)) {
      return false;
    }

    // Check if already used trial (check in subscriptions table)
    if (FREE_TRIAL_CONFIG.oneTimeOnly) {
      const { data: existingTrial } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('free_trial_used', true)
        .maybeSingle();
      
      if (existingTrial) {
        return false;
      }
    }

    // Check if already has active subscription
    const { data: activeSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trial'])
      .single();

    if (activeSubscription) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking trial eligibility:', error);
    return false;
  }
}

// Subscription plans configuration
const subscriptionPlans = [
  {
    id: 'plus',
    name: 'Plus',
    price: 35000,
    period: '1 bulan',
    duration: 1,
    popular: false
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 89000,
    period: '3 bulan',
    duration: 3,
    popular: true
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 165000,
    period: '6 bulan',
    duration: 6,
    popular: false
  }
];

// Validation schemas
const createOrderSchema = z.object({
  planId: z.enum(['plus', 'premium', 'pro']),
  paymentMethod: z.enum(['snap', 'credit_card', 'bank_transfer', 'ewallet']).optional().default('snap')
});

const webhookSchema = z.object({
  order_id: z.string(),
  transaction_status: z.enum(['capture', 'settlement', 'pending', 'deny', 'cancel', 'expire', 'failure']),
  payment_type: z.string(),
  fraud_status: z.enum(['accept', 'deny', 'challenge']).optional(),
  transaction_id: z.string().optional(),
  gross_amount: z.string().optional(),
  currency: z.string().optional(),
  signature_key: z.string().optional(),
  status_code: z.string().optional(),
  status_message: z.string().optional(),
  transaction_time: z.string().optional(),
  settlement_time: z.string().optional(),
  bank: z.string().optional(),
  va_numbers: z.array(z.object({
    bank: z.string(),
    va_number: z.string()
  })).optional(),
  bill_key: z.string().optional(),
  biller_code: z.string().optional(),
  store: z.string().optional(),
  permata_va_number: z.string().optional(),
  eci: z.string().optional(),
  channel_response_code: z.string().optional(),
  channel_response_message: z.string().optional(),
  card_number: z.string().optional(),
  masked_card: z.string().optional(),
  saved_token_id: z.string().optional(),
  saved_token_id_expired_at: z.string().optional(),
  secure_token: z.boolean().optional(),
  issuer: z.string().optional(),
  acquirer: z.string().optional()
});

/**
 * GET /api/subscription/plans
 * Get available subscription plans
 */
router.get('/plans', async (_req, res) => {
  try {
    return res.json(createSuccessResponse(subscriptionPlans, 'Subscription plans retrieved successfully'));
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve subscription plans',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/payment-methods
 * Get available payment methods
 */
router.get('/payment-methods', async (_req, res) => {
  try {
    const { data: paymentMethods, error } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('type', { ascending: true });

    if (error) {
      throw error;
    }

    return res.json(createSuccessResponse(paymentMethods, 'Payment methods retrieved successfully'));
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve payment methods',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/test-service-role
 * Test service role access
 */
router.get('/test-service-role', async (_req, res) => {
  try {
    console.log('🔧 Testing service role access...');
    
    // Test basic connection
    const { data: testData, error: testError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .limit(1);
    
    if (testError) {
      console.error('❌ Service role test failed:', testError);
      return res.status(500).json(createErrorResponse('Service role test failed', testError.message));
    }
    
    console.log('✅ Service role test successful:', testData);
    
    // Test transaction access
    const { data: transactionData, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select('id, status, user_id')
      .limit(1);
    
    if (transactionError) {
      console.error('❌ Transaction access test failed:', transactionError);
      return res.status(500).json(createErrorResponse('Transaction access test failed', transactionError.message));
    }
    
    console.log('✅ Transaction access test successful:', transactionData);
    
    return res.json(createSuccessResponse({
      message: 'Service role access working correctly',
      userAccess: testData,
      transactionAccess: transactionData
    }));
    
  } catch (error) {
    console.error('❌ Service role test error:', error);
    return res.status(500).json(createErrorResponse('Service role test error', error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * GET /api/subscription/test-midtrans
 * Test Midtrans connection
 */
router.get('/test-midtrans', async (_req, res) => {
  try {
    const isConnected = await midtransService.testConnection();
    
    return res.json(createSuccessResponse({
      connected: isConnected,
      config: {
        isProduction: config.MIDTRANS_IS_PRODUCTION,
        hasServerKey: !!config.MIDTRANS_SERVER_KEY,
        hasClientKey: !!config.MIDTRANS_CLIENT_KEY,
        hasMerchantId: !!config.MIDTRANS_MERCHANT_ID
      },
      urls: {
        webhook: config.WEBHOOK_URL,
        recurringWebhook: config.RECURRING_WEBHOOK_URL,
        payAccountWebhook: config.PAY_ACCOUNT_WEBHOOK_URL,
        success: config.SUCCESS_URL,
        error: config.ERROR_URL,
        pending: config.PENDING_URL
      }
    }, isConnected ? 'Midtrans connection successful' : 'Midtrans connection failed'));
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to test Midtrans connection',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/create-order
 * Create subscription order and payment
 */
router.post('/create-order', requireSupabaseUser, async (req: any, res) => {
  try {
    const { planId, paymentMethod } = createOrderSchema.parse(req.body);
    const userId = req.user.id;
    const userEmail = req.user.email;
    const userName = req.user.user_metadata?.['full_name'] || 'User';

    // Validate plan
    const plan = subscriptionPlans.find(p => p.id === planId);
    if (!plan) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid subscription plan',
        ERROR_CODES.VALIDATION_ERROR,
        'planId',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Check if user has active PAID subscription (trial can be upgraded)
    const { data: existingPaidSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('status', 'eq', 'trial')
      .maybeSingle();

    if (existingPaidSubscription) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'User already has an active subscription',
        ERROR_CODES.VALIDATION_ERROR,
        'subscription',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Check if user has active trial - if yes, use it for upgrade
    const { data: existingTrial } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'trial')
      .maybeSingle();

    // Check if user has pending payment
    const { data: pendingTransaction } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (pendingTransaction) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'User has a pending payment. Please wait for it to complete.',
        ERROR_CODES.VALIDATION_ERROR,
        'payment',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // If user has trial, update it instead of creating new subscription
    let subscription;
    if (existingTrial) {
      // Update existing trial subscription for upgrade (keep trial metadata for webhook)
      const { data: updatedSubscription, error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          plan_id: planId,
          plan_name: plan.name,
          plan_duration: plan.duration,
          price: plan.price,
          status: 'pending', // Will be converted to active when payment succeeds
          // Keep trial metadata (free_trial_start_date, free_trial_end_date) for webhook to extend from trial end
        })
        .eq('id', existingTrial.id)
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      subscription = updatedSubscription;
    } else {
      // Create new subscription record
      const { data: newSubscription, error: subscriptionError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: planId,
          plan_name: plan.name,
          plan_duration: plan.duration,
          price: plan.price,
          status: 'pending'
        })
        .select()
        .single();

      if (subscriptionError) {
        throw subscriptionError;
      }
      subscription = newSubscription;
    }

    // Create Midtrans transaction first
    const midtransOrderId = `SUB-${Date.now()}-${userId.substring(0, 8)}`;
    const midtransTransaction = await midtransService.createSubscriptionTransaction({
      orderId: midtransOrderId,
      planId: plan.id,
      planName: plan.name,
      planDuration: plan.duration,
      price: plan.price,
      customer: {
        name: userName,
        email: userEmail
      },
      callbacks: {
        finish: config.SUCCESS_URL,
        error: config.ERROR_URL,
        pending: config.PENDING_URL
      }
    });

    // Get Snap redirect URL
    const paymentUrl = await midtransService.createSnapRedirectUrl(midtransTransaction);

    // Create transaction record
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userId,
        subscription_id: subscription.id,
        midtrans_order_id: midtransOrderId,
        payment_method: paymentMethod,
        amount: plan.price,
        status: 'pending',
        payment_url: paymentUrl,
        expiry_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours expiry
      })
      .select()
      .single();

    if (transactionError) {
      throw transactionError;
    }

    // Get Snap token
    const snapToken = await midtransService.createSnapToken(midtransTransaction);

    // Log payment creation
    await supabaseAdmin
      .from('payment_logs')
      .insert({
        transaction_id: transaction.id,
        log_type: 'request',
        source: 'backend',
        message: 'Payment order created',
        data: {
          planId,
          paymentMethod,
          orderId: midtransOrderId,
          amount: plan.price
        }
      });

    // Log payment activity
    await supabaseAdmin.rpc('log_payment_activity', {
      p_user_id: userId,
      p_activity_type: 'payment_pending',
      p_transaction_id: transaction.id,
      p_subscription_id: subscription.id,
      p_status_to: 'pending',
      p_amount: plan.price,
      p_payment_method: paymentMethod,
      p_description: `Payment pending for ${plan.name} plan`,
      p_metadata: {
        plan_id: planId,
        order_id: midtransOrderId,
        snap_token: snapToken
      }
    });

    return res.json(createSuccessResponse({
      subscriptionId: subscription.id,
      transactionId: transaction.id,
      snapToken,
      orderId: midtransOrderId,
      amount: plan.price,
      plan: plan,
      paymentUrl: paymentUrl
    }, 'Payment order created successfully'));

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid request data',
        ERROR_CODES.VALIDATION_ERROR,
        error.errors[0]?.['path']?.join('.'),
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to create payment order',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/webhook/test
 * Test webhook endpoint
 */
router.get('/webhook/test', async (_req, res) => {
  try {
    return res.json(createSuccessResponse({
      message: 'Webhook endpoint is working',
      timestamp: new Date().toISOString(),
      url: config.WEBHOOK_URL
    }, 'Webhook test successful'));
  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Webhook test failed',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/webhook
 * Handle Midtrans webhook notifications
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook received:', {
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString()
    });
    
    const webhookData = webhookSchema.parse(req.body);
    
    // Verify webhook signature (optional for development)
    const signature = req.headers['x-midtrans-signature'] as string;
    const payload = JSON.stringify(req.body);
    
    // Skip signature verification in development mode
    if (config.NODE_ENV === 'production' && signature) {
      if (!midtransService.verifyWebhookSignature(payload, signature)) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(createErrorResponse(
          'Invalid webhook signature',
          ERROR_CODES.UNAUTHORIZED,
          undefined,
          HTTP_STATUS.UNAUTHORIZED
        ));
      }
    }

    // Log webhook
    await supabaseAdmin
      .from('payment_logs')
      .insert({
        log_type: 'webhook',
        source: 'midtrans',
        message: 'Webhook received',
        data: webhookData
      });

    // Map Midtrans status to our internal status
    let internalStatus: string = webhookData.transaction_status;
    if (webhookData.transaction_status === 'settlement' || webhookData.transaction_status === 'capture') {
      internalStatus = 'paid';
    } else if (webhookData.transaction_status === 'deny' || webhookData.transaction_status === 'cancel' || webhookData.transaction_status === 'expire' || webhookData.transaction_status === 'failure') {
      internalStatus = 'cancelled';
    }

    // Update transaction status and payment method
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: internalStatus,
        midtrans_transaction_id: webhookData.transaction_id,
        payment_method: webhookData.payment_type || 'snap', // Update payment method from webhook
        settlement_time: webhookData.settlement_time ? new Date(webhookData.settlement_time).toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('midtrans_order_id', webhookData.order_id)
      .select()
      .single();

    if (transactionError) {
      throw transactionError;
    }

    if (!transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Handle successful payment
    if (internalStatus === 'paid') {
      // Check if user has active trial - if yes, extend from trial end date
      const { data: currentSubscription } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('id', transaction.subscription_id)
        .single();

      let endDate = new Date();
      
      // If converting from trial, extend from trial end date
      // Check if subscription has trial history (free_trial_end_date exists)
      if (currentSubscription?.free_trial_end_date) {
        const trialEndDate = new Date(currentSubscription.free_trial_end_date);
        const now = new Date();
        // If trial end date is in the future, extend from trial end date
        if (trialEndDate > now) {
          endDate = trialEndDate;
          endDate.setMonth(endDate.getMonth() + transaction.plan_duration);
        } else {
          // Trial already expired, start from now
          endDate.setMonth(endDate.getMonth() + transaction.plan_duration);
        }
      } else {
        // No trial history, start from now
        endDate.setMonth(endDate.getMonth() + transaction.plan_duration);
      }

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          start_date: currentSubscription?.free_trial_start_date || new Date().toISOString(), // Keep trial start date if exists
          end_date: endDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.subscription_id);

      // Update user subscription info
      await supabaseAdmin
        .from('users')
        .update({
          subscription_status: 'active',
          subscription_plan: transaction.plan_name,
          subscription_start_date: currentSubscription?.free_trial_start_date || new Date().toISOString(),
          subscription_end_date: endDate.toISOString(),
          last_payment_date: new Date().toISOString(),
          payment_failure_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.user_id);

      // Log successful payment
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          transaction_id: transaction.id,
          log_type: 'response',
          source: 'webhook',
          message: 'Payment settled successfully',
          data: {
            transaction_status: webhookData.transaction_status,
            settlement_time: webhookData.settlement_time
          }
        });

      // Log payment activity
      await supabaseAdmin.rpc('log_payment_activity', {
        p_user_id: transaction.user_id,
        p_activity_type: 'payment_success',
        p_transaction_id: transaction.id,
        p_subscription_id: transaction.subscription_id,
        p_status_from: 'pending',
        p_status_to: 'settlement',
        p_amount: transaction.amount,
        p_payment_method: transaction.payment_method,
        p_description: 'Payment completed successfully',
        p_metadata: {
          transaction_status: webhookData.transaction_status,
          settlement_time: webhookData.settlement_time,
          midtrans_transaction_id: webhookData.transaction_id
        }
      });

      // Log subscription activation
      await supabaseAdmin.rpc('log_payment_activity', {
        p_user_id: transaction.user_id,
        p_activity_type: 'subscription_activated',
        p_transaction_id: transaction.id,
        p_subscription_id: transaction.subscription_id,
        p_status_to: 'active',
        p_amount: transaction.amount,
        p_description: `Subscription activated for ${transaction.plan_name}`,
        p_metadata: {
          plan_name: transaction.plan_name,
          end_date: endDate.toISOString()
        }
      });
    }

    // Handle failed payment
    if (internalStatus === 'cancelled') {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.subscription_id);

      // Log failed payment
      await supabaseAdmin
        .from('payment_logs')
        .insert({
          transaction_id: transaction.id,
          log_type: 'error',
          source: 'webhook',
          message: `Payment ${webhookData.transaction_status}`,
          data: {
            transaction_status: webhookData.transaction_status,
            status_message: webhookData.status_message
          }
        });

      // Log payment activity for cancellation
      await supabaseAdmin.rpc('log_payment_activity', {
        p_user_id: transaction.user_id,
        p_activity_type: 'payment_cancelled',
        p_transaction_id: transaction.id,
        p_subscription_id: transaction.subscription_id,
        p_status_from: 'pending',
        p_status_to: 'cancelled',
        p_amount: transaction.amount,
        p_payment_method: transaction.payment_method,
        p_description: `Payment ${webhookData.transaction_status}`,
        p_metadata: {
          transaction_status: webhookData.transaction_status,
          status_message: webhookData.status_message,
          midtrans_transaction_id: webhookData.transaction_id
        }
      });
    }

    return res.json(createSuccessResponse({}, 'Webhook processed successfully'));

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid webhook data',
        ERROR_CODES.VALIDATION_ERROR,
        error.errors[0]?.['path']?.join('.'),
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Webhook processing failed',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/status
 * Get user's subscription status
 */
router.get('/status', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Get user's current active subscription (exclude cancelled, failed, expired)
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        transactions (
          id,
          midtrans_order_id,
          status,
          amount,
          payment_method,
          created_at,
          settlement_time
        )
      `)
      .eq('user_id', userId)
      .in('status', ['active', 'trial', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subscriptionError && subscriptionError.code !== 'PGRST116') {
      throw subscriptionError;
    }

    // Additionally, get the latest trial/expired record to show end date when trial already ended
    const { data: latestTrialOrExpired, error: latestTrialError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, free_trial_end_date, end_date, plan_name, created_at')
      .eq('user_id', userId)
      .in('status', ['trial', 'expired'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestTrialError && latestTrialError.code !== 'PGRST116') {
      throw latestTrialError;
    }

    // Get user's payment history with subscription details (exclude cancelled transactions)
    const { data: transactions, error: transactionsError } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        subscriptions (
          plan_name,
          plan_id,
          plan_duration
        )
      `)
      .eq('user_id', userId)
      .not('status', 'eq', 'cancel') // Exclude cancelled transactions
      .order('created_at', { ascending: false })
      .limit(10);

    if (transactionsError) {
      throw transactionsError;
    }

    return res.json(createSuccessResponse({
      subscription: subscription || null,
      latestTrial: latestTrialOrExpired || null,
      transactions: transactions || [],
      plans: subscriptionPlans
    }, 'Subscription status retrieved successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve subscription status',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/start-trial
 * Start free trial for eligible user
 */
router.post('/start-trial', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Check eligibility
    const eligible = await checkTrialEligibility(userId);
    if (!eligible) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Not eligible for free trial',
        ERROR_CODES.VALIDATION_ERROR,
        'eligibility',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Create trial subscription
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + FREE_TRIAL_CONFIG.durationDays);

    // Create subscription record
    // Note: plan_duration is set to 1 to satisfy database constraint,
    // but trial duration is actually controlled by free_trial_end_date
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_id: 'pro',
        plan_name: FREE_TRIAL_CONFIG.planType,
        plan_duration: 1, // Set to 1 to satisfy constraint, actual trial uses free_trial_end_date
        price: 0.01, // Set to 0.01 to satisfy constraint, trial is actually free (price 0)
        status: 'trial',
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        free_trial_used: true,
        free_trial_start_date: startDate.toISOString(),
        free_trial_end_date: endDate.toISOString()
      })
      .select()
      .single();

    if (subscriptionError) {
      throw subscriptionError;
    }

    // Update users table
    // Note: free_trial_used is stored in subscriptions table, not users table
    const { error: userUpdateError } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'trial',
        subscription_plan: FREE_TRIAL_CONFIG.planType,
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString()
      })
      .eq('id', userId);

    if (userUpdateError) {
      throw userUpdateError;
    }

    return res.json(createSuccessResponse({
      subscription,
      message: 'Free trial started successfully'
    }, 'Free trial started successfully'));

  } catch (error: any) {
    console.error('Error starting trial:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to start free trial',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/trial-status
 * Get trial eligibility and active trial status
 */
router.get('/trial-status', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Check eligibility
    const eligible = await checkTrialEligibility(userId);

    // Get active trial if exists
    const { data: activeTrial } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'trial')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json(createSuccessResponse({
      eligible,
      hasActiveTrial: !!activeTrial,
      trial: activeTrial || null
    }, 'Trial status retrieved successfully'));

  } catch (error: any) {
    console.error('Error getting trial status:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to get trial status',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * GET /api/subscription/payment-activity
 * Get user's payment activity
 */
router.get('/payment-activity', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Get payment activity
    const { data: activities, error: activitiesError } = await supabaseAdmin
      .rpc('get_user_payment_activity', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset
      });

    if (activitiesError) {
      throw activitiesError;
    }

    // Get payment activity summary
    const { data: summary, error: summaryError } = await supabaseAdmin
      .rpc('get_payment_activity_summary', {
        p_user_id: userId
      });

    if (summaryError) {
      throw summaryError;
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabaseAdmin
      .from('payment_activity')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      throw countError;
    }

    return res.json(createSuccessResponse({
      activities: activities || [],
      summary: summary?.[0] || null,
      total: totalCount || 0,
      pagination: {
        limit,
        offset,
        hasMore: activities?.length === limit
      }
    }, 'Payment activity retrieved successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to retrieve payment activity',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/check-status
 * Manually check payment status from Midtrans
 */
router.post('/check-status', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Order ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        'orderId',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get transaction from database
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('midtrans_order_id', orderId)
      .eq('user_id', userId)
      .single();

    if (transactionError || !transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Check status from Midtrans
    let midtransStatus;
    try {
      midtransStatus = await midtransService.getTransactionStatus(orderId);
    } catch (error) {
      // If transaction not found in Midtrans, treat as pending
      console.log('Transaction not found in Midtrans:', error);
      midtransStatus = {
        transaction_status: 'pending',
        transaction_id: null,
        settlement_time: null
      };
    }
    
    // Update transaction status if changed
    if (midtransStatus.transaction_status !== transaction.status) {
      await supabaseAdmin
        .from('transactions')
        .update({
          status: midtransStatus.transaction_status,
          midtrans_transaction_id: midtransStatus.transaction_id,
          settlement_time: midtransStatus.settlement_time ? new Date(midtransStatus.settlement_time).toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      // Log status change
      await supabaseAdmin.rpc('log_payment_activity', {
        p_user_id: userId,
        p_activity_type: 'webhook_received',
        p_transaction_id: transaction.id,
        p_subscription_id: transaction.subscription_id,
        p_status_from: transaction.status,
        p_status_to: midtransStatus.transaction_status,
        p_amount: transaction.amount,
        p_payment_method: transaction.payment_method,
        p_description: 'Status checked manually',
        p_metadata: {
          source: 'manual_check',
          midtrans_response: midtransStatus
        }
      });
    }

    return res.json(createSuccessResponse({
      orderId,
      currentStatus: transaction.status,
      midtransStatus: midtransStatus.transaction_status,
      updated: midtransStatus.transaction_status !== transaction.status
    }, 'Status checked successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to check payment status',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/cancel
 * Cancel user's subscription
 */
router.post('/cancel', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    // Get user's active subscription
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subscriptionError || !subscription) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'No active subscription found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Update subscription status
    await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || 'User requested cancellation',
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id);

    // Update user subscription info
    await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    return res.json(createSuccessResponse({}, 'Subscription cancelled successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to cancel subscription',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/regenerate-snap-token
 * Regenerate snap token for existing pending transaction
 */
router.post('/regenerate-snap-token', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Transaction ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        'transactionId',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get pending transaction
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        subscriptions (
          plan_name,
          plan_id,
          plan_duration
        )
      `)
      .eq('id', transactionId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (transactionError || !transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Pending transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Check if transaction is not expired
    const now = new Date();
    const expiryTime = new Date(transaction.expiry_time);
    if (now > expiryTime) {
      // Update transaction to expired
      await supabaseAdmin
        .from('transactions')
        .update({
          status: 'expire',
          updated_at: now.toISOString()
        })
        .eq('id', transaction.id);

      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Transaction has expired. Please create a new order.',
        ERROR_CODES.VALIDATION_ERROR,
        'expired',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get plan details
    const plan = subscriptionPlans.find(p => p.id === transaction.subscriptions?.plan_id);
    if (!plan) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Invalid plan for transaction',
        ERROR_CODES.VALIDATION_ERROR,
        'plan',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Check if payment method is already selected
    const hasPaymentMethod = transaction.payment_method && transaction.payment_method !== 'snap';
    
    console.log('📋 Regenerate Snap Token - Transaction Info:', {
      transactionId: transaction.id,
      orderId: transaction.midtrans_order_id,
      paymentMethod: transaction.payment_method,
      hasPaymentMethod,
      amount: transaction.amount
    });
    
    // Always create a new order with fresh snap token
    // The old order might not exist in Midtrans yet (payment method selected but not completed)
    const newOrderId = `SUB-${Date.now()}-${userId.substring(0, 8)}-R${Math.random().toString(36).substr(2, 4)}`;
    
    console.log(`🆕 Creating new Midtrans transaction with order ID: ${newOrderId}`);
    console.log(`💳 Payment method: ${hasPaymentMethod ? transaction.payment_method : 'ALL (no specific method selected)'}`);
    
    try {
      const midtransTransaction = await midtransService.createSubscriptionTransaction({
        orderId: newOrderId,
        planId: plan.id,
        planName: plan.name,
        planDuration: plan.duration,
        price: plan.price,
        customer: {
          name: req.user.user_metadata?.['full_name'] || 'User',
          email: req.user.email
        },
        callbacks: {
          finish: config.SUCCESS_URL,
          error: config.ERROR_URL,
          pending: config.PENDING_URL
        },
        paymentMethod: hasPaymentMethod ? transaction.payment_method : undefined
      });

      console.log('🎫 Generated Midtrans transaction with enabled_payments:', midtransTransaction.enabled_payments);

      // Get new snap token
      const snapToken = await midtransService.createSnapToken(midtransTransaction);
      console.log('✅ Snap token created successfully');

      // Get payment URL
      const paymentUrl = await midtransService.createSnapRedirectUrl(midtransTransaction);
      console.log('✅ Payment URL generated:', paymentUrl);
      
      // Update transaction in database with new order ID
      await supabaseAdmin
        .from('transactions')
        .update({
          midtrans_order_id: newOrderId,
          payment_url: paymentUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      console.log('✅ Transaction updated in database with new order ID:', newOrderId);

      return res.json(createSuccessResponse({
        snapToken,
        orderId: newOrderId,
        paymentUrl: paymentUrl,
        transactionId: transaction.id
      }, 'Snap token regenerated successfully'));

    } catch (error) {
      console.error('❌ Error creating new transaction:', error);
      throw new Error('Failed to create new payment transaction');
    }

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to regenerate snap token',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/cancel-pending
 * Cancel pending transaction
 */
router.post('/cancel-pending', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { transactionId, reason } = req.body;

    if (!transactionId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Transaction ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        'transactionId',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Get pending transaction
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (transactionError || !transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Pending transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    // Cancel transaction in Midtrans first
    try {
      await midtransService.cancelTransaction(transaction.midtrans_order_id);
      console.log('Transaction cancelled in Midtrans successfully');
    } catch (error) {
      console.error('Error cancelling transaction in Midtrans:', error);
      // Continue with local cancellation even if Midtrans fails
    }

    // Update transaction status to cancelled
    console.log('Cancelling transaction:', transaction.id);
    console.log('🔧 Using service role for transaction update');
    
    const { data: transactionUpdateData, error: transactionUpdateError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: 'cancel',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id)
      .select();

    if (transactionUpdateError) {
      console.error('❌ Error updating transaction:', transactionUpdateError);
      console.error('❌ Error details:', JSON.stringify(transactionUpdateError, null, 2));
      throw transactionUpdateError;
    }
    
    console.log('✅ Transaction updated successfully:', transactionUpdateData);

    // Update subscription status to cancelled
    console.log('Cancelling subscription:', transaction.subscription_id);
    console.log('🔧 Using service role for subscription update');
    
    const { data: subscriptionUpdateData, error: subscriptionUpdateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || 'User cancelled pending transaction',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.subscription_id)
      .select();

    if (subscriptionUpdateError) {
      console.error('❌ Error updating subscription:', subscriptionUpdateError);
      console.error('❌ Error details:', JSON.stringify(subscriptionUpdateError, null, 2));
      throw subscriptionUpdateError;
    }
    
    console.log('✅ Subscription updated successfully:', subscriptionUpdateData);

    // Update existing payment activity status instead of creating new entry
    console.log('🔧 Using service role for payment activity update');
    
    const { data: activityUpdateData, error: activityUpdateError } = await supabaseAdmin
      .from('payment_activity')
      .update({
        status_to: 'cancelled',
        description: 'Pending transaction cancelled by user',
        payment_method: transaction.payment_method,
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', transaction.id)
      .eq('user_id', userId)
      .eq('status_to', 'pending')
      .select();

    if (activityUpdateError) {
      console.error('❌ Error updating payment activity:', activityUpdateError);
      console.error('❌ Error details:', JSON.stringify(activityUpdateError, null, 2));
      // Don't throw error, just log it
    } else {
      console.log('✅ Payment activity updated successfully:', activityUpdateData);
    }

    console.log('Transaction cancelled successfully:', transaction.id);
    return res.json(createSuccessResponse({ 
      transactionId: transaction.id,
      status: 'cancel' 
    }, 'Pending transaction cancelled successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to cancel pending transaction',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * POST /api/subscription/update-payment-method
 * Update payment method for a transaction
 */
router.post('/update-payment-method', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { transactionId, paymentMethod } = req.body;

    if (!transactionId || !paymentMethod) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        'Transaction ID and payment method are required',
        ERROR_CODES.VALIDATION_ERROR,
        'transactionId, paymentMethod',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // Update transaction payment method
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .update({
        payment_method: paymentMethod,
        updated_at: new Date().toISOString()
      })
      .eq('id', transactionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (transactionError || !transaction) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
        'Transaction not found',
        ERROR_CODES.NOT_FOUND,
        undefined,
        HTTP_STATUS.NOT_FOUND
      ));
    }

    return res.json(createSuccessResponse({
      transactionId: transaction.id,
      paymentMethod: paymentMethod
    }, 'Payment method updated successfully'));

  } catch (error: any) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Failed to update payment method',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

export default router;
