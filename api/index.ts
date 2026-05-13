import express from "express";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import multer from 'multer';
import Papa from 'papaparse';

import https from "https";

dotenv.config();

const router = express.Router();
const upload = multer();

// Note: No need for router.use(express.json()) here if server.ts already has it, 
// but it doesn't hurt.
router.use((req, res, next) => {
  console.log(`[API DEBUG] ${req.method} ${req.path}`);
  next();
});

// Health Check
router.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// Supabase Initialization
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://jmrxdxoouuwnjsengrda.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptcnhkeG9vdXV3bmpzZW5ncmRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTk3MzQsImV4cCI6MjA5Mzk3NTczNH0.ALBiY3OhChenX4b17ulXMp_rBff5yUmSewWfqoIGQ7w";
const supabase = createClient(supabaseUrl, supabaseKey);

const getFormattedDateDDMMYY = (dateObj: Date) => {
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yy = String(dateObj.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

// --- HELPERS ---
async function getDailyTopicFallback(day: string) {
  try {
    const { data } = await supabase
      .from('questions')
      .select('topic')
      .eq('day', day)
      .limit(1);
    return data?.[0]?.topic || null;
  } catch (err) {
    return null;
  }
}

async function fetchLargeTable(tableName: string, columns: string = '*', queryModifier?: (query: any) => any) {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(tableName).select(columns).range(from, from + step - 1);
    if (queryModifier) {
      query = queryModifier(query);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data);
      if (data.length < step) {
        hasMore = false;
      } else {
        from += step;
      }
    }
  }
  return allData;
}

async function getFullTeam(managerId: string) {
  try {
    // Optimization: Only fetch columns needed for hierarchy mapping
    const allUsers = await fetchLargeTable('users', 'user_id, manager_id, name, role');
    if (!allUsers) return [];

    const cleanId = (id: any) => String(id || "").trim();

    // Build adjacency list for O(1) traversal
    const childrenMap = new Map<string, any[]>();
    allUsers.forEach(u => {
      const mid = cleanId(u.manager_id);
      if (mid && mid !== "null" && mid !== "undefined" && mid !== "0") {
        if (!childrenMap.has(mid)) childrenMap.set(mid, []);
        childrenMap.get(mid)!.push(u);
      }
    });

    const descendants: any[] = [];
    const queue = [cleanId(managerId)];
    const processed = new Set();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (processed.has(currentId)) continue;
      processed.add(currentId);

      const reports = childrenMap.get(currentId) || [];
      for (const r of reports) {
        descendants.push(r);
        queue.push(cleanId(r.user_id));
      }
    }

    const mid = cleanId(managerId);
    return descendants.filter(u => cleanId(u.user_id) !== mid);
  } catch (err) {
    console.error("getFullTeam error:", err);
    return [];
  }
}

// --- SETTINGS HELPERS ---
async function getSettings() {
  const { data, error } = await supabase.from('app_settings').select('*');
  if (error) return {};
  const settings: Record<string, any> = {};
  data.forEach(s => {
    settings[s.key] = s.value;
  });
  return settings;
}

// --- API ROUTES ---

router.get("/settings", async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.post("/admin/settings", async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: "Invalid settings" });
  
  try {
    const entries = Object.entries(settings).map(([key, value]) => ({ key, value }));
    const { error } = await supabase.from('app_settings').upsert(entries, { onConflict: 'key' });
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    // Explicitly log known database error properties if they exist
    const dbError = {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint,
      stack: err.stack
    };
    console.error("Settings update error full details:", dbError);
    res.status(500).json({ 
      error: "Failed to update settings", 
      details: err.message || dbError.details || JSON.stringify(err)
    });
  }
});

router.post("/auth/login", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "User ID required" });
  const { data, error } = await supabase.from('users').select('*').eq('user_id', userId).single();
  if (error || !data) return res.status(401).json({ error: "Invalid credentials" });
  res.json(data);
});

router.get("/dashboard", async (req, res) => {
  const { smId, date, day } = req.query;
  const todayDb = (date as string) || new Date().toISOString().split('T')[0];
  const todayFormatted = (day as string) || getFormattedDateDDMMYY(new Date());

  // Determine level
  const { data: userData } = await supabase.from('users').select('role').eq('user_id', smId as string).single();
  const role = (userData?.role || "").toUpperCase();
  const isHeadLevel = role === 'HO' || role === 'HEAD';
  const isZHLevel = role === 'ZH';
  const isZSMLevel = role === 'ZSM';
  const isASMLevel = role === 'ASM' || role === 'BM' || role === 'ZM' || role.includes('MANAGER');
  
  let level = 'RM-SM';
  if (isHeadLevel) {
    level = 'ZH-Head';
  } else if (isZHLevel) {
    level = 'ZSM-ZH';
  } else if (isZSMLevel) {
    level = 'ASM-ZSM';
  } else if (isASMLevel) {
    level = 'SM-ASM';
  }

  const isSM = role === 'SM';
  const teamPromise = isSM 
    ? getFullTeam(smId as string) 
    : fetchLargeTable('users', '*', (q: any) => q.eq('manager_id', smId as string));

  const [team, subRes, qRes] = await Promise.all([
    teamPromise,
    supabase.from('submissions').select('target_user, status').eq('user_id', smId as string).eq('date', todayDb),
    supabase.from('questions').select('*').ilike('level', level).eq('day', todayFormatted).order('question_id', { ascending: true })
  ]);
  
  const uniqueTopicLevels = Array.from(new Set(qRes.data?.map(q => `${q.topic} (${q.level})`).filter(t => !t.startsWith('undefined') && !t.startsWith('null'))));
  const topic = uniqueTopicLevels.length > 0 ? uniqueTopicLevels.join(' | ') : await getDailyTopicFallback(todayFormatted);
  res.json({ team: team || [], submissions: subRes.data || [], questions: qRes.data || [], topic });
});

