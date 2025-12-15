import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { TrendingUp, Calendar, BarChart3, Sparkles } from 'lucide-react';

interface QuickAccessCardProps {
  onBandarmologyClick: () => void;
  onBazimologyClick: () => void;
}

export function QuickAccessCard({ onBandarmologyClick, onBazimologyClick }: QuickAccessCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-center text-lg font-semibold text-primary flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5" />
          Quick Access
          <Sparkles className="w-5 h-5" />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-2xl mx-auto">
          {/* Bandarmology Button */}
          <div className="group">
            <Button 
              onClick={onBandarmologyClick}
              className="w-full h-20 sm:h-24 flex flex-col items-center justify-center gap-1 sm:gap-2 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <BarChart3 className="w-5 h-5 sm:w-7 sm:h-7" />
                <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <span className="font-semibold text-sm sm:text-base">Bandarmology</span>
            </Button>
          </div>
          
          {/* Bazimology Button */}
          <div className="group">
            <Button 
              onClick={onBazimologyClick}
              variant="outline"
              className="w-full h-20 sm:h-24 flex flex-col items-center justify-center gap-1 sm:gap-2 bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Calendar className="w-5 h-5 sm:w-7 sm:h-7" />
                <Sparkles className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <span className="font-semibold text-sm sm:text-base">Bazimology</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

