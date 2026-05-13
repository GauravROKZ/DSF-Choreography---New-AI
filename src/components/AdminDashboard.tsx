import React, { useState, useEffect } from 'react';
import { User } from '@/types';
import { Upload, Download, FileText, Users, Database, ShieldCheck, ArrowLeft, Calendar, Clock, Sparkles, FileDown, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [reportStartDate, setReportStartDate] = useState(formatToday());
  const [reportEndDate, setReportEndDate] = useState(formatToday());
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [isExportingUptick, setIsExportingUptick] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);

  // Report Configuration Settings (Instance-only defaults)
  const [redFlagThreshold, setRedFlagThreshold] = useState(50);
  const [bottomPerformerThreshold, setBottomPerformerThreshold] = useState(30);

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

  const isRangeValid = () => {
    if (!reportStartDate || !reportEndDate) return false;
    const start = new Date(reportStartDate);
    const end = new Date(reportEndDate);
    if (end < start) return false;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 31;
  };

  const handleGenerateAIInsight = async () => {
    if (!reportStartDate || !reportEndDate) return setToast('Please select date range', 'err');
    
    const start = new Date(reportStartDate);
    const end = new Date(reportEndDate);
    if (end < start) return setToast('End date cannot be earlier than start date', 'err');

    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 31) return setToast('Analysis range limited to 1 month', 'err');

    setIsGeneratingInsight(true);
    setToast('Fetching choreography responses for deep analysis...', 'ok');

    try {
      const dataRes = await fetch(`/api/admin/insights-data?startDate=${reportStartDate}&endDate=${reportEndDate}`);
      if (!dataRes.ok) throw new Error('Data fetch failed');
      const data = await dataRes.json();

      if (!data.sampleResponses || data.sampleResponses.length === 0) {
        throw new Error('No responses found in this range to analyze');
      }

      setToast('AI is analyzing field responses...', 'ok');

      const insightRes = await fetch('/api/admin/generate-insights-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: reportStartDate, endDate: reportEndDate, data })
      });

      if (!insightRes.ok) {
        const errorData = await insightRes.json();
        throw new Error(errorData.details || errorData.error || 'AI Insight generation failed');
      }

      const reportData = await insightRes.json();
      const dateLabel = reportStartDate === reportEndDate ? reportStartDate : `${reportStartDate}_to_${reportEndDate}`;
      generateDeepInsightPDF(reportData, data, dateLabel);
      setToast('MD Strategic Insight Report generated!', 'ok');
    } catch (err: any) {
      console.error('AI Insight error:', err);
      setToast(err.message || 'Failed to generate AI insights', 'err');
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const handleExportUnifiedUptick = async () => {
    setIsExportingUptick(true);
    setToast(`Generating Unified Uptick Trend Report...`, 'ok');
    try {
      const start = new Date(reportStartDate);
      const end = new Date(reportEndDate);
      if (end < start) throw new Error('End date cannot be earlier than start date');
      
      const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 31) throw new Error('Export range limited to 1 month');

      const response = await fetch(`/api/admin/export-uptick-report?startDate=${reportStartDate}&endDate=${reportEndDate}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Unified_Uptick_${reportStartDate}_to_${reportEndDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      setToast(`Unified Uptick Report downloaded!`, 'ok');
    } catch (err: any) {
      setToast(err.message || 'Export failed', 'err');
    } finally {
      setIsExportingUptick(false);
    }
  };

  const generateDeepInsightPDF = (report: any, rawData: any, date: string) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Brand Colors (as tuples for TS)
    const NAVY: [number, number, number] = [26, 42, 74];
    const RED: [number, number, number] = [200, 16, 46];
    const GOLD: [number, number, number] = [184, 134, 11];
    const SLATE: [number, number, number] = [100, 116, 139];

    const addFooter = (pageNum: number, totalPages: number) => {
      doc.setPage(pageNum);
      doc.setFillColor(248, 250, 252);
      doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
      doc.setFontSize(8);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      doc.text(`Choreography Analysis for Tata AIA | Confidential | Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 7, { align: 'center' });
    };

    // PAGE 1: COVER PAGE
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Vertical Accent Line (Gold)
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(15, 0, 2, pageHeight, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(36);
    doc.setFont("helvetica", "bold");
    doc.text("DAILY", 30, pageHeight / 2 - 40);
    doc.text("CHOREOGRAPHY", 30, pageHeight / 2 - 25);
    
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.setFontSize(24);
    doc.text("LEADERSHIP REPORT", 30, pageHeight / 2 - 5);
    
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1);
    doc.line(30, pageHeight / 2 + 5, 120, pageHeight / 2 + 5);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`REPORTING DATE: ${date}`, 30, pageHeight / 2 + 20);
    doc.text(`GENERATED ON: ${new Date().toLocaleString('en-IN')}`, 30, pageHeight / 2 + 30);
    
    doc.setFontSize(10);
    doc.text("PREPARED FOR: TATA AIA DSF CHANNEL", 30, pageHeight - 30);

    let currentY = 25;

    // PAGE 2: EXECUTIVE SUMMARY & SENTIMENT
    doc.addPage();
    currentY = 25;
    
    // Title
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(15, currentY - 5, pageWidth - 30, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("EXECUTIVE OVERVIEW", 20, currentY + 3);
    
    currentY += 20;

    // Daily Topics at Top
    if (rawData.topics) {
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.setFontSize(10);
      doc.text("DAILY CHOREOGRAPHY TOPICS:", 15, currentY);
      currentY += 6;
      doc.setFontSize(9);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      Object.entries(rawData.topics).forEach(([lvl, topic]: [string, any]) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${lvl}:`, 15, currentY);
        doc.setFont("helvetica", "normal");
        doc.text(`${topic}`, 45, currentY);
        currentY += 5;
      });
      currentY += 10;
    }

    // Narrative Summary
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const summaryLines = doc.splitTextToSize(report.executive_summary || "No summary available.", pageWidth - 30);
    doc.text(summaryLines, 15, currentY);
    currentY += (summaryLines.length * 6) + 15;

    // Sentiment Index Section
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(15, currentY, pageWidth - 30, 35, 3, 3, 'F');
    
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.setFontSize(12);
    doc.text("FIELD SENTIMENT INDEX", 25, currentY + 12);
    
    const sentimentScore = report.sentiment?.index || 0;
    doc.setDrawColor(SLATE[0], SLATE[1], SLATE[2]);
    doc.rect(25, currentY + 18, 100, 6, 'S');
    doc.setFillColor(sentimentScore > 70 ? 34 : sentimentScore > 40 ? 245 : 220, sentimentScore > 70 ? 197 : sentimentScore > 40 ? 158 : 38, sentimentScore > 70 ? 94 : sentimentScore > 40 ? 11 : 38);
    doc.rect(25, currentY + 18, sentimentScore, 6, 'F');
    
    doc.setFontSize(24);
    doc.text(`${sentimentScore}`, 135, currentY + 18);
    doc.setFontSize(10);
    doc.text("/ 100", 153, currentY + 18);
    
    doc.setFontSize(9);
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    const sentimentComm = doc.splitTextToSize(report.sentiment?.commentary || "", pageWidth - 50);
    doc.text(sentimentComm, 25, currentY + 28);
    
    currentY += 50;
    
    // Bottom Performers Analysis
    if (report.bottom_performers_analysis) {
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(15, currentY, pageWidth - 30, 35, 3, 3, 'F');
      
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("LAGGING CLUSTERS & PROFILES", 25, currentY + 10);
      
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const botComm = doc.splitTextToSize(report.bottom_performers_analysis.commentary || "", pageWidth - 50);
      doc.text(botComm, 25, currentY + 16);
      
      doc.setFont("helvetica", "bold");
      doc.text("Focus Profiles:", 25, currentY + 28);
      doc.setFont("helvetica", "normal");
      doc.text((report.bottom_performers_analysis.top_red_flag_names || []).join(", "), 55, currentY + 28);
      
      currentY += 50;
    }

    // Operational Health Grid
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setFontSize(12);
    doc.text("OPERATIONAL HEALTH COMMENTARY", 15, currentY);
    
    const healthData = [
      ["Coaching Adoption", report.operational_health?.coaching_adoption || "N/A"],
      ["Field Discipline", report.operational_health?.discipline || "N/A"],
      ["Governance Maturity", report.operational_health?.governance || "N/A"]
    ];

    autoTable(doc, {
      startY: currentY + 5,
      head: [['Metric', 'AI Strategic Assessment']],
      body: healthData,
      theme: 'striped',
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
    });

    // PAGE 3: DETAILED HIERARCHY ANALYTICS
    doc.addPage();
    currentY = 25;
    
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(15, currentY - 5, pageWidth - 30, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text("ZH / ZSM LEVEL COMPLETION BREAKDOWN", 20, currentY + 3);
    
    currentY += 15;
    
    // ZH Table
    if (rawData.stats?.groupedStats?.zh) {
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.setFontSize(11);
      doc.text("ZONAL HEAD (ZH) COMPLETION METRICS", 15, currentY);
      currentY += 5;

      const zhTable = Object.values(rawData.stats.groupedStats.zh).map((zh: any) => [
        zh.name,
        `${zh.rm.done}/${zh.rm.total}`,
        `${zh.sm.done}/${zh.sm.total}`,
        `${zh.asm.done}/${zh.asm.total}`,
        `${(zh.rm.total > 0 ? (zh.rm.done/zh.rm.total)*100 : 0).toFixed(0)}%`
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['ZH Name', 'RMs Done', 'SMs Done', 'ASMs Done', 'RM %']],
        body: zhTable,
        theme: 'grid',
        headStyles: { fillColor: NAVY, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        columnStyles: { 4: { fontStyle: 'bold', textColor: RED } }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    // ZSM Table
    if (rawData.stats?.groupedStats?.zsm) {
      if (currentY > 230) { doc.addPage(); currentY = 25; }
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.setFontSize(11);
      doc.text("ZONAL SALES MANAGER (ZSM) COMPLETION METRICS", 15, currentY);
      currentY += 5;

      const zsmTable = Object.values(rawData.stats.groupedStats.zsm).map((zsm: any) => [
        zsm.name,
        `${zsm.rm.done}/${zsm.rm.total}`,
        `${zsm.sm.done}/${zsm.sm.total}`,
        `${zsm.asm.done}/${zsm.asm.total}`,
        `${(zsm.rm.total > 0 ? (zsm.rm.done/zsm.rm.total)*100 : 0).toFixed(0)}%`
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['ZSM Name', 'RMs Done', 'SMs Done', 'ASMs Done', 'RM %']],
        body: zsmTable,
        theme: 'grid',
        headStyles: { fillColor: GOLD, fontStyle: 'bold' },
        styles: { fontSize: 8 },
        columnStyles: { 4: { fontStyle: 'bold', textColor: RED } }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    // TOPIC & RESPONSE INTELLIGENCE PAGE
    doc.addPage();
    currentY = 25;
    
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(15, currentY - 5, pageWidth - 30, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text("FIELD RESPONSE QUALITY", 20, currentY + 3);
    
    currentY += 15;

    // Field Updates Insight
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15, currentY, pageWidth - 30, 30, 2, 2, 'F');
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("FIELD UPDATE QUALITY ASSESSMENT", 20, currentY + 10);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const fuInsight = doc.splitTextToSize(report.response_intelligence?.field_updates_insight || "Data synthesis in progress...", pageWidth - 40);
    doc.text(fuInsight, 20, currentY + 18);
    
    currentY += 40;

    // Topic Intelligence
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setFontSize(12);
    doc.text("CHOREOGRAPHY & TOPIC ALIGNMENT", 15, currentY);
    
    const topicData = [
      ["RM-SM Interaction", report.topic_intelligence?.rm_sm || "N/A"],
      ["SM-ASM Interaction", report.topic_intelligence?.sm_asm || "N/A"],
      ["ASM-ZSH Interaction", report.topic_intelligence?.asm_zsh || "N/A"]
    ];

    autoTable(doc, {
      startY: currentY + 5,
      body: topicData,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40, fillColor: [241, 245, 249] } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setFontSize(12);
    doc.text("AI TREND ANALYSIS", 15, currentY);
    currentY += 8;
    doc.setFontSize(9);
    const trendsLines = doc.splitTextToSize(report.response_intelligence?.trends || "", pageWidth - 30);
    doc.text(trendsLines, 15, currentY);
    currentY += (trendsLines.length * 5) + 10;

    doc.setFont("helvetica", "bold");
    doc.text("ANOMALIES / UNUSUAL PATTERNS:", 15, currentY);
    currentY += 6;
    doc.setFont("helvetica", "normal");
    const anomLines = doc.splitTextToSize(report.response_intelligence?.unusual_patterns || "No anomalies detected.", pageWidth - 30);
    doc.text(anomLines, 15, currentY);

    // PAGE 4: STRATEGIC THEME ANALYSIS
    doc.addPage();
    currentY = 25;
    
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(15, currentY - 5, pageWidth - 30, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text("FIELD FEEDBACK THEME EXTRACTION", 20, currentY + 3);
    
    currentY += 15;

    (report.themes || []).forEach((theme: any, idx: number) => {
      if (currentY > 260) { doc.addPage(); currentY = 25; }
      
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(theme.name || "Theme", 15, currentY);
      
      // Theme bar
      const barY = currentY + 2;
      doc.setFillColor(241, 245, 249);
      doc.rect(15, barY, 100, 4, 'F');
      doc.setFillColor(idx % 2 === 0 ? RED[0] : GOLD[0], idx % 2 === 0 ? RED[1] : GOLD[1], idx % 2 === 0 ? RED[2] : GOLD[2]);
      doc.rect(15, barY, theme.percentage || 0, 4, 'F');
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`${theme.percentage}% Occurrence`, 120, barY + 3.5);
      
      currentY += 10;
      doc.setFontSize(9);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      const themeInsight = doc.splitTextToSize(theme.insight || "", pageWidth - 30);
      doc.text(themeInsight, 15, currentY);
      
      currentY += (themeInsight.length * 5) + 10;
    });

    // PAGE 5: RED FLAGS & ACTION PLAN
    doc.addPage();
    currentY = 25;
    
    doc.setFillColor(RED[0], RED[1], RED[2]);
    doc.rect(15, currentY - 5, pageWidth - 30, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text("CRITICAL RED FLAGS & RISKS", 20, currentY + 3);
    
    currentY += 15;
    
    if (report.red_flags && Array.isArray(report.red_flags)) {
      report.red_flags.forEach((flag: any) => {
        doc.setFillColor(flag.severity === 'High' ? 254 : 255, flag.severity === 'High' ? 242 : 251, flag.severity === 'High' ? 242 : 235);
        doc.roundedRect(15, currentY, pageWidth - 30, 15, 2, 2, 'F');
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(flag.severity === 'High' ? RED[0] : 180, flag.severity === 'High' ? RED[1] : 83, flag.severity === 'High' ? RED[2] : 9);
        doc.text(`[${flag.category || 'BLOCKER'}]`, 20, currentY + 6);
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        doc.text(flag.issue || "", 20, currentY + 11);
        currentY += 20;
      });
    }

    currentY += 10;
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(15, currentY - 5, pageWidth - 30, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("RECOMMENDED STRATEGIC ACTION PLAN", 20, currentY + 3);
    
    currentY += 15;

    const actionCols = [
      { t: "IMMEDIATE", data: report.action_plan?.immediate || [] },
      { t: "SHORT-TERM", data: report.action_plan?.short_term || [] },
      { t: "STRATEGIC", data: report.action_plan?.strategic || [] }
    ];

    actionCols.forEach(col => {
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(col.t, 15, currentY);
      currentY += 6;
      
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      col.data.forEach((item: string) => {
        const lines = doc.splitTextToSize(`• ${item}`, pageWidth - 30);
        doc.text(lines, 15, currentY);
        currentY += (lines.length * 5);
      });
      currentY += 5;
    });

    // FIELD INTELLIGENCE
    if (currentY > 180) { doc.addPage(); currentY = 25; } else { currentY += 10; }
    
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(15, currentY - 5, pageWidth - 30, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("RESPONSE TRENDS & INTELLIGENCE", 20, currentY + 3);
    
    currentY += 10;
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const ri = doc.splitTextToSize(report.response_intelligence?.trends || "", pageWidth - 30);
    doc.text(ri, 15, currentY);
    currentY += (ri.length * 5) + 5;
    
    doc.setFont("helvetica", "bold");
    doc.text("ANOMALIES / UNUSUAL PATTERNS:", 15, currentY);
    currentY += 5;
    doc.setFont("helvetica", "normal");
    const anom = doc.splitTextToSize(report.response_intelligence?.unusual_patterns || "No anomalies detected.", pageWidth - 30);
    doc.text(anom, 15, currentY);

    // FINALIZE: Add footers to all pages
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      addFooter(i, totalPages);
    }

    doc.save(`TataAIA_StrategicReport_${date}.pdf`);
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
        {/* Questionnaire Update */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <FileText size={20} className="text-brand-blue" />
            <h3 className="font-bold text-brand-navy">Questionnaire Update</h3>
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

        {/* Hierarchy Sync */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Users size={20} className="text-brand-blue" />
            <h3 className="font-bold text-brand-navy">DSF Hierarchy Sync</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload the DSF Master Dump to update user mappings and hierarchies.
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

        {/* Data Audit & Exports */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Database size={20} className="text-brand-blue" />
            <h3 className="font-bold text-brand-navy">Data Audit & Exports</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => handleExport('submissions')} className="flex flex-col items-center justify-center p-6 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 group">
              <Download size={20} className="text-slate-400 group-hover:text-brand-blue" />
              <p className="text-sm font-bold text-brand-navy">Submissions</p>
            </button>
            <button onClick={() => handleExport('responses')} className="flex flex-col items-center justify-center p-6 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 group">
              <Download size={20} className="text-slate-400 group-hover:text-brand-blue" />
              <p className="text-sm font-bold text-brand-navy">Responses</p>
            </button>
            <button onClick={() => handleExport('questions')} className="flex flex-col items-center justify-center p-6 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 group">
              <Download size={20} className="text-slate-400 group-hover:text-brand-blue" />
              <p className="text-sm font-bold text-brand-navy">Questions</p>
            </button>
            <button onClick={() => handleExport('users')} className="flex flex-col items-center justify-center p-6 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 group">
              <Download size={20} className="text-slate-400 group-hover:text-brand-blue" />
              <p className="text-sm font-bold text-brand-navy">Users List</p>
            </button>
          </div>
        </div>

        {/* Submission Window */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Clock size={20} className="text-brand-blue" />
            <h3 className="font-bold text-brand-navy">Submission Window</h3>
          </div>
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Set the universal start and end times for check-in submissions.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Start Time (IST)</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">End Time (IST)</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20" />
              </div>
            </div>
            <button onClick={handleUpdateSettings} disabled={isSavingSettings} className="w-full bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all">
              <ShieldCheck size={18} />
              {isSavingSettings ? 'Saving...' : 'Apply Universal Timer'}
            </button>
          </div>
        </div>

        {/* MD Strategic Insights & Performance Export */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-premium">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles size={20} className="text-amber-500" />
            <div className="flex-1 flex items-center justify-between">
              <h3 className="font-bold text-brand-navy">Strategic Insights & Exports</h3>
              <button 
                onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                className="p-1 hover:bg-slate-50 rounded-md transition-colors text-slate-400 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
              >
                {isConfigExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {isConfigExpanded ? "Hide Config" : "Analysis Config"}
              </button>
            </div>
          </div>
          
          <div className="space-y-6">
            {isConfigExpanded && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="overflow-hidden border-b border-slate-100 pb-6 space-y-6"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Red Flag Threshold (%)</label>
                    <input
                      type="number"
                      value={redFlagThreshold}
                      onChange={(e) => setRedFlagThreshold(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bottom Performer (%)</label>
                    <input
                      type="number"
                      value={bottomPerformerThreshold}
                      onChange={(e) => setBottomPerformerThreshold(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-brand-navy uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={14} className="text-brand-blue" />
                  Select Analysis Range
                </p>
                {!isRangeValid() && reportStartDate && reportEndDate && (
                  <div className="px-2 py-0.5 bg-red-100 rounded text-red-600 text-[9px] font-bold">
                    Max 31 Days
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">From Date</label>
                  <input
                    type="date"
                    max={formatToday()}
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">To Date</label>
                  <input
                    type="date"
                    max={formatToday()}
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={handleGenerateAIInsight}
                disabled={isGeneratingInsight || !isRangeValid()}
                className="w-full bg-[#ff980a] hover:bg-[#e68a00] text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-sm disabled:opacity-50"
              >
                {isGeneratingInsight ? <Clock className="animate-spin" size={20} /> : <FileDown size={20} />}
                <div className="text-left">
                  <p className="text-sm">Generate Insight Report</p>
                  <p className="text-[10px] font-normal opacity-70">AI analysis of selected range</p>
                </div>
              </button>

              <button
                onClick={handleExportUnifiedUptick}
                disabled={isExportingUptick || !isRangeValid()}
                className="w-full bg-brand-blue/5 hover:bg-brand-blue/10 text-brand-blue border border-brand-blue/10 font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isExportingUptick ? <Clock className="animate-spin" size={20} /> : <Download size={20} />}
                <div className="text-left">
                  <p className="text-sm">Uptick Trend Export</p>
                  <p className="text-[10px] font-normal opacity-70">ZH & ZSM Adoption + Day-wise metrics</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-red-50 rounded-xl border border-red-100 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Database size={20} className="text-red-500" />
            <h3 className="font-bold text-brand-navy">Data Management</h3>
          </div>
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed italic">
              Careful: Permanently remove questions for a date.
            </p>
            <div className="flex gap-2">
              <input type="date" min={formatToday()} value={clearDate} onChange={(e) => setClearDate(e.target.value)} className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-200" />
              <button onClick={handleClearQuestions} disabled={isDeleting || !clearDate} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold px-6 rounded-lg text-sm transition-colors">
                {isDeleting ? 'Deleting...' : 'Clear Questions'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