router.get("/form", async (req, res) => {
  const { smId, rmId, date, day } = req.query;
  if (!rmId) return res.status(400).json({ error: "Target ID required" });

  // 1. Get the role of the target user (rmId) to determine question set
  const { data: targetData } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', rmId)
    .single();

  const targetRole = (targetData?.role || "").toUpperCase();
  
  let level = 'RM-SM';
  if (targetRole === 'RM') {
    level = 'RM-SM';
  } else if (targetRole === 'SM') {
    level = 'SM-ASM';
  } else if (targetRole === 'ASM') {
    level = 'ASM-ZSM';
  } else if (targetRole === 'ZSM') {
    level = 'ZSM-ZH';
  } else if (targetRole === 'ZH') {
    level = 'ZH-Head';
  } else if (['HO', 'HEAD'].includes(targetRole)) {
    level = 'ZH-Head';
  } else {
    // Falls back to manager logic
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('user_id', smId)
      .single();
    const mgrRole = (userData?.role || "").toUpperCase();
    const isHeadLevel = mgrRole === 'HO' || mgrRole === 'HEAD';
    const isZHLevel = mgrRole === 'ZH';
    const isZSMLevel = mgrRole === 'ZSM';
    const isASMLevel = mgrRole === 'ASM' || mgrRole === 'BM' || mgrRole === 'ZM' || mgrRole.includes('MANAGER');
    
    if (isHeadLevel) {
      level = 'ZH-Head';
    } else if (isZHLevel) {
      level = 'ZSM-ZH';
    } else if (isZSMLevel) {
      level = 'ASM-ZSM';
    } else if (isASMLevel) {
      level = 'SM-ASM';
    }
  }

  const [subRes, qRes, respRes] = await Promise.all([
    supabase.from('submissions').select('status').eq('user_id', smId).eq('target_user', rmId).eq('date', date).single(),
    supabase.from('questions').select('*').ilike('level', level).eq('day', day).order('question_id', { ascending: true }),
    supabase.from('responses').select('question_id, answer').eq('filled_by', smId).eq('target_user', rmId).eq('date', date)
  ]);
  res.json({ submission: subRes.data, questions: qRes.data || [], responses: respRes.data || [] });
});

router.post("/form/submit", async (req, res) => {
  const { smId, rmId, date, status, responses, level, topic } = req.body;
  
  try {
    // Universal Timer Validation
    const settings = await getSettings();
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
      
      // Handle 12:00 AM (00:00) as end of day if it's smaller than start time
      if (endTotal <= startTotal && endTotal === 0) {
        endTotal = 24 * 60;
      }
      
      if (nowTotal < startTotal || nowTotal > endTotal) {
        return res.status(403).json({ 
          error: `Submission window restricted to ${settings.start_time} - ${settings.end_time} IST.`,
          isTimeBlocked: true 
        });
      }
    }

    await supabase.from('responses').delete().eq('filled_by', smId).eq('target_user', rmId).eq('date', date);
    await supabase.from('submissions').delete().eq('user_id', smId).eq('target_user', rmId).eq('date', date);
    
    if (responses && responses.length > 0) {
      const { error: resErr } = await supabase.from('responses').insert(responses);
      if (resErr) {
        console.error("Responses insert error:", JSON.stringify(resErr));
        // If responses table missing columns, try inserting without level/topic
        const stripped = responses.map(({ level, topic, ...rest }: any) => rest);
        await supabase.from('responses').insert(stripped);
      }
    }
    
    const { error: subErr } = await supabase.from('submissions').insert([{ date, user_id: smId, target_user: rmId, status, level, topic }]);
    if (subErr) {
      console.error("Submissions insert error:", JSON.stringify(subErr));
      // Fallback: insert without level/topic if columns missing
      await supabase.from('submissions').insert([{ date, user_id: smId, target_user: rmId, status }]);
    }

    res.json({ success: true });
  } catch (err: any) { 
    console.error("Submission crash:", JSON.stringify(err));
    res.status(500).json({ error: "Submission failed" }); 
  }
});

