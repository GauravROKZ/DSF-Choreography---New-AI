import { User } from '@/types';
import { LogOut, Menu, Users } from 'lucide-react';
import CountdownTimer from './CountdownTimer';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onOpenSidebar: () => void;
  onSelectView?: (view: string) => void;
}

export default function Navbar({ user, onLogout, onOpenSidebar, onSelectView }: NavbarProps) {
  const isHOHead = user?.role.toUpperCase().includes('HO') || user?.role.toUpperCase().includes('HEAD');

  return (
    <>
      <div className="h-1 accent-gradient w-full" />
      <header className="sticky top-0 z-50 bg-brand-navy shadow-lg px-4 md:px-8 h-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {user && (
            <button 
              onClick={onOpenSidebar}
              className="p-2 hover:bg-white/10 rounded-full text-white/80 transition-colors"
            >
              <Menu size={18} />
            </button>
          )}

          {isHOHead && onSelectView && (
            <button
              onClick={() => onSelectView('choreography')}
              className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10"
            >
              <Users size={14} className="text-brand-blue" />
              <span className="text-[10px] font-black uppercase tracking-widest">Direct Team Choreography</span>
            </button>
          )}
        </div>
        
        <div className="flex-1 flex justify-center max-w-sm">
          <CountdownTimer />
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <>
              <div className="hidden lg:block text-right">
                <p className="text-white text-xs font-bold leading-none">{user.name}</p>
                <p className="text-white/60 text-[9px] uppercase tracking-wider font-semibold mt-0.5">{user.role}</p>
              </div>
              <button
                onClick={onLogout}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-colors"
                title="Log Out"
              >
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </header>
    </>
  );
}
