import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "./dashboard/Logo";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "Features", to: "/features" },
  { label: "Pricing", to: "/pricing" },
  { label: "Contact Us", to: "/contact" },
];

export function Navbar({ onSignIn, onRegister } = {}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleSignIn = () => {
    if (typeof onSignIn === "function") {
      onSignIn();
    }
  };

  const handleRegister = () => {
    if (typeof onRegister === "function") {
      onRegister();
    }
  };

  const navigationSchema = {
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    name: NAV_LINKS.map((link) => link.label),
    url: NAV_LINKS.map((link) => `https://bandarmolony.com${link.to}`),
  };

  return (
    <header className="sticky top-0 z-50 bg-transparent backdrop-blur-md shadow-lg">
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-8"
      >
        <Link
          to="/"
          onClick={closeMenu}
          className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Logo
            showText
            className="items-center gap-0"
            badgeClassName="h-8 w-10 md:h-9 md:w-11 transform -translate-y-[2px]"
            textClassName="text-2xl font-semibold tracking-tight text-foreground dark:text-white"
          />
        </Link>

        <div className="hidden items-center gap-10 md:flex">
          <div className="flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-foreground transition-colors hover:text-primary opacity-80 hover:opacity-100 dark:text-white/80 dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/auth?mode=login"
              onClick={handleSignIn}
              className="rounded-full border border-foreground/40 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 dark:border-white/60 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Sign In
            </Link>
            <Link
              to="/auth?mode=register"
              onClick={handleRegister}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Register
            </Link>
          </div>
        </div>

        <button
          type="button"
          className="flex items-center justify-center rounded-full border border-foreground/30 p-2 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-white/40 dark:text-white md:hidden"
          onClick={toggleMenu}
          aria-controls="primary-navigation"
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="sr-only">Toggle navigation</span>
        </button>
      </nav>

      <div
        id="primary-navigation"
        className={`md:hidden transition-[max-height] duration-300 ease-in-out ${
          isMenuOpen ? "max-h-96" : "max-h-0"
        } overflow-hidden border-t border-border bg-background/95 backdrop-blur dark:border-white/10`}
      >
        <div className="space-y-3 px-6 py-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={closeMenu}
              className="block rounded-lg px-4 py-3 text-base font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary opacity-80 hover:opacity-100 dark:text-white/80 dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {link.label}
            </Link>
          ))}
          <div className="flex flex-col gap-3 pt-2">
            <Link
              to="/auth?mode=login"
              onClick={() => {
                handleSignIn();
                closeMenu();
              }}
              className="rounded-full border border-foreground/40 px-4 py-3 text-center text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 dark:border-white/60 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Sign In
            </Link>
            <Link
              to="/auth?mode=register"
              onClick={() => {
                handleRegister();
                closeMenu();
              }}
              className="rounded-full bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(navigationSchema) }}
      />
    </header>
  );
}

