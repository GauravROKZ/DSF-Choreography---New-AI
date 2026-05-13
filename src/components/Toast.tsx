import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastProps {
  message: string;
  type: 'ok' | 'err';
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: 20, x: '-50%' }}
        className={cn(
          "fixed bottom-8 left-1/2 z-[9999] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 min-w-[280px] border",
          type === 'ok' 
            ? "bg-brand-navy border-white/10 text-white" 
            : "bg-brand-crimson border-white/10 text-white"
        )}
      >
        {type === 'ok' ? (
          <CheckCircle2 size={18} className="text-green-400" />
        ) : (
          <AlertCircle size={18} className="text-white/80" />
        )}
        <span className="text-sm font-bold tracking-tight">{message}</span>
      </motion.div>
    </AnimatePresence>
  );
}
