import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { CheckCircle, ArrowRight, Home, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { Alert, AlertDescription } from '../ui/alert';

export function SubscriptionSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [verificationStatus, setVerificationStatus] = useState<'verified' | 'mismatch' | 'pending' | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    // Parse query parameters from Midtrans callback
    const searchParams = new URLSearchParams(location.search);
    const urlOrderId = searchParams.get('order_id');

    if (urlOrderId) {
      setOrderId(urlOrderId);
    }

    // Load subscription status and verify payment
    loadSubscriptionStatus(urlOrderId);
  }, [location.search]);

  const loadSubscriptionStatus = async (orderIdFromUrl: string | null) => {
    try {
      // First, load subscription status
      const response = await api.getSubscriptionStatus();
      if (response.success) {
        setSubscriptionData(response.data);
      }

      // If order_id is provided in URL, verify payment status
      if (orderIdFromUrl) {
        try {
          const verifyResponse = await api.checkPaymentStatus(orderIdFromUrl);
          if (verifyResponse.success && verifyResponse.data) {
            const backendStatus = verifyResponse.data.currentStatus;
            const midtransStatus = verifyResponse.data.midtransStatus;

            // Check if status matches
            // Database uses: settlement, capture, pending, cancel
            // Midtrans uses: settlement, capture, pending, cancel, deny, expire, failure
            const isSuccess = backendStatus === 'settlement' || backendStatus === 'capture' || 
                             midtransStatus === 'settlement' || midtransStatus === 'capture';
            const isPending = (backendStatus === 'pending' && (midtransStatus === 'pending' || !midtransStatus));
            const isCancelled = backendStatus === 'cancel' || midtransStatus === 'cancel' || 
                               midtransStatus === 'deny' || midtransStatus === 'expire' || 
                               midtransStatus === 'failure';
            
            if (isSuccess) {
              setVerificationStatus('verified');
            } else if (isPending) {
              setVerificationStatus('pending');
              // Redirect to pending page if still pending
              setTimeout(() => {
                navigate('/subscription/pending?order_id=' + orderIdFromUrl, { replace: true });
              }, 1500);
            } else if (isCancelled) {
              // Payment was cancelled/failed - redirect to error page
              console.log('❌ Payment cancelled/failed, redirecting to error page');
              navigate('/subscription/error?order_id=' + orderIdFromUrl + '&transaction_status=' + (midtransStatus || backendStatus), { replace: true });
            } else {
              setVerificationStatus('mismatch');
            }
          }
        } catch (verifyError) {
          console.error('Failed to verify payment status:', verifyError);
          // If verification fails, still show success page but mark as unverified
          setVerificationStatus('pending');
        }
      } else {
        // No order_id in URL, just load subscription status
        setVerificationStatus('verified');
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  const handleGoToSubscription = () => {
    navigate('/subscription');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Memverifikasi pembayaran...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-600 mb-4">
              <CheckCircle className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-400">
              Pembayaran Berhasil!
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-300">
              Terima kasih! Pembayaran Anda telah berhasil diproses dan subscription Anda telah diaktifkan.
            </p>

            {/* Show warning if status mismatch */}
            {verificationStatus === 'mismatch' && (
              <Alert variant="default" className="bg-yellow-900/30 border-yellow-600">
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-300 text-sm">
                  Status pembayaran sedang diverifikasi. Jika subscription belum aktif, silakan refresh halaman atau hubungi support.
                </AlertDescription>
              </Alert>
            )}

            {/* Show info if payment still pending */}
            {verificationStatus === 'pending' && (
              <Alert variant="default" className="bg-blue-900/30 border-blue-600">
                <AlertCircle className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-300 text-sm">
                  Pembayaran sedang diproses. Subscription akan aktif otomatis setelah pembayaran dikonfirmasi.
                </AlertDescription>
              </Alert>
            )}
            
            {subscriptionData?.subscription && (
              <div className="bg-gray-700 rounded-lg p-4 space-y-2 border border-gray-600">
                <h3 className="font-semibold text-gray-100">Detail Subscription:</h3>
                <div className="text-sm text-gray-300 space-y-1">
                  <p><strong className="text-gray-200">Plan:</strong> <span className="text-gray-100">{subscriptionData.subscription.plan_name}</span></p>
                  <p><strong className="text-gray-200">Status:</strong> 
                    <span className={`ml-1 px-2 py-1 rounded-full text-xs ${
                      subscriptionData.subscription.status === 'active' 
                        ? 'bg-green-600 text-white' 
                        : subscriptionData.subscription.status === 'pending'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-600 text-gray-200'
                    }`}>
                      {subscriptionData.subscription.status === 'active' ? 'Aktif' : 
                       subscriptionData.subscription.status === 'pending' ? 'Pending' :
                       subscriptionData.subscription.status}
                    </span>
                  </p>
                  {subscriptionData.subscription.end_date && (
                    <p><strong className="text-gray-200">Berlaku hingga:</strong> <span className="text-gray-100">{new Date(subscriptionData.subscription.end_date).toLocaleDateString('id-ID')}</span></p>
                  )}
                  {orderId && (
                    <p className="text-xs text-gray-400 mt-2"><strong>Order ID:</strong> <span className="text-gray-300">{orderId}</span></p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                onClick={handleGoToDashboard}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
              >
                <Home className="w-4 h-4 mr-2" />
                Ke Dashboard
              </Button>
              <Button 
                onClick={handleGoToSubscription}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Kelola Subscription
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-gray-400">
            Jika Anda memiliki pertanyaan, silakan hubungi tim support kami.
          </p>
        </div>
      </div>
    </div>
  );
}