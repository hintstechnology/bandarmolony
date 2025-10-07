import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';

export function SubscriptionError() {
  const navigate = useNavigate();

  const handleTryAgain = () => {
    navigate('/subscription');
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-red-600">
              Pembayaran Gagal
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Maaf, terjadi kesalahan saat memproses pembayaran Anda. 
              Silakan coba lagi atau gunakan metode pembayaran yang berbeda.
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-800 mb-2">Kemungkinan Penyebab:</h3>
              <ul className="text-sm text-red-700 space-y-1 text-left">
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
                className="flex-1"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Coba Lagi
              </Button>
              <Button 
                onClick={handleGoBack}
                variant="outline"
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Jika masalah berlanjut, silakan hubungi tim support kami.
          </p>
        </div>
      </div>
    </div>
  );
}
