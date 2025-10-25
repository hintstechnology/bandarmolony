import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Activity,
  ArrowRightLeft,
  BookOpen,
  Star,
  BarChart3,
  Users,
  ShieldCheck,
} from "lucide-react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { Button } from "../ui/button";

const featureSections = [
  {
    icon: TrendingUp,
    title: "Market Rotation Suite",
    description:
      "Analisis pergerakan sektor dari berbagai sudut dengan Relative Rotation Graph (RRG), Relative Rotation Curve (RRC), Seasonality, dan Trend Filter.",
    bullets: [
      "Pantau leadership antar sektor dan temukan potensi rotasi dini.",
      "Gabungkan data historis dengan filter tren untuk validasi tambahan.",
      "Visualisasi interaktif yang memudahkan screening cepat.",
    ],
  },
  {
    icon: Activity,
    title: "Broker Activity Intelligence",
    description:
      "Lihat aktivitas broker secara granular untuk memahami akumulasi, distribusi, serta perubahan inventori penting.",
    bullets: [
      "Ringkasan transaksi broker harian dan histori mendalam.",
      "Inventori broker dengan highlight perubahan signifikan.",
      "Mode cerita yang menerjemahkan data menjadi narasi ringkas.",
    ],
  },
  {
    icon: ArrowRightLeft,
    title: "Stock Transaction Insights",
    description:
      "Telusuri detail transaksi done secara ringkas maupun mendalam untuk membaca sentimen pasar terhadap saham pilihan.",
    bullets: [
      "Ringkasan done summary untuk gambaran cepat.",
      "Done detail untuk memeriksa alur transaksi secara kronologis.",
      "Filter fleksibel untuk mempercepat investigasi.",
    ],
  },
  {
    icon: BookOpen,
    title: "Story Mode Analytics",
    description:
      "Mode cerita membantu Anda memahami akumulasi, distribusi, kepemilikan, hingga arus dana asing dengan narasi yang mudah dipahami.",
    bullets: [
      "Story Accumulation Distribution mengurai minat big player.",
      "Story Market Participant memetakan perilaku pelaku pasar.",
      "Story Ownership & Foreign Flow melengkapi gambaran besar.",
    ],
  },
  {
    icon: Star,
    title: "Seasonality & Lunar Insights",
    description:
      "Satukan pendekatan kuantitatif dan kalender lunar untuk memperkaya timing strategi Anda.",
    bullets: [
      "Seasonality analysis menyorot pola musiman historis.",
      "Astrology Ba Zi & Shio memberikan perspektif tambahan.",
      "Calendar events yang siap disinkronkan dengan strategi Anda.",
    ],
  },
  {
    icon: BarChart3,
    title: "Technical Analysis Workspace",
    description:
      "Ruang kerja teknikal lengkap dengan charting berkualitas tinggi dan integrasi TradingView.",
    bullets: [
      "Template indikator siap pakai.",
      "Custom layout yang dapat disimpan.",
      "Integrasi data real-time dari Supabase backend.",
    ],
  },
  {
    icon: Users,
    title: "Profile & Collaboration Ready",
    description:
      "Kelola profil, subscription, dan aktivitas tim dari satu tempat dengan alur onboarding yang nyaman.",
    bullets: [
      "Sistem autentikasi terintegrasi Supabase.",
      "Subscription dashboard dengan riwayat pembayaran lengkap.",
      "Admin panel untuk mengelola pengguna dan konten.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Reliability & Security",
    description:
      "Dibangun dengan arsitektur modern berbasis Vite + React 18 untuk performa, keamanan, dan skalabilitas.",
    bullets: [
      "Supabase sebagai backend service yang aman dan terukur.",
      "Toast & confirmation context menjaga pengalaman pengguna.",
      "Error boundary melindungi aplikasi dari crash tak terduga.",
    ],
  },
];

export function FeaturesPage() {
  const navigate = useNavigate();
  
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background text-foreground">
      <Helmet>
        <title>{`BandarmoloNY \u2014 Features`}</title>
        <meta
          name="description"
          content="Discover the capabilities inside BandarmoloNY \u2014 from market rotation to broker intelligence and more."
        />
      </Helmet>

      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-foreground/3 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
      </div>

      <Navbar />

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 py-16 md:px-10 md:py-24">
        <motion.header
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-4 text-center"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">
            Platform Features
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Satu platform, banyak cara membaca pasar
          </h1>
          <p className="mx-auto max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
            BandarmoloNY dibangun dari insight nyata di lapangan. Tiap modul dirancang untuk mengurai
            dinamika pasar Indonesia dari sudut pandang berbeda namun saling melengkapi.
          </p>
        </motion.header>

        <section className="grid gap-6 md:grid-cols-2">
          {featureSections.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="rounded-3xl border border-white/10 bg-background/80 p-8 shadow-xl backdrop-blur transition-all duration-300 hover:-translate-y-2 hover:shadow-primary/20 dark:border-white/5"
            >
              <feature.icon className="h-10 w-10 text-primary" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-semibold text-foreground">{feature.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                {feature.description}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground md:text-base">
                {feature.bullets.map((bullet) => (
                  <li key={bullet} className="leading-relaxed">
                    - {bullet}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </section>

        <motion.section
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl border border-primary/30 bg-primary/10 p-10 text-center backdrop-blur"
        >
          <h2 className="text-2xl font-semibold text-primary md:text-3xl">
            Siap merasakan semua modul secara langsung?
          </h2>
          <p className="mt-3 text-base text-primary/80 md:text-lg">
            Mulai dari landing page untuk mendapatkan free trial dan eksplorasi Dashboard, Market Rotation,
            Broker Activity, hingga Story Mode dalam satu pengalaman terpadu.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              className="rounded-2xl px-8 py-6 text-base font-semibold shadow-lg hover:-translate-y-1 hover:shadow-primary/40 transition-transform"
              onClick={() => navigate("/auth?mode=register")}
            >
              Mulai Free Trial
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-2xl px-8 py-6 text-base font-semibold border-primary/50 text-primary hover:-translate-y-1 hover:bg-primary/10 transition-transform"
              onClick={() => navigate("/contact")}
            >
              Hubungi Tim
            </Button>
          </div>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}

