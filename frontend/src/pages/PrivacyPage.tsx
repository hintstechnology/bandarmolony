import React from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

const privacySections = [
  {
    heading: "1. Informasi yang Kami Kumpulkan",
    body:
      "Kami mengumpulkan data yang Anda berikan saat registrasi, seperti nama, email, dan preferensi trading, serta data penggunaan anonim untuk meningkatkan layanan.",
  },
  {
    heading: "2. Cara Kami Menggunakan Informasi",
    body:
      "Data Anda digunakan untuk autentikasi, personalisasi analitik, komunikasi penting, dan peningkatan pengalaman platform.",
  },
  {
    heading: "3. Pembagian Data",
    body:
      "Kami tidak menjual data pribadi Anda. Informasi hanya dibagikan dengan mitra tepercaya yang membantu operasional layanan, sesuai perjanjian kerahasiaan.",
  },
  {
    heading: "4. Keamanan",
    body:
      "BandarmoloNY menerapkan enkripsi serta praktik keamanan industri untuk melindungi informasi pengguna dari akses yang tidak sah.",
  },
  {
    heading: "5. Hak Anda",
    body:
      "Anda dapat meminta akses, pembaruan, atau penghapusan data pribadi kapan saja dengan menghubungi tim dukungan kami.",
  },
  {
    heading: "6. Pembaruan Kebijakan",
    body:
      "Kebijakan Privasi dapat diperbarui secara berkala. Kami akan memberi tahu pengguna mengenai perubahan signifikan melalui email atau notifikasi dalam aplikasi.",
  },
];

export function PrivacyPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background text-foreground">
      <Helmet>
        <title>BandarmoloNY - Privacy Policy</title>
        <meta name="description" content="Learn how BandarmoloNY manages and protects your personal data. Our privacy policy covers data collection, usage, security measures, user rights, and information sharing practices for the trading analysis platform." />
        <meta name="keywords" content="privacy policy, data protection, user privacy, trading platform privacy, data security, GDPR compliance" />
        <link rel="canonical" href="https://bandarmolony.com/privacy" />
        <meta property="og:title" content="BandarmoloNY - Privacy Policy" />
        <meta property="og:description" content="Privacy policy explaining how BandarmoloNY protects and manages your personal data on our trading analysis platform." />
        <meta property="og:url" content="https://bandarmolony.com/privacy" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Privacy Policy - BandarmoloNY" />
      </Helmet>

      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-foreground/3 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
      </div>

      <Navbar />

      <main className="relative z-10 mx-auto w-full max-w-4xl px-6 py-16 md:px-10 md:py-24">
        <motion.header
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-4 text-center md:text-left"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">Privacy Policy</p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Kebijakan Privasi</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Kami berkomitmen melindungi data pribadi pengguna dan memastikan transparansi dalam cara kami mengelola
            informasi tersebut.
          </p>
        </motion.header>

        <section className="mt-10 space-y-10">
          {privacySections.map(({ heading, body }, index) => (
            <motion.article
              key={heading}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="rounded-3xl border border-white/10 bg-background/70 p-8 shadow-lg backdrop-blur dark:border-white/5"
            >
              <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{body}</p>
            </motion.article>
          ))}
        </section>

        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mt-12 rounded-3xl border border-primary/30 bg-primary/10 p-8 backdrop-blur"
        >
          <h2 className="text-lg font-semibold text-primary md:text-xl">Pertanyaan Privasi</h2>
          <p className="mt-3 text-sm text-primary/80 md:text-base">
            Jika Anda memiliki pertanyaan mengenai kebijakan ini, silakan hubungi{" "}
            <a
              href="mailto:privacy@bandarmolony.com"
              className="font-medium text-primary underline-offset-4 transition hover:underline"
            >
              privacy@bandarmolony.com
            </a>
            .
          </p>
        </motion.section>
      </main>

      {/* SEO Backlinks Hidden Section */}
      <div className="sr-only">
        <h2>Privacy Policy - BandarmoloNY</h2>
        <nav>
          <ul>
            <li><a href="https://www.hintstechnology.com/" rel="nofollow noopener noreferrer">Hints Technology Privacy</a></li>
            <li><a href="https://bandarmolony.com/" rel="nofollow noopener noreferrer">BandarmoloNY Platform</a></li>
            <li><a href="https://bandarmolony.com/terms" rel="nofollow noopener noreferrer">Terms & Conditions</a></li>
            <li><a href="https://bandarmolony.com/contact" rel="nofollow noopener noreferrer">Contact Privacy Officer</a></li>
          </ul>
        </nav>
        <p>Privacy policy for BandarmoloNY data protection practices by Hints Technology. How we collect and protect your trading data.</p>
      </div>

      <Footer />
    </div>
  );
}
