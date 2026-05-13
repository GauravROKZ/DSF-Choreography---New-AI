import React, { useEffect, useState } from 'react';
import { User } from '@/types';
import { getFormattedDateDDMMYY, formatToday } from '@/lib/utils';
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HistoryViewProps {
  user: User;
  team: User[];
  onBack: () => void;
  setToast: (msg: string, type: 'ok' | 'err') => void;
  refreshKey?: number;
}

export default function HistoryView({ user, team, onBack, setToast, refreshKey }: HistoryViewProps) {
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [user, refreshKey]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const date = formatToday();
      const response = await fetch(`/api/history?smId=${user.user_id}&date=${date}`);
      const data = await response.json();

      const history = data.pastDays.map((day: any) => {
        const dailySubs = data.submissions?.filter((s: any) => s.date === day.db) || [];
        const qForDay = data.questions?.find((q: any) => q.day === day.display);
        
        return {
          ...day,
          topic: qForDay?.topic || "General Check-in",
          completedCount: dailySubs.length,
          stats: team.map(rm => {
            const sub = dailySubs.find((s: any) => s.target_user === rm.user_id);
            return {
              name: rm.name,
              user_id: rm.user_id,
              status: sub ? sub.status : 'Pending'
            };
          })
        };
      });

      setHistoryData(history);
    } catch (err) {
      setToast('History failed to load', 'err');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-bold">Relieving Archives...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="max-w-2xl mx-auto p-6 space-y-6"
    >
      <div className="flex items-center gap-4 mb-2">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft size={20} className="text-slate-500" />
        </button>
        <div>
          <h2 className="text-xl font-extrabold text-brand-navy leading-none">Activity History</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Past 7 Operational Days</p>
        </div>
      </div>

      <div className="space-y-4">
        {historyData.map((day) => (
          <div key={day.db} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <button 
              onClick={() => setExpandedDate(expandedDate === day.db ? null : day.db)}
              className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-extrabold text-brand-navy">{day.display}</p>
                <p className="text-[10px] font-bold text-brand-blue uppercase tracking-widest mt-1">{day.topic}</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm font-black text-brand-navy">{day.completedCount} / {team.length}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Compliant</p>
                </div>
                {expandedDate === day.db ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
              </div>
            </button>

            <AnimatePresence>
              {expandedDate === day.db && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-slate-50 border-t border-slate-100 overflow-hidden"
                >
                  <div className="p-4 space-y-2">
                    {day.stats.map((rm: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200/50">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-bold text-slate-600">{rm.name}</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{rm.user_id}</span>
                        </div>
                        {rm.status === 'completed' ? (
                          <div className="flex items-center gap-1.5 text-green-600">
                            <span className="text-[10px] font-black uppercase">Success</span>
                            <CheckCircle2 size={14} />
                          </div>
                        ) : rm.status === 'On - Leave' ? (
                          <div className="flex items-center gap-1.5 text-amber-600">
                            <span className="text-[10px] font-black uppercase">Leave</span>
                            <AlertTriangle size={14} />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-[10px] font-black uppercase">Skip</span>
                            <XCircle size={14} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
