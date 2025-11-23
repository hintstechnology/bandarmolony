import { supabaseAdmin } from '../supabaseClient';

/**
 * Check and expire subscriptions that have passed their end_date
 * This runs periodically to automatically downgrade users to Free plan
 */
export async function expireSubscriptions() {
  try {
    const now = new Date().toISOString();
    
    console.log('🔍 Checking for expired subscriptions...');
    
    // Find active subscriptions that have passed their end_date
    const { data: expiredSubs, error: queryError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .lte('end_date', now);
    
    if (queryError) {
      console.error('❌ Error querying expired subscriptions:', queryError);
      return;
    }
    
    if (!expiredSubs || expiredSubs.length === 0) {
      console.log('✅ No expired subscriptions found');
      return;
    }
    
    console.log(`⏰ Found ${expiredSubs.length} expired subscription(s)`);
    
    for (const sub of expiredSubs) {
      try {
        console.log(`📋 Processing expired subscription:`, {
          subscription_id: sub.id,
          user_id: sub.user_id,
          plan_name: sub.plan_name,
          end_date: sub.end_date,
          cancelled_at: sub.cancelled_at
        });
        
        // Update subscription to expired
        const { error: subUpdateError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.id);
        
        if (subUpdateError) {
          console.error(`❌ Error updating subscription ${sub.id}:`, subUpdateError);
          continue;
        }
        
        // Update user to free plan
        const { error: userUpdateError } = await supabaseAdmin
          .from('users')
          .update({
            subscription_status: 'inactive',
            subscription_plan: 'Free',
            subscription_start_date: null,
            subscription_end_date: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.user_id);
        
        if (userUpdateError) {
          console.error(`❌ Error updating user ${sub.user_id}:`, userUpdateError);
          continue;
        }
        
        // Log to payment_activity for tracking
        const { error: activityError } = await supabaseAdmin
          .from('payment_activity')
          .insert({
            user_id: sub.user_id,
            subscription_id: sub.id,
            activity_type: 'subscription_expired',
            status_from: 'active',
            status_to: 'expired',
            description: sub.cancelled_at 
              ? 'Subscription expired after cancellation'
              : 'Subscription period ended',
            created_at: new Date().toISOString()
          });
        
        if (activityError) {
          console.error(`⚠️  Error logging activity for subscription ${sub.id}:`, activityError);
          // Don't stop processing, just log the error
        }
        
        console.log(`✅ Expired subscription ${sub.id} for user ${sub.user_id}${sub.cancelled_at ? ' (was cancelled)' : ''}`);
        
      } catch (error) {
        console.error(`❌ Error processing subscription ${sub.id}:`, error);
      }
    }
    
    console.log(`✅ Subscription expiry check completed. Processed ${expiredSubs.length} subscription(s).`);
    
  } catch (error) {
    console.error('❌ Fatal error in expireSubscriptions:', error);
  }
}

/**
 * Start the subscription expiry checker
 * Runs every 1 hour to check for expired subscriptions
 */
export function startSubscriptionExpiryChecker() {
  console.log('🚀 Starting subscription expiry checker...');
  
  // Run immediately on startup
  expireSubscriptions();
  
  // Then run every hour
  const intervalMs = 60 * 60 * 1000; // 1 hour
  setInterval(expireSubscriptions, intervalMs);
  
  console.log(`✅ Subscription expiry checker started (runs every ${intervalMs / 1000 / 60} minutes)`);
}