router.get("/history", async (req, res) => {
  const { smId, date } = req.query;
  let anchor = new Date();
  if (date) {
    const [y, m, d] = (date as string).split('-').map(Number);
    anchor = new Date(y, m - 1, d);
  }

  const pastDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor); 
    d.setDate(d.getDate() - (i + 1));
    return { db: d.toISOString().split('T')[0], display: getFormattedDateDDMMYY(d) };
  });

  // Determine level
  const { data: userData } = await supabase.from('users').select('role').eq('user_id', smId).single();
  const role = (userData?.role || "").toUpperCase();
  const isHeadLevel = role === 'HO' || role === 'HEAD';
  const isZHLevel = role === 'ZH';
  const isZSMLevel = role === 'ZSM';
  const isASMLevel = role === 'ASM' || role === 'BM' || role === 'ZM' || role.includes('MANAGER');
  
  let level = 'RM-SM';
  if (isHeadLevel) {
    level = 'ZH-Head';
  } else if (isZHLevel) {
    level = 'ZSM-ZH';
  } else if (isZSMLevel) {
    level = 'ASM-ZSM';
  } else if (isASMLevel) {
    level = 'SM-ASM';
  }

  const dbDates = pastDays.map(d => d.db);
  const csvDates = pastDays.map(d => d.display);
  const [subRes, qRes, fallbacks] = await Promise.all([
    fetchLargeTable('submissions', '*', (q: any) => q.eq('user_id', smId).in('date', dbDates)),
    supabase.from('questions').select('day, topic').ilike('level', level).in('day', csvDates).order('question_id', { ascending: true }),
    supabase.from('questions').select('day, topic').in('day', csvDates)
  ]);
  
  // Merge questions from specific level with fallbacks for those days that have no specific level questions
  const questions = qRes.data || [];
  const fallbackData = fallbacks.data || [];
  
  // Ensure every day in csvDates that has ANY question in the system gets a topic in the response
  const finalQuestions = [...questions];
  csvDates.forEach(day => {
    if (!finalQuestions.find(q => q.day === day)) {
      const fb = fallbackData.find(f => f.day === day);
      if (fb) {
        finalQuestions.push({ day, topic: fb.topic });
      }
    }
  });

  res.json({ pastDays, submissions: subRes || [], questions: finalQuestions });
});

router.post("/admin/upload", upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  
  try {
    const csvData = req.file.buffer.toString();
    const results = Papa.parse(csvData, { 
      header: true, 
      skipEmptyLines: true,
      trimHeaders: true 
    });
    
    // Dynamically detect DB columns to handle schema variations (underscore vs space etc)
    const { data: sample } = await supabase.from('questions').select('*').limit(1);
    const dbKeys = sample && sample.length > 0 ? Object.keys(sample[0]) : [
      'question_id', 'topic', 'question_text', 'day', 'level', 'type', 
      'option_1', 'option_2', 'option_3', 'option_4', 'option_5'
    ];

    const normalizedData = results.data.map((row: any) => {
      const getVal = (keys: string[]) => {
        const foundKey = Object.keys(row).find(k => keys.includes(k.trim().toUpperCase()));
        return foundKey ? String(row[foundKey] || "").trim() : null;
      };

      const findDbKey = (keys: string[]) => {
        return dbKeys.find(k => keys.includes(k.trim().toUpperCase()));
      };

      const result: any = {};
      
      // Mandatory mappings
      const qIdKey = findDbKey(['QUESTION_ID']) || 'question_id';
      result[qIdKey] = getVal(['QUESTION_ID']);

      const topicKey = findDbKey(['TOPIC']) || 'topic';
      result[topicKey] = getVal(['TOPIC']);

      const qTextKey = findDbKey(['QUESTION_TEXT', 'QUESTION']) || 'question_text';
      result[qTextKey] = getVal(['QUESTION_TEXT', 'QUESTION']);

      const dayKey = findDbKey(['DAY', 'DATE']) || 'day';
      result[dayKey] = getVal(['DAY', 'DATE']);

      let rawLevel = getVal(['LEVEL']) || "";
      let rawType = getVal(['TYPE']) || "";

      // Smart Swapping Logic
      const typeKeywords = ['NUMBER', 'TEXT', 'DROP-DOWN', 'MULTI-SELECT', 'DROPDOWN'];
      const isLevelType = typeKeywords.includes(rawLevel.toUpperCase());
      if (isLevelType && rawType) {
        const temp = rawLevel;
        rawLevel = rawType;
        rawType = temp;
      }

      const levelKey = findDbKey(['LEVEL']) || 'level';
      result[levelKey] = (rawLevel || "").replace(/_/g, '-');

      const typeKey = findDbKey(['TYPE']) || 'type';
      result[typeKey] = rawType || "Text";

      // Map options
      for (let i = 1; i <= 5; i++) {
        const oKey = findDbKey([`OPTION_${i}`, `OPTION ${i}`, `OPT_${i}`, `OPT${i}`]);
        if (oKey) {
          result[oKey] = getVal([`OPTION_${i}`, `OPTION ${i}`, `OPT_${i}`, `OPT${i}`]) || "";
        }
      }

      return result;
    }).filter((r: any) => {
      const qIdKey = Object.keys(r).find(k => k.toLowerCase().includes('question_id'));
      const dayKey = Object.keys(r).find(k => k.toLowerCase().includes('day') || k.toLowerCase().includes('date'));
      return qIdKey && r[qIdKey] && dayKey && r[dayKey];
    });

    if (normalizedData.length === 0) {
      return res.status(400).json({ error: "No valid rows found in CSV. Check QUESTION_ID and DAY columns." });
    }

    const { error } = await supabase.from('questions').upsert(normalizedData, { onConflict: 'question_id' });
    if (error) {
      console.error("Supabase Questions Upsert Error details:", JSON.stringify(error, null, 2));
      throw error;
    }
    res.json({ success: true, count: normalizedData.length });
  } catch (err: any) {
    console.error("Question upload failure details:", err);
    res.status(500).json({ 
      error: "Database update failed", 
      details: err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
    });
  }
});

