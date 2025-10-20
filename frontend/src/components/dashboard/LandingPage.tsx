import React from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";
import { Button } from "../ui/button";
import { Navbar } from "../../components/Navbar";
import { Footer } from "../../components/Footer";
import Logo from "./Logo";

interface LandingPageProps {
  onStartTrial?: () => void;
  onSignIn?: () => void;
  onRegister?: () => void;
}

export function LandingPage({ onStartTrial, onSignIn, onRegister }: LandingPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background">
      <Helmet>
        <title>{`BandarmoloNY \u2014 Intelligent Market Analysis`}</title>
        <meta
          name="description"
          content="Transform your trading strategy with intelligent market analysis and real-time insights."
        />
        <link rel="canonical" href="https://bandarmolony.com/" />
        <meta
          property="og:title"
          content="BandarmoloNY \u2014 Intelligent Market Analysis"
        />
        <meta
          property="og:description"
          content="Transform your trading strategy with intelligent market analysis and advanced trading insights."
        />
        <meta property="og:url" content="https://bandarmolony.com/" />
        <meta property="og:image" content="https://bandarmolony.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="BandarmoloNY \u2014 Intelligent Market Analysis"
        />
        <meta
          name="twitter:description"
          content="Transform your trading strategy with intelligent market analysis and advanced trading insights."
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

      <main className="relative z-10 flex min-h-[calc(100vh-200px)] flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-8"
        >
          <div className="mb-8 flex items-center justify-center gap-6">
            <Logo
              className="h-20 md:h-24"
              badgeClassName="h-20 w-24 md:h-24 md:w-28"
              textClassName="text-5xl md:text-7xl font-bold text-foreground tracking-tight drop-shadow-2xl"
              showText={true}
            />
          </div>

          <motion.p
            className="mx-auto mb-8 max-w-2xl text-lg font-light leading-relaxed tracking-wide text-muted-foreground md:text-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            Transform your trading strategy with intelligent market analysis and advanced trading insights.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <Button
              size="lg"
              onClick={onStartTrial}
              className="transform rounded-2xl border-0 bg-primary px-10 py-7 text-lg font-semibold text-primary-foreground shadow-2xl transition-all duration-300 hover:-translate-y-2 hover:scale-105 hover:bg-primary/90 hover:shadow-primary/20"
            >
              Start Free Trial
            </Button>
          </motion.div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
