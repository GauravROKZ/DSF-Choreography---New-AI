import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';

export default function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [settings, setSettings] = useState<{ start_time?: string; end_time?: string } | null>(null);

  useEffect(() => {
    fetchSettings();
    const interval = setInterval(updateTimer, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [settings]);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      setSettings(data);
    } catch (err) {
      console.error("Timer settings fail", err);
    }
  };

  const updateTimer = () => {
    if (!settings?.start_time || !settings?.end_time) {
      setTimeLeft('');
      setIsBlocked(false);
      setIsUrgent(false);
      return;
    }

    // Get current time in IST (Indian Standard Time)
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(utcTime + istOffset);

    const hNow = istNow.getHours();
    const mNow = istNow.getMinutes();
    
    const [startH, startM] = settings.start_time.split(':').map(Number);
    const [endH, endM] = settings.end_time.split(':').map(Number);

    const startTotal = startH * 60 + startM;
    const nowTotal = hNow * 60 + mNow;
    let endTotal = endH * 60 + endM;

    // Handle 12:00 AM (00:00) as end of day if it's smaller than start time
    if (endTotal <= startTotal && endTotal === 0) {
      endTotal = 24 * 60;
    }

    if (nowTotal < startTotal) {
      setTimeLeft(`Starts ${settings.start_time}`);
      setIsBlocked(true);
      setIsUrgent(false);
    } else if (nowTotal > endTotal) {
      setTimeLeft('Window Closed');
      setIsBlocked(true);
      setIsUrgent(false);
    } else {
      const diff = endTotal - nowTotal;
      setIsUrgent(diff <= 60);

      if (diff <= 30) {
        setTimeLeft('Closing soon');
      } else {
        const hRes = Math.floor(diff / 60);
        const mRes = diff % 60;
        setTimeLeft(hRes > 0 ? `${hRes}h ${mRes}m left` : `${mRes}m left`);
      }
      setIsBlocked(false);
    }
  };

  // Initial update
  useEffect(() => {
    if (settings) updateTimer();
  }, [settings]);

  if (!timeLeft) return null;

  const urgentStyles = "bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/30 ring-2 ring-rose-600/50";
  const blockedStyles = "bg-red-500/20 text-red-200";
  const normalStyles = "bg-emerald-500/20 text-emerald-200";

  return (
    <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all duration-500 ${isUrgent && !isBlocked ? urgentStyles : isBlocked ? blockedStyles : normalStyles}`}>
      {isBlocked ? <AlertCircle size={12} /> : <Clock size={12} />}
      <span>{timeLeft}</span>
    </div>
  );
}
