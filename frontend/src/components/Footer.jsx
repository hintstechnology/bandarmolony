import React from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Send, Instagram } from "lucide-react";

const socialLinks = [
  {
    href: "https://wa.me/6281234567890",
    label: "WhatsApp",
    icon: MessageCircle,
    className: "bg-[#25D366]",
  },
  {
    href: "https://t.me/bandarmolony",
    label: "Telegram",
    icon: Send,
    className: "bg-[#0088CC]",
  },
  {
    href: "https://instagram.com/bandarmolony",
    label: "Instagram",
    icon: Instagram,
    className: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
];

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Bandarmolony",
  url: "https://bandarmolony.com/",
  sameAs: socialLinks.map((link) => link.href),
};

export function Footer() {
  return (
    <footer className="bg-transparent text-muted-foreground" aria-label="Footer">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-8 px-4 py-12 md:px-8">
        <div className="flex flex-wrap items-center justify-center gap-4">
          {socialLinks.map(({ href, label, icon: Icon, className }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className={`flex h-12 w-12 items-center justify-center rounded-full ${className} text-white transition-transform duration-200 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </a>
          ))}
        </div>

        <nav
          aria-label="Legal navigation"
          className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-foreground opacity-80"
        >
          <Link
            to="/terms"
            className="transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Terms &amp; Conditions
          </Link>
          <Link
            to="/privacy"
            className="transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Privacy Policy
          </Link>
          <Link
            to="/contact"
            className="transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Contact Us
          </Link>
        </nav>

        <p className="text-center text-sm text-muted-foreground">
          Made with {"\u2764\uFE0F"} by Hints Technology {"\u00A9"} 2025
        </p>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
    </footer>
  );
}
