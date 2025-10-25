import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Check, Star, Zap } from "lucide-react";
// @ts-ignore
import { Navbar } from "../../components/Navbar";
// @ts-ignore
import { Footer } from "../../components/Footer";

const pricingPlans = [
  {
    id: "plus",
    name: "Plus",
    price: 35000,
    period: "1 bulan",
    duration: 1,
    popular: false,
    description: "Sempurna untuk trader individual",
    features: [
      "Akses penuh ke semua fitur analisis",
      "Data real-time market",
      "Technical analysis tools",
      "Email support",
      "Mobile & desktop access"
    ],
    buttonText: "Mulai Berlangganan",
    buttonVariant: "outline" as const
  },
  {
    id: "premium",
    name: "Premium",
    price: 89000,
    period: "3 bulan",
    duration: 3,
    popular: true,
    description: "Pilihan paling populer untuk trader serius",
    features: [
      "Semua fitur Plus",
      "Advanced market insights",
      "Priority support",
      "Custom alerts",
      "Export data to Excel",
      "API access",
      "Advanced charting tools"
    ],
    buttonText: "Paling Populer",
    buttonVariant: "default" as const
  },
  {
    id: "pro",
    name: "Pro",
    price: 165000,
    period: "6 bulan",
    duration: 6,
    popular: false,
    description: "Untuk trader profesional dan institusi",
    features: [
      "Semua fitur Premium",
      "White-label solutions",
      "Dedicated account manager",
      "Custom integrations",
      "Advanced reporting",
      "24/7 phone support",
      "Training sessions"
    ],
    buttonText: "Go Pro",
    buttonVariant: "outline" as const
  }
];

interface PricingPageProps {
  onSignIn?: () => void;
  onRegister?: () => void;
}

export function PricingPage({ onSignIn, onRegister }: PricingPageProps) {
  const handleGetStarted = () => {
    if (typeof onRegister === "function") {
      onRegister();
    } else {
      window.location.href = "/auth?mode=register";
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background">
      <Helmet>
        <title>Harga - BandarmoloNY</title>
        <meta
          name="description"
          content="Pilih paket yang sesuai dengan kebutuhan trading Anda. Harga terjangkau dengan fitur canggih."
        />
        <link rel="canonical" href="https://bandarmolony.com/pricing" />
        <meta
          property="og:title"
          content="Harga - BandarmoloNY"
        />
        <meta
          property="og:description"
          content="Pilih paket yang sesuai dengan kebutuhan trading Anda. Harga terjangkau dengan fitur canggih."
        />
        <meta property="og:url" content="https://bandarmolony.com/pricing" />
        <meta property="og:image" content="https://bandarmolony.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Harga - BandarmoloNY"
        />
        <meta
          name="twitter:description"
          content="Pilih paket yang sesuai dengan kebutuhan trading Anda. Harga terjangkau dengan fitur canggih."
        />
        <meta name="twitter:image" content="https://bandarmolony.com/og-image.jpg" />
      </Helmet>

      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-foreground/3 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
      </div>

      <Navbar onSignIn={onSignIn} onRegister={onRegister} />

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="px-6 py-16 md:py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="max-w-4xl mx-auto"
        >
          <motion.h1
            className="text-4xl md:text-6xl font-bold text-foreground mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Harga Sederhana & Transparan
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            Pilih paket yang sesuai dengan kebutuhan trading Anda. Semua paket memberikan akses penuh ke semua fitur analisis pasar cerdas kami.
          </motion.p>
        </motion.div>
        </section>

        {/* Pricing Cards */}
        <section className="px-2 pb-16 md:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="max-w-7xl mx-auto"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {pricingPlans.map((plan, index) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.9 + index * 0.1 }}
                  className="relative"
                >
                  <Card className={`relative h-full transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 ${
                    plan.popular 
                      ? 'ring-2 ring-primary shadow-2xl scale-105' 
                      : 'hover:shadow-xl'
                  }`}>
                    {plan.popular && (
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                        <Badge className="bg-primary text-primary-foreground px-4 py-1 text-sm font-semibold shadow-lg">
                          <Star className="w-4 h-4 mr-1" />
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    
                    <CardHeader className="text-center pb-8 pt-8">
                      <div className="flex items-center justify-center mb-4">
                        {plan.popular ? (
                          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                            <Zap className="w-6 h-6 text-primary" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                            <Check className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      
                      <CardTitle className="text-2xl font-bold text-foreground mb-2">
                        {plan.name}
                      </CardTitle>
                      
                      <p className="text-muted-foreground text-sm mb-6">
                        {plan.description}
                      </p>
                      
                      <div className="mb-6">
                        <span className="text-5xl font-bold text-foreground">
                          Rp {plan.price.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground text-lg ml-2">
                          /{plan.period}
                        </span>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-0">
                      <div className="space-y-6">
                        <div>
                          <h4 className="font-semibold text-foreground mb-4">Yang termasuk:</h4>
                          <ul className="space-y-3">
                            {plan.features.map((feature, featureIndex) => (
                              <li key={featureIndex} className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                                <span className="text-sm text-muted-foreground">
                                  {feature}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <Button 
                          className={`w-full py-6 text-lg font-semibold transition-all duration-300 ${
                            plan.popular 
                              ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl' 
                              : 'bg-background border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground'
                          }`}
                          variant={plan.buttonVariant}
                          onClick={handleGetStarted}
                        >
                          {plan.buttonText}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* CTA Section */}
        <section className="px-6 pb-16 md:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.4 }}
            className="max-w-4xl mx-auto text-center"
          >
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-3xl p-8 md:p-12 border border-primary/20">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Siap Mengubah Trading Anda?
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Bergabunglah dengan ribuan trader yang mempercayai BandarmoloNY untuk kebutuhan analisis pasar mereka. Mulai uji coba gratis hari ini.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  onClick={handleGetStarted}
                  className="transform rounded-2xl border-0 bg-primary px-10 py-7 text-lg font-semibold text-primary-foreground shadow-2xl transition-all duration-300 hover:-translate-y-2 hover:scale-105 hover:bg-primary/90 hover:shadow-primary/20"
                >
                  Mulai Uji Coba Gratis
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={onSignIn}
                  className="transform rounded-2xl px-10 py-7 text-lg font-semibold transition-all duration-300 hover:-translate-y-2 hover:scale-105"
                >
                  Masuk
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
