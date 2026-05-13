import React, { useState } from 'react';
import { User } from '@/types';
import { LogIn } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginProps {
  onLogin: (user: User) => void;
  setToast: (msg: string, type: 'ok' | 'err') => void;
}

export default function Login({ onLogin, setToast }: LoginProps) {
  const [userId, setUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return setToast('Please enter User ID', 'err');

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        setToast(data.error || 'Invalid User ID', 'err');
      } else {
        const role = (data.role || '').toUpperCase();
        if (role === 'RM') {
          setToast('Access restricted to SM and Above.', 'err');
        } else {
          onLogin(data as User);
          setToast(`Welcome back, ${data.name}`, 'ok');
        }
      }
    } catch (err) {
      setToast('Connectivity error', 'err');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto mt-20 p-6"
    >
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-premium">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-brand-navy mb-2">Daily Choreography</h1>
          <p className="text-slate-500 text-sm">Enter your credentials to manage your team</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              User ID
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. 123456"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-blue/20"
          >
            {isLoading ? (
              'Authenticating...'
            ) : (
              <>
                <LogIn size={20} />
                Log In
              </>
            )}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
