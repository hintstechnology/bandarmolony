import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Sparkles, Star, Crown, Check } from "lucide-react";
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
    description: "Sempurna untuk trader yang ingin mencoba fitur kami",
    features: [
      "Berlaku selama 1 bulan",
      "Akses ke fitur analisis dasar",
      "Technical analysis chart",
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
    description: "Pilihan paling populer bagi para trader yang serius",
    features: [
      "Berlaku selama 3 bulan",
      "Akses penuh ke semua fitur analisis institusional",
      "Akses penuh ke data transaksi pasar saham",
      "Technical analysis chart",
      "Mobile & desktop access"
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
    description: "Untuk para trader profesional dan institusi trading",
    features: [
      "Berlaku selama 6 bulan",
      "Akses penuh ke semua fitur analisis institusional",
      "Akses penuh ke data transaksi pasar saham detail",
      "Akses semua fitur analisis statistik pasar saham",
      "Technical analysis chart",
      "Mobile & desktop access",
      "Dukungan prioritas"
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

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16 md:px-10 md:py-24">
        <motion.header
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">
            Pricing Plans
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
            Harga Sederhana & Transparan
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Pilih paket yang sesuai dengan kebutuhan trading anda. Semua paket memberikan akses penuh ke semua fitur analisis pasar cerdas kami.
          </p>
        </motion.header>

        {/* Pricing Cards */}
        <section className="grid gap-6 md:grid-cols-3">
          {pricingPlans.map((plan, index) => (
                <motion.article
                  key={plan.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className={`relative flex h-full flex-col rounded-3xl border border-white/10 bg-background/80 p-8 shadow-xl backdrop-blur transition-all duration-300 hover:-translate-y-2 hover:shadow-primary/20 dark:border-white/5 ${
                    plan.popular 
                      ? 'ring-2 ring-primary' 
                      : ''
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                      <Badge className="bg-primary text-primary-foreground px-4 py-1 text-sm font-semibold shadow-lg">
                        <Star className="w-4 h-4 mr-1" />
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  
                  <div className="mb-4 flex items-center justify-center">
                    {plan.name === "Plus" && (
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    {plan.name === "Premium" && plan.popular && (
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <Star className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    {plan.name === "Pro" && (
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <Crown className="w-6 h-6 text-primary" />
                      </div>
                    )}
                  </div>
                  
                  <h2 className="mb-2 text-center text-2xl font-bold text-foreground">
                    {plan.name}
                  </h2>
                  
                  <p className="mb-6 text-center text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                  
                  <div className="mb-6 text-center">
                    <div className="text-5xl font-bold text-foreground">
                      <span>Rp</span> <span>{Math.floor(plan.price / 1000).toLocaleString()}</span>
                      <span className="text-3xl">,{String(plan.price % 1000).padStart(3, '0')}</span>
                    </div>
                    <div className="text-lg text-muted-foreground">
                      /{plan.period}
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <h4 className="mb-4 font-semibold text-foreground">Yang termasuk:</h4>
                    <ul className="space-y-3">
                      {plan.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start gap-3">
                          <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <Button 
                    className={`mt-auto w-full py-6 text-lg font-semibold transition-all duration-300 ${
                      plan.popular 
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl' 
                        : 'bg-background border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground'
                    }`}
                    variant={plan.buttonVariant}
                    onClick={handleGetStarted}
                  >
                    {plan.buttonText}
                  </Button>
                </motion.article>
          ))}
        </section>

        {/* CTA Section */}
        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl border border-white/10 bg-background/60 p-8 text-center backdrop-blur dark:border-white/5 md:p-10"
        >
          <h2 className="text-2xl font-semibold md:text-3xl">Siap Mengubah Trading Anda?</h2>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            Bergabunglah dengan ribuan trader yang mempercayai BandarmoloNY untuk kebutuhan analisis pasar mereka. Mulai uji coba gratis hari ini.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
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
        </motion.section>
      </main>

      {/* SEO Backlinks Hidden Section */}
      <div className="sr-only">
        <h2>Subscription Plans by Hints Technology</h2>
        <nav>
          <ul>
            <li><a href="https://www.hintstechnology.com/" rel="nofollow noopener noreferrer">Hints Technology Services</a></li>
            <li><a href="https://bandarmolony.com/" rel="nofollow noopener noreferrer">BandarmoloNY Landing Page</a></li>
            <li><a href="https://bandarmolony.com/features" rel="nofollow noopener noreferrer">View All Features</a></li>
            <li><a href="https://bandarmolony.com/contact" rel="nofollow noopener noreferrer">Contact Support Team</a></li>
          </ul>
        </nav>
        <p>Affordable trading platform subscriptions developed by Hints Technology. Choose the right plan for your trading needs.</p>
      </div>

      <Footer />
    </div>
  );
}
