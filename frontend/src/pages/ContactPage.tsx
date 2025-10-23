import React from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

const contactChannels = [
  {
    title: "Email",
    description: "Kami akan membalas dalam 1 x 24 jam pada hari kerja.",
    value: "team@bandarmolony.com",
    href: "mailto:team@bandarmolony.com",
    icon: Mail,
  },
  {
    title: "WhatsApp",
    description: "Pertanyaan cepat atau dukungan pelanggan terbaik melalui pesan instan.",
    value: "+62 812-3456-7890",
    href: "https://wa.me/6281234567890",
    icon: MessageCircle,
  },
  {
    title: "Telepon",
    description: "Tersedia Senin - Jumat, 09.00 - 17.00 WIB untuk konsultasi singkat.",
    value: "+62 21-555-0123",
    href: "tel:+62215550123",
    icon: Phone,
  },
];

export function ContactPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background text-foreground">
      <Helmet>
        <title>{`BandarmoloNY \u2014 Contact Us`}</title>
        <meta
          name="description"
          content="Hubungi tim BandarmoloNY untuk dukungan, kemitraan, atau pertanyaan lainnya."
        />
      </Helmet>

      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-foreground/3 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
      </div>

      <Navbar />

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16 md:px-10 md:py-24">
        <motion.header
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">Contact Us</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
            Kami siap membantu perjalanan trading Anda
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Pilih saluran yang paling nyaman bagi Anda. Tim kami akan merespons secepat mungkin dengan insight
            dan solusi terbaik.
          </p>
        </motion.header>

        <section className="grid gap-6 md:grid-cols-3">
          {contactChannels.map(({ title, description, value, href, icon: Icon }, index) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="rounded-3xl border border-white/10 bg-background/80 p-8 shadow-xl backdrop-blur transition-all duration-300 hover:-translate-y-2 hover:shadow-primary/20 dark:border-white/5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{description}</p>
              <a
                href={href}
                className="mt-5 inline-flex items-center text-sm font-semibold text-primary underline-offset-4 transition hover:underline md:text-base"
              >
                {value}
              </a>
            </motion.article>
          ))}
        </section>

        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl border border-white/10 bg-background/60 p-8 text-center backdrop-blur dark:border-white/5 md:p-10"
        >
          <h2 className="text-2xl font-semibold md:text-3xl">Pertanyaan Umum</h2>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            Dokumentasi & FAQ sedang kami siapkan agar Anda dapat mempelajari platform secara mandiri. Sambil
            menunggu, silakan hubungi kami kapan saja.
          </p>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}
