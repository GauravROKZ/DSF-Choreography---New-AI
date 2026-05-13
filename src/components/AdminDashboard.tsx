import React, { useState, useEffect } from 'react';
import { User } from '@/types';
import { Upload, Download, FileText, Users, Database, ShieldCheck, ArrowLeft, Calendar, Clock, Sparkles, FileDown } from 'lucide-react';
import { motion } from 'motion/react';
import Papa from 'papaparse';
import { formatToday, getFormattedDateDDMMYY } from '@/lib/utils';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

interface AdminDashboardProps {
  setToast: (msg: string, type: 'ok' | 'err') => void;
  onBack?: () => void;
}

export default function AdminDashboard({ setToast, onBack }: AdminDashboardProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingHierarchy, setIsUploadingHierarchy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [hierarchyFile, setHierarchyFile] = useState<File | null>(null);
  const [clearDate, setClearDate] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [lastQuestionDate, setLastQuestionDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('21:00');
  const [lastHierarchySync, setLastHierarchySync] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [insightDate, setInsightDate] = useState(formatToday());
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const contentType = response.headers.get("content-type");
      if (response.ok && contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (data.start_time) setStartTime(data.start_time);
        if (data.end_time) setEndTime(data.end_time);
        if (data.last_hierarchy_sync) {
          const date = new Date(data.last_hierarchy_sync);
          setLastHierarchySync(date.toLocaleString('en-IN', { 
            day: '2-digit', 
            month: '2-digit', 
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }));
        }
      } else {
        const text = await response.text();
        console.warn("Settings fetch yielded non-json or error:", text.slice(0, 200));
      }
    } catch (err) {
      console.error("Settings fetch fail", err);
    }
  };

  const handleUpdateSettings = async () => {
    setIsSavingSettings(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          settings: {
            start_time: startTime,
            end_time: endTime
          }
        })
      });
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error || 'Update failed');
        setToast('Global submission window updated!', 'ok');
      } else {
        const text = await response.text();
        throw new Error(`Server returned non-JSON response: ${text.slice(0, 100)}`);
      }
    } catch (err: any) {
      console.error("Settings update error:", err);
      setToast(err.message || 'Failed to update settings', 'err');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/questions-stats');
      if (!response.ok) return;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        if (data.lastDate) setLastQuestionDate(data.lastDate);
      }
    } catch (err) {
      console.error("Stats fail", err);
    }
  };

  const handleUpload = async () => {
    if (!file) return setToast('Please select a CSV file', 'err');

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData
      });
      
      let data: any = {};
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      }

      if (!response.ok) throw new Error(data.details || data.error || 'Upload failed');
      setToast('Questionnaire synchronized successfully!', 'ok');
      setFile(null);
      fetchStats(); // Refresh stats
    } catch (err: any) {
      setToast(err.message || 'Database update failed', 'err');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadHierarchy = async () => {
    if (!hierarchyFile) return setToast('Please select the DSF Hierarchy CSV', 'err');

    setIsUploadingHierarchy(true);
    const formData = new FormData();
    formData.append('file', hierarchyFile);

    try {
      const response = await fetch('/api/admin/upload-hierarchy', {
        method: 'POST',
        body: formData
      });
      
      let data: any = {};
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      }
      
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      setToast('DSF Hierarchy synchronized successfully!', 'ok');
      setHierarchyFile(null);
      fetchSettings(); // Refresh timestamp
    } catch (err: any) {
      setToast(err.message || 'Hierarchy sync failed', 'err');
    } finally {
      setIsUploadingHierarchy(false);
    }
  };

  const handleExport = async (table: string) => {
    setToast(`Fetching ${table} records...`, 'ok');
    try {
      const response = await fetch(`/api/admin/export?table=${table}`);
      const data = await response.json();
      if (!response.ok || !data?.length) throw new Error('No data');

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${table}_export_${formatToday()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setToast('Export failed', 'err');
    }
  };

  const handleClearQuestions = async () => {
    if (!clearDate) return setToast('Please select a date', 'err');
    
    // clearDate is YYYY-MM-DD from input[type=date]
    const [y, m, d] = clearDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formattedDay = getFormattedDateDDMMYY(dateObj);

    if (!window.confirm(`Are you sure you want to clear ALL questions for ${formattedDay}?`)) return;

    setIsDeleting(true);
    try {
      const response = await fetch('/api/admin/clear-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: formattedDay })
      });
      if (!response.ok) throw new Error('Clear failed');
      setToast(`Questions for ${formattedDay} cleared successfully.`, 'ok');
      setClearDate('');
      fetchStats(); // Refresh stats
    } catch (err) {
      setToast('Clear operation failed', 'err');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGenerateAIInsight = async () => {
    if (!insightDate) return setToast('Please select a date for the MD report', 'err');
    
    setIsGeneratingInsight(true);
    setToast('Fetching choreography responses for deep analysis...', 'ok');
    
    try {
      const dataRes = await fetch(`/api/admin/insights-data?date=${insightDate}`);
      if (!dataRes.ok) throw new Error('Data fetch failed');
      const data = await dataRes.json();

      if (!data.sampleResponses || data.sampleResponses.length === 0) {
        throw new Error('No responses found for this date to analyze');
      }

      setToast('AI is deep-scanning feedback and categorizing themes...', 'ok');
      
      const insightRes = await fetch('/api/admin/generate-insights-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: insightDate, data })
      });

      if (!insightRes.ok) {
        const errorData = await insightRes.json();
        throw new Error(errorData.details || errorData.error || 'AI Insight generation failed');
      }

      const reportData = await insightRes.json();
      generateDeepInsightPDF(reportData, data, insightDate);
      setToast('MD Strategic Insight Report generated!', 'ok');
    } catch (err: any) {
      console.error("AI Insight error:", err);
      setToast(err.message || 'Failed to generate AI insights', 'err');
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const generateDeepInsightPDF = (report: any, rawData: any, date: string) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(26, 42, 74); 
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text("STRATEGIC CHOREOGRAPHY INSIGHTS", 15, 20);
    doc.setFontSize(10);
    doc.text(`Proprietary Analysis for Senior Management | Confidential | Date: ${date}`, 15, 30);
    
    let currentY = 55;

    // Executive Summary
    doc.setTextColor(200, 16, 46);
    doc.setFontSize(14);
    doc.text("Executive Summary", 15, currentY);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    const summaryLines = doc.splitTextToSize(report.executive_summary, pageWidth - 30);
    doc.text(summaryLines, 15, currentY + 8);
    
    currentY += 15 + (summaryLines.length * 6);

    // Operational Snapshot (Condensed as requested)
    doc.setTextColor(26, 42, 74);
    doc.setFontSize(12);
    doc.text(`Daily Progress: ${rawData.stats.participationRate.toFixed(1)}% Completion Rate (${rawData.stats.totalSubmissions}/${rawData.stats.totalUsers} users)`, 15, currentY);
    currentY += 12;

    // Feedback Themes & Charts
    doc.setTextColor(200, 16, 46);
    doc.setFontSize(14);
    doc.text("Feedback Volume & Themes", 15, currentY);
    currentY += 10;

    // Simple Bar Chart for Themes
    report.themes.forEach((theme: any, index: number) => {
      const barWidth = (pageWidth - 80) * (theme.percentage / 100);
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(theme.name, 15, currentY + 5);
      
      doc.setFillColor(230, 230, 230);
      doc.rect(70, currentY, (pageWidth - 80), 6, 'F');
      doc.setFillColor(0, 102, 178); // Blue bars
      doc.rect(70, currentY, barWidth, 6, 'F');
      
      doc.text(`${theme.percentage}%`, pageWidth - 15, currentY + 5, { align: 'right' });
      
      currentY += 12;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      const themeInsight = doc.splitTextToSize(theme.insight, pageWidth - 85);
      doc.text(themeInsight, 70, currentY);
      currentY += (themeInsight.length * 5) + 5;
    });

    // Check for page overflow
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    // Red Flags
    doc.setTextColor(200, 16, 46);
    doc.setFontSize(14);
    doc.text("Critical Red Flags / Blockers", 15, currentY);
    currentY += 8;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    report.red_flags.forEach((flag: string) => {
      const flagLines = doc.splitTextToSize(`• ${flag}`, pageWidth - 30);
      doc.text(flagLines, 15, currentY);
      currentY += (flagLines.length * 6);
    });

    currentY += 10;

    // Strategic Action Items
    doc.setTextColor(0, 102, 178);
    doc.setFontSize(14);
    doc.text("Recommended Action Plan", 15, currentY);
    currentY += 8;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    report.action_items.forEach((item: string, i: number) => {
      const itemLines = doc.splitTextToSize(`${i + 1}. ${item}`, pageWidth - 30);
      doc.text(itemLines, 15, currentY);
      currentY += (itemLines.length * 6);
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Sentiment Index: ${report.field_sentiment_score}/100 | Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    }

    doc.save(`Strategic_Insight_${date}.pdf`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="max-w-2xl mx-auto p-6 space-y-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-brand-navy">HO Admin Panel</h2>
            <p className="text-slate-500 text-sm font-medium">Head Office Configuration & Audit</p>
          </div>
        </div>
        
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-brand-blue font-bold text-xs uppercase tracking-widest transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        )}
      </div>

      <div className="grid gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Upload size={20} className="text-brand-blue" />
            <h3 className="font-bold text-brand-navy">Synchronize Questionnaire</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload a standard schema CSV to update questionnaire. Duplicate IDs will be patched automatically.
            </p>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-brand-blue transition-colors relative group">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-2">
                <div className="mx-auto w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 group-hover:text-brand-blue transition-colors">
                  <FileText size={20} />
                </div>
                <p className="text-sm font-bold text-slate-600">
                  {file ? file.name : "Click to browse or drag CSV"}
                </p>
                <p className="text-[10px] text-slate-400">Max size 2MB</p>
              </div>
            </div>
            <button
              onClick={handleUpload}
              disabled={isUploading || !file}
              className="w-full bg-brand-navy disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {isUploading ? 'Uploading...' : 'Update Questionnaire'}
            </button>

            {lastQuestionDate && (
              <div className="flex items-center justify-center gap-2 pt-2 text-brand-blue/80">
                <Calendar size={14} />
                <p className="text-[11px] font-bold uppercase tracking-widest text-center">
                  Questions Uploaded till: <span className="text-brand-navy underline decoration-brand-blue/30 decoration-2 underline-offset-4">{lastQuestionDate}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Users size={20} className="text-brand-blue" />
            <h3 className="font-bold text-brand-navy">DSF Hierarchy Sync</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload the DSF Master Dump to update user mappings and hierarchies. Standard fields: EMP_CODE, EMP_NAME, DESIGNATION, SUPERVISOR_ID.
            </p>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-brand-blue transition-colors relative group">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setHierarchyFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-2">
                <div className="mx-auto w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 group-hover:text-brand-blue transition-colors">
                  <Upload size={20} />
                </div>
                <p className="text-sm font-bold text-slate-600">
                  {hierarchyFile ? hierarchyFile.name : "Click to browse DSF dump"}
                </p>
                <p className="text-[10px] text-slate-400">Standard Export CSV from DSF System</p>
              </div>
            </div>
            <button
              onClick={handleUploadHierarchy}
              disabled={isUploadingHierarchy || !hierarchyFile}
              className="w-full bg-brand-navy disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {isUploadingHierarchy ? 'Processing Hierarchy...' : 'Sync Distribution Master'}
            </button>

            {lastHierarchySync && (
              <div className="flex items-center justify-center gap-2 pt-2 text-brand-emerald">
                <Clock size={14} />
                <p className="text-[11px] font-bold uppercase tracking-widest text-center">
                  Last Synced: <span className="text-brand-navy underline decoration-brand-emerald/30 decoration-2 underline-offset-4">{lastHierarchySync}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Database size={20} className="text-brand-blue" />
            <h3 className="font-bold text-brand-navy">Data Audit & Exports</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleExport('submissions')}
              className="flex flex-col items-center justify-center p-6 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 group"
            >
              <Download size={20} className="text-slate-400 group-hover:text-brand-blue" />
              <div className="text-center">
                <p className="text-sm font-bold text-brand-navy">Submissions</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Daily Log</p>
              </div>
            </button>
            <button
              onClick={() => handleExport('responses')}
              className="flex flex-col items-center justify-center p-6 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 group"
            >
              <Download size={20} className="text-slate-400 group-hover:text-brand-blue" />
              <div className="text-center">
                <p className="text-sm font-bold text-brand-navy">Responses</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Raw Data</p>
              </div>
            </button>
            <button
              onClick={() => handleExport('questions')}
              className="flex flex-col items-center justify-center p-6 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 group"
            >
              <Download size={20} className="text-slate-400 group-hover:text-brand-blue" />
              <div className="text-center">
                <p className="text-sm font-bold text-brand-navy">Questions</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Full Dictionary</p>
              </div>
            </button>
            <button
              onClick={() => handleExport('users')}
              className="flex flex-col items-center justify-center p-6 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 group"
            >
              <Download size={20} className="text-slate-400 group-hover:text-brand-blue" />
              <div className="text-center">
                <p className="text-sm font-bold text-brand-navy">Users List</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Master Data</p>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Clock size={20} className="text-brand-blue" />
            <h3 className="font-bold text-brand-navy">Submission Window</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Set the universal start and end times for check-in submissions. Users will be blocked outside this window.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Start Time (IST)</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">End Time (IST)</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
            </div>
            <button
              onClick={handleUpdateSettings}
              disabled={isSavingSettings}
              className="w-full bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
            >
              <ShieldCheck size={18} />
              {isSavingSettings ? 'Saving...' : 'Apply Universal Timer'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles size={20} className="text-amber-500" />
            <h3 className="font-bold text-brand-navy">AI MD Insight Report</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed italic">
              Generate a high-level strategic PDF for the Managing Director. AI will analyze today's participation trends and qualitative responses.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="date"
                  value={insightDate}
                  onChange={(e) => setInsightDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
              <button
                onClick={handleGenerateAIInsight}
                disabled={isGeneratingInsight || !insightDate}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold px-6 rounded-lg text-sm flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap"
              >
                {isGeneratingInsight ? (
                  <>
                    <Clock className="animate-spin" size={16} />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <FileDown size={16} />
                    Generate PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-red-50 rounded-xl border border-red-100 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Database size={20} className="text-red-500" />
            <h3 className="font-bold text-brand-navy">Data Management</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed italic">
              Careful: This will permanently remove all questions for the specified date across all roles.
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                min={formatToday()}
                value={clearDate}
                onChange={(e) => setClearDate(e.target.value)}
                className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-200"
              />
              <button
                onClick={handleClearQuestions}
                disabled={isDeleting || !clearDate}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold px-6 rounded-lg text-sm transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Clear Questions'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
