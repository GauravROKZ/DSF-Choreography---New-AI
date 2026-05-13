import React from 'react';
import { User } from '@/types';
import { motion, AnimatePresence } from 'motion/react';
import { Home, Users, ShieldCheck, X, LogOut, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  currentSubView: string;
  onSelectView: (view: any) => void;
  onLogout: () => void;
}

export default function Sidebar({ isOpen, onClose, user, currentSubView, onSelectView, onLogout }: SidebarProps) {
  if (!user) return null;

  const isHighLevel = (role?: string) => {
    if (!role) return false;
    const r = role.toUpperCase();
    return ['HO', 'HEAD', 'ZH', 'ZSM'].some(m => r.includes(m));
  };

  const isHO = user.role.toUpperCase().includes('HO');
  const isHead = user.role.toUpperCase().includes('HEAD');
  const isAdmin = user.role.toUpperCase() === 'ADMIN';
  const isHOHead = isHO || isHead;
  const isManagement = ['ASM', 'BM', 'ZM', 'BM (T)', 'REGIONAL MANAGER', 'AREA MANAGER', 'ZSM', 'ZH', 'HO', 'HEAD', 'SM'].some(m => user.role.toUpperCase().includes(m));

  const menuItems = [];

  if (isManagement) {
    // All management roles (SM to HEAD)
    menuItems.push({ id: 'home', label: 'Home', subLabel: 'Daily Dashboard', icon: Home, color: 'text-brand-blue' });
    
    if (isHOHead) {
      menuItems.push({ id: 'choreography', label: 'Direct Team', subLabel: 'Choreography', icon: Users, color: 'text-brand-crimson' });
    } else {
      menuItems.push({ id: 'performance', label: 'Performance Tracker', subLabel: 'Team Analytics', icon: Users, color: 'text-indigo-500' });
    }
  } else if (isAdmin) {
    // Admin: Similar to HO
    menuItems.push({ id: 'home', label: 'Home', subLabel: 'Performance Tracker', icon: Home, color: 'text-brand-blue' });
    menuItems.push({ id: 'choreography', label: 'Direct Team', subLabel: 'Choreography', icon: Users, color: 'text-brand-crimson' });
  } else {
    // Regular Dashboard users (if any)
    menuItems.push({ id: 'home', label: 'Home', subLabel: 'Dashboard', icon: Home, color: 'text-brand-blue' });
  }

  menuItems.push({ id: 'history', label: 'History', subLabel: 'Past Eval', icon: Calendar, color: 'text-brand-emerald' });

  // Admin panel visible for ADMIN and HO roles, but NOT for HEAD role
  if (isAdmin || isHO) {
    menuItems.push({ id: 'admin', label: 'Admin Panel', subLabel: 'Configuration', icon: ShieldCheck, color: 'text-amber-500' });
  }

  // Helper to normalize view switching
  const handleSelect = (id: string) => {
    onSelectView(id);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-[60]"
          />

          {/* Side Panel */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 bottom-0 w-72 bg-white z-[70] shadow-2xl flex flex-col"
          >
            {/* Logo Section */}
            <div className="px-5 py-5 border-b border-slate-100/80 bg-white/80 backdrop-blur-sm">
              <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50 to-white px-4 py-3 shadow-sm shadow-slate-200/40">
                
                <img
                  src="/tata_aia_logo.png"
                  alt="TATA AIA"
                  className="h-6 sm:h-7 w-auto object-contain transition-transform duration-200 hover:scale-105"
                  referrerPolicy="no-referrer"
                />

                <div className="h-6 w-px bg-slate-200 shrink-0 rounded-full" />

                <img
                  src="/dsf_logo.png"
                  alt="DSF"
                  className="h-7 sm:h-8 w-auto object-contain transition-transform duration-200 hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                
              </div>
            </div>
            {/* User Header */}
            <div className="bg-brand-navy py-10 px-6 relative overflow-hidden flex flex-col justify-center min-h-[180px]">
                <div className="absolute top-4 right-4">
                  <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/60 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="relative z-10 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                    <span className="text-xl font-black text-white">{user.name[0]}</span>
                  </div>
                  <div>
                    <h3 className="text-white font-black text-lg leading-tight">{user.name}</h3>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">{user.user_id}</p>
                    <div className="inline-block px-2 py-0.5 rounded bg-brand-blue/20 border border-brand-blue/30 mt-2">
                       <p className="text-brand-blue text-[9px] font-black uppercase tracking-wider">{user.role}</p>
                    </div>
                  </div>
                </div>

                {/* Decorative circles */}
                <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
                <div className="absolute top-10 -left-10 w-20 h-20 bg-brand-blue/10 rounded-full blur-xl" />
            </div>

            {/* Navigation */}
            <div className="flex-1 p-4 pt-8 space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-2">Navigation</p>
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-3.5 rounded-2xl transition-all group",
                    currentSubView === item.id 
                      ? "bg-slate-50 border border-slate-100 shadow-sm"
                      : "hover:bg-slate-50/50"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-2 rounded-xl transition-colors",
                      currentSubView === item.id ? "bg-white shadow-sm" : "bg-transparent group-hover:bg-white group-hover:shadow-sm"
                    )}>
                      <item.icon size={18} className={cn(item.color)} />
                    </div>
                    <div className="text-left">
                      <p className={cn(
                        "text-sm font-bold transition-colors",
                        currentSubView === item.id ? "text-brand-navy" : "text-slate-500 group-hover:text-brand-navy"
                      )}>
                        {item.label}
                      </p>
                      {item.subLabel && (
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">{item.subLabel}</p>
                      )}
                    </div>
                  </div>
                  {currentSubView === item.id && (
                    <ChevronRight size={14} className="text-brand-blue" />
                  )}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100">
               <button 
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-3.5 rounded-2xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all group"
               >
                 <div className="p-2 rounded-xl bg-transparent group-hover:bg-white group-hover:shadow-sm">
                    <LogOut size={18} />
                 </div>
                 <span className="text-sm font-bold">Sign Out</span>
               </button>
               
               <p className="text-[8px] text-center text-slate-300 font-bold uppercase tracking-widest mt-4">
                 v2.4.0 • Tata AIA DSF Choreography
               </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