router.post("/admin/upload-hierarchy", upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  
  try {
    const csvData = req.file.buffer.toString();
    const results = Papa.parse(csvData, { header: true, skipEmptyLines: true, dynamicTyping: false });
    
    if (!results.data || results.data.length === 0) {
      return res.status(400).json({ error: "Empty or invalid CSV file" });
    }

    // 1. Fetch designation mapping from Supabase
    const { data: mappings } = await supabase.from('designation_mapping').select('*');
    const mappingMap = new Map();
    if (mappings) {
      mappings.forEach((m: any) => {
        mappingMap.set(String(m.dsf_designation || "").trim().toUpperCase(), m.app_role);
      });
    }

    // Local hardcoded fallback for common Tata AIA terms if mappings are missing
    const getMappedRole = (rawDesignation: string, name: string) => {
      const clean = rawDesignation.trim().toUpperCase();
      const upperName = (name || "").toUpperCase();

      if (mappingMap.has(clean)) return mappingMap.get(clean);
      
      // Strict mapping based on user sheet
      if (clean.includes('DISTRIBUTION STRATEGY') || 
          clean.includes('STRATEGY AND INITIATIVE') ||
          clean.includes('VICE PRESIDENT')) return 'HO';
          
      if (clean.includes('HEAD - DIRECT DISTRIBUTION')) return 'Head';
      
      if (clean.includes('NATIONAL HEAD') || clean.includes('SENIOR DIRECTOR')) return 'ZH';
      
      if (clean.includes('DEPUTY DIRECTOR') || 
          clean.includes('DIRECTOR OF DSF') || 
          clean.includes('ZONAL SALES HEAD') || 
          clean.includes('ZONAL SALES MANAGER')) return 'ZSM';
          
      if (clean.includes('AREA SALES MANAGER') || 
          clean.includes('ASSOCIATE DIRECTOR') || 
          clean.includes('CIRCLE HEAD') || 
          clean.includes('REGIONAL SALES MANAGER')) return 'ASM';
          
      if (clean.includes('ASSOCIATE CIRCLE HEAD') || 
          clean.includes('BRANCH HEAD') || 
          clean.includes('SALES MANAGER - DIRECT DIGITAL') || 
          clean.includes('SALES MANAGER - DSF NON SOURCING')) return 'SM';
          
      if (clean.includes('RELATIONSHIP MANAGER') || 
          clean.includes('SALES MANAGER - DSF SOURCING')) return 'RM';
          
      if (clean === 'MANAGEMENT TRAINEE') return 'MT';
      if (clean === 'MANAGING DIRECTOR AND CHIEF EXECUTIVE OFFICER') return 'MD';
      
      return 'RM'; // Default to RM for unknown field designations
    };

    // 2. Transform DSF Dump to application schema
    const uniqueUsersMap = new Map();
    
    results.data.forEach((row: any) => {
      const getVal = (key: string) => {
        const foundKey = Object.keys(row).find(k => k.trim().toUpperCase() === key.toUpperCase());
        return foundKey ? String(row[foundKey] || "").trim() : null;
      };

      const empCode = getVal('EMP_CODE');
      const supervisorId = getVal('SUPERVISOR_ID');
      const subFunction = (getVal('SUBFUNCTION') || "").toUpperCase();
      const designation = getVal('DESIGNATION') || "";
      const empName = getVal('EMP_NAME') || '';
      
      // Filter: Only keep users where SUBFUNCTION is "Direct Sales Force"
      if (!empCode || subFunction !== "DIRECT SALES FORCE") return;

      uniqueUsersMap.set(empCode, {
        user_id: empCode,
        name: empName || 'Unknown',
        role: getMappedRole(designation, empName),
        manager_id: (supervisorId && supervisorId !== "0" && supervisorId !== empCode) ? supervisorId : null,
      });
    });

    const usersToUpsert = Array.from(uniqueUsersMap.values());

    if (usersToUpsert.length === 0) {
      return res.status(400).json({ error: "No valid 'Direct Sales Force' records found. Check SUBFUNCTION column." });
    }

    // Perform upsert in chunks
    const chunkSize = 100;
    for (let i = 0; i < usersToUpsert.length; i += chunkSize) {
      const chunk = usersToUpsert.slice(i, i + chunkSize);
      const { error } = await supabase.from('users').upsert(chunk, { onConflict: 'user_id' });
      if (error) throw error;
    }

    // Save sync timestamp
    await supabase.from('app_settings').upsert({ 
      key: 'last_hierarchy_sync', 
      value: new Date().toISOString() 
    }, { onConflict: 'key' });

    res.json({ success: true, count: usersToUpsert.length });
  } catch (err: any) {
    console.error("Hierarchy upload crash:", err);
    res.status(500).json({ error: err.message || "Failed to process hierarchy dump" });
  }
});

router.post("/admin/clear-questions", async (req, res) => {
  const { day } = req.body;
  if (!day) return res.status(400).json({ error: "Day required" });
  try {
    const { error } = await supabase.from('questions').delete().eq('day', day);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear questions" });
  }
});

