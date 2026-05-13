import React, { useEffect, useState } from 'react';
import { User } from '@/types';
import { motion } from 'motion/react';
import { cn, formatToday, getFormattedDateDDMMYY } from '@/lib/utils';
import { Calendar, ArrowLeft, Users } from 'lucide-react';

interface ManagementPerformance {
  smId: string;
  smName: string;
  smRole?: string;
  totalRMs: number;
  completedRMs: number;
  pendingRMs: number;
}

interface ManagementDashboardProps {
  user: User;
  setToast: (msg: string, type: 'ok' | 'err') => void;
  onSwitchToAdmin?: () => void;
  onSelectMember: (user: User, isUpdate: boolean) => void;
  refreshKey?: number;
  mode?: 'home' | 'choreography' | 'performance' | 'admin';
}

export default function ManagementDashboard({ user, setToast, onSwitchToAdmin, onSelectMember, refreshKey, mode = 'home' }: ManagementDashboardProps) {
  const [viewedUser, setViewedUser] = useState<User>(user);
  const [performance, setPerformance] = useState<ManagementPerformance[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [ownSubmissions, setOwnSubmissions] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [topic, setTopic] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(formatToday());
  const [history, setHistory] = useState<User[]>([]);

  // Reset to original user when mode changes to home
  useEffect(() => {
    if (mode === 'home') {
       setViewedUser(user);
       setHistory([]);
    }
  }, [mode, user]);

  const canAccessAdmin = user.role.toUpperCase() === 'HO' || user.role.toUpperCase() === 'ADMIN';

  useEffect(() => {
    fetchManagementData();
  }, [viewedUser, refreshKey, selectedDate]);

  const fetchManagementData = async () => {
    setIsLoading(true);
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayStr = getFormattedDateDDMMYY(dateObj);
      
      const response = await fetch(`/api/management-dashboard?asmId=${viewedUser.user_id}&date=${selectedDate}&day=${dayStr}`);
      const data = await response.json();
      if (data.performance) setPerformance(data.performance);
      if (data.team) setTeam(data.team);
      if (data.submissions) setOwnSubmissions(data.submissions);
      if (data.questions) setQuestions(data.questions);
      if (data.topic) setTopic(data.topic);
    } catch (err) {
      setToast('Error loading management data', 'err');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrillDown = (memberId: string, name: string, role: string) => {
    const r = role.toUpperCase();
    if (r === 'RM' || r === 'SM') return; // Cannot drill down into RMs or SMs
    setHistory(prev => [...prev, viewedUser]);
    const newUser: User = { user_id: memberId, name, role, manager_id: viewedUser.user_id };
    setViewedUser(newUser);
  };

  const handleGoBack = () => {
    if (history.length === 0) return;
    const newHistory = [...history];
    const prevUser = newHistory.pop();
    if (prevUser) {
      setViewedUser(prevUser);
      setHistory(newHistory);
    }
  };

  const completedCount = ownSubmissions.length;
  const totalReports = team.length;
  const pendingCount = totalReports - completedCount;
  const dailyTopic = topic || "No topic assigned";

  const isHighLevel = ['HO', 'HEAD', 'ZH', 'ZSM'].includes(viewedUser.role.toUpperCase());
  const isExecutive = ['HO', 'HEAD'].includes(viewedUser.role.toUpperCase());

  const groupedPerformance = isExecutive ? performance.reduce((acc, curr) => {
    const role = (curr.smRole || 'Other').toUpperCase();
    if (!acc[role]) acc[role] = [];
    acc[role].push(curr);
    return acc;
  }, {} as Record<string, ManagementPerformance[]>) : null;

  const isOriginalUserExecutive = ['HO', 'HEAD'].includes(user.role.toUpperCase());
  // Daily tracker (summary cards) should only be shown on 'home' mode as requested
  const shouldShowSummary = mode === 'home';

  const showDirectTeamList = mode === 'choreography' || (mode === 'home' && !isOriginalUserExecutive);
  const showPerformanceTable = mode === 'performance' || (mode === 'home' && isOriginalUserExecutive);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-bold">Synchronizing Daily Tracker...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="max-w-4xl mx-auto p-6 space-y-8"
    >
      {mode !== 'home' && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {history.length > 0 && (
              <button 
                onClick={handleGoBack}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0"
              >
                <ArrowLeft size={20} className="text-slate-500" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-black text-brand-navy tracking-tight">
                {mode === 'choreography' ? 'Choreography Evaluation' : 'Team Analytics'}
              </h2>
              <p className="text-slate-500 font-medium text-xs uppercase tracking-wider">
                {viewedUser.user_id === user.user_id 
                  ? `${viewedUser.role} DASHBOARD` 
                  : `${viewedUser.role} VIEW: ${viewedUser.name}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {shouldShowSummary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
          <ManagementStatCard 
            label="Completed" 
            value={completedCount.toString()} 
            subValue={`out of ${totalReports} reports`}
          />
          <ManagementStatCard 
            label="Pending" 
            value={pendingCount.toString()} 
            subValue="Evals required"
          />
          <div className="col-span-2 md:col-span-1 bg-brand-navy p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col justify-center relative overflow-hidden">
            <div className="relative z-10">
              <span className="text-[9px] sm:text-[10px] font-black text-white/50 uppercase tracking-widest block mb-1">Daily Topics</span>
              <div className="space-y-1.5 max-h-[80px] overflow-y-auto pr-1 scrollbar-hide">
                {dailyTopic.split(' | ').filter(Boolean).map((t, i) => (
                  <p key={i} className="text-xs sm:text-sm font-black text-white leading-tight border-l-2 border-white/20 pl-2">
                    {t}
                  </p>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3 sm:mt-4 text-white/60">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{formatToday()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct Team Section - Shown on Choreography tab OR Home (for SM-ZH) */}
      {showDirectTeamList && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-brand-navy text-sm uppercase tracking-widest">
              {viewedUser.user_id === user.user_id ? 'Direct Team Choreography' : `${viewedUser.name}'s Direct Team`}
            </h3>
          </div>
          
          <div className="grid gap-3">
          {team.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-400 font-bold italic">No direct reports found.</p>
            </div>
          ) : (
            team.map((member) => {
              const submission = ownSubmissions.find(s => s.target_user === member.user_id);
              const isCompletedByManager = !!submission;
              const perfData = performance.find(p => p.smId === member.user_id);
              const isRM = member.role.toUpperCase() === 'RM';

              return (
                <motion.div 
                  whileHover={!(member.role.toUpperCase() === 'RM' || member.role.toUpperCase() === 'SM') ? { x: 4 } : {}}
                  key={member.user_id}
                  className={cn(
                    "group p-3 bg-white rounded-2xl border border-slate-50 shadow-sm flex items-center justify-between transition-all",
                    !(member.role.toUpperCase() === 'RM' || member.role.toUpperCase() === 'SM') && "hover:shadow-md",
                    isCompletedByManager && "bg-slate-50/25"
                  )}
                >
                  <div 
                    className={cn(
                      "flex flex-col flex-1",
                      !(member.role.toUpperCase() === 'RM' || member.role.toUpperCase() === 'SM') && "cursor-pointer"
                    )}
                    onClick={() => !(member.role.toUpperCase() === 'RM' || member.role.toUpperCase() === 'SM') && handleDrillDown(member.user_id, member.name, member.role)}
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-brand-navy text-sm group-hover:text-brand-blue transition-colors">
                        {member.name}
                      </h4>
                      {!isRM && <Users size={12} className="text-slate-300" />}
                    </div>
                    <p className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{member.user_id}</span>
                      <span className="text-[9px] text-brand-blue/60 font-bold uppercase tracking-widest bg-brand-blue/5 px-1.5 rounded">{member.role}</span>
                    </p>
                    {perfData && perfData.totalRMs > 0 && !isRM && (
                      <p className="text-[9px] text-brand-navy/60 font-bold uppercase mt-1">
                        RM Progress: <span className={cn(perfData.completedRMs === perfData.totalRMs && perfData.totalRMs > 0 ? "text-green-600" : "text-brand-blue")}>
                          {perfData.completedRMs}/{perfData.totalRMs} Completed
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {viewedUser.user_id === user.user_id ? (() => {
                      const mRole = member.role.toUpperCase();
                      let requiredLevel = 'RM-SM';
                      if (mRole === 'SM') requiredLevel = 'SM-ASM';
                      else if (mRole === 'ASM') requiredLevel = 'ASM-ZSM';
                      else if (mRole === 'ZSM') requiredLevel = 'ZSM-ZH';
                      else if (mRole === 'ZH' || mRole === 'HO' || mRole === 'HEAD') requiredLevel = 'ZH-Head';
                      
                      const hasQuestions = questions.some(q => (q.level || '').toUpperCase() === requiredLevel);

                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasQuestions) {
                              onSelectMember(member, isCompletedByManager);
                            }
                          }}
                          disabled={!hasQuestions}
                          className={cn(
                            "flex items-center justify-center w-[65px] h-[52px] px-[10px] py-[2px] rounded-xl font-black text-[8px] uppercase tracking-tighter transition-all shrink-0 leading-tight text-center",
                            !hasQuestions
                              ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                              : isCompletedByManager 
                                ? "bg-slate-100 text-slate-500 hover:bg-slate-200" 
                                : "bg-brand-blue text-white shadow-lg shadow-brand-blue/20 hover:scale-105 active:scale-95"
                          )}
                        >
                          {!hasQuestions ? 'No Questions' : isCompletedByManager ? 'Edit Update' : 'Submit Update'}
                        </button>
                      );
                    })() : (
                      <div className={cn(
                        "flex flex-col items-center justify-center w-[65px] h-[52px] rounded-xl text-center leading-tight",
                        isCompletedByManager ? "bg-green-50 text-green-600" : "bg-slate-50 text-slate-400"
                      )}>
                        <p className="text-[8px] font-black uppercase tracking-tighter">Daily Update</p>
                        <p className="text-[9px] font-bold">{isCompletedByManager ? 'DONE' : 'PENDING'}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
          </div>
        </div>
      )}

      {/* Team Performance Table - Shown on Performance tab OR Home (for HO/Head) */}
      {showPerformanceTable && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-premium overflow-hidden mt-12">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="font-black text-brand-navy text-sm uppercase tracking-widest">
              {viewedUser.user_id === user.user_id ? 'Team Performance Tracker' : `${viewedUser.name}'s Team Performance`}
            </h3>
            
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 gap-3 shadow-sm w-fit">
              <div className="flex items-center gap-2 pr-3 border-r border-slate-100">
                <Calendar size={13} className="text-brand-blue" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</span>
              </div>
              <input 
                type="date" 
                value={selectedDate}
                max={formatToday()}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-[11px] font-bold text-brand-navy outline-none cursor-pointer bg-transparent"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Total RMs</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">RM Progress Status</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm font-medium">
                {performance.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-bold italic">No performance data found.</td>
                  </tr>
                ) : isExecutive && groupedPerformance ? (
                  Object.entries(groupedPerformance as Record<string, ManagementPerformance[]>).map(([role, items]) => (
                    <React.Fragment key={role}>
                      <tr className="bg-slate-50/50">
                        <td colSpan={4} className="px-6 py-2 text-[9px] font-black text-brand-blue uppercase tracking-widest border-y border-slate-100">
                          {role} LEVEL PERFORMANCE
                        </td>
                      </tr>
                      {items.filter(p => (p.smRole || '').toUpperCase() !== 'RM').map((p) => {
                        const perc = p.totalRMs > 0 ? Math.round((p.completedRMs / p.totalRMs) * 100) : 0;
                        const isFullyDone = p.completedRMs === p.totalRMs && p.totalRMs > 0;
                        return (
                          <tr 
                            key={p.smId} 
                            className={cn(
                              "transition-colors group",
                              !(p.smRole?.toUpperCase() === 'SM' || p.smRole?.toUpperCase() === 'RM') ? "hover:bg-slate-50 cursor-pointer" : "cursor-default"
                            )}
                            onClick={() => handleDrillDown(p.smId, p.smName, p.smRole || 'Member')}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-brand-blue/10 group-hover:text-brand-blue transition-colors">
                                  <Users size={14} />
                                </div>
                                <div>
                                  <p className="font-bold text-brand-navy text-sm group-hover:text-brand-blue transition-all">{p.smName}</p>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.smId}</p>
                                    {p.smRole && (
                                      <span className="text-[8px] px-1 bg-slate-100 text-slate-500 rounded font-black border border-slate-200 uppercase tracking-tighter">
                                        {p.smRole}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-brand-navy font-bold">{p.totalRMs}</span>
                            </td>
                            <td className="px-6 py-4">
                               <div className="flex items-center gap-3">
                                 <div className="flex-1 w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                   <div 
                                     className={cn(
                                       "h-full rounded-full transition-all duration-500",
                                       perc === 100 ? "bg-green-500" : perc > 50 ? "bg-brand-blue" : "bg-amber-500"
                                     )} 
                                     style={{ width: `${perc}%` }}
                                   />
                                 </div>
                                 <span className="text-xs font-bold text-slate-500">{p.completedRMs}/{p.totalRMs}</span>
                               </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {isFullyDone ? (
                                <div className="inline-flex items-center text-green-600 bg-green-50 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight">
                                  Fully Done
                                </div>
                              ) : p.completedRMs > 0 ? (
                                <div className="inline-flex items-center text-brand-blue bg-brand-blue/10 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight">
                                  In Progress
                                </div>
                              ) : (
                                <div className="inline-flex items-center text-slate-400 bg-slate-100 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight">
                                  Pending
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                ) : (
                  performance.filter(p => (p.smRole || '').toUpperCase() !== 'RM').map((p) => {
                    const perc = p.totalRMs > 0 ? Math.round((p.completedRMs / p.totalRMs) * 100) : 0;
                    const isFullyDone = p.completedRMs === p.totalRMs && p.totalRMs > 0;
    
                    return (
                      <tr 
                        key={p.smId} 
                        className={cn(
                          "transition-colors group",
                          !(p.smRole?.toUpperCase() === 'SM' || p.smRole?.toUpperCase() === 'RM') ? "hover:bg-slate-50 cursor-pointer" : "cursor-default"
                        )}
                        onClick={() => handleDrillDown(p.smId, p.smName, p.smRole || 'Member')}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-brand-blue/10 group-hover:text-brand-blue transition-colors">
                              <Users size={14} />
                            </div>
                            <div>
                              <p className="font-bold text-brand-navy text-sm group-hover:text-brand-blue transition-all">{p.smName}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.smId}</p>
                                {p.smRole && (
                                  <span className="text-[8px] px-1 bg-slate-100 text-slate-500 rounded font-black border border-slate-200 uppercase tracking-tighter">
                                    {p.smRole}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-brand-navy font-bold">{p.totalRMs}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  perc === 100 ? "bg-green-500" : perc > 50 ? "bg-brand-blue" : "bg-amber-500"
                                )} 
                                style={{ width: `${perc}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-500">{p.completedRMs}/{p.totalRMs}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isFullyDone ? (
                            <div className="inline-flex items-center text-green-600 bg-green-50 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight">
                              Fully Done
                            </div>
                          ) : p.completedRMs > 0 ? (
                            <div className="inline-flex items-center text-brand-blue bg-brand-blue/10 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight">
                              In Progress
                            </div>
                          ) : (
                            <div className="inline-flex items-center text-slate-400 bg-slate-100 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight">
                              Pending
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ManagementStatCard({ label, value, subValue }: { label: string; value: string; subValue: string }) {
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
