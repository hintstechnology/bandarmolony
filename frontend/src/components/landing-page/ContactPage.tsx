import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "motion/react";
import { Mail, MessageCircle, Phone, ChevronDown } from "lucide-react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

const contactChannels = [
  {
    title: "Email",
    description: "Kami akan membalas dalam 1 x 24 jam pada hari kerja.",
    value: "bandarmolony@gmail.com",
    href: "mailto:bandarmolony@gmail.com",
    icon: Mail,
  },
  {
    title: "WhatsApp",
    description: "Tersedia 09.00 - 17.00 WIB untuk konsultasi dengan kami.",
    value: "(+62) 817-370-486",
    href: "https://wa.me/62817370486",
    icon: MessageCircle,
  },
];

const faqs = [
  {
    question: "Apa itu BandarmoloNY?",
    answer: "BandarmoloNY adalah platform analisis pasar cerdas untuk pasar saham Indonesia yang menyediakan berbagai tool analisis termasuk Market Rotation, Broker Activity, Technical Analysis, dan masih banyak lagi.",
  },
  {
    question: "Bagaimana cara mulai menggunakan platform?",
    answer: "Anda dapat memulai dengan mendaftar akun dan memilih paket yang sesuai. Kami menyediakan paket Plus, Premium, dan Pro dengan berbagai fitur yang disesuaikan dengan kebutuhan trading Anda.",
  },
  {
    question: "Apakah tersedia free trial?",
    answer: "Ya, Anda dapat mencoba platform secara gratis. Mulai dengan free trial untuk eksplorasi fitur-fitur lengkap sebelum berlangganan.",
  },
  {
    question: "Bagaimana cara mendapatkan dukungan?",
    answer: "Tim support kami tersedia setiap hari mulai dari pukul 09.00 - 17.00 WIB melalui email atau WhatsApp. Kami dengan senang hati membantu Anda.",
  },
];

export function ContactPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-muted/20 to-background text-foreground">
      <Helmet>
        <title>Contact BandarmoloNY - Get Support & Assistance</title>
        <meta
          name="description"
          content="Contact BandarmoloNY support team via email at bandarmolony@gmail.com, WhatsApp at (+62) 817-370-486, or phone. Available 09:00 - 21:00 WIB for consultation and assistance."
        />
        <meta name="keywords" content="contact bandarmolony, support, customer service, trading platform support, indonesian stock market help" />
        <link rel="canonical" href="https://bandarmolony.com/contact" />
        <meta property="og:title" content="Contact BandarmoloNY - Support & Assistance" />
        <meta property="og:description" content="Get in touch with BandarmoloNY support team via email, WhatsApp, or phone. Available daily for consultation and trading assistance." />
        <meta property="og:url" content="https://bandarmolony.com/contact" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Contact BandarmoloNY" />
        <meta name="twitter:description" content="Contact our support team for trading platform assistance." />
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

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {contactChannels.map(({ title, description, value, href, icon: Icon }, index) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="flex h-full w-full flex-col rounded-3xl border border-white/10 bg-background/80 p-8 shadow-xl backdrop-blur transition-all duration-300 hover:-translate-y-2 hover:shadow-primary/20 dark:border-white/5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-foreground">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base mb-4">{description}</p>
              <a
                href={href}
                className="mt-auto inline-flex items-center text-sm font-semibold text-primary underline-offset-4 transition hover:underline md:text-base"
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
          className="rounded-3xl border border-white/10 bg-background/60 p-8 backdrop-blur dark:border-white/5 md:p-10"
        >
          <h2 className="text-2xl font-semibold text-center md:text-3xl">Pertanyaan Umum (FAQ)</h2>
          <div className="mt-6 space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="rounded-lg bg-background/40 overflow-hidden border border-white/5">
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-background/20 transition-colors"
                >
                  <h3 className="font-semibold text-foreground">{faq.question}</h3>
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${openIndex === index ? 'rotate-180' : ''
                      }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${openIndex === index ? 'max-h-96' : 'max-h-0'
                    }`}
                >
                  <p className="px-4 pb-4 text-sm text-muted-foreground">
                    {faq.answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      </main>

      {/* SEO Backlinks Hidden Section */}
      <div className="sr-only">
        <h2>Contact BandarmoloNY Team</h2>
        <nav>
          <ul>
            <li><a href="https://www.hintstechnology.com/" rel="nofollow noopener noreferrer">Hints Technology - Contact Development Team</a></li>
            <li><a href="https://bandarmolony.com/" rel="nofollow noopener noreferrer">BandarmoloNY Trading Platform</a></li>
            <li><a href="https://bandarmolony.com/features" rel="nofollow noopener noreferrer">Platform Features</a></li>
            <li><a href="https://bandarmolony.com/pricing" rel="nofollow noopener noreferrer">View Pricing Plans</a></li>
          </ul>
        </nav>
        <p>Get in touch with Hints Technology for trading platform support and inquiries about BandarmoloNY.</p>
      </div>

      <Footer />
    </div>
  );
}