router.get("/admin/export", async (req, res) => {
  const { table } = req.query;
  try {
    const data = await fetchLargeTable(table as string);
    if (!data || data.length === 0) return res.json([]);

    // Reorder keys based on table type for better CSV visibility
    const reordered = data.map(item => {
      let order: string[] = [];
      if (table === 'responses') {
        order = ['id', 'date', 'created_at', 'filled_by', 'target_user', 'level', 'topic', 'question_id', 'question', 'answer'];
      } else if (table === 'questions') {
        order = ['question_id', 'day', 'level', 'topic', 'type', 'question', 'option_1', 'option_2', 'option_3', 'option_4', 'option_5'];
      } else if (table === 'submissions') {
        order = ['id', 'date', 'created_at', 'user_id', 'target_user', 'status', 'level', 'topic'];
      } else if (table === 'users') {
        order = ['user_id', 'name', 'role', 'manager_id', 'created_at'];
      }

      if (order.length === 0) return item;

      const result: any = {};
      // 1. Put keys from "order" list first (if they exist)
      order.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          result[key] = item[key];
        }
      });
      // 2. Add remaining keys that were not in the order list
      Object.keys(item).forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(result, key)) {
          result[key] = item[key];
        }
      });
      return result;
    });

    res.json(reordered);
  } catch (err) {
    console.error("Export error full details:", JSON.stringify(err, null, 2));
    res.status(500).json({ error: "Fetch failed" });
  }
});

router.get("/admin/questions-stats", async (req, res) => {
  try {
    // We only need the day column
    const { data, error } = await supabase.from('questions').select('day');
    if (error) throw error;
    if (!data || data.length === 0) return res.json({ lastDate: null });

    const uniqueDays = Array.from(new Set(data.map(d => d.day)));
    
    // Parse DD/MM/YY to find latest
    const parsedDates = uniqueDays.map(d => {
      const parts = d.split('/');
      if (parts.length !== 3) return null;
      const [day, month, year] = parts.map(Number);
      // Ensure year is 4 digits
      const fullYear = year < 100 ? 2000 + year : year;
      return { original: d, ts: new Date(fullYear, month - 1, day).getTime() };
    }).filter(Boolean);

    if (parsedDates.length === 0) return res.json({ lastDate: null });

    const last = parsedDates.sort((a, b) => b!.ts - a!.ts)[0];
    res.json({ lastDate: last?.original });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Stats fetch failed" });
  }
});

