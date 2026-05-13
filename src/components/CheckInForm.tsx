import React, { useState, useEffect } from 'react';
import { User } from '@/types';
import { cn, formatToday, getFormattedDateDDMMYY } from '@/lib/utils';
import { ArrowLeft, Save, Info, AlertCircle, Check, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CheckInFormProps {
  user: User;
  rm: User;
  onBack: () => void;
  setToast: (msg: string, type: 'ok' | 'err') => void;
  isUpdate: boolean;
}

// ─── Field normalisation helpers ────────────────────────────────────────────

function getQType(q: any): 'number' | 'dropdown' | 'multiselect' | 'text' {
  const raw = (q.type || q.Type || q.question_type || '').toLowerCase().replace(/[\s-]/g, '');
  if (raw === 'number') return 'number';
  if (raw === 'dropdown') return 'dropdown';
  if (raw === 'multiselect' || raw === 'multipleselection') return 'multiselect';
  return 'text';
}

function getRawOptions(q: any): string[] {
  return [1, 2, 3, 4, 5]
    .map(n =>
      q[`option_${n}`] ?? q[`Option_${n}`] ??
      q[`option ${n}`] ?? q[`Option ${n}`] ?? ''
    )
    .map(o => o?.toString().trim())
    .filter(Boolean);
}

function getQText(q: any): string {
  return q.question_text || q.Question_text || q.question || 'Missing question text';
}

function getTopic(q: any): string {
  const q0 = q as any;
  return q0.topic || q0.Topic || 'Evaluation';
}

function getSelected(val: string): string[] {
  return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function toggleOption(current: string, option: string): string {
  const selected = getSelected(current);
  const next = selected.includes(option)
    ? selected.filter(o => o !== option)
    : [...selected, option];
  return next.sort().join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CheckInForm({ user, rm, onBack, setToast, isUpdate }: CheckInFormProps) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const [isOnLeave, setIsOnLeave] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeWindowMsg, setTimeWindowMsg] = useState<string | null>(null);
  const [isTimeBlocked, setIsTimeBlocked] = useState(false);

  useEffect(() => {
    fetchFormData();
    checkSubmissionWindow();
  }, [rm]);

  const checkSubmissionWindow = async () => {
    try {
      const response = await fetch('/api/settings');
      const settings = await response.json();
      if (settings.start_time && settings.end_time) {
        const now = new Date();
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(utcTime + istOffset);
        
        const hNow = istNow.getHours();
        const mNow = istNow.getMinutes();
        const nowTotal = hNow * 60 + mNow;
        
        const [startH, startM] = settings.start_time.split(':').map(Number);
        const [endH, endM] = settings.end_time.split(':').map(Number);
        const startTotal = startH * 60 + startM;
        let endTotal = endH * 60 + endM;

        if (endTotal <= startTotal && endTotal === 0) {
          endTotal = 24 * 60;
        }

        if (nowTotal < startTotal || nowTotal > endTotal) {
          setIsTimeBlocked(true);
          setTimeWindowMsg(`${settings.start_time} - ${settings.end_time} IST`);
        }
      }
    } catch (err) {
      console.error("Timer check fail", err);
    }
  };

  const fetchFormData = async () => {
    setIsLoading(true);
    try {
      const todayDb = formatToday();
      const todayFormatted = getFormattedDateDDMMYY(new Date());

      const response = await fetch(`/api/form?smId=${user.user_id}&rmId=${rm.user_id}&date=${todayDb}&day=${todayFormatted}`);
      const data = await response.json();

      if (data.questions) setQuestions(data.questions);
      
      if (data.submission) {
        if (data.submission.status === 'On - Leave') setIsOnLeave(true);
        const ansMap: Record<string, string> = {};
        const otherMap: Record<string, string> = {};
        
        data.responses?.forEach((r: any) => {
          const q = data.questions?.find((qd: any) => qd.question_id === r.question_id);
          if (q) {
            const type = getQType(q);
            if (type === 'dropdown') {
              const opts = getRawOptions(q);
              if (!opts.includes(r.answer) && r.answer !== 'NA') {
                ansMap[r.question_id] = 'Others';
                otherMap[r.question_id] = r.answer;
              } else {
                ansMap[r.question_id] = r.answer;
              }
            } else {
              ansMap[r.question_id] = r.answer;
            }
          }
        });
        setAnswers(ansMap);
        setOthers(otherMap);
      }
    } catch (err) {
      setToast('Error loading form', 'err');
    } finally {
      setIsLoading(false);
    }
  };

  const setAnswer = (qId: string, val: string) =>
    setAnswers(prev => ({ ...prev, [qId]: val }));

  const setOther = (qId: string, val: string) =>
    setOthers(prev => ({ ...prev, [qId]: val }));

  const handleSubmit = async () => {
    if (isSubmitting) return;

    for (const q of questions) {
      const val = answers[q.question_id];
      const type = getQType(q);
      if (!isOnLeave) {
        if (!val) {
          setToast('Please answer all questions', 'err');
          return;
        }
        if (type === 'dropdown' && val === 'Others' && !others[q.question_id]?.trim()) {
          setToast('Please specify the "Others" answer', 'err');
          return;
        }
        if (type === 'multiselect' && getSelected(val).length === 0) {
          setToast('Please select at least one option', 'err');
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const today = formatToday();
      const levelName = questions.length > 0 ? (questions[0].level || questions[0].Level || '') : '';
      const topicName = questions.length > 0 ? getTopic(questions[0]) : 'General Check-in';

      const rows = questions.map(q => {
        let finalAns = answers[q.question_id] || 'NA';
        if (finalAns === 'Others') finalAns = others[q.question_id] || '';
        
        if (getQType(q) === 'multiselect' && getSelected(finalAns).includes('Others')) {
          const selected = getSelected(finalAns);
          const idx = selected.indexOf('Others');
          selected[idx] = others[q.question_id] || 'Others';
          finalAns = selected.join(', ');
        }

        if (isOnLeave) finalAns = 'NA';

        return {
          date: today,
          filled_by: user.user_id,
          target_user: rm.user_id,
          question_id: q.question_id,
          question: getQText(q),
          answer: finalAns,
          level: q.level || q.Level || '',
          topic: q.topic || q.Topic || ''
        };
      });

      const response = await fetch('/api/form/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smId: user.user_id,
          rmId: rm.user_id,
          date: today,
          status: isOnLeave ? 'On - Leave' : 'completed',
          level: levelName,
          topic: topicName,
          responses: rows
        })
      });

      if (!response.ok) throw new Error('Submission failed');

      setToast('Check-in saved successfully!', 'ok');
      onBack();
    } catch (err) {
      setToast('Error submitting form', 'err');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-bold">Loading questionnaire...</p>
      </div>
    );
  }

  const topicName = questions.length > 0 ? getTopic(questions[0]) : 'General Check-in';

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      className="max-w-2xl mx-auto p-6 space-y-8"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft size={20} className="text-slate-500" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-extrabold text-brand-navy leading-none">{rm.name}</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{rm.user_id}</p>
          <span className="inline-block bg-brand-blue/10 text-brand-blue text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded mt-1.5">
            {topicName}
          </span>
        </div>
        <div className="w-10 h-10" />
      </div>

      {isTimeBlocked ? (
        <div className="bg-white border-2 border-slate-100 rounded-3xl p-10 flex flex-col items-center text-center gap-6 shadow-2xl shadow-slate-900/5">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 animate-pulse">
            <Clock size={40} />
          </div>
          <div className="space-y-2">
            <h3 className="font-black text-brand-navy text-2xl tracking-tight">Access Restricted</h3>
            <p className="text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
              Choreography forms for <span className="text-brand-blue font-bold">{topicName}</span> are only available during the window:
            </p>
            <div className="mt-4 inline-block px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl ring-4 ring-slate-100">
              {timeWindowMsg}
            </div>
          </div>
          <button 
            onClick={onBack}
            className="mt-4 px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
          >
            Go Back
          </button>
        </div>
      ) : (
        <>
          {/* ── Leave toggle ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <Info size={16} />
          </div>
          <span className="text-sm font-bold text-brand-navy">Is this RM on leave today?</span>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {[false, true].map(val => (
            <button 
              key={String(val)}
              onClick={() => setIsOnLeave(val)}
              className={cn(
                "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                isOnLeave === val 
                  ? (val ? "bg-white text-amber-600 shadow-sm" : "bg-white text-brand-blue shadow-sm")
                  : "text-slate-500"
              )}
            > {val ? 'Yes' : 'No'} </button>
          ))}
        </div>
      </div>

      {/* ── Questions ── */}
      <div className={cn("space-y-6 py-4", isOnLeave && "opacity-40 pointer-events-none")}>
        {questions.map((q: any, idx) => {
          const type = getQType(q);
          const qText = getQText(q);
          const qId = q.question_id;
          
          const rawOptions = getRawOptions(q);
          const hasOthers = rawOptions.some(o => o.toLowerCase() === 'others');
          const options = rawOptions.filter(o => o.toLowerCase() !== 'others');

          return (
            <div key={qId} className="space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-black text-brand-blue/30 leading-none shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                <p className="font-bold text-brand-navy leading-relaxed">{qText}</p>
              </div>

              {type === 'number' && (
                <input
                  type="number"
                  value={answers[qId] || ''}
                  onChange={(e) => setAnswer(qId, e.target.value)}
                  placeholder="Enter numerical value..."
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all font-medium"
                />
              )}

              {type === 'dropdown' && (
                <div className="space-y-3">
                  <div className="relative">
                    <select
                      value={answers[qId] || ''}
                      onChange={(e) => setAnswer(qId, e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all font-medium appearance-none pr-10"
                    >
                      <option value="">Select an option...</option>
                      {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                      {hasOthers && <option value="Others">Others (Specify)</option>}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <AnimatePresence>
                    {hasOthers && answers[qId] === 'Others' && (
                      <motion.input
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        type="text"
                        value={others[qId] || ''}
                        onChange={(e) => setOther(qId, e.target.value)}
                        placeholder="Describe further..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all font-medium"
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}

              {type === 'multiselect' && (
                <div className="space-y-3">
                  <MultiSelect 
                    options={options}
                    hasOthers={hasOthers}
                    value={answers[qId] || ''}
                    onChange={(val) => setAnswer(qId, val)}
                  />
                  <AnimatePresence>
                    {hasOthers && getSelected(answers[qId] || '').includes('Others') && (
                      <motion.input
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        type="text"
                        value={others[qId] || ''}
                        onChange={(e) => setOther(qId, e.target.value)}
                        placeholder="Please specify for 'Others'..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all font-medium"
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}

              {type === 'text' && (
                <textarea
                  value={answers[qId] || ''}
                  onChange={(e) => setAnswer(qId, e.target.value)}
                  placeholder="Type comprehensive feedback..."
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all font-medium min-h-[100px] resize-none"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Leave notice ── */}
      {isOnLeave && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="text-amber-500 shrink-0" size={18} />
          <p className="text-xs font-bold text-amber-700 leading-normal">
            RM is marked as "On Leave". Responses will be recorded as "NA". 
            Toggle to "No" to fill questions manually.
          </p>
        </div>
      )}

      {/* ── Submit ── */}
      {isTimeBlocked && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-600">
           <AlertCircle size={18} className="shrink-0" />
           <p className="text-xs font-bold leading-normal">
             Submission is restricted to set timings. <br/>
             {timeWindowMsg}
           </p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || isTimeBlocked}
        className="w-full bg-brand-blue hover:bg-blue-700 text-white font-extrabold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-brand-blue/10 active:scale-95 disabled:opacity-50"
      >
        {isTimeBlocked ? <Clock size={20} /> : <Save size={20} />}
        {isSubmitting ? 'Saving...' : isTimeBlocked ? 'Submission Window Closed' : isUpdate ? 'Update Evaluation ✓' : 'Finalize Check-in ✓'}
      </button>

      <div className="h-10" />
        </>
      )}
    </motion.div>
  );
}

// ─── Multi-Select component ──────────────────────────────────────────────────

interface MultiSelectProps {
  options: string[];
  hasOthers: boolean;
  value: string;
  onChange: (val: string) => void;
}

function MultiSelect({ options, hasOthers, value, onChange }: MultiSelectProps) {
  const selected = getSelected(value);
  const displayOptions = hasOthers ? [...options, 'Others'] : options;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Select all that apply
        </p>
        <AnimatePresence>
          {selected.length > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="text-[10px] font-black bg-brand-blue text-white px-2 py-0.5 rounded-full"
            >
              {selected.length} selected
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap gap-2">
        {displayOptions.map(opt => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(toggleOption(value, opt))}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all",
                isSelected 
                  ? "bg-brand-blue border-brand-blue text-white shadow-sm shadow-brand-blue/20" 
                  : "bg-white border-slate-200 text-slate-600 hover:border-brand-blue/40 hover:text-brand-navy"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0",
                isSelected ? "bg-white/20 border-white" : "border-slate-300 bg-white"
              )}>
                {isSelected && <Check size={10} strokeWidth={3} className="text-white" />}
              </div>
              {opt}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="bg-brand-blue/5 border border-brand-blue/15 rounded-lg px-3 py-2"
          >
            <p className="text-[10px] font-bold text-brand-blue uppercase tracking-widest mb-1">Current Selections</p>
            <p className="text-xs font-semibold text-brand-navy leading-relaxed">
              {selected.join(' · ')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
