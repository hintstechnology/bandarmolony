import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw, AlertCircle, CreditCard } from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

// Subscription plans - all have same features, different durations
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

const currentSubscription = {
  plan: 'pro',
  status: 'active',
  nextBilling: '2024-02-15',
  autoRenew: true
};

export function SubscriptionPage() {
  const [selectedPlan, setSelectedPlan] = useState('premium');
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [paymentActivities, setPaymentActivities] = useState<any[]>([]);
  const [hasActivePayment, setHasActivePayment] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasScrolledToPending, setHasScrolledToPending] = useState(false);

  // Helper function for image error handling
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.style.display = 'none';
    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
    if (fallback) {
      fallback.style.display = 'inline';
    }
  };

  // Helper function to get Supabase URL
  const getSupabaseUrl = () => {
    return (import.meta as any).env?.VITE_SUPABASE_URL || 'https://bandarmolony.supabase.co';
  };

  // Helper function to get payment logo URL
  const getPaymentLogoUrl = (logoFile: string) => {
    return `${getSupabaseUrl()}/storage/v1/object/public/assets/images/pay_logo/${logoFile}`;
  };

  // Helper function to get display name from logo file
  const getLogoDisplayName = (logoFile: string) => {
    return logoFile.replace('logo_', '').replace('.png', '').toUpperCase();
  };

  // Helper function to get payment method display name
  const getPaymentMethodDisplayName = (paymentMethod: string) => {
    if (!paymentMethod || paymentMethod === 'snap') return '-';
    
    const methodMap: { [key: string]: string } = {
      'credit_card': 'Credit Card',
      'bank_transfer': 'Bank Transfer',
      'bca': 'BCA',
      'bni': 'BNI',
      'mandiri': 'Mandiri',
      'permata': 'Permata',
      'gopay': 'GoPay',
      'dana': 'DANA',
      'ovo': 'OVO',
      'shopeepay': 'ShopeePay',
      'qris': 'QRIS',
      'alfamart': 'Alfamart',
      'indomaret': 'Indomaret'
    };
    
    return methodMap[paymentMethod] || paymentMethod.toUpperCase();
  };

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
      case 'settlement':
      case 'capture':
      case 'payment_success':
      case 'subscription_activated':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'pending':
      case 'payment_pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'cancelled':
      case 'cancel':
      case 'deny':
      case 'expire':
      case 'failure':
      case 'payment_cancelled':
      case 'payment_failed':
      case 'payment_expired':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  // Helper function to get status text
  const getStatusText = (status: string) => {
    switch (status) {
      case 'payment_created':
        return 'Created';
      case 'pending':
      case 'payment_pending':
        return 'Pending';
      case 'paid':
      case 'settlement':
      case 'capture':
      case 'payment_success':
      case 'subscription_activated':
        return 'Paid';
      case 'cancelled':
      case 'cancel':
      case 'deny':
      case 'payment_cancelled':
        return 'Cancelled';
      case 'expire':
      case 'failure':
      case 'payment_failed':
      case 'payment_expired':
        return 'Expired';
      default:
        return status;
    }
  };

  // Helper function to get plan info
  const getPlanInfo = (activity: any) => {
    // Check metadata first
    if (activity.metadata?.plan_name) {
      return activity.metadata.plan_name;
    }
    
    // Check if activity has subscription data
    if (activity.subscriptions?.plan_name) {
      return activity.subscriptions.plan_name;
    }
    
    // Check description for plan names
    if (activity.description) {
      if (activity.description.includes('Plus')) return 'Plus';
      if (activity.description.includes('Premium')) return 'Premium';
      if (activity.description.includes('Pro')) return 'Pro';
      if (activity.description.includes('Free Trial')) return 'Free Trial';
    }
    
    // Check amount to infer plan
    if (activity.amount) {
      if (activity.amount === 35000) return 'Plus';
      if (activity.amount === 89000) return 'Premium';
      if (activity.amount === 165000) return 'Pro';
      if (activity.amount === 0) return 'Free Trial';
    }
    
    return '-';
  };

  // Helper function to get duration
  const getDuration = (activity: any) => {
    // Check metadata first
    if (activity.metadata?.plan_duration) {
      const duration = activity.metadata.plan_duration;
      if (duration === 0.25) return '1 Week';
      if (duration === 1) return '1 Month';
      if (duration === 3) return '3 Months';
      if (duration === 6) return '6 Months';
      return `${duration} Month${duration > 1 ? 's' : ''}`;
    }
    
    // Check if activity has subscription data
    if (activity.subscriptions?.plan_duration) {
      const duration = activity.subscriptions.plan_duration;
      if (duration === 0.25) return '1 Week';
      if (duration === 1) return '1 Month';
      if (duration === 3) return '3 Months';
      if (duration === 6) return '6 Months';
      return `${duration} Month${duration > 1 ? 's' : ''}`;
    }
    
    // Infer duration from amount
    if (activity.amount) {
      if (activity.amount === 35000) return '1 Month'; // Plus
      if (activity.amount === 89000) return '3 Months'; // Premium
      if (activity.amount === 165000) return '6 Months'; // Pro
      if (activity.amount === 0) return '1 Week'; // Free Trial
    }
    
    return '-';
  };

  // Helper function to format date
  const formatPaymentDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Pagination functions
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadPaymentActivity(page, 5);
  };

  // Auto scroll to pending payment on first load
  useEffect(() => {
    if (pendingTransactions.length > 0 && !hasScrolledToPending) {
      const timer = setTimeout(() => {
        const pendingSection = document.getElementById('pending-transactions');
        if (pendingSection) {
          pendingSection.scrollIntoView({ behavior: 'smooth' });
          setHasScrolledToPending(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [pendingTransactions.length, hasScrolledToPending]);

  // Payment methods configuration
  const paymentMethodsConfig = {
    qris: {
      title: 'QRIS',
      logos: ['logo_qris.png']
    },
    ewallet: {
      title: 'E-wallet',
      logos: ['logo_gopay.png', 'logo_spay.png', 'logo_dana.png']
    },
    virtualAccount: {
      title: 'Virtual Account',
      logos: ['logo_bca.png', 'logo_bni.png', 'logo_pb.png']
    },
    creditCard: {
      title: 'Credit/Debit Card',
      logos: ['logo_visa.png', 'logo_mastercard.png', 'logo_jcb.png', 'logo_amex.png']
    },
    alfaGroup: {
      title: 'Alfa Group',
      logos: ['logo_alfamart.png', 'logo_alfamidi.png', 'logo_dandan.png']
    },
    indomaret: {
      title: 'Indomaret',
      logos: ['logo_indomaret.png', 'logo_isaku.png']
    }
  };

  // PaymentLogo component
  const PaymentLogo = ({ logoFile }: { logoFile: string }) => (
    <div className="bg-white rounded-lg p-2 shadow-sm border border-gray-200 w-16 h-16 flex items-center justify-center">
      <img 
        src={getPaymentLogoUrl(logoFile)}
        alt={getLogoDisplayName(logoFile)} 
        className="w-12 h-12 object-contain"
        onError={handleImageError}
      />
    </div>
  );

  // PaymentGroup component
  const PaymentGroup = ({ title, logos }: { title: string; logos: string[] }) => (
    <div className="flex-shrink-0 border border-gray-200 rounded-lg p-3">
      <h4 className="text-xs font-semibold mb-2 text-center text-white">{title}</h4>
      <div className="flex gap-2">
        {logos.map((logoFile, index) => (
          <PaymentLogo key={index} logoFile={logoFile} />
        ))}
      </div>
    </div>
  );

  useEffect(() => {
    loadSubscriptionStatus();
    loadPaymentMethods();
    loadPaymentActivity();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
      const response = await api.getSubscriptionStatus();
      if (response.success) {
        setSubscriptionStatus(response.data);
        setTransactions(response.data.transactions || []);
        
        // Debug logging
        console.log('Subscription data:', response.data);
        console.log('Transactions:', response.data.transactions);
        
        // Check if there's an active payment (only pending, not settlement or cancel)
        const hasPendingPayment = response.data.transactions?.some(
          (tx: any) => tx.status === 'pending'
        );
        setHasActivePayment(hasPendingPayment || false);
        
        // Load pending transactions (only truly pending ones, exclude cancelled and expired)
        const pendingTxs = response.data.transactions?.filter(
          (tx: any) => {
            if (tx.status !== 'pending') return false;
            
            // Check if transaction is not expired
            const now = new Date();
            const expiryTime = new Date(tx.expiry_time);
            return now <= expiryTime;
          }
        ) || [];
        setPendingTransactions(pendingTxs);
        
        // Reset scroll flag when new pending transactions are loaded
        if (pendingTxs.length > 0) {
          setHasScrolledToPending(false);
        }
        
        console.log('Has pending payment:', hasPendingPayment);
        console.log('Pending transactions:', pendingTxs);
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const response = await api.getPaymentMethods();
      if (response.success) {
        setPaymentMethods(response.data);
      }
    } catch (error) {
      console.error('Failed to load payment methods:', error);
    }
  };

  const loadPaymentActivity = async (page: number = 1, limit: number = 5) => {
    try {
      const response = await api.getPaymentActivity({ offset: (page - 1) * limit, limit });
      if (response.success) {
        console.log('Payment activity response:', response.data);
        setPaymentActivities(response.data.activities || []);
        const total = response.data.total || 0;
        const totalPages = Math.ceil(total / limit);
        console.log('Total activities:', total, 'Total pages:', totalPages);
        setTotalPages(totalPages);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Failed to load payment activity:', error);
    }
  };

  const getSubscriptionStatus = () => {
    if (!subscriptionStatus?.subscription) {
      return { status: 'inactive', daysLeft: 0, isActive: false, planName: 'Free Plan' };
    }

    const subscription = subscriptionStatus.subscription;
    
    // If subscription is cancelled, failed, or expired, treat as inactive
    if (['cancelled', 'failed', 'expired'].includes(subscription.status)) {
      return { status: 'inactive', daysLeft: 0, isActive: false, planName: 'Free Plan' };
    }
    
    const now = new Date();
    const endDate = new Date(subscription.end_date);
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    const isActive = subscription.status === 'active' && daysLeft > 0;
    
    return {
      status: subscription.status,
      daysLeft: Math.max(0, daysLeft),
      isActive,
      endDate: subscription.end_date,
      planName: subscription.plan_name
    };
  };

  // Function to update payment method
  const updatePaymentMethod = async (transactionId: string, paymentType: string) => {
    try {
      await api.updatePaymentMethod({ transactionId, paymentMethod: paymentType });
    } catch (error) {
      console.error('Failed to update payment method:', error);
    }
  };

  const handleSubscribe = async (planId: string) => {
    // Check if there are pending transactions
    if (hasActivePayment) {
      toast.error('Anda memiliki pembayaran yang sedang berlangsung. Silakan tunggu hingga selesai.');
      return;
    }

    try {
      setLoading(true);
      setLoadingPlan(planId);
      
      const response = await api.createSubscriptionOrder({
        planId,
        paymentMethod: 'snap' // Snap adalah gateway, payment method akan dipilih user di popup
      });

      if (response.success) {
        // Initialize Midtrans Snap
        if ((window as any).snap) {
          (window as any).snap.pay(response.data.snapToken, {
            onSuccess: (result: any) => {
              console.log('Payment success:', result);
              // Update payment method based on result
              if (result.payment_type) {
                updatePaymentMethod(response.data.transactionId, result.payment_type);
              }
              toast.success('Payment berhasil! Subscription Anda telah diaktifkan.');
              setHasActivePayment(false);
              // Refresh status with delay to prevent race conditions
              setTimeout(() => {
                loadSubscriptionStatus();
                loadPaymentActivity();
              }, 1000);
            },
            onPending: (result: any) => {
              console.log('Payment pending:', result);
              // Update payment method based on result
              if (result.payment_type) {
                updatePaymentMethod(response.data.transactionId, result.payment_type);
              }
              toast.info('Payment sedang diproses. Silakan tunggu konfirmasi.');
              setHasActivePayment(true);
              // Refresh status with delay to prevent race conditions
              setTimeout(() => {
                loadSubscriptionStatus();
                loadPaymentActivity();
              }, 1000);
            },
            onError: (result: any) => {
              console.log('Payment error:', result);
              toast.error('Payment gagal. Silakan coba lagi.');
            },
            onClose: () => {
              console.log('Payment popup closed');
              toast.info('Payment dibatalkan.');
              setHasActivePayment(false);
              // Refresh status immediately
              loadSubscriptionStatus();
              loadPaymentActivity();
            }
          });
        } else {
          toast.error('Payment gateway tidak tersedia. Silakan refresh halaman.');
        }
      } else {
        toast.error(response.error || 'Gagal membuat order pembayaran');
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      toast.error(error.message || 'Terjadi kesalahan saat memproses subscription');
    } finally {
      setLoading(false);
      setLoadingPlan(null);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setLoading(true);
      const response = await api.cancelSubscription({
        reason: 'User requested cancellation'
      });

      if (response.success) {
        toast.success('Subscription berhasil dibatalkan');
        loadSubscriptionStatus();
      } else {
        toast.error(response.error || 'Gagal membatalkan subscription');
      }
    } catch (error: any) {
      console.error('Cancel subscription error:', error);
      toast.error(error.message || 'Terjadi kesalahan saat membatalkan subscription');
    } finally {
      setLoading(false);
    }
  };

  const handleContinuePayment = async (transaction: any) => {
    try {
      setLoading(true);
      
      // Always regenerate snap token to ensure it's fresh and valid
      toast.info('Mempersiapkan halaman pembayaran...');
      
      const response = await api.regenerateSnapToken({
        transactionId: transaction.id
      });

      if (response.success) {
        // Open payment URL in new tab for pending payments
        if (response.data.paymentUrl) {
          window.open(response.data.paymentUrl, '_blank');
          toast.success('Halaman pembayaran dibuka di tab baru. Silakan selesaikan pembayaran Anda.');
          // Refresh status after a short delay
          setTimeout(() => {
            loadSubscriptionStatus();
            loadPaymentActivity();
          }, 3000);
        } else {
          toast.error('URL pembayaran tidak tersedia. Silakan coba lagi.');
        }
      } else {
        // Handle specific error cases
        if (response.error?.includes('expired')) {
          toast.error('Transaksi telah expired. Silakan buat order baru.');
          // Refresh data to remove expired transaction
          loadSubscriptionStatus();
          loadPaymentActivity();
        } else {
          toast.error(response.error || 'Gagal mempersiapkan halaman pembayaran. Silakan coba lagi.');
        }
      }
    } catch (error: any) {
      console.error('Continue payment error:', error);
      toast.error('Terjadi kesalahan saat mempersiapkan pembayaran. Silakan coba lagi atau hubungi support.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTransaction = async (transaction: any) => {
    try {
      setLoading(true);
      
      // Cancel the pending transaction
      const response = await api.cancelPendingTransaction({
        transactionId: transaction.id,
        reason: 'User cancelled pending transaction'
      });

      if (response.success) {
        toast.success('Transaksi berhasil dibatalkan');
        // Force refresh all data
        await Promise.all([
          loadSubscriptionStatus(),
          loadPaymentActivity()
        ]);
        // Reset states
        setHasActivePayment(false);
        setPendingTransactions([]);
      } else {
        toast.error(response.error || 'Gagal membatalkan transaksi');
      }
    } catch (error: any) {
      console.error('Cancel transaction error:', error);
      toast.error(error.message || 'Terjadi kesalahan saat membatalkan transaksi');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Pending Transaction Section */}
      {pendingTransactions.length > 0 && (
        <Card id="pending-transactions" className="border-orange-500 bg-orange-500/10">
          <CardHeader>
            <CardTitle className="text-orange-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Transaksi Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-100">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Anda tidak dapat membuka transaksi baru karena ada transaksi yang belum dibayar.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h4 className="font-medium text-orange-100">Berikut transaksi yang sedang pending:</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-orange-500/20">
                        <th className="text-left py-2 px-3 text-orange-200 text-sm">Date</th>
                        <th className="text-left py-2 px-3 text-orange-200 text-sm">Status</th>
                        <th className="text-left py-2 px-3 text-orange-200 text-sm">Amount</th>
                        <th className="text-left py-2 px-3 text-orange-200 text-sm">Product</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingTransactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-orange-500/10">
                          <td className="py-2 px-3 text-orange-100 text-sm">
                            {formatDate(transaction.created_at)}
                          </td>
                          <td className="py-2 px-3">
                            <Badge className="bg-blue-500 text-white text-xs">
                              UNPAID
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-orange-100 text-sm font-medium">
                            IDR {transaction.amount?.toLocaleString() || '0'}
                          </td>
                          <td className="py-2 px-3 text-orange-100 text-sm">
                            {transaction.subscriptions?.plan_name || 'Unknown Plan'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-4 border-t border-orange-500/20">
                <div className="text-center">
                  <p className="text-orange-100 mb-4">
                    Mau lanjut bayar, atau di cancel saja?
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white px-6"
                      onClick={() => handleContinuePayment(pendingTransactions[0])}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          {pendingTransactions[0]?.payment_method && pendingTransactions[0].payment_method !== 'snap' 
                            ? 'Lanjut Bayar' 
                            : 'Pilih & Bayar'
                          }
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="px-6"
                      onClick={() => handleCancelTransaction(pendingTransactions[0])}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 mr-2" />
                          Cancel
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <Alert className="bg-orange-500/10 border-orange-500/20 text-orange-100">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1 text-sm">
                    {pendingTransactions[0]?.payment_method && pendingTransactions[0].payment_method !== 'snap' ? (
                      <p>Metode pembayaran sudah dipilih: <strong>{getPaymentMethodDisplayName(pendingTransactions[0].payment_method)}</strong></p>
                    ) : (
                      <>
                        <p>Transaksi hanya bisa di-cancel kalau sudah pilih metode pembayaran.</p>
                        <p>Klik bayar untuk memilih metode pembayaran.</p>
                      </>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const subStatus = getSubscriptionStatus();
            
                   if (!subscriptionStatus?.subscription || !subStatus.isActive) {
                     return (
                       <div className="text-center py-8">
                         <div className="text-muted-foreground mb-4">
                           <p className="text-lg font-medium">Free Plan</p>
                           <p className="text-sm">Choose a plan below to get started</p>
                         </div>
                       </div>
                     );
                   }

            return (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{subStatus.planName}</h3>
                    <Badge className={
                      subStatus.isActive 
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : subStatus.status === 'expired'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                    }>
                      {subStatus.isActive ? 'Active' : subStatus.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {subStatus.isActive 
                      ? `Expires in ${subStatus.daysLeft} days`
                      : subStatus.status === 'expired'
                      ? 'Subscription expired'
                      : 'Subscription inactive'
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {subStatus.endDate && `End date: ${new Date(subStatus.endDate).toLocaleDateString('id-ID')}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {subStatus.isActive && (
                    <>
                      <Button variant="outline" size="sm">
                        Manage Billing
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={handleCancelSubscription}
                        disabled={loading}
                      >
                        {loading ? 'Cancelling...' : 'Cancel Subscription'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Subscription Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Choose Your Plan</CardTitle>
          <p className="text-muted-foreground text-center">
            Semua paket memberikan akses penuh ke semua fitur. Pilih durasi yang sesuai dengan kebutuhan Anda.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subscriptionPlans.map((plan) => (
              <Card 
                key={plan.id} 
                className={`relative ${plan.popular ? 'ring-2 ring-primary' : ''} ${
                  selectedPlan === plan.id ? 'border-primary' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader>
                  <CardTitle className="text-center">{plan.name}</CardTitle>
                  <div className="text-center">
                    <span className="text-3xl font-bold">
                      Rp {plan.price.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      /{plan.period}
                    </span>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Features:</h4>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                      </ul>
                    </div>
                    
                             <Button 
                               className="w-full" 
                               onClick={() => handleSubscribe(plan.id)}
                               disabled={hasActivePayment || loading}
                             >
                               {loadingPlan === plan.id ? (
                                 <>
                                   <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                   Processing...
                                 </>
                               ) : hasActivePayment ? (
                                 'Payment in Progress...'
                               ) : (
                                 `Subscribe to ${plan.name}`
                               )}
                             </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Refresh Button */}
          <div className="mt-6 text-center">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                loadSubscriptionStatus();
                loadPaymentActivity();
                toast.info('Status refreshed');
              }}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Status
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="flex gap-4 pb-4" style={{ width: 'max-content' }}>
              {Object.values(paymentMethodsConfig).map((group, index) => (
                <PaymentGroup 
                  key={index} 
                  title={group.title} 
                  logos={group.logos} 
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Payment History</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPaymentActivity(1, 5)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {paymentActivities.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">No</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Payment Method</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Plan</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentActivities.map((activity, index) => (
                      <tr key={activity.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {((currentPage - 1) * 5) + index + 1}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {formatPaymentDate(activity.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="secondary"
                            className={`text-xs ${getStatusColor(activity.activity_type)}`}
                          >
                            {getStatusText(activity.activity_type)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-sm font-medium">
                          {activity.amount ? `Rp ${activity.amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {getPaymentMethodDisplayName(activity.payment_method)}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {getPlanInfo(activity)}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {getDuration(activity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {(() => {
                console.log('Rendering pagination - totalPages:', totalPages, 'currentPage:', currentPage);
                return null;
              })()}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * 5) + 1} to {Math.min(currentPage * 5, paymentActivities.length)} of {paymentActivities.length} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = i + 1;
                        return (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(page)}
                            className="w-8 h-8 p-0"
                          >
                            {page}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No payment activity yet</p>
              <p className="text-sm">Your payment history will appear here</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium">Can I change my plan anytime?</h4>
              <p className="text-sm text-muted-foreground">
                Yes, you can upgrade or downgrade your plan at any time. Changes will be prorated.
              </p>
            </div>
            <div>
              <h4 className="font-medium">Is there a free trial?</h4>
              <p className="text-sm text-muted-foreground">
                Yes, we offer a 7-day free trial for all new users. No credit card required.
              </p>
            </div>
            <div>
              <h4 className="font-medium">What happens if I cancel?</h4>
              <p className="text-sm text-muted-foreground">
                You'll continue to have access until the end of your current billing period.
              </p>
            </div>
            <div>
              <h4 className="font-medium">Do you offer refunds?</h4>
              <p className="text-sm text-muted-foreground">
                We offer a 30-day money-back guarantee for all paid plans.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}