router.get("/management-dashboard", async (req, res) => {
  const { asmId, date, day } = req.query;
  const todayDb = (date as string) || new Date().toISOString().split('T')[0];

  try {
    // Optimization: Only fetch columns needed for mapping, not everything
    const allUsers = await fetchLargeTable('users', 'user_id, manager_id, name, role');

    const cleanId = (id: any) => String(id || "").trim();
    const cleanRole = (role: any) => String(role || "").trim().toUpperCase();

    // 2. Determine manager role and get appropriate "reports"
    const currentAsmId = cleanId(asmId);
    const mgr = allUsers.find(u => cleanId(u.user_id) === currentAsmId);
    const mgrRole = cleanRole(mgr?.role);
    const isHOorHEAD = mgrRole === 'HO' || mgrRole === 'HEAD';

    // Build Adjacency List for O(1) child lookup
    const childrenMap = new Map<string, any[]>();
    allUsers.forEach(u => {
      const mid = cleanId(u.manager_id);
      if (mid && mid !== "null" && mid !== "undefined" && mid !== "0") {
        if (!childrenMap.has(mid)) childrenMap.set(mid, []);
        childrenMap.get(mid)!.push(u);
      }
    });

    // Strategy for Selecting Row Items (sms)
    // HO/HEAD should see everyone reporting to them, grouped by role as requested.
    let sms = isHOorHEAD 
      ? allUsers.filter(u => {
          const r = cleanRole(u.role);
          const isDirectReport = cleanId(u.manager_id) === currentAsmId;
          // Include all high-level roles + direct reports
          return r === 'ZH' || r === 'ZSM' || isDirectReport;
        })
      : allUsers.filter(u => {
          const isDirectReport = cleanId(u.manager_id) === currentAsmId;
          return isDirectReport;
        });

    // If HO/HEAD ended up with nothing, fallback to direct reports
    if (isHOorHEAD && sms.length === 0) {
      sms = allUsers.filter(u => cleanId(u.manager_id) === currentAsmId);
    }

    // 3. Get all submissions today - Use pagination
    const allTodaySubms = await fetchLargeTable('submissions', '*', (q: any) => q.eq('date', todayDb));

    const submissionSet = new Set(allTodaySubms.map(s => cleanId(s.target_user)));

    // 4. Recursive Agreggator Engine
    const getRMPerformanceForBranch = (parentId: string) => {
      const rmList: any[] = [];
      const queue = [cleanId(parentId)];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const cid = queue.shift()!;
        if (visited.has(cid)) continue;
        visited.add(cid);

        const children = childrenMap.get(cid) || [];
        for (const child of children) {
          if (cleanRole(child.role) === 'RM') {
            rmList.push(child);
          }
          // Always recurse for all children to find RMs deeper in the tree
          queue.push(cleanId(child.user_id));
        }
      }
      
      const totalRMs = rmList.length;
      const completedRMs = rmList.filter(rm => submissionSet.has(cleanId(rm.user_id))).length;
      
      return { totalRMs, completedRMs };
    };

    // 5. Map performance statistics using optimized engine
    const performance = sms.map(sm => {
      const stats = getRMPerformanceForBranch(sm.user_id);
      
      return {
        smId: sm.user_id,
        smName: sm.name,
        smRole: sm.role,
        totalRMs: stats.totalRMs,
        completedRMs: stats.completedRMs,
        pendingRMs: Math.max(0, stats.totalRMs - stats.completedRMs)
      };
    });

    const { data: ownSubmissions, error: ownSubError } = await supabase
      .from('submissions')
      .select('target_user, status')
      .eq('user_id', asmId)
      .eq('date', todayDb);

    if (ownSubError) throw ownSubError;

    // Determine level based on the manager's role
    const isHeadLevel = mgrRole === 'HO' || mgrRole === 'HEAD';
    const isZHLevel = mgrRole === 'ZH';
    const isZSMLevel = mgrRole === 'ZSM';
    const isASMLevel = mgrRole === 'ASM' || mgrRole === 'BM' || mgrRole === 'ZM' || mgrRole.includes('MANAGER');
    
    let level = 'RM-SM';
    if (isHeadLevel) {
      level = 'ZH-Head';
    } else if (isZHLevel) {
      level = 'ZSM-ZH';
    } else if (isZSMLevel) {
      level = 'ASM-ZSM';
    } else if (isASMLevel) {
      level = 'SM-ASM';
    }

    const todayFormatted = (day as string) || getFormattedDateDDMMYY(new Date());
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('*')
      .eq('day', todayFormatted)
      .order('question_id', { ascending: true });

    if (qError) throw qError;

    const uniqueTopicLevels = Array.from(new Set(questions?.map(q => `${q.topic} (${q.level})`).filter(t => !t.startsWith('undefined') && !t.startsWith('null'))));
    const topic = uniqueTopicLevels.length > 0 ? uniqueTopicLevels.join(' | ') : await getDailyTopicFallback(todayFormatted);

    res.json({ 
      performance, 
      team: sms || [], 
      submissions: ownSubmissions || [],
      questions: questions || [],
      topic
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Management data sync failed" });
  }
});

router.get("/admin/insights-data", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Date range required" });

  try {
    const settings = await getSettings();
    const redFlagLimit = Number(settings.red_flag_threshold || 50);
    const bottomLimit = Number(settings.bottom_performer_threshold || 30);

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    const daysInRangeCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    // 1. Fetch all submissions for the range
    const submissions = await fetchLargeTable('submissions', '*', (q: any) => 
      q.gte('date', startDate).lte('date', endDate)
    );
    
    // 2. Fetch all users
    const users = await fetchLargeTable('users', 'user_id, role, manager_id, name');
    
    // 3. Fetch responses for the range (sample for AI)
    const responses = await fetchLargeTable('responses', '*', (q: any) => 
      q.gte('date', startDate).lte('date', endDate)
    );

    // 4. Fetch daily topics for the range
    const ddmmYYDates: string[] = [];
    for (let i = 0; i < daysInRangeCount; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      ddmmYYDates.push(getFormattedDateDDMMYY(d));
    }

    const { data: topicsData } = await supabase
      .from('questions')
      .select('topic, level, day')
      .in('day', ddmmYYDates);
    
    const dailyTopics: Record<string, Set<string>> = {};
    if (topicsData) {
      topicsData.forEach(t => {
        if (t.topic && t.level) {
          const l = t.level.toUpperCase();
          if (!dailyTopics[l]) dailyTopics[l] = new Set();
          dailyTopics[l].add(t.topic);
        }
      });
    }

    const finalTopics: Record<string, string> = {};
    Object.entries(dailyTopics).forEach(([lvl, set]) => {
      finalTopics[lvl] = Array.from(set).join(" | ");
    });

    // 5. Aggregate stats
    const totalUsers = users.length;
    const totalSubmissions = submissions.length;
    const maxPossibleSubmissions = totalUsers * daysInRangeCount;
    const participationRate = maxPossibleSubmissions > 0 ? (totalSubmissions / maxPossibleSubmissions) * 100 : 0;

    // Hierarchy mapping
    const userMap = new Map();
    users.forEach(u => userMap.set(u.user_id, u));

    const findManagerWithRole = (userId: string, targetRoles: string[]) => {
      let current = userMap.get(userId);
      let depth = 0;
      while (current && depth < 10) {
        const role = (current.role || "").toUpperCase();
        if (targetRoles.some(tr => role.includes(tr))) return current;
        current = userMap.get(current.manager_id);
        depth++;
      }
      return null;
    };

    const groupedStats: Record<string, any> = { zh: {}, zsm: {} };

    // Group submission counts by target_user
    const userCompletionCounts: Record<string, number> = {};
    submissions.forEach(s => {
      userCompletionCounts[s.target_user] = (userCompletionCounts[s.target_user] || 0) + 1;
    });

    users.forEach(u => {
      const zh = findManagerWithRole(u.user_id, ['ZH']);
      const zsm = findManagerWithRole(u.user_id, ['ZSM']);
      const role = (u.role || "").toUpperCase();
      const doneCount = userCompletionCounts[u.user_id] || 0;

      if (zh) {
        if (!groupedStats.zh[zh.user_id]) groupedStats.zh[zh.user_id] = { name: zh.name, rm: { total: 0, done: 0 }, sm: { total: 0, done: 0 }, asm: { total: 0, done: 0 } };
        const stats = groupedStats.zh[zh.user_id];
        if (role === 'RM') { stats.rm.total += daysInRangeCount; stats.rm.done += doneCount; }
        if (role === 'SM') { stats.sm.total += daysInRangeCount; stats.sm.done += doneCount; }
        if (role === 'ASM') { stats.asm.total += daysInRangeCount; stats.asm.done += doneCount; }
      }

      if (zsm) {
        if (!groupedStats.zsm[zsm.user_id]) groupedStats.zsm[zsm.user_id] = { name: zsm.name, rm: { total: 0, done: 0 }, sm: { total: 0, done: 0 }, asm: { total: 0, done: 0 } };
        const stats = groupedStats.zsm[zsm.user_id];
        if (role === 'RM') { stats.rm.total += daysInRangeCount; stats.rm.done += doneCount; }
        if (role === 'SM') { stats.sm.total += daysInRangeCount; stats.sm.done += doneCount; }
        if (role === 'ASM') { stats.asm.total += daysInRangeCount; stats.asm.done += doneCount; }
      }
    });

    // 6. Identify Bottom Performers
    const bottomPerformers: Record<string, string[]> = { ZSM: [], SM: [], ASM: [] };
    
    Object.values(groupedStats.zsm).forEach((zsm: any) => {
      const rmRate = zsm.rm.total > 0 ? (zsm.rm.done / zsm.rm.total) * 100 : 100;
      if (rmRate < bottomLimit) bottomPerformers.ZSM.push(zsm.name);
    });

    users.filter(u => ['SM', 'ASM'].includes(u.role?.toUpperCase())).forEach(u => {
      const rate = (userCompletionCounts[u.user_id] || 0) / daysInRangeCount * 100;
      if (rate < bottomLimit) {
        if (u.role.toUpperCase() === 'SM') bottomPerformers.SM.push(u.name);
        if (u.role.toUpperCase() === 'ASM') bottomPerformers.ASM.push(u.name);
      }
    });

    res.json({
      startDate,
      endDate,
      daysInRange: daysInRangeCount,
      topics: finalTopics,
      stats: {
        totalUsers,
        totalSubmissions,
        participationRate,
        groupedStats,
        bottomPerformers: {
          ZSM: bottomPerformers.ZSM.slice(0, 10),
          SM: bottomPerformers.SM.slice(0, 15),
          ASM: bottomPerformers.ASM.slice(0, 15)
        }
      },
      sampleResponses: responses.slice(0, 800)
    });
  } catch (err: any) {
    console.error("Insights range data fetch error:", err);
    res.status(500).json({ error: "Failed to fetch range insights data" });
  }
});

