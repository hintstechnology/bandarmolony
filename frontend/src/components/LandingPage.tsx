import React from "react";
import { Button } from "./ui/button";
import { MessageCircle, Send, Instagram, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

interface LandingPageProps {
  onStartTrial?: () => void;
  onSignIn?: () => void;
  onRegister?: () => void;
}

export function LandingPage({ onStartTrial, onSignIn, onRegister }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-foreground/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-foreground/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-foreground/3 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 md:px-12">
        <motion.div 
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-2xl border border-primary/20">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-foreground font-semibold text-lg h-8 flex items-center tracking-wide">BandarmoloNY</span>
        </motion.div>
        
        <motion.div 
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <Button 
            variant="ghost" 
            onClick={onSignIn}
            className="text-foreground hover:bg-foreground/10 border-foreground/30 border h-8 font-medium"
          >
            Sign In
          </Button>
          <Button 
            onClick={onRegister}
            className="bg-primary text-primary-foreground hover:bg-primary/90 border-0 shadow-xl h-8 font-semibold"
          >
            Register
          </Button>
        </motion.div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-8"
        >
          <div className="flex items-center justify-center gap-6 mb-8">
            <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center shadow-2xl border border-primary/20 backdrop-blur-sm">
              <TrendingUp className="w-12 h-12 text-primary-foreground" />
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-foreground tracking-tight drop-shadow-2xl h-16 md:h-20 flex items-center">
              BandarmoloNY
            </h1>
          </div>
          
          <motion.p 
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed font-light tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            Transform your investment strategy with intelligent market analysis and advanced trading insights.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <Button 
              size="lg" 
              onClick={onStartTrial}
              className="bg-primary text-primary-foreground hover:bg-primary/90 border-0 px-10 py-7 text-lg font-semibold rounded-2xl shadow-2xl hover:shadow-primary/20 transition-all duration-300 transform hover:-translate-y-2 hover:scale-105"
            >
              Start Free Trial
            </Button>
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex flex-col md:flex-row items-center justify-between px-6 py-6 md:px-12">
        {/* Social Media Icons - Center on mobile, center-bottom on desktop */}
        <motion.div 
          className="flex items-center gap-6 order-1 md:order-2 md:absolute md:left-1/2 md:transform md:-translate-x-1/2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          <a 
            href="#" 
            className="w-14 h-14 bg-gradient-to-r from-green-600 to-green-500 rounded-full flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-2xl border border-foreground/10 backdrop-blur-sm"
          >
            <MessageCircle className="w-6 h-6 text-white" />
          </a>
          <a 
            href="#" 
            className="w-14 h-14 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-2xl border border-foreground/10 backdrop-blur-sm"
          >
            <Send className="w-6 h-6 text-white" />
          </a>
          <a 
            href="#" 
            className="w-14 h-14 bg-gradient-to-r from-pink-600 to-purple-600 rounded-full flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-2xl border border-foreground/10 backdrop-blur-sm"
          >
            <Instagram className="w-6 h-6 text-white" />
          </a>
        </motion.div>

        {/* Copyright - Bottom on mobile, bottom-right on desktop */}
        <motion.div 
          className="text-sm text-muted-foreground order-2 md:order-3 md:fixed md:bottom-4 md:right-4 mt-4 md:mt-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.0 }}
        >
          <p className="text-center md:text-right font-light">
            Made with <span className="text-red-500">❤︎</span> by{" "}
            <span className="font-medium text-foreground">Hints Technology</span>
            <br className="md:hidden" />
            <span className="hidden md:inline"> © </span>
            <span className="md:hidden">© </span>2025
          </p>
        </motion.div>

        {/* Empty div for spacing on desktop */}
        <div className="hidden md:block order-1" />
      </footer>
    </div>
  );
}
