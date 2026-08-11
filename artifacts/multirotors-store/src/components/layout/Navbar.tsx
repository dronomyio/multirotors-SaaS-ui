import { Link } from "wouter";
import { Search, ShoppingCart, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

interface NavbarProps {
  variant?: "light" | "dark";
}

export function Navbar({ variant = "dark" }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLight = variant === "light";

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "HOME", href: "/", internal: true },
    { label: "SHOP", href: "/shop", internal: true },
    { label: "DRONE", href: "https://multirotors.store/collections/enterprise-drones", internal: false },
    { label: "SENSORS & PAYLOADS", href: "https://multirotors.store/collections/sensors-payloads", internal: false },
    { label: "ROBOTICS", href: "https://multirotors.store/collections/robotic", internal: false },
    { label: "SERVICES", href: "https://multirotors.store/pages/contact", internal: false },
  ];

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Announcement bar */}
      <div className="bg-yellow-400 text-black py-1.5 px-4 text-center text-[11px] font-bold tracking-widest uppercase">
        Free Shipping on us over $150
      </div>

      <nav
        className={`transition-all duration-300 ${
          isLight
            ? "bg-white border-b border-gray-200 shadow-sm"
            : isScrolled
            ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className={`w-8 h-8 rounded-sm flex items-center justify-center font-black text-xs ${isLight ? "bg-gray-900 text-white" : "bg-primary text-primary-foreground"}`}>
              MS
            </div>
            <span className={`font-bold text-lg tracking-tight ${isLight ? "text-gray-900" : "text-white"}`}>
              multirotors.store
            </span>
          </Link>

          {/* Desktop nav */}
          <div className={`hidden lg:flex items-center gap-5 text-xs font-bold tracking-wide ${isLight ? "text-gray-600" : "text-foreground/80"}`}>
            {navLinks.map(({ label, href, internal }) =>
              internal ? (
                <Link key={label} href={href} className={`hover:text-yellow-500 transition-colors ${isLight ? "" : "hover:text-primary"}`}>
                  {label}
                </Link>
              ) : (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                   className={`hover:text-yellow-500 transition-colors ${isLight ? "" : "hover:text-primary"}`}>
                  {label}
                </a>
              )
            )}
            <a href="https://multirotors.store/pages/contact" target="_blank" rel="noopener noreferrer"
               className={`flex items-center gap-1.5 text-xs ${isLight ? "text-blue-700 hover:text-blue-900" : "text-blue-400 hover:text-blue-300"} transition-colors`}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              GOV & EDU
            </a>
            <Link href="/chat"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors ${
                isLight
                  ? "bg-gray-900 text-white hover:bg-yellow-400 hover:text-black"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 border border-primary/30"
              }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              AI CONSULTANT
            </Link>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <a href="https://multirotors.store/search" target="_blank" rel="noopener noreferrer"
               className={`p-2 transition-colors ${isLight ? "text-gray-700 hover:text-yellow-500" : "hover:text-primary"}`}>
              <Search className="w-5 h-5" />
            </a>
            <a href="https://multirotors.store/cart" target="_blank" rel="noopener noreferrer"
               className={`p-2 transition-colors relative ${isLight ? "text-gray-700 hover:text-yellow-500" : "hover:text-primary"}`}>
              <ShoppingCart className="w-5 h-5" />
            </a>
            <button className={`lg:hidden p-2 ${isLight ? "text-gray-700" : ""}`} onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className={`lg:hidden border-t px-6 py-4 flex flex-col gap-3 text-sm font-semibold ${isLight ? "bg-white border-gray-200 text-gray-800" : "bg-background border-border"}`}>
            {navLinks.map(({ label, href, internal }) =>
              internal ? (
                <Link key={label} href={href} className="hover:text-yellow-500 transition-colors py-1" onClick={() => setMobileOpen(false)}>
                  {label}
                </Link>
              ) : (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                   className="hover:text-yellow-500 transition-colors py-1" onClick={() => setMobileOpen(false)}>
                  {label}
                </a>
              )
            )}
            <Link href="/chat" onClick={() => setMobileOpen(false)}
              className="mt-2 bg-gray-900 text-white text-center px-4 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-yellow-400 hover:text-black transition-colors">
              AI CONSULTANT
            </Link>
          </div>
        )}
      </nav>
    </div>
  );
}