router.post("/admin/generate-insights-v2", async (req, res) => {
  const { startDate, endDate, data } = req.body;
  if (!startDate || !data) return res.status(400).json({ error: "Date range and data required" });

  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY not configured" });

  try {
    const settings = await getSettings();
    let sectionInstructions = "";
    if (settings.enabled_sections) {
      try {
        const enabled = typeof settings.enabled_sections === 'string' 
          ? JSON.parse(settings.enabled_sections) 
          : settings.enabled_sections;
        
        const sectionMap: Record<string, string> = {
          executiveSummary: "Detailed executive summary analysis.",
          sentimentIdx: "Field sentiment index and commentary.",
          bottomPerformers: "Strategic analysis of lagging clusters.",
          fieldThemes: "Trend extraction and thematic analysis.",
          redFlags: "Identification of critical red flags.",
          actionPlan: "Recommended immediate and strategic action plan.",
          topicAlignment: "Analysis of coaching quality and topic intelligence."
        };

        const activeDescs = Object.entries(enabled)
          .filter(([k, v]) => v && sectionMap[k])
          .map(([k, v]) => (sectionMap as any)[k]);
        
        if (activeDescs.length > 0) {
          sectionInstructions = `\nPRIORITIZE THESE SECTIONS IN YOUR ANALYSIS:\n- ${activeDescs.join('\n- ')}`;
        }
      } catch (e) {}
    }

    const dateRangeLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

    const prompt = `Analyze the "Daily Choreography" field responses for period ${dateRangeLabel} and generate a Strategic Leadership Report for the Managing Director.
Completion rate: ${data.stats?.participationRate?.toFixed(1)}%
Total Submissions: ${data.stats?.totalSubmissions} across ${data.daysInRange} days
Number of active field profiles: ${data.stats?.totalUsers}
${sectionInstructions}

DAILY TOPICS IN THE PERIOD:
${JSON.stringify(data.topics || {})}

HIERARCHY COMPLETION (RMs/SMs/ASMs completed per ZH/ZSM):
${JSON.stringify(data.stats?.groupedStats || {})}

BOTTOM PERFORMERS (Users with critical low completion):
${JSON.stringify(data.stats?.bottomPerformers || {})}

Sample responses for context: ${JSON.stringify(data.sampleResponses.slice(0, 80).map((r: any) => ({ q: r.question, a: r.answer })))}

Respond ONLY with this exact JSON structure:
{
  "executive_summary": "3-4 sentence high-level strategic narrative covering field morale, engagement, and operational readiness.",
  "sentiment": {
    "index": 75,
    "commentary": "Brief analysis of emotional tone and engagement level."
  },
  "bottom_performers_analysis": {
    "commentary": "Strategic analysis of why these specific clusters/names are lagging.",
    "top_red_flag_names": ["Name 1 (Role)", "Name 2 (Role)"]
  },
  "themes": [
    {
      "name": "Theme Title",
      "percentage": 30,
      "insight": "Deeper explanation of why this is recurring."
    }
  ],
  "red_flags": [
    {
      "category": "Operational/Manpower/Process",
      "issue": "Specific blocker description",
      "severity": "High/Medium"
    }
  ],
  "action_plan": {
    "immediate": ["Step 1", "Step 2"],
    "short_term": ["Step 1"],
    "strategic": ["Long-term goal"]
  },
  "topic_intelligence": {
    "rm_sm": "Analysis of coaching quality at RM-SM level based on topics",
    "sm_asm": "Analysis of alignment at SM-ASM level",
    "asm_zsh": "Analysis of strategic focus at senior level"
  },
  "response_intelligence": {
    "trends": "Question-wise answer patterns and regional variances",
    "unusual_patterns": "Anything anomalous in the data",
    "field_updates_insight": "Specific insight into how the field is updating their daily choreography (quality, depth, honesty)"
  },
  "operational_health": {
    "coaching_adoption": "Rating/Commentary",
    "discipline": "Commentary",
    "governance": "Commentary"
  }
}`;

    const result = await new Promise<any>((resolve, reject) => {
      const body = JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });

      const options = {
        hostname: "api.groq.com",
        path: "/openai/v1/chat/completions",
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      };

      const reqHttp = https.request(options, (innerRes) => {
        let raw = "";
        innerRes.on("data", chunk => raw += chunk);
        innerRes.on("end", () => {
          if (innerRes.statusCode && innerRes.statusCode >= 400) {
            reject(new Error(`Groq error (${innerRes.statusCode}): ${raw.slice(0, 300)}`));
            return;
          }
          try { resolve(JSON.parse(raw)); }
          catch(e) { reject(new Error(`Parse failed: ${raw.slice(0, 200)}`)); }
        });
      });
      reqHttp.on("error", reject);
      reqHttp.write(body);
      reqHttp.end();
    });

    const text = result.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq returned empty response");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON in response: ${text.slice(0, 100)}`);

    res.json(JSON.parse(match[0]));
  } catch (err: any) {
    console.error("Groq insight error:", err.message);
    res.status(500).json({ 
      error: "Failed to generate insights", 
      details: err.message.slice(0, 300) 
    });
  }
});

