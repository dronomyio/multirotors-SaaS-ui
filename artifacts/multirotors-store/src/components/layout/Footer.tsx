import { Link } from "wouter";
import { Drone, Shield, Truck, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#03060a] text-muted-foreground border-t border-white/5 pt-20 pb-10 font-sans">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Trust Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-16 border-b border-white/5 mb-16">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Shield className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white uppercase tracking-wider text-sm">Blue UAS Compliant</h4>
            <p className="text-xs">NDAA compliant systems available</p>
          </div>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Zap className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white uppercase tracking-wider text-sm">Enterprise Reliability</h4>
            <p className="text-xs">Built for mission-critical ops</p>
          </div>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Drone className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white uppercase tracking-wider text-sm">Expert Integration</h4>
            <p className="text-xs">Custom payload engineering</p>
          </div>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Truck className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white uppercase tracking-wider text-sm">Global Shipping</h4>
            <p className="text-xs">Secure worldwide delivery</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 group mb-6 inline-flex">
              <div className="bg-primary text-black p-1.5 rounded-sm">
                <Drone className="w-5 h-5" />
              </div>
              <span className="font-sans font-bold text-xl tracking-tight text-white">multirotors.store</span>
            </Link>
            <p className="text-sm mb-6 max-w-sm">
              Autonomous drone & robotics reseller and integrator serving enterprise clients, research institutions, and defense organizations.
            </p>
            <div className="flex gap-4">
              {/* Payment methods icons */}
              <div className="h-8 w-12 bg-white/5 rounded flex items-center justify-center text-xs font-bold text-white/50">AMZ</div>
              <div className="h-8 w-12 bg-white/5 rounded flex items-center justify-center text-xs font-bold text-white/50">MC</div>
              <div className="h-8 w-12 bg-white/5 rounded flex items-center justify-center text-xs font-bold text-white/50">VISA</div>
              <div className="h-8 w-12 bg-white/5 rounded flex items-center justify-center text-xs font-bold text-white/50">PP</div>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold text-white uppercase tracking-wider mb-6">Categories</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#shop" className="hover:text-primary transition-colors">Enterprise Drones</a></li>
              <li><a href="#shop" className="hover:text-primary transition-colors">Quadruped Robots</a></li>
              <li><a href="#shop" className="hover:text-primary transition-colors">AMR Base Platforms</a></li>
              <li><a href="#sensors" className="hover:text-primary transition-colors">Sensors & Payloads</a></li>
              <li><a href="#shop" className="hover:text-primary transition-colors">Integration Services</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-white uppercase tracking-wider mb-6">Company</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><a href="#gov" className="hover:text-primary transition-colors flex items-center gap-2">Government & Edu <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded uppercase font-bold">GSA</span></a></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact & Support</Link></li>
              <li><Link href="/shipping" className="hover:text-primary transition-colors">Shipping Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-white uppercase tracking-wider mb-6">Newsletter</h4>
            <p className="text-sm mb-4">Subscribe for technical updates and new product alerts.</p>
            <div className="flex gap-2">
              <input 
                type="email" 
                placeholder="Email address" 
                className="bg-white/5 border border-white/10 rounded-sm px-4 py-2 text-sm text-white w-full focus:outline-none focus:border-primary transition-colors"
              />
              <button className="bg-primary text-primary-foreground px-4 py-2 rounded-sm font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors">
                Join
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 text-xs text-muted-foreground/50 font-mono">
          <p>&copy; {new Date().getFullYear()} multirotors.store. All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <span>CAGE: 5V4T9</span>
            <span>UEI: JKL3M4N5P</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
