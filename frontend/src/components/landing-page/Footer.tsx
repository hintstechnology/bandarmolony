import { Link } from "react-router-dom";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Bandarmolony",
  url: "https://bandarmolony.com/",
} as const;

export function Footer(): JSX.Element {
  return (
    <footer className="bg-transparent text-muted-foreground" aria-label="Footer">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-8 px-4 py-12 md:px-8">
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
          Copyright {"\u00A9"} 2025 - BandarmoloNY. All rights reserved.
        </p>

        <p className="sr-only text-center text-sm text-muted-foreground">
          Made with {"\u2764\uFE0F"} by{" "}
          <a
            href="https://www.hintstechnology.com/"
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Hints Technology
          </a>{" "}
          {"\u00A9"} 2025
        </p>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
    </footer>
  );
}