// Combined Unified Uptick Report (CSV) with Day-Wise Metrics
router.get("/admin/export-uptick-report", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: "Date range required" });

  try {
    const submissions = await fetchLargeTable('submissions', '*', (q: any) => 
      q.gte('date', startDate).lte('date', endDate)
    );
    const users = await fetchLargeTable('users', 'user_id, name, role, manager_id');
    const userMap = new Map();
    users.forEach(u => userMap.set(u.user_id, u));

    // Generate date sequence
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    const days: string[] = [];
    let curr = new Date(start);
    while (curr <= end) {
      days.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    const daysInRange = days.length;

    const findManagerWithRole = (userId: string, targetRole: string) => {
      let current = userMap.get(userId);
      let depth = 0;
      while (current && depth < 10) {
        if ((current.role || "").toUpperCase().includes(targetRole)) return current;
        current = userMap.get(current.manager_id);
        depth++;
      }
      return null;
    };

    // user_id -> date -> count (1 or 0)
    const userCompletions: Record<string, Set<string>> = {};
    submissions.forEach(s => {
      if (!userCompletions[s.target_user]) userCompletions[s.target_user] = new Set();
      userCompletions[s.target_user].add(s.date);
    });

    const getReportForRole = (roleTag: string) => {
      const data: Record<string, any> = {};
      users.forEach(u => {
        const mgr = findManagerWithRole(u.user_id, roleTag);
        if (!mgr) return;

        if (!data[mgr.user_id]) {
          data[mgr.user_id] = {
            name: mgr.name,
            RM: { total: 0, completions: 0 },
            SM: { total: 0, completions: 0 },
            ASM: { total: 0, completions: 0 },
            daily: {} as Record<string, number>
          };
          days.forEach(d => data[mgr.user_id].daily[d] = 0);
        }

        const role = (u.role || "").toUpperCase();
        const stats = data[mgr.user_id];
        const doneDates = userCompletions[u.user_id] || new Set();

        if (role === 'RM') { stats.RM.total++; stats.RM.completions += doneDates.size; }
        if (role === 'SM') { stats.SM.total++; stats.SM.completions += doneDates.size; }
        if (role === 'ASM') { stats.ASM.total++; stats.ASM.completions += doneDates.size; }

        doneDates.forEach(d => {
          if (stats.daily[d] !== undefined) stats.daily[d]++;
        });
      });
      return Object.values(data);
    };

    const zhData = getReportForRole('ZH');
    const zsmData = getReportForRole('ZSM');

    let csv = `UNIFIED CHOREOGRAPHY UPTICK REPORT\n`;
    csv += `Period: ${startDate} to ${endDate}\n\n`;

    const buildSection = (title: string, roleItems: any[]) => {
      let s = `${title} LEVEL METRICS\n`;
      s += `Name,RM Adoption %,SM Adoption %,ASM Adoption %,${days.join(",")}\n`;
      roleItems.forEach(r => {
        const rmPct = r.RM.total > 0 ? (r.RM.completions / (r.RM.total * daysInRange)) * 100 : 0;
        const smPct = r.SM.total > 0 ? (r.SM.completions / (r.SM.total * daysInRange)) * 100 : 0;
        const asmPct = r.ASM.total > 0 ? (r.ASM.completions / (r.ASM.total * daysInRange)) * 100 : 0;
        const dailyCounts = days.map(d => r.daily[d]).join(",");
        s += `"${r.name}",${rmPct.toFixed(1)}%,${smPct.toFixed(1)}%,${asmPct.toFixed(1)}%,${dailyCounts}\n`;
      });
      return s + "\n";
    };

    csv += buildSection("ZH", zhData);
    csv += buildSection("ZSM", zsmData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Unified_Uptick_Report_${startDate}_to_${endDate}.csv`);
    res.send(csv);
  } catch (err: any) {
    console.error("Uptick export failed:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
