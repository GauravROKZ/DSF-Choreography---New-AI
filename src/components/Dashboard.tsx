import React, { useEffect, useState } from 'react';
import { User, Question, Submission } from '@/types';
import { formatToday, getFormattedDateDDMMYY } from '@/lib/utils';
import { ChevronRight, Calendar, Users, ClipboardCheck, Clock } from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardProps {
  user: User;
  onSelectRM: (rm: User, isUpdate: boolean) => void;
  onViewHistory: () => void;
  setToast: (msg: string, type: 'ok' | 'err') => void;
  refreshKey: number;
}

export default function Dashboard({ user, onSelectRM, onViewHistory, setToast, refreshKey }: DashboardProps) {
  const [team, setTeam] = useState<User[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topic, setTopic] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [user, refreshKey]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const date = formatToday();
      const day = getFormattedDateDDMMYY(new Date());
      const response = await fetch(`/api/dashboard?smId=${user.user_id}&date=${date}&day=${day}`);
      if (!response.ok) {
        setIsLoading(false);
        return;
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        if (data.team) setTeam(data.team);
        if (data.questions) setQuestions(data.questions);
        if (data.topic) setTopic(data.topic);
        
        const subMap: Record<string, string> = {};
        data.submissions?.forEach((s: any) => subMap[s.target_user] = s.status);
        setSubmissions(subMap);
      }
    } catch (err) {
      setToast('Error loading dashboard', 'err');
    } finally {
      setIsLoading(false);
    }
  };

  const completedCount = Object.keys(submissions).length;
  const totalRMs = team.length;
  const pendingCount = totalRMs - completedCount;
  const dailyTopic = topic || "No topic assigned";

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-bold">Synchronizing Team Data...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="max-w-4xl mx-auto p-6 space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black text-brand-navy tracking-tight">Daily Tracker</h2>
          <p className="text-slate-500 font-medium text-xs uppercase tracking-wider">TEAM EVALUATION: {user.role}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onViewHistory}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-brand-blue font-bold text-sm hover:shadow-md transition-all active:scale-95"
          >
            <Calendar size={16} />
            History
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        <StatCard label="Completed" value={completedCount.toString()} subValue={`out of ${totalRMs} Relationship Managers`} />
        <StatCard label="Pending" value={pendingCount.toString()} subValue="Check-ins required" />
        <div className="col-span-2 md:col-span-1 bg-brand-navy p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col justify-center relative overflow-hidden">
          <div className="relative z-10">
            <span className="text-[9px] sm:text-[10px] font-black text-white/50 uppercase tracking-widest block mb-1">Daily Topics</span>
            <div className="space-y-1 max-h-[60px] overflow-y-auto pr-1 scrollbar-hide">
              {dailyTopic.split(' | ').filter(Boolean).map((t, i) => (
                <p key={i} className="text-[11px] sm:text-xs font-black text-white leading-tight border-l-2 border-white/20 pl-2">
                  {t}
                </p>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2 text-white/60">
               <span className="text-[9px] font-bold uppercase tracking-wider">{formatToday()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-premium">
        <div className="p-4 bg-slate-50 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Users size={14} /> Team List
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {team.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-medium">No RMs found in your team.</div>
          ) : (
            team.map((rm) => {
              const status = submissions[rm.user_id];
              const isDone = !!status;
              return (
                <button
                  key={rm.user_id}
                  onClick={() => questions.length > 0 && onSelectRM(rm, isDone)}
                  disabled={questions.length === 0}
                  className={cn(
                    "w-full flex items-center justify-between p-4 transition-colors group border-l-4",
                    status === 'On - Leave' ? "bg-amber-50/30 border-amber-400" : isDone ? "bg-slate-50/50 border-green-400" : "bg-white border-transparent",
                    questions.length > 0 ? "hover:bg-slate-50 cursor-pointer" : "opacity-75 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <p className="font-bold text-brand-navy group-hover:text-brand-blue transition-colors">{rm.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{rm.user_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {questions.length === 0 ? (
                      <span className="text-[10px] bg-slate-50 text-slate-300 px-2.5 py-1 rounded-full font-bold uppercase tracking-tight italic">No Qs Today</span>
                    ) : status === 'On - Leave' ? (
                      <span className="text-[10px] bg-amber-100 text-amber-600 px-2.5 py-1 rounded-full font-bold uppercase tracking-tight ring-1 ring-amber-200">On Leave</span>
                    ) : isDone ? (
                      <span className="text-[10px] bg-green-100 text-green-600 px-2.5 py-1 rounded-full font-bold uppercase tracking-tight ring-1 ring-green-200">Completed</span>
                    ) : (
                      <span className="text-[10px] bg-slate-100 text-slate-400 px-2.5 py-1 rounded-full font-bold uppercase tracking-tight">Pending</span>
                    )}
                    {questions.length > 0 && <ChevronRight size={18} className="text-slate-300 group-hover:translate-x-1 transition-transform" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, subValue }: { label: string; value: string; subValue: string }) {
  return (
    <div className="bg-white p-3 sm:p-6 rounded-2xl border border-slate-50 shadow-sm space-y-2 sm:space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <div>
        <p className="text-xl sm:text-3xl font-black text-brand-navy tracking-tight">{value}</p>
        <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 mt-0.5 sm:mt-1 uppercase tracking-tight line-clamp-1">{subValue}</p>
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils';
