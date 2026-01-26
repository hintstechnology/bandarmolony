import React from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

const sections = [
  {
    heading: "1. Penerimaan Syarat",
    body:
      "Dengan mengakses dan menggunakan BandarmoloNY, Anda menyetujui untuk terikat oleh Syarat dan Ketentuan ini serta kebijakan lain yang kami referensikan.",
  },
  {
    heading: "2. Perubahan Layanan",
    body:
      "Kami dapat memperbarui atau mengubah fitur, harga, dan kebijakan layanan sewaktu-waktu. Setiap perubahan material akan kami umumkan melalui platform atau email.",
  },
  {
    heading: "3. Penggunaan yang Diperbolehkan",
    body:
      "Pengguna wajib menggunakan platform sesuai hukum yang berlaku dan tidak melakukan aktivitas yang dapat merusak integritas layanan atau data pengguna lain.",
  },
  {
    heading: "4. Kepemilikan Konten",
    body:
      "Semua konten, visualisasi, dan materi analitik yang disediakan tetap menjadi milik BandarmoloNY. Anda diperbolehkan menggunakan konten untuk kebutuhan pribadi atau organisasi internal.",
  },
  {
    heading: "5. Pembatasan Tanggung Jawab",
    body:
      "BandarmoloNY tidak bertanggung jawab atas kerugian langsung atau tidak langsung yang timbul akibat keputusan investasi yang dibuat berdasarkan informasi dari platform.",
  },
  {
    heading: "6. Ketentuan Pembayaran",
    body:
      "Biaya berlangganan dikenakan sesuai paket yang dipilih. Pembatalan akan efektif pada akhir periode tagihan berjalan kecuali dinyatakan lain.",
  },
];

export function TermsPage() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-muted/20 to-background text-foreground">
      <Helmet>
        <title>BandarmoloNY - Terms & Conditions</title>
        <meta name="description" content="Read BandarmoloNY's Terms & Conditions covering service usage, payment terms, data ownership, liability limitations, and user responsibilities for our trading analysis platform." />
        <meta name="keywords" content="terms and conditions, trading platform terms, bandarmolony legal, user agreement, subscription terms" />
        <link rel="canonical" href="https://bandarmolony.com/terms" />
        <meta property="og:title" content="BandarmoloNY - Terms & Conditions" />
        <meta property="og:description" content="Terms and conditions for using BandarmoloNY trading analysis platform. Service usage, payments, and user responsibilities." />
        <meta property="og:url" content="https://bandarmolony.com/terms" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Terms & Conditions - BandarmoloNY" />
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">
            Terms & Conditions
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Syarat dan Ketentuan Penggunaan</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Mohon baca Syarat dan Ketentuan berikut dengan saksama sebelum menggunakan platform BandarmoloNY.
          </p>
        </motion.header>

        <section className="mt-10 space-y-10">
          {sections.map(({ heading, body }, index) => (
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
          <h2 className="text-lg font-semibold text-primary md:text-xl">
            Pertanyaan tentang Syarat & Ketentuan
          </h2>
          <p className="mt-3 text-sm text-primary/80 md:text-base">
            Hubungi kami di{" "}
            <a
              href="mailto:legal@bandarmolony.com"
              className="font-medium text-primary underline-offset-4 transition hover:underline"
            >
              legal@bandarmolony.com
            </a>{" "}
            jika Anda memiliki pertanyaan mengenai ketentuan ini.
          </p>
        </motion.section>
      </main>

      {/* SEO Backlinks Hidden Section */}
      <div className="sr-only">
        <h2>Terms and Conditions - BandarmoloNY</h2>
        <nav>
          <ul>
            <li><a href="https://www.hintstechnology.com/" rel="nofollow noopener noreferrer">Hints Technology Terms</a></li>
            <li><a href="https://bandarmolony.com/" rel="nofollow noopener noreferrer">BandarmoloNY Home</a></li>
            <li><a href="https://bandarmolony.com/privacy" rel="nofollow noopener noreferrer">Privacy Policy</a></li>
            <li><a href="https://bandarmolony.com/contact" rel="nofollow noopener noreferrer">Contact Legal Team</a></li>
          </ul>
        </nav>
        <p>Legal terms for BandarmoloNY platform developed by Hints Technology. Read our terms of service for trading analysis platform.</p>
      </div>

      <Footer />
    </div>
  );
}
