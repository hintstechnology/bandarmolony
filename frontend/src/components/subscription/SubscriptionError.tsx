import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { XCircle, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { Alert, AlertDescription } from '../ui/alert';

export function SubscriptionError() {
  const navigate = useNavigate();
  const location = useLocation();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [urlStatus, setUrlStatus] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'verified' | 'mismatch' | null>(null);

  useEffect(() => {
    // Parse query parameters from Midtrans callback
    const searchParams = new URLSearchParams(location.search);
    const urlOrderId = searchParams.get('order_id');
    const urlTransactionStatus = searchParams.get('transaction_status');

    if (urlOrderId) {
      setOrderId(urlOrderId);
    }
    if (urlTransactionStatus) {
      setUrlStatus(urlTransactionStatus);
    }

    // If order_id is provided, verify payment status
    if (urlOrderId) {
      verifyPaymentStatus(urlOrderId);
    }
  }, [location.search]);

  const verifyPaymentStatus = async (orderIdFromUrl: string) => {
    try {
      const verifyResponse = await api.checkPaymentStatus(orderIdFromUrl);
      if (verifyResponse.success && verifyResponse.data) {
        const backendStatus = verifyResponse.data.currentStatus;
        const midtransStatus = verifyResponse.data.midtransStatus;

        // If payment is actually successful, redirect to success page
        // Database uses: settlement, capture, pending, cancel
        // Midtrans uses: settlement, capture, pending, cancel, deny, expire, failure
        if (backendStatus === 'settlement' || backendStatus === 'capture' || 
            midtransStatus === 'settlement' || midtransStatus === 'capture') {
          navigate('/subscription/success', { replace: true });
          return;
        }

        // If payment is pending, redirect to pending page
        if (backendStatus === 'pending' || midtransStatus === 'pending') {
          navigate('/subscription/pending', { replace: true });
          return;
        }

        // Status matches error
        setVerificationStatus('verified');
      }
    } catch (verifyError) {
      console.error('Failed to verify payment status:', verifyError);
      setVerificationStatus('mismatch');
    }
  };

  const handleTryAgain = () => {
    navigate('/subscription');
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-600 mb-4">
              <XCircle className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-red-400">
              Pembayaran Gagal
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-300">
              Maaf, terjadi kesalahan saat memproses pembayaran Anda. 
              Silakan coba lagi atau gunakan metode pembayaran yang berbeda.
            </p>

            {/* Show warning if status mismatch */}
            {verificationStatus === 'mismatch' && (
              <Alert variant="default" className="bg-yellow-900/30 border-yellow-600">
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-300 text-sm">
                  Status pembayaran sedang diverifikasi. Jika pembayaran sebenarnya berhasil, Anda akan di-redirect otomatis.
                </AlertDescription>
              </Alert>
            )}

            {/* Show order details if available */}
            {(orderId || urlStatus) && (
              <div className="bg-gray-700 rounded-lg p-4 space-y-1 border border-gray-600">
                <h3 className="font-semibold text-sm mb-2 text-gray-100">Detail Transaksi:</h3>
                {orderId && (
                  <p className="text-xs text-gray-300"><strong className="text-gray-200">Order ID:</strong> <span className="text-gray-100">{orderId}</span></p>
                )}
                {urlStatus && (
                  <p className="text-xs text-gray-300"><strong className="text-gray-200">Status:</strong> <span className="text-gray-100">{urlStatus}</span></p>
                )}
              </div>
            )}
            
            <div className="bg-red-900/30 border border-red-600 rounded-lg p-4">
              <h3 className="font-semibold text-red-400 mb-2">Kemungkinan Penyebab:</h3>
              <ul className="text-sm text-red-300 space-y-1 text-left">
                <li>• Saldo tidak mencukupi</li>
                <li>• Kartu kredit/débit tidak valid</li>
                <li>• Koneksi internet terputus</li>
                <li>• Sesi pembayaran telah berakhir</li>
                <li>• Bank menolak transaksi</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                onClick={handleTryAgain}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Coba Lagi
              </Button>
              <Button 
                onClick={handleGoBack}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-gray-400">
            Jika masalah berlanjut, silakan hubungi tim support kami.
          </p>
        </div>
      </div>
    </div>
  );
}